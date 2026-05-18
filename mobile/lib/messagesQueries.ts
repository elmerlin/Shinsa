/**
 * Centralized React Query key factories + prefetch helpers for the Messages
 * feature. Lifted from the liketu chat architecture
 * (src/lib/chat-api.ts + src/lib/chat-prefetch.ts) so cache invalidation stays
 * consistent across the list screen, thread screen, and inbound surfaces
 * (profile DM button, etc).
 *
 * Don't inline `['messages', 'inbox', ...]` keys elsewhere — always go through
 * these factories.
 */
import type { QueryClient } from '@tanstack/react-query';
import { messagesApi } from '@/lib/api';

// --- Query keys -------------------------------------------------------------

export function getMessagesInboxQueryKey(userId: string | null | undefined) {
  return ['messages', 'inbox', userId || 'guest'] as const;
}

export function getConversationQueryKey(conversationId: string) {
  return ['messages', 'conversation', conversationId] as const;
}

/** Initial-page key (no `before` cursor). Separate from `getConversationQueryKey`
 *  in liketu — kept inlined here because we don't paginate messages yet. */
export function getConversationMessagesQueryKey(conversationId: string) {
  return ['messages', 'conversation', conversationId, 'messages'] as const;
}

// --- Constants --------------------------------------------------------------

export const INBOX_REFETCH_INTERVAL_MS = 30_000;
export const THREAD_REFETCH_INTERVAL_MS = 8_000;
export const INITIAL_MESSAGE_LIMIT = 30;

// --- Prefetch helpers -------------------------------------------------------

/**
 * Warm the thread cache when the user presses-in on an inbox row. By the
 * time the navigation animation lands, the messages are already there.
 * Mirrors liketu's `prefetchChatConversationForIntent`.
 */
export function prefetchConversationForIntent(params: {
  queryClient: QueryClient;
  conversationId: string | null | undefined;
}): void {
  const { queryClient, conversationId } = params;
  if (!conversationId) return;

  void queryClient.prefetchQuery({
    queryKey: getConversationQueryKey(conversationId),
    queryFn: () => messagesApi.conversation(conversationId, { limit: INITIAL_MESSAGE_LIMIT }),
    staleTime: 10_000,
  });
}
