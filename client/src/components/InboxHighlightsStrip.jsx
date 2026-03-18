import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAvatarUrl } from './AvatarPicker';
import DojoCatStickerPicker from './DojoCatStickerPicker';
import ScoreSnapshotCard from './ScoreSnapshotCard';
import SessionSummaryCard from './SessionSummaryCard';
import SessionShareCard from './SessionShareCard';
import LiveSessionCard from './LiveSessionCard';
import SessionPlanCard from './SessionPlanCard';
import StickerAsset from './StickerAsset';
import { HourOfPowerLogo } from './HourOfPowerBrand';
import { useAuth } from '../contexts/AuthContext';
import { renderFormattedText } from '../utils/formatText';
import { getStickerEmoji } from '../utils/stickers';
import { splitSessionSummaryContent } from '../utils/sessionSummaryMarker';
import { splitSessionShareContent } from '../utils/sessionShareMarker';
import { mergeLiveSessionSummary, splitLiveSessionContent } from '../utils/liveSessionMarker';
import { splitSessionPlanContent } from '../utils/sessionPlanMarker';

function formatRelativeTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  const diffMinutes = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 60000));
  if (diffMinutes < 1) return 'now';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return `${Math.floor(diffHours / 24)}d`;
}

function renderLinkButton(link, className = '') {
  if (!link?.path && !link?.url) return null;
  const label = link?.label || 'Open';
  if (link.path) {
    return (
      <Link to={link.path} className={className}>
        {label}
      </Link>
    );
  }
  return (
    <a href={link.url} target="_blank" rel="noreferrer" className={className}>
      {label}
    </a>
  );
}

function StickerRow({ tokens = [] }) {
  const stickers = tokens.map((token) => getStickerEmoji(token)).filter(Boolean);
  if (stickers.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {stickers.map((sticker, index) => (
        <span
          key={`${sticker.id}-${index}`}
          className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-black/30 p-1.5 shadow-[0_10px_24px_rgba(0,0,0,0.28)]"
        >
          <StickerAsset sticker={sticker} alt={sticker.label} title={sticker.label} className="h-full w-full object-contain" />
        </span>
      ))}
    </div>
  );
}

