import type { EnrichmentResult, EntityType, TypeMetadata } from './types.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
// Use Gemini 3 Flash Preview for all operations
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';
const GEMINI_EMBEDDING_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent';

// Default prompts by entity type when AI doesn't generate them
function getDefaultPrompts(entityType: EntityType): string[] {
  switch (entityType) {
    case 'song':
      return ['Similar artists?', 'What genre is this?', 'More like this?'];
    case 'recipe':
      return ['Substitution ideas?', 'How long to make?', 'Serving suggestions?'];
    case 'article':
      return ['Key takeaways?', 'Related articles?', 'Summarize this'];
    case 'event':
      return ['Event details?', 'Similar events?', 'What to expect?'];
    case 'tweet':
    case 'threads_post':
    case 'instagram_post':
      return ['What\'s the context?', 'Who is this person?', 'Related posts?'];
    case 'youtube_video':
    case 'youtube_short':
    case 'tiktok':
    case 'instagram_reel':
      return ['Key points?', 'Who made this?', 'Similar videos?'];
    default:
      return ['Tell me more', 'Why is this interesting?', 'Related items?'];
  }
}

// JSON Schema for structured URL enrichment output
const urlEnrichmentSchema = {
  type: "object",
  properties: {
    entity_type: {
      type: "string",
      enum: ["article", "song", "event", "recipe", "tweet", "threads_post", "instagram_post", "instagram_reel", "tiktok", "youtube_video", "youtube_short", "generic"],
      description: "The type of content"
    },
    clean_title: {
      type: "string",
      description: "User-friendly title for the content"
    },
    summary: {
      type: "string",
      description: "1-2 sentence engaging summary"
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "Short, lowercase, topic-oriented tags (3-5 max)"
    },
    primary_emoji: {
      type: "string",
      description: "Single emoji representing the content (🎵 songs, 🍳 recipes, 📰 articles, 🎫 events, 🐦 tweets, 📷 instagram, 🎬 videos, 🔗 generic)"
    },
    suggested_prompts: {
      type: "array",
      items: { type: "string" },
      description: "3 suggested questions to ask about this content"
    },
    type_metadata: {
      type: "object",
      description: "Type-specific metadata - MUST include relevant fields based on entity_type",
      properties: {
        // Music fields
        artist_name: { type: "string", description: "Artist name for songs" },
        album_name: { type: "string", description: "Album name for songs" },
        album_art_url: { type: "string", description: "Album artwork URL for songs" },
        spotify_id: { type: "string", description: "Spotify track ID (if available)" },
        apple_music_id: { type: "string", description: "Apple Music track ID (if available)" },
        isrc: { type: "string", description: "ISRC code for cross-platform matching" },
        duration_ms: { type: "number", description: "Track duration in milliseconds" },

        // Video fields
        video_id: { type: "string", description: "Platform video ID" },
        platform: { type: "string", description: "Video platform (youtube, tiktok, etc)" },
        duration_seconds: { type: "number", description: "Video duration in seconds" },
        channel_name: { type: "string", description: "Channel or creator name" },

        // Event fields
        venue_name: { type: "string", description: "Event venue name" },
        venue_address: { type: "string", description: "Event venue address" },
        start_date: { type: "string", description: "Event start date (ISO format)" },
        end_date: { type: "string", description: "Event end date (ISO format)" },
        ticket_url: { type: "string", description: "Ticket purchase URL" },

        // Recipe fields
        ingredients: { type: "array", items: { type: "string" }, description: "Recipe ingredients list" },
        steps: { type: "array", items: { type: "string" }, description: "Recipe instruction steps" },
        prep_time: { type: "string", description: "Preparation time" },
        cook_time: { type: "string", description: "Cooking time" },
        servings: { type: "number", description: "Number of servings" },

        // Social post fields
        author_name: { type: "string", description: "Post author name" },
        author_handle: { type: "string", description: "Post author handle/username" },
        author_avatar_url: { type: "string", description: "Author profile image URL" },
      }
    }
  },
  required: ["entity_type", "clean_title", "summary", "tags", "primary_emoji", "suggested_prompts"]
};

