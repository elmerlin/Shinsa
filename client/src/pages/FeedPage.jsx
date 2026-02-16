import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getFeed } from '../utils/api';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getCountryFlag } from '../components/PlayerRegistration';

function getRank(score) {
  if (score >= 995000) return { label: 'SSS+', color: 'text-sky-300' };
  if (score >= 990000) return { label: 'SSS', color: 'text-sky-400' };
  if (score >= 980000) return { label: 'SS+', color: 'text-piu-gold' };
  if (score >= 960000) return { label: 'SS', color: 'text-yellow-400' };
  if (score >= 940000) return { label: 'S+', color: 'text-amber-400' };
  if (score >= 920000) return { label: 'S', color: 'text-amber-500' };
  if (score >= 900000) return { label: 'AAA+', color: 'text-piu-silver' };
  if (score >= 850000) return { label: 'AAA', color: 'text-gray-300' };
  if (score >= 800000) return { label: 'AA+', color: 'text-piu-bronze' };
  if (score >= 750000) return { label: 'AA', color: 'text-piu-bronze' };
  if (score >= 700000) return { label: 'A+', color: 'text-amber-700' };
  if (score >= 650000) return { label: 'A', color: 'text-amber-700' };
  if (score >= 550000) return { label: 'B', color: 'text-gray-500' };
  if (score >= 450000) return { label: 'C', color: 'text-gray-500' };
  if (score >= 350000) return { label: 'D', color: 'text-gray-600' };
  return { label: 'F', color: 'text-gray-600' };
}

function timeAgo(dateStr) {
  const date = new Date(dateStr + (dateStr.endsWith('Z') ? '' : 'Z'));
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function PostCard({ item }) {
  const images = (() => {
    try { return JSON.parse(item.images || '[]'); } catch { return []; }
  })();
  const flag = getCountryFlag(item.nationality);

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-3">
        <Link to={`/profile/${item.user_id}`}>
          {item.avatar ? (
            <img src={getAvatarUrl(item.avatar)} alt="" className="w-9 h-9 rounded-full object-cover border border-piu-border" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-sm">
              {(item.username || '?')[0].toUpperCase()}
            </div>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <Link to={`/profile/${item.user_id}`} className="font-display font-bold text-sm hover:text-piu-accent transition-colors">
            {flag && <span className="mr-1">{flag}</span>}
            {item.username}
          </Link>
          <p className="text-[10px] text-gray-500">{timeAgo(item.created_at)}</p>
        </div>
      </div>

      {item.content && (
        <div className="text-sm text-gray-200 whitespace-pre-wrap break-words mb-3 leading-relaxed">
          {item.content}
        </div>
      )}

      {images.length > 0 && (
        <div className={`grid gap-2 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {images.map((img, i) => (
            <img key={i} src={img} alt="" className="w-full rounded-lg object-cover max-h-64" />
          ))}
        </div>
      )}
    </div>
  );
}

function UpscoreCard({ item }) {
  const upscores = (() => {
    try { return JSON.parse(item.upscores_json || '[]'); } catch { return []; }
  })();
  const flag = getCountryFlag(item.nationality);

  if (upscores.length === 0) return null;

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-3">
        <Link to={`/profile/${item.user_id}`}>
          {item.avatar ? (
            <img src={getAvatarUrl(item.avatar)} alt="" className="w-9 h-9 rounded-full object-cover border border-piu-border" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-sm">
              {(item.username || '?')[0].toUpperCase()}
            </div>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Link to={`/profile/${item.user_id}`} className="font-display font-bold text-sm hover:text-piu-accent transition-colors">
              {flag && <span className="mr-1">{flag}</span>}
              {item.username}
            </Link>
            <span className="text-piu-green font-display font-bold text-xs">upscores!</span>
          </div>
          <p className="text-[10px] text-gray-500">{timeAgo(item.created_at)}</p>
        </div>
      </div>

      <div className="space-y-2">
        {upscores.map((u, i) => {
          const oldRank = getRank(u.old_score);
          const newRank = getRank(u.new_score);
          const isSingle = u.mode === 'Single';
          const badgeColor = isSingle ? 'bg-red-600/20 text-red-400' : 'bg-green-600/20 text-green-400';
          const improvement = u.new_score - u.old_score;

          return (
            <div key={i} className="flex items-center gap-3 py-1.5 border-b border-piu-border/20 last:border-0">
              {u.background_url ? (
                <img src={u.background_url} alt="" className="w-9 h-9 rounded object-cover shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded bg-piu-dark flex items-center justify-center font-display font-bold text-sm text-gray-500 shrink-0">
                  {(u.song_title || '?')[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-display font-bold truncate">{u.song_title}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={`text-[9px] px-1 py-0.5 rounded font-display font-bold ${badgeColor}`}>
                    {isSingle ? 'S' : 'D'}{u.level}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="flex items-center gap-1 justify-end">
                  <span className={`text-[10px] font-mono ${oldRank.color}`}>{u.old_score.toLocaleString()}</span>
                  <span className={`text-[10px] font-display ${oldRank.color}`}>{oldRank.label}</span>
                  <span className="text-gray-500 text-[10px]">&#8594;</span>
                  <span className={`text-xs font-mono font-bold ${newRank.color}`}>{u.new_score.toLocaleString()}</span>
                  <span className={`text-xs font-display font-bold ${newRank.color}`}>{newRank.label}</span>
                </div>
                <p className="text-[10px] text-piu-green font-mono">+{improvement.toLocaleString()}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function FeedPage() {
  const { user } = useAuth();
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getFeed(1).then(data => {
      setFeed(data);
      setHasMore(data.length >= 20);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  const loadMore = async () => {
    const nextPage = page + 1;
    const data = await getFeed(nextPage);
    setFeed(prev => [...prev, ...data]);
    setPage(nextPage);
    setHasMore(data.length >= 20);
  };

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <h2 className="font-display font-bold text-xl mb-4">Activity Feed</h2>
        <p className="text-gray-400 mb-4">Log in to see activity from people you follow.</p>
        <Link to="/login" className="btn-primary inline-block">Login</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display font-bold text-xl">Activity Feed</h2>
        <Link to="/posts" className="text-xs text-piu-accent hover:underline font-display">My Posts</Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading feed...</div>
      ) : feed.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 mb-2">Your feed is empty</p>
          <p className="text-gray-500 text-sm">Follow other players to see their activity here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {feed.map((item, i) => {
            if (item.type === 'post') {
              return <PostCard key={`post-${item.id}`} item={item} />;
            } else if (item.type === 'upscore') {
              return <UpscoreCard key={`upscore-${item.id}`} item={item} />;
            }
            return null;
          })}

          {hasMore && (
            <button
              onClick={loadMore}
              className="w-full py-2 text-sm text-piu-accent hover:text-white font-display font-bold transition-colors"
            >
              Load more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
