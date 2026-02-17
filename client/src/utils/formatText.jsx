import React from 'react';
import { Link } from 'react-router-dom';
import { getProfilePathByUsername } from './profile';

const MENTION_REGEX = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{2,30})/g;

function renderMentions(text, keyRef) {
  if (!text) return [];
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = MENTION_REGEX.exec(text)) !== null) {
    const full = match[0] || '';
    const prefix = match[1] || '';
    const username = match[2] || '';
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

  const combined = /(\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~)/g;
  let lastIndex = 0;
  let match;

  while ((match = combined.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...renderMentions(text.slice(lastIndex, match.index), keyRef));
    }

    if (match[2]) {
      parts.push(
        <strong key={keyRef.value++} className="font-bold">
          {renderMentions(match[2], keyRef)}
        </strong>
      );
    } else if (match[3]) {
      parts.push(
        <em key={keyRef.value++}>
          {renderMentions(match[3], keyRef)}
        </em>
      );
    } else if (match[4]) {
      parts.push(
        <span key={keyRef.value++} className="line-through text-gray-500">
          {renderMentions(match[4], keyRef)}
        </span>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(...renderMentions(text.slice(lastIndex), keyRef));
  }

  return parts.length > 0 ? parts : text;
}
