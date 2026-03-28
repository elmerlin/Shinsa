import React from 'react';
import { Link } from 'react-router-dom';
import { getAvatarUrl } from './AvatarPicker';
import CommunityBadge from './CommunityBadge';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import { getCommunityCardStyle } from '../utils/communityColors';

function parseCommunityIndexTags(raw) {
  const value = String(raw || '').trim();
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((tag) => String(tag || '').trim()).filter(Boolean).slice(0, 4);
    }
  } catch {}
  return value.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 4);
}

function StatPill({ icon, children, tintClass = 'text-zinc-200' }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-black/20 px-2.5 py-1 text-[11px] text-zinc-300">
      <span className={tintClass}>{icon}</span>
      <span>{children}</span>
    </span>
  );
}

export default function CommunityShowcaseCard({ community, palette, action = null, className = '' }) {
  const tags = parseCommunityIndexTags(community?.index_tags);
  const title = community?.display_name || community?.name || 'Community';
  const description = String(community?.description || '').trim() || 'A scene space for posts, sessions, and updates.';

  return (
    <Card
      className={`group relative overflow-hidden border-white/10 transition-transform duration-200 hover:-translate-y-0.5 hover:border-white/15 ${className}`}
      style={getCommunityCardStyle(palette) || undefined}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-br from-white/12 via-transparent to-transparent opacity-60" />

      {action ? (
        <div className="absolute right-4 top-4 z-10" onClick={(event) => event.stopPropagation()}>
          {action}
        </div>
      ) : null}

      <Link to={`/c/${community.name}`} className="block h-full">
        <CardContent className={`relative flex h-full flex-col gap-4 ${action ? 'pr-24' : ''}`}>
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              {community?.avatar ? (
                <img
                  src={getAvatarUrl(community.avatar)}
                  alt={title}
                  className="h-14 w-14 rounded-2xl object-cover ring-1 ring-white/10 shadow-[0_14px_30px_rgba(0,0,0,0.28)]"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-piu-accent/70 to-sky-500/70 font-display text-2xl font-bold text-white ring-1 ring-white/10 shadow-[0_14px_30px_rgba(0,0,0,0.28)]">
                  {title.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {community?.badge_text ? (
                  <CommunityBadge
                    text={community.badge_text}
                    bgColor={community.badge_color}
                    textColor={community.badge_text_color}
                    size="xs"
                  />
                ) : null}
                {community?.is_invite_only ? <Badge variant="warning">Invite Only</Badge> : null}
              </div>

              <h3 className="text-base font-display font-bold text-white transition-colors group-hover:text-piu-accent">
                {title}
              </h3>
              <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-zinc-300/90">
                {description}
              </p>
            </div>
          </div>

          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/8 bg-black/20 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-400"
                >
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-auto flex flex-wrap items-center gap-2">
            <StatPill tintClass="text-cyan-200">
              <span aria-hidden="true">👥</span>
              {community?.member_count || 0} member{Number(community?.member_count || 0) === 1 ? '' : 's'}
            </StatPill>
            <StatPill tintClass="text-rose-200">
              <span aria-hidden="true">✦</span>
              {community?.posts_last_week || 0} posts this week
            </StatPill>
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}
