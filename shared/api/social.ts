import type { ApiClient } from './client';
import type {
  ActivityItem,
  Comment,
  DailyHighlights,
  ExploreFeedResponse,
  FeedItem,
  Post,
  PumpResponse,
  SongOfWeekItem,
  WeeklyChallengesHome,
} from './types';

export type ExploreFeedScope = 'following' | 'global' | 'me';

export interface ExploreFeedParams {
  scope?: ExploreFeedScope;
  cursor?: string | null;
}

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
    exploreFeed(params: ExploreFeedParams = {}) {
      const search = new URLSearchParams();
      search.set('scope', params.scope || 'following');
      if (params.cursor) search.set('cursor', params.cursor);
      return client.request<ExploreFeedResponse>(`/api/social/feed/explore?${search.toString()}`);
    },
    dailyHighlights() {
      return client.request<DailyHighlights>('/api/social/daily-highlights');
    },
    songOfWeekFeed(scope: 'global' | 'following' | 'me' = 'global') {
      return client.request<SongOfWeekItem[]>(`/api/social/song-of-week?scope=${encodeURIComponent(scope)}`);
    },
    songOfWeekDetail(id: number | string) {
      return client.request<SongOfWeekItem>(`/api/social/song-of-week/${encodeURIComponent(String(id))}`);
    },
    /** The signed-in user's pick for the current week, or `null` if none. */
    songOfWeekMe() {
      return client.request<SongOfWeekItem | null>('/api/social/song-of-week/me');
    },
    /** Upsert the signed-in user's current-week pick. */
    setSongOfWeekMe(payload: { chart_id: number; caption?: string }) {
      return client.request<SongOfWeekItem>('/api/social/song-of-week/me', {
        method: 'PUT',
        body: payload,
      });
    },
    songOfWeekComments(id: number | string) {
      return client.request<Comment[]>(`/api/social/song-of-week/${encodeURIComponent(String(id))}/comments`);
    },
    addSongOfWeekComment(id: number | string, content: string, parentId?: number | string | null) {
      return client.request<Comment>(`/api/social/song-of-week/${encodeURIComponent(String(id))}/comments`, {
        method: 'POST',
        body: { content, parent_id: parentId ?? null },
      });
    },
    deleteSongOfWeekComment(commentId: number | string) {
      return client.request<{ success: true }>(`/api/social/song-of-week/comments/${encodeURIComponent(String(commentId))}`, {
        method: 'DELETE',
      });
    },
    post(id: string) {
      return client.request<Post>(`/api/social/posts/${id}`);
    },
    /**
     * Create a post via multipart/form-data. `images` accepts native RN
     * `{ uri, name, type }` payloads (RN extends FormData) OR web `File`/`Blob`.
     */
    createPost(input: {
      content?: string;
      images?: Array<{ uri: string; name: string; type: string } | Blob>;
      youtubeUrl?: string;
      commentsDisabled?: boolean;
    }) {
      const fd = new FormData();
      if (input.content) fd.append('content', input.content);
      if (input.youtubeUrl) fd.append('youtube_url', input.youtubeUrl);
      if (input.commentsDisabled) fd.append('comments_disabled', 'true');
      for (const img of input.images ?? []) {
        // RN: append { uri, name, type } object — fetch will handle as multipart file.
        // Web: append the File/Blob directly.
        fd.append('images', img as unknown as Blob);
      }
      return client.request<Post>('/api/social/posts', { method: 'POST', body: fd });
    },
    deletePost(id: string) {
      return client.request<void>(`/api/social/posts/${id}`, { method: 'DELETE' });
    },
    userPosts(userId: string, page = 1) {
      const search = new URLSearchParams();
      if (page > 1) search.set('page', String(page));
      const qs = search.toString();
      return client.request<Post[]>(`/api/social/posts/user/${userId}${qs ? `?${qs}` : ''}`);
    },
    comments(postId: string) {
      return client.request<Comment[]>(`/api/social/posts/${postId}/comments`);
    },
    addPostComment(postId: string, content: string, parentId?: string | null) {
      return client.request<Comment>(`/api/social/posts/${postId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content, parent_id: parentId ?? null }),
      });
    },
    upscoreComments(upscoreId: string) {
      return client.request<Comment[]>(`/api/social/upscores/${upscoreId}/comments`);
    },
    addUpscoreComment(upscoreId: string, content: string, parentId?: string | null) {
      return client.request<Comment>(`/api/social/upscores/${upscoreId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content, parent_id: parentId ?? null }),
      });
    },
    clearComments(clearId: string) {
      return client.request<Comment[]>(`/api/social/clears/${clearId}/comments`);
    },
    addClearComment(clearId: string, content: string, parentId?: string | null) {
      return client.request<Comment>(`/api/social/clears/${clearId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content, parent_id: parentId ?? null }),
      });
    },
    weeklyChallengePlayComments(playId: string) {
      return client.request<Comment[]>(`/api/social/weekly-challenge-plays/${playId}/comments`);
    },
    addWeeklyChallengePlayComment(playId: string, content: string, parentId?: string | null) {
      return client.request<Comment>(`/api/social/weekly-challenge-plays/${playId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content, parent_id: parentId ?? null }),
      });
    },
    /** Comments on a single play row — backs the score-card sheet's
     *  comment toggle. */
    playComments(playId: string) {
      return client.request<Comment[]>(`/api/social/plays/${playId}/comments`);
    },
    addPlayComment(playId: string, content: string, parentId?: string | null) {
      return client.request<Comment>(`/api/social/plays/${playId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content, parent_id: parentId ?? null }),
      });
    },
    deletePlayComment(playId: string, commentId: string) {
      return client.request<{ ok: true }>(`/api/social/plays/${playId}/comments/${commentId}`, {
        method: 'DELETE',
      });
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
    counts(userId: string) {
      return client.request<SocialCounts>(`/api/social/counts/${encodeURIComponent(userId)}`);
    },
    followers(userId: string) {
      return client.request<FollowEntry[]>(`/api/social/followers/${encodeURIComponent(userId)}`);
    },
    following(userId: string) {
      return client.request<FollowEntry[]>(`/api/social/following/${encodeURIComponent(userId)}`);
    },
    follow(userId: string) {
      return client.request<{ following: boolean }>(`/api/social/follow/${encodeURIComponent(userId)}`, { method: 'POST' });
    },
    unfollow(userId: string) {
      return client.request<{ following: boolean }>(`/api/social/follow/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    },
    followStatus(userId: string) {
      return client.request<FollowStatus>(`/api/social/follow-status/${encodeURIComponent(userId)}`);
    },
    activityNotifications(userId: string) {
      return client.request<ActivityNotificationPrefs>(`/api/social/activity-notifications/${encodeURIComponent(userId)}`);
    },
    setActivityNotifications(userId: string, prefs: Partial<ActivityNotificationPrefs>) {
      return client.request<ActivityNotificationPrefs>(`/api/social/activity-notifications/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        body: prefs,
      });
    },
  };
}

export interface ActivityNotificationPrefs {
  subscribed?: boolean;
  notify_posts?: boolean;
  notify_upscores?: boolean;
  notify_new_clears?: boolean;
}

export interface SocialCounts {
  followers_count: number;
  following_count: number;
  posts_count: number;
  total_pumps?: number;
  yesterday_followers?: number;
  last_post_at?: string | null;
}

export interface FollowEntry {
  id: string;
  username: string;
  avatar?: string;
  skill_title?: string;
  skill_level?: number;
  nationality?: string;
  [key: string]: unknown;
}

export interface FollowStatus {
  following: boolean;
  followers_count?: number;
  following_count?: number;
}

export type SocialApi = ReturnType<typeof createSocialApi>;
