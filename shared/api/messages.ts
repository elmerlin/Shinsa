import type { ApiClient } from './client';

export type ConversationKind = 'direct' | 'squad' | string;

/** Partner shape for a 1:1 DM. Empty/null when conversation is a squad. */
export interface ConversationPartner {
  user_id: string;
  username: string;
  avatar?: string;
  /** ISO 3166-1 alpha-2 country code, e.g. 'JP'. */
  nationality?: string;
  skill_title?: string;
  is_online?: boolean;
  last_active?: string | null;
}

/** Lightweight preview of the most recent message in a conversation.
 *  Server may include share/challenge_card/link_share/list_share metadata —
 *  the inbox preview just needs the human-readable `preview` line; the full
 *  embed renderers live on the thread screen. */
export interface ConversationLastMessage {
  id: string;
  sender_user_id: string;
  message_type: string;
  content: string;
  /** Short human-readable preview from the server (used in the list). */
  preview: string;
  created_at: string;
  share?: SessionShareEmbed | null;
  link_share?: LinkShareEmbed | null;
  challenge_card?: ChallengeCardEmbed | null;
  list_share?: ListShareEmbed | null;
  note_thread?: NoteThreadEmbed | null;
}

export interface ConversationStompState {
  can_send: boolean;
  is_waiting: boolean;
  sent_at?: string;
  has_incoming?: boolean;
}

export interface ConversationSquadInfo {
  title: string;
  avatar?: string;
  member_count: number;
  created_by_user_id: string;
  /** 'creator' | 'moderator' | 'member'. */
  viewer_role: string;
  notifications?: {
    enabled?: boolean;
    mentions?: boolean;
  };
  permissions?: {
    can_manage_members?: boolean;
    can_manage_roles?: boolean;
    can_edit_identity?: boolean;
  };
}

export interface ConversationSummary {
  id: string;
  kind: ConversationKind;
  title: string;
  avatar?: string;
  /** Optional decorative theme key the server stores per conversation. */
  theme?: string;
  is_pinned?: boolean;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  unread_count: number;
  member_count: number;
  /** Short metadata line ("Private chat" / "N members"). */
  subtitle: string;
  partner: ConversationPartner | null;
  last_message: ConversationLastMessage | null;
  stomp?: ConversationStompState | null;
  squad?: ConversationSquadInfo | null;
}

export interface ConversationSender {
  id: string;
  username: string;
  avatar?: string;
}

export interface MessageReaction {
  key: string;
  count: number;
  users?: { user_id: string; username?: string }[];
}

/** Server-normalized message row. Renderers live in the mobile thread screen. */
export interface ConversationMessage {
  id: string;
  conversation_id: string;
  message_type: string;
  content: string;
  created_at: string;
  updated_at?: string;
  is_unsent: boolean;
  is_own: boolean;
  sender: ConversationSender;
  share?: SessionShareEmbed | null;
  link_share?: LinkShareEmbed | null;
  challenge_card?: ChallengeCardEmbed | null;
  list_share?: ListShareEmbed | null;
  note_thread?: NoteThreadEmbed | null;
  reply_to?: ReplyTarget | null;
  reactions: MessageReaction[];
  viewer_reaction?: string;
}

// --- Embed payloads (mirror server/lib/directMessages.js sanitizers) -------

/** Live session / Hour-of-Power recap card. Subset of fields relevant to
 *  the mobile renderer; server returns more (rows[], judgmentTotals, etc). */
