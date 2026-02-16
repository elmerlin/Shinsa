import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from './AvatarPicker';
import { getCountryFlag } from './PlayerRegistration';
import { renderFormattedText } from '../utils/formatText';
import { pumpPost, getPostComments, addPostComment, deletePostComment, togglePostComments } from '../utils/api';

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

// Extract YouTube video ID from various URL formats
function getYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const match = url.match(p);
    if (match) return match[1];
  }
  return null;
}

// YouTube Embed
function YouTubeEmbed({ url }) {
  const videoId = getYouTubeId(url);
  if (!videoId) return null;
  return (
    <div className="relative w-full mb-3 rounded-lg overflow-hidden" style={{ paddingBottom: '56.25%' }}>
      <iframe
        className="absolute inset-0 w-full h-full"
        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
        title="YouTube video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        frameBorder="0"
      />
    </div>
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
        <img
          key={i}
          src={img}
          alt=""
          className={`w-full rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity ${imgHeight}`}
          onClick={() => onImageClick(i)}
        />
      ))}
    </div>
  );
}

// Lightbox for fullscreen image viewing
function Lightbox({ images, index, onClose }) {
  const [current, setCurrent] = useState(index);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setCurrent(c => (c > 0 ? c - 1 : images.length - 1));
      if (e.key === 'ArrowRight') setCurrent(c => (c < images.length - 1 ? c + 1 : 0));
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [images.length, onClose]);

  return (
    <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center" onClick={onClose}>
      <button className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl z-10" onClick={onClose}>&#10005;</button>

      {images.length > 1 && (
        <>
          <button
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-3xl z-10 p-2"
            onClick={e => { e.stopPropagation(); setCurrent(c => (c > 0 ? c - 1 : images.length - 1)); }}
          >&#8249;</button>
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-3xl z-10 p-2"
            onClick={e => { e.stopPropagation(); setCurrent(c => (c < images.length - 1 ? c + 1 : 0)); }}
          >&#8250;</button>
        </>
      )}

      <img
        src={images[current]}
        alt=""
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
        onClick={e => e.stopPropagation()}
      />

      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={e => { e.stopPropagation(); setCurrent(i); }}
              className={`w-2 h-2 rounded-full transition-colors ${i === current ? 'bg-white' : 'bg-white/30'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Pump Button
function PumpButton({ postId, initialCount, initialPumped }) {
  const { user } = useAuth();
  const [pumped, setPumped] = useState(!!initialPumped);
  const [count, setCount] = useState(initialCount || 0);
  const [animating, setAnimating] = useState(false);

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
    <button
      onClick={handlePump}
      disabled={!user}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-display font-bold transition-all ${
        pumped
          ? 'text-piu-gold bg-piu-gold/10'
          : 'text-gray-400 hover:text-piu-gold hover:bg-piu-gold/5'
      } ${!user ? 'opacity-50 cursor-not-allowed' : ''}`}
      title={user ? (pumped ? 'Un-pump' : 'Pump it up!') : 'Log in to pump'}
    >
      <img
        src={pumped ? '/piu/stomp-yellow.svg' : '/piu/stomp-gray.svg'}
        alt=""
        className={`w-4 h-4 ${animating ? 'animate-bounce' : ''}`}
      />
      <span>{count > 0 ? count : ''}</span>
    </button>
  );
}

