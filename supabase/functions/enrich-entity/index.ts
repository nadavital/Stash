import { createSupabaseClient } from '../_shared/supabase-client.ts';
import { enrichUrl, generateEmbedding } from '../_shared/gemini-client.ts';
import { corsHeaders } from '../_shared/types.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { item_id, url } = await req.json();

    if (!item_id || !url) {
      return new Response(
        JSON.stringify({ error: 'item_id and url are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createSupabaseClient();

    // Fetch URL metadata
    let title: string | null = null;
    let description: string | null = null;
    let textSnippet: string | null = null;
    let imageUrl: string | null = null;
    let urlHint: string | null = null;

    // Detect URL type from domain - force entity type for known music services
    const hostname = new URL(url).hostname;
    let forcedEntityType: 'song' | 'event' | null = null;

    if (hostname.includes('music.apple.com') || hostname.includes('spotify.com')) {
      urlHint = 'This is a music streaming link';
      forcedEntityType = 'song'; // Force song type for music services
    } else if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      urlHint = 'This is a video link';
    } else if (hostname.includes('eventbrite.com') || hostname.includes('ticketmaster.com')) {
      urlHint = 'This is an event/ticket link';
      forcedEntityType = 'event'; // Force event type for ticket services
    }

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
      // New entity - call Gemini to enrich
      console.log('Calling Gemini with:', { url, title, description, urlHint });
      const enrichment = await enrichUrl(url, title, description, textSnippet, urlHint);
      console.log('Gemini enrichment result:', enrichment);

      // Generate embedding
      const embeddingText = `${enrichment.clean_title} ${enrichment.summary} ${enrichment.tags.join(' ')}`;
      const embedding = await generateEmbedding(embeddingText);
      // Create new entity
      const { data: newEntity, error: entityError } = await supabase
        .from('entities')
        .insert({
          type: enrichment.entity_type,
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
