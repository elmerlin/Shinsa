import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getUserPosts, createPost, deletePost } from '../utils/api';
import { getAvatarUrl } from '../components/AvatarPicker';

// Common emoji sets for quick insert
const EMOJI_GROUPS = [
  { label: 'Faces', emojis: ['😀','😂','🤣','😊','😎','🤩','😍','🥳','🤔','😱','😤','😭','🙄','😴','🤮'] },
  { label: 'Hands', emojis: ['👍','👎','👏','🙌','💪','✌️','🤞','🤘','👊','✊','🫡','🫶'] },
  { label: 'PIU', emojis: ['🎵','🎶','🎤','🎮','🕹️','🏆','🥇','🥈','🥉','🔥','⭐','💥','💯','🚀','⚡'] },
  { label: 'Hearts', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💖'] },
];

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

function PostComposer({ onPost }) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [posting, setPosting] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const textRef = useRef(null);
  const fileRef = useRef(null);
  const emojiRef = useRef(null);

  // Close emoji picker on outside click
  useEffect(() => {
    function handleClick(e) {
      if (emojiRef.current && !emojiRef.current.contains(e.target)) setShowEmojis(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files).slice(0, 4 - images.length);
    const newImages = [...images, ...files].slice(0, 4);
    setImages(newImages);

    // Generate previews
    const newPreviews = [];
    for (const f of newImages) {
      newPreviews.push(URL.createObjectURL(f));
    }
    // Clean up old previews
    previews.forEach(p => URL.revokeObjectURL(p));
    setPreviews(newPreviews);
  };

  const removeImage = (idx) => {
    URL.revokeObjectURL(previews[idx]);
    setImages(imgs => imgs.filter((_, i) => i !== idx));
    setPreviews(prevs => prevs.filter((_, i) => i !== idx));
  };

  const insertEmoji = (emoji) => {
    const textarea = textRef.current;
    if (!textarea) {
      setContent(c => c + emoji);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent = content.slice(0, start) + emoji + content.slice(end);
    setContent(newContent);
    // Move cursor after emoji
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
      textarea.focus();
    }, 0);
  };

  const applyFormat = (prefix, suffix) => {
    const textarea = textRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.slice(start, end);
    const newContent = content.slice(0, start) + prefix + selected + suffix + content.slice(end);
    setContent(newContent);
    setTimeout(() => {
      textarea.selectionStart = start + prefix.length;
      textarea.selectionEnd = end + prefix.length;
      textarea.focus();
    }, 0);
  };

  const handleSubmit = async () => {
    if (!content.trim() && images.length === 0) return;
    setPosting(true);
    try {
      const post = await createPost(content, images);
      setContent('');
      setImages([]);
      previews.forEach(p => URL.revokeObjectURL(p));
      setPreviews([]);
      onPost(post);
    } catch (err) {
      alert(err.message);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="card mb-6">
      <div className="flex items-start gap-3 mb-3">
        {user.avatar ? (
          <img src={getAvatarUrl(user.avatar)} alt="" className="w-9 h-9 rounded-full object-cover border border-piu-border shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-sm shrink-0">
            {user.username[0].toUpperCase()}
          </div>
        )}
        <textarea
          ref={textRef}
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="What's on your mind?"
          className="input-field flex-1 resize-none min-h-[80px]"
          rows={3}
        />
      </div>

      {/* Image previews */}
      {previews.length > 0 && (
        <div className="flex gap-2 mb-3 flex-wrap">
          {previews.map((src, i) => (
            <div key={i} className="relative">
              <img src={src} alt="" className="w-20 h-20 rounded-lg object-cover" />
              <button
                onClick={() => removeImage(i)}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between border-t border-piu-border/30 pt-2">
        <div className="flex items-center gap-1">
          {/* Bold */}
          <button
            onClick={() => applyFormat('**', '**')}
            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors text-xs font-bold"
            title="Bold"
          >
            B
          </button>
          {/* Italic */}
          <button
            onClick={() => applyFormat('*', '*')}
            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors text-xs italic"
            title="Italic"
          >
            I
          </button>
          {/* Strikethrough */}
          <button
            onClick={() => applyFormat('~~', '~~')}
            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors text-xs line-through"
            title="Strikethrough"
          >
            S
          </button>

          <div className="w-px h-5 bg-piu-border/30 mx-1" />

          {/* Emoji picker */}
          <div className="relative" ref={emojiRef}>
            <button
              onClick={() => setShowEmojis(!showEmojis)}
              className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors text-sm"
              title="Emoji"
            >
              &#9786;
            </button>
            {showEmojis && (
              <div className="absolute left-0 top-full mt-1 bg-piu-card border border-piu-border rounded-xl shadow-2xl z-50 p-3 w-72">
                {EMOJI_GROUPS.map(group => (
                  <div key={group.label} className="mb-2">
                    <p className="text-[10px] text-gray-500 font-display mb-1">{group.label}</p>
                    <div className="flex flex-wrap gap-1">
                      {group.emojis.map(e => (
                        <button
                          key={e}
                          onClick={() => insertEmoji(e)}
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-piu-dark/50 transition-colors text-base"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Image upload */}
          <button
            onClick={() => fileRef.current?.click()}
            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors text-sm"
            title="Attach images (max 4)"
            disabled={images.length >= 4}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageSelect}
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={posting || (!content.trim() && images.length === 0)}
          className="btn-primary px-4 py-1.5 text-xs disabled:opacity-50"
        >
          {posting ? 'Posting...' : 'Post'}
        </button>
      </div>
    </div>
  );
}

export default function PostsPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getUserPosts(user.id, 1).then(data => {
      setPosts(data);
      setHasMore(data.length >= 20);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  const handleNewPost = (post) => {
    setPosts(prev => [{ ...post, username: user.username, avatar: user.avatar }, ...prev]);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this post?')) return;
    try {
      await deletePost(id);
      setPosts(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  const loadMore = async () => {
    const nextPage = page + 1;
    const data = await getUserPosts(user.id, nextPage);
    setPosts(prev => [...prev, ...data]);
    setPage(nextPage);
    setHasMore(data.length >= 20);
  };

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <h2 className="font-display font-bold text-xl mb-4">Posts</h2>
        <p className="text-gray-400 mb-4">Log in to create and view your posts.</p>
        <Link to="/login" className="btn-primary inline-block">Login</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display font-bold text-xl">My Posts</h2>
        <Link to="/feed" className="text-xs text-piu-accent hover:underline font-display">Activity Feed</Link>
      </div>

      <PostComposer onPost={handleNewPost} />

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading posts...</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 mb-2">No posts yet</p>
          <p className="text-gray-500 text-sm">Create your first post above!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map(post => {
            const images = (() => {
              try { return JSON.parse(post.images || '[]'); } catch { return []; }
            })();

            return (
              <div key={post.id} className="card">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {post.avatar ? (
                      <img src={getAvatarUrl(post.avatar)} alt="" className="w-9 h-9 rounded-full object-cover border border-piu-border" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-sm">
                        {(post.username || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-display font-bold text-sm">{post.username}</p>
                      <p className="text-[10px] text-gray-500">{timeAgo(post.created_at)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(post.id)}
                    className="text-gray-600 hover:text-red-400 text-xs transition-colors"
                    title="Delete post"
                  >
                    &#10005;
                  </button>
                </div>

                {post.content && (
                  <div className="text-sm text-gray-200 whitespace-pre-wrap break-words mb-3 leading-relaxed">
                    {renderFormattedText(post.content)}
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

// Simple markdown-ish rendering for bold, italic, strikethrough
function renderFormattedText(text) {
  if (!text) return null;
  // Split into segments: **bold**, *italic*, ~~strikethrough~~
  const parts = [];
  let remaining = text;
  let key = 0;

  const patterns = [
    { regex: /\*\*(.+?)\*\*/g, render: (match) => <strong key={key++} className="font-bold">{match}</strong> },
    { regex: /\*(.+?)\*/g, render: (match) => <em key={key++}>{match}</em> },
    { regex: /~~(.+?)~~/g, render: (match) => <span key={key++} className="line-through text-gray-500">{match}</span> },
  ];

  // Simple approach: process sequentially
  const combined = /(\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~)/g;
  let lastIndex = 0;
  let match;

  while ((match = combined.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      // Bold: **text**
      parts.push(<strong key={key++} className="font-bold">{match[2]}</strong>);
    } else if (match[3]) {
      // Italic: *text*
      parts.push(<em key={key++}>{match[3]}</em>);
    } else if (match[4]) {
      // Strikethrough: ~~text~~
      parts.push(<span key={key++} className="line-through text-gray-500">{match[4]}</span>);
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}