// Classify and enrich a URL using Gemini Flash Lite with structured output + grounding
export async function enrichUrl(
  url: string,
  title: string | null,
  description: string | null,
  textSnippet: string | null,
  urlHint: string | null = null,
  parsedMetadata: any = {}
): Promise<EnrichmentResult> {
  const prompt = `Analyze this web content and extract structured metadata.

URL: ${url}
${title ? `Title: ${title}` : ''}
${description ? `Description: ${description}` : ''}
${textSnippet ? `Content snippet: ${textSnippet}` : ''}
${urlHint ? `Hint: ${urlHint}` : ''}
${Object.keys(parsedMetadata).length > 0 ? `Parsed IDs: ${JSON.stringify(parsedMetadata)}` : ''}

Classify the content type based on URL patterns and content:
- youtube.com/watch, youtu.be → "youtube_video"
- youtube.com/shorts → "youtube_short"
- music.apple.com, spotify.com → "song"
- podcasts.apple.com → "podcast"
- eventbrite.com, ticketmaster.com, maps.apple.com → "event"
- Recipe/cooking sites → "recipe"
- News/blog articles → "article"
- Otherwise → "generic"

**CRITICAL: Use Google Search to enrich type_metadata with ALL required fields. Empty type_metadata is NOT acceptable.**

For MUSIC (song):
  - REQUIRED in type_metadata: artist_name, album_name
  - HIGHLY RECOMMENDED: album_art_url, duration_ms, isrc
  - Use Google Search to find ALL of these fields
  - Search for ISRC code (International Standard Recording Code) - format: CC-XXX-YY-NNNNN
  - **CRITICAL FOR CROSS-PLATFORM**: You MUST include BOTH spotify_id AND apple_music_id in type_metadata, even if only one is in parsed IDs
    - If you receive apple_music_id in parsed IDs → Search Google using ISRC to find spotify_id and ADD IT to type_metadata
    - If you receive spotify_id in parsed IDs → Search Google using ISRC to find apple_music_id and ADD IT to type_metadata
    - BOTH IDs must appear in the final type_metadata JSON
  - Extract genre and mood tags

  EXAMPLE 1 - Apple Music URL (must find Spotify):
  Input: apple_music_id="1440933525" (from parsed IDs)
  Required output in type_metadata:
  {
    "artist_name": "M83",
    "album_name": "Hurry Up, We're Dreaming",
    "apple_music_id": "1440933525",
    "spotify_id": "3kjuyTCjPG1WMFCiyc5IuB",  ← MUST search for this using ISRC
    "isrc": "USVI21100783",
    "album_art_url": "https://...",
    "duration_ms": 244000
  }

  EXAMPLE 2 - Spotify URL (must find Apple Music):
  Input: spotify_id="3kjuyTCjPG1WMFCiyc5IuB" (from parsed IDs)
  Required output in type_metadata:
  {
    "artist_name": "M83",
    "album_name": "Hurry Up, We're Dreaming",
    "spotify_id": "3kjuyTCjPG1WMFCiyc5IuB",
    "apple_music_id": "1440933525",  ← MUST search for this using ISRC
    "isrc": "USVI21100783",
    "album_art_url": "https://...",
    "duration_ms": 244000
  }

For VIDEO (youtube_video, youtube_short):
  - Use Google Search to find: channel_name, duration_seconds, thumbnail_url, view_count (if available)
  - Summarize what the video is about in 1-2 sentences

For PODCAST:
  - Use Google Search to find: podcast_name, host_name, duration_minutes, episode_number (if available)
  - Summarize the episode topic

For EVENT:
  - Use Google Search to find: venue_name, venue_address, start_date, end_date, ticket_url
  - Extract latitude/longitude if possible from venue address

For RECIPE:
  - Use Google Search to find: ingredients (array), steps (array), prep_time, cook_time, servings
  - Mention cuisine style and difficulty

Provide engaging summaries with vibe/mood. For songs, include genre and energy. For videos, mention key topics. For recipes, highlight unique qualities.`;

  try {
    console.log('🔵 Calling Gemini API with structured output + grounding...');
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        tools: [{ google_search: {} }],  // Enable Google Search grounding
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2000,  // Increased from 1000 to prevent truncation
          responseMimeType: "application/json",
          responseSchema: urlEnrichmentSchema  // Changed from responseJsonSchema (deprecated)
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Gemini API error:', response.status, errorText);
      throw new Error(`Gemini API error: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('No response from Gemini');
    }

    console.log('🤖 Structured URL enrichment response received (JSON)');

    // Log grounding metadata if available
    const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
    if (groundingMetadata) {
      console.log('🔍 Google Search grounding used for URL enrichment:');
      console.log('  - Queries:', JSON.stringify(groundingMetadata.webSearchQueries));
      console.log('  - Sources found:', groundingMetadata.groundingChunks?.length || 0);
    }

    // Parse JSON directly - no need to strip markdown with structured output
    const result: EnrichmentResult = JSON.parse(text);
    console.log('✅ Parsed URL enrichment:', {
      type: result.entity_type,
      title: result.clean_title
    });

    // Validate and return
    return {
      entity_type: result.entity_type || 'generic',
      clean_title: result.clean_title || title || 'Untitled',
      summary: result.summary || 'No summary available',
      tags: result.tags?.slice(0, 5) || [],
      primary_emoji: result.primary_emoji || '🔗',
      suggested_prompts: result.suggested_prompts?.slice(0, 3) || getDefaultPrompts(result.entity_type || 'generic'),
      type_metadata: result.type_metadata || undefined,
    };
  } catch (error) {
    console.error('❌ Enrichment error:', error);
    console.error('❌ Error details:', JSON.stringify(error, null, 2));
    // Fallback response
    return {
      entity_type: 'generic',
      clean_title: title || 'Untitled Link',
      summary: description || 'No description available',
      tags: [],
      primary_emoji: '🔗',
      suggested_prompts: getDefaultPrompts('generic'),
      type_metadata: undefined,
    };
  }
}

// Generate embeddings for semantic search
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await fetch(`${GEMINI_EMBEDDING_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: {
          parts: [{ text }]
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.embedding?.values || [];
  } catch (error) {
    console.error('Embedding error:', error);
    return [];
  }
}

// Chat with stash using Gemini 2.5 Flash with URL context and user taste
export async function chatWithStash(
  userMessage: string,
  relevantEntities: Array<{ id: string; title: string; summary: string; tags: string[] }>,
  focusedItem?: { id: string; title: string; summary: string; tags: string[]; url?: string } | null,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }> | null,
  tasteContext?: { top_interests: string[]; preferred_types: string[] } | null,
  toolHandlers?: ToolHandlers | null
): Promise<string> {
  // Handle empty stash case
  if (relevantEntities.length === 0 && !focusedItem) {
    return "Your stash is empty right now! Start saving interesting links, articles, recipes, or music you find online, and I'll help you explore and rediscover them.";
  }

  // Only include focused item and top 3 relevant items to save tokens
  const topEntities = relevantEntities.slice(0, 3);
  const contextText = topEntities
    .map((e, i) => `${i + 1}. "${e.title}" - ${e.summary}`)
    .join('\n');

  // Build conversation history (last 4 messages max)
  const recentHistory = conversationHistory?.slice(-4) || [];
  const historyText = recentHistory.length > 0
    ? recentHistory.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n')
    : '';

  // Build taste context string for personalization
  let tasteText = '';
  if (tasteContext && (tasteContext.top_interests.length > 0 || tasteContext.preferred_types.length > 0)) {
    const interests = tasteContext.top_interests.length > 0
      ? `interests: ${tasteContext.top_interests.join(', ')}`
      : '';
    const types = tasteContext.preferred_types.length > 0
      ? `prefers: ${tasteContext.preferred_types.join(', ')}`
      : '';
    tasteText = `\nUser's taste: ${[interests, types].filter(Boolean).join('; ')}`;
  }

  // Build the prompt based on whether we have a focused item with URL
  let prompt: string;

  if (focusedItem?.url) {
    // When we have a URL, ask Gemini to fetch it for detailed info
    prompt = `You are Stash, a helpful AI assistant that knows the user's taste.${tasteText}

The user is asking about "${focusedItem.title}".

For detailed information, refer to this URL: ${focusedItem.url}

${historyText ? `Recent conversation:\n${historyText}\n` : ''}
User: ${userMessage}

Answer the user's question using information from the URL. Be concise (2-3 sentences) unless they ask for detailed lists like ingredients or steps. Always refer to the item as "${focusedItem.title}". If relevant, connect to their interests.`;
  } else if (focusedItem) {
    // Focused item but no URL
    prompt = `You are Stash, a helpful AI assistant that knows the user's taste.${tasteText}

The user is viewing "${focusedItem.title}".
Summary: ${focusedItem.summary}
Tags: ${focusedItem.tags.join(', ')}

${historyText ? `Recent conversation:\n${historyText}\n` : ''}
User: ${userMessage}

Answer based on what you know. Be concise. If relevant, connect to their interests.`;
  } else {
    // General query about stash
    prompt = `You are Stash, a helpful AI assistant that helps users explore their saved content.${tasteText}

User's saved items:
${contextText}

${historyText ? `Recent conversation:\n${historyText}\n` : ''}
User: ${userMessage}

Help the user by referencing their saved items. Use exact titles in quotes. Be concise (2-3 sentences). Consider their interests when making suggestions.${toolHandlers ? ' You can use searchUserStash to find specific items or getItemDetails for detailed information.' : ''}`;
  }

  try {
    // Build conversation messages for multi-turn
    const messages: Array<{ role: string; parts: Array<{ text?: string; functionCall?: any; functionResponse?: any }> }> = [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ];

    // Multi-turn loop for tool execution (max 5 turns to prevent infinite loops)
    const MAX_TURNS = 5;
    let turnCount = 0;

    while (turnCount < MAX_TURNS) {
      turnCount++;
      console.log(`🔄 Turn ${turnCount}/${MAX_TURNS}`);

      const requestBody: Record<string, unknown> = {
        contents: messages,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
        }
      };

      // Add tools based on context
      const tools: any[] = [];
      if (focusedItem?.url) {
        tools.push({ urlContext: {} });
      }
      if (toolHandlers) {
        tools.push(chatTools);
      }
      if (tools.length > 0) {
        requestBody.tools = tools;
      }

      const response = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Chat API error:', response.status, errorText);
        throw new Error(`Chat API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];

      if (!candidate) {
        console.error('❌ No candidate in response:', JSON.stringify(data));
        return "I'm having trouble understanding that right now. Could you rephrase your question?";
      }

      // Log URL context metadata if available
      if (candidate.urlContextMetadata) {
        console.log('🟢 URL fetched:', JSON.stringify(candidate.urlContextMetadata));
      }

      const content = candidate.content;
      if (!content) {
        return "I'm having trouble understanding that right now. Could you rephrase your question?";
      }

      // Add assistant response to conversation
      messages.push({
        role: 'model',
        parts: content.parts
      });

      // Check if response contains function calls
      const functionCalls = content.parts?.filter((part: any) => part.functionCall);

      if (!functionCalls || functionCalls.length === 0) {
        // No function calls - this is the final answer
        const textPart = content.parts?.find((part: any) => part.text);
        if (textPart?.text) {
          console.log(`✅ Final answer received (turn ${turnCount})`);
          return textPart.text;
        }
        return "I'm having trouble understanding that right now. Could you rephrase your question?";
      }

      // Execute function calls
      console.log(`🔧 Executing ${functionCalls.length} function call(s)...`);
      const functionResponses: any[] = [];

      for (const fc of functionCalls) {
        const functionCall = fc.functionCall;
        const functionName = functionCall.name;
        const functionArgs = functionCall.args || {};

        console.log(`  - ${functionName}(${JSON.stringify(functionArgs)})`);

        let functionResult: any;

        try {
          if (!toolHandlers) {
            functionResult = { error: 'Tool handlers not available' };
          } else if (functionName === 'searchUserStash') {
            const results = await toolHandlers.searchUserStash(
              functionArgs.query,
              functionArgs.limit || 10
            );
            functionResult = { results };
          } else if (functionName === 'getItemDetails') {
            const item = await toolHandlers.getItemDetails(functionArgs.itemId);
            functionResult = item ? { item } : { error: 'Item not found' };
          } else {
            functionResult = { error: `Unknown function: ${functionName}` };
          }
        } catch (error) {
          console.error(`❌ Error executing ${functionName}:`, error);
          functionResult = { error: error instanceof Error ? error.message : 'Function execution failed' };
        }

        functionResponses.push({
          functionResponse: {
            name: functionName,
            response: functionResult
          }
        });
      }

      // Add function responses to conversation
      messages.push({
        role: 'user',
        parts: functionResponses
      });

      // Continue to next turn to get final answer
    }

    // Reached max turns without final answer
    console.warn('⚠️ Reached max turns without final answer');
    return "I found some information but need more time to process it. Could you rephrase your question?";

  } catch (error) {
    console.error('❌ Chat error:', error);
    if (focusedItem) {
      return `I had trouble fetching details about "${focusedItem.title}". Try asking something else!`;
    }
    return "Sorry, I'm having trouble right now. Please try again in a moment.";
  }
}

// Tool declarations for chat function calling
export const chatTools = {
  function_declarations: [
    {
      name: 'searchUserStash',
      description: 'Search the user\'s saved items by query. Use this when the user asks to find specific content in their stash.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to match against saved items'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return (default: 10)'
          }
        },
        required: ['query']
      }
    },
    {
      name: 'getItemDetails',
      description: 'Get full metadata for a specific saved item by ID. Use this when the user asks for details about a particular item.',
      parameters: {
        type: 'object',
        properties: {
          itemId: {
            type: 'string',
            description: 'The UUID of the item to retrieve'
          }
        },
        required: ['itemId']
      }
    }
  ]
};

// Type for tool handlers
export type ToolHandlers = {
  searchUserStash: (query: string, limit?: number) => Promise<Array<{ id: string; title: string; summary: string; tags: string[] }>>;
  getItemDetails: (itemId: string) => Promise<{ id: string; title: string; summary: string; tags: string[]; url?: string; metadata?: any } | null>;
};

// JSON Schema for structured image enrichment output
const imageEnrichmentSchema = {
  type: "object",
  properties: {
    entity_type: {
      type: "string",
      enum: ["article", "song", "event", "recipe", "tweet", "threads_post", "instagram_post", "instagram_reel", "tiktok", "youtube_video", "youtube_short", "generic"],
      description: "The type of content in the image"
    },
    clean_title: {
      type: "string",
      description: "Descriptive title extracted from the image"
    },
    summary: {
      type: "string",
      description: "1-2 sentence summary of what this is"
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "Relevant topic tags (3-5 max)"
    },
    primary_emoji: {
      type: "string",
      description: "Single emoji that represents the content (🍳 recipes, 🎫 events, 🐦 tweets, 📷 instagram, 🎵 songs, 📰 articles, 🔗 generic)"
    },
    suggested_prompts: {
      type: "array",
      items: { type: "string" },
      description: "3 suggested questions to ask about this content"
    },
    type_metadata: {
      type: "object",
      description: "Type-specific metadata (ingredients for recipes, venue for events, etc.)"
    },
    source_url: {
      type: "string",
      description: "Original URL if found via Google Search, otherwise null"
    }
  },
  required: ["entity_type", "clean_title", "summary", "tags", "primary_emoji", "suggested_prompts"]
};

// Single-stage image enrichment with vision + grounding + structured output
// Gemini 3.0 Flash Preview supports tools + structured output together!
async function enrichImageSingleStage(imageBase64: string): Promise<EnrichmentResult> {
  const prompt = `Analyze this image and use Google Search to find additional context.

Extract and identify:
1. Content type (recipe, event, tweet, article, song, video, etc.)
2. Title or main heading
3. All visible text and URLs
4. Use Google Search to find:
   - Original source URL if this is a screenshot
   - Recipe ingredients if it's food
   - Event date/venue if it's an event
   - Song artist/album if it's music
   - Article author/publication if it's an article
   - Any other relevant metadata

Classify the content type based on URLs/context:
- twitter.com, x.com → "tweet"
- threads.net → "threads_post"
- instagram.com/p/ → "instagram_post"
- instagram.com/reel/ → "instagram_reel"
- tiktok.com → "tiktok"
- youtube.com/watch → "youtube_video"
- youtube.com/shorts → "youtube_short"
- music.apple.com, spotify.com → "song"
- eventbrite.com, ticketmaster.com → "event"
- Recipe/cooking content → "recipe"
- News/blog → "article"
- Otherwise → "generic"

Create an engaging summary. For recipes, mention key qualities. For songs, include genre/mood. For social posts, capture the main point.`;

  try {
    console.log('🔵 Single-stage enrichment: Vision + Grounding + Structured Output...');
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: imageBase64
              }
            }
          ]
        }],
        tools: [{ google_search: {} }],  // Grounding enabled
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1500,
          responseMimeType: "application/json",  // Structured output enabled
          responseSchema: imageEnrichmentSchema  // Together with tools - NEW in 3.0!
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Single-stage enrichment failed:', response.status, errorText);
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();

    // Log grounding metadata
    const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
    if (groundingMetadata) {
      console.log('🔍 Google Search grounding used');
      console.log('  - Queries:', JSON.stringify(groundingMetadata.webSearchQueries));
      console.log('  - Sources found:', groundingMetadata.groundingChunks?.length || 0);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('No response from Gemini');
    }

    console.log('✅ Single-stage enrichment complete');
    const result: EnrichmentResult = JSON.parse(text);

    return {
      entity_type: result.entity_type || 'generic',
      clean_title: result.clean_title || 'Image',
      summary: result.summary || 'An image was saved',
      tags: result.tags?.slice(0, 5) || ['image'],
      primary_emoji: result.primary_emoji || '📷',
      suggested_prompts: result.suggested_prompts?.slice(0, 3) || ['What is this?', 'Tell me more', 'Details?'],
      type_metadata: result.type_metadata || undefined,
      source_url: result.source_url || undefined,
    };
  } catch (error) {
    console.error('❌ Single-stage enrichment error:', error);
    throw error;  // Propagate to fallback
  }
}

// Two-stage fallback (kept for compatibility if single-stage fails)
// Stage 1: Vision + Google Search grounding (unstructured output)
// Stage 2: Text + Structured output (no grounding needed, already enriched)
async function enrichImageTwoStage(imageBase64: string): Promise<EnrichmentResult> {
  // Stage 1: Vision analysis WITH grounding (no structured output)
  const visionPrompt = `Analyze this image and use Google Search to find additional context.

Extract and identify:
1. Content type (recipe, event, tweet, article, song, video, etc.)
2. Title or main heading
3. All visible text
4. Any URLs visible in the image
5. Use Google Search to find:
   - Original source URL if this is a screenshot
   - Recipe ingredients if it's food
   - Event date/venue if it's an event
   - Song artist/album if it's music
   - Article author/publication if it's an article
   - Any other relevant metadata

Return all findings as detailed text. Be thorough - include everything you find from both the image and web search.`;

  try {
    console.log('🔵 Stage 1: Vision + Grounding (analyzing image with web search)...');
    const visionResponse = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: visionPrompt },
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: imageBase64
              }
            }
          ]
        }],
        tools: [{ google_search: {} }],  // Enable grounding
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2000
          // NO responseJsonSchema - can't use with tools
        }
      })
    });

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      console.error('❌ Gemini Vision API error:', visionResponse.status, errorText);
      throw new Error(`Gemini Vision API error: ${visionResponse.statusText}`);
    }

    const visionData = await visionResponse.json();
    const enrichedContext = visionData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!enrichedContext) {
      throw new Error('No response from Gemini Vision');
    }

    // Log grounding metadata from Stage 1
    const groundingMetadata = visionData.candidates?.[0]?.groundingMetadata;
    if (groundingMetadata) {
      console.log('🔍 Stage 1: Google Search grounding used');
      console.log('  - Queries:', JSON.stringify(groundingMetadata.webSearchQueries));
      console.log('  - Sources found:', groundingMetadata.groundingChunks?.length || 0);
      if (groundingMetadata.groundingChunks) {
        groundingMetadata.groundingChunks.forEach((chunk: any, i: number) => {
          console.log(`  - [${i}] ${chunk.web?.title}: ${chunk.web?.uri}`);
        });
      }
    }

    console.log('✅ Stage 1 complete - Enriched context:', enrichedContext.substring(0, 200) + '...');

    // Stage 2: Convert enriched context to structured JSON (no grounding, just formatting)
    const structuredPrompt = `Based on this enriched content about an image, create structured metadata.

Enriched context from vision + web search:
${enrichedContext}

Classify the content type based on the info:
- twitter.com, x.com → "tweet"
- threads.net → "threads_post"
- instagram.com/p/ → "instagram_post"
- instagram.com/reel/ → "instagram_reel"
- tiktok.com → "tiktok"
- youtube.com/watch → "youtube_video"
- youtube.com/shorts → "youtube_short"
- music.apple.com, spotify.com → "song"
- eventbrite.com, ticketmaster.com → "event"
- Recipe/cooking content → "recipe"
- News/blog → "article"
- Otherwise → "generic"

Create an engaging summary. For recipes, mention key qualities. For songs, include genre/mood. For social posts, capture the main point.`;

    console.log('🔵 Stage 2: Structured output (formatting enriched data)...');
    const structuredResponse = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: structuredPrompt }]
        }],
        // NO tools - already grounded in Stage 1
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1000,
          responseMimeType: "application/json",
          responseJsonSchema: imageEnrichmentSchema  // NOW we can use structured output
        }
      })
    });

    if (!structuredResponse.ok) {
      const errorText = await structuredResponse.text();
      console.error('❌ Structured output API error:', structuredResponse.status, errorText);
      throw new Error(`Structured output API error: ${structuredResponse.statusText}`);
    }

    const structuredData = await structuredResponse.json();
    const structuredText = structuredData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!structuredText) {
      throw new Error('No structured response from Gemini');
    }

    console.log('✅ Stage 2 complete - Structured JSON received');

    // Parse the guaranteed-valid JSON
    const result: EnrichmentResult = JSON.parse(structuredText);

    console.log('✅ Final enrichment:', {
      type: result.entity_type,
      title: result.clean_title,
      has_source_url: !!result.source_url,
      has_grounding: !!groundingMetadata
    });

    // Return with fallbacks for optional fields
    return {
      entity_type: result.entity_type || 'generic',
      clean_title: result.clean_title || 'Image',
      summary: result.summary || 'An image was saved',
      tags: result.tags?.slice(0, 5) || ['image'],
      primary_emoji: result.primary_emoji || '📷',
      suggested_prompts: result.suggested_prompts?.slice(0, 3) || ['What is this?', 'Tell me more', 'Details?'],
      type_metadata: result.type_metadata || undefined,
      source_url: result.source_url || undefined,
    };
  } catch (error) {
    console.error('❌ Image enrichment error:', error);
    // Fallback response
    return {
      entity_type: 'generic',
      clean_title: 'Image',
      summary: 'An image was saved to your stash',
      tags: ['image'],
      primary_emoji: '📷',
      suggested_prompts: ['What is this?', 'Tell me more', 'Details?'],
      type_metadata: undefined,
    };
  }
}

// Main enrichImage function with automatic fallback
// Tries single-stage (faster, 1 API call) → falls back to two-stage if it fails
export async function enrichImage(imageBase64: string): Promise<EnrichmentResult> {
  try {
    // Try single-stage first (Gemini 3.0 Flash Preview feature)
    return await enrichImageSingleStage(imageBase64);
  } catch (singleStageError) {
    console.log('⚠️ Single-stage enrichment failed, falling back to two-stage...');
    console.error('Single-stage error:', singleStageError);

    try {
      // Fallback to proven two-stage approach
      return await enrichImageTwoStage(imageBase64);
    } catch (twoStageError) {
      console.error('❌ Both enrichment strategies failed');
      console.error('Two-stage error:', twoStageError);

      // Final fallback response
      return {
        entity_type: 'generic',
        clean_title: 'Image',
        summary: 'An image was saved to your stash',
        tags: ['image'],
        primary_emoji: '📷',
        suggested_prompts: ['What is this?', 'Tell me more', 'Details?'],
        type_metadata: undefined,
      };
    }
  }
}

// Generate AI subtitle for Today feed
export async function generateTodaySubtitle(
  topTags: string[],
  typesPresent: EntityType[]
): Promise<string> {
  const prompt = `Write 1 short, warm sentence describing today's vibe based on these saved items.

Tags: ${topTags.join(', ')}
Types: ${typesPresent.join(', ')}

Be casual, warm, and concise. Examples:
- "Feels like a concerts + cozy recipes kind of day."
- "Perfect day for tech articles and great music."

Don't be creepy or overly specific. Just capture the vibe.

Your sentence:`;

  try {
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 50,
        }
      })
    });

    if (!response.ok) {
      return "Check out what you've saved today.";
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "Check out what you've saved today.";
  } catch {
    return "Check out what you've saved today.";
  }
}
