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
 *  mobile only renders text + share-kind placeholders for embeds. */
export interface ConversationLastMessage {
  id: string;
  sender_user_id: string;
  message_type: string;
  content: string;
  /** Short human-readable preview from the server (used in the list). */
  preview: string;
  created_at: string;
  share?: unknown;
  link_share?: unknown;
  challenge_card?: unknown;
  list_share?: unknown;
  note_thread?: unknown;
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

/** Server-normalized message row. Mobile renders `text` and `unsent` directly;
 *  any other message_type is shown via a "[Shared chart]" / "[Challenge]" /
 *  etc placeholder until the embed renderers ship. */
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
  share?: unknown;
  link_share?: unknown;
  challenge_card?: unknown;
  list_share?: unknown;
  note_thread?: unknown;
  reply_to?: unknown;
  reactions: MessageReaction[];
  viewer_reaction?: string;
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

    /** Send a new message. Server validates either `content` or an embed. */
    sendMessage(conversationId: string, payload: SendMessagePayload) {
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
     *  exist yet. Returns the same shape as a list row. */
    getOrCreateDirect(userId: string) {
      return client.request<{ conversation: ConversationSummary }>(
        `/api/messages/direct/${encodeURIComponent(userId)}`,
        { method: 'POST', body: {} },
      );
    },

    /** Pin or unpin a conversation so it stays at the top of the list. */
    pinConversation(conversationId: string, pinned: boolean) {
      return client.request<{ pinned: boolean }>(
        `/api/messages/conversations/${encodeURIComponent(conversationId)}/pin`,
        { method: 'PUT', body: { pinned } },
      );
    },
  };
}

export type MessagesApi = ReturnType<typeof createMessagesApi>;
