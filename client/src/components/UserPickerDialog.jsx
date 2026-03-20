import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getMessageConversations, searchUsers } from '../utils/api';
import { getAvatarUrl } from './AvatarPicker';
import { getCountryFlag } from './PlayerRegistration';

export default function UserPickerDialog({
  open = false,
  title = 'Start a conversation',
  description = '',
  eyebrowLabel = 'Direct Messages',
  selectLabel = 'Message',
  submitLabel = 'Share',
  onClose,
  onSelect,
  onSubmit = null,
  excludeUserIds = [],
  multiSelect = false,
  zIndexClass = 'z-[200]',
  searchPlaceholder = 'Search players',
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [recentUsers, setRecentUsers] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectingId, setSelectingId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const inputRef = useRef(null);

  const excludedIds = useMemo(() => new Set((excludeUserIds || []).map((value) => String(value || '').trim())), [excludeUserIds]);
  const selectedIds = useMemo(
    () => new Set(selectedUsers.map((user) => String(user?.id || '').trim()).filter(Boolean)),
    [selectedUsers],
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults([]);
    setRecentUsers([]);
    setError('');
    setSelectingId('');
    setSubmitting(false);
    setSelectedUsers([]);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoadingRecent(true);
    getMessageConversations()
      .then((payload) => {
        if (cancelled) return;
        const conversations = Array.isArray(payload?.conversations) ? payload.conversations : [];
        const partners = conversations
          .map((conversation) => conversation?.partner || null)
          .filter((partner) => {
            const userId = String(partner?.id || '').trim();
            return userId && !excludedIds.has(userId);
          })
          .filter((partner, index, list) => (
            list.findIndex((entry) => String(entry?.id || '').trim() === String(partner?.id || '').trim()) === index
          ))
          .slice(0, 8);
        setRecentUsers(partners);
      })
      .catch(() => {
        if (!cancelled) {
          setRecentUsers([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRecent(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, excludedIds]);

  useEffect(() => {
    if (!open) return undefined;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const users = await searchUsers(trimmed);
        if (cancelled) return;
        setResults((Array.isArray(users) ? users : []).filter((user) => !excludedIds.has(String(user?.id || '').trim())));
      } catch (err) {
        if (cancelled) return;
        setResults([]);
        setError(err?.message || 'Failed to search players.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, excludedIds]);

  if (!open) return null;

  const showSearchResults = query.trim().length >= 2;
  const visibleUsers = showSearchResults ? results : recentUsers;
  const emptyState = showSearchResults
    ? 'No matching players found.'
    : (loadingRecent ? 'Loading recent conversations...' : 'No recent conversations yet.');

  const handleSelect = async (user) => {
    if (!user?.id) return;
    if (multiSelect) {
      const userId = String(user.id);
      setSelectedUsers((prev) => (
        prev.some((entry) => String(entry?.id || '') === userId)
          ? prev.filter((entry) => String(entry?.id || '') !== userId)
          : [...prev, user]
      ));
      return;
    }
    if (!onSelect || selectingId || submitting) return;
    setSelectingId(String(user.id));
    setError('');
    try {
      await onSelect(user);
    } catch (err) {
      setError(err?.message || 'Failed to continue.');
    } finally {
      setSelectingId('');
    }
  };

  const handleRemoveSelected = (userId) => {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) return;
    setSelectedUsers((prev) => prev.filter((entry) => String(entry?.id || '').trim() !== normalizedUserId));
  };

  const handleSubmit = async () => {
    if (!multiSelect || !onSubmit || submitting || selectedUsers.length === 0) return;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(selectedUsers);
    } catch (err) {
      setError(err?.message || 'Failed to share.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`fixed inset-0 ${zIndexClass} bg-black/80 px-4 py-6 backdrop-blur-sm`} onClick={onClose}>
      <div
        className="mx-auto flex max-h-[min(88dvh,46rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-piu-border bg-piu-card shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-piu-border/50 px-4 py-3">
          <div>
            <p className="text-[10px] font-display font-bold uppercase tracking-[0.24em] text-cyan-300">{eyebrowLabel}</p>
            <h3 className="mt-1 text-lg font-display font-black text-white">{title}</h3>
            {description ? (
              <p className="mt-1 text-xs leading-5 text-gray-400">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-piu-border/60 bg-piu-dark/70 px-3 py-1 text-xs font-display font-bold text-gray-300 transition-colors hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <label
            className="flex w-full items-center gap-3 rounded-xl border border-piu-border/60 bg-piu-dark/40 px-3.5 py-3 text-left text-gray-500 transition-colors hover:border-cyan-400/30 hover:text-gray-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-base text-white placeholder:text-gray-500 focus:outline-none"
              maxLength={80}
            />
          </label>

          {multiSelect && selectedUsers.length > 0 ? (
            <div className="mt-3 rounded-[1.2rem] border border-cyan-400/18 bg-cyan-500/8 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-display font-black uppercase tracking-[0.18em] text-cyan-100/75">Selected</p>
                  <p className="mt-1 text-sm text-white">
                    {selectedUsers.length} player{selectedUsers.length === 1 ? '' : 's'} ready
                  </p>
                </div>
                <span className="rounded-full border border-cyan-300/20 bg-black/20 px-2.5 py-1 text-[10px] font-display font-black uppercase tracking-[0.16em] text-cyan-100/80">
                  {submitLabel}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedUsers.map((user) => {
                  const userId = String(user?.id || '').trim();
                  return (
                    <button
                      key={userId}
                      type="button"
                      onClick={() => handleRemoveSelected(userId)}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-2.5 py-1.5 text-left text-xs text-gray-100 transition-colors hover:border-cyan-300/25 hover:bg-black/35"
                    >
                      {user?.avatar ? (
                        <img src={getAvatarUrl(user.avatar)} alt="" className="h-5 w-5 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-emerald-500 font-display text-[10px] font-black text-white">
                          {(user?.username || 'U').slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span className="max-w-[7.5rem] truncate">{user?.username || 'Player'}</span>
                      <span className="text-gray-400">x</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-3 space-y-2">
            {!showSearchResults && recentUsers.length > 0 ? (
              <div className="px-1 pb-1 text-[10px] font-display font-bold uppercase tracking-[0.18em] text-gray-500">
                Recent
              </div>
            ) : null}
            {showSearchResults && loading ? (
              <div className="rounded-xl border border-piu-border/50 bg-piu-dark/40 px-4 py-5 text-center text-sm text-gray-400">
                Searching players...
              </div>
            ) : visibleUsers.length === 0 ? (
              <div className="rounded-xl border border-piu-border/50 bg-piu-dark/40 px-4 py-5 text-center text-sm text-gray-500">
                {emptyState}
              </div>
            ) : (
              visibleUsers.map((user) => {
                const userId = String(user?.id || '').trim();
                const isSelecting = selectingId === userId;
                const isSelected = selectedIds.has(userId);
                const flag = getCountryFlag(user?.nationality || user?.location_country_code || user?.country_code);
                return (
                  <button
                    key={userId}
                    type="button"
                    onClick={() => handleSelect(user)}
                    disabled={multiSelect ? submitting : (!!selectingId || submitting)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors disabled:opacity-60 ${
                      isSelected
                        ? 'border-cyan-300/35 bg-cyan-500/10'
                        : 'border-piu-border/50 bg-piu-dark/45 hover:border-cyan-400/35 hover:bg-piu-dark/65'
                    }`}
                  >
                    {user?.avatar ? (
                      <img src={getAvatarUrl(user.avatar)} alt="" className="h-11 w-11 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-emerald-500 font-display font-black text-sm text-white">
                        {(user?.username || 'U').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {flag ? <span className="shrink-0 leading-none">{flag}</span> : null}
                        <p className="truncate text-sm font-display font-black text-white">{user?.username || 'Unknown player'}</p>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        {user?.skill_title || user?.playing_status || 'Open conversation'}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-md border px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-[0.18em] ${
                      isSelected
                        ? 'border-cyan-300/35 bg-cyan-400/14 text-white'
                        : 'border-cyan-400/25 bg-cyan-500/10 text-cyan-100'
                    }`}>
                      {multiSelect ? (isSelected ? 'Added' : 'Add') : (isSelecting ? 'Opening...' : selectLabel)}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {error ? (
            <p className="mt-3 text-sm text-red-300">{error}</p>
          ) : null}
        </div>

        {multiSelect ? (
          <div className="flex items-center justify-between gap-3 border-t border-piu-border/50 px-4 py-3">
            <p className="text-xs text-gray-500">
              {selectedUsers.length > 0
                ? `${selectedUsers.length} player${selectedUsers.length === 1 ? '' : 's'} selected`
                : 'Select one or more players'}
            </p>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || selectedUsers.length === 0}
              className="rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-4 py-2.5 text-sm font-display font-black text-cyan-100 transition-colors hover:border-cyan-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Sharing...' : `${submitLabel}${selectedUsers.length > 0 ? ` (${selectedUsers.length})` : ''}`}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
