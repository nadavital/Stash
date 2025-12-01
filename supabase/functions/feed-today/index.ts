import { createSupabaseClient, getUserIdFromRequest } from '../_shared/supabase-client.ts';
import { generateTodaySubtitle } from '../_shared/gemini-client.ts';
import { corsHeaders, type ItemSummary, type EntityType } from '../_shared/types.ts';

// Cosine similarity helper
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

// Average multiple embeddings into one
function averageEmbeddings(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return [];
  const dim = embeddings[0].length;
  const result = new Array(dim).fill(0);
  
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      result[i] += emb[i];
    }
  }
  
  for (let i = 0; i < dim; i++) {
    result[i] /= embeddings.length;
  }
  
  return result;
}

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

    // Fetch user's recent stash items with entities (including embeddings for For You)
    const { data: items, error: itemsError } = await supabase
      .from('stash_items')
      .select(`
        id,
        source,
        status,
        created_at,
        opened_at,
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
          suggested_prompts
        )
      `)
      .eq('user_id', userId)
      .not('entity_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100);  // Fetch more for better "For You" recommendations

    if (itemsError) {
      throw itemsError;
    }

    // Convert to ItemSummary format with opened_at tracking
    const itemSummaries: ItemSummary[] = (items || [])
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
        },
        opened_at: item.opened_at,
      }));

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

    // For You: Resurface older items similar to recent saves using embeddings
    // Get recent items' embeddings (last 5 saves)
    const recentItemIds = new Set(itemSummaries.slice(0, 5).map(i => i.item_id));
    const olderItems = items?.filter(i => !recentItemIds.has(i.id)) || [];
    
    // Get embeddings from recent items
    const recentEmbeddings: number[][] = [];
    for (const item of (items || []).slice(0, 5)) {
      if (item.entities?.embedding) {
        let emb = item.entities.embedding;
        if (typeof emb === 'string') {
          try { emb = JSON.parse(emb); } catch { continue; }
        }
        if (Array.isArray(emb) && emb.length > 0) {
          recentEmbeddings.push(emb as number[]);
        }
      }
    }

    let forYou: ItemSummary[] = [];
    
    if (recentEmbeddings.length > 0 && olderItems.length > 0) {
      // Compute average embedding of recent items as "taste profile"
      const tasteProfile = averageEmbeddings(recentEmbeddings);
      
      // Score older items by similarity to taste profile
      const scoredItems = olderItems
        .filter(item => item.entities?.embedding)
        .map(item => {
          let emb = item.entities.embedding;
          if (typeof emb === 'string') {
            try { emb = JSON.parse(emb); } catch { return { item, score: 0 }; }
          }
          const score = cosineSimilarity(tasteProfile, emb as number[]);
          return { item, score };
        })
        .filter(s => s.score > 0.3)  // Only include if reasonably similar
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      
      console.log('🔵 For You scores:', scoredItems.map(s => ({
        title: s.item.entities?.title?.substring(0, 25),
        score: s.score.toFixed(3)
      })));
      
      // Convert to ItemSummary
      forYou = scoredItems.map(({ item }) => ({
        item_id: item.id,
        entity_id: item.entities.id,
        title: item.entities.title || 'Untitled',
        type: item.entities.type as EntityType,
        primary_emoji: item.entities.primary_emoji || '🔗',
        source_label: 'FOR YOU' as const,
        summary: item.entities.summary || 'No summary',
        created_at: item.created_at,
        canonical_url: item.entities.canonical_url,
        metadata: {
          source_name: item.entities.source_name,
          icon_url: item.entities.image_url,
          tags: item.entities.tags || [],
          suggested_prompts: item.entities.suggested_prompts || [],
        },
        opened_at: item.opened_at,
      }));
    }
    
    // Fallback if no embeddings available
    if (forYou.length === 0) {
      forYou = itemSummaries
        .filter(item => !recentItemIds.has(item.item_id))
        .slice(0, 5);
    }

    // Collect tags and types for AI subtitle
    const allTags = new Set<string>();
    const allTypes = new Set<EntityType>();

    itemSummaries.slice(0, 10).forEach(item => {
      item.metadata.tags.forEach(tag => allTags.add(tag));
      allTypes.add(item.type);
    });

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
        // Fall back to default subtitle
      }
    }

    return new Response(
      JSON.stringify({
        ai_subtitle: aiSubtitle,
        brain_snack: brainSnack,
        from_friends: fromFriends,
        by_you: byYou,
        for_you: forYou,
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
