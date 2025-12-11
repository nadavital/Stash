// Shared TypeScript types for Supabase Edge Functions

export type EntityType = 'article' | 'song' | 'event' | 'recipe' | 'tweet' | 'instagram_post' | 'instagram_reel' | 'tiktok' | 'youtube_video' | 'youtube_short' | 'threads_post' | 'generic';
export type ItemSource = 'self' | 'friend_link' | 'friend_user' | 'ai_recommendation';
export type ItemStatus = 'unopened' | 'opened' | 'done';

export interface Entity {
  id: string;
  type: EntityType;
  canonical_url: string | null;
  title: string | null;
  description: string | null;
  source_name: string | null;
  raw_metadata: Record<string, any> | null;
  summary: string | null;
  primary_emoji: string | null;
  tags: string[];
  embedding: number[] | null;
  created_at: string;
}

export interface StashItem {
  id: string;
  user_id: string;
  entity_id: string | null;
  source: ItemSource;
  input_mode: string | null;
  from_user_id: string | null;
  note: string | null;
  status: ItemStatus;
  liked: boolean;
  created_at: string;
  opened_at: string | null;
}

// Type-specific metadata extracted during enrichment
export interface TypeMetadata {
  // Social posts (tweet, threads, instagram)
  author_name?: string;
  author_handle?: string;
  author_avatar_url?: string;
  embed_html?: string;
  media_urls?: string[];
  like_count?: number;
  repost_count?: number;
  comment_count?: number;
  
  // Video
  video_id?: string;
  video_platform?: string;
  thumbnail_url?: string;
  duration_seconds?: number;
  
  // Music
  apple_music_id?: string;
  spotify_id?: string;
  artist_name?: string;
  album_name?: string;
  album_art_url?: string;
  preview_url?: string;
  duration_ms?: number;
  
  // Events
  venue_name?: string;
  venue_address?: string;
  latitude?: number;
  longitude?: number;
  start_date?: string;
  end_date?: string;
  ticket_url?: string;
  
  // Recipe
  ingredients?: string[];
  steps?: string[];
  prep_time?: string;
  cook_time?: string;
  servings?: number;
}

export interface ItemSummary {
  item_id: string;
  entity_id: string;
  title: string;
  type: EntityType;
  primary_emoji: string;
  source_label: string;
  summary: string;
  created_at: string;
  canonical_url?: string;
  metadata: {
    source_name: string | null;
    icon_url: string | null;
    tags: string[];
    suggested_prompts?: string[];
    type_metadata?: TypeMetadata;
  };
}

export interface TodayFeed {
  ai_subtitle: string;
  brain_snack: ItemSummary[];
  from_friends: ItemSummary[];
  by_you: ItemSummary[];
  for_you: ItemSummary[];
}

export interface ChatResponse {
  answer: string;
  referenced_items: ItemSummary[];
}

export interface ProfileOverview {
  name: string | null;
  handle: string;
  stats: {
    total_items: number;
    top_tags: string[];
    type_mix: {
      article: number;
      song: number;
      event: number;
      recipe: number;
      generic: number;
    };
  };
}

// Enrichment result from Gemini API
export interface EnrichmentResult {
  entity_type: EntityType;
  clean_title: string;
  summary: string;
  tags: string[];
  primary_emoji: string;
  suggested_prompts: string[];
  type_metadata?: TypeMetadata;
  source_url?: string;  // Original URL found via Google Search grounding
}

// CORS headers for responses
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
