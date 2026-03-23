import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

export function getActiveMentionQuery(text, cursor) {
  const value = String(text || '');
  const pos = Number.isFinite(cursor) ? cursor : value.length;
  const before = value.slice(0, pos);
  const match = before.match(/(^|[\s(])@([A-Za-z0-9_]{1,30})$/);
  if (!match) return null;
  return {
    query: match[2],
    start: pos - match[2].length - 1,
    end: pos,
  };
}

function normalizeMentionUsers(rows = [], excludeUserIds = []) {
  const excluded = new Set((Array.isArray(excludeUserIds) ? excludeUserIds : []).map((value) => String(value || '').trim()).filter(Boolean));
  const seen = new Set();
  return (Array.isArray(rows) ? rows : [])
    .map((entry) => ({
      id: String(entry?.id || '').trim(),
      username: String(entry?.username || '').trim(),
      avatar: String(entry?.avatar || '').trim(),
    }))
    .filter((entry) => {
      if (!entry.id || !entry.username || excluded.has(entry.id)) return false;
      const key = `${entry.id}:${entry.username.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function useMentionComposer({
  value,
  setValue,
  inputRef,
  enabled = true,
  searchMentions,
  excludeUserIds = [],
}) {
  const [mentionToken, setMentionToken] = useState(null);
  const [mentionUsers, setMentionUsers] = useState([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionLoading, setMentionLoading] = useState(false);
  const requestRef = useRef(0);
  const deferredQuery = useDeferredValue(mentionToken?.query || '');
  const excludeKey = (Array.isArray(excludeUserIds) ? excludeUserIds : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('|');
  const normalizedExcludeUserIds = useMemo(
    () => (excludeKey ? excludeKey.split('|').filter(Boolean) : []),
    [excludeKey]
  );

  const clearMentions = useCallback(() => {
    setMentionToken(null);
    setMentionUsers([]);
    setShowMentions(false);
    setMentionLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled || typeof searchMentions !== 'function' || !deferredQuery) {
      setMentionUsers([]);
      setMentionLoading(false);
      setShowMentions(false);
      return;
    }

    let cancelled = false;
    const requestId = ++requestRef.current;
    setMentionLoading(true);

    Promise.resolve(searchMentions(deferredQuery))
      .then((rows) => {
        if (cancelled || requestId !== requestRef.current) return;
        const normalized = normalizeMentionUsers(rows, normalizedExcludeUserIds);
        setMentionUsers(normalized);
        setShowMentions(normalized.length > 0);
      })
      .catch(() => {
        if (cancelled || requestId !== requestRef.current) return;
        setMentionUsers([]);
        setShowMentions(false);
      })
      .finally(() => {
        if (!cancelled && requestId === requestRef.current) {
          setMentionLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [deferredQuery, enabled, excludeKey, normalizedExcludeUserIds, searchMentions]);

  const updateMentionState = useCallback((nextValue, cursorOverride) => {
    if (!enabled) {
      clearMentions();
      return;
    }

    const input = inputRef?.current;
    const cursor = Number.isFinite(cursorOverride)
      ? cursorOverride
      : Number.isFinite(input?.selectionStart)
        ? input.selectionStart
        : String(nextValue || '').length;
    const token = getActiveMentionQuery(nextValue, cursor);
    setMentionToken(token);
    if (!token) {
      setMentionUsers([]);
      setMentionLoading(false);
      setShowMentions(false);
    }
  }, [clearMentions, enabled, inputRef]);

  const applyMention = useCallback((selectedUsername) => {
    const username = String(selectedUsername || '').trim();
    if (!username || typeof setValue !== 'function') return;

    const input = inputRef?.current;
    const currentValue = String(value || '');
    const cursor = Number.isFinite(input?.selectionStart) ? input.selectionStart : currentValue.length;
    const token = getActiveMentionQuery(currentValue, cursor) || mentionToken;
    if (!token) return;

    const nextValue = `${currentValue.slice(0, token.start)}@${username} ${currentValue.slice(token.end)}`;
    const nextCursor = token.start + username.length + 2;
    setValue(nextValue);
    clearMentions();

    window.requestAnimationFrame(() => {
      if (!inputRef?.current) return;
      try {
        inputRef.current.focus({ preventScroll: true });
      } catch {
        inputRef.current.focus();
      }
      if (typeof inputRef.current.setSelectionRange === 'function') {
        inputRef.current.setSelectionRange(nextCursor, nextCursor);
      }
    });
  }, [inputRef, mentionToken, setValue, value, clearMentions]);

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Escape' && showMentions) {
      event.preventDefault();
      clearMentions();
      return true;
    }
    if ((event.key === 'Enter' || event.key === 'Tab') && showMentions && mentionUsers.length > 0) {
      event.preventDefault();
      applyMention(mentionUsers[0].username);
      return true;
    }
    return false;
  }, [applyMention, clearMentions, mentionUsers, showMentions]);

  return {
    mentionUsers,
    mentionLoading,
    showMentions,
    updateMentionState,
    applyMention,
    handleKeyDown,
    clearMentions,
  };
}
