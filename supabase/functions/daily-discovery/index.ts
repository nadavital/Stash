import { createSupabaseClient, getUserIdFromRequest } from '../_shared/supabase-client.ts';
import { generateEmbedding } from '../_shared/gemini-client.ts';
import { corsHeaders } from '../_shared/types.ts';
import { cosineSimilarity, parseEmbedding } from '../_shared/vector-utils.ts';

// Curated RSS feeds by category
const RSS_FEEDS: Record<string, string[]> = {
  tech: [
    'https://techcrunch.com/feed/',
    'https://www.theverge.com/rss/index.xml',
    'https://www.wired.com/feed/rss',
  ],
  music: [
    'https://pitchfork.com/rss/reviews/albums/',
    'https://www.stereogum.com/feed/',
  ],
  cooking: [
    'https://www.bonappetit.com/feed/rss',
    'https://www.seriouseats.com/rss/recipes.xml',
  ],
  design: [
    'https://www.designboom.com/feed/',
    'https://www.itsnicethat.com/feed',
  ],
  culture: [
    'https://www.newyorker.com/feed/culture',
    'https://www.theatlantic.com/feed/all/',
  ],
};

// Thresholds for discovery
const TASTE_MATCH_THRESHOLD = 0.3; // Minimum similarity to user's taste
const FRIEND_SIMILARITY_THRESHOLD = 0.6; // High-similarity friends only
const MAX_DISCOVERIES = 10; // Total discoveries to return

interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  category: string;
}

interface Discovery {
  source_url: string;
  title: string;
  description: string;
  category: string;
  relevance_score: number;
  embedding?: number[];
  discovered_at: string;
  source_type: 'rss' | 'friend';
  friend_id?: string;
}

