import React from 'react';

export default function MentionSuggestionsPanel({
  open = false,
  loading = false,
  users = [],
  onSelect,
  className = '',
  emptyLabel = 'No matching players',
}) {
  if (!open && !loading) return null;

  const rows = Array.isArray(users) ? users : [];

  return (
    <div
      className={`absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-[1.15rem] border border-white/12 bg-[#0c1221]/96 shadow-[0_18px_44px_rgba(0,0,0,0.45)] backdrop-blur-xl ${className}`.trim()}
    >
      <div className="max-h-56 overflow-y-auto p-2">
        {loading && rows.length === 0 ? (
          <p className="px-3 py-2 text-sm text-gray-400">Searching players...</p>
        ) : rows.length === 0 ? (
          <p className="px-3 py-2 text-sm text-gray-500">{emptyLabel}</p>
        ) : (
          rows.map((entry) => (
            <button
              key={`${entry.id}:${entry.username}`}
              type="button"
              onClick={() => onSelect?.(entry.username)}
              className="flex w-full items-center gap-3 rounded-[0.95rem] px-3 py-2 text-left transition-colors hover:bg-white/8"
            >
              {entry.avatar ? (
                <img src={entry.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-sm font-display font-black text-white">
                  {entry.username.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-display font-black text-white">@{entry.username}</p>
                <p className="mt-0.5 text-[11px] text-gray-500">Mention player</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
