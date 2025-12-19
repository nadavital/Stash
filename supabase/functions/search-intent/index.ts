import { createSupabaseClient, getUserIdFromRequest } from '../_shared/supabase-client.ts';
import { corsHeaders } from '../_shared/types.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

// Intent types
type IntentType = 'find_saved' | 'discover_new' | 'ask_question';

// UI modes
type UIMode = 'stack' | 'mini_card' | 'chat';

interface IntentResult {
  intent: IntentType;
  ui_mode: UIMode;
  confidence: number;
}

// Instant pattern matching (0ms) for common queries
function instantClassification(query: string): IntentResult | null {
  const lowerQuery = query.toLowerCase().trim();

  // find_saved patterns → stack view
  const findPatterns = [
    /^(find|show|get|search|look\s+for|where\s+is|where\s+are)/,
    /\b(my|saved|stash|bookmarked|collection)\b/,
    /^(recipes?|articles?|songs?|videos?|events?)\s+(i|about|on)/,
  ];

  for (const pattern of findPatterns) {
    if (pattern.test(lowerQuery)) {
      return {
        intent: 'find_saved',
        ui_mode: 'stack',
        confidence: 0.95,
      };
    }
  }

  // ask_question patterns → chat view
  const askPatterns = [
    /^(what|why|how|when|who|explain|tell\s+me)/,
    /\?$/,
    /\b(details|about|more\s+info|information)\b/,
  ];

  for (const pattern of askPatterns) {
    if (pattern.test(lowerQuery)) {
      return {
        intent: 'ask_question',
        ui_mode: 'chat',
        confidence: 0.9,
      };
    }
  }

  // discover_new patterns → mini_card view
  const discoverPatterns = [
    /^(recommend|suggest|discover|explore)/,
    /\b(new|fresh|recent|trending|popular)\b/,
    /\b(something|anything)\s+(for|to|about)\b/,
  ];

  for (const pattern of discoverPatterns) {
    if (pattern.test(lowerQuery)) {
      return {
        intent: 'discover_new',
        ui_mode: 'mini_card',
        confidence: 0.85,
      };
    }
  }

  return null; // Need AI classification
}

// AI classification schema
const intentClassificationSchema = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: ['find_saved', 'discover_new', 'ask_question'],
      description: 'The user\'s primary intent'
    },
    ui_mode: {
      type: 'string',
      enum: ['stack', 'mini_card', 'chat'],
      description: 'Recommended UI mode for this query'
    },
    confidence: {
      type: 'number',
      minimum: 0.0,
      maximum: 1.0,
      description: 'Confidence in this classification'
    }
  },
  required: ['intent', 'ui_mode', 'confidence']
};

// AI classification for ambiguous queries
async function aiClassification(query: string): Promise<IntentResult> {
  if (!GEMINI_API_KEY) {
    // Fallback to find_saved if no API key
    return {
      intent: 'find_saved',
      ui_mode: 'stack',
      confidence: 0.5,
    };
  }

  const prompt = `Classify this user query from a content stash app.

User query: "${query}"

Intent types:
- find_saved: User wants to find/search their saved items (show stack view)
- discover_new: User wants recommendations/new content (show mini cards)
- ask_question: User is asking a question about content (show chat)

UI modes:
- stack: Full-screen card stack (best for browsing saved items)
- mini_card: Compact card grid (best for discoveries/recommendations)
- chat: Conversation view (best for questions and details)

Classify the intent and recommend the best UI mode. Provide confidence (0.0-1.0).`;

  try {
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 200,
          responseMimeType: 'application/json',
          responseSchema: intentClassificationSchema,
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

    const result = JSON.parse(text);
    return {
      intent: result.intent || 'find_saved',
      ui_mode: result.ui_mode || 'stack',
      confidence: result.confidence || 0.5,
    };
  } catch (error) {
    console.error('❌ AI classification error:', error);
    // Fallback
    return {
      intent: 'find_saved',
      ui_mode: 'stack',
      confidence: 0.5,
    };
  }
}

// In-memory cache (24h TTL)
const classificationCache = new Map<string, { result: IntentResult; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

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

    const { query } = await req.json();

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedQuery = query.trim().toLowerCase();
    console.log('🔍 Classifying intent for query:', query);

    // Check cache first
    const cached = classificationCache.get(normalizedQuery);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log('✅ Cache hit - instant response');
      return new Response(
        JSON.stringify({
          ...cached.result,
          cached: true,
          latency_ms: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const startTime = Date.now();

    // Try instant pattern matching first
    let result = instantClassification(normalizedQuery);

    if (result) {
      console.log(`✅ Instant classification: ${result.intent} → ${result.ui_mode} (${result.confidence})`);
      const latency = Date.now() - startTime;

      // Cache the result
      classificationCache.set(normalizedQuery, { result, timestamp: Date.now() });

      return new Response(
        JSON.stringify({
          ...result,
          cached: false,
          latency_ms: latency,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fallback to AI classification
    console.log('🤖 Using AI classification...');
    result = await aiClassification(query);

    const latency = Date.now() - startTime;
    console.log(`✅ AI classification: ${result.intent} → ${result.ui_mode} (${result.confidence}, ${latency}ms)`);

    // Cache the result
    classificationCache.set(normalizedQuery, { result, timestamp: Date.now() });

    return new Response(
      JSON.stringify({
        ...result,
        cached: false,
        latency_ms: latency,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in search-intent:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
