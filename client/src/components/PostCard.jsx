import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from './AvatarPicker';
import { getCountryFlag } from './PlayerRegistration';
import { renderFormattedText } from '../utils/formatText';
import { getProfilePath } from '../utils/profile';
import { pumpPost, getPostComments, addPostComment, deletePostComment, togglePostComments, editPost, pumpComment, searchUsers, getPostPumpers } from '../utils/api';
import PumpersModal from './PumpersModal';
import SessionSummaryCard from './SessionSummaryCard';
import SessionShareCard from './SessionShareCard';
import LiveSessionCard from './LiveSessionCard';
import SessionPlanCard from './SessionPlanCard';
import SendToDirectMessageButton from './SendToDirectMessageButton';
import ActionIconButton from './ActionIconButton';
import DojoCatStickerPicker from './DojoCatStickerPicker';
import { splitSessionSummaryContent, serializeSessionSummaryMarker } from '../utils/sessionSummaryMarker';
import { splitSessionShareContent, serializeSessionShareMarker } from '../utils/sessionShareMarker';
import { mergeLiveSessionSummary, splitLiveSessionContent, serializeLiveSessionMarker } from '../utils/liveSessionMarker';
import { splitSessionPlanContent, serializeSessionPlanMarker } from '../utils/sessionPlanMarker';
import { buildYouTubeEmbedSrc } from '../utils/youtube';
import { buildPostLinkShare, parseAchievementBadgePost } from '../utils/directMessageShares';

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

function getActiveMentionQuery(text, cursor) {
  const value = String(text || '');
  const pos = Number.isFinite(cursor) ? cursor : value.length;
  const before = value.slice(0, pos);
  const match = before.match(/(^|[\s(])@([A-Za-z0-9_]{1,30})$/);
  if (!match) return null;
  return {
    query: match[2],
    start: pos - match[2].length - 1,
    end: pos,
  };
}

// YouTube Embed
function YouTubeEmbed({ url }) {
  const embedSrc = buildYouTubeEmbedSrc(url);
  if (!embedSrc) return null;
  return (
    <div className="relative w-full mb-3 rounded-lg overflow-hidden" style={{ paddingBottom: '56.25%' }}>
      <iframe
        className="absolute inset-0 w-full h-full"
        src={embedSrc}
        title="YouTube video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        frameBorder="0"
      />
    </div>
  );
}

// Single image cell with error fallback
// Uses object-position to bias crop towards the upper portion of images
// so faces (which are usually near the top) are visible in thumbnails.
function GridImage({ src, className, onClick, isSingle }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={`${className} bg-piu-dark flex items-center justify-center rounded-lg`}>
        <span className="text-gray-500 text-xs font-display">Image unavailable</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className={className}
      style={isSingle ? undefined : { objectPosition: 'center 20%' }}
      onClick={onClick}
      onError={() => setFailed(true)}
    />
  );
}

// WeChat Moments-style Image Grid
function ImageGrid({ images, onImageClick }) {
  if (!images || images.length === 0) return null;

  const count = images.length;
  let gridClass;

  if (count === 1) {
    gridClass = 'grid-cols-1 max-w-xs';
  } else if (count === 2) {
    gridClass = 'grid-cols-2';
  } else if (count === 4) {
    gridClass = 'grid-cols-2';
  } else {
    gridClass = 'grid-cols-3';
  }

  const imgHeight = count === 1 ? 'max-h-80' : count <= 4 ? 'h-32 sm:h-40' : 'h-24 sm:h-32';

  return (
    <div className={`grid gap-1.5 mb-3 ${gridClass}`}>
      {images.map((img, i) => (
        <GridImage
          key={i}
          src={img}
          className={`w-full rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity ${imgHeight}`}
          onClick={() => onImageClick(i)}
          isSingle={count === 1}
        />
      ))}
    </div>
  );
}

