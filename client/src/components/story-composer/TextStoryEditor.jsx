import React, { useState } from 'react';
import { GRADIENT_PRESETS, THEME_PRESETS, FONT_SIZES } from './StoryComposerConstants';

export default function TextStoryEditor({ text, onTextChange, style, onStyleChange }) {
  const [tab, setTab] = useState('gradient'); // 'gradient' | 'themed'

  const gradientId = style.gradientId || GRADIENT_PRESETS[0].id;
  const themeId = style.themeId || THEME_PRESETS[0].id;
  const fontSizeId = style.fontSizeId || 'md';
  const textAlign = style.textAlign || 'center';
  const textColor = style.textColor || '#ffffff';

  const activeGradient = GRADIENT_PRESETS.find((g) => g.id === gradientId) || GRADIENT_PRESETS[0];
  const activeTheme = THEME_PRESETS.find((t) => t.id === themeId) || THEME_PRESETS[0];
  const activeFontSize = FONT_SIZES.find((f) => f.id === fontSizeId) || FONT_SIZES[1];

  const isThemed = tab === 'themed';
  const backgroundCSS = isThemed ? activeTheme.background : activeGradient.css;
  const resolvedTextColor = isThemed ? activeTheme.textColor : textColor;

  return (
    <div className="flex h-full flex-col">
      {/* ── preview area ── */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl">
        <div
          className="absolute inset-0"
          style={{ background: backgroundCSS }}
        />
        {/* themed decorations */}
        {isThemed && activeTheme.decorations && activeTheme.decorations !== 'none' ? (
          <div className="absolute inset-0" style={{ background: activeTheme.decorations }} />
        ) : null}
        {/* themed border */}
        {isThemed && activeTheme.borderColor ? (
          <div
            className="pointer-events-none absolute inset-3 rounded-2xl"
            style={{ border: `1.5px solid ${activeTheme.borderColor}` }}
          />
        ) : null}

        <textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Type your story..."
          maxLength={420}
          className="absolute inset-0 z-10 h-full w-full resize-none bg-transparent px-8 py-8 font-display font-black leading-tight placeholder:opacity-40 focus:outline-none"
          style={{
            fontSize: activeFontSize.css,
            color: resolvedTextColor,
            textAlign,
          }}
        />
      </div>

      {/* ── controls ── */}
      <div className="mt-3 space-y-3">
        {/* tab switcher */}
        <div className="flex gap-1 rounded-full border border-white/10 bg-white/5 p-0.5">
          <button
            type="button"
            onClick={() => { setTab('gradient'); onStyleChange({ ...style, mode: 'gradient' }); }}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-display font-bold transition-colors ${
              tab === 'gradient' ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Gradients
          </button>
          <button
            type="button"
            onClick={() => { setTab('themed'); onStyleChange({ ...style, mode: 'themed' }); }}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-display font-bold transition-colors ${
              tab === 'themed' ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Themes
          </button>
        </div>

        {/* gradient / theme pickers */}
        {tab === 'gradient' ? (
          <div className="scrollbar-none flex gap-2.5 overflow-x-auto py-1 pr-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {GRADIENT_PRESETS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onStyleChange({ ...style, gradientId: g.id })}
                className={`h-10 w-10 shrink-0 rounded-full border-2 transition-transform ${
                  gradientId === g.id ? 'scale-110 border-white' : 'border-transparent hover:scale-105'
                }`}
                style={{ background: g.css }}
                aria-label={g.label}
                title={g.label}
              />
            ))}
          </div>
        ) : (
          <div className="scrollbar-none flex gap-2 overflow-x-auto py-1 pr-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {THEME_PRESETS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onStyleChange({ ...style, themeId: t.id })}
                className={`flex h-9 shrink-0 items-center rounded-full border px-3 text-[10px] font-display font-bold transition-transform ${
                  themeId === t.id
                    ? 'scale-105 border-white/40 bg-white/15 text-white'
                    : 'border-white/10 bg-white/5 text-gray-400 hover:text-white'
                }`}
                style={{ color: t.accentColor }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* font size + alignment */}
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 rounded-full border border-white/10 bg-white/5 p-0.5">
            {FONT_SIZES.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onStyleChange({ ...style, fontSizeId: f.id })}
                className={`h-7 w-7 rounded-full text-[10px] font-display font-bold transition-colors ${
                  fontSizeId === f.id ? 'bg-white/20 text-white' : 'text-gray-500 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onStyleChange({ ...style, textAlign: textAlign === 'center' ? 'left' : 'center' })}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gray-400 transition-colors hover:text-white"
            aria-label="Toggle text alignment"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5">
              {textAlign === 'center' ? (
                <path strokeLinecap="round" d="M3 6h18M6 10h12M3 14h18M6 18h12" />
              ) : (
                <path strokeLinecap="round" d="M3 6h18M3 10h12M3 14h18M3 18h12" />
              )}
            </svg>
          </button>

          <span className="ml-auto text-xs text-gray-500">{text.trim().length}/420</span>
        </div>
      </div>
    </div>
  );
}
