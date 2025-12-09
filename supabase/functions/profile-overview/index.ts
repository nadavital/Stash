import { createSupabaseClient, getUserIdFromRequest } from '../_shared/supabase-client.ts';
import { corsHeaders } from '../_shared/types.ts';

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

    const supabase = createSupabaseClient();

    // Get user info
    const { data: user, error: userError } = await supabase
      .from('app_users')
      .select('handle, name')
      .eq('user_id', userId)
      .single();

    if (userError) {
      throw userError;
    }

    // Get user's items with entities
    const { data: items, error: itemsError } = await supabase
      .from('stash_items')
      .select(`
        id,
        entities (
          type,
          tags
        )
      `)
      .eq('user_id', userId)
      .not('entity_id', 'is', null);

    if (itemsError) {
      throw itemsError;
    }

    // Get user's taste profile
    const { data: tasteProfile } = await supabase
      .from('user_taste_profiles')
      .select('onboarding_interests, top_categories, entity_type_preferences, preferred_sources, last_computed_at')
      .eq('user_id', userId)
      .single();

    // Calculate stats
    const totalItems = items?.length || 0;

    // Count types
    const typeCounts: Record<string, number> = {
      article: 0,
      song: 0,
      event: 0,
      recipe: 0,
      generic: 0,
    };

    const tagCounts: Record<string, number> = {};

    (items || []).forEach(item => {
      if (item.entities) {
        // Count type
        typeCounts[item.entities.type] = (typeCounts[item.entities.type] || 0) + 1;

        // Count tags
        (item.entities.tags || []).forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    // Calculate type mix percentages
    const typeMix = {
      article: totalItems > 0 ? typeCounts.article / totalItems : 0,
      song: totalItems > 0 ? typeCounts.song / totalItems : 0,
      event: totalItems > 0 ? typeCounts.event / totalItems : 0,
      recipe: totalItems > 0 ? typeCounts.recipe / totalItems : 0,
      generic: totalItems > 0 ? typeCounts.generic / totalItems : 0,
    };

    // Get top tags (sorted by count, top 5)
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);

    // Extract taste profile data
    const tasteData = tasteProfile ? {
      onboarding_interests: tasteProfile.onboarding_interests || null,
      top_categories: tasteProfile.top_categories || {},
      entity_type_preferences: tasteProfile.entity_type_preferences || {},
      preferred_sources: tasteProfile.preferred_sources || [],
      last_computed_at: tasteProfile.last_computed_at,
    } : null;

    return new Response(
      JSON.stringify({
        name: user.name,
        handle: user.handle,
        stats: {
          total_items: totalItems,
          top_tags: topTags,
          type_mix: typeMix,
        },
        taste: tasteData,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in profile-overview:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
