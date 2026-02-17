import React from 'react';

export default function CommunityTag({ name, color = '#ff3366', textColor = '#ffffff' }) {
  if (!name) return null;

  return (
    <span
      className="inline-flex items-center text-[9px] font-display font-bold px-1.5 py-0.5 rounded whitespace-nowrap leading-tight"
      style={{ backgroundColor: color, color: textColor }}
    >
      {name}
    </span>
  );
}

export function CommunityTagList({ tags = [] }) {
  if (!tags || tags.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      {tags.map(tag => (
        <CommunityTag key={tag.id} name={tag.name} color={tag.color} textColor={tag.text_color} />
      ))}
    </span>
  );
}
