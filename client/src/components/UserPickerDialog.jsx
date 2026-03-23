import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
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
  onSelectConversation = null,
  onSubmit = null,
  excludeUserIds = [],
  multiSelect = false,
  showSquads = false,
  zIndexClass = 'z-[200]',
  searchPlaceholder = 'Search players',
  sentResults = null,
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [recentUsers, setRecentUsers] = useState([]);
  const [squadConversations, setSquadConversations] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectingId, setSelectingId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedSquads, setSelectedSquads] = useState([]);
  const inputRef = useRef(null);

  const excludedIds = useMemo(() => new Set((excludeUserIds || []).map((value) => String(value || '').trim())), [excludeUserIds]);
  const selectedIds = useMemo(
    () => new Set(selectedUsers.map((user) => String(user?.id || '').trim()).filter(Boolean)),
    [selectedUsers],
  );
  const selectedSquadIds = useMemo(
    () => new Set(selectedSquads.map((conv) => String(conv?.id || '').trim()).filter(Boolean)),
    [selectedSquads],
  );
  const totalSelected = selectedUsers.length + selectedSquads.length;

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults([]);
    setRecentUsers([]);
    setSquadConversations([]);
    setError('');
    setSelectingId('');
    setSubmitting(false);
    setSelectedUsers([]);
    setSelectedSquads([]);
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
          .filter((c) => c?.kind !== 'squad')
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
        if (showSquads) {
          const squads = conversations
            .filter((c) => c?.kind === 'squad')
            .slice(0, 12);
          setSquadConversations(squads);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRecentUsers([]);
          setSquadConversations([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRecent(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, excludedIds, showSquads]);

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

  const handleSelectConversation = async (conversation) => {
    if (!conversation?.id) return;
    const convId = String(conversation.id).trim();

    if (multiSelect) {
      setSelectedSquads((prev) => (
        prev.some((entry) => String(entry?.id || '') === convId)
          ? prev.filter((entry) => String(entry?.id || '') !== convId)
          : [...prev, conversation]
      ));
      return;
    }

    if (!onSelectConversation || selectingId || submitting) return;
    setSelectingId(`conv-${convId}`);
    setError('');
    try {
      await onSelectConversation(conversation);
    } catch (err) {
      setError(err?.message || 'Failed to send.');
    } finally {
      setSelectingId('');
    }
  };

  if (!open) return null;

  // ── Sent confirmation view ──────────────────────────────────────────────
  if (sentResults) {
    const sentUsers = Array.isArray(sentResults.users) ? sentResults.users : [];
    const sentSquads = Array.isArray(sentResults.squads) ? sentResults.squads : [];
    const sentTotal = sentUsers.length + sentSquads.length;
    return (
      <div className={`fixed inset-0 ${zIndexClass} bg-black/80 px-4 py-6 backdrop-blur-sm`} onClick={onClose}>
        <div
          className="mx-auto flex max-h-[min(88dvh,46rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-piu-border bg-piu-card shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 border-b border-piu-border/50 px-4 py-3">
            <div>
              <p className="text-[10px] font-display font-bold uppercase tracking-[0.24em] text-emerald-400">Sent</p>
              <h3 className="mt-1 text-lg font-display font-black text-white">
                Shared with {sentTotal} {sentTotal === 1 ? 'recipient' : 'recipients'}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-piu-border/60 bg-piu-dark/70 px-3 py-1 text-xs font-display font-bold text-gray-300 transition-colors hover:text-white"
            >
              Done
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="space-y-2">
              {sentSquads.map((conv) => {
                const convId = String(conv?.id || '').trim();
                const squadAvatar = conv?.avatar ? getAvatarUrl(conv.avatar) : '';
                return (
                  <div
                    key={`sent-squad-${convId}`}
                    className="flex items-center gap-3 rounded-xl border border-emerald-400/20 bg-emerald-500/8 px-3 py-3"
                  >
                    {squadAvatar ? (
                      <img src={squadAvatar} alt="" className="h-11 w-11 rounded-xl object-cover" />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 font-display font-black text-sm text-white">
                        {(conv?.title || 'S').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-display font-black text-white">{conv?.title || 'Squad'}</p>
                      <p className="mt-0.5 truncate text-xs text-emerald-300/70">Sent to squad</p>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0 text-emerald-400">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                    </svg>
                  </div>
                );
              })}
              {sentUsers.map((user) => {
                const userId = String(user?.id || '').trim();
                return (
                  <div
                    key={`sent-user-${userId}`}
                    className="flex items-center gap-3 rounded-xl border border-emerald-400/20 bg-emerald-500/8 px-3 py-3"
                  >
                    {user?.avatar ? (
                      <img src={getAvatarUrl(user.avatar)} alt="" className="h-11 w-11 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-emerald-500 font-display font-black text-sm text-white">
                        {(user?.username || 'U').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-display font-black text-white">{user?.username || 'Player'}</p>
                      <p className="mt-0.5 truncate text-xs text-emerald-300/70">Sent via DM</p>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0 text-emerald-400">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                    </svg>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-piu-border/50 px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-gray-400 transition-colors hover:text-white"
            >
              Close
            </button>
            <Link
              to="/messages"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-4 py-2.5 text-sm font-display font-black text-cyan-100 transition-colors hover:border-cyan-400/40 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 opacity-70">
                <path d="M3.505 2.365A41.369 41.369 0 019 2c1.863 0 3.697.124 5.495.365 1.247.167 2.18 1.108 2.435 2.268a4.45 4.45 0 00-.577-.069 43.141 43.141 0 00-4.706 0C9.229 4.696 7.5 6.727 7.5 8.998v2.24c0 1.413.67 2.735 1.76 3.562l-2.98 2.98A.75.75 0 015 17.25v-3.443c-.501-.048-1-.106-1.495-.172C2.033 13.438 1 12.162 1 10.72V5.28c0-1.441 1.033-2.717 2.505-2.914z" />
                <path d="M14 6c.762 0 1.52.02 2.272.062C17.226 6.175 18 7.049 18 8.068v2.652c0 1.02-.773 1.893-1.728 2.006A39.41 39.41 0 0114 12.792v3.458a.75.75 0 01-1.28.53l-2.073-2.073A40.606 40.606 0 018.5 14.5v-2.24C8.5 10.516 10.016 9 11.852 8.936 12.554 8.913 13.272 8.9 14 8.9V6z" />
              </svg>
              Go to inbox
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Picker view ─────────────────────────────────────────────────────────
  const showSearchResults = query.trim().length >= 2;
  const visibleUsers = showSearchResults ? results : recentUsers;
  const queryLower = query.trim().toLowerCase();
  const filteredSquads = showSquads
    ? (showSearchResults
      ? squadConversations.filter((c) => (c?.title || '').toLowerCase().includes(queryLower))
      : squadConversations)
    : [];
  const emptyState = showSearchResults
    ? 'No matching results found.'
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

  const handleRemoveSelectedSquad = (convId) => {
    const normalizedId = String(convId || '').trim();
    if (!normalizedId) return;
    setSelectedSquads((prev) => prev.filter((entry) => String(entry?.id || '').trim() !== normalizedId));
  };

  const handleSubmit = async () => {
    if (!multiSelect || !onSubmit || submitting || totalSelected === 0) return;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(selectedUsers, selectedSquads);
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

          {multiSelect && totalSelected > 0 ? (
            <div className="mt-3 rounded-[1.2rem] border border-cyan-400/18 bg-cyan-500/8 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-display font-black uppercase tracking-[0.18em] text-cyan-100/75">Selected</p>
                  <p className="mt-1 text-sm text-white">
                    {totalSelected} recipient{totalSelected === 1 ? '' : 's'} ready
                  </p>
                </div>
                <span className="rounded-full border border-cyan-300/20 bg-black/20 px-2.5 py-1 text-[10px] font-display font-black uppercase tracking-[0.16em] text-cyan-100/80">
                  {submitLabel}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedSquads.map((conv) => {
                  const convId = String(conv?.id || '').trim();
                  const squadAvatar = conv?.avatar ? getAvatarUrl(conv.avatar) : '';
                  return (
                    <button
                      key={`sel-squad-${convId}`}
                      type="button"
                      onClick={() => handleRemoveSelectedSquad(convId)}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-2.5 py-1.5 text-left text-xs text-gray-100 transition-colors hover:border-cyan-300/25 hover:bg-black/35"
                    >
                      {squadAvatar ? (
                        <img src={squadAvatar} alt="" className="h-5 w-5 rounded-[0.3rem] object-cover" />
                      ) : (
                        <span className="flex h-5 w-5 items-center justify-center rounded-[0.3rem] bg-gradient-to-br from-purple-500 to-pink-500 font-display text-[10px] font-black text-white">
                          {(conv?.title || 'S').slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span className="max-w-[7.5rem] truncate">{conv?.title || 'Squad'}</span>
                      <span className="text-gray-400">x</span>
                    </button>
                  );
                })}
                {selectedUsers.map((user) => {
                  const userId = String(user?.id || '').trim();
                  return (
                    <button
                      key={`sel-user-${userId}`}
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
            {filteredSquads.length > 0 ? (
              <>
                <div className="px-1 pb-1 text-[10px] font-display font-bold uppercase tracking-[0.18em] text-gray-500">
                  Squads
                </div>
                {filteredSquads.map((conv) => {
                  const convId = String(conv?.id || '').trim();
                  const isSelecting = selectingId === `conv-${convId}`;
                  const isSelected = selectedSquadIds.has(convId);
                  const squadAvatar = conv?.avatar ? getAvatarUrl(conv.avatar) : '';
                  return (
                    <button
                      key={`squad-${convId}`}
                      type="button"
                      onClick={() => handleSelectConversation(conv)}
                      disabled={multiSelect ? submitting : (!!selectingId || submitting)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors disabled:opacity-60 ${
                        isSelected
                          ? 'border-cyan-300/35 bg-cyan-500/10'
                          : 'border-piu-border/50 bg-piu-dark/45 hover:border-cyan-400/35 hover:bg-piu-dark/65'
                      }`}
                    >
                      {squadAvatar ? (
                        <img src={squadAvatar} alt="" className="h-11 w-11 rounded-xl object-cover" />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 font-display font-black text-sm text-white">
                          {(conv?.title || 'S').slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-display font-black text-white">{conv?.title || 'Untitled squad'}</p>
                        <p className="mt-0.5 truncate text-xs text-gray-500">
                          {conv?.member_count ? `${conv.member_count} member${conv.member_count === 1 ? '' : 's'}` : 'Squad'}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-md border px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-[0.18em] ${
                        isSelected
                          ? 'border-cyan-300/35 bg-cyan-400/14 text-white'
                          : 'border-cyan-400/25 bg-cyan-500/10 text-cyan-100'
                      }`}>
                        {multiSelect ? (isSelected ? 'Added' : 'Add') : (isSelecting ? 'Sending...' : selectLabel)}
                      </span>
                    </button>
                  );
                })}
              </>
            ) : null}
            {!showSearchResults && recentUsers.length > 0 ? (
              <div className="px-1 pb-1 text-[10px] font-display font-bold uppercase tracking-[0.18em] text-gray-500">
                {filteredSquads.length > 0 ? 'Players' : 'Recent'}
              </div>
            ) : null}
            {showSearchResults && loading ? (
              <div className="rounded-xl border border-piu-border/50 bg-piu-dark/40 px-4 py-5 text-center text-sm text-gray-400">
                Searching players...
              </div>
            ) : visibleUsers.length === 0 && filteredSquads.length === 0 ? (
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
              {totalSelected > 0
                ? `${totalSelected} recipient${totalSelected === 1 ? '' : 's'} selected`
                : 'Select players or squads'}
            </p>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || totalSelected === 0}
              className="rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-4 py-2.5 text-sm font-display font-black text-cyan-100 transition-colors hover:border-cyan-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Sharing...' : `${submitLabel}${totalSelected > 0 ? ` (${totalSelected})` : ''}`}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
