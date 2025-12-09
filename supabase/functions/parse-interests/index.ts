import { createSupabaseClient, getUserIdFromRequest } from '../_shared/supabase-client.ts';
import { corsHeaders } from '../_shared/types.ts';
import { generateEmbedding } from '../_shared/gemini-client.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_FLASH_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Validate environment variables at startup
if (!GEMINI_API_KEY) {
  console.warn('⚠️ GEMINI_API_KEY not set - AI parsing will use fallback');
}

// Parse natural language interests into structured categories
async function parseInterestsWithAI(freeformText: string): Promise<{
  categories: Record<string, number>;
  entity_types: Record<string, number>;
  keywords: string[];
}> {
  // If no API key, use fallback immediately
  if (!GEMINI_API_KEY) {
    console.log('📝 No Gemini API key, using fallback parsing');
    const words = freeformText.toLowerCase().split(/[,\s]+/).filter(w => w.length > 2);
    return {
      categories: Object.fromEntries(words.slice(0, 8).map(w => [w.trim(), 0.5])),
      entity_types: { article: 0.25, song: 0.25, recipe: 0.25, event: 0.25 },
      keywords: words.slice(0, 15),
    };
  }

  const prompt = `Parse the following user interests into structured categories. Return ONLY a JSON object.

User input: "${freeformText}"

Return JSON in this exact format:
{
  "categories": {
    "category_name": confidence_score
  },
  "entity_types": {
    "article": preference_score,
    "song": preference_score,
    "recipe": preference_score,
    "event": preference_score
  },
  "keywords": ["keyword1", "keyword2", ...]
}

Rules:
- categories: Extract 3-8 interest categories with confidence scores (0.0-1.0)
  Examples: "technology", "ai", "indie music", "cooking", "basketball", "travel", "startups"
- entity_types: Infer what content types they might prefer (0.0-1.0)
  - If they mention music/bands/artists → higher "song" score
  - If they mention recipes/cooking/food → higher "recipe" score
  - If they mention concerts/shows/events → higher "event" score
  - Reading/articles/news/blogs → higher "article" score
- keywords: Extract 5-15 specific keywords/topics for embedding matching
  Examples: For "indie rock and AI" → ["indie", "rock", "alternative", "artificial intelligence", "machine learning", "tech"]

Be generous in interpretation. "music" implies interest in songs, "food" implies recipes, etc.`;

  try {
    const response = await fetch(`${GEMINI_FLASH_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 500,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('No response from Gemini');
    }

    // Parse JSON from response
    const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(jsonText);

    return {
      categories: result.categories || {},
      entity_types: result.entity_types || {},
      keywords: result.keywords || [],
    };
  } catch (error) {
    console.error('Error parsing interests:', error);
    // Fallback: simple keyword extraction
    const words = freeformText.toLowerCase().split(/[,\s]+/).filter(w => w.length > 2);
    return {
      categories: Object.fromEntries(words.slice(0, 5).map(w => [w, 0.5])),
      entity_types: { article: 0.25, song: 0.25, recipe: 0.25, event: 0.25 },
      keywords: words.slice(0, 10),
    };
  }
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

    const { interests } = await req.json();

    if (!interests || typeof interests !== 'string' || interests.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Interests text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🎯 Parsing interests for user:', userId);
    console.log('📝 Raw input:', interests);

    const supabase = createSupabaseClient();

    // Parse interests with AI
    let parsed;
    try {
      parsed = await parseInterestsWithAI(interests);
      console.log('✨ Parsed result:', JSON.stringify(parsed, null, 2));
    } catch (parseError) {
      console.error('❌ Failed to parse interests with AI:', parseError);
      // Use fallback parsing
      const words = interests.toLowerCase().split(/[,\s]+/).filter((w: string) => w.length > 2);
      parsed = {
        categories: Object.fromEntries(words.slice(0, 5).map((w: string) => [w, 0.5])),
        entity_types: { article: 0.25, song: 0.25, recipe: 0.25, event: 0.25 },
        keywords: words.slice(0, 10),
      };
      console.log('📝 Using fallback parsing:', JSON.stringify(parsed, null, 2));
    }

    // Generate taste embedding from keywords
    let tasteEmbedding: number[] = [];
    try {
      const embeddingText = parsed.keywords.join(' ') + ' ' + Object.keys(parsed.categories).join(' ');
      tasteEmbedding = await generateEmbedding(embeddingText);
      console.log('🔢 Generated taste embedding, length:', tasteEmbedding.length);
    } catch (embeddingError) {
      console.error('❌ Failed to generate embedding:', embeddingError);
      // Continue without embedding - it's optional
    }

    // Store or update user's taste profile
    const { error: upsertError } = await supabase
      .from('user_taste_profiles')
      .upsert({
        user_id: userId,
        taste_embedding: tasteEmbedding.length > 0 ? tasteEmbedding : null,
        top_categories: parsed.categories,
        entity_type_preferences: parsed.entity_types,
        onboarding_interests: {
          raw_input: interests,
          parsed_keywords: parsed.keywords,
          parsed_at: new Date().toISOString(),
        },
        last_computed_at: new Date().toISOString(),
        computation_version: 1,
      });

    if (upsertError) {
      console.error('❌ Database upsert error:', upsertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save interests', details: upsertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Saved onboarding interests to taste profile');

    return new Response(
      JSON.stringify({
        success: true,
        parsed: {
          categories: Object.keys(parsed.categories),
          entity_types: parsed.entity_types,
          keywords: parsed.keywords,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in parse-interests:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
