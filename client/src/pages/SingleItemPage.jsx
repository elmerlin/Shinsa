import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getPost, getUpscore, getNewClear, getJacketMap, getUpscorePumpers, getNewClearPumpers } from '../utils/api';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getCountryFlag } from '../components/PlayerRegistration';
import PostCard, { ShareButton } from '../components/PostCard';
import PumpersModal from '../components/PumpersModal';
import {
  pumpUpscore, getUpscoreComments, addUpscoreComment, deleteUpscoreComment,
  pumpNewClear, getNewClearComments, addNewClearComment, deleteNewClearComment,
  pumpComment,
} from '../utils/api';
import { renderFormattedText } from '../utils/formatText';
import { getProfilePath } from '../utils/profile';

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

function parsePumbilityGain(value) {
  const numeric = parseInt(value, 10) || 0;
  return numeric > 0 ? numeric : 0;
}

function getClearItems(item) {
  const fallback = [{
    song_title: item.song_title || '',
    mode: item.mode || 'Single',
    level: parseInt(item.level) || 0,
    score: parseInt(item.score) || 0,
    grade: item.grade || '',
    plate: item.plate || '',
    background_url: item.background_url || '',
  }];

  try {
    const parsed = JSON.parse(item.clears_json || '[]');
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback;

    return parsed.map(c => ({
      song_title: c.song_title || fallback[0].song_title,
      mode: c.mode || fallback[0].mode,
      level: parseInt(c.level) || fallback[0].level,
      score: parseInt(c.score) || 0,
      grade: c.grade || '',
      plate: c.plate || '',
      background_url: c.background_url || '',
    }));
  } catch {
    return fallback;
  }
}

