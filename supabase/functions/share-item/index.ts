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

    const { item_id, friend_id, note } = await req.json();

    if (!item_id || !friend_id) {
      return new Response(
        JSON.stringify({ error: 'item_id and friend_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createSupabaseClient(req.headers.get('Authorization')!);

    // Verify the item belongs to the user
    const { data: item, error: itemError } = await supabase
      .from('stash_items')
      .select('id, entity_id')
      .eq('id', item_id)
      .eq('user_id', userId)
      .single();

    if (itemError || !item) {
      return new Response(
        JSON.stringify({ error: 'Item not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify friendship exists
    const { data: friendship, error: friendError } = await supabase
      .from('friendships')
      .select('*')
      .eq('user_id', userId)
      .eq('friend_id', friend_id)
      .eq('status', 'accepted')
      .single();

    if (friendError || !friendship) {
      return new Response(
        JSON.stringify({ error: 'Not friends with this user' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create a new stash item for the friend, pointing to the same entity
    const { data: newItem, error: createError } = await supabase
      .from('stash_items')
      .insert({
        user_id: friend_id,
        entity_id: item.entity_id,
        source: 'friend_link',
        from_user_id: userId,
        note: note || null,
        status: 'unopened',
      })
      .select()
      .single();

    if (createError) {
      throw createError;
    }

    return new Response(
      JSON.stringify({ success: true, shared_item_id: newItem.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in share-item:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
