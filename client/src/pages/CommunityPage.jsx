import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getCountryFlag } from '../components/PlayerRegistration';
import { renderFormattedText } from '../utils/formatText';
import CommunityBadge from '../components/CommunityBadge';
import { CommunityTagList } from '../components/CommunityTag';
import { ImageGrid, Lightbox, YouTubeEmbed, ShareButton, timeAgo as postCardTimeAgo } from '../components/PostCard';
import ImageEditor from '../components/ImageEditor';
import {
  getCommunityByName, joinCommunity, leaveCommunity,
  getCommunityPosts, createCommunityPost, deleteCommunityPost, pinCommunityPost,
  pumpCommunityPost, getCommunityPostComments, addCommunityPostComment, deleteCommunityPostComment,
  getCommunityMembers, pumpCommunityComment, getCommunityEmojis,
} from '../utils/api';

// Common emoji sets for quick insert (same as PostsPage)
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

export default function CommunityPage() {
  const { communityName } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [community, setCommunity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('posts');
  const [postSort, setPostSort] = useState('new');
  const [posts, setPosts] = useState([]);
  const [members, setMembers] = useState([]);
  const [memberSort, setMemberSort] = useState('joined');
  const [postsLoading, setPostsLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  // Post composer state
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostImages, setNewPostImages] = useState([]);
  const [newPostYoutube, setNewPostYoutube] = useState('');
  const [posting, setPosting] = useState(false);

  // Comment state
  const [expandedComments, setExpandedComments] = useState({});
  const [commentTexts, setCommentTexts] = useState({});
  const [replyTo, setReplyTo] = useState({});

  const loadCommunity = useCallback(async () => {
    try {
      const data = await getCommunityByName(communityName);
      setCommunity(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [communityName]);

  const loadPosts = useCallback(async () => {
    if (!community) return;
    setPostsLoading(true);
    try {
      const data = await getCommunityPosts(community.id, { sort: postSort });
      setPosts(data);
    } catch (err) { console.error(err); }
    finally { setPostsLoading(false); }
  }, [community, postSort]);

  const loadMembers = useCallback(async () => {
    if (!community) return;
    setMembersLoading(true);
    try {
      const data = await getCommunityMembers(community.id, memberSort);
      setMembers(data);
    } catch (err) { console.error(err); }
    finally { setMembersLoading(false); }
  }, [community, memberSort]);

  useEffect(() => { loadCommunity(); }, [loadCommunity]);
  useEffect(() => { if (community && activeTab === 'posts') loadPosts(); }, [community, activeTab, postSort, loadPosts]);
  useEffect(() => { if (community && activeTab === 'members') loadMembers(); }, [community, activeTab, memberSort, loadMembers]);

  const handleJoin = async () => {
    if (!user) return navigate('/login');
    setJoining(true);
    try {
      const result = await joinCommunity(community.id);
      if (result.status === 'pending') {
        setCommunity(prev => ({ ...prev, user_pending_request: true }));
      } else {
        setCommunity(prev => ({ ...prev, user_role: 'member', member_count: prev.member_count + 1 }));
      }
    } catch (err) { setError(err.message); }
    finally { setJoining(false); }
  };

  const handleLeave = async () => {
    if (!confirm('Are you sure you want to leave this community?')) return;
    try {
      await leaveCommunity(community.id);
      setCommunity(prev => ({ ...prev, user_role: null, member_count: prev.member_count - 1 }));
    } catch (err) { setError(err.message); }
  };

  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!newPostContent.trim() && newPostImages.length === 0 && !newPostYoutube) return;
    setPosting(true);
    try {
      const formData = new FormData();
      formData.append('content', newPostContent);
      if (newPostYoutube) formData.append('youtube_url', newPostYoutube);
      for (const f of newPostImages) formData.append('images', f);
      const post = await createCommunityPost(community.id, formData);
      setPosts(prev => [post, ...prev]);
      setNewPostContent('');
      setNewPostImages([]);
      setNewPostYoutube('');
    } catch (err) { setError(err.message); }
    finally { setPosting(false); }
  };

  const handleDeletePost = async (postId) => {
    if (!confirm('Delete this post?')) return;
    try {
      await deleteCommunityPost(community.id, postId);
      setPosts(prev => prev.filter(p => p.id !== postId));
    } catch (err) { setError(err.message); }
  };

  const handlePinPost = async (postId) => {
    try {
      const result = await pinCommunityPost(community.id, postId);
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, is_pinned: result.pinned ? 1 : 0 } : p));
    } catch (err) { setError(err.message); }
  };

  const handlePumpPost = async (postId) => {
    try {
      const result = await pumpCommunityPost(community.id, postId);
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, user_pumped: result.pumped, pump_count: result.pump_count } : p));
    } catch (err) { console.error(err); }
  };

  const toggleComments = async (postId) => {
    if (expandedComments[postId]) {
      setExpandedComments(prev => ({ ...prev, [postId]: null }));
      return;
    }
    try {
      const comments = await getCommunityPostComments(community.id, postId);
      setExpandedComments(prev => ({ ...prev, [postId]: comments }));
    } catch (err) { console.error(err); }
  };

  const handleAddComment = async (postId, parentId) => {
    const key = parentId || postId;
    const content = commentTexts[key];
    if (!content?.trim()) return;
    try {
      const comment = await addCommunityPostComment(community.id, postId, content.trim(), parentId);
      setExpandedComments(prev => ({
        ...prev,
        [postId]: [...(prev[postId] || []), comment],
      }));
      setCommentTexts(prev => ({ ...prev, [key]: '' }));
      setReplyTo(prev => ({ ...prev, [postId]: null }));
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p));
    } catch (err) { setError(err.message); }
  };

  const handleDeleteComment = async (postId, commentId) => {
    try {
      await deleteCommunityPostComment(community.id, postId, commentId);
      setExpandedComments(prev => ({
        ...prev,
        [postId]: (prev[postId] || []).filter(c => c.id !== commentId),
      }));
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, comment_count: Math.max(0, (p.comment_count || 0) - 1) } : p));
    } catch (err) { console.error(err); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-piu-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!community) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-gray-400 text-lg font-display">{error || 'Community not found'}</p>
        <Link to="/" className="text-piu-accent hover:underline text-sm mt-4 inline-block">Go home</Link>
      </div>
    );
  }

  const isMember = !!community.user_role;
  const isModOrOwner = community.user_role === 'owner' || community.user_role === 'moderator';

  return (
    <div className="max-w-4xl mx-auto">
      {/* Banner */}
      <div className="relative w-full h-36 sm:h-48 overflow-hidden bg-gradient-to-r from-piu-dark via-piu-card to-piu-dark">
        {community.banner && (
          <img src={community.banner} alt="" className="w-full h-full object-cover opacity-80" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-piu-dark/90 via-transparent to-transparent" />
      </div>

      {/* Community Header */}
      <div className="px-4 sm:px-6 -mt-10 relative z-10">
        <div className="flex items-end gap-4">
          {/* Avatar */}
          {community.avatar ? (
            <img src={community.avatar.startsWith('data:') ? community.avatar : getAvatarUrl(community.avatar)} alt="" className="w-20 h-20 rounded-xl object-cover border-4 border-piu-dark shadow-lg" />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-piu-accent to-purple-700 border-4 border-piu-dark shadow-lg flex items-center justify-center">
              <span className="font-display font-bold text-2xl text-white">{community.display_name[0]?.toUpperCase()}</span>
            </div>
          )}
          <div className="flex-1 min-w-0 pb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display font-bold text-xl sm:text-2xl tracking-wide truncate">{community.display_name}</h1>
              {community.badge_text && (
                <CommunityBadge text={community.badge_text} bgColor={community.badge_color} textColor={community.badge_text_color} />
              )}
              {community.is_invite_only ? (
                <span className="text-[10px] font-display text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded-full">Invite Only</span>
              ) : null}
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
              <span>{community.member_count} member{community.member_count !== 1 ? 's' : ''}</span>
              <span className="text-gray-600">by</span>
              <Link to={`/profile/${community.owner_id}`} className="text-piu-accent hover:underline">
                {community.owner_username}
              </Link>
            </div>
          </div>
        </div>

        {/* Description */}
        {community.description && (
          <p className="text-sm text-gray-400 mt-3 leading-relaxed">{community.description}</p>
        )}

        {/* Action bar */}
        <div className="flex items-center gap-2 mt-4">
          {user && !isMember && !community.user_pending_request && (
            <button
              onClick={handleJoin}
              disabled={joining}
              className="px-5 py-2 bg-piu-accent rounded-lg font-display font-bold text-sm hover:bg-piu-accent/80 transition-colors disabled:opacity-50"
            >
              {joining ? 'Joining...' : (community.is_invite_only ? 'Request to Join' : 'Join')}
            </button>
          )}
          {community.user_pending_request && (
            <span className="px-5 py-2 bg-yellow-500/20 text-yellow-400 rounded-lg font-display font-bold text-sm">
              Request Pending
            </span>
          )}
          {isMember && community.user_role !== 'owner' && (
            <button
              onClick={handleLeave}
              className="px-5 py-2 bg-piu-dark border border-piu-border rounded-lg font-display font-bold text-sm text-gray-400 hover:text-red-400 hover:border-red-400/50 transition-colors"
            >
              Leave
            </button>
          )}
          {isModOrOwner && (
            <Link
              to={`/c/${community.name}/settings`}
              className="ml-auto p-2 text-gray-500 hover:text-white transition-colors"
              title="Community Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
          )}
        </div>

        {error && (
          <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 mt-5 border-b border-piu-border">
          <button
            onClick={() => setActiveTab('posts')}
            className={`px-4 py-2.5 font-display font-bold text-sm border-b-2 transition-colors ${
              activeTab === 'posts' ? 'border-piu-accent text-piu-accent' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            Posts
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`px-4 py-2.5 font-display font-bold text-sm border-b-2 transition-colors ${
              activeTab === 'members' ? 'border-piu-accent text-piu-accent' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            Members
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-4 sm:px-6 py-4">
        {activeTab === 'posts' && (
          <PostsTab
            community={community}
            posts={posts}
            loading={postsLoading}
            isMember={isMember}
            isModOrOwner={isModOrOwner}
            user={user}
            postSort={postSort}
            setPostSort={setPostSort}
            newPostContent={newPostContent}
            setNewPostContent={setNewPostContent}
            newPostImages={newPostImages}
            setNewPostImages={setNewPostImages}
            newPostYoutube={newPostYoutube}
            setNewPostYoutube={setNewPostYoutube}
            posting={posting}
            onCreatePost={handleCreatePost}
            onDeletePost={handleDeletePost}
            onPinPost={handlePinPost}
            onPumpPost={handlePumpPost}
            expandedComments={expandedComments}
            toggleComments={toggleComments}
            commentTexts={commentTexts}
            setCommentTexts={setCommentTexts}
            replyTo={replyTo}
            setReplyTo={setReplyTo}
            onAddComment={handleAddComment}
            onDeleteComment={handleDeleteComment}
          />
        )}
        {activeTab === 'members' && (
          <MembersTab
            members={members}
            loading={membersLoading}
            memberSort={memberSort}
            setMemberSort={setMemberSort}
            community={community}
          />
        )}
      </div>
    </div>
  );
}

// ─── Posts Tab ────────────────────────────────────────

function PostsTab({
  community, posts, loading, isMember, isModOrOwner, user,
  postSort, setPostSort,
  newPostContent, setNewPostContent, newPostImages, setNewPostImages,
  newPostYoutube, setNewPostYoutube, posting, onCreatePost,
  onDeletePost, onPinPost, onPumpPost,
  expandedComments, toggleComments, commentTexts, setCommentTexts,
  replyTo, setReplyTo, onAddComment, onDeleteComment,
}) {
  const [showYoutubeInput, setShowYoutubeInput] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [customEmojis, setCustomEmojis] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [editingIndex, setEditingIndex] = useState(null);
  const textRef = useRef(null);
  const fileRef = useRef(null);
  const emojiRef = useRef(null);

  // Load custom emojis for this community
  useEffect(() => {
    if (community?.id) {
      getCommunityEmojis(community.id).then(setCustomEmojis).catch(() => {});
    }
  }, [community?.id]);

  // Close emoji picker on outside click
  useEffect(() => {
    function handleClick(e) {
      if (emojiRef.current && !emojiRef.current.contains(e.target)) setShowEmojis(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const insertEmoji = (emoji) => {
    const textarea = textRef.current;
    if (!textarea) {
      setNewPostContent(c => c + emoji);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent = newPostContent.slice(0, start) + emoji + newPostContent.slice(end);
    setNewPostContent(newContent);
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
    const selected = newPostContent.slice(start, end);
    const newContent = newPostContent.slice(0, start) + prefix + selected + suffix + newPostContent.slice(end);
    setNewPostContent(newContent);
    setTimeout(() => {
      textarea.selectionStart = start + prefix.length;
      textarea.selectionEnd = end + prefix.length;
      textarea.focus();
    }, 0);
  };

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files).slice(0, 9 - newPostImages.length);
    const newImages = [...newPostImages, ...files].slice(0, 9);
    setNewPostImages(newImages);
    previews.forEach(p => URL.revokeObjectURL(p));
    setPreviews(newImages.map(f => URL.createObjectURL(f)));
  };

  const removeImage = (idx) => {
    URL.revokeObjectURL(previews[idx]);
    setNewPostImages(imgs => imgs.filter((_, i) => i !== idx));
    setPreviews(prevs => prevs.filter((_, i) => i !== idx));
  };

  // Clean up previews when post is created (images reset)
  useEffect(() => {
    if (newPostImages.length === 0 && previews.length > 0) {
      previews.forEach(p => URL.revokeObjectURL(p));
      setPreviews([]);
    }
  }, [newPostImages.length]);

  return (
    <div>
      {/* Sort toggle */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setPostSort('new')}
          className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
            postSort === 'new' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
          }`}
        >
          New Posts
        </button>
        <button
          onClick={() => setPostSort('activity')}
          className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
            postSort === 'activity' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
          }`}
        >
          Recent Activity
        </button>
      </div>

      {/* Post Composer — feature-matched with regular PostComposer */}
      {isMember && (
        <form onSubmit={onCreatePost} className="card mb-4">
          <div className="flex items-start gap-3 mb-3">
            {user?.avatar ? (
              <img src={user.avatar.startsWith('data:') ? user.avatar : getAvatarUrl(user.avatar)} alt="" className="w-9 h-9 rounded-full object-cover border border-piu-border shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-sm shrink-0">
                {user?.username?.[0]?.toUpperCase()}
              </div>
            )}
            <textarea
              ref={textRef}
              value={newPostContent}
              onChange={(e) => setNewPostContent(e.target.value)}
              className="input-field flex-1 resize-none min-h-[80px]"
              rows={3}
              placeholder="Share something with the community..."
              maxLength={5000}
            />
          </div>

          {/* YouTube URL input */}
          {showYoutubeInput && (
            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                className="input-field text-xs py-1.5 flex-1"
                placeholder="Paste YouTube URL (e.g. youtube.com/watch?v=...)"
                value={newPostYoutube}
                onChange={(e) => setNewPostYoutube(e.target.value)}
              />
              <button type="button" onClick={() => { setShowYoutubeInput(false); setNewPostYoutube(''); }} className="text-gray-500 hover:text-red-400 text-xs">&#10005;</button>
            </div>
          )}

          {/* Image previews */}
          {previews.length > 0 && (
            <div className={`grid gap-1.5 mb-3 ${previews.length === 1 ? 'grid-cols-1 max-w-[120px]' : previews.length <= 4 ? 'grid-cols-2 max-w-[200px]' : 'grid-cols-3 max-w-[280px]'}`}>
              {previews.map((src, i) => (
                <div key={i} className="relative group">
                  <img src={src} alt="" className="w-full aspect-square rounded-lg object-cover" />
                  <button
                    type="button"
                    onClick={() => setEditingIndex(i)}
                    className="absolute bottom-1 left-1 w-6 h-6 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center hover:bg-black/80 transition-colors"
                    title="Edit image"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center"
                  >x</button>
                </div>
              ))}
            </div>
          )}

          {/* Image Editor Modal */}
          {editingIndex !== null && newPostImages[editingIndex] && (
            <ImageEditor
              file={newPostImages[editingIndex]}
              onDone={(editedFile) => {
                const newImages = [...newPostImages];
                newImages[editingIndex] = editedFile;
                setNewPostImages(newImages);
                previews.forEach(p => URL.revokeObjectURL(p));
                setPreviews(newImages.map(f => URL.createObjectURL(f)));
                setEditingIndex(null);
              }}
              onCancel={() => setEditingIndex(null)}
            />
          )}

          {/* Toolbar */}
          <div className="flex items-center justify-between border-t border-piu-border/30 pt-2">
            <div className="flex items-center gap-1">
              {/* Bold */}
              <button type="button" onClick={() => applyFormat('**', '**')} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors text-xs font-bold" title="Bold">B</button>
              {/* Italic */}
              <button type="button" onClick={() => applyFormat('*', '*')} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors text-xs italic" title="Italic">I</button>
              {/* Strikethrough */}
              <button type="button" onClick={() => applyFormat('~~', '~~')} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors text-xs line-through" title="Strikethrough">S</button>

              <div className="w-px h-5 bg-piu-border/30 mx-1" />

              {/* Emoji picker */}
              <div className="relative" ref={emojiRef}>
                <button type="button" onClick={() => setShowEmojis(!showEmojis)} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors text-sm" title="Emoji">&#9786;</button>
                {showEmojis && (
                  <div className="absolute left-0 top-full mt-1 bg-piu-card border border-piu-border rounded-xl shadow-2xl z-50 p-3 w-72 max-h-80 overflow-y-auto">
                    {/* Custom community emojis */}
                    {customEmojis.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[10px] text-piu-accent font-display mb-1">{community.display_name}</p>
                        <div className="flex flex-wrap gap-1">
                          {customEmojis.map(e => (
                            <button key={e.id} type="button" onClick={() => { insertEmoji(`:${e.name}:`); }} className="w-7 h-7 flex items-center justify-center rounded hover:bg-piu-dark/50 transition-colors" title={e.name}>
                              <img src={e.image} alt={e.name} className="w-5 h-5 object-contain" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {EMOJI_GROUPS.map(group => (
                      <div key={group.label} className="mb-2">
                        <p className="text-[10px] text-gray-500 font-display mb-1">{group.label}</p>
                        <div className="flex flex-wrap gap-1">
                          {group.emojis.map(e => (
                            <button key={e} type="button" onClick={() => insertEmoji(e)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-piu-dark/50 transition-colors text-base">{e}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Image upload */}
              <button type="button" onClick={() => fileRef.current?.click()} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors text-sm" title="Attach images (max 9)" disabled={newPostImages.length >= 9}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />

              {/* YouTube link */}
              <button type="button" onClick={() => setShowYoutubeInput(!showYoutubeInput)} className={`p-1.5 rounded hover:bg-piu-dark/50 transition-colors text-sm ${showYoutubeInput || newPostYoutube ? 'text-red-400' : 'text-gray-400 hover:text-white'}`} title="Attach YouTube video">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zM9 16V8l8 4-8 4z"/>
                </svg>
              </button>
            </div>

            <button
              type="submit"
              disabled={posting || (!newPostContent.trim() && newPostImages.length === 0 && !newPostYoutube)}
              className="btn-primary px-4 py-1.5 text-xs disabled:opacity-50"
            >
              {posting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </form>
      )}

      {/* Not a member notice */}
      {!isMember && !community.is_invite_only && (
        <div className="text-center py-3 mb-4 text-xs text-gray-500 bg-piu-card/50 rounded-lg border border-piu-border/50">
          Join the community to post, comment, and interact.
        </div>
      )}
      {!isMember && community.is_invite_only && (
        <div className="text-center py-6 mb-4 text-sm text-gray-500 bg-piu-card/50 rounded-lg border border-piu-border/50">
          This community is invite-only. Request to join to see content.
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-piu-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="font-display text-sm">No posts yet</p>
          {isMember && <p className="text-xs mt-1">Be the first to post something!</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map(post => (
            <CommunityPostCard
              key={post.id}
              post={post}
              community={community}
              user={user}
              isMember={isMember}
              isModOrOwner={isModOrOwner}
              onDelete={onDeletePost}
              onPin={onPinPost}
              onPump={onPumpPost}
              comments={expandedComments[post.id]}
              onToggleComments={() => toggleComments(post.id)}
              commentTexts={commentTexts}
              setCommentTexts={setCommentTexts}
              replyTo={replyTo[post.id]}
              setReplyTo={(val) => setReplyTo(prev => ({ ...prev, [post.id]: val }))}
              onAddComment={onAddComment}
              onDeleteComment={onDeleteComment}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Badge List Component ────────────────────────────

function BadgeList({ badges }) {
  if (!badges || badges.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5">
      {badges.map(b => (
        <img key={b.id} src={b.image} alt={b.name} title={b.name} className="w-4 h-4 object-contain" />
      ))}
    </span>
  );
}

// ─── Community Post Card (feature-matched with PostCard) ─

function CommunityPostCard({
  post, community, user, isMember, isModOrOwner,
  onDelete, onPin, onPump,
  comments, onToggleComments,
  commentTexts, setCommentTexts,
  replyTo, setReplyTo, onAddComment, onDeleteComment,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [pumped, setPumped] = useState(!!post.user_pumped);
  const [pumpCount, setPumpCount] = useState(post.pump_count || 0);
  const [animating, setAnimating] = useState(false);
  const images = (() => { try { return JSON.parse(post.images || '[]'); } catch { return []; } })();
  const isAuthor = user?.id === post.user_id;
  const canDelete = isAuthor || isModOrOwner;

  const handlePump = async () => {
    if (!isMember) return;
    try {
      const result = await pumpCommunityPost(community.id, post.id);
      setPumped(result.pumped);
      setPumpCount(result.pump_count);
      if (result.pumped) {
        setAnimating(true);
        setTimeout(() => setAnimating(false), 600);
      }
    } catch (err) { console.error(err); }
  };

  return (
    <div className="card overflow-hidden">
      {/* Pinned indicator */}
      {post.is_pinned ? (
        <div className="px-4 py-1.5 -mx-4 -mt-4 mb-3 bg-piu-accent/10 border-b border-piu-accent/20 flex items-center gap-1.5 text-[10px] text-piu-accent font-display font-bold">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
            <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182a.5.5 0 0 1-.707-.708l3.182-3.182L2.4 8.044a.5.5 0 0 1 0-.707c.688-.688 1.673-.766 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.109-1.022.589-1.503a.5.5 0 0 1 .353-.146z"/>
          </svg>
          PINNED
        </div>
      ) : null}

      {/* Author header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <Link to={`/profile/${post.user_id}`}>
            {post.user_avatar ? (
              <img src={post.user_avatar.startsWith('data:') ? post.user_avatar : getAvatarUrl(post.user_avatar)} alt="" className="w-9 h-9 rounded-full object-cover border border-piu-border" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-sm">
                {post.username?.[0]?.toUpperCase()}
              </div>
            )}
          </Link>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Link to={`/profile/${post.user_id}`} className="font-display font-bold text-sm hover:text-piu-accent transition-colors">
                {post.username}
              </Link>
              <BadgeList badges={post.author_badges} />
              <CommunityTagList tags={post.author_tags} />
            </div>
            <p className="text-[10px] text-gray-500">{timeAgo(post.created_at)}</p>
          </div>
        </div>

        {/* Menu */}
        {canDelete && (
          <div className="relative">
            <button onClick={() => setMenuOpen(!menuOpen)} className="p-1 text-gray-600 hover:text-gray-300 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01" />
              </svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-piu-dark border border-piu-border rounded-lg shadow-xl z-20 py-1 min-w-[120px]">
                {isModOrOwner && (
                  <button
                    onClick={() => { onPin(post.id); setMenuOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs font-display hover:bg-piu-card/50 transition-colors"
                  >
                    {post.is_pinned ? 'Unpin' : 'Pin'}
                  </button>
                )}
                <button
                  onClick={() => { onDelete(post.id); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs font-display text-red-400 hover:bg-piu-card/50 transition-colors"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
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

      {/* Images with lightbox */}
      <ImageGrid images={images} onImageClick={setLightboxIndex} />

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox images={images} index={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}

      {/* Actions: Pump + Comments + Share */}
      <div className="border-t border-piu-border/20 pt-2 mt-1">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Pump button (stomp icon matching PostCard) */}
          <button
            onClick={handlePump}
            disabled={!isMember}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-display font-bold transition-all ${
              pumped
                ? 'text-piu-gold bg-piu-gold/10'
                : 'text-gray-400 hover:text-piu-gold hover:bg-piu-gold/5'
            } ${!isMember ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={!isMember ? 'Join to interact' : (pumped ? 'Un-pump' : 'Pump it up!')}
          >
            <img
              src={pumped ? '/piu/stomp-yellow.svg' : '/piu/stomp-gray.svg'}
              alt=""
              className={`w-4 h-4 ${animating ? 'animate-bounce' : ''}`}
            />
            <span>{pumpCount > 0 ? pumpCount : ''}</span>
          </button>

          {/* Comments button */}
          <button
            onClick={() => onToggleComments()}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-display font-bold text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span>{post.comment_count > 0 ? post.comment_count : ''}</span>
          </button>

          {/* Share button */}
          <ShareButton path={`/c/${community.name}`} />
        </div>
      </div>

      {/* Comments section */}
      {comments && (
        <div className="mt-3 pt-3 border-t border-piu-border/30 space-y-2">
          {comments.filter(c => !c.parent_id).map(comment => (
            <CommentItem
              key={comment.id}
              comment={comment}
              replies={comments.filter(c => c.parent_id === comment.id)}
              community={community}
              user={user}
              isMember={isMember}
              isModOrOwner={isModOrOwner}
              postId={post.id}
              commentTexts={commentTexts}
              setCommentTexts={setCommentTexts}
              replyTo={replyTo}
              setReplyTo={setReplyTo}
              onAddComment={onAddComment}
              onDelete={onDeleteComment}
            />
          ))}

          {/* Add comment */}
          {isMember && !replyTo && (
            <div className="flex items-center gap-2 mt-2">
              <input
                type="text"
                value={commentTexts[post.id] || ''}
                onChange={(e) => setCommentTexts(prev => ({ ...prev, [post.id]: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && onAddComment(post.id, null)}
                className="input-field text-xs py-1.5 flex-1"
                placeholder="Write a comment..."
              />
              <button
                onClick={() => onAddComment(post.id, null)}
                disabled={!commentTexts[post.id]?.trim()}
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

// ─── Comment Pump Button ─────────────────────────────

function CommunityCommentPump({ communityId, commentId, initialCount, initialPumped, isMember }) {
  const [pumped, setPumped] = useState(!!initialPumped);
  const [count, setCount] = useState(initialCount || 0);

  const toggle = async () => {
    if (!isMember) return;
    try {
      const res = await pumpCommunityComment(communityId, commentId);
      setPumped(res.pumped);
      setCount(res.pump_count);
    } catch {}
  };

  return (
    <button
      onClick={toggle}
      disabled={!isMember}
      className={`flex items-center gap-0.5 transition-colors ${
        pumped ? 'text-piu-gold' : 'text-gray-600 hover:text-piu-gold'
      } ${!isMember ? 'opacity-50 cursor-not-allowed' : ''}`}
      title={pumped ? 'Un-pump' : 'Pump'}
    >
      <img src={pumped ? '/piu/stomp-yellow.svg' : '/piu/stomp-gray.svg'} alt="" className="w-3 h-3" />
      {count > 0 && <span className="text-[9px] font-display font-bold">{count}</span>}
    </button>
  );
}

// ─── Comment Item ────────────────────────────────────

function CommentItem({ comment, replies, community, user, isMember, isModOrOwner, postId, commentTexts, setCommentTexts, replyTo, setReplyTo, onAddComment, onDelete }) {
  const isAuthor = user?.id === comment.user_id;
  const canDelete = isAuthor || isModOrOwner;

  return (
    <div>
      <div className="flex items-start gap-2">
        <Link to={`/profile/${comment.user_id}`}>
          {comment.user_avatar ? (
            <img src={comment.user_avatar.startsWith('data:') ? comment.user_avatar : getAvatarUrl(comment.user_avatar)} alt="" className="w-6 h-6 rounded-full object-cover border border-piu-border shrink-0" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-[8px] shrink-0">
              {comment.username?.[0]?.toUpperCase()}
            </div>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <div className="bg-piu-dark/50 rounded-lg px-2.5 py-1.5">
            <div className="flex items-center gap-1.5">
              <Link to={`/profile/${comment.user_id}`} className="font-display font-bold text-[11px] hover:text-piu-accent transition-colors leading-none">
                {comment.username}
              </Link>
              <BadgeList badges={comment.author_badges} />
              <CommunityTagList tags={comment.author_tags} />
            </div>
            <p className="text-xs text-gray-200 break-words mt-0.5">{comment.content}</p>
          </div>
          <div className="flex items-center gap-3 mt-0.5 px-1">
            <span className="text-[10px] text-gray-600">{timeAgo(comment.created_at)}</span>
            <CommunityCommentPump communityId={community.id} commentId={comment.id} initialCount={comment.pump_count || 0} initialPumped={comment.user_pumped} isMember={isMember} />
            {isMember && (
              <button onClick={() => setReplyTo(comment.id)} className="text-[10px] text-gray-500 hover:text-piu-accent">Reply</button>
            )}
            {canDelete && (
              <button onClick={() => onDelete(postId, comment.id)} className="text-[10px] text-gray-600 hover:text-red-400">Delete</button>
            )}
          </div>
        </div>
      </div>

      {/* Replies */}
      {replies.length > 0 && (
        <div className="ml-8 mt-1 space-y-1">
          {replies.map(reply => (
            <div key={reply.id} className="flex items-start gap-2">
              <Link to={`/profile/${reply.user_id}`}>
                {reply.user_avatar ? (
                  <img src={reply.user_avatar.startsWith('data:') ? reply.user_avatar : getAvatarUrl(reply.user_avatar)} alt="" className="w-5 h-5 rounded-full object-cover border border-piu-border shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-[7px] shrink-0">
                    {reply.username?.[0]?.toUpperCase()}
                  </div>
                )}
              </Link>
              <div className="flex-1 min-w-0">
                <div className="bg-piu-dark/30 rounded-lg px-2 py-1">
                  <div className="flex items-center gap-1.5">
                    <Link to={`/profile/${reply.user_id}`} className="font-display font-bold text-[10px] hover:text-piu-accent transition-colors leading-none">
                      {reply.username}
                    </Link>
                    <BadgeList badges={reply.author_badges} />
                    <CommunityTagList tags={reply.author_tags} />
                  </div>
                  <p className="text-[11px] text-gray-200 break-words mt-0.5">{reply.content}</p>
                </div>
                <div className="flex items-center gap-3 mt-0.5 px-1">
                  <span className="text-[9px] text-gray-600">{timeAgo(reply.created_at)}</span>
                  <CommunityCommentPump communityId={community.id} commentId={reply.id} initialCount={reply.pump_count || 0} initialPumped={reply.user_pumped} isMember={isMember} />
                  {(user?.id === reply.user_id || isModOrOwner) && (
                    <button onClick={() => onDelete(postId, reply.id)} className="text-[9px] text-gray-600 hover:text-red-400">Delete</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply input */}
      {replyTo === comment.id && isMember && (
        <div className="ml-8 mt-1.5 flex items-center gap-2">
          <input
            type="text"
            value={commentTexts[comment.id] || ''}
            onChange={(e) => setCommentTexts(prev => ({ ...prev, [comment.id]: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && onAddComment(postId, comment.id)}
            className="input-field text-[11px] py-1 flex-1"
            placeholder={`Reply to ${comment.username}...`}
            autoFocus
          />
          <button onClick={() => onAddComment(postId, comment.id)} className="text-[10px] text-piu-accent font-display font-bold">Send</button>
          <button onClick={() => setReplyTo(null)} className="text-[10px] text-gray-600 hover:text-gray-400">Cancel</button>
        </div>
      )}
    </div>
  );
}

// ─── Members Tab ─────────────────────────────────────

function MembersTab({ members, loading, memberSort, setMemberSort, community }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-gray-500 font-display">Sort by:</span>
        <button
          onClick={() => setMemberSort('joined')}
          className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
            memberSort === 'joined' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
          }`}
        >
          Joined
        </button>
        <button
          onClick={() => setMemberSort('pumbility')}
          className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
            memberSort === 'pumbility' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
          }`}
        >
          Pumbility
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-piu-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : members.length === 0 ? (
        <p className="text-center text-gray-500 py-8 font-display text-sm">No members yet</p>
      ) : (
        <div className="space-y-1">
          {members.map(member => (
            <Link
              key={member.id}
              to={`/profile/${member.id}`}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-piu-dark/50 transition-colors"
            >
              {member.avatar ? (
                <img src={member.avatar.startsWith('data:') ? member.avatar : getAvatarUrl(member.avatar)} alt="" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-sm">
                  {member.username[0]?.toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-display font-bold text-sm">{member.username}</span>
                  <BadgeList badges={member.badges} />
                  {member.nationality && <span className="text-sm">{getCountryFlag(member.nationality)}</span>}
                  {member.role === 'owner' && (
                    <span className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full bg-piu-gold/20 text-piu-gold">Owner</span>
                  )}
                  {member.role === 'moderator' && (
                    <span className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full bg-piu-blue/20 text-piu-blue">Mod</span>
                  )}
                  <CommunityTagList tags={member.tags} />
                </div>
                <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-0.5">
                  {member.skill_title && <span>{member.skill_title}</span>}
                  {member.pumbility > 0 && <span className="text-piu-accent font-mono">{member.pumbility}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// (Helpers: YouTubeEmbed, ImageGrid, Lightbox, ShareButton imported from PostCard)