// Reusable pump button for upscores/clears on single view
function ItemPumpButton({ itemId, initialCount, initialPumped, pumpFn, getPumpersFn }) {
  const { user } = useAuth();
  const [pumped, setPumped] = useState(!!initialPumped);
  const [count, setCount] = useState(initialCount || 0);
  const [animating, setAnimating] = useState(false);
  const [showPumpers, setShowPumpers] = useState(false);

  const toggle = async () => {
    if (!user) return;
    try {
      const res = await pumpFn(itemId);
      setPumped(res.pumped);
      setCount(res.pump_count);
      if (res.pumped) { setAnimating(true); setTimeout(() => setAnimating(false), 600); }
    } catch {}
  };

  return (
    <>
      <button onClick={toggle} disabled={!user}
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm font-display font-bold transition-all ${
          pumped ? 'text-piu-gold bg-piu-gold/10' : 'text-gray-400 hover:text-piu-gold hover:bg-piu-gold/5'
        } ${!user ? 'opacity-50 cursor-not-allowed' : ''}`}
        title={user ? (pumped ? 'Un-pump' : 'Pump it up!') : 'Log in to pump'}
      >
        <img src={pumped ? '/piu/stomp-yellow.svg' : '/piu/stomp-gray.svg'} alt=""
          className={`w-5 h-5 ${animating ? 'animate-bounce' : ''}`} />
      </button>
      {count > 0 && (
        <button
          type="button"
          onClick={() => setShowPumpers(true)}
          className="px-2.5 py-1.5 rounded-lg text-sm font-display font-bold text-gray-300 hover:text-white hover:bg-piu-dark/50 transition-colors"
          title="See who pumped this"
        >
          {count}
        </button>
      )}
      <PumpersModal
        open={showPumpers}
        onClose={() => setShowPumpers(false)}
        title={`Pumped by (${count})`}
        loadPumpers={() => (getPumpersFn ? getPumpersFn(itemId) : Promise.resolve([]))}
        reloadKey={count}
      />
    </>
  );
}

// Small inline pump button for comments
function SingleCommentPumpButton({ commentId, type, initialCount, initialPumped }) {
  const { user } = useAuth();
  const [pumped, setPumped] = useState(!!initialPumped);
  const [count, setCount] = useState(initialCount || 0);

  const toggle = async () => {
    if (!user) return;
    try {
      const res = await pumpComment(type, commentId);
      setPumped(res.pumped);
      setCount(res.pump_count);
    } catch {}
  };

  return (
    <button onClick={toggle} disabled={!user}
      className={`flex items-center gap-0.5 transition-colors ${
        pumped ? 'text-piu-gold' : 'text-gray-600 hover:text-piu-gold'
      } ${!user ? 'opacity-50 cursor-not-allowed' : ''}`}
      title={pumped ? 'Un-pump' : 'Pump'}
    >
      <img src={pumped ? '/piu/stomp-yellow.svg' : '/piu/stomp-gray.svg'} alt="" className="w-3 h-3" />
      {count > 0 && <span className="text-[9px] font-display font-bold">{count}</span>}
    </button>
  );
}

// Reusable comment section for upscores/clears on single view
function ItemCommentSection({ itemId, commentCount: initialCount, commentType, getCommentsFn, addCommentFn, deleteCommentFn, focusCommentId }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(true);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [count, setCount] = useState(initialCount || 0);
  const [highlightedCommentId, setHighlightedCommentId] = useState(null);
  const commentNodeRefs = useRef(new Map());
  const focusedTargetRef = useRef('');

  const loadComments = () => {
    getCommentsFn(itemId).then(setComments).catch(() => {});
  };

  useEffect(() => { loadComments(); }, [itemId]);

  useEffect(() => {
    if (!focusCommentId) return;
    setOpen(true);
    loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCommentId, itemId]);

  useEffect(() => {
    if (!focusCommentId || !open || comments.length === 0) return;
    const targetId = String(focusCommentId);
    if (focusedTargetRef.current === targetId) return;

    const exists = comments.some(c =>
      String(c.id) === targetId || (c.replies || []).some(r => String(r.id) === targetId)
    );
    if (!exists) return;

    const node = commentNodeRefs.current.get(targetId);
    if (!node) return;

    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.focus({ preventScroll: true });
    setHighlightedCommentId(targetId);
    focusedTargetRef.current = targetId;

    const timeout = setTimeout(() => {
      setHighlightedCommentId(prev => (prev === targetId ? null : prev));
    }, 2200);
    return () => clearTimeout(timeout);
  }, [focusCommentId, open, comments]);

  const setCommentNodeRef = (commentId) => (node) => {
    const key = String(commentId);
    if (node) commentNodeRefs.current.set(key, node);
    else commentNodeRefs.current.delete(key);
  };

  const submit = async () => {
    if (!newComment.trim()) return;
    const c = await addCommentFn(itemId, newComment.trim());
    setComments(prev => [...prev, c]);
    setNewComment('');
    setCount(prev => prev + 1);
  };

  const submitReply = async (parentId) => {
    if (!replyText.trim()) return;
    const c = await addCommentFn(itemId, replyText.trim(), parentId);
    setComments(prev => prev.map(cm =>
      cm.id === parentId ? { ...cm, replies: [...(cm.replies || []), c] } : cm
    ));
    setReplyTo(null);
    setReplyText('');
    setCount(prev => prev + 1);
  };

  const handleDelete = async (id, parentId) => {
    await deleteCommentFn(id);
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
    <>
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm font-display font-bold text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span>{count > 0 ? count : ''}</span>
      </button>
      {open && (
        <div className="w-full order-last mt-2 border-l-2 border-piu-border/30 pl-3 space-y-2">
          {comments.map(c => (
            <div
              key={c.id}
              ref={setCommentNodeRef(c.id)}
              tabIndex={-1}
              className={`rounded-lg p-1 -mx-1 outline-none transition-all ${
                highlightedCommentId === String(c.id) ? 'ring-1 ring-piu-accent/60 bg-piu-accent/10' : ''
              }`}
            >
              <div className="flex items-start gap-2">
                <Link to={getProfilePath(c.user_id, c.username)}>
                  {c.avatar ? (
                    <img src={getAvatarUrl(c.avatar)} className="w-6 h-6 rounded-full object-cover" alt="" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-piu-dark flex items-center justify-center text-[10px] font-bold">{(c.username || '?')[0]}</div>
                  )}
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <Link to={getProfilePath(c.user_id, c.username)} className="text-[11px] font-display font-bold hover:text-piu-accent leading-none">{c.username}</Link>
                    <span className="text-[9px] text-gray-600">{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-[11px] text-gray-300 break-words">{renderFormattedText(c.content)}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <SingleCommentPumpButton commentId={c.id} type={commentType} initialCount={c.pump_count || 0} initialPumped={c.user_pumped} />
                    {user && <button onClick={() => { setReplyTo(c.id); setReplyText(''); }} className="text-[9px] text-gray-500 hover:text-piu-accent font-display">Reply</button>}
                    {user && user.id === c.user_id && <button onClick={() => handleDelete(c.id)} className="text-[9px] text-gray-600 hover:text-red-400 font-display">Delete</button>}
                  </div>
                </div>
              </div>
              {(c.replies || []).map(r => (
                <div
                  key={r.id}
                  ref={setCommentNodeRef(r.id)}
                  tabIndex={-1}
                  className={`flex items-start gap-2 ml-6 mt-1 rounded-lg p-1 -mx-1 outline-none transition-all ${
                    highlightedCommentId === String(r.id) ? 'ring-1 ring-piu-accent/60 bg-piu-accent/10' : ''
                  }`}
                >
                  <Link to={getProfilePath(r.user_id, r.username)}>
                    {r.avatar ? (
                      <img src={getAvatarUrl(r.avatar)} className="w-5 h-5 rounded-full object-cover" alt="" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-piu-dark flex items-center justify-center text-[9px] font-bold">{(r.username || '?')[0]}</div>
                    )}
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <Link to={getProfilePath(r.user_id, r.username)} className="text-[10px] font-display font-bold hover:text-piu-accent leading-none">{r.username}</Link>
                      <span className="text-[8px] text-gray-600">{timeAgo(r.created_at)}</span>
                    </div>
                    <p className="text-[10px] text-gray-300 break-words">{renderFormattedText(r.content)}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <SingleCommentPumpButton commentId={r.id} type={commentType} initialCount={r.pump_count || 0} initialPumped={r.user_pumped} />
                      {user && <button onClick={() => { setReplyTo(c.id); setReplyText(`@${r.username} `); }} className="text-[9px] text-gray-500 hover:text-piu-accent font-display">Reply</button>}
                      {user && user.id === r.user_id && <button onClick={() => handleDelete(r.id, c.id)} className="text-[9px] text-gray-600 hover:text-red-400 font-display">Delete</button>}
                    </div>
                  </div>
                </div>
              ))}
              {replyTo === c.id && (
                <div className="flex gap-1 ml-6 mt-1">
                  <input className="input-field text-[11px] py-1 flex-1" placeholder="Reply..." value={replyText}
                    onChange={e => setReplyText(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitReply(c.id)} autoFocus />
                  <button onClick={() => submitReply(c.id)} className="text-[10px] text-piu-accent font-display font-bold px-2">Send</button>
                  <button onClick={() => { setReplyTo(null); setReplyText(''); }} className="text-[10px] text-gray-600 hover:text-gray-400 font-display px-1">&#10005;</button>
                </div>
              )}
            </div>
          ))}
          {user && (
            <div className="flex gap-1">
              <input className="input-field text-[11px] py-1 flex-1" placeholder="Write a comment..." value={newComment}
                onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
              <button onClick={submit} className="text-[10px] text-piu-accent font-display font-bold px-2">Send</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export function SinglePostPage() {
  const { id } = useParams();
  const location = useLocation();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const focusCommentId = new URLSearchParams(location.search).get('comment');

  useEffect(() => {
    getPost(id).then(setPost).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="max-w-2xl mx-auto px-4 py-12 text-center text-gray-500">Loading...</div>;
  if (!post) return <div className="max-w-2xl mx-auto px-4 py-12 text-center text-gray-500">Post not found</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link to="/feed" className="text-xs text-gray-500 hover:text-piu-accent font-display mb-4 inline-block">&larr; Back to Feed</Link>
      <PostCard post={post} showAuthor={true} focusCommentId={focusCommentId} />
    </div>
  );
}

export function SingleUpscorePage() {
  const { id } = useParams();
  const location = useLocation();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [jacketLookup, setJacketLookup] = useState({});
  const focusCommentId = new URLSearchParams(location.search).get('comment');

  useEffect(() => {
    getUpscore(id).then(setItem).catch(() => {}).finally(() => setLoading(false));
    getJacketMap().then(setJacketLookup).catch(() => {});
  }, [id]);

  if (loading) return <div className="max-w-2xl mx-auto px-4 py-12 text-center text-gray-500">Loading...</div>;
  if (!item) return <div className="max-w-2xl mx-auto px-4 py-12 text-center text-gray-500">Upscore not found</div>;

  const upscores = (() => { try { return JSON.parse(item.upscores_json || '[]'); } catch { return []; } })();
  const flag = getCountryFlag(item.nationality);
  const postPumbilityGain = parsePumbilityGain(item.pumbility_gain);
  const postSinglesPumbilityGain = parsePumbilityGain(item.singles_pumbility_gain);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link to="/feed" className="text-xs text-gray-500 hover:text-piu-accent font-display mb-4 inline-block">&larr; Back to Feed</Link>
      <div className="card">
        <div className="flex items-center gap-3 mb-3">
          <Link to={getProfilePath(item.user_id, item.username)}>
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
              <Link to={getProfilePath(item.user_id, item.username)} className="font-display font-bold text-sm hover:text-piu-accent transition-colors">
                {flag && <span className="mr-1">{flag}</span>}
                {item.username}
              </Link>
              <span className="text-piu-green font-display font-bold text-xs">upscores!</span>
              {postPumbilityGain > 0 && (
                <span className="text-cyan-300 font-display font-black text-[10px]">+{postPumbilityGain.toLocaleString()} PB</span>
              )}
              {postSinglesPumbilityGain > 0 && (
                <span className="text-emerald-300 font-display font-black text-[10px]">+{postSinglesPumbilityGain.toLocaleString()} SPB</span>
              )}
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
                  <div className="w-9 h-9 rounded bg-piu-dark flex items-center justify-center font-display font-bold text-sm text-gray-500 shrink-0">{(u.song_title || '?')[0]}</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-display font-bold truncate">{u.song_title}</p>
                  <span className={`text-[9px] px-1 py-0.5 rounded font-display font-bold ${badgeColor}`}>{isSingle ? 'S' : 'D'}{u.level}</span>
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
        <div className="border-t border-piu-border/20 pt-2 mt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <ItemPumpButton itemId={item.id} initialCount={item.pump_count || 0} initialPumped={item.user_pumped} pumpFn={pumpUpscore} getPumpersFn={getUpscorePumpers} />
            <ItemCommentSection itemId={item.id} commentCount={item.comment_count || 0} commentType="upscore"
              getCommentsFn={getUpscoreComments} addCommentFn={addUpscoreComment} deleteCommentFn={deleteUpscoreComment}
              focusCommentId={focusCommentId} />
            <ShareButton path={`/upscore/${item.id}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SingleClearPage() {
  const { id } = useParams();
  const location = useLocation();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [jacketLookup, setJacketLookup] = useState({});
  const focusCommentId = new URLSearchParams(location.search).get('comment');

  useEffect(() => {
    getNewClear(id).then(setItem).catch(() => {}).finally(() => setLoading(false));
    getJacketMap().then(setJacketLookup).catch(() => {});
  }, [id]);

  if (loading) return <div className="max-w-2xl mx-auto px-4 py-12 text-center text-gray-500">Loading...</div>;
  if (!item) return <div className="max-w-2xl mx-auto px-4 py-12 text-center text-gray-500">Clear not found</div>;

  const clears = getClearItems(item);
  const isGrouped = clears.length > 1;
  const flag = getCountryFlag(item.nationality);
  const postPumbilityGain = parsePumbilityGain(item.pumbility_gain);
  const postSinglesPumbilityGain = parsePumbilityGain(item.singles_pumbility_gain);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link to="/feed" className="text-xs text-gray-500 hover:text-piu-accent font-display mb-4 inline-block">&larr; Back to Feed</Link>
      <div className="card">
        <div className="flex items-center gap-3 mb-3">
          <Link to={getProfilePath(item.user_id, item.username)}>
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
              <Link to={getProfilePath(item.user_id, item.username)} className="font-display font-bold text-sm hover:text-piu-accent transition-colors">
                {flag && <span className="mr-1">{flag}</span>}
                {item.username}
              </Link>
              <span className="text-sky-400 font-display font-bold text-xs">{isGrouped ? 'new clears!' : 'new clear!'}</span>
              {postPumbilityGain > 0 && (
                <span className="text-cyan-300 font-display font-black text-[10px]">+{postPumbilityGain.toLocaleString()} PB</span>
              )}
              {postSinglesPumbilityGain > 0 && (
                <span className="text-emerald-300 font-display font-black text-[10px]">+{postSinglesPumbilityGain.toLocaleString()} SPB</span>
              )}
            </div>
            <p className="text-[10px] text-gray-500">{timeAgo(item.created_at)}</p>
          </div>
        </div>
        <div className="space-y-2">
          {clears.map((clear, i) => {
            const rank = getRank(clear.score);
            const isSingle = clear.mode === 'Single';
            const badgeColor = isSingle
              ? 'bg-red-600/20 text-red-400'
              : clear.mode === 'Double'
                ? 'bg-green-600/20 text-green-400'
                : 'bg-blue-600/20 text-blue-400';
            const norm = (clear.song_title || '').toLowerCase().replace(/\s+/g, ' ').trim();
            const exactKey = `${norm}|${clear.mode}|${clear.level}`;
            const jacketUrl = jacketLookup[exactKey] || jacketLookup[norm] || '';

            return (
              <div key={`${clear.song_title}-${clear.mode}-${clear.level}-${i}`} className="flex items-center gap-3 py-1.5 border-b border-piu-border/20 last:border-0">
                {jacketUrl ? (
                  <img src={jacketUrl} alt="" className="w-11 h-11 rounded object-cover shrink-0" />
                ) : (
                  <div className="w-11 h-11 rounded bg-piu-dark flex items-center justify-center font-display font-bold text-lg text-gray-500 shrink-0">
                    {(clear.song_title || '?')[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-display font-bold truncate">{clear.song_title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[9px] px-1 py-0.5 rounded font-display font-bold ${badgeColor}`}>
                      {isSingle ? 'S' : clear.mode === 'Double' ? 'D' : 'C'}{clear.level}
                    </span>
                    {clear.plate && <span className="text-[9px] px-1.5 py-0.5 rounded bg-piu-dark text-gray-400 font-mono">{clear.plate}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-xs font-display font-bold ${rank.color}`}>{rank.label}</span>
                  <p className="font-mono text-xs font-bold">{clear.score.toLocaleString()}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="border-t border-piu-border/20 pt-2 mt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <ItemPumpButton itemId={item.id} initialCount={item.pump_count || 0} initialPumped={item.user_pumped} pumpFn={pumpNewClear} getPumpersFn={getNewClearPumpers} />
            <ItemCommentSection itemId={item.id} commentCount={item.comment_count || 0} commentType="clear"
              getCommentsFn={getNewClearComments} addCommentFn={addNewClearComment} deleteCommentFn={deleteNewClearComment}
              focusCommentId={focusCommentId} />
            <ShareButton path={`/clear/${item.id}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
