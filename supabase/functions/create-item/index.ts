import { createSupabaseClient, getUserIdFromRequest } from '../_shared/supabase-client.ts';
import { corsHeaders } from '../_shared/types.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const requestStartTime = Date.now();

    // Get authenticated user
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      console.log('❌ [create-item] Unauthorized request');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { url, imageBase64, source = 'self', note } = await req.json();

    // Validate that we have either URL or image
    if (!url && !imageBase64) {
      console.log('❌ [create-item] Missing URL or imageBase64');
      return new Response(
        JSON.stringify({ error: 'URL or imageBase64 is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine input mode
    const inputMode = imageBase64 ? 'image' : 'url';

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'item_creation_started',
      user_id: userId,
      input_mode: inputMode,
      url: url ? url.substring(0, 100) : undefined,
      image_size: imageBase64 ? imageBase64.length : undefined,
      source,
      has_note: !!note,
    }));

    // Create Supabase client
    const supabase = createSupabaseClient(req.headers.get('Authorization')!);

    // URL MODE: Check for duplicates before creating
    if (url) {
      // First, check if entity already exists for this URL
      const { data: existingEntity } = await supabase
        .from('entities')
        .select('id')
        .eq('canonical_url', url)
        .maybeSingle();

      if (existingEntity) {
        console.log(`🔍 [create-item] Entity already exists for URL: ${existingEntity.id}`);

        // Check if user already has this entity in their stash
        const { data: existingItem } = await supabase
          .from('stash_items')
          .select('id')
          .eq('user_id', userId)
          .eq('entity_id', existingEntity.id)
          .maybeSingle();

        if (existingItem) {
          console.log(`⚠️ [create-item] User already saved this URL, returning existing item: ${existingItem.id}`);
          return new Response(
            JSON.stringify({
              item_id: existingItem.id,
              entity_id: existingEntity.id,
              status: 'already_saved',
              message: 'You already saved this item'
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Entity exists but user doesn't have it - create item without enrichment
        console.log(`✅ [create-item] Creating item with existing entity: ${existingEntity.id}`);
        const { data: newItem, error: newItemError } = await supabase
          .from('stash_items')
          .insert({
            user_id: userId,
            entity_id: existingEntity.id,
            source,
            input_mode: inputMode,
            note,
            status: 'unopened',
          })
          .select()
          .single();

        if (newItemError) {
          throw newItemError;
        }

        return new Response(
          JSON.stringify({
            item_id: newItem.id,
            entity_id: existingEntity.id,
            status: 'saved'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Insert stash item (entity_id will be filled by enrich-entity function)
    const { data: item, error: itemError } = await supabase
      .from('stash_items')
      .insert({
        user_id: userId,
        entity_id: null, // Will be filled by enrichment
        source,
        input_mode: inputMode,
        note,
        status: 'unopened',
      })
      .select()
      .single();

    if (itemError) {
      console.error('❌ [create-item] Error creating item:', itemError);
      return new Response(
        JSON.stringify({ error: 'Failed to create item' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ [create-item] Item created with ID: ${item.id}`);

    // Trigger enrichment function and wait for it to complete
    const enrichmentStartTime = Date.now();
    console.log(`🔄 [create-item] Triggering ${inputMode} enrichment for item: ${item.id}`);

    try {
      const enrichPayload = imageBase64
        ? { item_id: item.id, imageBase64 }
        : { item_id: item.id, url };

      const enrichResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/enrich-entity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': req.headers.get('Authorization')!,
        },
        body: JSON.stringify(enrichPayload),
      });

      if (!enrichResponse.ok) {
        const errorText = await enrichResponse.text();
        console.error(`❌ [create-item] Enrichment failed with status ${enrichResponse.status}:`, errorText);
        throw new Error(`Enrichment failed: ${errorText}`);
      }

      const enrichResult = await enrichResponse.json();
      const enrichmentDuration = Date.now() - enrichmentStartTime;
      const totalDuration = Date.now() - requestStartTime;

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'item_creation_completed',
        item_id: item.id,
        entity_id: enrichResult.entity_id,
        enrichment_duration_ms: enrichmentDuration,
        total_duration_ms: totalDuration,
        status: 'enriched',
      }));

      // Fetch the enriched entity to get the title
      const { data: entity } = await supabase
        .from('entities')
        .select('title')
        .eq('id', enrichResult.entity_id)
        .single();

      // Return response with enriched entity and debug info
      return new Response(
        JSON.stringify({
          item_id: item.id,
          status: 'enriched',
          entity_id: enrichResult.entity_id,
          title: entity?.title || null,
          debug_enrichment: enrichResult.debug, // Pass through the debug info from enrich-entity
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (enrichError) {
      const enrichmentDuration = Date.now() - enrichmentStartTime;

      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'enrichment_failed',
        item_id: item.id,
        enrichment_duration_ms: enrichmentDuration,
        error: enrichError.message,
      }));

      // CRITICAL FIX: Delete the orphaned item and return 500 error
      console.log(`🗑️  [create-item] Deleting orphaned item: ${item.id}`);
      await supabase
        .from('stash_items')
        .delete()
        .eq('id', item.id);

      return new Response(
        JSON.stringify({
          error: 'enrichment_failed',
          message: 'Could not analyze this content. Please try again.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
