import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getCommunities } from '../utils/api';
import CommunityBadge from '../components/CommunityBadge';
import { getAvatarUrl } from '../components/AvatarPicker';
import { extractCommunityPalette, getCommunityCardStyle, getCommunityStatStyle } from '../utils/communityColors';

function parseCommunityIndexTags(raw) {
  const value = String(raw || '').trim();
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map(tag => String(tag || '').trim()).filter(Boolean).slice(0, 4);
    }
  } catch {}
  return value.split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 4);
}

export default function CommunitiesListPage() {
  const { user } = useAuth();
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [communityPalettes, setCommunityPalettes] = useState({});

  useEffect(() => {
    getCommunities(search ? { q: search } : {})
      .then(setCommunities)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const missing = communities.filter((community) => community.avatar && !communityPalettes[community.id]);
    if (missing.length === 0) return undefined;

    Promise.all(missing.map(async (community) => {
      const palette = await extractCommunityPalette(getAvatarUrl(community.avatar));
      return { id: community.id, palette };
    })).then((entries) => {
      if (cancelled) return;
      setCommunityPalettes((prev) => {
        const next = { ...prev };
        for (const entry of entries) {
          if (entry.palette) next[entry.id] = entry.palette;
        }
        return next;
      });
    });

    return () => { cancelled = true; };
  }, [communities, communityPalettes]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display font-bold text-2xl tracking-wider">COMMUNITIES</h1>
        {user && (
          <Link
            to="/community/new"
            className="px-4 py-2 bg-gradient-to-r from-piu-accent to-purple-600 rounded-lg font-display font-bold text-sm hover:opacity-90 transition-opacity"
          >
            + Create
          </Link>
        )}
      </div>

      <div className="relative mb-6">
        <input
          type="text"
          className="w-full bg-piu-dark border border-piu-border rounded-lg pl-10 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-piu-accent"
          placeholder="Search communities..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-piu-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : communities.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 font-display">No communities found</p>
          {user && <p className="text-gray-600 text-sm mt-1">Be the first to create one!</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {communities.map(c => {
            const indexTags = parseCommunityIndexTags(c.index_tags);
            const cardPalette = communityPalettes[c.id];
            const memberStatStyle = getCommunityStatStyle(cardPalette, 'primary');
            const postStatStyle = getCommunityStatStyle(cardPalette, 'secondary');
            return (
              <Link
                key={c.id}
                to={`/c/${c.name}`}
                className="flex items-center gap-4 bg-piu-card border border-piu-border rounded-xl p-4 hover:border-piu-accent/30 transition-colors group"
                style={getCommunityCardStyle(cardPalette) || undefined}
              >
                {c.avatar ? (
                  <img src={getAvatarUrl(c.avatar)} alt="" className="w-14 h-14 rounded-xl object-cover shadow-md shrink-0" />
                ) : (
                  <div className="w-14 h-14 bg-gradient-to-br from-piu-accent to-purple-700 rounded-xl flex items-center justify-center font-display text-2xl font-bold shadow-md shrink-0">
                    {c.display_name[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-display font-bold text-base group-hover:text-piu-accent transition-colors">{c.display_name}</h3>
                    {c.badge_text && <CommunityBadge text={c.badge_text} bgColor={c.badge_color} textColor={c.badge_text_color} size="xs" />}
                    {c.is_invite_only ? <span className="text-[9px] font-display text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded-full">Invite Only</span> : null}
                  </div>
                  {c.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{c.description}</p>}
                  {indexTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {indexTags.map((tag) => (
                        <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full border border-piu-border/60 bg-piu-dark/60 text-gray-400">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-[10px]">
                    <span
                      className="inline-flex items-center gap-1 rounded-full border border-piu-border/60 bg-piu-dark/50 px-1.5 py-0.5 text-gray-500"
                      style={memberStatStyle || undefined}
                      title={`${c.member_count} members`}
                      aria-label={`${c.member_count} members`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>{c.member_count}</span>
                    </span>
                    <span
                      className="inline-flex items-center gap-1 rounded-full border border-piu-border/60 bg-piu-dark/50 px-1.5 py-0.5 text-gray-500"
                      style={postStatStyle || undefined}
                      title={`${c.posts_last_week || 0} posts this week`}
                      aria-label={`${c.posts_last_week || 0} posts this week`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      <span>{c.posts_last_week || 0}</span>
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
