import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAvatarUrl } from './AvatarPicker';
import DojoCatStickerPicker from './DojoCatStickerPicker';
import ScoreSnapshotCard from './ScoreSnapshotCard';
import SessionSummaryCard from './SessionSummaryCard';
import SessionShareCard from './SessionShareCard';
import LiveSessionCard from './LiveSessionCard';
import MentionSuggestionsPanel from './MentionSuggestionsPanel';
import SessionPlanCard from './SessionPlanCard';
import StickerAsset from './StickerAsset';
import UserPickerDialog from './UserPickerDialog';
import { HourOfPowerLogo } from './HourOfPowerBrand';
import { useAuth } from '../contexts/AuthContext';
import { renderFormattedText } from '../utils/formatText';
import { getStickerEmoji } from '../utils/stickers';
import {
  addMessageStoryComment,
  archiveMessageStory,
  deleteMessageStory,
  getMessageStoryComments,
  getMessageStoryEngagement,
  getMessageStoryStats,
  markMessageStoryViewed,
  searchUsers,
  toggleMessageStoryPump,
} from '../utils/api';
import { sendDirectPayloadToRecipients } from '../utils/directMessageDelivery';
import { useMentionComposer } from '../hooks/useMentionComposer';
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
  const stopStoryAdvance = (event) => {
    event?.stopPropagation?.();
  };
  if (link.path) {
    return (
      <Link
        to={link.path}
        className={className}
        data-story-interactive="true"
        onClick={stopStoryAdvance}
        onMouseDown={stopStoryAdvance}
        onTouchStart={stopStoryAdvance}
      >
        {label}
      </Link>
    );
  }
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      className={className}
      data-story-interactive="true"
      onClick={stopStoryAdvance}
      onMouseDown={stopStoryAdvance}
      onTouchStart={stopStoryAdvance}
    >
      {label}
    </a>
  );
}

