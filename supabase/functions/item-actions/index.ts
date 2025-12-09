import { createSupabaseClient, getUserIdFromRequest } from '../_shared/supabase-client.ts';
import { corsHeaders } from '../_shared/types.ts';

// Actions that should trigger a taste profile recomputation
const TASTE_AFFECTING_ACTIONS = new Set(['like', 'unlike', 'dislike', 'undislike', 'done']);

// Log interaction for taste profile computation
async function logInteraction(
  supabase: ReturnType<typeof createSupabaseClient>,
  userId: string,
  itemId: string,
  entityId: string | null,
  eventType: string,
  metadata: Record<string, unknown> = {}
) {
  try {
    await supabase
      .from('user_interactions')
      .insert({
        user_id: userId,
        item_id: itemId,
        entity_id: entityId,
        event_type: eventType,
        metadata,
      });
    console.log(`📊 Logged interaction: ${eventType} for item ${itemId}`);
  } catch (error) {
    // Don't fail the action if logging fails
    console.error('Failed to log interaction:', error);
  }
}

// Trigger taste profile recomputation in the background
async function triggerTasteRecompute(userId: string) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !serviceKey) {
      console.error('Missing environment variables for taste recompute');
      return;
    }

    // Fire and forget - don't await
    fetch(`${supabaseUrl}/functions/v1/compute-taste-profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ user_id: userId }),
    }).then(response => {
      if (response.ok) {
        console.log('🧠 Taste profile recompute triggered successfully');
      } else {
        console.error('Taste profile recompute failed:', response.status);
      }
    }).catch(error => {
      console.error('Failed to trigger taste recompute:', error);
    });
  } catch (error) {
    console.error('Error triggering taste recompute:', error);
  }
}

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

    // Verify the item belongs to the user and get entity_id
    const { data: item, error: itemError } = await supabase
      .from('stash_items')
      .select('id, user_id, entity_id')
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
    let updateData: Record<string, unknown> = {};
    let interactionType: string | null = null;

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
        interactionType = 'like';
        break;

      case 'unlike':
        updateData = { is_liked: false };
        interactionType = 'unlike';
        break;
        
      case 'dislike':
        updateData = { disliked: true };
        interactionType = 'dislike';
        break;
        
      case 'undislike':
        updateData = { disliked: false };
        interactionType = 'undislike';
        break;

      case 'done':
        updateData = { is_done: true };
        interactionType = 'done';
        break;

      case 'undone':
        updateData = { is_done: false };
        interactionType = 'undone';
        break;

      case 'open':
        updateData = { opened_at: new Date().toISOString() };
        interactionType = 'open';
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
    
    // Log the interaction for taste profile
    if (interactionType) {
      await logInteraction(supabase, userId, item_id, item.entity_id, interactionType);
      
      // Trigger taste profile recompute for significant actions (non-blocking)
      if (TASTE_AFFECTING_ACTIONS.has(action)) {
        triggerTasteRecompute(userId);
      }
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
