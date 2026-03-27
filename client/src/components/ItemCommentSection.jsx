import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from './AvatarPicker';
import DojoCatStickerPicker from './DojoCatStickerPicker';
import ActionIconButton from './ActionIconButton';
import { pumpComment } from '../utils/api';
import { renderFormattedText } from '../utils/formatText';
import { getProfilePath } from '../utils/profile';

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

function appendStickerToken(value, token) {
  const current = String(value || '');
  const needsSpace = current.length > 0 && !/\s$/.test(current);
  return `${current}${needsSpace ? ' ' : ''}${token} `;
}

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

export default function ItemCommentSection({
  itemId,
  commentCount: initialCount,
  commentType,
  getCommentsFn,
  addCommentFn,
  deleteCommentFn,
  focusCommentId,
  initialOpen = true,
  externalOpen,
  onOpenChange,
  ownerId,
  onCountChange,
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(initialOpen);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [count, setCount] = useState(initialCount || 0);
  const [highlightedCommentId, setHighlightedCommentId] = useState(null);
  const commentNodeRefs = useRef(new Map());
  const focusedTargetRef = useRef('');

  const isOpen = externalOpen !== undefined ? externalOpen : open;

  const toggleOpen = () => {
    const newVal = !isOpen;
    if (externalOpen !== undefined && onOpenChange) onOpenChange(newVal);
    else setOpen(newVal);
  };

  const loadComments = () => {
    getCommentsFn(itemId).then(data => {
      setComments(data);
      const total = data.reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0);
      setCount(total);
      if (onCountChange) onCountChange(total);
    }).catch(() => {});
  };

  useEffect(() => { loadComments(); }, [itemId]);

  useEffect(() => {
    if (!focusCommentId) return;
    if (externalOpen !== undefined && onOpenChange) onOpenChange(true);
    else setOpen(true);
    loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCommentId, itemId]);

  useEffect(() => {
    if (!focusCommentId || !isOpen || comments.length === 0) return;
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
  }, [focusCommentId, isOpen, comments]);

  const setCommentNodeRef = (commentId) => (node) => {
    const key = String(commentId);
    if (node) commentNodeRefs.current.set(key, node);
    else commentNodeRefs.current.delete(key);
  };

  const canDelete = (commentUserId) => {
    if (!user) return false;
    if (user.id === commentUserId) return true;
    if (ownerId && user.id === ownerId) return true;
    return false;
  };

  const submit = async () => {
    if (!newComment.trim()) return;
    const c = await addCommentFn(itemId, newComment.trim());
    setComments(prev => [...prev, c]);
    setNewComment('');
    setCount(prev => { const n = prev + 1; if (onCountChange) onCountChange(n); return n; });
  };

  const submitReply = async (parentId) => {
    if (!replyText.trim()) return;
    const c = await addCommentFn(itemId, replyText.trim(), parentId);
    setComments(prev => prev.map(cm =>
      cm.id === parentId ? { ...cm, replies: [...(cm.replies || []), c] } : cm
    ));
    setReplyTo(null);
    setReplyText('');
    setCount(prev => { const n = prev + 1; if (onCountChange) onCountChange(n); return n; });
  };

  const handleDelete = async (id, parentId) => {
    await deleteCommentFn(id);
    if (parentId) {
      setComments(prev => prev.map(cm =>
        cm.id === parentId ? { ...cm, replies: (cm.replies || []).filter(r => r.id !== id) } : cm
      ));
      setCount(prev => { const n = Math.max(0, prev - 1); if (onCountChange) onCountChange(n); return n; });
    } else {
      const removed = comments.find(c => c.id === id);
      const removedCount = 1 + (removed?.replies?.length || 0);
      setComments(prev => prev.filter(c => c.id !== id));
      setCount(prev => { const n = Math.max(0, prev - removedCount); if (onCountChange) onCountChange(n); return n; });
    }
  };

  const insertCommentSticker = (token) => {
    setNewComment((prev) => appendStickerToken(prev, token));
  };

  const insertReplySticker = (token) => {
    setReplyText((prev) => appendStickerToken(prev, token));
  };

  return (
    <>
      <ActionIconButton
        onClick={toggleOpen}
        title={isOpen ? 'Hide comments' : 'Show comments'}
        ariaLabel={isOpen ? 'Hide comments' : 'Show comments'}
        count={count}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 10.5h10M7 14h6m8 4-3.8-1.3a9.2 9.2 0 0 1-3.2.55C7.925 17.25 4 14.22 4 10.5S7.925 3.75 12.75 3.75 21.5 6.78 21.5 10.5c0 1.75-.87 3.34-2.3 4.52L21 18Z" />
        </svg>
      </ActionIconButton>
      {isOpen && (
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
                    {canDelete(c.user_id) && <button onClick={() => handleDelete(c.id)} className="text-[9px] text-gray-600 hover:text-red-400 font-display">Delete</button>}
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
                      {canDelete(r.user_id) && <button onClick={() => handleDelete(r.id, c.id)} className="text-[9px] text-gray-600 hover:text-red-400 font-display">Delete</button>}
                    </div>
                  </div>
                </div>
              ))}
              {replyTo === c.id && (
                <div className="flex gap-1 ml-6 mt-1">
                  <input className="input-field text-[11px] py-1 flex-1" placeholder="Reply..." value={replyText}
                    onChange={e => setReplyText(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitReply(c.id)} autoFocus />
                  <DojoCatStickerPicker onSelect={insertReplySticker} compact align="right" />
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
              <DojoCatStickerPicker onSelect={insertCommentSticker} compact align="right" />
              <button onClick={submit} className="text-[10px] text-piu-accent font-display font-bold px-2">Send</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
