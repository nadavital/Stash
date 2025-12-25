import { createSupabaseClient } from '../_shared/supabase-client.ts';
import { enrichUrl, enrichImage, generateEmbedding } from '../_shared/gemini-client.ts';
import { enrichMusicUrl, enrichVideoUrl } from '../_shared/enrichment-specialists.ts';
import { corsHeaders } from '../_shared/types.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const enrichmentStartTime = Date.now();
    const { item_id, url, imageBase64 } = await req.json();

    if (!item_id || (!url && !imageBase64)) {
      console.log('❌ [enrich-entity] Missing required fields');
      return new Response(
        JSON.stringify({ error: 'item_id and (url or imageBase64) are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createSupabaseClient();
    const mode = imageBase64 ? 'image' : 'url';

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'enrichment_started',
      item_id,
      mode,
      url: url ? url.substring(0, 100) : undefined,
      image_size: imageBase64 ? imageBase64.length : undefined,
    }));

    // IMAGE ANALYSIS PATH
    if (imageBase64) {
      const geminiStartTime = Date.now();
      console.log(`🖼️  [enrich-entity] Processing image for item: ${item_id}, size: ${imageBase64.length} chars`);

      // Call Gemini Vision to analyze image
      const enrichment = await enrichImage(imageBase64);
      const geminiDuration = Date.now() - geminiStartTime;

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'gemini_vision_completed',
        item_id,
        duration_ms: geminiDuration,
        entity_type: enrichment.entity_type,
        title: enrichment.clean_title,
      }));

      // Generate embedding
      console.log(`🧠 [enrich-entity] Generating embedding for item: ${item_id}`);
      const embeddingText = `${enrichment.clean_title} ${enrichment.summary} ${enrichment.tags.join(' ')}`;
      const embedding = await generateEmbedding(embeddingText);

      // Use source URL from grounding if found, otherwise use pseudo-URL
      const canonicalUrl = enrichment.source_url || `stash://image/${item_id}`;
      const sourceName = enrichment.source_url
        ? new URL(enrichment.source_url).hostname
        : 'Image';

      if (enrichment.source_url) {
        console.log(`🔗 [enrich-entity] Source URL found via grounding: ${enrichment.source_url}`);
      }

      console.log(`💾 [enrich-entity] Creating entity for item: ${item_id}`);
      // Create new entity for image
      const { data: newEntity, error: entityError } = await supabase
        .from('entities')
        .insert({
          type: enrichment.entity_type,
          canonical_url: canonicalUrl,
          title: enrichment.clean_title,
          description: null,
          source_name: sourceName,
          image_url: null, // We don't store the actual image
          summary: enrichment.summary,
          primary_emoji: enrichment.primary_emoji,
          tags: enrichment.tags,
          embedding: JSON.stringify(embedding),
          suggested_prompts: enrichment.suggested_prompts,
          raw_metadata: enrichment.type_metadata || null,
        })
        .select()
        .single();

      if (entityError) {
        console.error(`❌ [enrich-entity] Entity creation failed:`, entityError);
        throw entityError;
      }

      // Update stash item with entity_id
      await supabase
        .from('stash_items')
        .update({ entity_id: newEntity.id })
        .eq('id', item_id);

      const totalDuration = Date.now() - enrichmentStartTime;

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'enrichment_completed',
        item_id,
        entity_id: newEntity.id,
        mode: 'image',
        total_duration_ms: totalDuration,
      }));

      return new Response(
        JSON.stringify({
          success: true,
          entity_id: newEntity.id,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // URL ANALYSIS PATH (existing logic)
    // Fetch URL metadata
    let title: string | null = null;
    let description: string | null = null;
    let textSnippet: string | null = null;
    let imageUrl: string | null = null;
    let urlHint: string | null = null;

    // LAYER 1: DETERMINISTIC URL PARSING - Extract platform IDs
    const hostname = new URL(url).hostname;
    let forcedEntityType: string | null = null;
    let parsedMetadata: any = {};

    // Music platforms
    if (hostname.includes('spotify.com')) {
      const spotifyMatch = url.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
      if (spotifyMatch) {
        parsedMetadata.spotify_id = spotifyMatch[1];
        urlHint = `Spotify track ID: ${spotifyMatch[1]}`;
        forcedEntityType = 'song';
      }
    } else if (hostname.includes('music.apple.com')) {
      // Apple Music URLs: https://music.apple.com/us/album/{album}/{album_id}?i={track_id}
      const appleMusicMatch = url.match(/[?&]i=(\d+)/);
      if (appleMusicMatch) {
        parsedMetadata.apple_music_id = appleMusicMatch[1];
        urlHint = `Apple Music track ID: ${appleMusicMatch[1]}`;
        forcedEntityType = 'song';
      }
    } else if (hostname.includes('podcasts.apple.com')) {
      // Apple Podcasts: https://podcasts.apple.com/us/podcast/{name}/id{podcast_id}?i={episode_id}
      const podcastMatch = url.match(/[?&]i=(\d+)/);
      const podcastIdMatch = url.match(/id(\d+)/);
      if (podcastMatch) {
        parsedMetadata.apple_podcast_episode_id = podcastMatch[1];
        if (podcastIdMatch) {
          parsedMetadata.apple_podcast_id = podcastIdMatch[1];
        }
        urlHint = `Apple Podcast episode ID: ${podcastMatch[1]}`;
        forcedEntityType = 'podcast';
      }
    }
    // Video platforms
    else if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      // YouTube: https://youtube.com/watch?v=abc123 or https://youtu.be/abc123
      let youtubeId = null;
      if (hostname.includes('youtu.be')) {
        const match = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
        youtubeId = match?.[1];
      } else {
        const match = url.match(/[?&]v=([a-zA-Z0-9_-]+)/);
        youtubeId = match?.[1];
      }

      if (youtubeId) {
        parsedMetadata.video_id = youtubeId;
        parsedMetadata.platform = 'youtube';

        if (url.includes('/shorts/')) {
          urlHint = `YouTube Short ID: ${youtubeId}`;
          forcedEntityType = 'youtube_short';
        } else {
          urlHint = `YouTube video ID: ${youtubeId}`;
          forcedEntityType = 'youtube_video';
        }
      }
    }
    // Events & Location
    else if (hostname.includes('eventbrite.com') || hostname.includes('ticketmaster.com') || hostname.includes('eventful.com')) {
      urlHint = 'Event/ticket platform';
      forcedEntityType = 'event';
    } else if (hostname.includes('maps.apple.com') || hostname.includes('maps.google.com')) {
      urlHint = 'Map/location link';
      forcedEntityType = 'location';
    }

    console.log('📍 URL parsing results:', {
      platform: hostname,
      forcedType: forcedEntityType,
      extractedIds: Object.keys(parsedMetadata)
    });

    try {
      const urlResponse = await fetch(url);
      const html = await urlResponse.text();

      // Extract title (try og:title first, then title tag)
      const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i);
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      title = ogTitleMatch ? ogTitleMatch[1] : (titleMatch ? titleMatch[1] : null);

      // Extract description (try og:description first, then meta description)
      const ogDescMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i);
      const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
      description = ogDescMatch ? ogDescMatch[1] : (descMatch ? descMatch[1] : null);

      // Extract image - try multiple patterns
      let ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i);
      if (!ogImageMatch) {
        // Try reversed order (content before property)
        ogImageMatch = html.match(/<meta\s+content=["'](.*?)["']\s+property=["']og:image["']/i);
      }
      if (!ogImageMatch) {
        // Try twitter:image as fallback
        ogImageMatch = html.match(/<meta\s+(?:name|property)=["']twitter:image["']\s+content=["'](.*?)["']/i);
      }
      imageUrl = ogImageMatch ? ogImageMatch[1] : null;

      console.log('Extracted metadata:', { title, description, imageUrl: imageUrl ? 'found' : 'null' });

      // Extract text snippet (first 500 chars of body text)
      const bodyMatch = html.match(/<body[^>]*>(.*?)<\/body>/is);
      if (bodyMatch) {
        const bodyText = bodyMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
        textSnippet = bodyText.substring(0, 500);
      }
    } catch (error) {
      console.error('Error fetching URL:', error);
    }

    // Check if entity already exists for this URL FIRST
    const { data: existingEntity } = await supabase
      .from('entities')
      .select('id, type, primary_emoji, image_url')
      .eq('canonical_url', url)
      .single();

    let entityId: string;

    if (existingEntity) {
      // Entity already exists - just reuse it, skip Gemini call
      console.log('✅ Entity already exists:', existingEntity.id, 'type:', existingEntity.type);
      entityId = existingEntity.id;
    } else {
      // New entity - SMART ROUTING to specialized enrichment
      console.log('🎯 Routing to specialist enricher:', { forcedType: forcedEntityType, parsedIds: Object.keys(parsedMetadata) });

      let enrichment;

      // Route to specialized enrichers for known types
      try {
        if (forcedEntityType === 'song') {
          console.log('🎵 Using music specialist');
          enrichment = await enrichMusicUrl(url, title, parsedMetadata);
        } else if (forcedEntityType === 'youtube_video' || forcedEntityType === 'youtube_short') {
          console.log('🎬 Using video specialist');
          enrichment = await enrichVideoUrl(url, title, parsedMetadata);
        } else {
          console.log('📄 Using generic enricher (fallback)');
          enrichment = await enrichUrl(url, title, description, textSnippet, urlHint, parsedMetadata);
        }
        console.log('✅ Enrichment result:', enrichment);
      } catch (specialistError) {
        console.error('❌ Specialist enrichment failed, falling back to generic:', specialistError);
        // Fallback to generic enricher if specialist fails
        enrichment = await enrichUrl(url, title, description, textSnippet, urlHint, parsedMetadata);
        console.log('✅ Generic fallback result:', enrichment);
      }

      // Use forced entity type if detected from URL
      const finalEntityType = forcedEntityType || enrichment.entity_type;

      // Merge parsed metadata with AI-generated metadata
      const finalMetadata = {
        ...parsedMetadata,  // Deterministic IDs (spotify_id, youtube_id, etc.)
        ...enrichment.type_metadata  // AI-generated metadata (artist, album, etc.)
      };

      // Generate embedding
      const embeddingText = `${enrichment.clean_title} ${enrichment.summary} ${enrichment.tags.join(' ')}`;
      const embedding = await generateEmbedding(embeddingText);
      
      // Create new entity with merged metadata (parsed IDs + AI enrichment)
      const { data: newEntity, error: entityError} = await supabase
        .from('entities')
        .insert({
          type: finalEntityType,
          canonical_url: url,
          title: enrichment.clean_title,
          description,
          source_name: new URL(url).hostname,
          image_url: imageUrl,
          summary: enrichment.summary,
          primary_emoji: enrichment.primary_emoji,
          tags: enrichment.tags,
          embedding: JSON.stringify(embedding),
          suggested_prompts: enrichment.suggested_prompts,
          raw_metadata: finalMetadata,  // Merged: parsed IDs + AI metadata
        })
        .select()
        .single();

      if (entityError) {
        throw entityError;
      }

      entityId = newEntity.id;
    }

    // Update stash item with entity_id
    await supabase
      .from('stash_items')
      .update({ entity_id: entityId })
      .eq('id', item_id);

    return new Response(
      JSON.stringify({
        success: true,
        entity_id: entityId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in enrich-entity:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
