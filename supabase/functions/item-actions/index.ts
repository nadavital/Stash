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

    const { item_id, action } = await req.json();

    if (!item_id || !action) {
      return new Response(
        JSON.stringify({ error: 'item_id and action are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createSupabaseClient(req.headers.get('Authorization')!);

    // Verify the item belongs to the user
    const { data: item, error: itemError } = await supabase
      .from('stash_items')
      .select('id, user_id')
      .eq('id', item_id)
      .single();

    if (itemError || !item) {
      return new Response(
        JSON.stringify({ error: 'Item not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (item.user_id !== userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Perform the action
    let updateData: any = {};

    switch (action) {
      case 'delete':
        // Delete the item
        const { error: deleteError } = await supabase
          .from('stash_items')
          .delete()
          .eq('id', item_id);

        if (deleteError) {
          throw deleteError;
        }

        return new Response(
          JSON.stringify({ success: true, action: 'deleted' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      case 'like':
        updateData = { is_liked: true };
        break;

      case 'unlike':
        updateData = { is_liked: false };
        break;

      case 'done':
        updateData = { is_done: true };
        break;

      case 'undone':
        updateData = { is_done: false };
        break;

      case 'open':
        updateData = { opened_at: new Date().toISOString() };
        break;

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Update the item
    const { error: updateError } = await supabase
      .from('stash_items')
      .update(updateData)
      .eq('id', item_id);

    if (updateError) {
      throw updateError;
    }

    return new Response(
      JSON.stringify({ success: true, action }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in item-actions:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
