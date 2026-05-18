/**
 * Typing-indicator plumbing for a conversation thread.
 *
 *   const { typingUsers, emitTyping } = useTypingIndicator(conversationId);
 *
 * - Polls /conversations/:id/typing every 4s while the thread is open.
 *   Server expires entries after ~7s so a 4s interval gives one safety
 *   refresh before they disappear.
 * - `emitTyping()` POSTs the typing endpoint, throttled to once every
 *   3.5s so a fast typer doesn't spam the server.
 * - Filters the viewer's own user_id out of the returned list.
 */
import { useQuery } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { messagesApi } from '@/lib/api';
import type { TypingEntry, TypingResponse } from '@shared/api';

const POLL_INTERVAL_MS = 4_000;
const EMIT_THROTTLE_MS = 3_500;

export function useTypingIndicator(
  conversationId: string,
  viewerUserId: string | undefined,
  enabled = true,
): { typingUsers: TypingEntry[]; emitTyping: () => void } {
  const lastEmitRef = useRef(0);

  const query = useQuery<TypingResponse>({
    queryKey: ['messages', 'conversation', conversationId, 'typing'],
    queryFn: () => messagesApi.typing(conversationId),
    enabled: !!conversationId && enabled,
    refetchInterval: enabled ? POLL_INTERVAL_MS : false,
    // Don't keep a stale array around for too long — typing flags decay fast.
    staleTime: 1_000,
    refetchOnWindowFocus: false,
  });

  const all = query.data?.typing ?? [];
  const typingUsers = viewerUserId
    ? all.filter((entry) => entry.user_id !== viewerUserId)
    : all;

  const emitTyping = useCallback(() => {
    if (!conversationId) return;
    const now = Date.now();
    if (now - lastEmitRef.current < EMIT_THROTTLE_MS) return;
    lastEmitRef.current = now;
    // Fire-and-forget; server returns 204 quickly. Don't block the UI.
    void messagesApi.sendTyping(conversationId).catch(() => {
      // If the emit fails (network blip, conversation rename, etc), reset
      // so the next keystroke retries.
      lastEmitRef.current = 0;
    });
  }, [conversationId]);

  return { typingUsers, emitTyping };
}
