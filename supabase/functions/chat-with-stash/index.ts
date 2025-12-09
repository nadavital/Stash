import { createSupabaseClient, getUserIdFromRequest } from '../_shared/supabase-client.ts';
import { chatWithStash, generateEmbedding } from '../_shared/gemini-client.ts';
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

    const { message, focusedItemId, conversationHistory } = await req.json();

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔵 Chat request - message:', message, 'focusedItemId:', focusedItemId || 'none', 'history length:', conversationHistory?.length || 0);

    const supabase = createSupabaseClient();

    // Fetch user's taste profile for personalized context
    const { data: tasteProfile } = await supabase
      .from('user_taste_profiles')
      .select('top_categories, entity_type_preferences')
      .eq('user_id', userId)
      .single();

    // Build taste context for AI
    let tasteContext: { top_interests: string[]; preferred_types: string[] } | null = null;
    if (tasteProfile) {
      const topCats = tasteProfile.top_categories || {};
      const typePrefs = tasteProfile.entity_type_preferences || {};
      
      tasteContext = {
        top_interests: Object.keys(topCats).slice(0, 5),
        preferred_types: Object.entries(typePrefs)
          .sort((a, b) => (b[1] as number) - (a[1] as number))
          .slice(0, 3)
          .map(([type]) => type),
      };
      
      console.log('🧠 User taste context:', tasteContext);
    }

    // If there's a focused item, fetch it first
    let focusedItem = null;
    
    if (focusedItemId) {
      const { data: focusedItemData } = await supabase
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
            tags
          )
        `)
        .eq('id', focusedItemId)
        .eq('user_id', userId)
        .single();
      
      if (focusedItemData?.entities) {
        focusedItem = focusedItemData;
        console.log('🔵 Focused item found:', focusedItem.entities.title);
      }
    }

    // Generate embedding for user's query
    const queryEmbedding = await generateEmbedding(message);
    console.log('🔵 Generated query embedding, length:', queryEmbedding.length);

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
      .limit(50);

    if (itemsError) {
      throw itemsError;
    }

    // Perform vector similarity search if we have embeddings
    let rankedItems = items || [];
    
    if (queryEmbedding.length > 0) {
      // Score each item by similarity to query
      const scoredItems = (items || [])
        .filter(item => item.entities?.embedding)
        .map(item => {
          // Parse embedding if stored as string
          let itemEmbedding = item.entities.embedding;
          if (typeof itemEmbedding === 'string') {
            try {
              itemEmbedding = JSON.parse(itemEmbedding);
            } catch {
              return { item, score: 0 };
            }
          }
          
          const score = cosineSimilarity(queryEmbedding, itemEmbedding as number[]);
          return { item, score };
        })
        .sort((a, b) => b.score - a.score);
      
      console.log('🔵 Top 3 similarity scores:', scoredItems.slice(0, 3).map(s => ({
        title: s.item.entities?.title?.substring(0, 30),
        score: s.score.toFixed(4)
      })));
      
      // Use top 10 most relevant items
      rankedItems = scoredItems.slice(0, 10).map(s => s.item);
    }

    // Prepare entities for chat context (now ranked by relevance)
    const relevantEntities = rankedItems
      .filter(item => item.entities)
      .map(item => ({
        id: item.entities.id,
        title: item.entities.title || 'Untitled',
        summary: item.entities.summary || '',
        tags: item.entities.tags || [],
      }));

    // Prepare focused item context if available
    const focusedContext = focusedItem?.entities ? {
      id: focusedItem.entities.id,
      title: focusedItem.entities.title || 'Untitled',
      summary: focusedItem.entities.summary || '',
      tags: focusedItem.entities.tags || [],
      url: focusedItem.entities.canonical_url,
    } : null;

    // Get AI response with relevant context, conversation history, and taste profile
    const answer = await chatWithStash(message, relevantEntities, focusedContext, conversationHistory, tasteContext);

    // Find items mentioned in the AI response by matching quoted titles
    const mentionedItems: typeof rankedItems = [];
    
    // First try to find explicitly quoted titles (our new prompt format)
    const quotedTitleRegex = /"([^"]+)"/g;
    const quotedMatches = [...answer.matchAll(quotedTitleRegex)];
    const quotedTitles = quotedMatches.map(m => m[1].toLowerCase());
    
    console.log('🔵 Found quoted titles in response:', quotedTitles);
    
    for (const item of rankedItems) {
      if (!item.entities?.title) continue;
      
      const titleLower = item.entities.title.toLowerCase();
      
      // Check for exact quoted title match first (highest priority)
      const exactMatch = quotedTitles.some(quoted => 
        titleLower === quoted || 
        titleLower.includes(quoted) || 
        quoted.includes(titleLower)
      );
      
      if (exactMatch) {
        console.log('✅ Exact quoted match:', item.entities.title);
        mentionedItems.push(item);
        continue;
      }
      
      // Fallback: Check if significant title words appear in answer
      const answerLower = answer.toLowerCase();
      const titleWords = titleLower.split(' ').filter(w => w.length > 3);
      const matchCount = titleWords.filter(word => answerLower.includes(word)).length;
      
      if (matchCount >= 2 || (titleWords.length <= 2 && matchCount >= 1)) {
        console.log('📝 Word match:', item.entities.title, 'matches:', matchCount);
        mentionedItems.push(item);
      }
    }
    
    // Use mentioned items if found, otherwise use top relevant items
    const itemsToReturn = mentionedItems.length > 0 
      ? mentionedItems.slice(0, 5)
      : rankedItems.slice(0, 3);

    const referencedItems: ItemSummary[] = itemsToReturn
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
      }));

    console.log('🟢 Returning', referencedItems.length, 'referenced items');

    return new Response(
      JSON.stringify({
        answer,
        referenced_items: referencedItems,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in chat-with-stash:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
