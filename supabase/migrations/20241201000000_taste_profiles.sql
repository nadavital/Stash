-- Migration: User Taste Profiles and Interaction Tracking
-- Created: December 2024
-- Purpose: Enable persistent taste model for personalized recommendations

-- ============================================
-- 1. User Interactions (Event Log)
-- ============================================
-- Tracks all user actions for building taste profile
-- This is the source of truth for taste computation

CREATE TABLE IF NOT EXISTS user_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    item_id UUID REFERENCES stash_items(id) ON DELETE SET NULL,
    entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
    
    -- Event type: save, like, dislike, open, done, share, chat_question
    event_type TEXT NOT NULL CHECK (event_type IN (
        'save', 'like', 'dislike', 'unlike', 'undislike',
        'open', 'done', 'undone', 'share', 'chat_question'
    )),
    
    -- Optional metadata (e.g., time_spent, share_recipient, query_text)
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for efficient querying
CREATE INDEX idx_user_interactions_user_id ON user_interactions(user_id);
CREATE INDEX idx_user_interactions_user_id_created ON user_interactions(user_id, created_at DESC);
CREATE INDEX idx_user_interactions_entity_id ON user_interactions(entity_id);
CREATE INDEX idx_user_interactions_event_type ON user_interactions(event_type);

-- ============================================
-- 2. User Taste Profiles (Computed)
-- ============================================
-- Persistent taste embedding and category breakdown
-- Updated by compute-taste-profile edge function

CREATE TABLE IF NOT EXISTS user_taste_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- 768-dimensional taste embedding (weighted average of interactions)
    -- Stored as JSON array for compatibility (pgvector would be better for large scale)
    taste_embedding JSONB,
    
    -- Top interest categories with scores: {"tech": 0.35, "music": 0.25, ...}
    top_categories JSONB DEFAULT '{}',
    
    -- Entity type preferences: {"article": 0.4, "song": 0.3, ...}
    entity_type_preferences JSONB DEFAULT '{}',
    
    -- Top source domains: ["nytimes.com", "spotify.com", ...]
    preferred_sources TEXT[] DEFAULT '{}',
    
    -- Onboarding interests (free-form parsed into structure)
    onboarding_interests JSONB DEFAULT '{}',
    
    -- Stats for transparency
    total_interactions INT DEFAULT 0,
    last_interaction_at TIMESTAMPTZ,
    
    -- Computation metadata
    last_computed_at TIMESTAMPTZ,
    computation_version INT DEFAULT 1,
    
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================
-- 3. Friend Similarity (Precomputed)
-- ============================================
-- Cosine similarity between user taste embeddings
-- Updated periodically and when friendships change

CREATE TABLE IF NOT EXISTS friend_similarity (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Cosine similarity of taste embeddings (0.0 to 1.0)
    taste_similarity DECIMAL(4,3) DEFAULT 0,
    
    -- Common top interests
    common_interests TEXT[] DEFAULT '{}',
    
    -- When this was computed
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    
    PRIMARY KEY (user_id, friend_id)
);

-- Index for looking up friend similarities
CREATE INDEX idx_friend_similarity_user_id ON friend_similarity(user_id);
CREATE INDEX idx_friend_similarity_taste ON friend_similarity(user_id, taste_similarity DESC);

-- ============================================
-- 4. Add dislike column to stash_items
-- ============================================
-- Track explicit negative signals

ALTER TABLE stash_items 
ADD COLUMN IF NOT EXISTS disliked BOOLEAN DEFAULT FALSE;

-- ============================================
-- 5. RLS Policies
-- ============================================

-- Enable RLS on new tables
ALTER TABLE user_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_taste_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_similarity ENABLE ROW LEVEL SECURITY;

-- User interactions: users can only see/create their own
CREATE POLICY "Users can view own interactions"
    ON user_interactions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own interactions"
    ON user_interactions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Taste profiles: users can view their own
CREATE POLICY "Users can view own taste profile"
    ON user_taste_profiles FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can manage taste profiles (for edge functions)
CREATE POLICY "Service role can manage taste profiles"
    ON user_taste_profiles FOR ALL
    USING (auth.role() = 'service_role');

-- Friend similarity: users can view their own friendships
CREATE POLICY "Users can view own friend similarities"
    ON friend_similarity FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can manage friend similarities
CREATE POLICY "Service role can manage friend similarities"
    ON friend_similarity FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================
-- 6. Helper function for cosine similarity
-- ============================================
-- Used for computing taste similarity in SQL if needed

CREATE OR REPLACE FUNCTION cosine_similarity(a JSONB, b JSONB)
RETURNS DECIMAL AS $$
DECLARE
    dot_product DECIMAL := 0;
    norm_a DECIMAL := 0;
    norm_b DECIMAL := 0;
    i INT;
    len INT;
BEGIN
    -- Handle null or empty arrays
    IF a IS NULL OR b IS NULL THEN
        RETURN 0;
    END IF;
    
    len := jsonb_array_length(a);
    IF len = 0 OR len != jsonb_array_length(b) THEN
        RETURN 0;
    END IF;
    
    FOR i IN 0..(len - 1) LOOP
        dot_product := dot_product + (a->i)::DECIMAL * (b->i)::DECIMAL;
        norm_a := norm_a + (a->i)::DECIMAL * (a->i)::DECIMAL;
        norm_b := norm_b + (b->i)::DECIMAL * (b->i)::DECIMAL;
    END LOOP;
    
    IF norm_a = 0 OR norm_b = 0 THEN
        RETURN 0;
    END IF;
    
    RETURN dot_product / (sqrt(norm_a) * sqrt(norm_b));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- 7. Trigger to update updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_taste_profiles_updated_at
    BEFORE UPDATE ON user_taste_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