function formatStoryScoreValue(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function getStoryGradeTone(grade = '') {
  const normalized = String(grade || '').trim().toUpperCase();
  if (normalized.includes('SSS')) return 'text-sky-300';
  if (normalized.includes('SS')) return 'text-yellow-300';
  if (normalized.includes('S')) return 'text-amber-300';
  if (normalized.includes('AAA')) return 'text-slate-100';
  if (normalized.includes('AA')) return 'text-orange-200';
  if (normalized.includes('A')) return 'text-lime-200';
  if (normalized === 'B' || normalized === 'C') return 'text-gray-300';
  return 'text-gray-400';
}

const MODAL_INPUT_CLASS = 'w-full rounded-[1.4rem] border border-cyan-300/18 bg-[#151b29] px-4 py-3 text-sm text-white placeholder:text-gray-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus:border-cyan-300/35 focus:bg-[#182032] focus:outline-none';
const MODAL_INPUT_STYLE = { color: '#f8fbff', WebkitTextFillColor: '#f8fbff', caretColor: '#67e8f9' };

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
          <span className={`relative flex h-[3.65rem] w-[3.65rem] items-center justify-center rounded-full p-[3px] shadow-[0_12px_30px_rgba(0,0,0,0.25)] transition-transform group-hover:scale-[1.02] ${frameClass}`}>
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
      <span className="max-w-[4.55rem] truncate text-[11px] font-display font-bold text-gray-200">
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
      className={`absolute bottom-full z-10 mb-1.5 flex w-max max-w-[7rem] items-center rounded-lg px-2 py-1 text-left transition-all ${
        isSelf ? 'left-0 translate-x-0' : 'left-1/2 -translate-x-1/2'
      } ${
        content
          ? 'bg-[#343945] text-white shadow-[0_4px_16px_rgba(0,0,0,0.35)] hover:bg-[#3b4150]'
          : 'border border-dashed border-white/12 bg-[#262b35] text-gray-300 hover:bg-[#2c313c]'
      }`}
      aria-label={isSelf ? 'Set your note' : 'Open note thread'}
    >
      <span className="line-clamp-2 text-[10px] font-medium leading-[1.35]">
        {content || 'Share a note'}
      </span>
      <span className={`absolute -bottom-[3px] left-1/2 h-[7px] w-[7px] -translate-x-1/2 rotate-45 rounded-[1px] ${content ? 'bg-[#343945]' : 'border-r border-b border-dashed border-white/12 bg-[#262b35]'}`} />
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
    <div className="flex w-[4.4rem] shrink-0 flex-col items-center pt-1.5">
      <div className="relative">
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
  const bareLiveRecapPost = story.type === 'post'
    && !story.media_url
    && !!live
    && !summary
    && !share
    && !plan;
  const bareHourOfPowerShare = story.type === 'post'
    && !story.media_url
    && share?.shareType === 'hour_of_power'
    && !summary
    && !live
    && !plan;

  if (story.type === 'score_roundup') {
    const rows = Array.isArray(story.scores) ? story.scores.slice(0, 5) : [];
    return (
      <div className="w-full max-w-sm space-y-3">
        <div className="overflow-hidden rounded-[1.5rem] border border-piu-border/60 bg-piu-card/95 px-4 py-4 shadow-[0_18px_42px_rgba(0,0,0,0.28)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-display font-bold uppercase tracking-[0.18em] text-gray-500">
                {story.entry_kind === 'clear' ? 'New clears' : 'New upscores'}
              </p>
              <h3 className="mt-1 font-display text-2xl font-black leading-none text-white">
                {story.title || 'Score update'}
              </h3>
              {story.subtitle ? <p className="mt-2 text-xs text-gray-400">{story.subtitle}</p> : null}
            </div>
            <span className="rounded-full border border-piu-border/60 bg-piu-dark/80 px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-[0.16em] text-gray-200">
              {rows.length}/{Math.max(rows.length, parseInt(story.total_count, 10) || rows.length)}
            </span>
          </div>

          <div className="mt-4 space-y-2.5">
            {rows.map((entry, index) => (
              <div key={`${story.id || 'story'}:${entry.song_title || 'song'}:${entry.mode || ''}:${entry.level || 0}:${index}`} className="flex items-center gap-3 rounded-xl border border-piu-border/60 bg-piu-dark/75 px-3 py-2.5">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-piu-border/60 bg-[#0f1522]">
                  {entry.jacket_url ? (
                    <img src={entry.jacket_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-piu-dark/90 text-[10px] font-display font-bold uppercase tracking-[0.12em] text-gray-400">
                      {String(entry.mode || 'PIU').slice(0, 3)}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-black text-white">{entry.song_title || 'Song'}</p>
                  <p className="mt-1 text-[11px] text-gray-400">
                    {entry.mode || 'Mode'}
                    {entry.level ? ` ${entry.level}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-sm font-black text-white">{formatStoryScoreValue(entry.score)}</p>
                  <p className={`mt-1 text-xs font-display font-bold ${getStoryGradeTone(entry.grade)}`}>{entry.grade || 'Score'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {story.caption ? (
          <div className="rounded-[1.2rem] border border-piu-border/60 bg-piu-dark/80 px-4 py-3 text-sm leading-6 text-gray-100 shadow-[0_14px_32px_rgba(0,0,0,0.24)]">
            {renderFormattedText(story.caption)}
          </div>
        ) : null}

        <div className="space-y-3">
          {renderLinkButton(story.link, 'inline-flex rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-display font-bold text-cyan-100 hover:border-cyan-400/35 hover:text-white')}
          <StickerRow tokens={story.sticker_tokens} />
        </div>
      </div>
    );
  }

  if (story.snapshot) {
    return (
      <div className="w-full max-w-sm space-y-3">
        <ScoreSnapshotCard
          score={story.snapshot}
          jacketUrl={story.snapshot.jacketUrl || story.snapshot.jacket_url || ''}
          chartLink={story.link?.path || ''}
          className="mx-auto"
        />
        {story.caption ? (
          <div className="rounded-[1.2rem] border border-piu-border/60 bg-piu-dark/80 px-4 py-3 text-sm leading-6 text-gray-100 shadow-[0_14px_32px_rgba(0,0,0,0.24)]">
            {renderFormattedText(story.caption)}
          </div>
        ) : null}
        <div className="space-y-3">
          {renderLinkButton(story.link, 'inline-flex rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-display font-bold text-cyan-100 hover:border-cyan-400/35 hover:text-white')}
          <StickerRow tokens={story.sticker_tokens} />
        </div>
      </div>
    );
  }

  if (story.type === 'post') {
    if (bareLiveRecapPost) {
      return (
        <div className="w-full max-w-sm space-y-3">
          <LiveSessionCard
            summary={live}
            title="Shinsa Live Recap"
            compact
            className="shadow-[0_18px_42px_rgba(0,0,0,0.28)]"
          />
          {visibleCaption ? <div className="text-sm leading-6 text-gray-100">{renderFormattedText(visibleCaption)}</div> : null}
          {renderLinkButton(story.link, 'inline-flex rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-xs font-display font-bold text-white hover:bg-white/12')}
          <StickerRow tokens={story.sticker_tokens} />
        </div>
      );
    }

    if (bareHourOfPowerShare) {
      return (
        <div className="w-full max-w-sm space-y-3">
          <SessionShareCard
            share={share}
            title="Hour of Power Recap"
            compact
            className="shadow-[0_18px_42px_rgba(0,0,0,0.28)]"
          />
          {visibleCaption ? <div className="text-sm leading-6 text-gray-100">{renderFormattedText(visibleCaption)}</div> : null}
          {renderLinkButton(story.link, 'inline-flex rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-xs font-display font-bold text-white hover:bg-white/12')}
          <StickerRow tokens={story.sticker_tokens} />
        </div>
      );
    }

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
    const isHop = story.type === 'hour_of_power' || /hour of power/i.test(String(story.title || ''));
    return (
      <div className={`w-full max-w-sm overflow-hidden rounded-[1.8rem] border px-5 py-5 text-white shadow-[0_18px_42px_rgba(0,0,0,0.28)] ${
        isHop
          ? 'border-yellow-300/20 bg-[radial-gradient(circle_at_top,rgba(250,204,21,0.18),transparent_42%),linear-gradient(160deg,#111528,#1a2136)]'
          : 'border-rose-300/14 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_42%),linear-gradient(160deg,#0a101b,#151d2f)]'
      }`}>
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

function OverlayShell({ open, onClose, children, padded = true, fullscreen = false }) {
  if (!open) return null;
  return (
    <div className={`fixed inset-0 z-[160] flex justify-center bg-black/80 backdrop-blur-sm ${fullscreen ? 'items-stretch' : 'items-end sm:items-center'}`}>
      <button type="button" aria-label="Close overlay" className="absolute inset-0" onClick={onClose} />
      <div className={`relative z-10 w-full border border-white/10 bg-[#060a12] shadow-[0_24px_70px_rgba(0,0,0,0.45)] ${fullscreen ? 'h-full max-w-none rounded-none' : 'rounded-t-[1.9rem] sm:max-w-2xl sm:rounded-[2rem]'} ${padded ? 'p-4 sm:p-6' : ''}`}>
        {children}
      </div>
    </div>
  );
}

function stopStoryEvent(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
}

function buildStorySharePayload(story, ownerUser) {
  const previewItems = Array.isArray(story?.scores)
    ? story.scores
      .slice(0, 3)
      .map((entry) => ({
        songTitle: String(entry?.song_title || '').trim(),
        mode: String(entry?.mode || '').trim(),
        level: parseInt(entry?.level, 10) || 0,
        score: parseInt(entry?.score, 10) || 0,
        grade: String(entry?.grade || '').trim(),
        jacketUrl: String(entry?.jacket_url || '').trim(),
      }))
      .filter((entry) => entry.songTitle || entry.score > 0 || entry.grade || entry.jacketUrl)
    : [];
  const totalItemCount = Math.max(parseInt(story?.total_count, 10) || 0, previewItems.length);
  const storyPath = String(story?.link?.path || '').trim();
  const storyUrl = String(story?.link?.url || '').trim();
  const fallbackPath = storyPath || '/messages';
  const storyOwnerId = String(ownerUser?.id || story?.user?.id || '').trim();
  const storyOwnerUsername = String(ownerUser?.username || story?.user?.username || '').trim();
  const storyOwnerAvatar = String(ownerUser?.avatar || story?.user?.avatar || '').trim();

  return {
    kind: 'story',
    path: fallbackPath,
    url: storyUrl,
    storyId: String(story?.id || '').trim(),
    storyOwnerId,
    storyOwnerUsername,
    storyOwnerAvatar,
    storyType: String(story?.type || '').trim(),
    storySourceKind: String(story?.source?.kind || '').trim(),
    storyCaption: String(story?.caption || '').trim().slice(0, 420),
    storyCreatedAt: String(story?.created_at || '').trim(),
    storyMediaUrl: String(story?.media_url || story?.post?.images?.[0] || '').trim(),
    storyFallbackPath: storyPath,
    storyFallbackUrl: storyUrl,
    title: String(story?.title || `${ownerUser?.username || 'Player'} story`).trim().slice(0, 160),
    subtitle: String(story?.subtitle || story?.caption || '').trim().slice(0, 220),
    buttonLabel: 'Open story',
    songTitle: story?.snapshot?.song_title || story?.scores?.[0]?.song_title || '',
    mode: story?.snapshot?.mode || story?.scores?.[0]?.mode || '',
    level: parseInt(story?.snapshot?.level ?? story?.scores?.[0]?.level, 10) || 0,
    score: parseInt(story?.snapshot?.score ?? story?.scores?.[0]?.score, 10) || 0,
    grade: String(story?.snapshot?.grade || story?.scores?.[0]?.grade || '').trim(),
    jacketUrl: String(story?.snapshot?.jacket_url || story?.scores?.[0]?.jacket_url || '').trim(),
    playerName: storyOwnerUsername,
    playerAvatar: storyOwnerAvatar,
    contextLabel: 'Story',
    previewItems,
    totalItemCount,
    extraItemCount: Math.max(0, totalItemCount - previewItems.length),
  };
}

function StoryCommentsModal({
  open,
  onClose,
  ownerUser,
  comments = [],
  loading = false,
  error = '',
  draft = '',
  sending = false,
  onDraftChange,
  onSend,
}) {
  const { user: authUser } = useAuth();
  const draftInputRef = useRef(null);
  const commentsEndRef = useRef(null);
  const {
    mentionUsers,
    mentionLoading,
    showMentions,
    updateMentionState,
    applyMention,
    handleKeyDown: handleMentionKeyDown,
    clearMentions,
  } = useMentionComposer({
    value: draft,
    setValue: (nextValue) => onDraftChange?.(nextValue),
    inputRef: draftInputRef,
    enabled: open,
    searchMentions: searchUsers,
    excludeUserIds: [authUser?.id].filter(Boolean),
  });

  useEffect(() => {
    if (open) return;
    clearMentions();
  }, [clearMentions, open]);

  useEffect(() => {
    if (open && comments.length > 0) {
      requestAnimationFrame(() => commentsEndRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' }));
    }
  }, [open, comments.length]);

  return (
    <OverlayShell open={open} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-cyan-300/70">Comments</p>
            <h2 className="mt-0.5 truncate font-display text-xl font-black text-white">{ownerUser?.username || 'Story'}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/6 text-gray-400 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-95"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
          </button>
        </div>

        <div className="relative max-h-[22rem] space-y-2.5 overflow-y-auto overscroll-contain pr-1">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-600 border-t-cyan-400" />
              Loading comments...
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-[1.3rem] border border-dashed border-white/8 py-8 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="h-7 w-7 text-gray-600"><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0m-12-3.75h.008v.015H4.5V8.25zm0 3.75h.008v.015H4.5V12zm0 3.75h.008v.015H4.5v-.015zM7.5 15h9M7.5 12h9m-9-3.75h9" /></svg>
              <p className="text-sm text-gray-500">No comments yet. Be the first.</p>
            </div>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="flex gap-2.5 rounded-[1.2rem] border border-white/8 bg-white/[0.04] px-3 py-2.5">
                {comment.user?.avatar ? (
                  <img src={comment.user.avatar} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-display font-black text-white">
                    {(comment.user?.username || 'U').slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[13px] font-display font-black text-white">{comment.user?.username || 'Player'}</p>
                    <span className="shrink-0 text-[10px] text-gray-600">{formatRelativeTime(comment.created_at)}</span>
                  </div>
                  <div className="mt-0.5 text-[13px] leading-[1.45] text-gray-200">{renderFormattedText(comment.content)}</div>
                </div>
              </div>
            ))
          )}
          <div ref={commentsEndRef} />
        </div>

        {error ? <p className="text-[13px] text-red-300">{error}</p> : null}

        <div className="space-y-2.5">
          <div className="relative">
            <MentionSuggestionsPanel
              open={showMentions || mentionLoading}
              loading={mentionLoading}
              users={mentionUsers}
              onSelect={applyMention}
            />
            <textarea
              ref={draftInputRef}
              value={draft}
              onChange={(event) => {
                onDraftChange?.(event.target.value);
                updateMentionState(event.target.value, event.target.selectionStart);
              }}
              onClick={(event) => updateMentionState(draft, event.currentTarget.selectionStart)}
              onKeyDown={handleMentionKeyDown}
              rows={2}
              maxLength={280}
              placeholder={`Comment on ${ownerUser?.username || 'this story'}...`}
              className={`resize-none ${MODAL_INPUT_CLASS}`}
              style={MODAL_INPUT_STYLE}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] tabular-nums text-gray-600">{draft.trim().length}<span className="text-gray-700">/280</span></span>
            <button
              type="button"
              onClick={onSend}
              disabled={sending || !draft.trim()}
              className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-display font-black text-white shadow-[0_2px_8px_rgba(6,182,212,0.25)] transition-all hover:bg-cyan-400 hover:shadow-[0_4px_14px_rgba(6,182,212,0.3)] active:scale-[0.97] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {sending ? 'Sending...' : 'Send comment'}
            </button>
          </div>
        </div>
      </div>
    </OverlayShell>
  );
}

function StoryStatsModal({ open, onClose, ownerUser, stats = null, loading = false, error = '' }) {
  return (
    <OverlayShell open={open} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-cyan-300/70">Story stats</p>
            <h2 className="mt-0.5 truncate font-display text-xl font-black text-white">{ownerUser?.username || 'Your story'}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/6 text-gray-400 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-95"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-600 border-t-cyan-400" />
            Loading views...
          </div>
        ) : error ? (
          <p className="text-[13px] text-red-300">{error}</p>
        ) : (
          <>
            <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.04] px-4 py-4">
              <p className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-gray-500">Views</p>
              <p className="mt-1.5 font-display text-3xl font-black tabular-nums text-white">{stats?.view_count || 0}</p>
            </div>

            <div className="max-h-[22rem] space-y-2.5 overflow-y-auto overscroll-contain pr-1">
              {Array.isArray(stats?.viewers) && stats.viewers.length > 0 ? (
                stats.viewers.map((entry, index) => (
                  <div key={`${entry?.user?.id || 'viewer'}-${index}`} className="flex items-center gap-2.5 rounded-[1.2rem] border border-white/8 bg-white/[0.04] px-3 py-2.5">
                    {entry.user?.avatar ? (
                      <img src={entry.user.avatar} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-display font-black text-white">
                        {(entry.user?.username || 'U').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-display font-black text-white">{entry.user?.username || 'Player'}</p>
                      <p className="text-[11px] text-gray-600">{formatRelativeTime(entry.viewed_at)} ago</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center gap-2 rounded-[1.3rem] border border-dashed border-white/8 py-8 text-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="h-7 w-7 text-gray-600"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  <p className="text-sm text-gray-500">No views yet from other players.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </OverlayShell>
  );
}

export function StoryArchiveModal({ open, onClose, stories = [], onOpenStory }) {
  return (
    <OverlayShell open={open} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-cyan-300/70">Archive</p>
            <h2 className="mt-0.5 truncate font-display text-xl font-black text-white">Past stories</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/6 text-gray-400 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-95"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
          </button>
        </div>

        {stories.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-[1.3rem] border border-dashed border-white/8 py-8 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="h-7 w-7 text-gray-600"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
            <p className="text-sm text-gray-500">No archived stories yet.</p>
          </div>
        ) : (
          <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
            {stories.map((entry) => {
              const story = entry?.story || null;
              if (!story) return null;
              const previewImage = story?.media_url || story?.snapshot?.jacket_url || story?.scores?.[0]?.jacket_url || '';
              return (
                <button
                  key={`${story.id}-${entry.archived_at}`}
                  type="button"
                  onClick={() => onOpenStory?.(story)}
                  className="flex w-full items-center gap-3 rounded-[1.3rem] border border-white/10 bg-white/6 px-3 py-3 text-left transition-colors hover:bg-white/10"
                >
                  {previewImage ? (
                    <img src={previewImage} alt="" className="h-14 w-14 rounded-[1rem] object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-[1rem] bg-white/10 text-sm font-display font-black text-white">
                      {(story?.title || 'S').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-display font-black text-white">{story?.title || 'Story'}</p>
                    <p className="mt-1 truncate text-xs text-gray-400">{story?.subtitle || story?.caption || 'Archived story'}</p>
                    <p className="mt-1 text-[10px] text-gray-500">Archived {formatRelativeTime(entry.archived_at)} ago</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-xs font-display font-bold text-white">View</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </OverlayShell>
  );
}

export function StoryViewerModal({
  open,
  user,
  stories = [],
  loading = false,
  error = '',
  onClose,
  onStoriesChange,
  onArchiveChange,
  readonly = false,
  initialIndex = 0,
  hasPreviousUser = false,
  hasNextUser = false,
  onNavigatePreviousUser,
  onNavigateNextUser,
}) {
  const { user: authUser } = useAuth();
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [engagementById, setEngagementById] = useState({});
  const [commentPreviewIndex, setCommentPreviewIndex] = useState(0);
  const [sharePickerOpen, setSharePickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [commentsState, setCommentsState] = useState({ loading: false, items: [], draft: '', sending: false, error: '' });
  const [statsState, setStatsState] = useState({ loading: false, data: null, error: '' });
  const frameRef = useRef(0);
  const touchStartXRef = useRef(null);
  const swipeHandledRef = useRef(false);

  const story = stories[index] || null;
  const ownerUserId = String(user?.id || '');
  const isOwner = !readonly && String(authUser?.id || '') === ownerUserId;
  const isPaused = menuOpen || commentsOpen || statsOpen || sharePickerOpen;
  const activeEngagement = story?.id
    ? (engagementById[story.id] || story.engagement || {
      pump_count: 0,
      comment_count: 0,
      view_count: 0,
      user_pumped: false,
      preview_comments: [],
    })
    : { pump_count: 0, comment_count: 0, view_count: 0, user_pumped: false, preview_comments: [] };
  const canGoBack = index > 0;
  const canGoForward = index < stories.length - 1;
  const previewComments = Array.isArray(activeEngagement?.preview_comments) ? activeEngagement.preview_comments : [];
  const previewComment = previewComments.length > 0
    ? previewComments[commentPreviewIndex % previewComments.length]
    : null;

  useEffect(() => {
    if (!open) return;
    setIndex(Math.max(0, initialIndex));
    setProgress(0);
    setMenuOpen(false);
    setCommentsOpen(false);
    setStatsOpen(false);
    setSharePickerOpen(false);
    setCommentsState({ loading: false, items: [], draft: '', sending: false, error: '' });
    setStatsState({ loading: false, data: null, error: '' });
  }, [open, user?.id, initialIndex]);

  useEffect(() => {
    const nextMap = {};
    (stories || []).forEach((entry) => {
      if (entry?.id) nextMap[entry.id] = entry.engagement || nextMap[entry.id] || {
        pump_count: 0,
        comment_count: 0,
        view_count: 0,
        user_pumped: false,
        preview_comments: [],
      };
    });
    setEngagementById((prev) => ({ ...prev, ...nextMap }));
  }, [stories]);

  useEffect(() => {
    setProgress(0);
    setCommentPreviewIndex(0);
    setMenuOpen(false);
    setCommentsState((prev) => ({ ...prev, items: [], error: '' }));
    setStatsState({ loading: false, data: null, error: '' });
  }, [story?.id]);

  useEffect(() => {
    if (!open || !story || loading || error || isPaused || readonly) return undefined;
    const durationMs = 6000;
    const startAt = performance.now();

    const tick = (now) => {
      const nextProgress = Math.min(1, (now - startAt) / durationMs);
      setProgress(nextProgress);
      if (nextProgress >= 1) {
        if (index < stories.length - 1) {
          setIndex((current) => Math.min(stories.length - 1, current + 1));
          return;
        }
        if (hasNextUser) {
          onNavigateNextUser?.();
          return;
        }
        onClose?.();
        return;
      }
      frameRef.current = window.requestAnimationFrame(tick);
    };

    frameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    };
  }, [open, story?.id, loading, error, isPaused, index, stories.length, onClose, readonly, hasNextUser, onNavigateNextUser]);

  useEffect(() => {
    if (!open || !story?.id || !ownerUserId || readonly) return undefined;
    let cancelled = false;

    markMessageStoryViewed(ownerUserId, story.id)
      .then((payload) => {
        if (!cancelled && payload?.engagement) {
          setEngagementById((prev) => ({ ...prev, [story.id]: payload.engagement }));
        }
      })
      .catch(() => {});

    getMessageStoryEngagement(ownerUserId, story.id)
      .then((payload) => {
        if (!cancelled && payload?.engagement) {
          setEngagementById((prev) => ({ ...prev, [story.id]: payload.engagement }));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [open, story?.id, ownerUserId, readonly]);

  useEffect(() => {
    const previewComments = Array.isArray(activeEngagement?.preview_comments) ? activeEngagement.preview_comments : [];
    if (!open || previewComments.length < 2 || commentsOpen) return undefined;
    const interval = window.setInterval(() => {
      setCommentPreviewIndex((current) => (current + 1) % previewComments.length);
    }, 3200);
    return () => window.clearInterval(interval);
  }, [open, story?.id, activeEngagement?.preview_comments, commentsOpen]);

  const setStoryEngagement = (storyId, engagement) => {
    if (!storyId || !engagement) return;
    setEngagementById((prev) => ({ ...prev, [storyId]: engagement }));
  };

  const goPrevious = () => {
    if (canGoBack) {
      setIndex((current) => Math.max(0, current - 1));
      return;
    }
    if (hasPreviousUser) {
      onNavigatePreviousUser?.();
    }
  };

  const goNext = () => {
    if (canGoForward) {
      setIndex((current) => Math.min(stories.length - 1, current + 1));
      return;
    }
    if (hasNextUser) {
      onNavigateNextUser?.();
      return;
    }
    onClose?.();
  };

  const openComments = async () => {
    if (!story?.id || !ownerUserId) return;
    setCommentsOpen(true);
    setCommentsState((prev) => ({
      ...prev,
      loading: true,
      error: '',
      items: Array.isArray(activeEngagement?.preview_comments) ? activeEngagement.preview_comments : prev.items,
    }));
    try {
      const payload = await getMessageStoryComments(ownerUserId, story.id);
      setCommentsState((prev) => ({
        ...prev,
        loading: false,
        items: Array.isArray(payload?.comments) ? payload.comments : [],
      }));
    } catch (err) {
      setCommentsState((prev) => ({
        ...prev,
        loading: false,
        error: err?.message || 'Failed to load comments.',
      }));
    }
  };

  const handleSendComment = async () => {
    const content = String(commentsState.draft || '').trim();
    if (!content || commentsState.sending || !story?.id || !ownerUserId) return;
    setCommentsState((prev) => ({ ...prev, sending: true, error: '' }));
    try {
      const payload = await addMessageStoryComment(ownerUserId, story.id, content);
      setCommentsState((prev) => ({
        ...prev,
        sending: false,
        draft: '',
        items: Array.isArray(payload?.comments) ? payload.comments : prev.items,
      }));
      if (payload?.engagement) {
        setStoryEngagement(story.id, payload.engagement);
      }
    } catch (err) {
      setCommentsState((prev) => ({
        ...prev,
        sending: false,
        error: err?.message || 'Failed to send comment.',
      }));
    }
  };

  const openStats = async () => {
    if (!story?.id || !ownerUserId || !isOwner) return;
    setStatsOpen(true);
    setMenuOpen(false);
    setStatsState({ loading: true, data: null, error: '' });
    try {
      const payload = await getMessageStoryStats(ownerUserId, story.id);
      setStatsState({ loading: false, data: payload || null, error: '' });
    } catch (err) {
      setStatsState({ loading: false, data: null, error: err?.message || 'Failed to load story stats.' });
    }
  };

  const handleTogglePump = async (event) => {
    stopStoryEvent(event);
    if (readonly || !story?.id || !ownerUserId) return;
    try {
      const payload = await toggleMessageStoryPump(ownerUserId, story.id);
      if (payload?.engagement) {
        setStoryEngagement(story.id, payload.engagement);
      }
    } catch {}
  };

  const handleShareToDm = async (selectedUsers) => {
    if (!story || !Array.isArray(selectedUsers) || selectedUsers.length === 0) return;
    await sendDirectPayloadToRecipients(selectedUsers, {
      link_share: buildStorySharePayload(story, user),
    });
    setSharePickerOpen(false);
  };

  const applyStoryMutation = (nextStories, nextArchive = null) => {
    const normalizedStories = Array.isArray(nextStories) ? nextStories : [];
    onStoriesChange?.(normalizedStories);
    if (Array.isArray(nextArchive)) {
      onArchiveChange?.(nextArchive);
    }
    if (normalizedStories.length === 0) {
      onClose?.();
      return;
    }
    setIndex((current) => Math.min(current, normalizedStories.length - 1));
  };

  const handleArchiveStory = async () => {
    if (!story?.id || !ownerUserId || !isOwner) return;
    setMenuOpen(false);
    try {
      const payload = await archiveMessageStory(ownerUserId, story.id);
      applyStoryMutation(payload?.stories || [], payload?.archived || null);
    } catch {}
  };

  const handleDeleteStory = async () => {
    if (!story?.id || !ownerUserId || !isOwner) return;
    setMenuOpen(false);
    if (!window.confirm('Delete this story from your active circles?')) return;
    try {
      const payload = await deleteMessageStory(ownerUserId, story.id);
      applyStoryMutation(payload?.stories || []);
    } catch {}
  };

  const handleViewerClick = (event) => {
    if (swipeHandledRef.current) {
      swipeHandledRef.current = false;
      return;
    }
    if (loading || error || !story || isPaused) return;
    if (event?.target?.closest?.('[data-story-interactive="true"],button,a,input,textarea,select,iframe')) return;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    const clickX = Number(event?.clientX || 0);
    if (!viewportWidth || clickX < viewportWidth / 2) {
      goPrevious();
      return;
    }
    goNext();
  };

  const handleTouchStart = (event) => {
    if (event?.target?.closest?.('[data-story-interactive="true"],button,a,input,textarea,select,iframe')) {
      touchStartXRef.current = null;
      return;
    }
    touchStartXRef.current = Number(event.touches?.[0]?.clientX || 0);
  };

  const handleTouchEnd = (event) => {
    if (touchStartXRef.current === null) return;
    const endX = Number(event.changedTouches?.[0]?.clientX || 0);
    const deltaX = endX - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(deltaX) < 56) return;
    swipeHandledRef.current = true;
    if (deltaX < 0) {
      goNext();
      return;
    }
    goPrevious();
  };

  return (
    <>
      <OverlayShell open={open} onClose={onClose} padded={false} fullscreen>
        <div
          className="relative h-[100dvh] overflow-hidden"
          onClick={handleViewerClick}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),transparent_38%),linear-gradient(180deg,#04070d,#0a1220_46%,#04070d)]" />
          <div className="relative z-50 flex items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-5">
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex gap-1.5">
                {(stories.length > 0 ? stories : [null]).map((entry, entryIndex) => {
                  const fill = entryIndex < index ? 100 : entryIndex === index ? (progress * 100) : 0;
                  return (
                    <span key={entry?.id || `empty-${entryIndex}`} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                      <span className="block h-full rounded-full bg-cyan-300 transition-[width] duration-75" style={{ width: `${fill}%` }} />
                    </span>
                  );
                })}
              </div>
              <div className="flex items-center gap-3">
                {user?.avatar ? <img src={user.avatar} alt="" className="h-10 w-10 rounded-full object-cover" /> : null}
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-black text-white">{user?.username || 'Story'}</p>
                  <p className="text-xs text-gray-400">{formatRelativeTime(story?.created_at)}</p>
                </div>
              </div>
            </div>
            <div className="relative z-50 flex items-center gap-2">
              {isOwner ? (
                <div className="relative">
                  <button
                    type="button"
                    data-story-interactive="true"
                    onClick={(event) => {
                      stopStoryEvent(event);
                      setMenuOpen((current) => !current);
                    }}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white hover:bg-white/12"
                  >
                    <span className="text-lg leading-none">...</span>
                  </button>
                  {menuOpen ? (
                    <div data-story-interactive="true" className="absolute right-0 top-12 z-[70] w-44 overflow-hidden rounded-[1.1rem] border border-white/10 bg-[#0d1320] shadow-[0_18px_42px_rgba(0,0,0,0.32)]">
                      <button data-story-interactive="true" type="button" onClick={openStats} className="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/8">Story stats</button>
                      <button data-story-interactive="true" type="button" onClick={handleArchiveStory} className="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/8">Archive story</button>
                      <button data-story-interactive="true" type="button" onClick={handleDeleteStory} className="w-full px-4 py-3 text-left text-sm text-rose-200 hover:bg-rose-500/10">Delete story</button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                data-story-interactive="true"
                onClick={onClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/8 text-lg text-white hover:bg-white/12"
              >
                x
              </button>
            </div>
          </div>

          <div className="relative z-20 flex min-h-[calc(100dvh-5rem)] items-center justify-center px-4 pb-20 pt-2 sm:px-6">
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

          {previewComment ? (
            <button
              type="button"
              data-story-interactive="true"
              onClick={(event) => {
                stopStoryEvent(event);
                openComments();
              }}
              className="absolute bottom-16 left-4 z-40 max-w-[68%] rounded-[1.2rem] border border-white/12 bg-black/45 px-3 py-2 text-left shadow-[0_12px_30px_rgba(0,0,0,0.25)] backdrop-blur-md"
            >
              <div className="flex items-center gap-2">
                {previewComment.user?.avatar ? (
                  <img src={previewComment.user.avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
                ) : null}
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-display font-black uppercase tracking-[0.14em] text-cyan-200/80">
                    {previewComment.user?.username || 'Comment'}
                  </p>
                  <p className="truncate text-sm text-white">{previewComment.content}</p>
                </div>
              </div>
            </button>
          ) : null}

          {!readonly && story ? (
            <div
              data-story-interactive="true"
              className="absolute bottom-4 left-1/2 z-40 flex w-[calc(100%-1.4rem)] max-w-[24rem] -translate-x-1/2 items-center justify-between gap-1.5 rounded-full border border-white/12 bg-black/48 px-2 py-1.5 shadow-[0_18px_42px_rgba(0,0,0,0.3)] backdrop-blur-md"
            >
              <button
                type="button"
                onClick={handleTogglePump}
                data-story-interactive="true"
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-display font-black transition-colors ${
                  activeEngagement.user_pumped ? 'bg-cyan-500/18 text-cyan-100' : 'text-white hover:bg-white/8'
                }`}
              >
                <img
                  src={activeEngagement.user_pumped ? '/piu/stomp-yellow.svg' : '/piu/stomp-gray.svg'}
                  alt=""
                  className="h-4 w-4 object-contain"
                />
                <span>Pumps</span>
                <span className="text-[11px] text-cyan-100/90">{activeEngagement.pump_count || 0}</span>
              </button>
              <button
                type="button"
                data-story-interactive="true"
                onClick={(event) => {
                  stopStoryEvent(event);
                  setSharePickerOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-display font-black text-white transition-colors hover:bg-white/8"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l10-7-3 14-4-5-3-2z" />
                </svg>
                <span>Share</span>
              </button>
              <button
                type="button"
                data-story-interactive="true"
                onClick={(event) => {
                  stopStoryEvent(event);
                  openComments();
                }}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-display font-black text-white transition-colors hover:bg-white/8"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5m-6 7l-3-3V6a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H9l-2 3z" />
                </svg>
                <span>Comment</span>
                <span className="text-[11px] text-cyan-100/90">{activeEngagement.comment_count || 0}</span>
              </button>
            </div>
          ) : null}
        </div>
      </OverlayShell>

      <StoryCommentsModal
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        ownerUser={user}
        comments={commentsState.items}
        loading={commentsState.loading}
        error={commentsState.error}
        draft={commentsState.draft}
        sending={commentsState.sending}
        onDraftChange={(value) => setCommentsState((prev) => ({ ...prev, draft: value }))}
        onSend={handleSendComment}
      />

      <StoryStatsModal
        open={statsOpen}
        onClose={() => setStatsOpen(false)}
        ownerUser={user}
        stats={statsState.data}
        loading={statsState.loading}
        error={statsState.error}
      />

      <UserPickerDialog
        open={sharePickerOpen}
        title="Share story"
        description="Select one or more players on Shinsa to send this story to."
        selectLabel="Send"
        submitLabel="Share"
        excludeUserIds={[authUser?.id].filter(Boolean)}
        onClose={() => setSharePickerOpen(false)}
        onSubmit={handleShareToDm}
        multiSelect
        zIndexClass="z-[220]"
      />
    </>
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
  const { user: authUser } = useAuth();
  const [draft, setDraft] = useState('');
  const draftInputRef = useRef(null);
  const {
    mentionUsers,
    mentionLoading,
    showMentions,
    updateMentionState,
    applyMention,
    handleKeyDown: handleMentionKeyDown,
    clearMentions,
  } = useMentionComposer({
    value: draft,
    setValue: setDraft,
    inputRef: draftInputRef,
    enabled: open,
    searchMentions: searchUsers,
    excludeUserIds: [authUser?.id].filter(Boolean),
  });

  useEffect(() => {
    if (!open) return;
    setDraft(note?.content || '');
  }, [open, note?.id, note?.content]);

  useEffect(() => {
    if (open) return;
    clearMentions();
  }, [clearMentions, open]);

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
        <div className="relative">
          <MentionSuggestionsPanel
            open={showMentions || mentionLoading}
            loading={mentionLoading}
            users={mentionUsers}
            onSelect={applyMention}
          />
          <textarea
            ref={draftInputRef}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              updateMentionState(event.target.value, event.target.selectionStart);
            }}
            onClick={(event) => updateMentionState(draft, event.currentTarget.selectionStart)}
            onKeyDown={handleMentionKeyDown}
            maxLength={120}
            rows={4}
            placeholder="What are you up to?"
            className={`resize-none ${MODAL_INPUT_CLASS}`}
            style={MODAL_INPUT_STYLE}
          />
        </div>
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
  const { user: authUser } = useAuth();
  const captionInputRef = useRef(null);
  const {
    mentionUsers,
    mentionLoading,
    showMentions,
    updateMentionState,
    applyMention,
    handleKeyDown: handleMentionKeyDown,
    clearMentions,
  } = useMentionComposer({
    value: caption,
    setValue: setCaption,
    inputRef: captionInputRef,
    enabled: open,
    searchMentions: searchUsers,
    excludeUserIds: [authUser?.id].filter(Boolean),
  });

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

  useEffect(() => {
    if (open) return;
    clearMentions();
  }, [clearMentions, open]);

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
            className={MODAL_INPUT_CLASS}
            style={MODAL_INPUT_STYLE}
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

        <div className="relative">
          <MentionSuggestionsPanel
            open={showMentions || mentionLoading}
            loading={mentionLoading}
            users={mentionUsers}
            onSelect={applyMention}
          />
          <textarea
            ref={captionInputRef}
            value={caption}
            onChange={(event) => {
              setCaption(event.target.value);
              updateMentionState(event.target.value, event.target.selectionStart);
            }}
            onClick={(event) => updateMentionState(caption, event.currentTarget.selectionStart)}
            onKeyDown={handleMentionKeyDown}
            maxLength={420}
            rows={4}
            placeholder={storyType === 'score_snapshot' ? 'Add a caption to your score snapshot' : 'Add a caption'}
            className={`resize-none ${MODAL_INPUT_CLASS}`}
            style={MODAL_INPUT_STYLE}
          />
        </div>

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
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (open && messages.length > 0) {
      requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' }));
    }
  }, [open, messages.length]);

  return (
    <OverlayShell open={open} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-cyan-300/70">Thread</p>
            <h2 className="mt-0.5 truncate font-display text-xl font-black text-white">{note?.user?.username || 'Note replies'}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/6 text-gray-400 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-95"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
          </button>
        </div>

        <div className="rounded-[1.4rem] border border-cyan-300/10 bg-cyan-500/[0.04] px-4 py-3.5">
          <p className="text-[13px] leading-[1.5] text-white">{note?.content || 'This note is no longer active.'}</p>
          {(note?.link || conversation?.id) ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {note?.link ? renderLinkButton(note.link, 'inline-flex rounded-full border border-cyan-300/20 bg-cyan-500/10 px-3.5 py-1.5 text-xs font-display font-bold text-cyan-50 transition-colors hover:bg-cyan-500/18') : null}
              {conversation?.id ? (
                <button
                  type="button"
                  onClick={onOpenConversation}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/6 px-3.5 py-1.5 text-xs font-display font-bold text-gray-200 transition-colors hover:bg-white/10 hover:text-white active:scale-[0.97]"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 opacity-60"><path d="M1 8.74c0 .983.713 1.825 1.69 1.943.764.092 1.534.164 2.31.216v2.351a.75.75 0 001.28.53l2.51-2.51c.182-.181.427-.283.684-.283h.767c2.695 0 4.509-1.374 4.753-3.242A28.015 28.015 0 0015 6.99c0-2.352-2.179-4.24-4.906-4.24H5.906C3.179 2.75 1 4.638 1 6.99v1.75z" /></svg>
                  Open DM
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="relative max-h-[18rem] space-y-2 overflow-y-auto overscroll-contain pr-1">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-600 border-t-cyan-400" />
              Loading replies...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-[1.3rem] border border-dashed border-white/8 py-8 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="h-7 w-7 text-gray-600"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" /></svg>
              <p className="text-sm text-gray-500">No replies yet. Start the thread.</p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[85%] rounded-[1.2rem] border px-3.5 py-2.5 text-[13px] leading-[1.5] ${
                  message.is_own
                    ? 'ml-auto border-cyan-300/15 bg-cyan-500/10 text-white'
                    : 'border-white/8 bg-white/[0.04] text-gray-100'
                }`}
              >
                {!message.is_own ? <p className="mb-1 text-[10px] font-display font-bold uppercase tracking-[0.18em] text-gray-500">{message.sender?.username}</p> : null}
                <div>{renderFormattedText(message.content)}</div>
                <p className={`mt-1.5 text-[10px] ${message.is_own ? 'text-cyan-300/40' : 'text-gray-600'}`}>{formatRelativeTime(message.created_at)}</p>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {error ? <p className="text-[13px] text-red-300">{error}</p> : null}

        <div className="space-y-2.5">
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            rows={2}
            maxLength={4000}
            placeholder={`Reply to ${note?.user?.username || 'this note'}...`}
            className={`resize-none ${MODAL_INPUT_CLASS}`}
            style={MODAL_INPUT_STYLE}
          />
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={onSend}
              disabled={sending || !draft.trim()}
              className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-display font-black text-white shadow-[0_2px_8px_rgba(6,182,212,0.25)] transition-all hover:bg-cyan-400 hover:shadow-[0_4px_14px_rgba(6,182,212,0.3)] active:scale-[0.97] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {sending ? 'Sending...' : 'Reply'}
            </button>
          </div>
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
      <div className="border-b border-piu-border/25 bg-[linear-gradient(180deg,rgba(7,12,21,0.92),rgba(7,12,21,0.58))] px-4 pb-3 pt-2.5 sm:px-5">
        {loading ? (
        <div className="scrollbar-none flex gap-2 overflow-x-auto px-1 pb-1 pt-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="flex w-[4.4rem] shrink-0 flex-col items-center pt-1.5">
              <div className="relative pt-[2.05rem]">
                <div className="absolute left-1/2 top-0 h-[2.45rem] w-[5.4rem] -translate-x-1/2 rounded-[1.15rem] bg-white/6" />
                <div className="h-[3.65rem] w-[3.65rem] animate-pulse rounded-full bg-white/8" />
              </div>
              <div className="mt-1.5 h-3 w-12 animate-pulse rounded-full bg-white/8" />
            </div>
          ))}
        </div>
      ) : (
        <div className="scrollbar-none flex gap-2 overflow-x-auto px-1 pb-1 pt-9 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
