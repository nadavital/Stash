// Direct API integrations for Spotify and Apple Music
// Much more efficient than Google Search grounding

const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID');
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET');

const APPLE_MUSIC_TEAM_ID = Deno.env.get('APPLE_MUSIC_TEAM_ID');
const APPLE_MUSIC_KEY_ID = Deno.env.get('APPLE_MUSIC_KEY_ID');
const APPLE_MUSIC_PRIVATE_KEY = Deno.env.get('APPLE_MUSIC_PRIVATE_KEY');

// Spotify Types
interface SpotifyTrack {
  id: string;  // Spotify ID
  name: string;
  artists: Array<{ name: string }>;
  album: {
    name: string;
    images: Array<{ url: string; height: number; width: number }>;
  };
  duration_ms: number;
  external_ids?: {
    isrc?: string;
  };
}

// Apple Music Types
interface AppleMusicTrack {
  id: string;  // Apple Music ID
  attributes: {
    name: string;
    artistName: string;
    albumName: string;
    artwork?: {
      url: string;  // Template: {w}x{h}bb.jpg
    };
    durationInMillis: number;
    isrc?: string;
  };
}

// ============================================================================
// SPOTIFY API
// ============================================================================

let spotifyAccessToken: string | null = null;
let spotifyTokenExpiry: number = 0;

/**
 * Get Spotify access token using Client Credentials flow
 * Tokens are cached for 1 hour
 */
async function getSpotifyAccessToken(): Promise<string> {
  // Return cached token if still valid
  if (spotifyAccessToken && Date.now() < spotifyTokenExpiry) {
    return spotifyAccessToken;
  }

  const credentials = btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`);

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error(`Spotify auth failed: ${response.statusText}`);
  }

  const data = await response.json();
  spotifyAccessToken = data.access_token;
  spotifyTokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // Refresh 1min early

  return spotifyAccessToken;
}

/**
 * Search Spotify for a track by ISRC
 * Returns null if not found
 */
export async function searchSpotifyByISRC(isrc: string): Promise<SpotifyTrack | null> {
  try {
    const token = await getSpotifyAccessToken();

    const response = await fetch(
      `https://api.spotify.com/v1/search?q=isrc:${isrc}&type=track&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      console.error(`Spotify search failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const track = data.tracks?.items?.[0];

    if (!track) {
      console.log(`No Spotify track found for ISRC: ${isrc}`);
      return null;
    }

    return track;
  } catch (error) {
    console.error('Spotify search error:', error);
    return null;
  }
}

/**
 * Get Spotify track by track ID
 */
