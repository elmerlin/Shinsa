/**
 * YouTube URL helpers — mirrors `client/src/utils/youtube.js` so mobile
 * recognises the same URL shapes (watch, youtu.be, shorts, embed, live) and
 * passes through start/end timestamps.
 */

function parseTimeValue(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return parseInt(raw, 10) || 0;

  const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match) return 0;
  const hours = parseInt(match[1], 10) || 0;
  const minutes = parseInt(match[2], 10) || 0;
  const seconds = parseInt(match[3], 10) || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

function extractVideoIdFromString(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/
  );
  if (match?.[1]) return match[1];
  return /^[a-zA-Z0-9_-]{11}$/.test(raw) ? raw : '';
}

export interface ParsedYouTube {
  videoId: string;
  startSeconds: number;
  endSeconds: number;
}

export function parseYouTubeUrl(value: unknown): ParsedYouTube {
  const raw = String(value || '').trim();
  if (!raw) return { videoId: '', startSeconds: 0, endSeconds: 0 };

  const fallbackVideoId = extractVideoIdFromString(raw);
  let startSeconds = 0;
  let endSeconds = 0;

  try {
    const url = new URL(raw);
    const hostname = String(url.hostname || '').toLowerCase();
    const pathParts = String(url.pathname || '').split('/').filter(Boolean);
    let videoId = '';

    if (hostname === 'youtu.be') {
      videoId = pathParts[0] || '';
    } else if (pathParts[0] === 'watch') {
      videoId = url.searchParams.get('v') || '';
    } else if (['embed', 'shorts', 'live'].includes(pathParts[0])) {
      videoId = pathParts[1] || '';
    }

    const hashParams = new URLSearchParams(String(url.hash || '').replace(/^#/, ''));
    startSeconds = parseTimeValue(
      url.searchParams.get('start') || url.searchParams.get('t') || hashParams.get('t')
    );
    endSeconds = parseTimeValue(url.searchParams.get('end'));

    return { videoId: videoId || fallbackVideoId, startSeconds, endSeconds };
  } catch {
    return { videoId: fallbackVideoId, startSeconds, endSeconds };
  }
}

export function buildYouTubeEmbedSrc(value: unknown, options: { autoplay?: boolean } = {}): string {
  const { autoplay = false } = options;
  const parsed = parseYouTubeUrl(value);
  if (!parsed.videoId) return '';

  const params = new URLSearchParams();
  if (parsed.startSeconds > 0) params.set('start', String(parsed.startSeconds));
  if (parsed.endSeconds > parsed.startSeconds) params.set('end', String(parsed.endSeconds));
  if (autoplay) params.set('autoplay', '1');
  params.set('playsinline', '1');
  params.set('rel', '0');

  const query = params.toString();
  // youtube.com/embed has wider compatibility than youtube-nocookie.com —
  // a chunk of uploads (especially live/replay clips) refuse to embed on
  // nocookie and surface the "Video unavailable / error 153" UI in the
  // mobile WebView. youtube.com still strips most tracking when embedded
  // and is what the desktop iframe uses anyway.
  return `https://www.youtube.com/embed/${parsed.videoId}${query ? `?${query}` : ''}`;
}

export function buildYouTubeThumbnailUrl(value: unknown): string {
  const parsed = parseYouTubeUrl(value);
  if (!parsed.videoId) return '';
  return `https://i.ytimg.com/vi/${parsed.videoId}/hqdefault.jpg`;
}
