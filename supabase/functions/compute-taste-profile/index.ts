import { createSupabaseClient, getUserIdFromRequest } from '../_shared/supabase-client.ts';
import { corsHeaders } from '../_shared/types.ts';

// Signal weights for taste computation
const SIGNAL_WEIGHTS: Record<string, number> = {
  'like': 3.0,
  'dislike': -2.0,
  'done': 2.0,
  'share': 2.0,
  'chat_question': 1.5,
  'open': 1.0,
  'save': 1.0,
  // Undo actions reverse the original
  'unlike': -3.0,
  'undislike': 2.0,
  'undone': -2.0,
};

// Time decay half-life in days
const DECAY_HALF_LIFE_DAYS = 30;

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

// Normalize a vector to unit length
function normalizeVector(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
  if (norm === 0) return v;
  return v.map(x => x / norm);
}

// Compute time decay factor
function computeDecay(daysAgo: number): number {
  return Math.exp(-daysAgo * Math.LN2 / DECAY_HALF_LIFE_DAYS);
}

interface Interaction {
  entity_id: string;
  event_type: string;
  created_at: string;
}

interface Entity {
  entity_id: string;
  type: string;
  tags: string[];
  embedding: number[] | string;
  source_name: string | null;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get user ID - either from request auth or from body (for cron jobs)
    let userId = await getUserIdFromRequest(req);
    