export async function getSpotifyTrack(trackId: string): Promise<SpotifyTrack | null> {
  try {
    const token = await getSpotifyAccessToken();

    const response = await fetch(
      `https://api.spotify.com/v1/tracks/${trackId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      console.error(`Spotify track fetch failed: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Spotify track fetch error:', error);
    return null;
  }
}

// ============================================================================
// APPLE MUSIC API
// ============================================================================

let appleMusicToken: string | null = null;
let appleMusicTokenExpiry: number = 0;

/**
 * Generate Apple Music JWT token
 * Tokens are valid for 6 months but we refresh every 24 hours
 */
async function getAppleMusicToken(): Promise<string> {
  // Return cached token if still valid
  if (appleMusicToken && Date.now() < appleMusicTokenExpiry) {
    return appleMusicToken;
  }

  // Import JWT library (Deno-compatible)
  const { create } = await import('https://deno.land/x/djwt@v3.0.2/mod.ts');
  const { importPKCS8 } = await import('https://deno.land/x/jose@v5.9.6/key/import.ts');

  // Parse private key
  const privateKey = await importPKCS8(APPLE_MUSIC_PRIVATE_KEY!, 'ES256');

  // Create JWT
  const now = Math.floor(Date.now() / 1000);
  const jwt = await create(
    { alg: 'ES256', kid: APPLE_MUSIC_KEY_ID },
    {
      iss: APPLE_MUSIC_TEAM_ID,
      iat: now,
      exp: now + (6 * 30 * 24 * 60 * 60), // 6 months
    },
    privateKey
  );

  appleMusicToken = jwt;
  appleMusicTokenExpiry = Date.now() + (24 * 60 * 60 * 1000); // Refresh daily

  return jwt;
}

/**
 * Search Apple Music for a track by ISRC
 * Returns null if not found
 */
export async function searchAppleMusicByISRC(isrc: string): Promise<AppleMusicTrack | null> {
  try {
    const token = await getAppleMusicToken();

    const response = await fetch(
      `https://api.music.apple.com/v1/catalog/us/songs?filter[isrc]=${isrc}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      console.error(`Apple Music search failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const track = data.data?.[0];

    if (!track) {
      console.log(`No Apple Music track found for ISRC: ${isrc}`);
      return null;
    }

    return track;
  } catch (error) {
    console.error('Apple Music search error:', error);
    return null;
  }
}

/**
 * Get Apple Music track by track ID
 */
export async function getAppleMusicTrack(trackId: string): Promise<AppleMusicTrack | null> {
  try {
    const token = await getAppleMusicToken();

    const response = await fetch(
      `https://api.music.apple.com/v1/catalog/us/songs/${trackId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      console.error(`Apple Music track fetch failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.data?.[0] || null;
  } catch (error) {
    console.error('Apple Music track fetch error:', error);
    return null;
  }
}

// ============================================================================
// UNIFIED MUSIC ENRICHMENT
// ============================================================================

export interface MusicMetadata {
  track_name: string;  // Clean track title
  artist_name: string;
  album_name: string;
  album_art_url: string | null;
  duration_ms: number;
  isrc: string | null;
  spotify_id: string | null;
  apple_music_id: string | null;
}

/**
 * Get complete music metadata using direct API calls
 * Much faster and more reliable than Google Search grounding
 *
 * Strategy:
 * 1. If we have spotify_id → fetch from Spotify API
 * 2. If we have apple_music_id → fetch from Apple Music API
 * 3. Use ISRC to search the OTHER platform for cross-platform ID
 */
export async function getMusicMetadata(
  spotifyId?: string,
  appleMusicId?: string
): Promise<MusicMetadata | null> {
  let spotifyTrack: SpotifyTrack | null = null;
  let appleMusicTrack: AppleMusicTrack | null = null;
  let isrc: string | null = null;

  // Step 1: Get data from the platform we have an ID for
  if (spotifyId) {
    console.log(`Fetching Spotify track: ${spotifyId}`);
    spotifyTrack = await getSpotifyTrack(spotifyId);
    isrc = spotifyTrack?.external_ids?.isrc || null;
  } else if (appleMusicId) {
    console.log(`Fetching Apple Music track: ${appleMusicId}`);
    appleMusicTrack = await getAppleMusicTrack(appleMusicId);
    isrc = appleMusicTrack?.attributes?.isrc || null;
  }

  // Step 2: Use ISRC to get the other platform's ID
  if (isrc) {
    if (!spotifyTrack) {
      console.log(`Searching Spotify by ISRC: ${isrc}`);
      spotifyTrack = await searchSpotifyByISRC(isrc);
    }
    if (!appleMusicTrack) {
      console.log(`Searching Apple Music by ISRC: ${isrc}`);
      appleMusicTrack = await searchAppleMusicByISRC(isrc);
    }
  }

  // Step 3: Compile metadata from whichever source we have
  const metadata: MusicMetadata = {
    track_name: spotifyTrack?.name || appleMusicTrack?.attributes?.name || 'Unknown Track',
    artist_name: spotifyTrack?.artists?.[0]?.name || appleMusicTrack?.attributes?.artistName || 'Unknown Artist',
    album_name: spotifyTrack?.album?.name || appleMusicTrack?.attributes?.albumName || 'Unknown Album',
    album_art_url: getAlbumArtUrl(spotifyTrack, appleMusicTrack),
    duration_ms: spotifyTrack?.duration_ms || appleMusicTrack?.attributes?.durationInMillis || 0,
    isrc: isrc,
    spotify_id: spotifyTrack?.id || null,
    apple_music_id: appleMusicTrack?.id || null,
  };

  console.log('✅ Music metadata compiled:', {
    artist: metadata.artist_name,
    has_spotify: !!metadata.spotify_id,
    has_apple: !!metadata.apple_music_id,
    has_isrc: !!metadata.isrc,
  });

  return metadata;
}

/**
 * Get best album art URL (prefer higher resolution)
 */
function getAlbumArtUrl(
  spotifyTrack: SpotifyTrack | null,
  appleMusicTrack: AppleMusicTrack | null
): string | null {
  // Spotify images are sorted largest to smallest
  if (spotifyTrack?.album?.images?.[0]) {
    return spotifyTrack.album.images[0].url;
  }

  // Apple Music uses template URL - request 600x600
  if (appleMusicTrack?.attributes?.artwork?.url) {
    return appleMusicTrack.attributes.artwork.url
      .replace('{w}', '600')
      .replace('{h}', '600');
  }

  return null;
}
