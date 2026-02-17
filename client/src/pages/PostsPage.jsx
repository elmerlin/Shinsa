import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getUserPosts, createPost, deletePost } from '../utils/api';
import { getAvatarUrl } from '../components/AvatarPicker';
import PostCard from '../components/PostCard';
import ImageEditor from '../components/ImageEditor';

// Common emoji sets for quick insert
const EMOJI_GROUPS = [
  { label: 'Faces', emojis: ['😀','😂','🤣','😊','😎','🤩','😍','🥳','🤔','😱','😤','😭','🙄','😴','🤮'] },
  { label: 'Hands', emojis: ['👍','👎','👏','🙌','💪','✌️','🤞','🤘','👊','✊','🫡','🫶'] },
  { label: 'PIU', emojis: ['🎵','🎶','🎤','🎮','🕹️','🏆','🥇','🥈','🥉','🔥','⭐','💥','💯','🚀','⚡'] },
  { label: 'Hearts', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💖'] },
];

function PostComposer({ onPost }) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [showYoutubeInput, setShowYoutubeInput] = useState(false);
  const [commentsDisabled, setCommentsDisabled] = useState(false);
  const [posting, setPosting] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
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
    const files = Array.from(e.target.files).slice(0, 9 - images.length);
    const newImages = [...images, ...files].slice(0, 9);
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
    if (!content.trim() && images.length === 0 && !youtubeUrl.trim()) return;
    setPosting(true);
    try {
      const post = await createPost(content, images, youtubeUrl.trim() || undefined, commentsDisabled || undefined);
      setContent('');
      setImages([]);
      previews.forEach(p => URL.revokeObjectURL(p));
      setPreviews([]);
      setYoutubeUrl('');
      setShowYoutubeInput(false);
      setCommentsDisabled(false);
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

      {/* YouTube URL input */}
      {showYoutubeInput && (
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            className="input-field text-xs py-1.5 flex-1"
            placeholder="Paste YouTube URL (e.g. youtube.com/watch?v=...)"
            value={youtubeUrl}
            onChange={e => setYoutubeUrl(e.target.value)}
          />
          <button onClick={() => { setShowYoutubeInput(false); setYoutubeUrl(''); }} className="text-gray-500 hover:text-red-400 text-xs">&#10005;</button>
        </div>
      )}

      {/* Image previews — WeChat grid style */}
      {previews.length > 0 && (
        <div className={`grid gap-1.5 mb-3 ${previews.length === 1 ? 'grid-cols-1 max-w-[120px]' : previews.length <= 4 ? 'grid-cols-2 max-w-[200px]' : 'grid-cols-3 max-w-[280px]'}`}>
          {previews.map((src, i) => (
            <div key={i} className="relative group">
              <img src={src} alt="" className="w-full aspect-square rounded-lg object-cover" />
              <button
                onClick={() => setEditingIndex(i)}
                className="absolute bottom-1 left-1 w-6 h-6 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center hover:bg-black/80 transition-colors"
                title="Edit image"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
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

      {/* Image Editor Modal */}
      {editingIndex !== null && images[editingIndex] && (
        <ImageEditor
          file={images[editingIndex]}
          onDone={(editedFile) => {
            const newImages = [...images];
            newImages[editingIndex] = editedFile;
            setImages(newImages);
            // Regenerate previews
            const newPreviews = newImages.map(f => URL.createObjectURL(f));
            previews.forEach(p => URL.revokeObjectURL(p));
            setPreviews(newPreviews);
            setEditingIndex(null);
          }}
          onCancel={() => setEditingIndex(null)}
        />
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
            title="Attach images (max 9)"
            disabled={images.length >= 9}
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

          {/* YouTube link */}
          <button
            onClick={() => setShowYoutubeInput(!showYoutubeInput)}
            className={`p-1.5 rounded hover:bg-piu-dark/50 transition-colors text-sm ${showYoutubeInput || youtubeUrl ? 'text-red-400' : 'text-gray-400 hover:text-white'}`}
            title="Attach YouTube video"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zM9 16V8l8 4-8 4z"/>
            </svg>
          </button>

          <div className="w-px h-5 bg-piu-border/30 mx-1" />

          {/* Disable comments toggle */}
          <button
            onClick={() => setCommentsDisabled(!commentsDisabled)}
            className={`p-1.5 rounded hover:bg-piu-dark/50 transition-colors text-xs font-display ${commentsDisabled ? 'text-red-400' : 'text-gray-400 hover:text-white'}`}
            title={commentsDisabled ? 'Comments disabled' : 'Disable comments'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={commentsDisabled
                ? "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                : "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              } />
            </svg>
          </button>
        </div>

        <button
          onClick={handleSubmit}
          disabled={posting || (!content.trim() && images.length === 0 && !youtubeUrl.trim())}
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
          {posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              showAuthor={true}
              onDelete={handleDelete}
              isOwner={true}
            />
          ))}

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
