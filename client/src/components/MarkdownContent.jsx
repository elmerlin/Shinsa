import React from 'react';

const SAFE_URL_PATTERN = /^(https?:\/\/|mailto:|\/)/i;

function sanitizeUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return null;
  if (!SAFE_URL_PATTERN.test(value)) return null;
  return value;
}

function renderInline(text, keyPrefix) {
  const parts = [];
  let remaining = String(text || '');
  let key = 0;

  const patterns = [
    { type: 'link', regex: /\[([^\]]+)\]\(([^)\s]+)\)/ },
    { type: 'bold', regex: /\*\*([\s\S]+?)\*\*/ },
    { type: 'code', regex: /`([^`]+)`/ },
    { type: 'strike', regex: /~~([\s\S]+?)~~/ },
    { type: 'italic', regex: /\*([\s\S]+?)\*/ },
  ];

  while (remaining.length > 0) {
    let winner = null;

    for (const pattern of patterns) {
      const match = remaining.match(pattern.regex);
      if (!match) continue;
      if (!winner || match.index < winner.index) {
        winner = { type: pattern.type, match, index: match.index };
      }
    }

    if (!winner) {
      parts.push(remaining);
      break;
    }

    if (winner.index > 0) {
      parts.push(remaining.slice(0, winner.index));
    }

    const full = winner.match[0];
    const content = winner.match[1];

    if (winner.type === 'bold') {
      parts.push(
        <strong key={`${keyPrefix}-${key++}`} className="font-bold text-gray-100">
          {content}
        </strong>
      );
    } else if (winner.type === 'code') {
      parts.push(
        <code key={`${keyPrefix}-${key++}`} className="rounded bg-piu-dark px-1 py-0.5 text-[0.85em] text-piu-accent">
          {content}
        </code>
      );
    } else if (winner.type === 'strike') {
      parts.push(
        <span key={`${keyPrefix}-${key++}`} className="line-through text-gray-500">
          {content}
        </span>
      );
    } else if (winner.type === 'italic') {
      parts.push(
        <em key={`${keyPrefix}-${key++}`} className="italic text-gray-200">
          {content}
        </em>
      );
    } else if (winner.type === 'link') {
      const href = sanitizeUrl(winner.match[2]);
      if (href) {
        const isExternal = /^https?:\/\//i.test(href);
        parts.push(
          <a
            key={`${keyPrefix}-${key++}`}
            href={href}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noopener noreferrer' : undefined}
            className="text-piu-accent underline underline-offset-2 hover:text-piu-accent/80"
          >
            {content}
          </a>
        );
      } else {
        parts.push(full);
      }
    }

    remaining = remaining.slice(winner.index + full.length);
  }

  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : parts;
}

function isBlockStart(trimmedLine) {
  if (!trimmedLine) return false;
  return (
    trimmedLine.startsWith('```') ||
    /^#{1,3}\s+/.test(trimmedLine) ||
    /^>\s?/.test(trimmedLine) ||
    /^[-*]\s+/.test(trimmedLine) ||
    /^\d+\.\s+/.test(trimmedLine) ||
    /^(-{3,}|\*{3,})$/.test(trimmedLine)
  );
}

function renderMarkdownBlocks(text, compact) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const elements = [];
  const bodyClass = compact ? 'text-xs text-gray-300' : 'text-sm text-gray-300';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const codeLines = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      elements.push(
        <pre key={`code-${elements.length}`} className="my-2 overflow-x-auto rounded-lg border border-piu-border/40 bg-piu-dark p-3 text-xs text-gray-200">
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      elements.push(<hr key={`hr-${elements.length}`} className="my-3 border-piu-border/40" />);
      i += 1;
      continue;
    }

    if (/^#{1,3}\s+/.test(trimmed)) {
      const level = trimmed.match(/^(#{1,3})\s+/)[1].length;
      const headingText = trimmed.replace(/^#{1,3}\s+/, '');
      const headingClass = level === 1
        ? 'text-lg sm:text-xl font-bold'
        : level === 2
          ? 'text-base sm:text-lg font-bold'
          : 'text-sm sm:text-base font-bold';
      elements.push(
        <p key={`h-${elements.length}`} className={`${headingClass} font-display text-gray-100 mt-2`}>
          {renderInline(headingText, `h-${elements.length}`)}
        </p>
      );
      i += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      elements.push(
        <blockquote key={`q-${elements.length}`} className="my-2 border-l-2 border-piu-accent/60 pl-3 italic text-gray-300">
          {renderInline(quoteLines.join(' '), `q-${elements.length}`)}
        </blockquote>
      );
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i += 1;
      }
      elements.push(
        <ul key={`ul-${elements.length}`} className="my-2 list-disc space-y-1 pl-5">
          {items.map((item, idx) => (
            <li key={idx} className={bodyClass}>
              {renderInline(item, `ul-${elements.length}-${idx}`)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      elements.push(
        <ol key={`ol-${elements.length}`} className="my-2 list-decimal space-y-1 pl-5">
          {items.map((item, idx) => (
            <li key={idx} className={bodyClass}>
              {renderInline(item, `ol-${elements.length}-${idx}`)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    const paragraphLines = [line];
    i += 1;
    while (i < lines.length) {
      const nextTrim = lines[i].trim();
      if (!nextTrim || isBlockStart(nextTrim)) break;
      paragraphLines.push(lines[i]);
      i += 1;
    }
    elements.push(
      <p key={`p-${elements.length}`} className={`${bodyClass} my-1 leading-relaxed`}>
        {renderInline(paragraphLines.join(' '), `p-${elements.length}`)}
      </p>
    );
  }

  return elements;
}

export default function MarkdownContent({ text, className = '', compact = false }) {
  if (!text) return null;
  return (
    <div className={className}>
      {renderMarkdownBlocks(text, compact)}
    </div>
  );
}
