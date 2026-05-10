import type { ApiClient } from './client';
import type {
  ActivityItem,
  Comment,
  DailyHighlights,
  FeedItem,
  Post,
  PumpResponse,
  SongOfWeekItem,
  WeeklyChallengesHome,
} from './types';

export interface FeedParams {
  page?: number;
}

export function createSocialApi(client: ApiClient) {
  return {
    feed(params: FeedParams = {}) {
      const search = new URLSearchParams();
      if (params.page) search.set('page', String(params.page));
      const qs = search.toString();
      return client.request<FeedItem[]>(`/api/social/feed${qs ? `?${qs}` : ''}`);
    },
    recentActivity() {
      return client.request<ActivityItem[]>('/api/social/recent-activity');
    },
    dailyHighlights() {
      return client.request<DailyHighlights>('/api/social/daily-highlights');
    },
    songOfWeekFeed(scope: 'global' | 'following' | 'me' = 'global') {
      return client.request<SongOfWeekItem[]>(`/api/social/song-of-week?scope=${encodeURIComponent(scope)}`);
    },
    post(id: string) {
      return client.request<Post>(`/api/social/posts/${id}`);
    },
    comments(postId: string) {
      return client.request<Comment[]>(`/api/social/posts/${postId}/comments`);
    },
    // Toggle pump on a feed item. All return { pumped, pump_count }.
    pumpPost(id: string) {
      return client.request<PumpResponse>(`/api/social/posts/${id}/pump`, { method: 'POST' });
    },
    pumpUpscore(id: string) {
      return client.request<PumpResponse>(`/api/social/upscores/${id}/pump`, { method: 'POST' });
    },
    pumpClear(id: string) {
      return client.request<PumpResponse>(`/api/social/clears/${id}/pump`, { method: 'POST' });
    },
    pumpWeeklyChallengePlay(id: string) {
      return client.request<PumpResponse>(`/api/social/weekly-challenge-plays/${id}/pump`, { method: 'POST' });
    },
  };
}

export type SocialApi = ReturnType<typeof createSocialApi>;