function HighlightAvatar({
  user,
  hasStory = false,
  onClick = null,
  isSelf = false,
  showAddBadge = false,
  onAddBadge = null,
}) {
  const frameClass = hasStory
    ? 'bg-[conic-gradient(from_180deg_at_50%_50%,rgba(34,211,238,0.95),rgba(250,204,21,0.9),rgba(16,185,129,0.9),rgba(34,211,238,0.95))]'
    : 'bg-white/10';
  const fallback = (user?.username || 'U').slice(0, 1).toUpperCase();

  return (
    <div className="group flex flex-col items-center gap-1.5 text-center">
      <div className="relative">
        <button
          type="button"
          onClick={onClick}
          className="relative"
          aria-label={isSelf ? 'Open your story tools' : `Open ${user?.username || 'story'} story`}
        >
          <span className={`relative flex h-[3.85rem] w-[3.85rem] items-center justify-center rounded-full p-[3px] shadow-[0_12px_30px_rgba(0,0,0,0.25)] transition-transform group-hover:scale-[1.02] ${frameClass}`}>
            <span className="absolute inset-[3px] rounded-full border border-white/10" />
            <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[#070b13]">
              {user?.avatar ? (
                <img src={user.avatar} alt={user?.username || ''} className="h-full w-full object-cover" />
              ) : (
                <span className="font-display text-xl font-black text-white">{fallback}</span>
              )}
            </span>
          </span>
        </button>
        {showAddBadge ? (
          <button
            type="button"
            onClick={onAddBadge}
            className="absolute -bottom-0.5 -right-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full border-[3px] border-[#070b13] bg-cyan-500 text-sm font-display font-black text-white shadow-[0_10px_20px_rgba(6,182,212,0.35)]"
            aria-label="Add to story"
          >
            +
          </button>
        ) : null}
      </div>
      <span className="max-w-[4.8rem] truncate text-[11px] font-display font-bold text-gray-200">
        {isSelf ? 'Your Status' : (user?.username || 'Player')}
      </span>
    </div>
  );
}

function HighlightNoteBubble({ note, isSelf = false, onClick = null }) {
  const content = String(note?.content || '').trim();
  if (!content && !isSelf) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute left-1/2 top-0 z-10 flex min-h-[2.45rem] w-max max-w-[5.75rem] -translate-x-1/2 items-center rounded-[1.15rem] px-2.5 py-1.5 text-left shadow-[0_12px_28px_rgba(0,0,0,0.28)] transition-colors ${
        content
          ? 'bg-[#343945] text-white hover:bg-[#3b4150]'
          : 'border border-dashed border-white/12 bg-[#262b35] text-gray-300 hover:bg-[#2c313c]'
      }`}
      aria-label={isSelf ? 'Set your note' : 'Open note thread'}
    >
      <span className="line-clamp-2 text-[10px] font-medium leading-4">
        {content || 'Share a note'}
      </span>
      <span className={`absolute -bottom-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 rounded-[0.2rem] ${content ? 'bg-[#343945]' : 'border-r border-b border-dashed border-white/12 bg-[#262b35]'}`} />
    </button>
  );
}

function HighlightCircle({
  circle,
  onOpenStory,
  onOpenNote,
  onOpenStoryComposer,
}) {
  const note = circle?.note || null;
  const avatarAction = () => {
    if (circle?.has_story) {
      onOpenStory?.(circle);
      return;
    }
    if (circle?.is_self) {
      onOpenStoryComposer?.();
    }
  };

  return (
    <div className="flex w-[4.55rem] shrink-0 flex-col items-center pt-2">
      <div className="relative pt-[2.15rem]">
        <HighlightNoteBubble
          note={note}
          isSelf={circle?.is_self}
          onClick={() => onOpenNote?.(circle)}
        />
        <HighlightAvatar
          user={circle?.user}
          hasStory={circle?.has_story}
          isSelf={circle?.is_self}
          onClick={avatarAction}
          showAddBadge={!!circle?.is_self}
          onAddBadge={onOpenStoryComposer}
        />
      </div>
    </div>
  );
}

function StoryCard({ story }) {
  if (!story) return null;

  const rawStoryContent = String(story.post?.content || story.caption || '').trim();
  const summarySplit = splitSessionSummaryContent(rawStoryContent);
  const shareSplit = splitSessionShareContent(summarySplit.text || '');
  const liveSplit = splitLiveSessionContent(shareSplit.text || '');
  const planSplit = splitSessionPlanContent(liveSplit.text || '');
  const summary = summarySplit.summary || null;
  const share = shareSplit.share || null;
  const live = mergeLiveSessionSummary(liveSplit.live, story.post?.live_summary_metrics || null);
  const plan = planSplit.plan || null;
  const visibleCaption = String(planSplit.text || '').trim();
  const hasEmbeddedCard = !!(summary || share || live || plan);

  if (story.snapshot) {
    return (
      <div className="w-full max-w-sm">
        <ScoreSnapshotCard
          score={story.snapshot}
          jacketUrl={story.snapshot.jacketUrl || story.snapshot.jacket_url || ''}
          chartLink={story.link?.path || ''}
          className="mx-auto"
        />
        {story.caption ? (
          <div className="mt-4 rounded-[1.4rem] border border-white/10 bg-black/35 px-4 py-3 text-sm leading-6 text-gray-100 shadow-[0_14px_32px_rgba(0,0,0,0.24)]">
            {renderFormattedText(story.caption)}
          </div>
        ) : null}
        <StickerRow tokens={story.sticker_tokens} />
      </div>
    );
  }

  if (story.type === 'post') {
    return (
      <div className="w-full max-w-sm overflow-hidden rounded-[1.8rem] border border-white/10 bg-black/35 shadow-[0_18px_42px_rgba(0,0,0,0.28)]">
        {story.media_url ? (
          <img src={story.media_url} alt="" className="h-[24rem] w-full object-cover" />
        ) : hasEmbeddedCard ? (
          <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_45%),linear-gradient(160deg,#0a101b,#13192a)] px-5 py-5 text-white">
            <p className="text-[11px] font-display font-bold uppercase tracking-[0.18em] text-cyan-200/80">{story.title || 'Post'}</p>
            <p className="mt-2 font-display text-xl font-black leading-tight">Shared from the feed</p>
          </div>
        ) : (
          <div className="flex h-[20rem] items-center justify-center bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_45%),linear-gradient(160deg,#0a101b,#13192a)] px-8 text-center text-white">
            <p className="font-display text-3xl font-black">New post</p>
          </div>
        )}
        <div className="space-y-3 px-4 py-4">
          <div>
            <p className="text-[11px] font-display font-bold uppercase tracking-[0.18em] text-cyan-200/80">{story.title || 'Post'}</p>
            {summary ? <SessionSummaryCard summary={summary} title="Session Summary" className="mt-3" compact /> : null}
            {share ? <SessionShareCard share={share} title={share?.shareType === 'hour_of_power' ? 'Hour of Power Recap' : 'Session Share'} className="mt-3" compact /> : null}
            {live ? <LiveSessionCard summary={live} title="Shinsa Live Recap" className="mt-3" compact /> : null}
            {plan ? <SessionPlanCard plan={plan} className="mt-3" defaultScoringExpanded={false} defaultPassingExpanded={false} /> : null}
            {visibleCaption ? <div className="mt-2 text-sm leading-6 text-gray-100">{renderFormattedText(visibleCaption)}</div> : null}
          </div>
          {story.post?.youtube_url ? (
            <p className="text-xs text-cyan-100/80">Includes a linked video.</p>
          ) : null}
          {renderLinkButton(story.link, 'inline-flex rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-xs font-display font-bold text-white hover:bg-white/12')}
        </div>
        <div className="px-4 pb-4">
          <StickerRow tokens={story.sticker_tokens} />
        </div>
      </div>
    );
  }

  if (story.type === 'image') {
    return (
      <div className="w-full max-w-sm overflow-hidden rounded-[1.8rem] border border-white/10 bg-black/35 shadow-[0_18px_42px_rgba(0,0,0,0.28)]">
        {story.media_url ? <img src={story.media_url} alt="" className="max-h-[30rem] w-full object-cover" /> : null}
        <div className="space-y-3 px-4 py-4">
          {story.caption ? <div className="text-sm leading-6 text-gray-100">{renderFormattedText(story.caption)}</div> : null}
          {story.link ? renderLinkButton(story.link, 'inline-flex rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-xs font-display font-bold text-white hover:bg-white/12') : null}
          <StickerRow tokens={story.sticker_tokens} />
        </div>
      </div>
    );
  }

  if (story.type === 'live_session' || story.type === 'hour_of_power') {
    const isHop = story.type === 'hour_of_power';
    return (
      <div className="w-full max-w-sm overflow-hidden rounded-[1.8rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_42%),linear-gradient(160deg,#0a101b,#151d2f)] px-5 py-5 text-white shadow-[0_18px_42px_rgba(0,0,0,0.28)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-display font-bold uppercase tracking-[0.22em] text-cyan-200/80">
              {isHop ? 'Hour of Power' : 'Live'}
            </p>
            <h3 className="mt-2 font-display text-[2rem] font-black leading-[1.02]">
              {story.title || (isHop ? 'Hour of Power' : 'Live session')}
            </h3>
            {story.subtitle ? <p className="mt-3 text-sm leading-6 text-gray-200">{story.subtitle}</p> : null}
            {story.caption ? <div className="mt-3 text-sm leading-6 text-gray-100">{renderFormattedText(story.caption)}</div> : null}
            <div className="mt-5 flex flex-wrap gap-2">
              {renderLinkButton(story.link, 'inline-flex rounded-full border border-cyan-300/30 bg-cyan-500/15 px-4 py-2 text-xs font-display font-bold text-cyan-50 hover:bg-cyan-500/22')}
            </div>
          </div>
          {isHop ? (
            <HourOfPowerLogo className="mt-1 h-24 w-20 shrink-0 rounded-[1.4rem] border-yellow-200/35 bg-[linear-gradient(180deg,rgba(255,224,125,0.16),rgba(16,22,47,0.92))]" imageClassName="p-2" />
          ) : (
            <div className="mt-2 flex h-24 w-20 shrink-0 items-center justify-center rounded-[1.4rem] border border-rose-300/20 bg-[radial-gradient(circle_at_center,rgba(251,113,133,0.22),transparent_58%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))]">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-rose-300/35 bg-rose-500/16">
                <span className="inline-flex h-4 w-4 rounded-full bg-red-400 shadow-[0_0_18px_rgba(248,113,113,0.65)]" />
              </span>
            </div>
          )}
        </div>
        <StickerRow tokens={story.sticker_tokens} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm rounded-[1.8rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.2),transparent_45%),linear-gradient(160deg,#0a101b,#151d2f)] px-5 py-6 text-white shadow-[0_18px_42px_rgba(0,0,0,0.28)]">
      <p className="text-[11px] font-display font-bold uppercase tracking-[0.18em] text-cyan-200/80">
        {story.type === 'hour_of_power' ? 'Hour of Power' : story.type === 'live_session' ? 'Live' : (story.title || 'Story')}
      </p>
      <h3 className="mt-2 font-display text-2xl font-black leading-tight">{story.title || 'Story'}</h3>
      {story.subtitle ? <p className="mt-2 text-sm leading-6 text-gray-200">{story.subtitle}</p> : null}
      {story.caption ? <div className="mt-4 text-sm leading-6 text-gray-100">{renderFormattedText(story.caption)}</div> : null}
      <div className="mt-5 flex flex-wrap gap-2">
        {renderLinkButton(story.link, 'inline-flex rounded-full border border-cyan-300/30 bg-cyan-500/15 px-3 py-1.5 text-xs font-display font-bold text-cyan-50 hover:bg-cyan-500/22')}
      </div>
      <StickerRow tokens={story.sticker_tokens} />
    </div>
  );
}

function OverlayShell({ open, onClose, children, padded = true }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[160] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center">
      <button type="button" aria-label="Close overlay" className="absolute inset-0" onClick={onClose} />
      <div className={`relative z-10 w-full rounded-t-[1.9rem] border border-white/10 bg-[#060a12] shadow-[0_24px_70px_rgba(0,0,0,0.45)] sm:max-w-2xl sm:rounded-[2rem] ${padded ? 'p-4 sm:p-6' : ''}`}>
        {children}
      </div>
    </div>
  );
}

export function StoryViewerModal({ open, user, stories = [], loading = false, error = '', onClose }) {
  const [index, setIndex] = useState(0);
  const story = stories[index] || null;

  useEffect(() => {
    if (!open) return;
    setIndex(0);
  }, [open, user?.id]);

  const canGoBack = index > 0;
  const canGoForward = index < stories.length - 1;

  return (
    <OverlayShell open={open} onClose={onClose} padded={false}>
      <div className="relative min-h-[75vh] overflow-hidden rounded-t-[1.9rem] sm:rounded-[2rem]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.14),transparent_38%),linear-gradient(180deg,#070b13,#0d1320_42%,#080b12)]" />
        <div className="relative z-30 flex items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-5">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex gap-1.5">
              {(stories.length > 0 ? stories : [null]).map((entry, entryIndex) => (
                <span key={entry?.id || `empty-${entryIndex}`} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <span className={`block h-full rounded-full ${entryIndex <= index ? 'bg-cyan-300' : 'bg-transparent'}`} />
                </span>
              ))}
            </div>
            <div className="flex items-center gap-3">
              {user?.avatar ? <img src={user.avatar} alt="" className="h-10 w-10 rounded-full object-cover" /> : null}
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-black text-white">{user?.username || 'Story'}</p>
                <p className="text-xs text-gray-400">{formatRelativeTime(story?.created_at)}</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="relative z-30 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/8 text-lg text-white hover:bg-white/12"
          >
            x
          </button>
        </div>

        <div className="relative z-10 flex min-h-[calc(75vh-5rem)] items-center justify-center px-4 pb-10 pt-2 sm:px-6">
          {loading ? (
            <p className="text-sm text-gray-400">Loading story...</p>
          ) : error ? (
            <div className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">Story unavailable right now.</div>
          ) : story ? (
            <StoryCard story={story} />
          ) : (
            <p className="text-sm text-gray-400">No story yet.</p>
          )}
        </div>

        {stories.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => canGoBack && setIndex((current) => Math.max(0, current - 1))}
              className="absolute bottom-0 left-0 top-24 z-20 w-1/2"
              aria-label="Previous story"
            />
            <button
              type="button"
              onClick={() => canGoForward && setIndex((current) => Math.min(stories.length - 1, current + 1))}
              className="absolute bottom-0 right-0 top-24 z-20 w-1/2"
              aria-label="Next story"
            />
          </>
        ) : null}
      </div>
    </OverlayShell>
  );
}

