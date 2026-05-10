import type { ApiClient } from './client';
import type { ChartDetailResponse, Song } from './types';

export interface SongsListParams {
  q?: string;
  limit?: number;
  offset?: number;
}

export function createSongsApi(client: ApiClient) {
  return {
    list(params: SongsListParams = {}) {
      const search = new URLSearchParams();
      if (params.q) search.set('q', params.q);
      if (typeof params.limit === 'number') search.set('limit', String(params.limit));
      if (typeof params.offset === 'number') search.set('offset', String(params.offset));
      const qs = search.toString();
      return client.request<Song[]>(`/api/songs${qs ? `?${qs}` : ''}`);
    },
    chartDetail(chartId: number | string) {
      return client.request<ChartDetailResponse>(`/api/songs/chart/${chartId}`);
    },
  };
}

export type SongsApi = ReturnType<typeof createSongsApi>;
