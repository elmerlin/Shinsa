import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { searchUsers } from '../../utils/api';
import { useMentionComposer } from '../../hooks/useMentionComposer';
import { getStickerEmoji } from '../../utils/stickers';
import { renderStoryToBlob } from '../../utils/storyCanvasRenderer';
import MentionSuggestionsPanel from '../MentionSuggestionsPanel';
import DojoCatStickerPicker from '../DojoCatStickerPicker';
import StickerAsset from '../StickerAsset';
import ScoreSnapshotCard from '../ScoreSnapshotCard';
import TextStoryEditor from './TextStoryEditor';
import ImageCanvasEditor from './ImageCanvasEditor';
import {
  CANVAS_ASPECT,
  GRADIENT_PRESETS,
  THEME_PRESETS,
  FONT_SIZES,
} from './StoryComposerConstants';

// ── score tab ──────────────────────────────────────────────────────────

function ScoreTab({ scoreOptions, selectedSource, onSelect, caption, onCaptionChange, captionRef, mentionProps }) {
  const selectedScore = scoreOptions.find((o) => o.value === selectedSource) || null;

  return (
    <div className="flex h-full flex-col gap-3">
      {scoreOptions.length > 0 ? (
        <div className="scrollbar-none max-h-48 space-y-2 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {scoreOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelect(option.value)}
              className={`flex w-full items-start justify-between rounded-xl border px-3 py-2.5 text-left transition-colors ${
                selectedSource === option.value
                  ? 'border-cyan-300/35 bg-cyan-500/12 text-white'
                  : 'border-white/10 bg-white/6 text-gray-200 hover:bg-white/8'
              }`}
            >
              <span>
                <span className="block font-display text-sm font-black">{option.label}</span>
                <span className="mt-0.5 block text-xs text-gray-400">{option.subtitle}</span>
              </span>
              <span className="text-xs text-gray-500">{option.timeLabel}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-gray-300">
          No recent upscores or clears to turn into a story yet.
        </p>
      )}

      {/* caption */}
      <div className="relative">
        <MentionSuggestionsPanel
          open={mentionProps.showMentions || mentionProps.mentionLoading}
          loading={mentionProps.mentionLoading}
          users={mentionProps.mentionUsers}
          onSelect={mentionProps.applyMention}
        />
        <textarea
          ref={captionRef}
          value={caption}
          onChange={(e) => {
            onCaptionChange(e.target.value);
            mentionProps.updateMentionState(e.target.value, e.target.selectionStart);
          }}
          onClick={(e) => mentionProps.updateMentionState(caption, e.currentTarget.selectionStart)}
          onKeyDown={mentionProps.handleMentionKeyDown}
          maxLength={420}
          rows={3}
          placeholder="Add a caption to your score snapshot"
          className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-cyan-400/30 focus:outline-none"
        />
      </div>
      <div className="flex items-center justify-end">
        <span className="text-xs text-gray-500">{caption.trim().length}/420</span>
      </div>
    </div>
  );
}

// ── main modal ─────────────────────────────────────────────────────────

