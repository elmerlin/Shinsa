import React, { useState, useRef, useEffect } from 'react';
import useDragOverlay from '../../hooks/useDragOverlay';
import DojoCatStickerPicker from '../DojoCatStickerPicker';
import StickerAsset from '../StickerAsset';
import { getStickerEmoji } from '../../utils/stickers';
import { OVERLAY_TEXT_COLORS } from './StoryComposerConstants';

// ── overlay item renderers ─────────────────────────────────────────────

function OverlayItem({ item, onPointerDown, onRemove, onUpdate }) {
  if (item.type === 'text') {
    return (
      <div
        onPointerDown={(e) => onPointerDown(e, item.id)}
        className="absolute z-20 cursor-grab touch-none select-none active:cursor-grabbing"
        style={{
          left: `${item.x}%`,
          top: `${item.y}%`,
          transform: 'translate(-50%, -50%)',
        }}
      >
        <div className="group relative">
          <p
            className="whitespace-pre-wrap rounded-lg px-3 py-1.5 font-display text-xl font-black sm:text-2xl"
            style={{
              color: item.color || '#ffffff',
              textShadow: '0 2px 8px rgba(0,0,0,0.5)',
              backgroundColor: item.bgOpacity ? `rgba(0,0,0,${item.bgOpacity})` : 'transparent',
              maxWidth: '70vw',
              wordBreak: 'break-word',
            }}
          >
            {item.text}
          </p>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
            className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white group-hover:flex"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  if (item.type === 'sticker') {
    const sticker = getStickerEmoji(item.token);
    if (!sticker) return null;
    return (
      <div
        onPointerDown={(e) => onPointerDown(e, item.id)}
        className="absolute z-20 cursor-grab touch-none select-none active:cursor-grabbing"
        style={{
          left: `${item.x}%`,
          top: `${item.y}%`,
          transform: 'translate(-50%, -50%)',
          width: `${item.size || 14}%`,
          height: `${item.size || 14}%`,
        }}
      >
        <div className="group relative h-full w-full">
          <StickerAsset sticker={sticker} alt={sticker.label} className="h-full w-full object-contain" />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
            className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white group-hover:flex"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  if (item.type === 'link') {
    let domain = '';
    try { domain = new URL(item.url).hostname.replace('www.', ''); } catch { domain = item.url; }
    return (
      <div
        onPointerDown={(e) => onPointerDown(e, item.id)}
        className="absolute z-20 cursor-grab touch-none select-none active:cursor-grabbing"
        style={{
          left: `${item.x}%`,
          top: `${item.y}%`,
          transform: 'translate(-50%, -50%)',
        }}
      >
        <div className="group relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-display font-bold text-white backdrop-blur-sm">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3 w-3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.02a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.374" />
            </svg>
            {domain}
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
            className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white group-hover:flex"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ── main editor ────────────────────────────────────────────────────────

export default function ImageCanvasEditor({
  imagePreview,
  overlayState,
  onOverlayChange,
  imageLayout,
  onImageLayoutChange,
}) {
  const { items, containerRef, addItem, removeItem, updateItem, handlePointerDown, setItems } = useDragOverlay();
  const [activeTool, setActiveTool] = useState(null); // 'text' | 'sticker' | 'link' | null
  const [textInput, setTextInput] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [textBgOpacity, setTextBgOpacity] = useState(0.5);
  const [linkInput, setLinkInput] = useState('');
  const textInputRef = useRef(null);
  const fitMode = imageLayout?.fitMode || 'contain';
  const positionX = imageLayout?.positionX ?? 50;
  const positionY = imageLayout?.positionY ?? 50;

  // sync items up to parent
  useEffect(() => {
    onOverlayChange?.(items);
  }, [items, onOverlayChange]);

  // restore items from parent state
  useEffect(() => {
    if (overlayState && overlayState.length !== items.length) {
      setItems(overlayState);
    }
  }, []); // only on mount

  const addText = () => {
    if (!textInput.trim()) return;
    addItem({ type: 'text', text: textInput.trim(), color: textColor, bgOpacity: textBgOpacity });
    setTextInput('');
    setActiveTool(null);
  };

  const addLink = () => {
    let url = linkInput.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    addItem({ type: 'link', url, size: 10 });
    setLinkInput('');
    setActiveTool(null);
  };

  const addSticker = (token) => {
    const sticker = getStickerEmoji(token);
    if (!sticker) return;
    addItem({ type: 'sticker', token, imageUrl: sticker.image, size: 16 });
  };

  const updateImageLayout = (updates) => {
    onImageLayoutChange?.({ ...imageLayout, ...updates });
  };

  return (
    <div className="flex h-full flex-col">
      {/* ── canvas area ── */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden rounded-2xl bg-black"
        style={{ touchAction: 'none' }}
      >
        {imagePreview ? (
          <>
            <img
              src={imagePreview}
              alt=""
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-55 blur-2xl"
              style={{ objectPosition: `${positionX}% ${positionY}%` }}
            />
            <div className="absolute inset-0 bg-[#030712]/45" />
            <img
              src={imagePreview}
              alt=""
              className={`absolute inset-0 h-full w-full transition-[object-position] duration-200 ${
                fitMode === 'fill' ? 'object-cover' : 'object-contain'
              }`}
              style={{ objectPosition: `${positionX}% ${positionY}%` }}
            />
          </>
        ) : null}

        {items.map((item) => (
          <OverlayItem
            key={item.id}
            item={item}
            onPointerDown={handlePointerDown}
            onRemove={removeItem}
            onUpdate={updateItem}
          />
        ))}
      </div>

      {/* ── tool bar ── */}
      <div className="mt-3 space-y-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex rounded-full border border-white/10 bg-black/20 p-0.5">
              {[
                { value: 'contain', label: 'Fit' },
                { value: 'fill', label: 'Fill' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateImageLayout({ fitMode: option.value })}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-display font-bold uppercase tracking-[0.18em] transition-colors ${
                    fitMode === option.value
                      ? 'bg-cyan-500 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400">
              {fitMode === 'fill' ? 'Fill the story and reframe the crop.' : 'Keep the full image visible and nudge it into place.'}
            </p>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-[10px] font-display font-bold uppercase tracking-[0.18em] text-gray-500">X</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={positionX}
                onChange={(e) => updateImageLayout({ positionX: Number(e.target.value) })}
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-cyan-400 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400"
              />
            </label>
            <label className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-[10px] font-display font-bold uppercase tracking-[0.18em] text-gray-500">Y</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={positionY}
                onChange={(e) => updateImageLayout({ positionY: Number(e.target.value) })}
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-cyan-400 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400"
              />
            </label>
          </div>
        </div>

        {/* tool buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTool(activeTool === 'text' ? null : 'text')}
            className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-display font-bold transition-colors ${
              activeTool === 'text'
                ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-100'
                : 'border-white/10 bg-white/5 text-gray-400 hover:text-white'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5"><path strokeLinecap="round" d="M4 7V4h16v3M9 20h6M12 4v16" /></svg>
            Text
          </button>
          <DojoCatStickerPicker
            compact
            onSelect={addSticker}
            buttonClassName={`h-9 w-9 rounded-full border text-base transition-colors ${
              activeTool === 'sticker'
                ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-100'
                : 'border-white/10 bg-white/5 text-gray-400 hover:text-white'
            }`}
            align="left"
          />
          <button
            type="button"
            onClick={() => setActiveTool(activeTool === 'link' ? null : 'link')}
            className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-display font-bold transition-colors ${
              activeTool === 'link'
                ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-100'
                : 'border-white/10 bg-white/5 text-gray-400 hover:text-white'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.02a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.374" /></svg>
            Link
          </button>
        </div>

        {/* text input panel */}
        {activeTool === 'text' ? (
          <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
            <input
              ref={textInputRef}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addText(); }}
              placeholder="Type overlay text..."
              maxLength={100}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-cyan-400/30 focus:outline-none"
              autoFocus
            />
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                {OVERLAY_TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setTextColor(c)}
                    className={`h-5 w-5 rounded-full border transition-transform ${textColor === c ? 'scale-125 border-white' : 'border-transparent'}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={addText}
                disabled={!textInput.trim()}
                className="ml-auto rounded-full bg-cyan-500 px-3 py-1 text-xs font-display font-bold text-white hover:bg-cyan-400 disabled:opacity-50"
              >
                Add
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500">BG</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={textBgOpacity}
                onChange={(e) => setTextBgOpacity(parseFloat(e.target.value))}
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-cyan-400 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400"
              />
              <span className="w-6 text-right text-[10px] text-gray-500">{Math.round(textBgOpacity * 100)}%</span>
            </div>
          </div>
        ) : null}

        {/* link input panel */}
        {activeTool === 'link' ? (
          <div className="flex gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
            <input
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addLink(); }}
              placeholder="https://..."
              className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-cyan-400/30 focus:outline-none"
              autoFocus
            />
            <button
              type="button"
              onClick={addLink}
              disabled={!linkInput.trim()}
              className="rounded-full bg-cyan-500 px-3 py-1 text-xs font-display font-bold text-white hover:bg-cyan-400 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
