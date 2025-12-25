import type { EnrichmentResult } from './types.ts';
import { getMusicMetadata } from './music-apis.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

// Lightweight schema for music enrichment (just summary/tags, metadata from APIs)
const musicSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    suggested_prompts: { type: "array", items: { type: "string" } }
  },
  required: ["summary", "tags", "suggested_prompts"]
};

/**
 * Specialized enrichment for music URLs (Spotify, Apple Music)
 * Uses direct API calls - NO Gemini needed, all data from official sources
 * Cost: $0 (just API calls, no AI tokens)
 */
export async function enrichMusicUrl(
  url: string,
  title: string | null,
  parsedIds: { spotify_id?: string; apple_music_id?: string }
): Promise<EnrichmentResult> {
  // Get complete metadata from music APIs (free, instant, reliable)
  console.log('🎵 Fetching music metadata from APIs...');
  const metadata = await getMusicMetadata(parsedIds.spotify_id, parsedIds.apple_music_id);

  if (!metadata) {
    throw new Error('Could not fetch music metadata from Spotify/Apple Music APIs');
  }

  console.log('✅ Music metadata fetched:', {
    track: metadata.track_name,
    artist: metadata.artist_name,
    album: metadata.album_name,
    has_spotify: !!metadata.spotify_id,
    has_apple: !!metadata.apple_music_id,
  });

  // Return enrichment with clean data from APIs - NO Gemini needed!
  return {
    entity_type: 'song',
    clean_title: metadata.track_name,  // Clean track name from API
    summary: `${metadata.track_name} by ${metadata.artist_name} from the album ${metadata.album_name}`,
    tags: ['music', metadata.artist_name.toLowerCase()],  // Simple tags
    primary_emoji: '🎵',
    suggested_prompts: [
      `Tell me about ${metadata.artist_name}`,
      `What genre is this?`,
      `More songs like this?`
    ],
    type_metadata: {
      artist_name: metadata.artist_name,
      album_name: metadata.album_name,
      album_art_url: metadata.album_art_url,
      duration_ms: metadata.duration_ms,
      isrc: metadata.isrc,
      spotify_id: metadata.spotify_id,
      apple_music_id: metadata.apple_music_id,
    }
  };
}

/**
 * Specialized enrichment for video URLs (YouTube, TikTok)
 */
export async function enrichVideoUrl(
  url: string,
  title: string | null,
  parsedIds: { video_id?: string; platform?: string }
): Promise<EnrichmentResult> {
  const isShort = url.includes('/shorts/') || url.includes('tiktok.com');
  const entityType = isShort ? 'youtube_short' : 'youtube_video';

  const prompt = `Enrich this video using Google Search.

URL: ${url}
${title ? `Title: ${title}` : ''}
${parsedIds.video_id ? `Video ID: ${parsedIds.video_id}` : ''}

Find: channel_name, duration_seconds, thumbnail_url
Write 1-2 sentence summary about the video content.`;

  const videoSchema = {
    type: "object",
    properties: {
      clean_title: { type: "string" },
      summary: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      suggested_prompts: { type: "array", items: { type: "string" } },
      type_metadata: {
        type: "object",
        properties: {
          video_id: { type: "string" },
          platform: { type: "string" },
          channel_name: { type: "string" },
          duration_seconds: { type: "number" }
        }
      }
    },
    required: ["clean_title", "summary", "tags", "suggested_prompts"]
  };

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1500,  // Increased for grounding overhead
        responseMimeType: "application/json",
        responseSchema: videoSchema
      }
    })
  });

  if (!response.ok) throw new Error(`Gemini error: ${response.statusText}`);

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No response from Gemini');

  const result = JSON.parse(text);
  return {
    entity_type: entityType as any,
    clean_title: result.clean_title,
    summary: result.summary,
    tags: result.tags,
    primary_emoji: '🎬',
    suggested_prompts: result.suggested_prompts,
    type_metadata: {
      ...result.type_metadata,
      video_id: parsedIds.video_id,
      platform: parsedIds.platform || 'youtube'
    }
  };
}

/**
 * Lightweight classifier for unknown URLs
 * Returns entity_type, then we route to specialist or use generic
 */
export async function classifyUrl(url: string, title: string | null): Promise<string> {
  const prompt = `Classify this URL into ONE type:

URL: ${url}
${title ? `Title: ${title}` : ''}

Types: article, song, event, recipe, tweet, youtube_video, generic

Return ONLY the type, nothing else.`;

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 20
      }
    })
  });

  if (!response.ok) return 'generic';

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  return text || 'generic';
}