export default function StoryComposerModal({
  open,
  scoreOptions = [],
  submitting = false,
  error = '',
  onClose,
  onSubmit,
}) {
  const defaultImageLayout = useMemo(() => ({
    fitMode: 'contain',
    positionX: 50,
    positionY: 50,
  }), []);
  const [mode, setMode] = useState('text'); // 'text' | 'image' | 'score'
  const [rendering, setRendering] = useState(false);

  // text state
  const [text, setText] = useState('');
  const [textStyle, setTextStyle] = useState({
    mode: 'gradient',
    gradientId: GRADIENT_PRESETS[0].id,
    themeId: THEME_PRESETS[0].id,
    fontSizeId: 'md',
    textAlign: 'center',
    textColor: '#ffffff',
  });

  // image state
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [overlayItems, setOverlayItems] = useState([]);
  const [imageLayout, setImageLayout] = useState(defaultImageLayout);

  // score state
  const [selectedSource, setSelectedSource] = useState('');
  const [scoreCaption, setScoreCaption] = useState('');
  const [scoreStickerTokens, setScoreStickerTokens] = useState([]);

  // shared
  const captionRef = useRef(null);
  const { user: authUser } = useAuth();

  const {
    mentionUsers,
    mentionLoading,
    showMentions,
    updateMentionState,
    applyMention,
    handleKeyDown: handleMentionKeyDown,
    clearMentions,
  } = useMentionComposer({
    value: scoreCaption,
    setValue: setScoreCaption,
    inputRef: captionRef,
    enabled: open && mode === 'score',
    searchMentions: searchUsers,
    excludeUserIds: [authUser?.id].filter(Boolean),
  });

  // reset on open
  useEffect(() => {
    if (!open) return;
    setMode('text');
    setText('');
    setTextStyle({
      mode: 'gradient',
      gradientId: GRADIENT_PRESETS[0].id,
      themeId: THEME_PRESETS[0].id,
      fontSizeId: 'md',
      textAlign: 'center',
      textColor: '#ffffff',
    });
    setImageFile(null);
    setImagePreview('');
    setOverlayItems([]);
    setImageLayout(defaultImageLayout);
    setSelectedSource(scoreOptions[0]?.value || '');
    setScoreCaption('');
    setScoreStickerTokens([]);
    setRendering(false);
  }, [defaultImageLayout, open, scoreOptions]);

  // image preview blob
  useEffect(() => {
    if (!imageFile) {
      setImagePreview('');
      return undefined;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    if (!imagePreview) return undefined;

    let cancelled = false;
    const probe = new Image();
    probe.onload = () => {
      if (cancelled) return;
      const nextFitMode = probe.width / probe.height > CANVAS_ASPECT ? 'contain' : 'fill';
      setImageLayout({
        fitMode: nextFitMode,
        positionX: 50,
        positionY: 50,
      });
    };
    probe.src = imagePreview;

    return () => {
      cancelled = true;
    };
  }, [imagePreview]);

  useEffect(() => {
    if (!open) clearMentions();
  }, [clearMentions, open]);

  // ── submit ───────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (rendering || submitting) return;

    // score mode — no canvas rendering needed
    if (mode === 'score') {
      const selected = scoreOptions.find((o) => o.value === selectedSource);
      if (!selected) return;
      onSubmit?.({
        storyType: 'score_snapshot',
        caption: scoreCaption.trim(),
        sourceKind: selected.sourceKind,
        sourceId: selected.sourceId,
        stickerTokens: scoreStickerTokens,
      });
      return;
    }

    // text or image mode — render to canvas blob
    setRendering(true);
    try {
      let scene;

      if (mode === 'text') {
        const isThemed = textStyle.mode === 'themed';
        const activeGradient = GRADIENT_PRESETS.find((g) => g.id === textStyle.gradientId) || GRADIENT_PRESETS[0];
        const activeTheme = THEME_PRESETS.find((t) => t.id === textStyle.themeId) || THEME_PRESETS[0];
        const activeFontSize = FONT_SIZES.find((f) => f.id === textStyle.fontSizeId) || FONT_SIZES[1];

        scene = {
          backgroundType: isThemed ? 'themed' : 'gradient',
          backgroundCSS: isThemed ? undefined : activeGradient.css,
          theme: isThemed ? activeTheme : undefined,
          centerText: text.trim() ? {
            text: text.trim(),
            fontSize: activeFontSize.canvas,
            color: isThemed ? activeTheme.textColor : textStyle.textColor,
            align: textStyle.textAlign,
            fontWeight: 800,
          } : undefined,
        };
      } else {
        // image mode
        let imageDataUrl = '';
        if (imageFile) {
          imageDataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(imageFile);
          });
        }

        const textLayers = overlayItems
          .filter((i) => i.type === 'text')
          .map((i) => ({
            text: i.text,
            x: i.x,
            y: i.y,
            color: i.color,
            bgOpacity: i.bgOpacity || 0,
            fontSize: 64,
          }));

        const stickerLayers = overlayItems
          .filter((i) => i.type === 'sticker')
          .map((i) => ({
            imageUrl: i.imageUrl,
            x: i.x,
            y: i.y,
            size: i.size,
          }));

        const linkItem = overlayItems.find((i) => i.type === 'link');
        const linkBadge = linkItem ? { url: linkItem.url, x: linkItem.x, y: linkItem.y } : undefined;

        scene = {
          backgroundType: 'image',
          imageDataUrl,
          imageFitMode: imageLayout.fitMode,
          imagePositionX: imageLayout.positionX,
          imagePositionY: imageLayout.positionY,
          textLayers,
          stickerLayers,
          linkBadge,
        };
      }

      const blob = await renderStoryToBlob(scene);
      const file = new File([blob], 'story.jpg', { type: 'image/jpeg' });

      onSubmit?.({
        storyType: 'image',
        caption: '',
        imageFile: file,
        stickerTokens: [],
      });
    } catch (err) {
      console.error('Story render failed:', err);
    } finally {
      setRendering(false);
    }
  }, [mode, text, textStyle, imageFile, overlayItems, imageLayout, selectedSource, scoreCaption, scoreStickerTokens, scoreOptions, rendering, submitting, onSubmit]);

  // ── can submit? ──────────────────────────────────────────────────────

  const canSubmit = useMemo(() => {
    if (mode === 'text') return !!text.trim();
    if (mode === 'image') return !!imageFile;
    if (mode === 'score') return !!scoreOptions.find((o) => o.value === selectedSource);
    return false;
  }, [mode, text, imageFile, selectedSource, scoreOptions]);

  if (!open) return null;

  // ── render ───────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[160] flex flex-col bg-[#060a12] sm:items-center sm:justify-center sm:bg-black/80 sm:backdrop-blur-sm">
      {/* sm+ backdrop dismiss */}
      <button type="button" onClick={onClose} className="absolute inset-0 hidden sm:block" aria-label="Close" />

      <div className="relative z-10 flex h-full w-full flex-col sm:h-[min(90vh,52rem)] sm:max-w-lg sm:rounded-[1.5rem] sm:border sm:border-white/10 sm:bg-[#060a12] sm:shadow-[0_24px_70px_rgba(0,0,0,0.5)]">
        {/* ── header ── */}
        <div className="flex items-center justify-between px-4 pb-2 pt-4 sm:px-5">
          <div>
            <p className="text-[10px] font-display font-bold uppercase tracking-[0.18em] text-cyan-200/80">Story</p>
            <h2 className="font-display text-lg font-black text-white">Create</h2>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-gray-400 hover:text-white">
            Close
          </button>
        </div>

        {/* ── mode switcher ── */}
        <div className="flex gap-1 px-4 pb-3 sm:px-5">
          <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-0.5">
            {[
              { value: 'text', label: 'Text', icon: <path strokeLinecap="round" d="M4 7V4h16v3M9 20h6M12 4v16" /> },
              { value: 'image', label: 'Image', icon: <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" /> },
              { value: 'score', label: 'Score', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /> },
            ].map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setMode(tab.value)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-display font-bold transition-colors ${
                  mode === tab.value ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5">
                  {tab.icon}
                </svg>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── editor area ── */}
        <div className="flex-1 overflow-y-auto px-4 pb-3 sm:px-5">
          {mode === 'text' ? (
            <TextStoryEditor
              text={text}
              onTextChange={setText}
              style={textStyle}
              onStyleChange={setTextStyle}
            />
          ) : null}

          {mode === 'image' ? (
            !imageFile ? (
              <div className="flex h-full items-center justify-center">
                <label className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-white/12 bg-white/3 px-12 py-16 text-center transition-colors hover:border-white/20 hover:bg-white/5">
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-10 w-10 text-gray-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                  </svg>
                  <span className="text-sm font-display font-bold text-gray-400">Tap to choose an image</span>
                  <span className="text-xs text-gray-500">Add text, stickers &amp; links on top</span>
                </label>
              </div>
            ) : (
              <ImageCanvasEditor
                imagePreview={imagePreview}
                overlayState={overlayItems}
                onOverlayChange={setOverlayItems}
                imageLayout={imageLayout}
                onImageLayoutChange={setImageLayout}
              />
            )
          ) : null}

          {mode === 'score' ? (
            <div className="space-y-3">
              <ScoreTab
                scoreOptions={scoreOptions}
                selectedSource={selectedSource}
                onSelect={setSelectedSource}
                caption={scoreCaption}
                onCaptionChange={setScoreCaption}
                captionRef={captionRef}
                mentionProps={{
                  mentionUsers,
                  mentionLoading,
                  showMentions,
                  updateMentionState,
                  applyMention,
                  handleMentionKeyDown,
                }}
              />
              {/* sticker row for score */}
              <div className="flex items-center gap-2">
                <DojoCatStickerPicker
                  compact
                  onSelect={(token) => setScoreStickerTokens((prev) => [...prev, token])}
                  buttonClassName="h-9 w-9 rounded-full border border-white/10 bg-white/5 text-base text-gray-400 hover:bg-white/10"
                  align="left"
                />
                {scoreStickerTokens.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {scoreStickerTokens.map((token, i) => {
                      const sticker = getStickerEmoji(token);
                      if (!sticker) return null;
                      return (
                        <button
                          key={`${token}-${i}`}
                          type="button"
                          onClick={() => setScoreStickerTokens((prev) => prev.filter((_, idx) => idx !== i))}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 p-1"
                          title="Remove sticker"
                        >
                          <StickerAsset sticker={sticker} alt={sticker.label} title={sticker.label} className="h-full w-full object-contain" />
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* ── footer ── */}
        <div className="border-t border-white/8 px-4 py-3 sm:px-5">
          {error ? <p className="mb-2 text-sm text-red-300">{error}</p> : null}
          <div className="flex items-center justify-between">
            {mode === 'image' && imageFile ? (
              <button
                type="button"
                onClick={() => { setImageFile(null); setOverlayItems([]); setImageLayout(defaultImageLayout); }}
                className="text-xs text-gray-400 hover:text-white"
              >
                Change image
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting || rendering}
              className="rounded-full bg-cyan-500 px-5 py-2.5 text-sm font-display font-black text-white transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {rendering ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Rendering...
                </span>
              ) : submitting ? 'Sharing...' : 'Add story'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
