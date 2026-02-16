import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getFeed, getJacketMap, pumpUpscore, getUpscoreComments, addUpscoreComment, deleteUpscoreComment } from '../utils/api';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getCountryFlag } from '../components/PlayerRegistration';
import PostCard from '../components/PostCard';
import { renderFormattedText } from '../utils/formatText';

function getRank(score) {
  const s = parseInt(score) || 0;
  if (s >= 995000) return { label: 'SSS+', color: 'text-sky-300' };
  if (s >= 990000) return { label: 'SSS', color: 'text-sky-400' };
  if (s >= 985000) return { label: 'SS+', color: 'text-piu-gold' };
  if (s >= 980000) return { label: 'SS', color: 'text-yellow-400' };
  if (s >= 975000) return { label: 'S+', color: 'text-amber-400' };
  if (s >= 970000) return { label: 'S', color: 'text-amber-500' };
  if (s >= 960000) return { label: 'AAA+', color: 'text-piu-silver' };
  if (s >= 950000) return { label: 'AAA', color: 'text-gray-300' };
  if (s >= 925000) return { label: 'AA+', color: 'text-piu-bronze' };
  if (s >= 900000) return { label: 'AA', color: 'text-piu-bronze' };
  if (s >= 825000) return { label: 'A+', color: 'text-amber-700' };
  if (s >= 750000) return { label: 'A', color: 'text-amber-700' };
  if (s >= 650000) return { label: 'B', color: 'text-gray-500' };
  if (s >= 550000) return { label: 'C', color: 'text-gray-500' };
  if (s >= 450000) return { label: 'D', color: 'text-gray-600' };
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

function UpscorePumpButton({ upscoreId, initialCount, initialPumped }) {
  const { user } = useAuth();
  const [pumped, setPumped] = useState(!!initialPumped);
  const [count, setCount] = useState(initialCount || 0);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (!user || loading) return;
    setLoading(true);
    try {
      const res = await pumpUpscore(upscoreId);
      setPumped(res.pumped);
      setCount(res.pump_count);
    } catch {}
    setLoading(false);
  };

  return (
    <button
      onClick={toggle}
      disabled={!user}
      className={`flex items-center gap-1 text-[11px] font-display font-bold transition-colors ${
        pumped ? 'text-piu-accent' : 'text-gray-500 hover:text-piu-accent'
      }`}
    >
      <span>{pumped ? '\u25B2' : '\u25B3'}</span>
      <span>PUMP{count > 0 ? ` (${count})` : ''}</span>
    </button>
  );
}

