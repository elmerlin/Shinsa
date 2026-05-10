import type { ApiClient } from './client';
import type { Notice } from './types';

export function createNoticesApi(client: ApiClient) {
  return {
    list() {
      return client.request<Notice[]>('/api/notices');
    },
  };
}

export type NoticesApi = ReturnType<typeof createNoticesApi>;
