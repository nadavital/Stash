import type { EnrichmentResult, EntityType } from './types.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
// Use 2.5 Flash for chat (supports URL context), 2.0 Flash for enrichment
const GEMINI_FLASH_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const GEMINI_FLASH_LITE_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
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
    default:
      return ['Tell me more', 'Why is this interesting?', 'Related items?'];
  }
}

// Classify and enrich a URL using Gemini Flash Lite
export async function enrichUrl(
  url: string,
  title: string | null,
  description: string | null,
  textSnippet: string | null,
  urlHint: string | null = null
): Promise<EnrichmentResult> {
  const prompt = `You are a content classifier. Analyze this web content and return ONLY a JSON object with no additional text.

URL: ${url}
Title: ${title || 'Unknown'}
Description: ${description || 'N/A'}
Content snippet: ${textSnippet || 'N/A'}
${urlHint ? `Hint: ${urlHint}` : ''}

Return JSON in this exact format:
{
  "entity_type": "article|song|event|recipe|generic",
  "clean_title": "user-friendly title",
  "summary": "1-2 sentence summary",
  "tags": ["short", "lowercase", "topic-oriented"],
  "primary_emoji": "single emoji",
  "suggested_prompts": ["prompt1", "prompt2", "prompt3"]
}

Rules:
- entity_type must be one of: article, song, event, recipe, generic
- If the URL is from music.apple.com, spotify.com, or mentions "song", "album", "track", "artist" → use "song" type
- If the URL is from eventbrite, ticketmaster, or mentions "event", "concert", "show" → use "event" type
- If the URL has recipe content or is from a cooking site → use "recipe" type
- If it's a blog post or news article → use "article" type
- Otherwise use "generic"
- clean_title should be concise and readable (e.g., "Song Name by Artist")
- summary should be 1-2 sentences, user-friendly
- tags should be 3-5 short lowercase words (for songs: genre, artist name, mood)
- primary_emoji: 🎵 for songs, 🎟️ for events, 🍳 for recipes, 📰 for articles, 🔗 for generic
- suggested_prompts: 3 SHORT conversation starters (max 6 words each) that a user might ask about this content. Be specific to the content type:
  * For songs: "Similar artists?", "What genre is this?", "Lyrics meaning?"
  * For recipes: "Substitution ideas?", "How long to prep?", "Pair with what wine?"
  * For articles: "Key takeaways?", "Counter arguments?", "Related reads?"
  * For events: "Ticket prices?", "Who else is going?", "What to wear?"
  * For generic: "What is this about?", "Why save this?", "Similar items?"`;

  try {
    console.log('🔵 Calling Gemini API...');
    const response = await fetch(`${GEMINI_FLASH_LITE_ENDPOINT}?key=${GEMINI_API_KEY}`, {
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
      const errorText = await response.text();
      console.error('❌ Gemini API error:', response.status, errorText);
      throw new Error(`Gemini API error: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('No response from Gemini');
    }

    console.log('🤖 Raw Gemini response:', text);

    // Parse JSON from response (strip markdown code blocks if present)
    const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    console.log('📝 Cleaned JSON text:', jsonText);
    const result: EnrichmentResult = JSON.parse(jsonText);
    console.log('✅ Parsed result:', JSON.stringify(result, null, 2));

    // Validate and return
    return {
      entity_type: result.entity_type || 'generic',
      clean_title: result.clean_title || title || 'Untitled',
      summary: result.summary || 'No summary available',
      tags: result.tags?.slice(0, 5) || [],
      primary_emoji: result.primary_emoji || '🔗',
      suggested_prompts: result.suggested_prompts?.slice(0, 3) || getDefaultPrompts(result.entity_type || 'generic'),
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

// Chat with stash using Gemini 2.5 Flash with URL context
export async function chatWithStash(
  userMessage: string,
  relevantEntities: Array<{ id: string; title: string; summary: string; tags: string[] }>,
  focusedItem?: { id: string; title: string; summary: string; tags: string[]; url?: string } | null,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }> | null
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

  // Build the prompt based on whether we have a focused item with URL
  let prompt: string;
  
  if (focusedItem?.url) {
    // When we have a URL, ask Gemini to fetch it for detailed info
    prompt = `You are Stash, a helpful AI assistant. The user is asking about "${focusedItem.title}".

For detailed information, refer to this URL: ${focusedItem.url}

${historyText ? `Recent conversation:\n${historyText}\n` : ''}
User: ${userMessage}

Answer the user's question using information from the URL. Be concise (2-3 sentences) unless they ask for detailed lists like ingredients or steps. Always refer to the item as "${focusedItem.title}".`;
  } else if (focusedItem) {
    // Focused item but no URL
    prompt = `You are Stash, a helpful AI assistant. The user is viewing "${focusedItem.title}".
Summary: ${focusedItem.summary}
Tags: ${focusedItem.tags.join(', ')}

${historyText ? `Recent conversation:\n${historyText}\n` : ''}
User: ${userMessage}

Answer based on what you know. Be concise.`;
  } else {
    // General query about stash
    prompt = `You are Stash, a helpful AI assistant that helps users explore their saved content.

User's saved items:
${contextText}

${historyText ? `Recent conversation:\n${historyText}\n` : ''}
User: ${userMessage}

Help the user by referencing their saved items. Use exact titles in quotes. Be concise (2-3 sentences).`;
  }

  try {
    const requestBody: Record<string, unknown> = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 500,
      }
    };
    
    // Add URL context tool when we have a focused item URL
    if (focusedItem?.url) {
      requestBody.tools = [{ urlContext: {} }];
      console.log('🔵 Using URL context for:', focusedItem.url);
    }

    const response = await fetch(`${GEMINI_FLASH_ENDPOINT}?key=${GEMINI_API_KEY}`, {
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
    
    // Log URL context metadata if available
    if (data.candidates?.[0]?.urlContextMetadata) {
      console.log('🟢 URL fetched:', JSON.stringify(data.candidates[0].urlContextMetadata));
    }
    
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      console.error('❌ No text in response:', JSON.stringify(data));
      return "I'm having trouble understanding that right now. Could you rephrase your question?";
    }
    
    return text;
  } catch (error) {
    console.error('❌ Chat error:', error);
    if (focusedItem) {
      return `I had trouble fetching details about "${focusedItem.title}". Try asking something else!`;
    }
    return "Sorry, I'm having trouble right now. Please try again in a moment.";
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
    const response = await fetch(`${GEMINI_FLASH_LITE_ENDPOINT}?key=${GEMINI_API_KEY}`, {
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
