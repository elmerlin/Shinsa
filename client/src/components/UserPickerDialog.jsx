import React, { useEffect, useMemo, useRef, useState } from 'react';
import { searchUsers } from '../utils/api';
import { getAvatarUrl } from './AvatarPicker';
import { getCountryFlag } from './PlayerRegistration';

export default function UserPickerDialog({
  open = false,
  title = 'Start a conversation',
  description = 'Search for a player to message.',
  onClose,
  onSelect,
  excludeUserIds = [],
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectingId, setSelectingId] = useState('');
  const inputRef = useRef(null);

  const excludedIds = useMemo(() => new Set((excludeUserIds || []).map((value) => String(value || '').trim())), [excludeUserIds]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults([]);
    setError('');
    setSelectingId('');
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 30);
    return () => clearTimeout(timer);
  }, [open]);

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

  const handleSelect = async (user) => {
    if (!user?.id || !onSelect || selectingId) return;
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

  return (
    <div className="fixed inset-0 z-[80] bg-black/80 px-4 py-6 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-auto w-full max-w-lg rounded-2xl border border-piu-border bg-piu-card shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-piu-border/50 px-4 py-3">
          <div>
            <p className="text-[10px] font-display font-bold uppercase tracking-[0.24em] text-cyan-300">Direct Messages</p>
            <h3 className="mt-1 text-lg font-display font-black text-white">{title}</h3>
            {description ? <p className="mt-1 text-sm text-gray-400">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-piu-border/60 bg-piu-dark/70 px-3 py-1 text-xs font-display font-bold text-gray-300 transition-colors hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="p-4">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search players by username"
            className="input-field w-full"
            maxLength={80}
          />

          <div className="mt-3 space-y-2">
            {query.trim().length < 2 ? (
              <div className="rounded-xl border border-piu-border/50 bg-piu-dark/40 px-4 py-5 text-center text-sm text-gray-500">
                Type at least 2 characters to search.
              </div>
            ) : loading ? (
              <div className="rounded-xl border border-piu-border/50 bg-piu-dark/40 px-4 py-5 text-center text-sm text-gray-400">
                Searching players...
              </div>
            ) : results.length === 0 ? (
              <div className="rounded-xl border border-piu-border/50 bg-piu-dark/40 px-4 py-5 text-center text-sm text-gray-500">
                No matching players found.
              </div>
            ) : (
              results.map((user) => {
                const userId = String(user?.id || '').trim();
                const isSelecting = selectingId === userId;
                const flag = getCountryFlag(user?.nationality || user?.location_country_code || user?.country_code);
                return (
                  <button
                    key={userId}
                    type="button"
                    onClick={() => handleSelect(user)}
                    disabled={!!selectingId}
                    className="flex w-full items-center gap-3 rounded-xl border border-piu-border/50 bg-piu-dark/45 px-3 py-3 text-left transition-colors hover:border-cyan-400/35 hover:bg-piu-dark/65 disabled:opacity-60"
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
                    <span className="shrink-0 rounded-md border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-[0.18em] text-cyan-100">
                      {isSelecting ? 'Opening...' : 'Message'}
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
      </div>
    </div>
  );
}
