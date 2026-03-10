import React, { useEffect, useRef, useState } from 'react';

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
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isEditing || !inputRef.current) return;
    inputRef.current.focus();
    inputRef.current.select();
  }, [isEditing]);

  useEffect(() => {
    if (saving) return;
    if (String(statusText || '') === String(liveStatusText || '')) {
      setIsEditing(false);
    }
  }, [liveStatusText, saving, statusText]);

  const handleStartEditing = () => {
    if (!isHost) return;
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    onChange?.(currentStatus);
    setIsEditing(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onSubmit?.();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      handleCancelEditing();
    }
  };

  return (
    <div className="w-full rounded-lg border border-piu-border/60 bg-piu-dark/60 px-3 py-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.18)]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-display font-semibold uppercase tracking-[0.22em] text-cyan-100/85">
          Status
        </span>
        {isHost && !isEditing ? (
          <span className="text-[10px] text-gray-500">Click to edit</span>
        ) : null}
        {isHost && isEditing ? (
          <span className="text-[10px] text-gray-500">{Math.max(0, 160 - draftStatus.length)} left</span>
        ) : null}
      </div>

      {isHost && isEditing ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            ref={inputRef}
            value={statusText}
            onChange={(e) => onChange?.(e.target.value)}
            onKeyDown={handleKeyDown}
            className="input-field min-w-0 flex-1 py-2 text-sm"
            placeholder="What are you doing right now?"
            maxLength={160}
          />
          <button type="button" onClick={onSubmit} disabled={saving} className="btn-secondary shrink-0 px-3 py-2 text-xs">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      ) : isHost ? (
        <button
          type="button"
          onClick={handleStartEditing}
          className="mt-1.5 block w-full rounded-md text-left transition-colors hover:text-white"
        >
          <span className={`block truncate font-display ${currentStatus ? 'text-lg font-black text-white' : 'text-sm font-semibold text-gray-400'}`}>
            {currentStatus || 'Add a short one-line update'}
          </span>
        </button>
      ) : (
        <p className="mt-1.5 truncate font-display text-base font-bold text-white">
          {currentStatus}
        </p>
      )}
    </div>
  );
}
