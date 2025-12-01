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

    // Parse request body
    const { url, source = 'self', note } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabase = createSupabaseClient(req.headers.get('Authorization')!);

    // Insert stash item (entity_id will be filled by enrich-entity function)
    const { data: item, error: itemError } = await supabase
      .from('stash_items')
      .insert({
        user_id: userId,
        entity_id: null, // Will be filled by enrichment
        source,
        input_mode: 'url',
        note,
        status: 'unopened',
      })
      .select()
      .single();

    if (itemError) {
      console.error('Error creating item:', itemError);
      return new Response(
        JSON.stringify({ error: 'Failed to create item' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Trigger enrichment function and wait for it to complete
    console.log('Triggering enrichment for item:', item.id);
    try {
      const enrichResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/enrich-entity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': req.headers.get('Authorization')!,
        },
        body: JSON.stringify({
          item_id: item.id,
          url,
        }),
      });

      if (!enrichResponse.ok) {
        console.error('Enrichment failed:', await enrichResponse.text());
        throw new Error('Enrichment failed');
      }

      const enrichResult = await enrichResponse.json();
      console.log('🟢 Enrichment completed:', JSON.stringify(enrichResult, null, 2));

      // Return response with enriched entity and debug info
      return new Response(
        JSON.stringify({
          item_id: item.id,
          status: 'enriched',
          entity_id: enrichResult.entity_id,
          debug_enrichment: enrichResult.debug, // Pass through the debug info from enrich-entity
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (enrichError) {
      console.error('Failed to enrich item:', enrichError);
      // Return the item anyway, but mark as failed
      return new Response(
        JSON.stringify({
          item_id: item.id,
          status: 'enrichment_failed',
          entity_id: null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Error in create-item:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
