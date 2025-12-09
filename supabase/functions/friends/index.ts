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

    const supabase = createSupabaseClient(req.headers.get('Authorization')!);

    // GET - List friends
    if (req.method === 'GET') {
      const { data: friendships, error } = await supabase
        .from('friendships')
        .select('friend_id')
        .eq('user_id', userId)
        .eq('status', 'accepted');

      if (error) {
        console.error('Error fetching friendships:', error);
        throw error;
      }

      if (!friendships || friendships.length === 0) {
        return new Response(
          JSON.stringify({ friends: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get friend details
      const friendIds = friendships.map(f => f.friend_id);
      const { data: friends, error: friendsError } = await supabase
        .from('app_users')
        .select('user_id, handle, name')
        .in('user_id', friendIds);

      if (friendsError) {
        console.error('Error fetching friend details:', friendsError);
        throw friendsError;
      }

      // Get taste similarity data for all friends
      const { data: similarities } = await supabase
        .from('friend_similarity')
        .select('friend_id, similarity_score, common_interests')
        .eq('user_id', userId)
        .in('friend_id', friendIds);

      // Create a map for quick lookup
      const similarityMap = new Map(
        (similarities || []).map(s => [s.friend_id, {
          similarity_score: s.similarity_score,
          common_interests: s.common_interests
        }])
      );

      // Enrich friends with similarity data
      const enrichedFriends = (friends || []).map(friend => ({
        ...friend,
        taste_similarity: similarityMap.get(friend.user_id) || null
      }));

      return new Response(
        JSON.stringify({ friends: enrichedFriends }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST - Add friend or accept request
    if (req.method === 'POST') {
      const { action, friend_handle } = await req.json();

      if (!friend_handle) {
        return new Response(
          JSON.stringify({ error: 'friend_handle is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Find friend by handle
      const { data: friend, error: friendError } = await supabase
        .from('app_users')
        .select('user_id, handle, name')
        .eq('handle', friend_handle)
        .single();

      if (friendError || !friend) {
        return new Response(
          JSON.stringify({ error: 'User not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (friend.user_id === userId) {
        return new Response(
          JSON.stringify({ error: 'Cannot add yourself as a friend' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if friendship already exists
      const { data: existing } = await supabase
        .from('friendships')
        .select('*')
        .or(`and(user_id.eq.${userId},friend_id.eq.${friend.user_id}),and(user_id.eq.${friend.user_id},friend_id.eq.${userId})`)
        .single();

      if (existing) {
        return new Response(
          JSON.stringify({ error: 'Friendship already exists' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create friend request (for now, auto-accept)
      // In production, you'd create a pending request and the other user would accept
      const { error: insertError } = await supabase
        .from('friendships')
        .insert([
          { user_id: userId, friend_id: friend.user_id, status: 'accepted' },
          { user_id: friend.user_id, friend_id: userId, status: 'accepted' }
        ]);

      if (insertError) {
        throw insertError;
      }

      return new Response(
        JSON.stringify({ success: true, friend }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // DELETE - Remove friend
    if (req.method === 'DELETE') {
      const { friend_id } = await req.json();

      if (!friend_id) {
        return new Response(
          JSON.stringify({ error: 'friend_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Delete both sides of the friendship
      const { error } = await supabase
        .from('friendships')
        .delete()
        .or(`and(user_id.eq.${userId},friend_id.eq.${friend_id}),and(user_id.eq.${friend_id},friend_id.eq.${userId})`);

      if (error) {
        throw error;
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in friends function:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
