import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getFeed, getJacketMap, getChartKeyMap, pumpUpscore, getUpscoreComments, addUpscoreComment, deleteUpscoreComment, pumpNewClear, getNewClearComments, addNewClearComment, deleteNewClearComment, pumpComment, getUpscorePumpers, getNewClearPumpers, pumpWeeklyChallengePlay, getWeeklyChallengePlayComments, addWeeklyChallengePlayComment, deleteWeeklyChallengePlayComment, getWeeklyChallengePlayPumpers } from '../utils/api';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getCountryFlag } from '../components/PlayerRegistration';
import PostCard, { ShareButton } from '../components/PostCard';
import ActionIconButton from '../components/ActionIconButton';
import PumpersModal from '../components/PumpersModal';
import PiuChartJacket, { resolveChartJacketUrl } from '../components/PiuChartJacket';
import DojoCatStickerPicker from '../components/DojoCatStickerPicker';
import ScoreSnapshotModal from '../components/ScoreSnapshotModal';
import YouTubeReplayModal from '../components/YouTubeReplayModal';
import SendToDirectMessageButton from '../components/SendToDirectMessageButton';
import { renderFormattedText } from '../utils/formatText';
import { getProfilePath } from '../utils/profile';
import { parseGrade } from '../utils/grades';
import { buildReplayModalTitle } from '../utils/replayTitle';
import {
  buildClearChallengeOptions,
  buildClearLinkShare,
  buildScoreSnapshotLinkShare,
  buildUpscoreChallengeOptions,
  buildUpscoreLinkShare,
  buildWcPlayLinkShare,
  buildWcPlayChallengeOptions,
} from '../utils/directMessageShares';

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

