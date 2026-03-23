import React, { useEffect, useRef, useState } from 'react';

export default function LiveHeaderStatusStrip({
  isHost = false,
  liveStatusText = '',
  statusText = '',
  saving = false,
  compact = false,
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
    <div className={`w-full rounded-lg border border-piu-border/60 bg-piu-dark/60 shadow-[0_2px_8px_rgba(0,0,0,0.18)] ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`font-display font-semibold uppercase tracking-[0.22em] text-cyan-100/85 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
          Status
        </span>
        {isHost && !isEditing ? (
          <span className={`text-gray-500 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>{compact ? 'Tap to edit' : 'Click to edit'}</span>
        ) : null}
        {isHost && isEditing ? (
          <span className={`text-gray-500 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>{Math.max(0, 160 - draftStatus.length)} left</span>
        ) : null}
      </div>

      {isHost && isEditing ? (
        <div className={`mt-2 ${compact ? 'space-y-2' : 'flex items-center gap-2'}`}>
          <input
            ref={inputRef}
            value={statusText}
            onChange={(e) => onChange?.(e.target.value)}
            onKeyDown={handleKeyDown}
            className={`input-field min-w-0 ${compact ? 'w-full py-1.5 text-[13px]' : 'flex-1 py-2 text-sm'}`}
            placeholder="What are you doing right now?"
            maxLength={160}
          />
          <div className={compact ? 'flex justify-end' : ''}>
            <button type="button" onClick={onSubmit} disabled={saving} className={`btn-secondary shrink-0 ${compact ? 'px-2.5 py-1.5 text-[10px]' : 'px-3 py-2 text-xs'}`}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      ) : isHost ? (
        <button
          type="button"
          onClick={handleStartEditing}
          className="mt-1.5 block w-full rounded-md text-left transition-colors hover:text-white"
        >
          <span className={`block truncate font-display ${currentStatus ? (compact ? 'text-sm font-black text-white' : 'text-lg font-black text-white') : (compact ? 'text-[13px] font-semibold text-gray-400' : 'text-sm font-semibold text-gray-400')}`}>
            {currentStatus || 'Add a short one-line update'}
          </span>
        </button>
      ) : (
        <p className={`mt-1.5 truncate font-display font-bold text-white ${compact ? 'text-sm' : 'text-base'}`}>
          {currentStatus}
        </p>
      )}
    </div>
  );
}
