import type { ApiClient } from './client';
import type { ChartDetailResponse, Song, SongLibraryResponse } from './types';

export interface SongsListParams {
  q?: string;
  limit?: number;
  offset?: number;
}

export interface SongsLibraryParams {
  user_id?: string;
  search?: string;
  mode?: string;
  level?: string | number;
}

export function createSongsApi(client: ApiClient) {
  return {
    /** Chart-level list (one row per chart). Prefer `library` for grouped views. */
    list(params: SongsListParams = {}) {
      const search = new URLSearchParams();
      if (params.q) search.set('q', params.q);
      if (typeof params.limit === 'number') search.set('limit', String(params.limit));
      if (typeof params.offset === 'number') search.set('offset', String(params.offset));
      const qs = search.toString();
      return client.request<Song[]>(`/api/songs${qs ? `?${qs}` : ''}`);
    },
    /** Songs grouped by song_group_key with embedded charts. Used by the songs page. */
    library(params: SongsLibraryParams = {}) {
      const search = new URLSearchParams();
      if (params.user_id) search.set('user_id', params.user_id);
      if (params.search) search.set('search', params.search);
      if (params.mode) search.set('mode', params.mode);
      if (params.level !== undefined && params.level !== null && String(params.level) !== '')
        search.set('level', String(params.level));
      const qs = search.toString();
      return client.request<SongLibraryResponse>(`/api/songs/library${qs ? `?${qs}` : ''}`);
    },
    chartDetail(chartId: number | string) {
      return client.request<ChartDetailResponse>(`/api/songs/chart/${chartId}`);
    },
  };
}

export type SongsApi = ReturnType<typeof createSongsApi>;