// Comment Section
function CommentSection({ postId, postAuthorId, commentsDisabled, commentCount, isOwner }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [disabled, setDisabled] = useState(!!commentsDisabled);
  const [count, setCount] = useState(commentCount || 0);
  const inputRef = useRef(null);

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
    setNewComment(`@${username} `);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div>
      <button
        onClick={handleToggle}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-display font-bold text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span>{count > 0 ? count : ''}</span>
      </button>

      {open && (
        <div className="mt-3 border-t border-piu-border/30 pt-3">
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
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {comments.map(c => (
                <div key={c.id}>
                  <div className="flex items-start gap-2">
                    <Link to={`/profile/${c.user_id}`}>
                      {c.avatar ? (
                        <img src={getAvatarUrl(c.avatar)} alt="" className="w-6 h-6 rounded-full object-cover border border-piu-border shrink-0" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-[10px] shrink-0">
                          {(c.username || '?')[0].toUpperCase()}
                        </div>
                      )}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="bg-piu-dark/50 rounded-lg px-2.5 py-1.5">
                        <Link to={`/profile/${c.user_id}`} className="font-display font-bold text-[11px] hover:text-piu-accent transition-colors">
                          {c.username}
                        </Link>
                        <p className="text-xs text-gray-200 break-words">{c.content}</p>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 px-1">
                        <span className="text-[10px] text-gray-600">{timeAgo(c.created_at)}</span>
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
                    <div className="ml-8 mt-1 space-y-1.5">
                      {c.replies.map(r => (
                        <div key={r.id} className="flex items-start gap-2">
                          <Link to={`/profile/${r.user_id}`}>
                            {r.avatar ? (
                              <img src={getAvatarUrl(r.avatar)} alt="" className="w-5 h-5 rounded-full object-cover border border-piu-border shrink-0" />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-[8px] shrink-0">
                                {(r.username || '?')[0].toUpperCase()}
                              </div>
                            )}
                          </Link>
                          <div className="flex-1 min-w-0">
                            <div className="bg-piu-dark/30 rounded-lg px-2 py-1">
                              <Link to={`/profile/${r.user_id}`} className="font-display font-bold text-[10px] hover:text-piu-accent transition-colors">
                                {r.username}
                              </Link>
                              <p className="text-[11px] text-gray-200 break-words">{r.content}</p>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 px-1">
                              <span className="text-[9px] text-gray-600">{timeAgo(r.created_at)}</span>
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
                <button onClick={() => { setReplyTo(null); setNewComment(''); }} className="text-[10px] text-gray-500 hover:text-red-400 shrink-0">
                  &#10005;
                </button>
              )}
              <input
                ref={inputRef}
                type="text"
                className="input-field text-xs py-1.5 flex-1"
                placeholder={replyTo ? 'Write a reply...' : 'Write a comment...'}
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
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
    </div>
  );
}

// Full Post Card used in Feed and Profile
export default function PostCard({ post, showAuthor = true, onDelete, isOwner = false }) {
  const { user } = useAuth();
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const images = (() => {
    try { return JSON.parse(post.images || '[]'); } catch { return []; }
  })();

  const flag = showAuthor ? getCountryFlag(post.nationality) : null;

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {showAuthor && (
            <Link to={`/profile/${post.user_id}`}>
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
              <Link to={`/profile/${post.user_id}`} className="font-display font-bold text-sm hover:text-piu-accent transition-colors">
                {flag && <span className="mr-1">{flag}</span>}
                {post.username}
              </Link>
            )}
            <p className="text-[10px] text-gray-500">{timeAgo(post.created_at)}</p>
          </div>
        </div>
        {onDelete && isOwner && (
          <button
            onClick={() => onDelete(post.id)}
            className="text-gray-600 hover:text-red-400 text-xs transition-colors"
            title="Delete post"
          >
            &#10005;
          </button>
        )}
      </div>

      {/* Content */}
      {post.content && (
        <div className="text-sm text-gray-200 whitespace-pre-wrap break-words mb-3 leading-relaxed">
          {renderFormattedText(post.content)}
        </div>
      )}

      {/* YouTube */}
      {post.youtube_url && <YouTubeEmbed url={post.youtube_url} />}

      {/* Images */}
      <ImageGrid images={images} onImageClick={setLightboxIndex} />

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox images={images} index={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}

      {/* Actions: Pump + Comments */}
      <div className="flex items-center gap-2 border-t border-piu-border/20 pt-2 mt-1">
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
        />
      </div>
    </div>
  );
}

// Export sub-components for reuse
export { ImageGrid, Lightbox, YouTubeEmbed, PumpButton, CommentSection, timeAgo };