function AchievementBadgePost({ badgeName, supportingCopy, image, onImageClick }) {
  return (
    <div className="mb-3 rounded-[24px] border border-piu-border/40 bg-[linear-gradient(135deg,rgba(12,18,34,0.96),rgba(7,10,24,0.98))] p-4 sm:p-5 shadow-[0_18px_40px_rgba(0,0,0,0.24)]">
      <div className="flex items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center rounded-full border border-piu-accent/20 bg-piu-accent/10 px-3 py-1 text-[9px] font-display font-bold uppercase tracking-[0.3em] text-piu-accent/90">
            Achievement unlocked
          </div>
          <div className="mt-2.5 min-w-0">
            <h3 className="font-display text-[1.6rem] leading-[0.96] text-white sm:text-[1.95rem]">
              {badgeName}
            </h3>
            {supportingCopy && (
              <div className="mt-1.5 text-[0.97rem] text-gray-300 whitespace-pre-wrap break-words leading-[1.45] sm:text-[1.02rem]">
                {renderFormattedText(supportingCopy)}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 justify-end self-end sm:self-center">
          <button
            type="button"
            onClick={() => onImageClick(0)}
            className="group rounded-[20px] border border-piu-border/55 bg-piu-dark/80 p-2 transition-transform duration-200 hover:-translate-y-0.5"
            title={`Open ${badgeName} badge`}
          >
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-[16px] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.16),rgba(8,12,28,0.92)_72%)] sm:h-24 sm:w-24">
              <img
                src={image}
                alt={badgeName}
                className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.03]"
              />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// Lightbox for fullscreen image viewing with smooth sliding
