import { createSupabaseClient, getUserIdFromRequest } from '../_shared/supabase-client.ts';
import { generateEmbedding } from '../_shared/gemini-client.ts';
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

    const { query, limit = 20 } = await req.json();

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Search query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const searchQuery = query.trim().toLowerCase();
    const supabase = createSupabaseClient();

    // Generate embedding for semantic search
    const queryEmbedding = await generateEmbedding(query);
    console.log('🔍 Search query:', searchQuery, '| Embedding length:', queryEmbedding.length);

    // Get all user's items with embeddings
    const { data: items, error: itemsError } = await supabase
      .from('stash_items')
      .select(`
        id,
        source,
        created_at,
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
      .limit(100);

    if (itemsError) {
      throw itemsError;
    }

    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ results: [], total: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Score each item using hybrid text + vector search
    const scoredItems = items
      .filter(item => item.entities)
      .map(item => {
        const entity = item.entities;
        let score = 0;

        // Text matching scores
        const titleLower = (entity.title || '').toLowerCase();
        const summaryLower = (entity.summary || '').toLowerCase();
        const tagsLower = (entity.tags || []).map((t: string) => t.toLowerCase());
        const sourceNameLower = (entity.source_name || '').toLowerCase();

        // Exact title match (highest priority)
        if (titleLower.includes(searchQuery)) {
          score += 10;
          // Bonus for exact match at start
          if (titleLower.startsWith(searchQuery)) {
            score += 5;
          }
        }

        // Summary match
        if (summaryLower.includes(searchQuery)) {
          score += 3;
        }

        // Tag match
        const matchingTags = tagsLower.filter((tag: string) => 
          tag.includes(searchQuery) || searchQuery.includes(tag)
        );
        score += matchingTags.length * 4;

        // Source name match
        if (sourceNameLower.includes(searchQuery)) {
          score += 2;
        }

        // Word-by-word matching for multi-word queries
        const queryWords = searchQuery.split(' ').filter(w => w.length > 2);
        for (const word of queryWords) {
          if (titleLower.includes(word)) score += 1;
          if (tagsLower.some((tag: string) => tag.includes(word))) score += 0.5;
        }

        // Vector similarity score (add if we have embeddings)
        let vectorScore = 0;
        if (queryEmbedding.length > 0 && entity.embedding) {
          let itemEmbedding = entity.embedding;
          if (typeof itemEmbedding === 'string') {
            try {
              itemEmbedding = JSON.parse(itemEmbedding);
            } catch {
              // Skip if can't parse
            }
          }
          
          if (Array.isArray(itemEmbedding)) {
            vectorScore = cosineSimilarity(queryEmbedding, itemEmbedding as number[]);
            // Weight vector similarity (0-1 range scaled to be meaningful)
            score += vectorScore * 5;
          }
        }

        return { item, score, vectorScore };
      })
      .filter(s => s.score > 0) // Only return items with some relevance
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    console.log('🔍 Found', scoredItems.length, 'results');

    // Convert to ItemSummary format
    const results: ItemSummary[] = scoredItems.map(({ item }) => ({
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
    }));

    return new Response(
      JSON.stringify({ 
        results, 
        total: results.length,
        query: query 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in search-items:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