export function NoteComposerModal({
  open,
  note = null,
  submitting = false,
  error = '',
  onClose,
  onSubmit,
  onClear,
}) {
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!open) return;
    setDraft(note?.content || '');
  }, [open, note?.id, note?.content]);

  return (
    <OverlayShell open={open} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-display font-bold uppercase tracking-[0.18em] text-cyan-200/80">Your note</p>
            <h2 className="mt-1 font-display text-2xl font-black text-white">Set your status bubble</h2>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-gray-400 hover:text-white">Close</button>
        </div>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={120}
          rows={4}
          placeholder="What are you up to?"
          className="w-full resize-none rounded-[1.4rem] border border-cyan-300/18 bg-[#151b29] px-4 py-3 text-sm text-white placeholder:text-gray-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus:border-cyan-300/35 focus:bg-[#182032] focus:outline-none"
          style={{ color: '#f8fbff', WebkitTextFillColor: '#f8fbff', caretColor: '#67e8f9' }}
        />
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Notes last 24 hours and start a fresh reply thread when changed.</span>
          <span>{draft.trim().length}/120</span>
        </div>
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <div className="flex flex-wrap justify-between gap-2">
          <button
            type="button"
            onClick={onClear}
            className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-display font-bold text-gray-200 hover:bg-white/10"
          >
            Clear note
          </button>
          <button
            type="button"
            disabled={submitting || !draft.trim()}
            onClick={() => onSubmit?.({ content: draft.trim() })}
            className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-display font-black text-white hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Saving...' : 'Save note'}
          </button>
        </div>
      </div>
    </OverlayShell>
  );
}

