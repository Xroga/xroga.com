import { getSecret } from '../config/envSecrets.js';

export interface YoutubeVideoResult {
  id: string;
  title: string;
  channelTitle: string;
  thumbnailUrl?: string;
  url: string;
  description?: string;
}

interface YoutubeSearchResponse {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
      description?: string;
      thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
    };
  }>;
}

/** Search YouTube via Data API v3 — requires YOUTUBE_API_KEY on Fly.io */
export async function searchYoutubeVideos(
  query: string,
  maxResults = 5
): Promise<YoutubeVideoResult[]> {
  const apiKey = getSecret('YOUTUBE_API_KEY');
  if (!apiKey || !query.trim()) return [];

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('q', query.trim());
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', String(Math.min(maxResults, 10)));
  url.searchParams.set('key', apiKey);
  url.searchParams.set('relevanceLanguage', 'en');
  url.searchParams.set('safeSearch', 'moderate');

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) {
      console.warn('[youtubeSearch]', res.status, await res.text().catch(() => ''));
      return [];
    }

    const data = (await res.json()) as YoutubeSearchResponse;
    return (data.items ?? [])
      .filter((item) => item.id?.videoId && item.snippet?.title)
      .map((item) => ({
        id: item.id!.videoId!,
        title: item.snippet!.title!,
        channelTitle: item.snippet!.channelTitle ?? 'YouTube',
        thumbnailUrl:
          item.snippet!.thumbnails?.medium?.url ?? item.snippet!.thumbnails?.default?.url,
        url: `https://www.youtube.com/watch?v=${item.id!.videoId}`,
        description: item.snippet!.description?.slice(0, 200),
      }));
  } catch (err) {
    console.warn('[youtubeSearch]', (err as Error).message);
    return [];
  }
}