function UpscoreCommentSection({ upscoreId, commentCount: initialCount }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [count, setCount] = useState(initialCount || 0);

  const loadComments = async () => {
    const data = await getUpscoreComments(upscoreId);
    setComments(data);
  };

  const toggleOpen = () => {
    if (!open) loadComments();
    setOpen(!open);
  };

  const submit = async () => {
    if (!newComment.trim()) return;
    const c = await addUpscoreComment(upscoreId, newComment.trim());
    setComments(prev => [...prev, c]);
    setNewComment('');
    setCount(prev => prev + 1);
  };

  const submitReply = async (parentId) => {
    if (!replyText.trim()) return;
    const c = await addUpscoreComment(upscoreId, replyText.trim(), parentId);
    setComments(prev => prev.map(cm =>
      cm.id === parentId ? { ...cm, replies: [...(cm.replies || []), c] } : cm
    ));
    setReplyTo(null);
    setReplyText('');
    setCount(prev => prev + 1);
  };

  const handleDelete = async (id, parentId) => {
    await deleteUpscoreComment(id);
    if (parentId) {
      setComments(prev => prev.map(cm =>
        cm.id === parentId ? { ...cm, replies: (cm.replies || []).filter(r => r.id !== id) } : cm
      ));
    } else {
      const removed = comments.find(c => c.id === id);
      const removedCount = 1 + (removed?.replies?.length || 0);
      setComments(prev => prev.filter(c => c.id !== id));
      setCount(prev => Math.max(0, prev - removedCount));
    }
  };

  return (
    <div>
      <button onClick={toggleOpen} className="flex items-center gap-1 text-[11px] font-display font-bold text-gray-500 hover:text-white transition-colors">
        <span>{open ? '\u25BC' : '\u25B7'}</span>
        <span>{count > 0 ? `${count} comment${count !== 1 ? 's' : ''}` : 'Comment'}</span>
      </button>
      {open && (
        <div className="mt-2 ml-2 border-l border-piu-border/30 pl-3 space-y-2">
          {comments.map(c => (
            <div key={c.id}>
              <div className="flex items-start gap-2">
                <Link to={`/profile/${c.user_id}`}>
                  {c.avatar ? (
                    <img src={getAvatarUrl(c.avatar)} className="w-6 h-6 rounded-full object-cover" alt="" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-piu-dark flex items-center justify-center text-[10px] font-bold">{(c.username || '?')[0]}</div>
                  )}
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <Link to={`/profile/${c.user_id}`} className="text-[11px] font-display font-bold hover:text-piu-accent">{c.username}</Link>
                    <span className="text-[9px] text-gray-600">{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-[11px] text-gray-300 break-words">{renderFormattedText(c.content)}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {user && <button onClick={() => { setReplyTo(c.id); setReplyText(''); }} className="text-[9px] text-gray-500 hover:text-piu-accent font-display">Reply</button>}
                    {user && user.id === c.user_id && <button onClick={() => handleDelete(c.id)} className="text-[9px] text-gray-600 hover:text-red-400 font-display">Delete</button>}
                  </div>
                </div>
              </div>
              {/* Replies */}
              {(c.replies || []).map(r => (
                <div key={r.id} className="flex items-start gap-2 ml-6 mt-1">
                  <Link to={`/profile/${r.user_id}`}>
                    {r.avatar ? (
                      <img src={getAvatarUrl(r.avatar)} className="w-5 h-5 rounded-full object-cover" alt="" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-piu-dark flex items-center justify-center text-[9px] font-bold">{(r.username || '?')[0]}</div>
                    )}
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <Link to={`/profile/${r.user_id}`} className="text-[10px] font-display font-bold hover:text-piu-accent">{r.username}</Link>
                      <span className="text-[8px] text-gray-600">{timeAgo(r.created_at)}</span>
                    </div>
                    <p className="text-[10px] text-gray-300 break-words">{renderFormattedText(r.content)}</p>
                    {user && user.id === r.user_id && <button onClick={() => handleDelete(r.id, c.id)} className="text-[9px] text-gray-600 hover:text-red-400 font-display">Delete</button>}
                  </div>
                </div>
              ))}
              {/* Reply input */}
              {replyTo === c.id && (
                <div className="flex gap-1 ml-6 mt-1">
                  <input
                    className="input-field text-[11px] py-1 flex-1"
                    placeholder="Reply..."
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitReply(c.id)}
                    autoFocus
                  />
                  <button onClick={() => submitReply(c.id)} className="text-[10px] text-piu-accent font-display font-bold px-2">Send</button>
                </div>
              )}
            </div>
          ))}
          {user && (
            <div className="flex gap-1">
              <input
                className="input-field text-[11px] py-1 flex-1"
                placeholder="Write a comment..."
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
              />
              <button onClick={submit} className="text-[10px] text-piu-accent font-display font-bold px-2">Send</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UpscoreCard({ item, jacketLookup }) {
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

          const norm = (u.song_title || '').toLowerCase().replace(/\s+/g, ' ').trim();
          const exactKey = `${norm}|${u.mode}|${u.level}`;
          const jacketUrl = jacketLookup[exactKey] || jacketLookup[norm] || '';

          return (
            <div key={i} className="flex items-center gap-3 py-1.5 border-b border-piu-border/20 last:border-0">
              {jacketUrl ? (
                <img src={jacketUrl} alt="" className="w-9 h-9 rounded object-cover shrink-0" />
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

      {/* Actions: Pump + Comments */}
      <div className="flex items-center gap-3 border-t border-piu-border/20 pt-2 mt-2">
        <UpscorePumpButton upscoreId={item.id} initialCount={item.pump_count || 0} initialPumped={item.user_pumped} />
        <UpscoreCommentSection upscoreId={item.id} commentCount={item.comment_count || 0} />
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
  const [jacketLookup, setJacketLookup] = useState({});

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

    // Load jacket map from pump-phoenix.json (server-side, normalized)
    getJacketMap().then(map => setJacketLookup(map)).catch(() => {});
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
              return <PostCard key={`post-${item.id}`} post={item} showAuthor={true} />;
            } else if (item.type === 'upscore') {
              return <UpscoreCard key={`upscore-${item.id}`} item={item} jacketLookup={jacketLookup} />;
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