export interface SessionShareEmbed {
  version?: number;
  shareType?: 'hour_of_power' | 'session_share';
  sessionId?: string;
  sessionTitle?: string;
  streamUrl?: string;
  sessionDateLabel?: string;
  sessionTimeRange?: string;
  sessionDurationMinutes?: number;
  sessionDurationLabel?: string;
  sessionMachineName?: string;
  filterMode?: string;
  minGrade?: string;
  minGradeLabel?: string;
  hasLevelRange?: boolean;
  levelRangeLabel?: string;
  songCount?: number;
  clearCount?: number;
  clearRate?: number;
  averageScore?: number;
  totalRatingPoints?: number;
  averageRatingPoints?: number;
  averageLevel?: number;
  highestRatingPoints?: number;
  countedClearCount?: number;
  completed?: boolean;
  leaderboardEligible?: boolean;
  perfectRate?: number;
  judgmentTotals?: {
    perfect?: number;
    great?: number;
    good?: number;
    bad?: number;
    miss?: number;
  };
  /** Server may include up to N preview rows. */
  rows?: Array<{
    song_title?: string;
    mode?: string;
    level?: number;
    score?: number;
    grade?: string;
    rating_points?: number;
    jacket_url?: string;
  }>;
}

/** Adaptive link card — the `kind` switches the visual treatment. */
export interface LinkShareEmbed {
  version?: number;
  /** 'replay' | 'score_share' | 'chart_compare' | 'chart_challenge' |
   *  'live_session' | 'achievement_badge' | 'pet_share' | 'story_share' |
   *  'list' | 'link' (fallback). Server passes the raw kind through. */
  kind?: string;
  path?: string;
  url?: string;
  chartPath?: string;
  title?: string;
  subtitle?: string;
  buttonLabel?: string;
  postType?: string;
  achievementBadgeName?: string;
  achievementSupportingCopy?: string;
  previewImage?: string;
  songTitle?: string;
  mode?: string;
  level?: number;
  score?: number;
  grade?: string;
  isStageBreak?: boolean;
  playerName?: string;
  playerAvatar?: string;
  playerSkillTitle?: string;
  playerRoleLabel?: string;
  contextLabel?: string;
  liveSessionType?: string;
  isUnlisted?: boolean;
  youtubeVideoId?: string;
  playedAt?: string;
  jacketUrl?: string;
  oldScore?: number;
  oldGrade?: string;
  scoreDelta?: number;
  overTop100Rank?: number;
  plate?: string;
  perfect?: number;
  great?: number;
  good?: number;
  bad?: number;
  miss?: number;
  replayUrl?: string;
  replayVideoId?: string;
  replayStartSeconds?: number;
  replayEndSeconds?: number;
  targetScore?: number;
  challengeKind?: string;
  sourceMessageId?: string;
  statusKind?: string;
  statusLabel?: string;
  storyId?: string;
  storyOwnerId?: string;
  storyOwnerUsername?: string;
  storyOwnerAvatar?: string;
  storyType?: string;
  storySourceKind?: string;
  storyCaption?: string;
  storyCreatedAt?: string;
  storyMediaUrl?: string;
  storyFallbackPath?: string;
  storyFallbackUrl?: string;
  previewItems?: Array<{
    songTitle?: string;
    mode?: string;
    level?: number;
    score?: number;
    grade?: string;
    plate?: string;
    jacketUrl?: string;
    scoreDelta?: number;
  }>;
  totalItemCount?: number;
  extraItemCount?: number;
  petUserId?: string;
  petUsername?: string;
  petPreview?: {
    character?: string;
    nickname?: string;
    level?: number;
    hunger?: number;
    happiness?: number;
    weight_state?: string;
    mood?: string;
    bond_rank?: { label?: string } | null;
    form?: { label?: string } | null;
    equipped_hat?: string;
    equipped_top?: string;
    hat_color?: string;
    top_color?: string;
  } | null;
}

/** Challenge card — invites recipient to play a chart for a target. */
export interface ChallengeCardEmbed {
  version?: number;
  kind?: string;
  sourceKind?: string;
  sourceId?: string;
  path?: string;
  chartPath?: string;
  title?: string;
  subtitle?: string;
  targetLabel?: string;
  detailLabel?: string;
  buttonLabel?: string;
  songTitle?: string;
  mode?: string;
  level?: number;
  targetScore?: number;
  targetGrade?: string;
  originUsername?: string;
  sourceMessageId?: string;
  statusKind?: string;
  statusLabel?: string;
}

/** Shared squad-list reference. */
export interface ListShareEmbed {
  version?: number;
  sharedListId: number;
  listName: string;
  itemCount?: number;
  ownerUsername?: string;
}