    // For cron/admin calls, allow passing user_id in body
    if (!userId && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      userId = body.user_id;
    }
    
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'User ID required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🧠 Computing taste profile for user:', userId);

    const supabase = createSupabaseClient();

    // Fetch all user interactions with entity data
    const { data: interactions, error: interactionsError } = await supabase
      .from('user_interactions')
      .select('entity_id, event_type, created_at')
      .eq('user_id', userId)
      .not('entity_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500);  // Last 500 interactions

    if (interactionsError) {
      throw interactionsError;
    }

    console.log('📊 Found', interactions?.length || 0, 'interactions');

    // If no interactions, create empty profile
    if (!interactions || interactions.length === 0) {
      // Check if user has any stash items (legacy data before interaction tracking)
      const { data: stashItems } = await supabase
        .from('stash_items')
        .select('entity_id, liked, status, created_at')
        .eq('user_id', userId)
        .not('entity_id', 'is', null)
        .limit(100);

      if (!stashItems || stashItems.length === 0) {
        // Truly empty - create minimal profile
        await supabase
          .from('user_taste_profiles')
          .upsert({
            user_id: userId,
            taste_embedding: null,
            top_categories: {},
            entity_type_preferences: {},
            preferred_sources: [],
            total_interactions: 0,
            last_computed_at: new Date().toISOString(),
          });

        return new Response(
          JSON.stringify({ success: true, status: 'empty_profile' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Convert legacy stash items to pseudo-interactions
      const legacyInteractions: Interaction[] = stashItems.map(item => ({
        entity_id: item.entity_id,
        event_type: item.liked ? 'like' : (item.status === 'done' ? 'done' : 'save'),
        created_at: item.created_at,
      }));

      interactions.push(...legacyInteractions);
      console.log('📊 Added', legacyInteractions.length, 'legacy items as interactions');
    }

    // Get unique entity IDs
    const entityIds = [...new Set(interactions.map(i => i.entity_id).filter(Boolean))];

    // Fetch entity data (embeddings, tags, types)
    const { data: entities, error: entitiesError } = await supabase
      .from('entities')
      .select('entity_id, type, tags, embedding, source_name')
      .in('entity_id', entityIds);

    if (entitiesError) {
      throw entitiesError;
    }

    // Create entity lookup map
    const entityMap = new Map<string, Entity>();
    for (const entity of (entities || [])) {
      entityMap.set(entity.entity_id, entity);
    }

    console.log('🔍 Loaded', entityMap.size, 'entities with data');

    // Compute weighted taste embedding
    const now = new Date();
    const embeddingDim = 768;
    const tasteVector = new Array(embeddingDim).fill(0);
    let totalWeight = 0;

    // Track category counts and type preferences
    const categoryCounts: Record<string, number> = {};
    const typeCounts: Record<string, number> = {};
    const sourceCounts: Record<string, number> = {};

    for (const interaction of interactions) {
      const entity = entityMap.get(interaction.entity_id);
      if (!entity) continue;

      // Get embedding
      let embedding: number[] | null = null;
      if (entity.embedding) {
        if (typeof entity.embedding === 'string') {
          try {
            embedding = JSON.parse(entity.embedding);
          } catch {
            continue;
          }
        } else {
          embedding = entity.embedding as number[];
        }
      }

      if (!embedding || embedding.length !== embeddingDim) continue;

      // Compute weight
      const baseWeight = SIGNAL_WEIGHTS[interaction.event_type] || 0;
      if (baseWeight === 0) continue;

      const daysAgo = (now.getTime() - new Date(interaction.created_at).getTime()) / (1000 * 60 * 60 * 24);
      const decay = computeDecay(daysAgo);
      const weight = baseWeight * decay;

      // Add weighted embedding to taste vector
      for (let i = 0; i < embeddingDim; i++) {
        tasteVector[i] += embedding[i] * weight;
      }
      totalWeight += Math.abs(weight);

      // Track categories (from tags)
      const positiveSignal = baseWeight > 0;
      if (positiveSignal && entity.tags) {
        for (const tag of entity.tags) {
          categoryCounts[tag] = (categoryCounts[tag] || 0) + Math.abs(weight);
        }
      }

      // Track entity types
      if (positiveSignal && entity.type) {
        typeCounts[entity.type] = (typeCounts[entity.type] || 0) + Math.abs(weight);
      }

      // Track sources
      if (positiveSignal && entity.source_name) {
        sourceCounts[entity.source_name] = (sourceCounts[entity.source_name] || 0) + Math.abs(weight);
      }
    }

    // Normalize taste embedding
    const normalizedTaste = totalWeight > 0 ? normalizeVector(tasteVector) : null;

    // Compute top categories (normalize to percentages)
    const totalCategoryWeight = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
    const topCategories: Record<string, number> = {};
    if (totalCategoryWeight > 0) {
      const sortedCategories = Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);  // Top 10 categories
      
      for (const [category, count] of sortedCategories) {
        topCategories[category] = Math.round((count / totalCategoryWeight) * 100) / 100;
      }
    }

    // Compute entity type preferences (normalize to percentages)
    const totalTypeWeight = Object.values(typeCounts).reduce((a, b) => a + b, 0);
    const entityTypePreferences: Record<string, number> = {};
    if (totalTypeWeight > 0) {
      for (const [type, count] of Object.entries(typeCounts)) {
        entityTypePreferences[type] = Math.round((count / totalTypeWeight) * 100) / 100;
      }
    }

    // Get top sources
    const preferredSources = Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([source]) => source);

    // Find last interaction time
    const lastInteractionAt = interactions.length > 0 
      ? interactions[0].created_at 
      : null;

    // Upsert taste profile
    const { error: upsertError } = await supabase
      .from('user_taste_profiles')
      .upsert({
        user_id: userId,
        taste_embedding: normalizedTaste,
        top_categories: topCategories,
        entity_type_preferences: entityTypePreferences,
        preferred_sources: preferredSources,
        total_interactions: interactions.length,
        last_interaction_at: lastInteractionAt,
        last_computed_at: new Date().toISOString(),
        computation_version: 1,
      });

    if (upsertError) {
      throw upsertError;
    }

    console.log('✅ Taste profile computed successfully');
    console.log('   Top categories:', Object.keys(topCategories).slice(0, 3).join(', '));
    console.log('   Type preferences:', JSON.stringify(entityTypePreferences));

    // Now update friend similarities
    await updateFriendSimilarities(supabase, userId, normalizedTaste, topCategories);

    return new Response(
      JSON.stringify({
        success: true,
        profile: {
          top_categories: topCategories,
          entity_type_preferences: entityTypePreferences,
          preferred_sources: preferredSources,
          total_interactions: interactions.length,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error computing taste profile:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Update friend similarity scores for this user
async function updateFriendSimilarities(
  supabase: ReturnType<typeof createSupabaseClient>,
  userId: string,
  tasteEmbedding: number[] | null,
  topCategories: Record<string, number>
) {
  if (!tasteEmbedding) return;

  // Get user's friends
  const { data: friendships } = await supabase
    .from('friendships')
    .select('user_id, friend_id')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
    .eq('status', 'accepted');

  if (!friendships || friendships.length === 0) return;

  // Get friend user IDs
  const friendIds = friendships.map(f => 
    f.user_id === userId ? f.friend_id : f.user_id
  );

  // Get friends' taste profiles
  const { data: friendProfiles } = await supabase
    .from('user_taste_profiles')
    .select('user_id, taste_embedding, top_categories')
    .in('user_id', friendIds);

  if (!friendProfiles || friendProfiles.length === 0) return;

  // Compute similarities
  const similarities: Array<{
    user_id: string;
    friend_id: string;
    taste_similarity: number;
    common_interests: string[];
    computed_at: string;
  }> = [];

  const userCategories = new Set(Object.keys(topCategories));

  for (const friendProfile of friendProfiles) {
    if (!friendProfile.taste_embedding) continue;

    let friendEmbedding: number[];
    if (typeof friendProfile.taste_embedding === 'string') {
      try {
        friendEmbedding = JSON.parse(friendProfile.taste_embedding);
      } catch {
        continue;
      }
    } else {
      friendEmbedding = friendProfile.taste_embedding as number[];
    }

    const similarity = cosineSimilarity(tasteEmbedding, friendEmbedding);

    // Find common interests
    const friendCategories = new Set(Object.keys(friendProfile.top_categories || {}));
    const commonInterests = [...userCategories].filter(c => friendCategories.has(c));

    const now = new Date().toISOString();

    // Add both directions
    similarities.push({
      user_id: userId,
      friend_id: friendProfile.user_id,
      taste_similarity: Math.round(similarity * 1000) / 1000,
      common_interests: commonInterests.slice(0, 5),
      computed_at: now,
    });

    similarities.push({
      user_id: friendProfile.user_id,
      friend_id: userId,
      taste_similarity: Math.round(similarity * 1000) / 1000,
      common_interests: commonInterests.slice(0, 5),
      computed_at: now,
    });
  }

  if (similarities.length > 0) {
    await supabase
      .from('friend_similarity')
      .upsert(similarities);

    console.log('👥 Updated', similarities.length / 2, 'friend similarities');
  }
}