function getOverTop100Rank(rawRank) {
  const rank = parseInt(rawRank, 10) || 0;
  return rank >= 1 && rank <= 100 ? rank : 0;
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

function appendStickerToken(value, token) {
  const current = String(value || '');
  const needsSpace = current.length > 0 && !/\s$/.test(current);
  return `${current}${needsSpace ? ' ' : ''}${token} `;
}

function parsePumbilityGain(value) {
  const numeric = parseInt(value, 10) || 0;
  return numeric > 0 ? numeric : 0;
}

function YouTubeBadgeIcon({ className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function getClearItems(item) {
  const fallback = [{
    entry_type: 'song_clear',
    song_title: item.song_title || '',
    mode: item.mode || 'Single',
    level: parseInt(item.level) || 0,
    score: parseInt(item.score) || 0,
    grade: item.grade || '',
    plate: item.plate || '',
    background_url: item.background_url || '',
    title_name: '',
    title_family: '',
    title_level: 0,
      title_plate: '',
      title_tier: '',
      pumbility_gain: parsePumbilityGain(item.pumbility_gain),
      singles_pumbility_gain: parsePumbilityGain(item.singles_pumbility_gain),
      over_top100_rank: parseInt(item.over_top100_rank, 10) || 0,
      replay_embed_url: item.replay_embed_url || '',
      replay_video_id: item.replay_video_id || '',
      replay_start_seconds: parseInt(item.replay_start_seconds, 10) || 0,
      replay_end_seconds: parseInt(item.replay_end_seconds, 10) || 0,
      play_id: item.play_id || '',
      user_id: item.user_id || '',
    }];

  try {
    const parsed = JSON.parse(item.clears_json || '[]');
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback;

    return parsed.map(c => ({
      entry_type: c.entry_type || 'song_clear',
      song_title: c.song_title || fallback[0].song_title,
      mode: c.mode || fallback[0].mode,
      level: parseInt(c.level) || fallback[0].level,
      score: parseInt(c.score) || 0,
      grade: c.grade || '',
      plate: c.plate || '',
      background_url: c.background_url || '',
      perfect: c.perfect || 0, great: c.great || 0, good: c.good || 0,
      bad: c.bad || 0, miss: c.miss || 0,
      title_name: c.title_name || '',
      title_family: c.title_family || '',
      title_level: parseInt(c.title_level) || 0,
      title_plate: c.title_plate || '',
      title_tier: c.title_tier || '',
      pumbility_gain: parsePumbilityGain(c.pumbility_gain),
      singles_pumbility_gain: parsePumbilityGain(c.singles_pumbility_gain),
      over_top100_rank: parseInt(c.over_top100_rank, 10) || 0,
      replay_embed_url: c.replay_embed_url || '',
      replay_video_id: c.replay_video_id || '',
      replay_start_seconds: parseInt(c.replay_start_seconds, 10) || 0,
      replay_end_seconds: parseInt(c.replay_end_seconds, 10) || 0,
      play_id: c.play_id || item.play_id || '',
      user_id: c.user_id || item.user_id || '',
    }));
  } catch {
    return fallback;
  }
}

function getGradeColor(grade, score = 0) {
  const normalized = parseGrade(grade).normalized;
  if (normalized) {
    if (normalized.includes('SSS')) return 'text-sky-300';
    if (normalized.includes('SS')) return 'text-piu-gold';
    if (normalized.includes('S')) return 'text-amber-400';
    if (normalized.includes('AAA')) return 'text-piu-silver';
    if (normalized.includes('AA')) return 'text-piu-bronze';
    if (normalized === 'A+' || normalized === 'A') return 'text-amber-700';
  }
  return getRank(score).color;
}

const PLATE_NAMES = { PG: 'PERFECT GAME', UG: 'ULTIMATE GAME', EG: 'EXTREME GAME', SG: 'SUPERB GAME', MG: 'MARVELOUS GAME', TG: 'TALENTED GAME', FG: 'FAIR GAME', RG: 'ROUGH GAME' };
const PLATE_COLORS = { PG: 'text-piu-gold', UG: 'text-yellow-400', EG: 'text-green-400', SG: 'text-blue-400', MG: 'text-sky-400', TG: 'text-purple-400', FG: 'text-gray-400', RG: 'text-red-400' };

function getTitlePlateStyles(clear) {
  const tier = String(clear?.title_tier || clear?.title_family || '').trim().toLowerCase();
  if (tier === 'bronze' || tier === 'intermediate') {
    return {
      chip: 'bg-amber-900/45 border-amber-300/60 text-amber-200',
      plate: 'from-amber-200 via-amber-300 to-amber-500 border-amber-100/85 text-amber-950',
    };
  }
  if (tier === 'silver' || tier === 'advanced') {
    return {
      chip: 'bg-slate-700/45 border-slate-200/60 text-slate-100',
      plate: 'from-slate-100 via-slate-200 to-slate-400 border-white/85 text-slate-900',
    };
  }
  if (tier === 'gold' || tier === 'expert') {
    return {
      chip: 'bg-yellow-900/45 border-yellow-300/65 text-yellow-200',
      plate: 'from-yellow-200 via-amber-300 to-yellow-500 border-yellow-100/90 text-amber-950',
    };
  }
  if (tier === 'master') {
    return {
      chip: 'bg-fuchsia-900/45 border-fuchsia-300/65 text-fuchsia-100',
      plate: 'from-fuchsia-200 via-violet-300 to-fuchsia-500 border-fuchsia-100/90 text-fuchsia-950',
    };
  }
  return {
    chip: 'bg-slate-800/45 border-slate-300/55 text-slate-100',
    plate: 'from-slate-200 via-slate-300 to-slate-500 border-slate-100/90 text-slate-950',
  };
}

function ScoreDetailModal({ score, jacketUrl, chartLink, onClose }) {
  return (
    <ScoreSnapshotModal
      score={score}
      jacketUrl={jacketUrl}
      chartLink={chartLink}
      directMessageLinkShare={score?._dmLinkShare || null}
      modalLabel="Score details"
      onClose={onClose}
      playId={score?.play_id}
    />
  );
}

function FeedCommentPumpButton({ commentId, type, initialCount, initialPumped }) {
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

function UpscorePumpButton({ upscoreId, initialCount, initialPumped }) {
  const { user } = useAuth();
  const [pumped, setPumped] = useState(!!initialPumped);
  const [count, setCount] = useState(initialCount || 0);
  const [loading, setLoading] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [showPumpers, setShowPumpers] = useState(false);

  const toggle = async () => {
    if (!user || loading) return;
    setLoading(true);
    try {
      const res = await pumpUpscore(upscoreId);
      setPumped(res.pumped);
      setCount(res.pump_count);
      if (res.pumped) {
        setAnimating(true);
        setTimeout(() => setAnimating(false), 600);
      }
    } catch {}
    setLoading(false);
  };

  return (
    <>
      <button
        onClick={toggle}
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
          title="See who pumped this upscore"
        >
          {count}
        </button>
      )}
      <PumpersModal
        open={showPumpers}
        onClose={() => setShowPumpers(false)}
        title={`Pumped by (${count})`}
        loadPumpers={() => getUpscorePumpers(upscoreId)}
        reloadKey={count}
      />
    </>
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
        title={open ? 'Hide comments' : 'Show comments'}
        ariaLabel={open ? 'Hide comments' : 'Show comments'}
        count={count}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 10.5h10M7 14h6m8 4-3.8-1.3a9.2 9.2 0 0 1-3.2.55C7.925 17.25 4 14.22 4 10.5S7.925 3.75 12.75 3.75 21.5 6.78 21.5 10.5c0 1.75-.87 3.34-2.3 4.52L21 18Z" />
        </svg>
      </ActionIconButton>
      {open && (
        <div className="w-full order-last mt-2 border-l-2 border-piu-border/30 pl-3 space-y-2">
          {comments.map(c => (
            <div key={c.id}>
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
                    <FeedCommentPumpButton commentId={c.id} type="upscore" initialCount={c.pump_count || 0} initialPumped={c.user_pumped} />
                    {user && <button onClick={() => { setReplyTo(c.id); setReplyText(''); }} className="text-[9px] text-gray-500 hover:text-piu-accent font-display">Reply</button>}
                    {user && user.id === c.user_id && <button onClick={() => handleDelete(c.id)} className="text-[9px] text-gray-600 hover:text-red-400 font-display">Delete</button>}
                  </div>
                </div>
              </div>
              {/* Replies */}
              {(c.replies || []).map(r => (
                <div key={r.id} className="flex items-start gap-2 ml-6 mt-1">
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
                      <FeedCommentPumpButton commentId={r.id} type="upscore" initialCount={r.pump_count || 0} initialPumped={r.user_pumped} />
                      {user && <button onClick={() => { setReplyTo(c.id); setReplyText(`@${r.username} `); }} className="text-[9px] text-gray-500 hover:text-piu-accent font-display">Reply</button>}
                      {user && user.id === r.user_id && <button onClick={() => handleDelete(r.id, c.id)} className="text-[9px] text-gray-600 hover:text-red-400 font-display">Delete</button>}
                    </div>
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
                  <DojoCatStickerPicker onSelect={insertReplySticker} compact align="right" />
                  <button onClick={() => submitReply(c.id)} className="text-[10px] text-piu-accent font-display font-bold px-2">Send</button>
                  <button onClick={() => { setReplyTo(null); setReplyText(''); }} className="text-[10px] text-gray-600 hover:text-gray-400 font-display px-1">&#10005;</button>
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
              <DojoCatStickerPicker onSelect={insertCommentSticker} compact align="right" />
              <button onClick={submit} className="text-[10px] text-piu-accent font-display font-bold px-2">Send</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function UpscoreCard({ item, jacketLookup, chartKeyMap, onScoreClick, onReplayClick }) {
  const [showAll, setShowAll] = useState(false);
  const upscores = (() => {
    try { return JSON.parse(item.upscores_json || '[]'); } catch { return []; }
  })();
  const upscoreLinkShare = buildUpscoreLinkShare({
    upscoreId: item.id,
    username: item.username,
    avatar: item.avatar ? getAvatarUrl(item.avatar) : '',
    upscores,
  });
  const upscoreChallengeOptions = buildUpscoreChallengeOptions({
    upscoreId: item.id,
    username: item.username,
    upscores,
  });
  const postPumbilityGain = parsePumbilityGain(item.pumbility_gain);
  const postSinglesPumbilityGain = parsePumbilityGain(item.singles_pumbility_gain);
  const hasMore = upscores.length > 5;
  const visibleUpscores = showAll ? upscores : upscores.slice(0, 5);
  const flag = getCountryFlag(item.nationality);

  if (upscores.length === 0) return null;

  return (
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
        {visibleUpscores.map((u, i) => {
          const oldRank = getRank(u.old_score);
          const newRank = getRank(u.new_score);
          const oldGrade = parseGrade(u.old_grade, oldRank.label);
          const newGrade = parseGrade(u.new_grade, newRank.label);
          const improvement = u.new_score - u.old_score;
          const songPumbilityGain = parsePumbilityGain(u.pumbility_gain);
          const songSinglesPumbilityGain = parsePumbilityGain(u.singles_pumbility_gain);
          const overRank = getOverTop100Rank(u.over_top100_rank);
          const jacketUrl = resolveChartJacketUrl({
            title: u.song_title,
            mode: u.mode,
            level: u.level,
            jacketLookup,
          });
          const norm = (u.song_title || '').toLowerCase().replace(/\s+/g, ' ').trim();
          const exactKey = `${norm}|${u.mode}|${u.level}`;
          const chartId = chartKeyMap?.[exactKey] || chartKeyMap?.[norm];
          const chartLink = chartId ? `/songs/chart/${chartId}` : `/songs?q=${encodeURIComponent(u.song_title || '')}`;

          return (
            <div key={i} className="flex items-center gap-3 py-1.5 border-b border-piu-border/20 last:border-0">
              <Link to={chartLink} className="group shrink-0">
                <PiuChartJacket
                  title={u.song_title}
                  mode={u.mode}
                  level={u.level}
                  jacketUrl={jacketUrl}
                  size="md"
                  imageClassName="group-hover:scale-[1.04]"
                />
              </Link>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-display font-bold truncate">{u.song_title}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  {overRank > 0 && (
                    <span className="text-[11px] leading-none px-1.5 py-0.5 rounded border border-piu-gold/50 bg-piu-gold/15 text-yellow-200 font-display font-black tracking-wide">
                      TOP #{overRank}
                    </span>
                  )}
                  {songPumbilityGain > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 font-display font-black">
                      +{songPumbilityGain.toLocaleString()} PB
                    </span>
                  )}
                  {songSinglesPumbilityGain > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-display font-black">
                      +{songSinglesPumbilityGain.toLocaleString()} SPB
                    </span>
                  )}
                  {u.weekly_challenge_rank && (
                    <Link to={`/weekly-challenges?week=${u.weekly_challenge_week_key || ''}`} className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/25 font-display font-black hover:bg-purple-500/25 transition-colors">
                      WC #{u.weekly_challenge_rank}
                    </Link>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {u.replay_embed_url && (
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sky-400/35 bg-sky-500/10 transition-colors hover:bg-sky-500/20"
                    title="Open session replay clip"
                    onClick={() => onReplayClick && onReplayClick(u.replay_embed_url, buildReplayModalTitle(u))}
                  >
                    <YouTubeBadgeIcon className="h-4 w-4 text-sky-300" />
                  </button>
                )}
                <button
                  type="button"
                  className="text-right shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
                  onClick={() => onScoreClick && onScoreClick({
                    ...u,
                    username: item.username,
                    user_id: u.user_id || item.user_id,
                    date_played: u.date_played || item.created_at,
                    _jacketUrl: jacketUrl,
                    _chartLink: chartLink,
                    _dmLinkShare: buildScoreSnapshotLinkShare({
                      kind: 'upscore',
                      sourceId: item.id,
                      username: item.username,
                      avatar: item.avatar ? getAvatarUrl(item.avatar) : '',
                      score: {
                        ...u,
                        username: item.username,
                        date_played: u.date_played || item.created_at,
                      },
                      path: `/upscore/${item.id}`,
                      chartPath: chartLink,
                      jacketUrl,
                    }),
                  })}
                >
                  <div className="flex items-center gap-1 justify-end">
                    <span className={`text-[10px] font-mono ${oldRank.color}`}>{u.old_score.toLocaleString()}</span>
                    <span
                      className={`text-[10px] font-display ${getGradeColor(oldGrade.display, u.old_score)} ${oldGrade.isBroken ? 'grade-broken' : ''}`}
                      data-grade={oldGrade.display}
                    >
                      {oldGrade.display}
                    </span>
                    <span className="text-gray-500 text-[10px]">&#8594;</span>
                    <span className={`text-xs font-mono font-bold ${newRank.color}`}>{u.new_score.toLocaleString()}</span>
                    <span
                      className={`text-xs font-display font-bold ${getGradeColor(newGrade.display, u.new_score)} ${newGrade.isBroken ? 'grade-broken' : ''}`}
                      data-grade={newGrade.display}
                    >
                      {newGrade.display}
                    </span>
                  </div>
                  <p className="text-[10px] text-piu-green font-mono">+{improvement.toLocaleString()}</p>
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {hasMore && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="mt-2 text-xs font-display font-bold text-piu-accent hover:text-piu-accent/80 transition-colors"
        >
          {showAll ? 'Show less' : `Show ${upscores.length - 5} more`}
        </button>
      )}

      {/* Actions: Pump + Comments + Share */}
      <div className="border-t border-piu-border/20 pt-2 mt-1">
        <div className="flex items-center gap-2 flex-wrap">
          <UpscorePumpButton upscoreId={item.id} initialCount={item.pump_count || 0} initialPumped={item.user_pumped} />
          <UpscoreCommentSection upscoreId={item.id} commentCount={item.comment_count || 0} />
          <ShareButton path={`/upscore/${item.id}`} />
          <SendToDirectMessageButton
            linkShare={upscoreLinkShare}
            variant="icon"
            title="Send upscore"
          />
          <SendToDirectMessageButton
            challengeOptions={upscoreChallengeOptions}
            variant="icon"
            tone="amber"
            title="Challenge a player"
            description="Choose the player to challenge on this chart."
          />
        </div>
      </div>
    </div>
  );
}

function NewClearPumpButton({ clearId, initialCount, initialPumped }) {
  const { user } = useAuth();
  const [pumped, setPumped] = useState(!!initialPumped);
  const [count, setCount] = useState(initialCount || 0);
  const [loading, setLoading] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [showPumpers, setShowPumpers] = useState(false);

  const toggle = async () => {
    if (!user || loading) return;
    setLoading(true);
    try {
      const res = await pumpNewClear(clearId);
      setPumped(res.pumped);
      setCount(res.pump_count);
      if (res.pumped) {
        setAnimating(true);
        setTimeout(() => setAnimating(false), 600);
      }
    } catch {}
    setLoading(false);
  };

  return (
    <>
      <button
        onClick={toggle}
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
          title="See who pumped this clear"
        >
          {count}
        </button>
      )}
      <PumpersModal
        open={showPumpers}
        onClose={() => setShowPumpers(false)}
        title={`Pumped by (${count})`}
        loadPumpers={() => getNewClearPumpers(clearId)}
        reloadKey={count}
      />
    </>
  );
}

function NewClearCommentSection({ clearId, commentCount: initialCount }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [count, setCount] = useState(initialCount || 0);

  const loadComments = async () => {
    const data = await getNewClearComments(clearId);
    setComments(data);
  };

  const toggleOpen = () => {
    if (!open) loadComments();
    setOpen(!open);
  };

  const submit = async () => {
    if (!newComment.trim()) return;
    const c = await addNewClearComment(clearId, newComment.trim());
    setComments(prev => [...prev, c]);
    setNewComment('');
    setCount(prev => prev + 1);
  };

  const submitReply = async (parentId) => {
    if (!replyText.trim()) return;
    const c = await addNewClearComment(clearId, replyText.trim(), parentId);
    setComments(prev => prev.map(cm =>
      cm.id === parentId ? { ...cm, replies: [...(cm.replies || []), c] } : cm
    ));
    setReplyTo(null);
    setReplyText('');
    setCount(prev => prev + 1);
  };

  const handleDelete = async (id, parentId) => {
    await deleteNewClearComment(id);
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
        title={open ? 'Hide comments' : 'Show comments'}
        ariaLabel={open ? 'Hide comments' : 'Show comments'}
        count={count}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 10.5h10M7 14h6m8 4-3.8-1.3a9.2 9.2 0 0 1-3.2.55C7.925 17.25 4 14.22 4 10.5S7.925 3.75 12.75 3.75 21.5 6.78 21.5 10.5c0 1.75-.87 3.34-2.3 4.52L21 18Z" />
        </svg>
      </ActionIconButton>
      {open && (
        <div className="w-full order-last mt-2 border-l-2 border-piu-border/30 pl-3 space-y-2">
          {comments.map(c => (
            <div key={c.id}>
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
                    <FeedCommentPumpButton commentId={c.id} type="clear" initialCount={c.pump_count || 0} initialPumped={c.user_pumped} />
                    {user && <button onClick={() => { setReplyTo(c.id); setReplyText(''); }} className="text-[9px] text-gray-500 hover:text-piu-accent font-display">Reply</button>}
                    {user && user.id === c.user_id && <button onClick={() => handleDelete(c.id)} className="text-[9px] text-gray-600 hover:text-red-400 font-display">Delete</button>}
                  </div>
                </div>
              </div>
              {(c.replies || []).map(r => (
                <div key={r.id} className="flex items-start gap-2 ml-6 mt-1">
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
                      <FeedCommentPumpButton commentId={r.id} type="clear" initialCount={r.pump_count || 0} initialPumped={r.user_pumped} />
                      {user && <button onClick={() => { setReplyTo(c.id); setReplyText(`@${r.username} `); }} className="text-[9px] text-gray-500 hover:text-piu-accent font-display">Reply</button>}
                      {user && user.id === r.user_id && <button onClick={() => handleDelete(r.id, c.id)} className="text-[9px] text-gray-600 hover:text-red-400 font-display">Delete</button>}
                    </div>
                  </div>
                </div>
              ))}
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
                  <DojoCatStickerPicker onSelect={insertReplySticker} compact align="right" />
                  <button onClick={() => submitReply(c.id)} className="text-[10px] text-piu-accent font-display font-bold px-2">Send</button>
                  <button onClick={() => { setReplyTo(null); setReplyText(''); }} className="text-[10px] text-gray-600 hover:text-gray-400 font-display px-1">&#10005;</button>
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
              <DojoCatStickerPicker onSelect={insertCommentSticker} compact align="right" />
              <button onClick={submit} className="text-[10px] text-piu-accent font-display font-bold px-2">Send</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function NewClearCard({ item, jacketLookup, chartKeyMap, onScoreClick, onReplayClick }) {
  const [showAll, setShowAll] = useState(false);
  const clears = getClearItems(item);
  const clearLinkShare = buildClearLinkShare({
    clearId: item.id,
    username: item.username,
    avatar: item.avatar ? getAvatarUrl(item.avatar) : '',
    clears,
  });
  const clearChallengeOptions = buildClearChallengeOptions({
    clearId: item.id,
    username: item.username,
    clears,
  });
  const postPumbilityGain = parsePumbilityGain(item.pumbility_gain);
  const postSinglesPumbilityGain = parsePumbilityGain(item.singles_pumbility_gain);
  const hasMore = clears.length > 5;
  const visibleClears = showAll ? clears : clears.slice(0, 5);
  const isGrouped = clears.length > 1;
  const isTitleUnlockPost = clears.length > 0 && clears.every((clear) => clear.entry_type === 'title_unlock');
  const flag = getCountryFlag(item.nationality);

  return (
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
            <span className="text-sky-400 font-display font-bold text-xs">
              {isTitleUnlockPost
                ? (isGrouped ? 'earned new titles!' : 'earned a new title!')
                : (isGrouped ? 'new clears!' : 'new clear!')}
            </span>
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
        {visibleClears.map((clear, i) => {
          const songPumbilityGain = parsePumbilityGain(clear.pumbility_gain);
          const songSinglesPumbilityGain = parsePumbilityGain(clear.singles_pumbility_gain);

          if (clear.entry_type === 'title_unlock') {
            const titleName = clear.title_name || clear.song_title || `Title Lv.${clear.title_level || clear.level || 1}`;
            const family = clear.title_family || '';
            const level = clear.title_level || clear.level || 1;
            const plateLabel = clear.title_plate || clear.plate || 'Title Plate';
            const plateStyles = getTitlePlateStyles(clear);
            const chipText = family ? `${family} Lv.${level}` : `Lv.${level}`;
            return (
              <div key={`title-unlock-${titleName}-${i}`} className="flex items-center gap-3 py-1.5 border-b border-piu-border/20 last:border-0">
                <div className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-display font-bold ${plateStyles.chip}`}>
                  Title
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-display font-bold truncate">{titleName}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-display font-bold ${plateStyles.chip}`}>
                      {chipText}
                    </span>
                  </div>
                </div>
                <div className={`shrink-0 rounded-lg border px-2.5 py-1 bg-gradient-to-b text-[10px] font-display font-black tracking-wide ${plateStyles.plate}`}>
                  {plateLabel}
                </div>
              </div>
            );
          }

          const rank = getRank(clear.score);
          const parsedGrade = parseGrade(clear.grade, rank.label);
          const overRank = getOverTop100Rank(clear.over_top100_rank);
          const jacketUrl = resolveChartJacketUrl({
            title: clear.song_title,
            mode: clear.mode,
            level: clear.level,
            jacketLookup,
          });
          const norm = (clear.song_title || '').toLowerCase().replace(/\s+/g, ' ').trim();
          const exactKey = `${norm}|${clear.mode}|${clear.level}`;
          const chartId = chartKeyMap?.[exactKey] || chartKeyMap?.[norm];
          const chartLink = chartId ? `/songs/chart/${chartId}` : `/songs?q=${encodeURIComponent(clear.song_title || '')}`;

          return (
            <div key={`${clear.song_title}-${clear.mode}-${clear.level}-${i}`} className="flex items-center gap-3 py-1.5 border-b border-piu-border/20 last:border-0">
              <Link to={chartLink} className="group shrink-0">
                <PiuChartJacket
                  title={clear.song_title}
                  mode={clear.mode}
                  level={clear.level}
                  jacketUrl={jacketUrl}
                  size="md"
                  imageClassName="group-hover:scale-[1.04]"
                />
              </Link>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-display font-bold truncate">{clear.song_title}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {overRank > 0 && (
                    <span className="text-[11px] leading-none px-1.5 py-0.5 rounded border border-piu-gold/50 bg-piu-gold/15 text-yellow-200 font-display font-black tracking-wide">
                      TOP #{overRank}
                    </span>
                  )}
                  {clear.plate && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-piu-dark text-gray-400 font-mono">{clear.plate}</span>
                  )}
                  {songPumbilityGain > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 font-display font-black">
                      +{songPumbilityGain.toLocaleString()} PB
                    </span>
                  )}
                  {songSinglesPumbilityGain > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-display font-black">
                      +{songSinglesPumbilityGain.toLocaleString()} SPB
                    </span>
                  )}
                  {clear.weekly_challenge_rank && (
                    <Link to={`/weekly-challenges?week=${clear.weekly_challenge_week_key || ''}`} className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/25 font-display font-black hover:bg-purple-500/25 transition-colors">
                      WC #{clear.weekly_challenge_rank}
                    </Link>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {clear.replay_embed_url && (
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sky-400/35 bg-sky-500/10 transition-colors hover:bg-sky-500/20"
                    title="Open session replay clip"
                    onClick={() => onReplayClick && onReplayClick(clear.replay_embed_url, buildReplayModalTitle(clear))}
                  >
                    <YouTubeBadgeIcon className="h-4 w-4 text-sky-300" />
                  </button>
                )}
                <button
                  type="button"
                  className="text-right shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
                  onClick={() => onScoreClick && onScoreClick({
                    ...clear,
                    username: item.username,
                    user_id: clear.user_id || item.user_id,
                    date_played: clear.date_played || item.created_at,
                    _jacketUrl: jacketUrl,
                    _chartLink: chartLink,
                    _dmLinkShare: buildScoreSnapshotLinkShare({
                      kind: 'clear',
                      sourceId: item.id,
                      username: item.username,
                      avatar: item.avatar ? getAvatarUrl(item.avatar) : '',
                      score: {
                        ...clear,
                        username: item.username,
                        date_played: clear.date_played || item.created_at,
                      },
                      path: `/clear/${item.id}`,
                      chartPath: chartLink,
                      jacketUrl,
                    }),
                  })}
                >
                  <span
                    className={`text-xs font-display font-bold ${getGradeColor(parsedGrade.display, clear.score)} ${parsedGrade.isBroken ? 'grade-broken' : ''}`}
                    data-grade={parsedGrade.display}
                  >
                    {parsedGrade.display}
                  </span>
                  <p className="font-mono text-xs font-bold">{clear.score.toLocaleString()}</p>
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {hasMore && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="mt-2 text-xs font-display font-bold text-piu-accent hover:text-piu-accent/80 transition-colors"
        >
          {showAll ? 'Show less' : `Show ${clears.length - 5} more`}
        </button>
      )}

      {/* Actions: Pump + Comments + Share */}
      <div className="border-t border-piu-border/20 pt-2 mt-1">
        <div className="flex items-center gap-2 flex-wrap">
          <NewClearPumpButton clearId={item.id} initialCount={item.pump_count || 0} initialPumped={item.user_pumped} />
          <NewClearCommentSection clearId={item.id} commentCount={item.comment_count || 0} />
          <ShareButton path={`/clear/${item.id}`} />
          <SendToDirectMessageButton
            linkShare={clearLinkShare}
            variant="icon"
            title={isGrouped ? 'Send new clears' : 'Send new clear'}
          />
          {!isTitleUnlockPost ? (
            <SendToDirectMessageButton
              challengeOptions={clearChallengeOptions}
              variant="icon"
              tone="amber"
              title="Challenge a player"
              description="Choose the player to challenge on this chart."
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function WcPlayPumpButton({ playPostId, initialCount, initialPumped }) {
  const { user } = useAuth();
  const [pumped, setPumped] = useState(!!initialPumped);
  const [count, setCount] = useState(initialCount || 0);
  const [loading, setLoading] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [showPumpers, setShowPumpers] = useState(false);

  const toggle = async () => {
    if (!user || loading) return;
    setLoading(true);
    try {
      const res = await pumpWeeklyChallengePlay(playPostId);
      setPumped(res.pumped);
      setCount(res.pump_count);
      if (res.pumped) {
        setAnimating(true);
        setTimeout(() => setAnimating(false), 600);
      }
    } catch {}
    setLoading(false);
  };

  return (
    <>
      <button
        onClick={toggle}
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
          title="See who pumped"
        >
          {count}
        </button>
      )}
      <PumpersModal
        open={showPumpers}
        onClose={() => setShowPumpers(false)}
        title={`Pumped by (${count})`}
        loadPumpers={() => getWeeklyChallengePlayPumpers(playPostId)}
        reloadKey={count}
      />
    </>
  );
}

function WcPlayCommentSection({ playPostId, commentCount: initialCount }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [count, setCount] = useState(initialCount || 0);

  const loadComments = async () => {
    const data = await getWeeklyChallengePlayComments(playPostId);
    setComments(data);
  };

  const toggleOpen = () => {
    if (!open) loadComments();
    setOpen(!open);
  };

  const submit = async () => {
    if (!newComment.trim()) return;
    const c = await addWeeklyChallengePlayComment(playPostId, newComment.trim());
    setComments(prev => [...prev, c]);
    setNewComment('');
    setCount(prev => prev + 1);
  };

  const submitReply = async (parentId) => {
    if (!replyText.trim()) return;
    const c = await addWeeklyChallengePlayComment(playPostId, replyText.trim(), parentId);
    setComments(prev => prev.map(cm =>
      cm.id === parentId ? { ...cm, replies: [...(cm.replies || []), c] } : cm
    ));
    setReplyTo(null);
    setReplyText('');
    setCount(prev => prev + 1);
  };

  const handleDelete = async (id, parentId) => {
    await deleteWeeklyChallengePlayComment(id);
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
        title={open ? 'Hide comments' : 'Show comments'}
        ariaLabel={open ? 'Hide comments' : 'Show comments'}
        count={count}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 10.5h10M7 14h6m8 4-3.8-1.3a9.2 9.2 0 0 1-3.2.55C7.925 17.25 4 14.22 4 10.5S7.925 3.75 12.75 3.75 21.5 6.78 21.5 10.5c0 1.75-.87 3.34-2.3 4.52L21 18Z" />
        </svg>
      </ActionIconButton>
      {open && (
        <div className="w-full order-last mt-2 border-l-2 border-piu-border/30 pl-3 space-y-2">
          {comments.map(c => (
            <div key={c.id}>
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
                    {user && <button onClick={() => { setReplyTo(c.id); setReplyText(''); }} className="text-[9px] text-gray-500 hover:text-piu-accent font-display">Reply</button>}
                    {user && user.id === c.user_id && <button onClick={() => handleDelete(c.id)} className="text-[9px] text-gray-600 hover:text-red-400 font-display">Delete</button>}
                  </div>
                </div>
              </div>
              {replyTo === c.id && user && (
                <div className="ml-8 mt-1 flex items-center gap-1">
                  <DojoCatStickerPicker onSelect={insertReplySticker} />
                  <input
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitReply(c.id)}
                    className="flex-1 bg-piu-dark/80 border border-piu-border/30 rounded px-2 py-1 text-[11px] text-white placeholder-gray-600"
                    placeholder="Reply..."
                  />
                  <button onClick={() => submitReply(c.id)} className="text-[10px] font-display font-bold text-piu-accent hover:text-piu-accent/80 px-2">Send</button>
                  <button onClick={() => setReplyTo(null)} className="text-[10px] text-gray-500 hover:text-gray-300">✕</button>
                </div>
              )}
            </div>
          ))}
          {user && (
            <div className="flex items-center gap-1 pt-1">
              <DojoCatStickerPicker onSelect={insertCommentSticker} />
              <input
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                className="flex-1 bg-piu-dark/80 border border-piu-border/30 rounded px-2 py-1 text-[11px] text-white placeholder-gray-600"
                placeholder="Add a comment..."
              />
              <button onClick={submit} className="text-[10px] font-display font-bold text-piu-accent hover:text-piu-accent/80 px-2">Post</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function WeeklyChallengePlayCard({ item, jacketLookup, chartKeyMap }) {
  const [showAll, setShowAll] = useState(false);
  const plays = (() => {
    try { return JSON.parse(item.plays_json || '[]'); } catch { return []; }
  })();
  const weekKey = item.week_key || '';
  const flag = getCountryFlag(item.nationality);
  const hasMore = plays.length > 5;
  const visiblePlays = showAll ? plays : plays.slice(0, 5);
  const wcLinkShare = buildWcPlayLinkShare({
    playPostId: item.id,
    username: item.username,
    avatar: item.avatar ? getAvatarUrl(item.avatar) : '',
    weekKey,
    plays,
  });
  const wcChallengeOptions = buildWcPlayChallengeOptions({
    playPostId: item.id,
    username: item.username,
    plays,
  });

  if (plays.length === 0) return null;

  return (
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
            <span className="text-purple-300 font-display font-bold text-xs">weekly challenge!</span>
            <Link to={`/weekly-challenges?week=${weekKey}`} className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/25 font-display font-bold hover:bg-purple-500/25 transition-colors">
              {weekKey}
            </Link>
          </div>
          <p className="text-[10px] text-gray-500">{timeAgo(item.created_at)}</p>
        </div>
      </div>

      <div className="space-y-2">
        {visiblePlays.map((play, i) => {
          const rank = getRank(play.score);
          const grade = parseGrade(play.grade, rank.label);
          const jacketUrl = resolveChartJacketUrl({
            title: play.song_title,
            mode: play.mode,
            level: play.level,
            jacketLookup,
          });
          const norm = (play.song_title || '').toLowerCase().replace(/\s+/g, ' ').trim();
          const exactKey = `${norm}|${play.mode}|${play.level}`;
          const chartId = chartKeyMap?.[exactKey] || chartKeyMap?.[norm];
          const chartLink = chartId ? `/songs/chart/${chartId}` : `/songs?q=${encodeURIComponent(play.song_title || '')}`;

          return (
            <div key={i} className="flex items-center gap-3 py-1.5 border-b border-piu-border/20 last:border-0">
              <Link to={chartLink} className="group shrink-0">
                <PiuChartJacket
                  title={play.song_title}
                  mode={play.mode}
                  level={play.level}
                  jacketUrl={jacketUrl}
                  size="md"
                  imageClassName="group-hover:scale-[1.04]"
                />
              </Link>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-display font-bold truncate">{play.song_title}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  {play.weekly_challenge_rank && (
                    <Link to={`/weekly-challenges?week=${play.weekly_challenge_week_key || weekKey}`} className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/25 font-display font-black hover:bg-purple-500/25 transition-colors">
                      WC #{play.weekly_challenge_rank}
                    </Link>
                  )}
                  {play.rating_points > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-display font-black">
                      {play.rating_points} pts
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <span
                  className={`text-xs font-display font-bold ${getGradeColor(grade.display, play.score)} ${grade.isBroken ? 'grade-broken' : ''}`}
                  data-grade={grade.display}
                >
                  {grade.display}
                </span>
                <p className="text-xs font-mono font-bold text-gray-300">{(parseInt(play.score, 10) || 0).toLocaleString()}</p>
              </div>
            </div>
          );
        })}
      </div>
      {hasMore && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="mt-2 text-xs font-display font-bold text-piu-accent hover:text-piu-accent/80 transition-colors"
        >
          {showAll ? 'Show less' : `Show ${plays.length - 5} more`}
        </button>
      )}

      {/* Actions: Pump + Comments + Share */}
      <div className="border-t border-piu-border/20 pt-2 mt-1">
        <div className="flex items-center gap-2 flex-wrap">
          <WcPlayPumpButton playPostId={item.id} initialCount={item.pump_count || 0} initialPumped={item.user_pumped} />
          <WcPlayCommentSection playPostId={item.id} commentCount={item.comment_count || 0} />
          <ShareButton path={`/weekly-play/${item.id}`} />
          <SendToDirectMessageButton
            linkShare={wcLinkShare}
            variant="icon"
            title="Send weekly challenge"
          />
          {wcChallengeOptions.length > 0 && (
            <SendToDirectMessageButton
              challengeOptions={wcChallengeOptions}
              variant="icon"
              tone="amber"
              title="Challenge a player"
              description="Choose the chart to challenge on."
            />
          )}
        </div>
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
  const [chartKeyMap, setChartKeyMap] = useState({});
  const [selectedScore, setSelectedScore] = useState(null);
  const [selectedReplay, setSelectedReplay] = useState(null);

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
    // Load chart key → chart_id mapping for direct chart links
    getChartKeyMap().then(map => setChartKeyMap(map)).catch(() => {});
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
        <Link
          to="/posts"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-piu-accent/30 bg-piu-accent/10 text-xs font-display font-bold text-piu-accent hover:bg-piu-accent hover:text-white transition-colors"
        >
          My Posts
        </Link>
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
              return <UpscoreCard key={`upscore-${item.id}`} item={item} jacketLookup={jacketLookup} chartKeyMap={chartKeyMap} onScoreClick={setSelectedScore} onReplayClick={(url, title) => setSelectedReplay({ url, title })} />;
            } else if (item.type === 'clear') {
              return <NewClearCard key={`clear-${item.id}`} item={item} jacketLookup={jacketLookup} chartKeyMap={chartKeyMap} onScoreClick={setSelectedScore} onReplayClick={(url, title) => setSelectedReplay({ url, title })} />;
            } else if (item.type === 'weekly_challenge') {
              return <WeeklyChallengePlayCard key={`wc-${item.id}`} item={item} jacketLookup={jacketLookup} chartKeyMap={chartKeyMap} />;
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

      <ScoreDetailModal
        score={selectedScore}
        jacketUrl={selectedScore?._jacketUrl || ''}
        chartLink={selectedScore?._chartLink || ''}
        onClose={() => setSelectedScore(null)}
      />
      {selectedReplay && (
        <YouTubeReplayModal
          url={selectedReplay.url}
          title={selectedReplay.title}
          onClose={() => setSelectedReplay(null)}
        />
      )}
    </div>
  );
}
