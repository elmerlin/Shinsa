import React, { useEffect, useRef, useState } from 'react';
import { DOJO_CAT_EMOJI_GROUP } from '../utils/dojoCatEmojis';

export default function DojoCatStickerPicker({
  onSelect,
  buttonClassName = '',
  panelClassName = '',
  compact = false,
  align = 'left',
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
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
  }, [open]);

  const handleSelect = (token) => {
    onSelect?.(token);
    setOpen(false);
  };

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors ${compact ? 'p-1.5 text-sm' : 'w-8 h-8 text-[18px] leading-none'} ${buttonClassName}`.trim()}
        title="DojoCat stickers"
      >
        🐾
      </button>

      {open ? (
        <div
          className={`absolute top-full mt-2 z-50 w-[min(20rem,calc(100vw-1.5rem))] max-h-[70vh] overflow-y-auto rounded-xl border border-piu-border bg-piu-card p-3 shadow-2xl ${align === 'right' ? 'right-0' : 'left-0'} ${panelClassName}`.trim()}
        >
          <div className="mb-3">
            <p className="text-[10px] font-display text-cyan-300">{DOJO_CAT_EMOJI_GROUP.label}</p>
            <p className="mt-1 text-[11px] text-gray-400">Tap a sticker to drop it into the current message.</p>
          </div>
          <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-6">
            {DOJO_CAT_EMOJI_GROUP.emojis.map((emoji) => (
              <button
                key={emoji.id}
                type="button"
                onClick={() => handleSelect(emoji.token)}
                className="flex h-12 w-full items-center justify-center rounded-lg border border-white/8 bg-black/20 hover:bg-piu-dark/50 transition-colors"
                title={emoji.label}
              >
                <img src={emoji.image} alt={emoji.label} className="h-8 w-8 object-contain" />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
