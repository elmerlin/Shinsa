import {
  ApiClient,
  createAuthApi,
  createCheckinsApi,
  createDashboardApi,
  createExternalApi,
  createFridgeApi,
  createHealthApi,
  createLiveApi,
  createMessagesApi,
  createNoticesApi,
  createPetsApi,
  createPiugameApi,
  createSocialApi,
  createSongsApi,
  createTournamentsApi,
  createWeeklyChallengesApi,
  createYoutubeApi,
} from '@shared/api';
import { getToken } from '@/lib/storage';

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

export const apiClient = new ApiClient({
  baseUrl,
  getAuthToken: getToken,
});

export const authApi = createAuthApi(apiClient);
export const checkinsApi = createCheckinsApi(apiClient);
export const dashboardApi = createDashboardApi(apiClient);
export const songsApi = createSongsApi(apiClient);
export const tournamentsApi = createTournamentsApi(apiClient);
export const socialApi = createSocialApi(apiClient);
export const noticesApi = createNoticesApi(apiClient);
export const liveApi = createLiveApi(apiClient);
export const messagesApi = createMessagesApi(apiClient);
export const petsApi = createPetsApi(apiClient);
export const piugameApi = createPiugameApi(apiClient);
export const weeklyChallengesApi = createWeeklyChallengesApi(apiClient);
export const youtubeApi = createYoutubeApi(apiClient);
export const externalApi = createExternalApi(apiClient);
export const healthApi = createHealthApi(apiClient);
export const fridgeApi = createFridgeApi(apiClient);

export const apiBaseUrl = baseUrl.replace(/\/$/, '');