export function StoryComposerModal({
  open,
  scoreOptions = [],
  submitting = false,
  error = '',
  onClose,
  onSubmit,
}) {
  const [storyType, setStoryType] = useState('image');
  const [caption, setCaption] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [selectedSource, setSelectedSource] = useState('');
  const [stickerTokens, setStickerTokens] = useState([]);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');

  useEffect(() => {
    if (!open) return;
    setStoryType('image');
    setCaption('');
    setLinkUrl('');
    setSelectedSource(scoreOptions[0]?.value || '');
    setStickerTokens([]);
    setImageFile(null);
    setImagePreview('');
  }, [open, scoreOptions]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview('');
      return undefined;
    }
    const nextUrl = URL.createObjectURL(imageFile);
    setImagePreview(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [imageFile]);

  const selectedScore = scoreOptions.find((option) => option.value === selectedSource) || null;

  const handleSubmit = () => {
    if (storyType === 'image') {
      onSubmit?.({
        storyType,
        caption: caption.trim(),
        imageFile,
        stickerTokens,
      });
      return;
    }
    if (storyType === 'link') {
      onSubmit?.({
        storyType,
        caption: caption.trim(),
        linkUrl: linkUrl.trim(),
        title: caption.trim() || 'Shared link',
        stickerTokens,
      });
      return;
    }
    if (!selectedScore) return;
    onSubmit?.({
      storyType: 'score_snapshot',
      caption: caption.trim(),
      sourceKind: selectedScore.sourceKind,
      sourceId: selectedScore.sourceId,
      stickerTokens,
    });
  };

  const canSubmit = storyType === 'image'
    ? !!imageFile
    : storyType === 'link'
      ? !!caption.trim() || !!linkUrl.trim()
      : !!selectedScore;

  return (
    <OverlayShell open={open} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-display font-bold uppercase tracking-[0.18em] text-cyan-200/80">Story</p>
            <h2 className="mt-1 font-display text-2xl font-black text-white">Add to your circle</h2>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-gray-400 hover:text-white">Close</button>
        </div>

        <div className="inline-flex rounded-full border border-white/10 bg-white/6 p-1">
          {[
            { value: 'image', label: 'Image' },
            { value: 'link', label: 'Link' },
            { value: 'score_snapshot', label: 'Score' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStoryType(option.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-display font-bold transition-colors ${
                storyType === option.value ? 'bg-cyan-500 text-white' : 'text-gray-300 hover:text-white'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {storyType === 'image' ? (
          <div className="space-y-3">
            <label className="block rounded-[1.4rem] border border-dashed border-white/12 bg-white/5 px-4 py-5 text-center text-sm text-gray-300">
              <input type="file" accept="image/*" className="hidden" onChange={(event) => setImageFile(event.target.files?.[0] || null)} />
              {imageFile ? imageFile.name : 'Choose a story image'}
            </label>
            {imagePreview ? <img src={imagePreview} alt="" className="max-h-72 w-full rounded-[1.4rem] object-cover" /> : null}
          </div>
        ) : null}

        {storyType === 'link' ? (
          <input
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            placeholder="https://..."
            className="w-full rounded-[1.2rem] border border-white/10 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-cyan-300/30 focus:outline-none"
          />
        ) : null}

        {storyType === 'score_snapshot' ? (
          scoreOptions.length > 0 ? (
            <div className="space-y-2">
              {scoreOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedSource(option.value)}
                  className={`flex w-full items-start justify-between rounded-[1.2rem] border px-4 py-3 text-left transition-colors ${
                    selectedSource === option.value
                      ? 'border-cyan-300/35 bg-cyan-500/12 text-white'
                      : 'border-white/10 bg-white/6 text-gray-200 hover:bg-white/8'
                  }`}
                >
                  <span>
                    <span className="block font-display text-sm font-black">{option.label}</span>
                    <span className="mt-1 block text-xs text-gray-400">{option.subtitle}</span>
                  </span>
                  <span className="text-xs text-gray-500">{option.timeLabel}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-[1.2rem] border border-white/10 bg-white/6 px-4 py-3 text-sm text-gray-300">
              No recent upscores or clears to turn into a story yet.
            </p>
          )
        ) : null}

        <textarea
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          maxLength={420}
          rows={4}
          placeholder={storyType === 'score_snapshot' ? 'Add a caption to your score snapshot' : 'Add a caption'}
          className="w-full resize-none rounded-[1.4rem] border border-white/10 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-cyan-300/30 focus:outline-none"
        />

        <div className="flex items-center justify-between gap-3">
          <DojoCatStickerPicker
            compact
            onSelect={(token) => setStickerTokens((prev) => [...prev, token])}
            buttonClassName="h-10 w-10 rounded-full border border-white/12 bg-white/6 text-base text-gray-200 hover:bg-white/10"
            align="left"
          />
          <span className="text-xs text-gray-500">{caption.trim().length}/420</span>
        </div>

        {stickerTokens.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {stickerTokens.map((token, index) => {
              const sticker = getStickerEmoji(token);
              if (!sticker) return null;
              return (
                <button
                  key={`${token}-${index}`}
                  type="button"
                  onClick={() => setStickerTokens((prev) => prev.filter((_, tokenIndex) => tokenIndex !== index))}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/6 p-1.5"
                  title="Remove sticker"
                >
                  <StickerAsset sticker={sticker} alt={sticker.label} title={sticker.label} className="h-full w-full object-contain" />
                </button>
              );
            })}
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-display font-black text-white hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Sharing...' : 'Add story'}
          </button>
        </div>
      </div>
    </OverlayShell>
  );
}

export function NoteThreadModal({
  open,
  note = null,
  conversation = null,
  messages = [],
  loading = false,
  sending = false,
  error = '',
  draft = '',
  onClose,
  onDraftChange,
  onSend,
  onOpenConversation,
}) {
  return (
    <OverlayShell open={open} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-display font-bold uppercase tracking-[0.18em] text-cyan-200/80">Thread</p>
            <h2 className="mt-1 font-display text-2xl font-black text-white">{note?.user?.username || 'Note replies'}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-gray-400 hover:text-white">Close</button>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-white/6 px-4 py-4">
          <p className="text-sm leading-6 text-white">{note?.content || 'This note is no longer active.'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {note?.link ? renderLinkButton(note.link, 'inline-flex rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-xs font-display font-bold text-white hover:bg-white/12') : null}
            {conversation?.id ? (
              <button
                type="button"
                onClick={onOpenConversation}
                className="rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-xs font-display font-bold text-gray-100 hover:bg-white/12"
              >
                Open DM
              </button>
            ) : null}
          </div>
        </div>

        <div className="max-h-[18rem] space-y-3 overflow-y-auto pr-1">
          {loading ? (
            <p className="text-sm text-gray-400">Loading replies...</p>
          ) : messages.length === 0 ? (
            <p className="rounded-[1.2rem] border border-dashed border-white/10 bg-white/5 px-4 py-4 text-sm text-gray-400">
              No replies yet. Start the thread.
            </p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[85%] rounded-[1.25rem] border px-3 py-2.5 text-sm leading-6 shadow-[0_10px_24px_rgba(0,0,0,0.16)] ${
                  message.is_own
                    ? 'ml-auto border-cyan-300/20 bg-cyan-500/12 text-white'
                    : 'border-white/10 bg-white/6 text-gray-100'
                }`}
              >
                {!message.is_own ? <p className="mb-1 text-[10px] font-display font-bold uppercase tracking-[0.18em] text-gray-500">{message.sender?.username}</p> : null}
                <div>{renderFormattedText(message.content)}</div>
                <p className="mt-2 text-[10px] text-gray-500">{formatRelativeTime(message.created_at)}</p>
              </div>
            ))
          )}
        </div>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            rows={2}
            maxLength={4000}
            placeholder={`Reply to ${note?.user?.username || 'this note'}...`}
            className="min-h-[3.2rem] flex-1 resize-none rounded-[1.4rem] border border-white/10 bg-white/6 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-cyan-300/30 focus:outline-none"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={sending || !draft.trim()}
            className="rounded-full bg-cyan-500 px-4 py-3 text-sm font-display font-black text-white hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </OverlayShell>
  );
}

export default function InboxHighlightsStrip({
  me = null,
  circles = [],
  loading = false,
  error = '',
  onOpenStory,
  onOpenNote,
  onOpenStoryComposer,
}) {
  const { user } = useAuth();
  const fallbackSelfCircle = user?.id ? {
    is_self: true,
    has_story: false,
    note: null,
    stories: [],
    user: {
      id: user.id,
      username: user.username || '',
      avatar: getAvatarUrl(user.avatar || ''),
      avatar_v: user.avatar_v || 0,
    },
  } : null;
  const selfCircle = me || circles.find((circle) => circle?.is_self) || fallbackSelfCircle;
  const orderedCircles = [
    selfCircle,
    ...circles.filter((circle) => !circle?.is_self),
  ].filter(Boolean);

  if (!loading && orderedCircles.length === 0 && !error) return null;

  return (
    <div className="border-b border-piu-border/25 bg-[linear-gradient(180deg,rgba(7,12,21,0.92),rgba(7,12,21,0.58))] px-4 pb-4 pt-3 sm:px-5">
      {loading ? (
        <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1 pt-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="flex w-[4.55rem] shrink-0 flex-col items-center pt-2">
              <div className="relative pt-[2.15rem]">
                <div className="absolute left-1/2 top-0 h-[2.45rem] w-[5.4rem] -translate-x-1/2 rounded-[1.15rem] bg-white/6" />
                <div className="h-[3.85rem] w-[3.85rem] animate-pulse rounded-full bg-white/8" />
              </div>
              <div className="mt-1.5 h-3 w-12 animate-pulse rounded-full bg-white/8" />
            </div>
          ))}
        </div>
      ) : (
        <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {orderedCircles.map((circle) => (
            <HighlightCircle
              key={circle.user.id}
              circle={circle}
              onOpenStory={onOpenStory}
              onOpenNote={onOpenNote}
              onOpenStoryComposer={onOpenStoryComposer}
            />
          ))}
        </div>
      )}
    </div>
  );
}
