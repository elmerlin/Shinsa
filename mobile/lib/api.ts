import {
  ApiClient,
  createAuthApi,
  createDashboardApi,
  createNoticesApi,
  createSocialApi,
  createSongsApi,
  createTournamentsApi,
  createWeeklyChallengesApi,
} from '@shared/api';
import { getToken } from '@/lib/storage';

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

export const apiClient = new ApiClient({
  baseUrl,
  getAuthToken: getToken,
});

export const authApi = createAuthApi(apiClient);
export const dashboardApi = createDashboardApi(apiClient);
export const songsApi = createSongsApi(apiClient);
export const tournamentsApi = createTournamentsApi(apiClient);
export const socialApi = createSocialApi(apiClient);
export const noticesApi = createNoticesApi(apiClient);
export const weeklyChallengesApi = createWeeklyChallengesApi(apiClient);

export const apiBaseUrl = baseUrl.replace(/\/$/, '');
