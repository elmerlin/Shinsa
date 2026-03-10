import React from 'react';

export default function LiveHeaderStatusStrip({
  isHost = false,
  liveStatusText = '',
  statusText = '',
  saving = false,
  onChange,
  onSubmit,
}) {
  const currentStatus = String(liveStatusText || '').trim();
  const draftStatus = String(statusText || '');

  return (
    <div className="mt-3 rounded-lg border border-piu-border/60 bg-piu-dark/60 px-3 py-2.5">
      <div className={`flex min-w-0 gap-2 ${isHost ? 'flex-col sm:flex-row sm:items-center' : 'items-center'}`}>
        <span className="shrink-0 rounded-md border border-piu-border/60 bg-piu-card/70 px-2.5 py-1 text-[10px] font-display font-semibold uppercase tracking-[0.18em] text-gray-300">
          Status
        </span>
        {isHost ? (
          <>
            <input
              value={statusText}
              onChange={(e) => onChange?.(e.target.value)}
              className="input-field min-w-0 flex-1 py-2 text-sm"
              placeholder="What are you doing right now?"
              maxLength={160}
            />
            <button type="button" onClick={onSubmit} disabled={saving} className="btn-secondary shrink-0 px-3 py-2 text-xs">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </>
        ) : (
          <p className="min-w-0 flex-1 truncate text-sm text-gray-200">
            {currentStatus}
          </p>
        )}
      </div>
      {isHost ? (
        <p className="mt-1 text-[11px] text-gray-400">
          {currentStatus || 'Add a short one-line update for viewers and overlays.'}
          <span className="ml-2 text-gray-500">{Math.max(0, 160 - draftStatus.length)} left</span>
        </p>
      ) : null}
    </div>
  );
}
