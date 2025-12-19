import { createSupabaseClient, getUserIdFromRequest } from '../_shared/supabase-client.ts';
import { generateTodaySubtitle } from '../_shared/gemini-client.ts';
import { corsHeaders, type ItemSummary, type EntityType } from '../_shared/types.ts';
import { cosineSimilarity, parseEmbedding } from '../_shared/vector-utils.ts';

// Thresholds for friend-taste-boosted discovery
const FRIEND_SIMILARITY_THRESHOLD = 0.6;  // Only consider high-similarity friends
const CONTENT_MATCH_THRESHOLD = 0.4;       // Content must match user's taste
const MAX_FRIEND_DISCOVERIES = 3;          // Don't overwhelm with friend content

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get authenticated user
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createSupabaseClient();

    // Fetch user's taste profile (persistent, computed by compute-taste-profile)
    const { data: tasteProfile } = await supabase
      .from('user_taste_profiles')
      .select('taste_embedding, top_categories, entity_type_preferences')
      .eq('user_id', userId)
      .single();

    // Parse taste embedding
    let userTasteEmbedding: number[] | null = null;
    if (tasteProfile?.taste_embedding) {
      userTasteEmbedding = parseEmbedding(tasteProfile.taste_embedding);
    }

    console.log('🧠 User taste profile:', userTasteEmbedding ? 'found' : 'none');

    // Fetch user's recent stash items with entities
    const { data: items, error: itemsError } = await supabase
      .from('stash_items')
      .select(`
        id,
        source,
        status,
        created_at,
        opened_at,
        liked,
        entities (
          id,
          type,
          title,
          summary,
          primary_emoji,
          source_name,
          image_url,
          canonical_url,
          tags,
          embedding,
          suggested_prompts,
          raw_metadata
        )
      `)
      .eq('user_id', userId)
      .not('entity_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100);

    if (itemsError) {
      throw itemsError;
    }

    // Convert to ItemSummary format with embedding for scoring
    const itemSummaries: (ItemSummary & { opened_at: string | null; embedding?: number[] | null })[] = (items || [])
      .filter(item => item.entities)
      .map(item => ({
        item_id: item.id,
        entity_id: item.entities.id,
        title: item.entities.title || 'Untitled',
        type: item.entities.type as EntityType,
        primary_emoji: item.entities.primary_emoji || '🔗',
        source_label: item.source === 'self' ? 'FROM YOU' :
          (item.source === 'friend_link' || item.source === 'friend_user') ? 'FROM FRIEND' : 'FOR YOU',
        summary: item.entities.summary || 'No summary',
        created_at: item.created_at,
        canonical_url: item.entities.canonical_url,
        metadata: {
          source_name: item.entities.source_name,
          icon_url: item.entities.image_url,
          tags: item.entities.tags || [],
          suggested_prompts: item.entities.suggested_prompts || [],
          type_metadata: item.entities.raw_metadata || {},
        },
        opened_at: item.opened_at,
        embedding: parseEmbedding(item.entities.embedding),
      }));

    // Build user's entity ID set (to avoid duplicates in friend discoveries)
    const userEntityIds = new Set(itemSummaries.map(i => i.entity_id));

    // Compute sections
    const fromFriends = itemSummaries
      .filter(item => item.source_label === 'FROM FRIEND')
      .slice(0, 5);

    const byYou = itemSummaries
      .filter(item => item.source_label === 'FROM YOU')
      .slice(0, 5);

    // Brain Snack: Only show unopened items from you (not opened yet)
    const unopened = itemSummaries.filter(item =>
      item.source_label === 'FROM YOU' && !item.opened_at
    );

    // Brain Snack: 1-3 unopened items
    const brainSnack = unopened.slice(0, 3);

    // === For You: Use persistent taste profile + friend-taste-boosted discovery ===
    const recentItemIds = new Set(itemSummaries.slice(0, 5).map(i => i.item_id));
    const olderItems = itemSummaries.filter(i => !recentItemIds.has(i.item_id));

    let forYou: ItemSummary[] = [];

    if (userTasteEmbedding && userTasteEmbedding.length > 0) {
      // Score older items by similarity to PERSISTENT taste profile
      const scoredItems = olderItems
        .filter(item => item.embedding && item.embedding.length > 0)
        .map(item => {
          const score = cosineSimilarity(userTasteEmbedding!, item.embedding!);
          return { item, score };
        })
        .filter(s => s.score > 0.3)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      console.log('🔵 For You (taste profile):', scoredItems.map(s => ({
        title: s.item.title.substring(0, 25),
        score: s.score.toFixed(3)
      })));

      forYou = scoredItems.map(({ item }) => ({
        item_id: item.item_id,
        entity_id: item.entity_id,
        title: item.title,
        type: item.type,
        primary_emoji: item.primary_emoji,
        source_label: 'FOR YOU',
        summary: item.summary,
        created_at: item.created_at,
        canonical_url: item.canonical_url,
        metadata: item.metadata,
      }));
    }

    // === Friend-Taste-Boosted Discovery ===
    // Find content that high-similarity friends liked, that also matches user's taste
    let friendDiscoveries: ItemSummary[] = [];

    if (userTasteEmbedding) {
      // Get high-similarity friends
      const { data: similarFriends } = await supabase
        .from('friend_similarity')
        .select('friend_id, taste_similarity')
        .eq('user_id', userId)
        .gte('taste_similarity', FRIEND_SIMILARITY_THRESHOLD)
        .order('taste_similarity', { ascending: false })
        .limit(10);

      if (similarFriends && similarFriends.length > 0) {
        const friendIds = similarFriends.map(f => f.friend_id);
        const friendSimilarityMap = new Map(
          similarFriends.map(f => [f.friend_id, f.taste_similarity])
        );

        console.log('👥 High-similarity friends:', similarFriends.length);

        // Get liked items from these friends that user doesn't have
        const { data: friendLikedItems } = await supabase
          .from('stash_items')
          .select(`
            id,
            user_id,
            entities (
              id,
              type,
              title,
              summary,
              primary_emoji,
              source_name,
              image_url,
              canonical_url,
              tags,
              embedding,
              raw_metadata
            )
          `)
          .in('user_id', friendIds)
          .eq('liked', true)
          .not('entity_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(50);

        if (friendLikedItems && friendLikedItems.length > 0) {
          // Score by: friend similarity × content match to user's taste
          const scoredDiscoveries = friendLikedItems
            .filter(item => {
              // Must not already be in user's stash
              if (userEntityIds.has(item.entities.id)) return false;
              // Must have embedding
              const emb = parseEmbedding(item.entities.embedding);
              return emb && emb.length > 0;
            })
            .map(item => {
              const emb = parseEmbedding(item.entities.embedding)!;
              const contentMatch = cosineSimilarity(userTasteEmbedding!, emb);
              const friendSim = friendSimilarityMap.get(item.user_id) || 0;
              // Combined score: both must be good
              const score = contentMatch * friendSim;
              return { item, contentMatch, friendSim, score };
            })
            .filter(s => s.contentMatch >= CONTENT_MATCH_THRESHOLD)
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_FRIEND_DISCOVERIES);

          console.log('🎯 Friend discoveries:', scoredDiscoveries.map(s => ({
            title: s.item.entities.title?.substring(0, 25),
            contentMatch: s.contentMatch.toFixed(2),
            friendSim: s.friendSim.toFixed(2),
          })));

          friendDiscoveries = scoredDiscoveries.map(({ item }) => ({
            item_id: item.id,
            entity_id: item.entities.id,
            title: item.entities.title || 'Untitled',
            type: item.entities.type as EntityType,
            primary_emoji: item.entities.primary_emoji || '🔗',
            source_label: 'FRIEND PICK',  // Special label for friend-boosted
            summary: item.entities.summary || 'No summary',
            created_at: new Date().toISOString(),  // Show as fresh discovery
            canonical_url: item.entities.canonical_url,
            metadata: {
              source_name: item.entities.source_name,
              icon_url: item.entities.image_url,
              tags: item.entities.tags || [],
              type_metadata: item.entities.raw_metadata || {},
            },
          }));
        }
      }
    }

    // Merge friend discoveries into For You (interleaved: 2 from taste, 1 from friends)
    const mergedForYou: ItemSummary[] = [];
    let forYouIdx = 0;
    let friendIdx = 0;

    while (forYouIdx < forYou.length || friendIdx < friendDiscoveries.length) {
      // Add up to 2 from taste profile
      if (forYouIdx < forYou.length) {
        mergedForYou.push(forYou[forYouIdx++]);
      }
      if (forYouIdx < forYou.length) {
        mergedForYou.push(forYou[forYouIdx++]);
      }
      // Add 1 from friend discoveries
      if (friendIdx < friendDiscoveries.length) {
        mergedForYou.push(friendDiscoveries[friendIdx++]);
      }
    }

    // Fallback if no embeddings/taste profile available
    if (mergedForYou.length === 0) {
      const fallback = itemSummaries
        .filter(item => !recentItemIds.has(item.item_id))
        .slice(0, 5)
        .map(item => ({
          item_id: item.item_id,
          entity_id: item.entity_id,
          title: item.title,
          type: item.type,
          primary_emoji: item.primary_emoji,
          source_label: 'FOR YOU',
          summary: item.summary,
          created_at: item.created_at,
          canonical_url: item.canonical_url,
          metadata: item.metadata,
        }));
      mergedForYou.push(...fallback);
    }

    // Collect tags and types for AI subtitle
    const allTags = new Set<string>();
    const allTypes = new Set<EntityType>();

    itemSummaries.slice(0, 10).forEach(item => {
      item.metadata.tags.forEach(tag => allTags.add(tag));
      allTypes.add(item.type);
    });

    // Include user's top categories from taste profile in subtitle generation
    const topCats = tasteProfile?.top_categories || {};
    Object.keys(topCats).slice(0, 3).forEach(cat => allTags.add(cat));

    // Generate AI subtitle only if we have items
    let aiSubtitle = "Start saving interesting things you find online";
    if (itemSummaries.length > 0) {
      try {
        aiSubtitle = await generateTodaySubtitle(
          Array.from(allTags).slice(0, 5),
          Array.from(allTypes)
        );
      } catch (error) {
        console.error('Error generating AI subtitle:', error);
      }
    }

    // Fetch AI discoveries from daily-discovery function
    const aiDiscoveries: Array<{
      title: string;
      description: string;
      source_url: string;
      category: string;
      relevance_score: number;
    }> = [];

    try {
      const { data: recommendations } = await supabase
        .from('ai_recommendations')
        .select('title, description, source_url, category, relevance_score')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('relevance_score', { ascending: false })
        .limit(3);

      if (recommendations && recommendations.length > 0) {
        aiDiscoveries.push(...recommendations);
        console.log(`🤖 Including ${aiDiscoveries.length} AI discoveries in feed`);
      }
    } catch (error) {
      console.error('⚠️ Error fetching AI discoveries:', error);
      // Don't fail feed generation if discoveries fail
    }

    return new Response(
      JSON.stringify({
        ai_subtitle: aiSubtitle,
        ai_discoveries: aiDiscoveries,
        brain_snack: brainSnack,
        from_friends: fromFriends,
        by_you: byYou,
        for_you: mergedForYou.slice(0, 8),  // Limit total
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in feed-today:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
