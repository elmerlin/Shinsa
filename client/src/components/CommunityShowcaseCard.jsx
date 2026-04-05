import React from 'react';
import { Link } from 'react-router-dom';
import { getAvatarUrl } from './AvatarPicker';
import CommunityBadge from './CommunityBadge';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';

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

export default function CommunityShowcaseCard({ community, palette, action = null, className = '' }) {
  const tags = parseCommunityIndexTags(community?.index_tags);
  const title = community?.display_name || community?.name || 'Community';
  const description = String(community?.description || '').trim() || 'A scene space for posts, sessions, and updates.';
  const memberCount = community?.member_count || 0;
  const postsThisWeek = community?.posts_last_week || 0;

  return (
    <Card
      className={`group relative overflow-hidden border-white/10 bg-[rgba(7,10,18,0.88)] transition-transform duration-200 hover:-translate-y-0.5 hover:border-white/15 ${className}`}
    >
      {action ? (
        <div className="absolute right-3 top-3 z-10" onClick={(event) => event.stopPropagation()}>
          {action}
        </div>
      ) : null}

      <Link to={`/c/${community.name}`} className="block h-full">
        <CardContent className={`relative flex h-full flex-col gap-3 p-4 ${action ? 'pr-20' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              {community?.avatar ? (
                <img
                  src={getAvatarUrl(community.avatar)}
                  alt={title}
                  className="h-10 w-10 rounded-xl object-cover ring-1 ring-white/10"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-piu-accent/70 to-sky-500/70 font-display text-lg font-bold text-white ring-1 ring-white/10">
                  {title.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate font-display text-sm font-bold text-white transition-colors group-hover:text-piu-accent">
                  {title}
                </h3>
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
              <p className="mt-0.5 line-clamp-1 text-xs leading-relaxed text-zinc-400">
                {description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/6 bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-zinc-500"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2.5 shrink-0 ml-auto text-[11px] text-zinc-500">
              <span>{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
              {postsThisWeek > 0 && (
                <>
                  <span className="text-zinc-700">&middot;</span>
                  <span>{postsThisWeek} post{postsThisWeek !== 1 ? 's' : ''}/wk</span>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}
