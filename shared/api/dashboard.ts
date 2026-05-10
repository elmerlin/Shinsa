import type { ApiClient } from './client';
import type { DashboardResponse } from './types';

export function createDashboardApi(client: ApiClient) {
  return {
    get() {
      return client.request<DashboardResponse>('/api/dashboard');
    },
  };
}

export type DashboardApi = ReturnType<typeof createDashboardApi>;
