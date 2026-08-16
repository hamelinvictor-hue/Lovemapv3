export interface AssociatedMedia {
  id: string;
  type: 'music';
  title: string;
  artistOrDirector?: string;
  coverUrl?: string;
  previewUrl?: string;
  externalUrl?: string;
}

/**
 * Searches music using iTunes API & handles Spotify track links / search
 */
export async function searchMusic(query: string): Promise<AssociatedMedia[]> {
  if (!query || query.trim().length < 2) return [];

  // Check if it's a Spotify URL directly
  if (query.includes('spotify.com/track/')) {
    try {
      const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(query.trim())}`);
      if (res.ok) {
        const data = await res.json();
        return [
          {
            id: 'spotify_' + Date.now(),
            type: 'music',
            title: data.title || 'Titre Spotify',
            artistOrDirector: data.author_name || 'Spotify',
            coverUrl: data.thumbnail_url || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300',
            externalUrl: query.trim(),
          },
        ];
      }
    } catch (e) {
      console.warn('Spotify oEmbed fetch failed, falling back to iTunes search', e);
    }
  }

  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=10`);
    if (!res.ok) return [];

    const data = await res.json();
    if (!data.results) return [];

    return data.results.map((item: any) => ({
      id: `itunes_song_${item.trackId}`,
      type: 'music' as const,
      title: item.trackName,
      artistOrDirector: item.artistName,
      coverUrl: item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '600x600bb') : undefined,
      previewUrl: item.previewUrl,
      externalUrl: item.trackViewUrl || `https://open.spotify.com/search/${encodeURIComponent(item.trackName + ' ' + item.artistName)}`,
    }));
  } catch (err) {
    console.error('Error searching music:', err);
    return [];
  }
}