// Simple RSS parser (no dependencies)
async function parseRSS(url: string): Promise<RSSItem[]> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Stash/1.0' }
    });

    if (!response.ok) {
      console.error(`❌ Failed to fetch RSS: ${url} - ${response.status}`);
      return [];
    }

    const xml = await response.text();
    const items: RSSItem[] = [];

    // Extract items using regex (simple but works for standard RSS)
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const matches = xml.matchAll(itemRegex);

    for (const match of matches) {
      const itemXml = match[1];

      const title = itemXml.match(/<title>(.*?)<\/title>/)?.[1] || '';
      const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || '';
      const description = itemXml.match(/<description>(.*?)<\/description>/)?.[1] || '';
      const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';

      if (title && link) {
        items.push({
          title: title.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim(),
          link: link.trim(),
          description: description.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim(),
          pubDate,
          category: '', // Will be set by caller
        });
      }
    }

    return items.slice(0, 20); // Limit to 20 items per feed
  } catch (error) {
    console.error(`❌ Error parsing RSS ${url}:`, error);
    return [];
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

    console.log('🔍 Generating daily discoveries for user:', userId);

    const supabase = createSupabaseClient();

    // Fetch user's taste profile
    const { data: tasteProfile } = await supabase
      .from('user_taste_profiles')
      .select('taste_embedding, top_categories, entity_type_preferences')
      .eq('user_id', userId)
      .single();

    if (!tasteProfile?.taste_embedding) {
      console.log('⚠️ No taste profile found - returning empty discoveries');
      return new Response(
        JSON.stringify({ discoveries: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userTasteEmbedding = parseEmbedding(tasteProfile.taste_embedding);
    if (!userTasteEmbedding) {
      console.error('❌ Failed to parse user taste embedding');
      return new Response(
        JSON.stringify({ discoveries: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🧠 User taste profile loaded');
    console.log('  - Top categories:', Object.keys(tasteProfile.top_categories || {}).slice(0, 3).join(', '));

    // Determine which RSS feeds to fetch based on user's top interests
    const topCategories = Object.keys(tasteProfile.top_categories || {}).slice(0, 3);
    const feedsToFetch: Array<{ url: string; category: string }> = [];

    for (const category of topCategories) {
      const categoryLower = category.toLowerCase();
      for (const [feedCategory, urls] of Object.entries(RSS_FEEDS)) {
        if (categoryLower.includes(feedCategory) || feedCategory.includes(categoryLower)) {
          urls.forEach(url => feedsToFetch.push({ url, category: feedCategory }));
        }
      }
    }

    // Always include some general feeds
    if (feedsToFetch.length === 0) {
      feedsToFetch.push(
        { url: RSS_FEEDS.tech[0], category: 'tech' },
        { url: RSS_FEEDS.culture[0], category: 'culture' }
      );
    }

    console.log(`📡 Fetching ${feedsToFetch.length} RSS feeds for categories:`, [...new Set(feedsToFetch.map(f => f.category))]);

    // Fetch all RSS feeds in parallel
    const feedPromises = feedsToFetch.map(async ({ url, category }) => {
      const items = await parseRSS(url);
      return items.map(item => ({ ...item, category }));
    });

    const feedResults = await Promise.all(feedPromises);
    const allRSSItems = feedResults.flat();

    console.log(`📰 Fetched ${allRSSItems.length} total RSS items`);

    // Generate embeddings and score RSS items
    const rssDiscoveries: Discovery[] = [];

    for (const item of allRSSItems.slice(0, 30)) { // Limit to 30 items to avoid rate limits
      try {
        // Generate embedding for item title + description
        const itemText = `${item.title} ${item.description}`;
        const itemEmbedding = await generateEmbedding(itemText);

        // Score against user's taste
        const score = cosineSimilarity(userTasteEmbedding, itemEmbedding);

        if (score >= TASTE_MATCH_THRESHOLD) {
          rssDiscoveries.push({
            source_url: item.link,
            title: item.title,
            description: item.description.substring(0, 200),
            category: item.category,
            relevance_score: score,
            embedding: itemEmbedding,
            discovered_at: new Date().toISOString(),
            source_type: 'rss',
          });
        }
      } catch (error) {
        console.error(`❌ Error processing RSS item:`, error);
      }
    }

    console.log(`✅ Found ${rssDiscoveries.length} relevant RSS discoveries`);

    // Fetch friend discoveries (items saved by high-similarity friends)
    const { data: friends } = await supabase
      .from('user_friendships')
      .select(`
        friend:friend_id (
          id,
          stash_items!user_id (
            id,
            created_at,
            entities (
              id,
              title,
              summary,
              canonical_url,
              tags,
              embedding
            )
          )
        ),
        taste_similarity
      `)
      .eq('user_id', userId)
      .gte('taste_similarity', FRIEND_SIMILARITY_THRESHOLD);

    const friendDiscoveries: Discovery[] = [];

    if (friends && friends.length > 0) {
      console.log(`👥 Checking ${friends.length} high-similarity friends for discoveries`);

      for (const friendship of friends) {
        const friend = friendship.friend as any;
        if (!friend?.stash_items) continue;

        // Get friend's recent items (last 7 days)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const recentItems = friend.stash_items.filter((item: any) =>
          item.created_at >= sevenDaysAgo && item.entities?.embedding
        );

        for (const item of recentItems) {
          const itemEmbedding = parseEmbedding(item.entities.embedding);
          if (!itemEmbedding) continue;

          // Score against user's taste
          const score = cosineSimilarity(userTasteEmbedding, itemEmbedding);

          if (score >= TASTE_MATCH_THRESHOLD) {
            // Boost friend discoveries by 1.1x
            const boostedScore = score * 1.1;

            friendDiscoveries.push({
              source_url: item.entities.canonical_url || '',
              title: item.entities.title || 'Untitled',
              description: item.entities.summary || '',
              category: 'friend_recommendation',
              relevance_score: boostedScore,
              embedding: itemEmbedding,
              discovered_at: new Date().toISOString(),
              source_type: 'friend',
              friend_id: friend.id,
            });
          }
        }
      }

      console.log(`✅ Found ${friendDiscoveries.length} friend discoveries`);
    }

    // Combine and rank all discoveries
    const allDiscoveries = [...rssDiscoveries, ...friendDiscoveries]
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, MAX_DISCOVERIES);

    console.log(`🎯 Returning ${allDiscoveries.length} total discoveries`);
    console.log(`  - RSS: ${allDiscoveries.filter(d => d.source_type === 'rss').length}`);
    console.log(`  - Friend: ${allDiscoveries.filter(d => d.source_type === 'friend').length}`);

    // Store discoveries in database for feed integration
    if (allDiscoveries.length > 0) {
      const { error: insertError } = await supabase
        .from('ai_recommendations')
        .upsert(
          allDiscoveries.map(d => ({
            user_id: userId,
            source_url: d.source_url,
            title: d.title,
            description: d.description,
            category: d.category,
            relevance_score: d.relevance_score,
            embedding: d.embedding,
            discovered_at: d.discovered_at,
            status: 'pending',
            metadata: {
              source_type: d.source_type,
              friend_id: d.friend_id,
            }
          })),
          { onConflict: 'user_id,source_url' }
        );

      if (insertError) {
        console.error('⚠️ Error storing discoveries:', insertError);
        // Don't fail - still return discoveries
      } else {
        console.log('✅ Stored discoveries in database');
      }
    }

    return new Response(
      JSON.stringify({
        discoveries: allDiscoveries.map(d => ({
          source_url: d.source_url,
          title: d.title,
          description: d.description,
          category: d.category,
          relevance_score: d.relevance_score,
          source_type: d.source_type,
        }))
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in daily-discovery:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
