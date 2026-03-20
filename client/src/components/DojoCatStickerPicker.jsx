import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { STICKER_GROUPS } from '../utils/stickers';
import StickerAsset from './StickerAsset';

export default function DojoCatStickerPicker({
  onSelect,
  buttonClassName = '',
  panelClassName = '',
  compact = false,
  align = 'left',
}) {
  const [open, setOpen] = useState(false);
  const [isMobileSheet, setIsMobileSheet] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  ));
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open || isMobileSheet) return undefined;
    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [open, isMobileSheet]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleResize = () => setIsMobileSheet(window.innerWidth < 640);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!open || !isMobileSheet) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open, isMobileSheet]);

  const handleSelect = (token) => {
    onSelect?.(token);
    setOpen(false);
  };

  const pickerContent = (
    <>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-display text-cyan-300">Stickers</p>
          <p className="mt-1 text-[11px] text-gray-400">Tap a sticker to drop it into the current message.</p>
        </div>
        {isMobileSheet ? (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="shrink-0 rounded-lg px-2 py-1 text-[11px] text-gray-400 transition-colors hover:bg-piu-dark/60 hover:text-white"
          >
            Close
          </button>
        ) : null}
      </div>
      <div className="space-y-4">
        {STICKER_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-2 text-[10px] font-display text-gray-400">{group.label}</p>
            <div className={`grid gap-1.5 ${isMobileSheet ? 'grid-cols-4' : 'grid-cols-5 sm:grid-cols-6'}`}>
              {group.emojis.map((emoji) => (
                <button
                  key={emoji.id}
                  type="button"
                  onClick={() => handleSelect(emoji.token)}
                  className={`flex w-full items-center justify-center rounded-lg border border-white/8 bg-black/20 transition-colors hover:bg-piu-dark/50 ${isMobileSheet ? 'h-14' : 'h-12'}`}
                  title={emoji.label}
                >
                  <StickerAsset
                    sticker={emoji}
                    alt={emoji.label}
                    title={emoji.label}
                    className={`${isMobileSheet ? 'h-9 w-9' : 'h-8 w-8'} object-contain`}
                  />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );

  const mobileSheet = open && isMobileSheet && typeof document !== 'undefined'
    ? createPortal(
      <div className="fixed inset-0 z-[140] sm:hidden">
        <button
          type="button"
          aria-label="Close sticker picker"
          onClick={() => setOpen(false)}
          className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        />
        <div
          className="absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] max-h-[72vh] overflow-hidden rounded-2xl border border-piu-border bg-piu-card p-3 shadow-2xl"
          ref={rootRef}
        >
          <div className="max-h-[calc(72vh-1.5rem)] overflow-y-auto pr-1">
            {pickerContent}
          </div>
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors ${compact ? 'p-1.5 text-sm' : 'w-8 h-8 text-[18px] leading-none'} ${buttonClassName}`.trim()}
        title="Stickers"
      >
        🐾
      </button>

      {open && !isMobileSheet ? (
        <div
          className={`absolute bottom-full mb-2 z-50 w-[min(20rem,calc(100vw-1.5rem))] max-h-[70vh] overflow-y-auto rounded-xl border border-piu-border bg-piu-card p-3 shadow-2xl ${align === 'right' ? 'right-0' : 'left-0'} ${panelClassName}`.trim()}
        >
          {pickerContent}
        </div>
      ) : null}

      {mobileSheet}
    </div>
  );
}
