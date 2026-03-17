import React from 'react';
import { Link } from 'react-router-dom';
import { getProfilePathByUsername } from './profile';
import { getStickerEmoji, isStickerOnlyMessage, STICKER_TOKEN_PATTERN, STICKER_TOKEN_REGEX } from './stickers';
import StickerAsset from '../components/StickerAsset';

const INLINE_TOKEN_REGEX = new RegExp(`(${STICKER_TOKEN_PATTERN}|(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{2,30}))`, 'g');

function renderStickerOnlyMessage(text, keyRef) {
  const raw = String(text || '');
  if (!isStickerOnlyMessage(raw)) return null;

  const tokens = raw.match(STICKER_TOKEN_REGEX) || [];
  const stickers = tokens
    .map((token) => getStickerEmoji(token))
    .filter(Boolean);

  if (stickers.length === 0) return null;

  const largeClass = stickers.length === 1 ? 'h-24 w-24' : 'h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]';

  return (
    <div key={keyRef.value++} className="flex flex-wrap items-end gap-2">
      {stickers.map((sticker, index) => (
        <StickerAsset
          key={`${sticker.id}-${index}`}
          sticker={sticker}
          alt={sticker.label}
          title={sticker.label}
          className={`${largeClass} rounded-xl object-contain`}
        />
      ))}
    </div>
  );
}

function renderInlineTokens(text, keyRef) {
  if (!text) return [];
  const parts = [];
  let lastIndex = 0;
  let match;

  INLINE_TOKEN_REGEX.lastIndex = 0;
  while ((match = INLINE_TOKEN_REGEX.exec(text)) !== null) {
    const token = match[1] || '';
    const sticker = getStickerEmoji(token);

    if (sticker) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      parts.push(
        <StickerAsset
          key={keyRef.value++}
          sticker={sticker}
          alt={sticker.label}
          title={sticker.label}
          className="mx-0.5 inline-block h-8 w-8 rounded-md object-contain align-middle"
        />
      );
      lastIndex = match.index + token.length;
      continue;
    }

    const full = match[0] || '';
    const prefix = match[2] || '';
    const username = match[3] || '';
    const atIndex = match.index + prefix.length;

    if (atIndex > lastIndex) {
      parts.push(text.slice(lastIndex, atIndex));
    }

    parts.push(
      <Link
        key={keyRef.value++}
        to={getProfilePathByUsername(username)}
        className="text-piu-accent hover:underline"
      >
        @{username}
      </Link>
    );

    lastIndex = match.index + full.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

// Render markdown-style bold, italic, strikethrough in post content
export function renderFormattedText(text) {
  if (!text) return null;
  const parts = [];
  const keyRef = { value: 0 };
  const stickerOnly = renderStickerOnlyMessage(text, keyRef);
  if (stickerOnly) return stickerOnly;

  const combined = /(\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~)/g;
  let lastIndex = 0;
  let match;

  while ((match = combined.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...renderInlineTokens(text.slice(lastIndex, match.index), keyRef));
    }

    if (match[2]) {
      parts.push(
        <strong key={keyRef.value++} className="font-bold">
          {renderInlineTokens(match[2], keyRef)}
        </strong>
      );
    } else if (match[3]) {
      parts.push(
        <em key={keyRef.value++}>
          {renderInlineTokens(match[3], keyRef)}
        </em>
      );
    } else if (match[4]) {
      parts.push(
        <span key={keyRef.value++} className="line-through text-gray-500">
          {renderInlineTokens(match[4], keyRef)}
        </span>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(...renderInlineTokens(text.slice(lastIndex), keyRef));
  }

  return parts.length > 0 ? parts : text;
}
