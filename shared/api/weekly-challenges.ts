import type { ApiClient } from './client';
import type { WeeklyChallengesHome } from './types';

export function createWeeklyChallengesApi(client: ApiClient) {
  return {
    home() {
      return client.request<WeeklyChallengesHome>('/api/weekly-challenges/home');
    },
  };
}

export type WeeklyChallengesApi = ReturnType<typeof createWeeklyChallengesApi>;