function Lightbox({ images, index, onClose }) {
  const [current, setCurrent] = useState(index);
  const currentRef = useRef(index);
  const stripRef = useRef(null);
  const touchStartRef = useRef(null);
  const touchHandledRef = useRef(false);

  const goTo = (idx, animate = true) => {
    const clamped = Math.max(0, Math.min(idx, images.length - 1));
    if (stripRef.current) {
      stripRef.current.style.transition = animate ? 'transform 300ms ease-out' : 'none';
      stripRef.current.style.transform = `translateX(${-clamped * 100}vw)`;
    }
    currentRef.current = clamped;
    setCurrent(clamped);
  };

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goTo(currentRef.current - 1);
      if (e.key === 'ArrowRight') goTo(currentRef.current + 1);
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [images.length, onClose]);

  // Touch: drag to slide, swipe to navigate, tap halves to navigate
  const handleTouchStart = (e) => {
    if (e.target.closest('button')) return;
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    touchHandledRef.current = false;
    if (stripRef.current) stripRef.current.style.transition = 'none';
  };

  const handleTouchMove = (e) => {
    if (!touchStartRef.current) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;
    if (Math.abs(dx) >= Math.abs(dy) && images.length > 1) {
      const c = currentRef.current;
      // Rubber-band resistance at edges
      const offset = (c === 0 && dx > 0) || (c === images.length - 1 && dx < 0) ? dx * 0.3 : dx;
      if (stripRef.current) {
        stripRef.current.style.transform = `translateX(calc(${-c * 100}vw + ${offset}px))`;
      }
    }
  };

  const handleTouchEnd = (e) => {
    if (!touchStartRef.current || e.target.closest('button')) { touchStartRef.current = null; return; }
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx = endX - touchStartRef.current.x;
    const dy = endY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (images.length <= 1) return;

    const c = currentRef.current;

    // Swipe detection (horizontal swipe > 50px)
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      touchHandledRef.current = true;
      goTo(dx < 0 ? c + 1 : c - 1);
      return;
    }

    // Tap detection (minimal movement) — tap right half = next, left half = prev
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      touchHandledRef.current = true;
      goTo(endX > window.innerWidth / 2 ? c + 1 : c - 1);
      return;
    }

    // Neither swipe nor tap — snap back
    goTo(c);
  };

  const handleClick = (e) => {
    // Skip if already handled by touch event
    if (touchHandledRef.current) { touchHandledRef.current = false; return; }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/95 z-[100] overflow-hidden"
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <button className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl z-10" onClick={e => { e.stopPropagation(); onClose(); }}>&#10005;</button>

      {images.length > 1 && (
        <>
          <button
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-3xl z-10 p-2"
            onClick={e => { e.stopPropagation(); goTo(currentRef.current - 1); }}
          >&#8249;</button>
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-3xl z-10 p-2"
            onClick={e => { e.stopPropagation(); goTo(currentRef.current + 1); }}
          >&#8250;</button>
        </>
      )}

      <div
        ref={stripRef}
        className="flex items-center h-full will-change-transform"
        style={{ transform: `translateX(${-index * 100}vw)` }}
      >
        {images.map((img, i) => (
          <div key={i} className="w-screen h-full flex items-center justify-center shrink-0">
            <img src={img} alt="" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" onClick={e => e.stopPropagation()} />
          </div>
        ))}
      </div>

      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={e => { e.stopPropagation(); goTo(i); }}
              className={`w-2 h-2 rounded-full transition-colors ${i === current ? 'bg-white' : 'bg-white/30'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Share Button
// - On mobile browsers that support Web Share API: opens native share sheet (WhatsApp, IG, etc.)
// - Otherwise: falls back to copying the link
function ShareButton({ path }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = `${window.location.origin}${path}`;

    // Native share sheet (mostly mobile; some desktop browsers also support it).
    if (navigator.share) {
      try {
        await navigator.share({ url });
        return;
      } catch (err) {
        // User cancelled or denied; don't force a copy-to-clipboard fallback.
        if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return;
        // Otherwise, fall back to clipboard copy below.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <ActionIconButton
      onClick={handleShare}
      title={copied ? 'Copied' : (navigator.share ? 'Share' : 'Copy link')}
      ariaLabel={copied ? 'Link copied' : (navigator.share ? 'Share' : 'Copy link')}
      tone="neutral"
      active={copied}
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 7h3a5 5 0 0 1 0 10h-3m-6 0H6A5 5 0 0 1 6 7h3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="m9 12 6 0" />
        </svg>
      )}
    </ActionIconButton>
  );
}

// Pump Button
function PumpButton({ postId, initialCount, initialPumped }) {
  const { user } = useAuth();
  const [pumped, setPumped] = useState(!!initialPumped);
  const [count, setCount] = useState(initialCount || 0);
  const [animating, setAnimating] = useState(false);
  const [showPumpers, setShowPumpers] = useState(false);

  const handlePump = async () => {
    if (!user) return;
    try {
      const res = await pumpPost(postId);
      setPumped(res.pumped);
      setCount(res.pump_count);
      if (res.pumped) {
        setAnimating(true);
        setTimeout(() => setAnimating(false), 600);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <button
        onClick={handlePump}
        disabled={!user}
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm font-display font-bold transition-all ${
          pumped
            ? 'text-piu-gold bg-piu-gold/10'
            : 'text-gray-400 hover:text-piu-gold hover:bg-piu-gold/5'
        } ${!user ? 'opacity-50 cursor-not-allowed' : ''}`}
        title={user ? (pumped ? 'Un-pump' : 'Pump it up!') : 'Log in to pump'}
      >
        <img
          src={pumped ? '/piu/stomp-yellow.svg' : '/piu/stomp-gray.svg'}
          alt=""
          className={`w-5 h-5 ${animating ? 'animate-bounce' : ''}`}
        />
      </button>
      {count > 0 && (
        <button
          type="button"
          onClick={() => setShowPumpers(true)}
          className="px-2.5 py-1.5 rounded-lg text-sm font-display font-bold text-gray-300 hover:text-white hover:bg-piu-dark/50 transition-colors"
          title="See who pumped this post"
        >
          {count}
        </button>
      )}
      <PumpersModal
        open={showPumpers}
        onClose={() => setShowPumpers(false)}
        title={`Pumped by (${count})`}
        loadPumpers={() => getPostPumpers(postId)}
        reloadKey={count}
      />
    </>
  );
}

