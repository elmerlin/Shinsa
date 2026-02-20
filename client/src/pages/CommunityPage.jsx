import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getCountryFlag } from '../components/PlayerRegistration';
import { renderFormattedText } from '../utils/formatText';
import { getProfilePath } from '../utils/profile';
import CommunityBadge from '../components/CommunityBadge';
import { CommunityTagList } from '../components/CommunityTag';
import {
  getCommunityByName, joinCommunity, leaveCommunity,
  getCommunityPosts, createCommunityPost, deleteCommunityPost, pinCommunityPost,
  pumpCommunityPost, getCommunityPostComments, addCommunityPostComment, deleteCommunityPostComment,
  getCommunityMembers, searchCommunityMentions,
} from '../utils/api';

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
    setPosts([]);
    setMembers([]);
    setExpandedComments({});
    setLoading(true);
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
    } catch (err) {
      console.error(err);
      setPosts([]);
    }
    finally { setPostsLoading(false); }
  }, [community, postSort]);

  const loadMembers = useCallback(async () => {
    if (!community) return;
    setMembersLoading(true);
    try {
      const data = await getCommunityMembers(community.id, memberSort);
      setMembers(data);
    } catch (err) {
      console.error(err);
      setMembers([]);
    }
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
              <Link to={getProfilePath(community.owner_id, community.owner_username)} className="text-piu-accent hover:underline">
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

      {/* Post Composer */}
      {isMember && (
        <form onSubmit={onCreatePost} className="bg-piu-card border border-piu-border rounded-xl p-4 mb-4">
          <textarea
            value={newPostContent}
            onChange={(e) => setNewPostContent(e.target.value)}
            className="w-full bg-transparent border-none text-white text-sm resize-none focus:outline-none placeholder-gray-600"
            rows={3}
            placeholder="Share something with the community..."
            maxLength={5000}
          />
          {/* Image previews */}
          {newPostImages.length > 0 && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {newPostImages.map((f, i) => (
                <div key={i} className="relative">
                  <img src={URL.createObjectURL(f)} alt="" className="w-16 h-16 object-cover rounded-lg" />
                  <button
                    type="button"
                    onClick={() => setNewPostImages(prev => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[8px] text-white"
                  >x</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between mt-3 border-t border-piu-border/30 pt-3">
            <div className="flex items-center gap-2">
              <label className="cursor-pointer p-1.5 text-gray-500 hover:text-piu-accent transition-colors" title="Add images">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => setNewPostImages(prev => [...prev, ...Array.from(e.target.files || [])].slice(0, 9))}
                />
              </label>
              <input
                type="text"
                value={newPostYoutube}
                onChange={(e) => setNewPostYoutube(e.target.value)}
                className="bg-transparent border-none text-xs text-gray-400 focus:outline-none placeholder-gray-600 w-40"
                placeholder="YouTube URL"
              />
            </div>
            <button
              type="submit"
              disabled={posting || (!newPostContent.trim() && newPostImages.length === 0 && !newPostYoutube)}
              className="px-4 py-1.5 bg-piu-accent rounded-lg text-xs font-display font-bold hover:bg-piu-accent/80 transition-colors disabled:opacity-40"
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

// ─── Community Post Card ─────────────────────────────

function CommunityPostCard({
  post, community, user, isMember, isModOrOwner,
  onDelete, onPin, onPump,
  comments, onToggleComments,
  commentTexts, setCommentTexts,
  replyTo, setReplyTo, onAddComment, onDeleteComment,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const images = (() => { try { return JSON.parse(post.images || '[]'); } catch { return []; } })();
  const isAuthor = user?.id === post.user_id;
  const canDelete = isAuthor || isModOrOwner;
  const youtubeId = post.youtube_url ? extractYoutubeId(post.youtube_url) : null;

  return (
    <div className="bg-piu-card border border-piu-border rounded-xl overflow-hidden">
      {/* Pinned indicator */}
      {post.is_pinned ? (
        <div className="px-4 py-1.5 bg-piu-accent/10 border-b border-piu-accent/20 flex items-center gap-1.5 text-[10px] text-piu-accent font-display font-bold">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
            <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182a.5.5 0 0 1-.707-.708l3.182-3.182L2.4 8.044a.5.5 0 0 1 0-.707c.688-.688 1.673-.766 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.109-1.022.589-1.503a.5.5 0 0 1 .353-.146z"/>
          </svg>
          PINNED
        </div>
      ) : null}

      <div className="p-4">
        {/* Author header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <Link to={getProfilePath(post.user_id, post.username)}>
              {post.user_avatar ? (
                <img src={post.user_avatar.startsWith('data:') ? post.user_avatar : getAvatarUrl(post.user_avatar)} alt="" className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-sm">
                  {post.username?.[0]?.toUpperCase()}
                </div>
              )}
            </Link>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Link to={getProfilePath(post.user_id, post.username)} className="font-display font-bold text-sm hover:text-piu-accent transition-colors">
                  {post.username}
                </Link>
                <CommunityTagList tags={post.author_tags} />
              </div>
              <span className="text-[10px] text-gray-500">{timeAgo(post.created_at)}</span>
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
          <div className="text-sm text-gray-300 mb-3 whitespace-pre-wrap break-words leading-relaxed">
            {renderFormattedText(post.content)}
          </div>
        )}

        {/* Images */}
        {images.length > 0 && (
          <div className={`grid gap-1.5 mb-3 ${images.length === 1 ? 'grid-cols-1' : images.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {images.map((img, i) => (
              <img key={i} src={img} alt="" className="w-full rounded-lg object-cover max-h-64" />
            ))}
          </div>
        )}

        {/* YouTube embed */}
        {youtubeId && (
          <div className="mb-3 aspect-video rounded-lg overflow-hidden">
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}`}
              title="YouTube"
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-4 pt-2 border-t border-piu-border/30">
          <button
            onClick={() => isMember ? onPump(post.id) : null}
            className={`flex items-center gap-1.5 text-xs font-display transition-colors ${
              post.user_pumped ? 'text-piu-accent' : 'text-gray-500 hover:text-piu-accent'
            } ${!isMember ? 'opacity-50 cursor-default' : ''}`}
            title={!isMember ? 'Join to interact' : ''}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill={post.user_pumped ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            {post.pump_count > 0 && <span>{post.pump_count}</span>}
          </button>

          <button
            onClick={() => onToggleComments()}
            className="flex items-center gap-1.5 text-xs font-display text-gray-500 hover:text-gray-300 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {post.comment_count > 0 && <span>{post.comment_count}</span>}
          </button>
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
                <MentionCommentInput
                  communityId={community.id}
                  value={commentTexts[post.id] || ''}
                  onChange={(value) => setCommentTexts(prev => ({ ...prev, [post.id]: value }))}
                  onSubmit={() => onAddComment(post.id, null)}
                  placeholder="Write a comment..."
                  inputClassName="w-full bg-piu-dark border border-piu-border rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-piu-accent"
                />
                <button
                  onClick={() => onAddComment(post.id, null)}
                  className="text-xs text-piu-accent font-display font-bold hover:text-piu-accent/80"
                >
                  Send
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Comment Item ────────────────────────────────────

function CommentItem({ comment, replies, community, user, isMember, isModOrOwner, postId, commentTexts, setCommentTexts, replyTo, setReplyTo, onAddComment, onDelete }) {
  const isAuthor = user?.id === comment.user_id;
  const canDelete = isAuthor || isModOrOwner;

  return (
    <div>
      <div className="flex items-start gap-2">
        <Link to={getProfilePath(comment.user_id, comment.username)}>
          {comment.user_avatar ? (
            <img src={comment.user_avatar.startsWith('data:') ? comment.user_avatar : getAvatarUrl(comment.user_avatar)} alt="" className="w-6 h-6 rounded-full object-cover mt-0.5" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-[8px] mt-0.5">
              {comment.username?.[0]?.toUpperCase()}
            </div>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <div className="bg-piu-dark/50 rounded-lg px-3 py-1.5">
            <div className="flex items-center gap-1.5">
              <Link to={getProfilePath(comment.user_id, comment.username)} className="font-display font-bold text-[11px] hover:text-piu-accent transition-colors">
                {comment.username}
              </Link>
              <CommunityTagList tags={comment.author_tags} />
            </div>
            <div className="text-xs text-gray-300 mt-0.5 break-words">{renderFormattedText(comment.content)}</div>
          </div>
          <div className="flex items-center gap-3 mt-0.5 ml-3">
            <span className="text-[9px] text-gray-600">{timeAgo(comment.created_at)}</span>
            {isMember && (
              <button
                onClick={() => setReplyTo(comment.id)}
                className="text-[9px] text-gray-500 hover:text-piu-accent font-display font-bold"
              >
                Reply
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => onDelete(postId, comment.id)}
                className="text-[9px] text-gray-600 hover:text-red-400"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Replies */}
      {replies.length > 0 && (
        <div className="ml-8 mt-1 space-y-1.5">
          {replies.map(reply => (
            <div key={reply.id} className="flex items-start gap-2">
              <Link to={getProfilePath(reply.user_id, reply.username)}>
                {reply.user_avatar ? (
                  <img src={reply.user_avatar.startsWith('data:') ? reply.user_avatar : getAvatarUrl(reply.user_avatar)} alt="" className="w-5 h-5 rounded-full object-cover mt-0.5" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-[7px] mt-0.5">
                    {reply.username?.[0]?.toUpperCase()}
                  </div>
                )}
              </Link>
              <div className="flex-1 min-w-0">
                <div className="bg-piu-dark/30 rounded-lg px-2.5 py-1">
                  <div className="flex items-center gap-1.5">
                    <Link to={getProfilePath(reply.user_id, reply.username)} className="font-display font-bold text-[10px] hover:text-piu-accent transition-colors">
                      {reply.username}
                    </Link>
                    <CommunityTagList tags={reply.author_tags} />
                  </div>
                  <div className="text-[11px] text-gray-300 mt-0.5 break-words">{renderFormattedText(reply.content)}</div>
                </div>
                <div className="flex items-center gap-3 mt-0.5 ml-2.5">
                  <span className="text-[9px] text-gray-600">{timeAgo(reply.created_at)}</span>
                  {isMember && (
                    <button
                      onClick={() => {
                        setReplyTo(comment.id);
                        setCommentTexts(prev => ({ ...prev, [comment.id]: `@${reply.username} ` }));
                      }}
                      className="text-[9px] text-gray-500 hover:text-piu-accent font-display font-bold"
                    >
                      Reply
                    </button>
                  )}
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
          <MentionCommentInput
            communityId={community.id}
            value={commentTexts[comment.id] || ''}
            onChange={(value) => setCommentTexts(prev => ({ ...prev, [comment.id]: value }))}
            onSubmit={() => onAddComment(postId, comment.id)}
            placeholder={`Reply to ${comment.username}...`}
            autoFocus
            inputClassName="w-full bg-piu-dark border border-piu-border rounded-lg px-3 py-1 text-[11px] text-white focus:outline-none focus:border-piu-accent"
          />
          <button onClick={() => onAddComment(postId, comment.id)} className="text-[10px] text-piu-accent font-display font-bold">Send</button>
          <button onClick={() => setReplyTo(null)} className="text-[10px] text-gray-600 hover:text-gray-400">Cancel</button>
        </div>
      )}
    </div>
  );
}

function MentionCommentInput({
  communityId,
  value,
  onChange,
  onSubmit,
  placeholder,
  autoFocus = false,
  disabled = false,
  inputClassName = '',
}) {
  const inputRef = useRef(null);
  const [mentionToken, setMentionToken] = useState(null);
  const [mentionUsers, setMentionUsers] = useState([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!communityId || disabled || !mentionToken?.query) {
      setMentionUsers([]);
      setMentionLoading(false);
      setShowMentions(false);
      return;
    }

    const requestId = ++requestRef.current;
    setMentionLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const found = await searchCommunityMentions(communityId, mentionToken.query);
        if (requestId !== requestRef.current) return;
        const filtered = (found || []).filter(u => u?.username).slice(0, 6);
        setMentionUsers(filtered);
        setShowMentions(filtered.length > 0);
      } catch {
        if (requestId === requestRef.current) {
          setMentionUsers([]);
          setShowMentions(false);
        }
      } finally {
        if (requestId === requestRef.current) setMentionLoading(false);
      }
    }, 150);

    return () => clearTimeout(timeout);
  }, [communityId, mentionToken?.query, disabled]);

  const updateMentionState = (nextValue, cursorOverride) => {
    const cursor = Number.isFinite(cursorOverride)
      ? cursorOverride
      : (inputRef.current?.selectionStart ?? String(nextValue || '').length);
    const token = getActiveMentionQuery(nextValue, cursor);
    setMentionToken(token);
    if (!token) {
      setMentionUsers([]);
      setMentionLoading(false);
      setShowMentions(false);
    }
  };

  const handleChange = (nextValue) => {
    onChange(nextValue);
    updateMentionState(nextValue);
  };

  const applyMention = (username) => {
    const current = String(value || '');
    const cursor = inputRef.current?.selectionStart ?? current.length;
    const token = getActiveMentionQuery(current, cursor) || mentionToken;
    if (!token) return;

    const next = `${current.slice(0, token.start)}@${username} ${current.slice(token.end)}`;
    const nextCursor = token.start + username.length + 2;
    onChange(next);
    setMentionToken(null);
    setMentionUsers([]);
    setMentionLoading(false);
    setShowMentions(false);

    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (showMentions && mentionUsers.length > 0) {
        e.preventDefault();
        applyMention(mentionUsers[0].username);
        return;
      }
      e.preventDefault();
      onSubmit?.();
      return;
    }
    if (e.key === 'Escape' && showMentions) {
      e.preventDefault();
      setShowMentions(false);
    }
  };

  const classes = inputClassName || 'w-full bg-piu-dark border border-piu-border rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-piu-accent';

  return (
    <div className="relative flex-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onClick={() => updateMentionState(value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        className={classes}
      />
      {(showMentions || mentionLoading) && (
        <div className="absolute left-0 right-0 top-full mt-1 z-40 rounded-lg border border-piu-border bg-piu-card shadow-xl max-h-48 overflow-y-auto">
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
                  <img src={u.avatar.startsWith('data:') ? u.avatar : getAvatarUrl(u.avatar)} alt="" className="w-5 h-5 rounded-full object-cover border border-piu-border" />
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
              to={getProfilePath(member.id, member.username)}
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

// ─── Helpers ─────────────────────────────────────────

function extractYoutubeId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}