/** Pinned note thread (time-limited). */
export interface NoteThreadEmbed {
  version?: number;
  threadKey: string;
  noteId?: string;
  ownerUserId?: string;
  ownerUsername?: string;
  noteText?: string;
  noteKind?: string;
  createdAt?: string;
  expiresAt?: string;
  linkPath?: string;
  linkUrl?: string;
  linkLabel?: string;
}

/** Reply-to target — small quoted snippet of the parent message. */
export interface ReplyTarget {
  messageId?: string;
  senderUserId?: string;
  senderUsername?: string;
  messageType?: string;
  previewText?: string;
}

export interface ConversationReadReceipt {
  user_id: string;
  last_read_message_id: string;
  username?: string;
  avatar?: string;
}

export interface ConversationsResponse {
  conversations: ConversationSummary[];
}

export interface ConversationDetailResponse {
  conversation: ConversationSummary | null;
  messages: ConversationMessage[];
  read_receipts: ConversationReadReceipt[];
  has_more: boolean;
}

export interface SendMessagePayload {
  /** Text body. Required unless an embed metadata payload is provided. */
  content?: string;
  /** Used when replying to a prior message. */
  reply_to_message_id?: string;
}

/** Send-message payload variant that carries an embed (rather than just
 *  text). Match what the server's `normalizeConversationInput` accepts. */
export interface EmbedSendPayload {
  content?: string;
  reply_to_message_id?: string;
  session_share?: SessionShareEmbed | null;
  link_share?: LinkShareEmbed | null;
  challenge_card?: ChallengeCardEmbed | null;
  list_share?: ListShareEmbed | null;
}

/** Also extend sendMessage so callers can pass embeds. */
export type AnyMessagePayload = SendMessagePayload | EmbedSendPayload;

export interface ConversationParams {
  /** Cursor for older messages. Pass the oldest known message id. */
  before?: string;
  /** 1–100. */
  limit?: number;
}