// Small inline pump button for comments
function CommentPumpButton({ commentId, type, initialCount, initialPumped }) {
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
    <button
      onClick={toggle}
      disabled={!user}
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

// Comment Section
function CommentSection({ postId, postAuthorId, commentsDisabled, commentCount, isOwner, focusCommentId }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [disabled, setDisabled] = useState(!!commentsDisabled);
  const [count, setCount] = useState(commentCount || 0);
  const [mentionToken, setMentionToken] = useState(null);
  const [mentionUsers, setMentionUsers] = useState([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [highlightedCommentId, setHighlightedCommentId] = useState(null);
  const inputRef = useRef(null);
  const mentionRequestRef = useRef(0);
  const commentNodeRefs = useRef(new Map());
  const focusedTargetRef = useRef('');

  useEffect(() => {
    if (!user || disabled || !mentionToken?.query) {
      setMentionUsers([]);
      setShowMentions(false);
      setMentionLoading(false);
      return;
    }

    const requestId = ++mentionRequestRef.current;
    setMentionLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const found = await searchUsers(mentionToken.query);
        if (requestId !== mentionRequestRef.current) return;
        const filtered = (found || [])
          .filter(u => u?.username && u.id !== user.id)
          .slice(0, 6);
        setMentionUsers(filtered);
        setShowMentions(filtered.length > 0);
      } catch {
        if (requestId === mentionRequestRef.current) {
          setMentionUsers([]);
          setShowMentions(false);
        }
      } finally {
        if (requestId === mentionRequestRef.current) setMentionLoading(false);
      }
    }, 150);

    return () => clearTimeout(timeout);
  }, [mentionToken?.query, user, disabled]);

  const loadComments = async () => {
    setLoading(true);
    try {
      const data = await getPostComments(postId);
      setComments(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!focusCommentId) return;
    if (!open) setOpen(true);
    loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCommentId, postId]);

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

  const updateMentionState = (value, cursorOverride) => {
    const cursor = Number.isFinite(cursorOverride)
      ? cursorOverride
      : (inputRef.current?.selectionStart ?? String(value || '').length);
    const token = getActiveMentionQuery(value, cursor);
    setMentionToken(token);
    if (!token) {
      setShowMentions(false);
      setMentionUsers([]);
      setMentionLoading(false);
    }
  };

  const handleInputChange = (value) => {
    setNewComment(value);
    updateMentionState(value);
  };

  const insertSticker = (token) => {
    const current = String(newComment || '');
    const input = inputRef.current;
    if (!input) {
      const next = `${current}${token}`;
      setNewComment(next);
      updateMentionState(next, next.length);
      return;
    }
    const start = input.selectionStart ?? current.length;
    const end = input.selectionEnd ?? current.length;
    const next = `${current.slice(0, start)}${token}${current.slice(end)}`;
    const nextCursor = start + token.length;
    setNewComment(next);
    updateMentionState(next, nextCursor);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const applyMention = (selectedUsername) => {
    const current = String(newComment || '');
    const cursor = inputRef.current?.selectionStart ?? current.length;
    const token = getActiveMentionQuery(current, cursor) || mentionToken;
    if (!token) return;

    const next = `${current.slice(0, token.start)}@${selectedUsername} ${current.slice(token.end)}`;
    const nextCursor = token.start + selectedUsername.length + 2;
    setNewComment(next);
    setMentionToken(null);
    setMentionUsers([]);
    setShowMentions(false);
    setMentionLoading(false);

    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (showMentions && mentionUsers.length > 0) {
        e.preventDefault();
        applyMention(mentionUsers[0].username);
        return;
      }
      e.preventDefault();
      handleSubmit();
      return;
    }
    if (e.key === 'Escape' && showMentions) {
      e.preventDefault();
      setShowMentions(false);
    }
  };

  const handleToggle = () => {
    if (!open) loadComments();
    setOpen(!open);
  };

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    try {
      const comment = await addPostComment(postId, newComment, replyTo);
      if (replyTo) {
        setComments(prev => prev.map(c =>
          c.id === replyTo ? { ...c, replies: [...(c.replies || []), comment] } : c
        ));
      } else {
        setComments(prev => [...prev, comment]);
      }
      setNewComment('');
      setReplyTo(null);
      setCount(c => c + 1);
      setMentionToken(null);
      setMentionUsers([]);
      setShowMentions(false);
      setMentionLoading(false);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (commentId, isReply, parentId) => {
    try {
      await deletePostComment(commentId);
      if (isReply && parentId) {
        setComments(prev => prev.map(c =>
          c.id === parentId ? { ...c, replies: c.replies.filter(r => r.id !== commentId) } : c
        ));
        setCount(c => c - 1);
      } else {
        const removed = comments.find(c => c.id === commentId);
        const removedCount = 1 + (removed?.replies?.length || 0);
        setComments(prev => prev.filter(c => c.id !== commentId));
        setCount(c => c - removedCount);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleToggleComments = async () => {
    try {
      const res = await togglePostComments(postId);
      setDisabled(res.comments_disabled);
    } catch (err) {
      alert(err.message);
    }
  };

  const startReply = (commentId, username) => {
    setReplyTo(commentId);
    const value = `@${username} `;
    setNewComment(value);
    updateMentionState(value, value.length);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <>
      <ActionIconButton
        onClick={handleToggle}
        title={open ? 'Hide comments' : 'Show comments'}
        ariaLabel={open ? 'Hide comments' : 'Show comments'}
        count={count}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 10.5h10M7 14h6m8 4-3.8-1.3a9.2 9.2 0 0 1-3.2.55C7.925 17.25 4 14.22 4 10.5S7.925 3.75 12.75 3.75 21.5 6.78 21.5 10.5c0 1.75-.87 3.34-2.3 4.52L21 18Z" />
        </svg>
      </ActionIconButton>

      {open && (
        <div className="w-full order-last mt-2 pt-2 border-t border-piu-border/30">
          {isOwner && (
            <button
              onClick={handleToggleComments}
              className="text-[10px] text-gray-500 hover:text-piu-accent mb-2 font-display"
            >
              {disabled ? 'Enable comments' : 'Disable comments'}
            </button>
          )}

          {disabled && (
            <p className="text-xs text-gray-500 italic mb-2">Comments are disabled on this post.</p>
          )}

          {loading ? (
            <p className="text-xs text-gray-500 py-2">Loading comments...</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto overflow-x-hidden">
              {comments.map(c => (
                <div
                  key={c.id}
                  ref={setCommentNodeRef(c.id)}
                  tabIndex={-1}
                  className={`rounded-lg p-1 outline-none transition-all ${
                    highlightedCommentId === String(c.id) ? 'ring-1 ring-piu-accent/60 bg-piu-accent/10' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <Link to={getProfilePath(c.user_id, c.username)}>
                      {c.avatar ? (
                        <img src={getAvatarUrl(c.avatar)} alt="" className="w-6 h-6 rounded-full object-cover border border-piu-border shrink-0" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-[10px] shrink-0">
                          {(c.username || '?')[0].toUpperCase()}
                        </div>
                      )}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="bg-piu-dark/50 rounded-lg px-2.5 pt-0.5 pb-1.5">
                        <Link to={getProfilePath(c.user_id, c.username)} className="block font-display font-semibold text-xs text-gray-100 hover:text-piu-accent transition-colors leading-none">
                          {c.username}
                        </Link>
                        <div className="text-[13px] text-gray-200 break-words leading-snug mt-1">{renderFormattedText(c.content)}</div>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 px-1">
                        <span className="text-[10px] text-gray-600">{timeAgo(c.created_at)}</span>
                        <CommentPumpButton commentId={c.id} type="post" initialCount={c.pump_count || 0} initialPumped={c.user_pumped} />
                        {user && !disabled && (
                          <button onClick={() => startReply(c.id, c.username)} className="text-[10px] text-gray-500 hover:text-piu-accent">
                            Reply
                          </button>
                        )}
                        {user && (c.user_id === user.id || user.id === postAuthorId) && (
                          <button onClick={() => handleDelete(c.id, false)} className="text-[10px] text-gray-600 hover:text-red-400">
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Replies */}
                  {c.replies && c.replies.length > 0 && (
                    <div className="ml-8 mt-1 space-y-1">
                      {c.replies.map(r => (
                        <div
                          key={r.id}
                          ref={setCommentNodeRef(r.id)}
                          tabIndex={-1}
                          className={`flex items-start gap-2 rounded-lg p-1 outline-none transition-all ${
                            highlightedCommentId === String(r.id) ? 'ring-1 ring-piu-accent/60 bg-piu-accent/10' : ''
                          }`}
                        >
                          <Link to={getProfilePath(r.user_id, r.username)}>
                            {r.avatar ? (
                              <img src={getAvatarUrl(r.avatar)} alt="" className="w-5 h-5 rounded-full object-cover border border-piu-border shrink-0" />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-[8px] shrink-0">
                                {(r.username || '?')[0].toUpperCase()}
                              </div>
                            )}
                          </Link>
                          <div className="flex-1 min-w-0">
                            <div className="bg-piu-dark/30 rounded-lg px-2 pt-0.5 pb-1">
                              <Link to={getProfilePath(r.user_id, r.username)} className="block font-display font-semibold text-[11px] text-gray-100 hover:text-piu-accent transition-colors leading-none">
                                {r.username}
                              </Link>
                              <div className="text-xs text-gray-200 break-words leading-snug mt-1">{renderFormattedText(r.content)}</div>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 px-1">
                              <span className="text-[9px] text-gray-600">{timeAgo(r.created_at)}</span>
                              <CommentPumpButton commentId={r.id} type="post" initialCount={r.pump_count || 0} initialPumped={r.user_pumped} />
                              {user && !disabled && (
                                <button onClick={() => startReply(c.id, r.username)} className="text-[9px] text-gray-500 hover:text-piu-accent">
                                  Reply
                                </button>
                              )}
                              {user && (r.user_id === user.id || user.id === postAuthorId) && (
                                <button onClick={() => handleDelete(r.id, true, c.id)} className="text-[9px] text-gray-600 hover:text-red-400">
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Comment input */}
          {user && !disabled && (
            <div className="flex items-center gap-2 mt-2">
              {replyTo && (
                <button onClick={() => {
                  setReplyTo(null);
                  setNewComment('');
                  setMentionToken(null);
                  setMentionUsers([]);
                  setShowMentions(false);
                  setMentionLoading(false);
                }} className="text-[10px] text-gray-500 hover:text-red-400 shrink-0">
                  &#10005;
                </button>
              )}
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  className="input-field text-xs py-1.5 w-full"
                  placeholder={replyTo ? 'Write a reply...' : 'Write a comment...'}
                  value={newComment}
                  onChange={e => handleInputChange(e.target.value)}
                  onClick={() => updateMentionState(newComment)}
                  onKeyDown={handleInputKeyDown}
                />
                {(showMentions || mentionLoading) && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-lg border border-piu-border bg-piu-card shadow-xl max-h-48 overflow-y-auto">
                    {mentionLoading && mentionUsers.length === 0 ? (
                      <p className="px-3 py-2 text-[11px] text-gray-500">Searching...</p>
                    ) : mentionUsers.length === 0 ? (
                      <p className="px-3 py-2 text-[11px] text-gray-500">No users found</p>
                    ) : (
                      mentionUsers.map(u => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => applyMention(u.username)}
                          className="w-full px-3 py-2 text-left hover:bg-piu-dark/60 transition-colors flex items-center gap-2"
                        >
                          {u.avatar ? (
                            <img src={getAvatarUrl(u.avatar)} alt="" className="w-5 h-5 rounded-full object-cover border border-piu-border" />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-[9px]">
                              {(u.username || '?')[0].toUpperCase()}
                            </div>
                          )}
                          <span className="text-xs font-display font-bold">@{u.username}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <DojoCatStickerPicker onSelect={insertSticker} compact align="right" />
              <button
                onClick={handleSubmit}
                disabled={!newComment.trim()}
                className="text-xs font-display font-bold text-piu-accent hover:text-white disabled:opacity-30 transition-colors shrink-0"
              >
                Send
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// Full Post Card used in Feed and Profile
export default function PostCard({ post, showAuthor = true, onDelete, onUpdate, isOwner = false, focusCommentId = null }) {
  const { user } = useAuth();
  const initialSummarySplit = useMemo(() => splitSessionSummaryContent(post.content || ''), [post.content]);
  const initialShareSplit = useMemo(() => splitSessionShareContent(initialSummarySplit.text || ''), [initialSummarySplit.text]);
  const initialLiveSplit = useMemo(() => splitLiveSessionContent(initialShareSplit.text || ''), [initialShareSplit.text]);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(initialLiveSplit.text || '');
  const [editYoutubeUrl, setEditYoutubeUrl] = useState(post.youtube_url || '');
  const [saving, setSaving] = useState(false);
  const [currentContent, setCurrentContent] = useState(post.content || '');
  const [currentYoutubeUrl, setCurrentYoutubeUrl] = useState(post.youtube_url || '');
  const [currentLiveMetrics, setCurrentLiveMetrics] = useState(post.live_summary_metrics || null);
  const [wasEdited, setWasEdited] = useState(!!post.updated_at);
  const parsedSummary = useMemo(() => splitSessionSummaryContent(currentContent), [currentContent]);
  const parsedShare = useMemo(() => splitSessionShareContent(parsedSummary.text || ''), [parsedSummary.text]);
  const parsedLive = useMemo(() => splitLiveSessionContent(parsedShare.text || ''), [parsedShare.text]);
  const planParsed = useMemo(() => splitSessionPlanContent(parsedLive.text || ''), [parsedLive.text]);
  const rawVisibleContent = planParsed.text || '';
  const currentSummary = parsedSummary.summary;
  const currentShare = parsedShare.share;
  const currentLive = useMemo(
    () => mergeLiveSessionSummary(parsedLive.live, currentLiveMetrics),
    [parsedLive.live, currentLiveMetrics]
  );
  const currentPlan = planParsed.plan;
  const visibleContent = currentLive && rawVisibleContent.trim().startsWith('🔴 **Shinsa Live Recap**')
    ? ''
    : rawVisibleContent;
  const images = (() => {
    try { return JSON.parse(post.images || '[]'); } catch { return []; }
  })();
  const postLinkShare = useMemo(() => buildPostLinkShare({
    postId: post.id,
    username: post.username,
    text: visibleContent,
    images,
    shareType: currentShare?.shareType || '',
  }), [currentShare?.shareType, images, post.id, post.username, visibleContent]);
  const achievementBadgePost = parseAchievementBadgePost(visibleContent, images);

  const flag = showAuthor ? getCountryFlag(post.nationality) : null;
  const canEdit = user && user.id === post.user_id;

  useEffect(() => {
    setCurrentLiveMetrics(post.live_summary_metrics || null);
  }, [post.live_summary_metrics]);

  const handleEdit = () => {
    setEditContent(visibleContent);
    setEditYoutubeUrl(currentYoutubeUrl);
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const summaryMarker = currentSummary ? serializeSessionSummaryMarker(currentSummary) : '';
      const shareMarker = currentShare ? serializeSessionShareMarker(currentShare) : '';
      const liveMarker = currentLive ? serializeLiveSessionMarker(currentLive) : '';
      const planMarker = currentPlan ? serializeSessionPlanMarker(currentPlan) : '';
      const contentToSave = [editContent.trim(), summaryMarker, shareMarker, liveMarker, planMarker].filter(Boolean).join('\n\n');
      const updated = await editPost(post.id, { content: contentToSave, youtube_url: editYoutubeUrl });
      setCurrentContent(updated.content || '');
      setCurrentYoutubeUrl(updated.youtube_url || '');
      setCurrentLiveMetrics(updated.live_summary_metrics || null);
      setWasEdited(true);
      setEditing(false);
      if (onUpdate) onUpdate(updated);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditContent(visibleContent);
    setEditYoutubeUrl(currentYoutubeUrl);
    setEditing(false);
  };

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {showAuthor && (
            <Link to={getProfilePath(post.user_id, post.username)}>
              {post.avatar ? (
                <img src={getAvatarUrl(post.avatar)} alt="" className="w-9 h-9 rounded-full object-cover border border-piu-border" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-sm">
                  {(post.username || '?')[0].toUpperCase()}
                </div>
              )}
            </Link>
          )}
          <div>
            {showAuthor && (
              <Link to={getProfilePath(post.user_id, post.username)} className="font-display font-bold text-sm hover:text-piu-accent transition-colors">
                {flag && <span className="mr-1">{flag}</span>}
                {post.username}
              </Link>
            )}
            <p className="text-[10px] text-gray-500">
              {timeAgo(post.created_at)}
              {wasEdited && <span className="ml-1 text-gray-600">(edited)</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && !editing && (
            <button
              onClick={handleEdit}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:text-piu-accent hover:bg-piu-dark/50 transition-colors"
              title="Edit post"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
          {onDelete && isOwner && (
            <button
              onClick={() => onDelete(post.id)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:text-red-400 hover:bg-piu-dark/50 transition-colors"
              title="Delete post"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {editing ? (
        <div className="mb-3">
          <textarea
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            className="input-field w-full resize-none min-h-[80px] text-sm mb-2"
            rows={3}
          />
          {(currentYoutubeUrl || editYoutubeUrl) && (
            <input
              type="text"
              className="input-field text-xs py-1.5 w-full mb-2"
              placeholder="YouTube URL"
              value={editYoutubeUrl}
              onChange={e => setEditYoutubeUrl(e.target.value)}
            />
          )}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary px-3 py-1 text-xs"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1 text-xs text-gray-400 hover:text-white bg-piu-dark rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {achievementBadgePost ? (
            <AchievementBadgePost
              badgeName={achievementBadgePost.badgeName}
              supportingCopy={achievementBadgePost.supportingCopy}
              image={achievementBadgePost.image}
              onImageClick={setLightboxIndex}
            />
          ) : (
            <>
              {visibleContent && (
                <div className="text-sm text-gray-200 whitespace-pre-wrap break-words mb-3 leading-relaxed">
                  {renderFormattedText(visibleContent)}
                </div>
              )}
              {currentSummary && (
                <SessionSummaryCard summary={currentSummary} title="Session Summary" className="mb-3" />
              )}
              {currentShare && (
                <SessionShareCard
                  share={currentShare}
                  title={currentShare?.shareType === 'hour_of_power' ? 'Hour of Power Recap' : 'Session Share'}
                  className="mb-3"
                  actions={user ? (
                    <SendToDirectMessageButton
                      share={currentShare}
                      title={currentShare?.shareType === 'hour_of_power' ? 'Send Hour of Power recap' : 'Send session share'}
                      description="Choose a player to send this recap to."
                    />
                  ) : null}
                />
              )}
              {currentLive && (
                <LiveSessionCard summary={currentLive} title="Shinsa Live Recap" className="mb-3" />
              )}
              {currentPlan && (
                <SessionPlanCard plan={currentPlan} className="mb-3" defaultScoringExpanded={false} defaultPassingExpanded={false} />
              )}
            </>
          )}
        </>
      )}

      {/* YouTube */}
      {!editing && currentYoutubeUrl && <YouTubeEmbed url={currentYoutubeUrl} />}

      {/* Images */}
      {!achievementBadgePost && <ImageGrid images={images} onImageClick={setLightboxIndex} />}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox images={images} index={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}

      {/* Actions: Pump + Comments + Share */}
      <div className="border-t border-piu-border/20 pt-2 mt-1">
        <div className="flex items-center gap-2 flex-wrap">
          <PumpButton
            postId={post.id}
            initialCount={post.pump_count || 0}
            initialPumped={post.user_pumped}
          />
          <CommentSection
            postId={post.id}
            postAuthorId={post.user_id}
            commentsDisabled={post.comments_disabled}
            commentCount={post.comment_count || 0}
            isOwner={user && user.id === post.user_id}
            focusCommentId={focusCommentId}
          />
          {user && postLinkShare ? (
            <SendToDirectMessageButton
              linkShare={postLinkShare}
              variant="icon"
              title="Send post to a player"
              className="px-2.5 py-1.5 text-sm text-gray-400 hover:bg-piu-dark/50 hover:text-white"
            />
          ) : null}
          <ShareButton path={`/post/${post.id}`} />
        </div>
      </div>
    </div>
  );
}

// Export sub-components for reuse
export { ImageGrid, Lightbox, YouTubeEmbed, PumpButton, CommentSection, ShareButton, timeAgo };
