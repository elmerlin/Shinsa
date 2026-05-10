import type { ApiClient } from './client';
import type { ActivityItem, Comment, FeedItem, Post } from './types';

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
    post(id: string) {
      return client.request<Post>(`/api/social/posts/${id}`);
    },
    comments(postId: string) {
      return client.request<Comment[]>(`/api/social/posts/${postId}/comments`);
    },
  };
}

export type SocialApi = ReturnType<typeof createSocialApi>;