export function createMessagesApi(client: ApiClient) {
  return {
    /** All conversations the viewer participates in, ordered server-side by
     *  pinned-first then last_message_at desc. */
    conversations() {
      return client.request<ConversationsResponse>(`/api/messages/conversations`);
    },

    /** Fetch a single conversation with up to `limit` recent messages. Marks
     *  the conversation as read for the viewer when called without `before`. */
    conversation(conversationId: string, params: ConversationParams = {}) {
      const search = new URLSearchParams();
      if (params.before) search.set('before', params.before);
      if (params.limit && params.limit !== 50) search.set('limit', String(params.limit));
      const qs = search.toString();
      return client.request<ConversationDetailResponse>(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}${qs ? `?${qs}` : ''}`,
      );
    },

    /** Send a new message. Server validates either `content` or an embed
     *  (session_share / link_share / challenge_card / list_share). */
    sendMessage(conversationId: string, payload: SendMessagePayload | EmbedSendPayload) {
      return client.request<{ message: ConversationMessage }>(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}/messages`,
        { method: 'POST', body: payload },
      );
    },

    /** Unsend (soft-delete) a message you sent. Server replaces content with
     *  `is_unsent: true` so the row stays in place. */
    unsendMessage(conversationId: string, messageId: string) {
      return client.request<{ message: ConversationMessage }>(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
        { method: 'DELETE' },
      );
    },

    /** Force the conversation as read for the viewer. The server also marks
     *  read automatically on `conversation(id)` without `before`. */
    markRead(conversationId: string) {
      return client.request<{ ok: true }>(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}/read`,
        { method: 'POST' },
      );
    },

    /** Get the DM conversation with `userId`, creating it if one doesn't
     *  exist yet. When `payload` carries content/embeds the server posts
     *  it as the first message of the conversation in the same call —
     *  matching the web's "send to DM" flow. */
    getOrCreateDirect(userId: string, payload: SendMessagePayload | EmbedSendPayload = {}) {
      return client.request<{ conversation: ConversationSummary; message: ConversationMessage | null }>(
        `/api/messages/direct/${encodeURIComponent(userId)}`,
        { method: 'POST', body: payload },
      );
    },

    /** Pin or unpin a conversation so it stays at the top of the list. */
    pinConversation(conversationId: string, pinned: boolean) {
      return client.request<{ pinned: boolean }>(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}/pin`,
        { method: 'PUT', body: { pinned } },
      );
    },

    /** Set the conversation's chat theme. Server validates against an
     *  allow-list ('', cli, aim, yahoo, msn, skype, winamp, icq, wechat,
     *  discord, qq, nxa, kakao, line). Empty string resets to default. */
    setConversationTheme(conversationId: string, theme: string) {
      return client.request<{ conversation: ConversationSummary }>(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}/theme`,
        { method: 'PUT', body: { theme } },
      );
    },

    /** Toggle a reaction on a message. Pass `reaction: ''` to clear the
     *  viewer's existing reaction. Server is single-reaction-per-user-per-
     *  message — sending a different reaction key replaces the prior one. */
    setReaction(conversationId: string, messageId: string, reaction: string) {
      return client.request<{ reactions: MessageReaction[]; viewer_reaction: string }>(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/reactions`,
        { method: 'POST', body: { reaction } },
      );
    },

    /** Notify the server (and other members) that the viewer is typing.
     *  Throttle on the client; server expires the indicator after ~7s. */
    sendTyping(conversationId: string) {
      return client.request<{ ok: true }>(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}/typing`,
        { method: 'POST', body: {} },
      );
    },

    /** Fetch active typing entries — returns who is currently typing in
     *  this conversation (excludes the viewer). Poll on a short interval. */
    typing(conversationId: string) {
      return client.request<TypingResponse>(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}/typing`,
      );
    },

    /** Fuzzy-search conversation members for @-mention autocomplete.
     *  Squad-only; the server returns 200 with empty users for direct DMs. */
    searchMentions(conversationId: string, q: string) {
      return client.request<{ users: MentionUser[] }>(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}/mentions?q=${encodeURIComponent(q)}`,
      );
    },

    /** Stories highlights — friends/squads with active stories. Used by the
     *  inbox top-strip. Returns the viewer's own story bucket plus circles. */
    highlights() {
      return client.request<HighlightsResponse>(`/api/messages/highlights`);
    },

    /** Fetch a user's story stack for the viewer (own or peer). */
    story(userId: string) {
      return client.request<StoryResponse>(
        `/api/messages/highlights/${encodeURIComponent(userId)}/story`,
      );
    },

    /** Mark a story as viewed (debounced; safe to call multiple times). */
    markStoryViewed(userId: string, storyId: string) {
      return client.request<{ ok?: true; engagement?: StoryEngagement }>(
        `/api/messages/highlights/${encodeURIComponent(userId)}/story/${encodeURIComponent(storyId)}/view`,
        { method: 'POST' },
      );
    },

    /** Lightweight per-story engagement payload for the viewer. */
    storyEngagement(userId: string, storyId: string) {
      return client.request<{ engagement: StoryEngagement }>(
        `/api/messages/highlights/${encodeURIComponent(userId)}/story/${encodeURIComponent(storyId)}/engagement`,
      );
    },

    /** Toggle the viewer's "pump" on a story. */
    toggleStoryPump(userId: string, storyId: string) {
      return client.request<{ engagement: StoryEngagement }>(
        `/api/messages/highlights/${encodeURIComponent(userId)}/story/${encodeURIComponent(storyId)}/pump`,
        { method: 'POST' },
      );
    },

    /** Story comments are loaded on intent, not with the story strip. */
    storyComments(userId: string, storyId: string) {
      return client.request<{ comments: StoryComment[] }>(
        `/api/messages/highlights/${encodeURIComponent(userId)}/story/${encodeURIComponent(storyId)}/comments`,
      );
    },

    addStoryComment(userId: string, storyId: string, content: string) {
      return client.request<{ comments: StoryComment[]; engagement?: StoryEngagement }>(
        `/api/messages/highlights/${encodeURIComponent(userId)}/story/${encodeURIComponent(storyId)}/comments`,
        { method: 'POST', body: { content } },
      );
    },

    /** Owner-only story stats, including recent viewers. */
    storyStats(userId: string, storyId: string) {
      return client.request<StoryStatsResponse>(
        `/api/messages/highlights/${encodeURIComponent(userId)}/story/${encodeURIComponent(storyId)}/stats`,
      );
    },

    archiveStory(userId: string, storyId: string) {
      return client.request<StoryArchiveResponse>(
        `/api/messages/highlights/${encodeURIComponent(userId)}/story/${encodeURIComponent(storyId)}/archive`,
        { method: 'POST' },
      );
    },

    deleteStory(userId: string, storyId: string) {
      return client.request<StoryArchiveResponse>(
        `/api/messages/highlights/${encodeURIComponent(userId)}/story/${encodeURIComponent(storyId)}`,
        { method: 'DELETE' },
      );
    },

    createStoryItem(formData: FormData) {
      return client.request<{ story: StoryItem }>(
        '/api/messages/highlights/story',
        { method: 'POST', body: formData },
      );
    },

    createNote(payload: { content: string; link_path?: string; link_url?: string; link_label?: string }) {
      return client.request<{ note: StoryNote }>(
        '/api/messages/highlights/note',
        { method: 'POST', body: payload },
      );
    },

    clearNote() {
      return client.request<{ success?: boolean }>(
        '/api/messages/highlights/note',
        { method: 'DELETE' },
      );
    },

    // --- Squad management -------------------------------------------------

    /** Full squad metadata: members, viewer's role, notifications, etc. */
    squad(conversationId: string) {
      return client.request<SquadDetailResponse>(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}/squad`,
      );
    },

    /** Update squad name / avatar / theme (creator only). */
    updateSquad(conversationId: string, payload: SquadUpdatePayload) {
      return client.request<SquadDetailResponse>(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}/squad`,
        { method: 'PUT', body: payload },
      );
    },

    /** Invite a user to the squad. Requires can_manage_members. Server
     *  returns the refreshed full squad response. */
    addSquadMember(conversationId: string, userId: string) {
      return client.request<SquadDetailResponse>(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}/squad/members`,
        { method: 'POST', body: { user_id: userId } },
      );
    },

    /** Remove a member or leave the squad (passing your own user_id). */
    removeSquadMember(conversationId: string, userId: string) {
      return client.request<SquadDetailResponse>(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}/squad/members/${encodeURIComponent(userId)}`,
        { method: 'DELETE' },
      );
    },

    /** Promote/demote — accepts 'creator' | 'moderator' | 'member'.
     *  Creator role can only be reassigned (not removed). */
    setSquadMemberRole(conversationId: string, userId: string, role: string) {
      return client.request<SquadDetailResponse>(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}/squad/members/${encodeURIComponent(userId)}/role`,
        { method: 'PUT', body: { role } },
      );
    },

    /** Per-conversation notification toggle. Server accepts
     *  `{ notifications_enabled, notify_mentions }` (snake-case, both
     *  optional) and returns the refreshed full squad response. */
    setSquadNotifications(
      conversationId: string,
      payload: { notifications_enabled?: boolean; notify_mentions?: boolean },
    ) {
      return client.request<SquadDetailResponse>(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}/squad/notifications`,
        { method: 'PUT', body: payload },
      );
    },
  };
}

// --- Squad shapes (mirror server/routes/messages.js#buildSquadResponse) ---

/** A squad member row. Note `user` is nested — the server joins on the
 *  users table and returns the identity under `user.{id,username,avatar}`,
 *  not at the top level. (Previous flat shape was wrong and made the
 *  username vanish in the UI.) */
export interface SquadMember {
  user_id: string;
  /** 'creator' | 'moderator' | 'member' */
  role: string;
  joined_at?: string;
  added_by_user_id?: string;
  notifications_enabled?: boolean;
  notify_mentions?: boolean;
  user: {
    id: string;
    username: string;
    avatar?: string;
    avatar_v?: string | number;
    nationality?: string;
    skill_title?: string;
    playing_status?: string;
  };
}

export interface SquadViewerMembership {
  /** 'creator' | 'moderator' | 'member' */
  role: string;
  notifications_enabled: boolean;
  notify_mentions: boolean;
  permissions: {
    can_manage_members: boolean;
    can_manage_roles: boolean;
    can_edit_identity: boolean;
    can_remove_members?: boolean;
  };
}

export interface SquadDetailResponse {
  conversation: ConversationSummary | null;
  members: SquadMember[];
  viewer_membership: SquadViewerMembership | null;
}

export interface SquadUpdatePayload {
  title?: string;
  avatar?: string;
  theme?: string;
}

export interface TypingEntry {
  user_id: string;
  username: string;
  avatar?: string;
  /** Server-side ISO expiry when this typing flag goes stale. */
  expires_at?: string;
}
export interface TypingResponse {
  typing: TypingEntry[];
}

export interface MentionUser {
  user_id: string;
  username: string;
  avatar?: string;
  /** Optional display name for squads where the user has a custom title. */
  display_name?: string;
}

export interface StoryHighlightCircle {
  user: {
    id: string;
    username: string;
    avatar?: string;
    nationality?: string;
  };
  has_story: boolean;
  is_self?: boolean;
  /** When true, the viewer hasn't seen the latest story yet. */
  has_unseen?: boolean;
  note?: StoryNote | null;
}

export interface HighlightsResponse {
  me: StoryHighlightCircle | null;
  circles: StoryHighlightCircle[];
}

export interface StoryLink {
  path?: string;
  url?: string;
  label?: string;
}

export interface StoryUser {
  id: string;
  username: string;
  avatar?: string;
}

export interface StoryNote {
  id?: string;
  user_id?: string;
  content?: string;
  text?: string;
  kind?: string;
  thread_key?: string;
  created_at?: string;
  updated_at?: string;
  expires_at?: string;
  is_auto?: boolean;
  link?: StoryLink | null;
  user?: StoryUser | null;
}

export interface StoryComment {
  id: string;
  content: string;
  created_at: string;
  user?: StoryUser | null;
}

export interface StoryEngagement {
  view_count: number;
  pump_count: number;
  comment_count: number;
  user_pumped?: boolean;
  preview_comments?: StoryComment[];
}

export interface StoryScorePreview {
  song_title?: string;
  songTitle?: string;
  mode?: string;
  level?: number | string;
  score?: number | string;
  grade?: string;
  plate?: string;
  jacket_url?: string;
  jacketUrl?: string;
}

export interface StoryItem {
  id: string;
  user_id?: string;
  username?: string;
  avatar?: string;
  user?: StoryUser | null;
  /** Server returns `type`; older callers may still read `story_type`. */
  type?: string;
  story_type?: string;
  source_kind?: string;
  source?: { kind?: string; id?: string } | null;
  title?: string;
  subtitle?: string;
  caption?: string;
  media_url?: string;
  fallback_path?: string;
  fallback_url?: string;
  link?: StoryLink | null;
  sticker_tokens?: string[];
  snapshot?: Record<string, unknown> | null;
  scores?: StoryScorePreview[];
  total_count?: number | string;
  engagement?: StoryEngagement;
  created_at: string;
  expires_at?: string;
  is_viewed?: boolean;
}

export interface StoryResponse {
  user: { id: string; username: string; avatar?: string };
  stories: StoryItem[];
  is_owner?: boolean;
  readonly?: boolean;
}

export interface StoryStatsResponse extends StoryEngagement {
  story_id?: string;
  viewers?: Array<{ viewed_at: string; user?: StoryUser | null }>;
}

export interface StoryArchiveResponse {
  success?: boolean;
  stories: StoryItem[];
  archived?: Array<{ story: StoryItem; archived_at?: string }>;
}

export type MessagesApi = ReturnType<typeof createMessagesApi>;
