import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  getChartKeyMap,
  getNewClear,
  getMessageConversation,
  getMessageConversations,
  getOrCreateDirectConversation,
  getSongChartDetail,
  getUpscore,
  sendConversationMessage,
} from '../utils/api';
import {
  buildChartCompareLinkShare,
  buildChallengeLifecycleCard,
  buildClearChallengeCard,
  buildRematchChallengeCard,
  buildUpscoreChallengeCard,
} from '../utils/directMessageShares';
import { getProfilePath } from '../utils/profile';
import { renderFormattedText } from '../utils/formatText';
import DojoCatStickerPicker from '../components/DojoCatStickerPicker';
import SessionShareCard from '../components/SessionShareCard';
import UserPickerDialog from '../components/UserPickerDialog';

const LINK_SHARE_BADGES = {
  live_session: 'Live session',
  post: 'Post',
  upscore: 'Upscore',
  clear: 'Clear',
  chart_compare: 'Compare',
  hour_of_power: 'Hour of Power',
  link: 'Link',
};
const CHALLENGE_BADGES = {
  beat_score: 'Score Challenge',
  clear_chart: 'Clear Challenge',
};
const COMPARE_STATUS_META = {
  beat_target: {
    fallbackLabel: 'Beat target',
    className: 'border-emerald-300/35 bg-emerald-500/15 text-emerald-100',
  },
  pass_earned: {
    fallbackLabel: 'Pass earned',
    className: 'border-emerald-300/35 bg-emerald-500/15 text-emerald-100',
  },
  chasing_target: {
    fallbackLabel: 'Still chasing',
    className: 'border-amber-300/35 bg-amber-500/15 text-amber-100',
  },
  still_breaking: {
    fallbackLabel: 'Still breaking',
    className: 'border-rose-300/35 bg-rose-500/15 text-rose-100',
  },
  shared_best: {
    fallbackLabel: 'Current best',
    className: 'border-cyan-300/35 bg-cyan-500/15 text-cyan-100',
  },
  accepted: {
    fallbackLabel: 'Accepted',
    className: 'border-sky-300/35 bg-sky-500/15 text-sky-100',
  },
  expired: {
    fallbackLabel: 'Expired',
    className: 'border-gray-300/25 bg-gray-500/10 text-gray-200',
  },
};

function normalizeSongName(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseResourceIdFromPath(path, resource) {
  const raw = String(path || '').trim();
  const prefix = `/${String(resource || '').replace(/^\/+|\/+$/g, '')}/`;
  if (!raw.startsWith(prefix)) return '';
  return raw.slice(prefix.length).split(/[/?#]/, 1)[0] || '';
}

function resolveChartId(songTitle, mode, level, chartMap) {
  if (!chartMap || typeof chartMap !== 'object') return '';
  const normalizedTitle = normalizeSongName(songTitle);
  const modeLabel = String(mode || '').trim();
  const levelValue = parseInt(level, 10) || 0;
  if (!normalizedTitle || !modeLabel || levelValue <= 0) return '';
  return String(chartMap[`${normalizedTitle}|${modeLabel}|${levelValue}`] || '').trim();
}

function parseUpscoreItems(item) {
  try {
    const parsed = JSON.parse(item?.upscores_json || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function getClearItems(item) {
  const fallback = [{
    entry_type: 'song_clear',
    song_title: item?.song_title || '',
    mode: item?.mode || 'Single',
    level: parseInt(item?.level, 10) || 0,
    score: parseInt(item?.score, 10) || 0,
    grade: item?.grade || '',
  }];

  try {
    const parsed = JSON.parse(item?.clears_json || '[]');
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback;
    return parsed.map((entry) => ({
      entry_type: entry?.entry_type || 'song_clear',
      song_title: entry?.song_title || fallback[0].song_title,
      mode: entry?.mode || fallback[0].mode,
      level: parseInt(entry?.level, 10) || fallback[0].level,
      score: parseInt(entry?.score, 10) || 0,
      grade: entry?.grade || '',
    }));
  } catch {
    return fallback;
  }
}

function appendStickerToken(value, token) {
  const current = String(value || '');
  const needsSpace = current.length > 0 && !/\s$/.test(current);
  return `${current}${needsSpace ? ' ' : ''}${token} `;
}

function formatConversationTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw.endsWith('Z') ? raw : `${raw.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return '';

  const diffMs = Date.now() - parsed.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 1) return 'now';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getCompareStatusInfo(statusKind, statusLabel) {
  const meta = COMPARE_STATUS_META[String(statusKind || '').trim()] || COMPARE_STATUS_META.shared_best;
  return {
    label: String(statusLabel || '').trim() || meta.fallbackLabel,
    className: meta.className,
  };
}

function CompareStatusPill({ statusKind = '', statusLabel = '', prefix = '' }) {
  const info = getCompareStatusInfo(statusKind, statusLabel);
  return (
    <p className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-display font-bold ${info.className}`}>
      {prefix ? `${prefix}: ${info.label}` : info.label}
    </p>
  );
}

function getResponseStatusPrefix(responseStatus) {
  if (!responseStatus) return 'Latest reply';
  const senderLabel = responseStatus.senderName ? ` by ${responseStatus.senderName}` : '';
  if (responseStatus.statusKind === 'accepted') {
    return `Accepted${senderLabel}`;
  }
  if (responseStatus.statusKind === 'expired') {
    return `Expired${senderLabel}`;
  }
  if (responseStatus.statusKind === 'beat_target' || responseStatus.statusKind === 'pass_earned') {
    return `Challenge complete${senderLabel}`;
  }
  return responseStatus.senderName ? `Latest reply from ${responseStatus.senderName}` : 'Latest reply';
}

function getMessageLabel(message) {
  if (!message) return '';
  if (message.message_type === 'session_share' && message.share?.shareType === 'hour_of_power') {
    return 'Hour of Power recap';
  }
  if (message.message_type === 'session_share') {
    return 'Session recap';
  }
  if (message.message_type === 'link_share' && message.link_share?.kind === 'live_session') {
    return 'Live session invite';
  }
  if (message.message_type === 'link_share' && message.link_share?.kind === 'post') {
    return 'Shared post';
  }
  if (message.message_type === 'link_share' && message.link_share?.kind === 'upscore') {
    return 'Shared upscore';
  }
  if (message.message_type === 'link_share' && message.link_share?.kind === 'clear') {
    return 'Shared clear';
  }
  if (message.message_type === 'link_share' && message.link_share?.kind === 'chart_compare') {
    return 'Compare reply';
  }
  if (message.message_type === 'challenge_card' && message.challenge_card?.kind === 'beat_score') {
    if (message.challenge_card?.statusKind === 'accepted') return 'Challenge accepted';
    if (message.challenge_card?.statusKind === 'expired') return 'Challenge expired';
    return 'Score challenge';
  }
  if (message.message_type === 'challenge_card' && message.challenge_card?.kind === 'clear_chart') {
    if (message.challenge_card?.statusKind === 'accepted') return 'Challenge accepted';
    if (message.challenge_card?.statusKind === 'expired') return 'Challenge expired';
    return 'Clear challenge';
  }
  if (message.message_type === 'challenge_card') {
    return 'Challenge';
  }
  if (message.message_type === 'link_share') {
    return 'Shared link';
  }
  return '';
}

function MessageLinkCard({
  linkShare,
  compareAction = null,
  compareLoading = false,
  responseStatus = null,
  followUpAction = null,
  followUpLoading = false,
  followUpLabel = 'Rematch',
}) {
  if (!linkShare) return null;

  const title = String(linkShare.title || '').trim() || 'Open link';
  const subtitle = String(linkShare.subtitle || '').trim();
  const badge = LINK_SHARE_BADGES[linkShare.kind] || 'Link';
  const buttonLabel = String(linkShare.buttonLabel || '').trim() || 'Open';
  const isCompare = linkShare.kind === 'chart_compare';
  const frameClass = isCompare
    ? 'border-emerald-300/25 bg-emerald-500/10'
    : 'border-piu-border/60 bg-piu-card/70';
  const badgeClass = isCompare ? 'text-emerald-200/85' : 'text-cyan-200/75';
  const buttonClass = isCompare
    ? 'border-emerald-300/30 bg-emerald-500/12 text-emerald-100 hover:border-emerald-200/40 hover:text-white'
    : 'border-piu-border/70 bg-piu-dark/40 text-cyan-100 hover:border-cyan-300/35 hover:text-white';
  const compareButtonLabel = responseStatus ? 'Send updated best' : 'Reply with my best';

  return (
    <div className={`w-full rounded-[1.2rem] border px-3 py-3 shadow-[0_10px_24px_rgba(0,0,0,0.16)] ${frameClass}`}>
      <p className={`text-[9px] font-display font-bold uppercase tracking-[0.18em] ${badgeClass}`}>{badge}</p>
      <p className="mt-1 text-[15px] font-display font-black leading-tight text-white">{title}</p>
      {subtitle ? <p className="mt-1 text-[12px] leading-5 text-gray-300">{subtitle}</p> : null}
      {isCompare && linkShare.statusLabel ? (
        <div className="mt-2.5">
          <CompareStatusPill statusKind={linkShare.statusKind} statusLabel={linkShare.statusLabel} />
        </div>
      ) : null}
      {!isCompare && responseStatus ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <CompareStatusPill
            statusKind={responseStatus.statusKind}
            statusLabel={responseStatus.statusLabel}
            prefix={getResponseStatusPrefix(responseStatus)}
          />
        </div>
      ) : null}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {linkShare.path ? (
          <Link
            to={linkShare.path}
            className={`inline-flex rounded-md border px-2.5 py-1.5 text-[10px] font-display font-bold transition-colors ${buttonClass}`}
          >
            {buttonLabel}
          </Link>
        ) : (
          <a
            href={linkShare.url}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex rounded-md border px-2.5 py-1.5 text-[10px] font-display font-bold transition-colors ${buttonClass}`}
          >
            {buttonLabel}
          </a>
        )}
        {compareAction ? (
          <button
            type="button"
            onClick={compareAction}
            disabled={compareLoading}
            className="inline-flex rounded-md border border-emerald-300/35 bg-emerald-500/12 px-2.5 py-1.5 text-[10px] font-display font-bold text-emerald-100 transition-colors hover:border-emerald-200/45 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {compareLoading ? 'Sending...' : compareButtonLabel}
          </button>
        ) : null}
        {followUpAction ? (
          <button
            type="button"
            onClick={followUpAction}
            disabled={followUpLoading}
            className="inline-flex rounded-md border border-amber-300/30 bg-amber-500/12 px-2.5 py-1.5 text-[10px] font-display font-bold text-amber-100 transition-colors hover:border-amber-200/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {followUpLoading ? 'Sending...' : followUpLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MessageChallengeCard({
  challengeCard,
  compareAction = null,
  compareLoading = false,
  responseStatus = null,
  lifecycleAction = null,
  lifecycleLoading = false,
  lifecycleLabel = 'Accept',
}) {
  if (!challengeCard) return null;

  const badge = CHALLENGE_BADGES[challengeCard.kind] || 'Challenge';
  const title = String(challengeCard.title || '').trim() || badge;
  const subtitle = String(challengeCard.subtitle || '').trim();
  const targetLabel = String(challengeCard.targetLabel || '').trim();
  const detailLabel = String(challengeCard.detailLabel || '').trim();
  const buttonLabel = String(challengeCard.buttonLabel || '').trim() || 'Open challenge';
  const compareButtonLabel = responseStatus ? 'Send updated best' : 'Reply with my best';
  const hasLifecycleStatus = !!String(challengeCard.statusKind || '').trim();

  return (
    <div className="w-full rounded-[1.2rem] border border-piu-border/65 bg-piu-card/80 px-3 py-3 shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
      <p className="text-[9px] font-display font-bold uppercase tracking-[0.18em] text-amber-200/85">{badge}</p>
      <p className="mt-1 text-[15px] font-display font-black leading-tight text-white">{title}</p>
      {subtitle ? <p className="mt-1 text-[12px] leading-5 text-gray-300">{subtitle}</p> : null}
      {hasLifecycleStatus ? (
        <div className="mt-2.5">
          <CompareStatusPill statusKind={challengeCard.statusKind} statusLabel={challengeCard.statusLabel} />
        </div>
      ) : null}
      {targetLabel ? (
        <p className="mt-2.5 inline-flex rounded-md border border-amber-300/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-display font-bold text-amber-100">
          {targetLabel}
        </p>
      ) : null}
      {detailLabel ? <p className="mt-2 text-[12px] leading-5 text-gray-300">{detailLabel}</p> : null}
      {responseStatus ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <CompareStatusPill
            statusKind={responseStatus.statusKind}
            statusLabel={responseStatus.statusLabel}
            prefix={getResponseStatusPrefix(responseStatus)}
          />
        </div>
      ) : null}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Link
          to={challengeCard.path}
          className="inline-flex rounded-md border border-piu-border/70 bg-piu-dark/45 px-2.5 py-1.5 text-[10px] font-display font-bold text-amber-100 transition-colors hover:border-amber-300/35 hover:text-white"
        >
          {buttonLabel}
        </Link>
        {compareAction ? (
          <button
            type="button"
            onClick={compareAction}
            disabled={compareLoading}
            className="inline-flex rounded-md border border-emerald-300/35 bg-emerald-500/12 px-2.5 py-1.5 text-[10px] font-display font-bold text-emerald-100 transition-colors hover:border-emerald-200/45 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {compareLoading ? 'Sending...' : compareButtonLabel}
          </button>
        ) : null}
        {lifecycleAction ? (
          <button
            type="button"
            onClick={lifecycleAction}
            disabled={lifecycleLoading}
            className="inline-flex rounded-md border border-sky-300/35 bg-sky-500/12 px-2.5 py-1.5 text-[10px] font-display font-bold text-sky-100 transition-colors hover:border-sky-200/45 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {lifecycleLoading ? 'Sending...' : lifecycleLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onReplyWithBest = null,
  compareLoading = false,
  responseStatus = null,
  onFollowUp = null,
  followUpLoading = false,
  lifecycleAction = null,
  lifecycleLoading = false,
  lifecycleLabel = 'Accept',
}) {
  const isOwn = !!message?.is_own;
  const hasContent = !!String(message?.content || '').trim();
  const hasShare = !!message?.share;
  const hasLinkShare = !!message?.link_share;
  const hasChallengeCard = !!message?.challenge_card;
  const hasRichAttachment = hasShare || hasLinkShare || hasChallengeCard;
  const isAttachmentOnly = hasRichAttachment && !hasContent;
  const alignmentClass = isOwn ? 'items-end' : 'items-start';
  const bubbleTone = isOwn
    ? 'border-cyan-400/20 bg-cyan-500/10'
    : 'border-piu-border/60 bg-piu-dark/55';
  const senderName = message?.sender?.username || 'Unknown';
  const shareLabel = getMessageLabel(message);
  const bubbleClass = isAttachmentOnly
    ? 'w-full max-w-[19.25rem] sm:max-w-[22.5rem]'
    : `w-fit max-w-[81%] sm:max-w-[30rem] rounded-[1.25rem] border ${bubbleTone} px-2.5 py-2 shadow-[0_8px_20px_rgba(0,0,0,0.14)]`;

  return (
    <div className={`flex flex-col ${alignmentClass}`}>
      {!isOwn ? (
        <p className="mb-1 px-1 text-[10px] font-display font-bold uppercase tracking-[0.18em] text-gray-500">
          {senderName}
        </p>
      ) : null}
      <div className={bubbleClass}>
        {hasContent ? (
          <div className="whitespace-pre-wrap break-words text-sm leading-5 text-gray-100">
            {renderFormattedText(message.content)}
          </div>
        ) : null}
        {hasShare ? (
          <div className={hasContent ? 'mt-3' : ''}>
            {shareLabel && !isAttachmentOnly ? (
              <p className="mb-2 text-[10px] font-display font-bold uppercase tracking-[0.2em] text-cyan-200/80">
                {shareLabel}
              </p>
            ) : null}
            <SessionShareCard share={message.share} />
          </div>
        ) : null}
        {hasLinkShare ? (
          <div className={hasContent || hasShare ? 'mt-3' : ''}>
            <MessageLinkCard
              linkShare={message.link_share}
              compareAction={onReplyWithBest}
              compareLoading={compareLoading}
              responseStatus={responseStatus}
              followUpAction={onFollowUp}
              followUpLoading={followUpLoading}
            />
          </div>
        ) : null}
        {hasChallengeCard ? (
          <div className={hasContent || hasShare || hasLinkShare ? 'mt-3' : ''}>
            <MessageChallengeCard
              challengeCard={message.challenge_card}
              compareAction={onReplyWithBest}
              compareLoading={compareLoading}
              responseStatus={responseStatus}
              lifecycleAction={lifecycleAction}
              lifecycleLoading={lifecycleLoading}
              lifecycleLabel={lifecycleLabel}
            />
          </div>
        ) : null}
      </div>
      <p className="mt-0.5 px-1 text-[10px] text-gray-500">{formatConversationTime(message?.created_at)}</p>
    </div>
  );
}

function ConversationRow({ conversation }) {
  const partner = conversation?.partner;

  return (
    <Link
      to={`/messages/${conversation.id}`}
      className="flex items-center gap-3 border-b border-piu-border/20 px-4 py-3.5 transition-colors hover:bg-piu-dark/35 sm:px-5"
    >
      {partner?.avatar ? (
        <img src={partner.avatar} alt="" className="h-11 w-11 rounded-full object-cover" />
      ) : (
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-emerald-500 font-display font-black text-sm text-white">
          {(partner?.username || 'U').slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={`truncate text-sm font-display font-black ${conversation.unread_count > 0 ? 'text-white' : 'text-gray-200'}`}>
            {partner?.username || 'Unknown player'}
          </p>
          <span className="shrink-0 text-[10px] text-gray-500">{formatConversationTime(conversation.last_message_at)}</span>
        </div>
        <p className={`mt-1 truncate text-xs ${conversation.unread_count > 0 ? 'text-gray-200' : 'text-gray-500'}`}>
          {conversation?.last_message?.preview || 'Started a conversation'}
        </p>
      </div>
      {conversation.unread_count > 0 ? (
        <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-cyan-500 px-1 text-[10px] font-display font-black text-white">
          {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
        </span>
      ) : null}
    </Link>
  );
}

function InboxView({
  conversations,
  loadingConversations,
  conversationError,
  onStartChat,
}) {
  return (
    <div className="flex min-h-screen flex-col sm:min-h-0 sm:mx-auto sm:w-full sm:max-w-3xl sm:px-4 sm:py-6">
      <section className="flex flex-1 flex-col overflow-hidden bg-transparent sm:rounded-[1.75rem] sm:border sm:border-piu-border/60 sm:bg-piu-card/75">
        <div
          className="flex items-center justify-between gap-3 border-b border-piu-border/40 bg-piu-card/85 px-4 pb-3 pt-4 backdrop-blur-md sm:px-5 sm:pt-4"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 1rem)' }}
        >
          <div className="min-w-0">
            <h1 className="text-xl font-display font-black text-white sm:text-2xl">Messages</h1>
            <p className="mt-1 text-xs text-gray-400">Keep your score shares, challenges, and chats moving.</p>
          </div>
          <button
            type="button"
            onClick={onStartChat}
            className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3.5 py-2 text-xs font-display font-bold text-cyan-100 transition-colors hover:border-cyan-300/45 hover:text-white"
          >
            New chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingConversations ? (
            <div className="px-4 py-10 text-center text-sm text-gray-500">Loading conversations...</div>
          ) : conversations.length === 0 ? (
            <div className="px-5 py-14 text-center sm:px-8">
              <p className="text-sm text-gray-300">No messages yet.</p>
              <p className="mt-2 text-xs leading-6 text-gray-500">Start from here, from a profile, or by sending a play into DM.</p>
              <button
                type="button"
                onClick={onStartChat}
                className="mt-5 rounded-xl border border-cyan-400/35 bg-cyan-500/10 px-4 py-2 text-sm font-display font-bold text-cyan-100 transition-colors hover:border-cyan-300/45 hover:text-white"
              >
                Start new chat
              </button>
            </div>
          ) : (
            conversations.map((conversation) => (
              <ConversationRow key={conversation.id} conversation={conversation} />
            ))
          )}
        </div>
        {conversationError ? (
          <p className="border-t border-piu-border/40 px-4 py-3 text-sm text-red-300">{conversationError}</p>
        ) : null}
      </section>
    </div>
  );
}

function ConversationView({
  activeConversation,
  activePartner,
  loadingMessages,
  messageError,
  actionError,
  messages,
  getMessageStatus,
  messagesViewportRef,
  messagesEndRef,
  draft,
  draftInputRef,
  onDraftChange,
  onComposerKeyDown,
  onSend,
  onInsertSticker,
  onReplyWithBest,
  canReplyWithBest,
  onSendRematch,
  canSendRematch,
  rematchingMessageId,
  onAcceptChallenge,
  canAcceptChallenge,
  acceptingMessageId,
  onExpireChallenge,
  canExpireChallenge,
  expiringMessageId,
  replyingMessageId,
  sending,
}) {
  return (
    <div className="flex h-[100dvh] min-h-[100dvh] max-h-[100dvh] flex-col overflow-hidden sm:mx-auto sm:h-[calc(100vh-5rem)] sm:min-h-[40rem] sm:max-h-[calc(100vh-5rem)] sm:w-full sm:max-w-4xl sm:px-4 sm:py-6">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent sm:rounded-[1.75rem] sm:border sm:border-piu-border/60 sm:bg-piu-card/75">
        <div
          className="z-10 shrink-0 flex items-center justify-between gap-3 border-b border-piu-border/40 bg-piu-card/92 px-4 pb-2.5 pt-3.5 backdrop-blur-md sm:px-5 sm:pt-4"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 0.75rem)' }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/messages"
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/8 bg-black/20 text-gray-200 shadow-[0_8px_22px_rgba(0,0,0,0.22)] transition-colors hover:border-cyan-300/25 hover:bg-piu-dark/70 hover:text-white"
              aria-label="Back to inbox"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
            {activePartner?.avatar ? (
              <img src={activePartner.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-emerald-500 font-display font-black text-sm text-white">
                {(activePartner?.username || 'U').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-lg font-display font-black text-white">{activePartner?.username || 'Unknown player'}</h1>
              <p className="mt-0.5 text-[11px] text-gray-500">Private chat</p>
            </div>
          </div>
          {activePartner?.id ? (
            <Link
              to={getProfilePath(activePartner.id, activePartner.username)}
              className="hidden rounded-lg border border-piu-border/60 bg-piu-dark/70 px-3 py-1.5 text-xs font-display font-bold text-gray-300 transition-colors hover:text-white sm:inline-flex"
            >
              View profile
            </Link>
            ) : null}
        </div>

        <div ref={messagesViewportRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4">
          {loadingMessages && messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">Loading conversation...</div>
          ) : messageError ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-5 text-sm text-red-200">
                {messageError}
              </div>
              <Link
                to="/messages"
                className="mt-4 rounded-xl border border-cyan-400/35 bg-cyan-500/10 px-4 py-2 text-sm font-display font-bold text-cyan-100 transition-colors hover:text-white"
              >
                Back to inbox
              </Link>
            </div>
          ) : !activeConversation ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">Loading conversation...</div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">No messages yet. Say hello.</div>
          ) : (
            <div className="space-y-3 pb-1">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onReplyWithBest={canReplyWithBest(message) ? () => onReplyWithBest(message) : null}
                  compareLoading={replyingMessageId === message.id}
                  responseStatus={getMessageStatus(message) || null}
                  onFollowUp={canSendRematch(message) ? () => onSendRematch(message) : null}
                  followUpLoading={rematchingMessageId === message.id}
                  lifecycleAction={
                    canAcceptChallenge(message)
                      ? () => onAcceptChallenge(message)
                      : (canExpireChallenge(message) ? () => onExpireChallenge(message) : null)
                  }
                  lifecycleLoading={acceptingMessageId === message.id || expiringMessageId === message.id}
                  lifecycleLabel={canAcceptChallenge(message) ? 'Accept' : 'Expire'}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div
          className="z-10 shrink-0 border-t border-piu-border/40 bg-piu-card/94 px-3 pb-2.5 pt-2.5 backdrop-blur-md sm:px-5 sm:pb-3 sm:pt-3"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.6rem)' }}
        >
          {actionError ? <p className="mb-3 text-sm text-red-300">{actionError}</p> : null}
          <div className="flex items-end gap-2.5">
            <DojoCatStickerPicker
              compact
              onSelect={onInsertSticker}
              buttonClassName="h-11 w-11 rounded-full border border-piu-border/65 bg-piu-dark/55 text-lg text-gray-300 hover:border-cyan-300/35 hover:bg-piu-dark/80 hover:text-white"
              panelClassName="w-[min(21rem,calc(100vw-1rem))]"
              align="left"
            />
            <textarea
              ref={draftInputRef}
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={onComposerKeyDown}
              rows={1}
              maxLength={4000}
              placeholder={`Message ${activePartner?.username || 'player'}...`}
              className="min-h-[2.75rem] max-h-40 flex-1 resize-none rounded-[1.4rem] border border-piu-border/70 bg-piu-dark/55 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-cyan-300/35 focus:outline-none focus:ring-0"
              disabled={sending || !activeConversation}
            />
            <button
              type="button"
              onClick={onSend}
              disabled={sending || !draft.trim() || !activeConversation}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-cyan-500 px-4 text-sm font-display font-black text-white transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function MessagesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { conversationId = '' } = useParams();
  const messagesEndRef = useRef(null);
  const messagesViewportRef = useRef(null);
  const draftInputRef = useRef(null);
  const lastAutoScrollKeyRef = useRef('');
  const chartKeyMapRef = useRef(null);
  const chartKeyMapPromiseRef = useRef(null);

  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [conversationError, setConversationError] = useState('');

  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageError, setMessageError] = useState('');
  const [actionError, setActionError] = useState('');
  const [replyingMessageId, setReplyingMessageId] = useState('');
  const [rematchingMessageId, setRematchingMessageId] = useState('');
  const [acceptingMessageId, setAcceptingMessageId] = useState('');
  const [expiringMessageId, setExpiringMessageId] = useState('');

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const activePartner = activeConversation?.partner || null;
  const excludeUserIds = useMemo(() => [user?.id].filter(Boolean), [user?.id]);

  const ensureChartKeyMap = useCallback(async () => {
    if (chartKeyMapRef.current) return chartKeyMapRef.current;
    if (!chartKeyMapPromiseRef.current) {
      chartKeyMapPromiseRef.current = getChartKeyMap()
        .then((payload) => {
          const nextMap = payload && typeof payload === 'object' ? payload : {};
          chartKeyMapRef.current = nextMap;
          return nextMap;
        })
        .catch((err) => {
          chartKeyMapPromiseRef.current = null;
          throw err;
        });
    }
    return chartKeyMapPromiseRef.current;
  }, []);

  const resolveChartReference = useCallback(async ({ chartPath = '', songTitle = '', mode = '', level = 0 } = {}) => {
    const directChartId = parseResourceIdFromPath(chartPath, 'songs/chart');
    if (directChartId) return directChartId;
    const chartMap = await ensureChartKeyMap();
    return resolveChartId(songTitle, mode, level, chartMap);
  }, [ensureChartKeyMap]);

  const resolveCompareSource = useCallback(async (message) => {
    if (!message) {
      throw new Error('This message cannot be compared yet.');
    }

    if (message.message_type === 'challenge_card' && message.challenge_card) {
      const challengeCard = message.challenge_card;
      const directChartId = await resolveChartReference({
        chartPath: challengeCard.chartPath || '',
        songTitle: challengeCard.songTitle,
        mode: challengeCard.mode,
        level: challengeCard.level,
      });
      if (directChartId) {
        return {
          chartId: directChartId,
          targetScore: parseInt(challengeCard.targetScore, 10) || 0,
          challengeKind: challengeCard.kind || '',
        };
      }

      const upscoreId = challengeCard.sourceKind === 'upscore'
        ? String(challengeCard.sourceId || '').trim() || parseResourceIdFromPath(challengeCard.path, 'upscore')
        : '';
      if (upscoreId) {
        const upscore = await getUpscore(upscoreId);
        const fallbackCard = buildUpscoreChallengeCard({
          upscoreId: upscore?.id || upscoreId,
          username: upscore?.username,
          upscores: parseUpscoreItems(upscore),
        });
        const fallbackChartId = await resolveChartReference({
          songTitle: fallbackCard?.songTitle,
          mode: fallbackCard?.mode,
          level: fallbackCard?.level,
        });
        if (fallbackChartId) {
          return {
            chartId: fallbackChartId,
            targetScore: parseInt(fallbackCard?.targetScore, 10) || parseInt(challengeCard.targetScore, 10) || 0,
            challengeKind: challengeCard.kind || fallbackCard?.kind || '',
          };
        }
      }

      const clearId = challengeCard.sourceKind === 'clear'
        ? String(challengeCard.sourceId || '').trim() || parseResourceIdFromPath(challengeCard.path, 'clear')
        : '';
      if (clearId) {
        const clear = await getNewClear(clearId);
        const fallbackCard = buildClearChallengeCard({
          clearId: clear?.id || clearId,
          username: clear?.username,
          clears: getClearItems(clear),
        });
        const fallbackChartId = await resolveChartReference({
          songTitle: fallbackCard?.songTitle,
          mode: fallbackCard?.mode,
          level: fallbackCard?.level,
        });
        if (fallbackChartId) {
          return {
            chartId: fallbackChartId,
            targetScore: parseInt(fallbackCard?.targetScore, 10) || parseInt(challengeCard.targetScore, 10) || 0,
            challengeKind: challengeCard.kind || fallbackCard?.kind || '',
          };
        }
      }
    }

    if (message.message_type === 'link_share' && message.link_share) {
      const linkShare = message.link_share;
      const directChartId = await resolveChartReference({
        chartPath: linkShare.chartPath || (linkShare.kind === 'chart_compare' ? linkShare.path : ''),
        songTitle: linkShare.songTitle,
        mode: linkShare.mode,
        level: linkShare.level,
      });
      if (directChartId) {
        return {
          chartId: directChartId,
          targetScore: parseInt(linkShare.targetScore, 10) || 0,
          challengeKind: linkShare.kind === 'clear' ? 'clear_chart' : (linkShare.kind === 'upscore' ? 'beat_score' : ''),
        };
      }

      const upscoreId = linkShare.kind === 'upscore'
        ? parseResourceIdFromPath(linkShare.path, 'upscore')
        : '';
      if (upscoreId) {
        const upscore = await getUpscore(upscoreId);
        const fallbackCard = buildUpscoreChallengeCard({
          upscoreId: upscore?.id || upscoreId,
          username: upscore?.username,
          upscores: parseUpscoreItems(upscore),
        });
        const fallbackChartId = await resolveChartReference({
          songTitle: fallbackCard?.songTitle,
          mode: fallbackCard?.mode,
          level: fallbackCard?.level,
        });
        if (fallbackChartId) {
          return {
            chartId: fallbackChartId,
            targetScore: parseInt(fallbackCard?.targetScore, 10) || 0,
            challengeKind: fallbackCard?.kind || 'beat_score',
          };
        }
      }

      const clearId = linkShare.kind === 'clear'
        ? parseResourceIdFromPath(linkShare.path, 'clear')
        : '';
      if (clearId) {
        const clear = await getNewClear(clearId);
        const fallbackCard = buildClearChallengeCard({
          clearId: clear?.id || clearId,
          username: clear?.username,
          clears: getClearItems(clear),
        });
        const fallbackChartId = await resolveChartReference({
          songTitle: fallbackCard?.songTitle,
          mode: fallbackCard?.mode,
          level: fallbackCard?.level,
        });
        if (fallbackChartId) {
          return {
            chartId: fallbackChartId,
            targetScore: parseInt(fallbackCard?.targetScore, 10) || 0,
            challengeKind: fallbackCard?.kind || 'clear_chart',
          };
        }
      }
    }

    throw new Error('This share does not point to a playable chart yet.');
  }, [resolveChartReference]);

  const latestCompareBySourceId = useMemo(() => {
    const next = {};
    for (const message of messages) {
      if (message?.message_type !== 'link_share' || message?.link_share?.kind !== 'chart_compare') continue;
      const sourceMessageId = String(message?.link_share?.sourceMessageId || '').trim();
      if (!sourceMessageId) continue;
      next[sourceMessageId] = {
        statusKind: String(message.link_share.statusKind || '').trim(),
        statusLabel: String(message.link_share.statusLabel || message.link_share.subtitle || '').trim(),
        senderName: String(message?.sender?.username || '').trim(),
        messageId: message.id,
      };
    }
    return next;
  }, [messages]);

  const latestChallengeLifecycleBySourceId = useMemo(() => {
    const next = {};
    for (const message of messages) {
      if (message?.message_type !== 'challenge_card' || !message?.challenge_card?.sourceMessageId) continue;
      next[String(message.challenge_card.sourceMessageId).trim()] = {
        statusKind: String(message.challenge_card.statusKind || '').trim(),
        statusLabel: String(message.challenge_card.statusLabel || message.challenge_card.subtitle || '').trim(),
        senderName: String(message?.sender?.username || '').trim(),
        messageId: message.id,
      };
    }
    return next;
  }, [messages]);

  const canReplyWithBest = useCallback((message) => {
    if (!message || message.is_own) return false;
    const state = latestChallengeLifecycleBySourceId[message.id] || latestCompareBySourceId[message.id] || null;
    if (state?.statusKind === 'expired' || state?.statusKind === 'beat_target' || state?.statusKind === 'pass_earned') {
      return false;
    }
    if (message.message_type === 'challenge_card' && message.challenge_card) {
      if (message.challenge_card.sourceMessageId || message.challenge_card.statusKind) return false;
      return message.challenge_card.kind === 'beat_score' || message.challenge_card.kind === 'clear_chart';
    }
    if (message.message_type !== 'link_share') return false;
    return message.link_share?.kind === 'upscore' || message.link_share?.kind === 'clear';
  }, [latestChallengeLifecycleBySourceId, latestCompareBySourceId]);

  const getChallengeStatusForMessage = useCallback((message) => {
    if (!message?.id) return null;
    return latestChallengeLifecycleBySourceId[message.id] || latestCompareBySourceId[message.id] || null;
  }, [latestChallengeLifecycleBySourceId, latestCompareBySourceId]);

  const canSendRematch = useCallback((message) => {
    if (!message || message.is_own) return false;
    if (message.message_type !== 'link_share' || message.link_share?.kind !== 'chart_compare') return false;
    return message.link_share.statusKind === 'beat_target' || message.link_share.statusKind === 'pass_earned';
  }, []);

  const canAcceptChallenge = useCallback((message) => {
    if (!message || message.is_own) return false;
    if (message.message_type !== 'challenge_card' || !message.challenge_card) return false;
    if (message.challenge_card.sourceMessageId || message.challenge_card.statusKind) return false;
    const state = latestChallengeLifecycleBySourceId[message.id] || latestCompareBySourceId[message.id] || null;
    return !state;
  }, [latestChallengeLifecycleBySourceId, latestCompareBySourceId]);

  const canExpireChallenge = useCallback((message) => {
    if (!message || !message.is_own) return false;
    if (message.message_type !== 'challenge_card' || !message.challenge_card) return false;
    if (message.challenge_card.sourceMessageId || message.challenge_card.statusKind) return false;
    const state = latestChallengeLifecycleBySourceId[message.id] || latestCompareBySourceId[message.id] || null;
    if (!state) return true;
    return state.statusKind !== 'expired' && state.statusKind !== 'beat_target' && state.statusKind !== 'pass_earned';
  }, [latestChallengeLifecycleBySourceId, latestCompareBySourceId]);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    try {
      const payload = await getMessageConversations();
      setConversations(Array.isArray(payload?.conversations) ? payload.conversations : []);
      setConversationError('');
    } catch (err) {
      setConversationError(err?.message || 'Failed to load conversations.');
    } finally {
      setLoadingConversations(false);
    }
  }, [user]);

  const loadConversation = useCallback(async (targetConversationId) => {
    if (!user || !targetConversationId) return;
    setLoadingMessages(true);
    try {
      const payload = await getMessageConversation(targetConversationId);
      setActiveConversation(payload?.conversation || null);
      setMessages(Array.isArray(payload?.messages) ? payload.messages : []);
      setMessageError('');
    } catch (err) {
      setActiveConversation(null);
      setMessages([]);
      setMessageError(err?.message || 'Failed to load conversation.');
    } finally {
      setLoadingMessages(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  useEffect(() => {
    if (!user) return undefined;
    setLoadingConversations(true);
    loadConversations();
    const interval = setInterval(loadConversations, 15000);
    return () => clearInterval(interval);
  }, [user, loadConversations]);

  useEffect(() => {
    if (!user) return undefined;
    if (!conversationId) {
      setActiveConversation(null);
      setMessages([]);
      setMessageError('');
      return undefined;
    }
    loadConversation(conversationId);
    const interval = setInterval(() => loadConversation(conversationId), 5000);
    return () => clearInterval(interval);
  }, [user, conversationId, loadConversation]);

  useEffect(() => {
    setDraft('');
    setActionError('');
    setReplyingMessageId('');
    setRematchingMessageId('');
    setAcceptingMessageId('');
    setExpiringMessageId('');
  }, [conversationId]);

  useEffect(() => {
    const input = draftInputRef.current;
    if (!input) return;
    input.style.height = '0px';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }, [draft, conversationId]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;

    const lastMessage = messages[messages.length - 1] || null;
    const nextKey = conversationId
      ? `${conversationId}:${messages.length}:${lastMessage?.id || 'empty'}`
      : '';
    const previousKey = lastAutoScrollKeyRef.current;
    const isConversationChange = !previousKey || !previousKey.startsWith(`${conversationId}:`);
    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const isNearBottom = distanceFromBottom < 120;
    const shouldScroll = isConversationChange || (nextKey !== previousKey && (isNearBottom || lastMessage?.is_own));

    if (!shouldScroll) return;

    lastAutoScrollKeyRef.current = nextKey;
    const behavior = isConversationChange ? 'auto' : 'smooth';
    window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
    });
  }, [messages, conversationId]);

  const handleSend = async () => {
    if (!conversationId || sending) return;
    const trimmedDraft = draft.trim();
    if (!trimmedDraft) return;
    setActionError('');
    setSending(true);
    try {
      const payload = await sendConversationMessage(conversationId, { content: trimmedDraft });
      setDraft('');
      if (payload?.message) {
        setMessages((prev) => [...prev, payload.message]);
      }
      if (payload?.conversation) {
        setActiveConversation(payload.conversation);
      }
      loadConversations();
    } catch (err) {
      setActionError(err?.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const handleComposerKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleInsertSticker = useCallback((token) => {
    setDraft((prev) => appendStickerToken(prev, token));
    window.requestAnimationFrame(() => {
      const input = draftInputRef.current;
      if (!input) return;
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    });
  }, []);

  const handleReplyWithBest = useCallback(async (message) => {
    if (!conversationId || !user || !message?.id) return;
    setActionError('');
    setReplyingMessageId(message.id);

    try {
      const source = await resolveCompareSource(message);
      if (!source?.chartId) {
        throw new Error('Could not find the chart for this compare reply.');
      }

      const detail = await getSongChartDetail(source.chartId, { user_id: user.id });
      const chart = detail?.chart || null;
      const best = detail?.user_summary?.best || null;

      if (!chart) {
        throw new Error('That chart could not be loaded.');
      }
      if (!best) {
        throw new Error('You do not have a recorded best on that chart yet.');
      }

      const compareLinkShare = buildChartCompareLinkShare({
        chartId: chart.chart_id || source.chartId,
        chartTitle: chart.title,
        mode: chart.mode,
        level: chart.level,
        username: user.username,
        best,
        targetScore: source.targetScore,
        challengeKind: source.challengeKind,
        sourceMessageId: message.id,
      });

      if (!compareLinkShare) {
        throw new Error('Could not build a compare reply for this chart.');
      }

      const payload = await sendConversationMessage(conversationId, { link_share: compareLinkShare });
      if (payload?.message) {
        setMessages((prev) => [...prev, payload.message]);
      }
      if (payload?.conversation) {
        setActiveConversation(payload.conversation);
      }
      loadConversations();
    } catch (err) {
      setActionError(err?.message || 'Failed to send compare reply.');
    } finally {
      setReplyingMessageId('');
    }
  }, [conversationId, loadConversations, resolveCompareSource, user]);

  const sendChallengeLifecycleUpdate = useCallback(async (message, statusKind, setLoadingId) => {
    if (!conversationId || !user || !message?.id || message?.message_type !== 'challenge_card' || !message.challenge_card) return;

    setActionError('');
    setLoadingId(message.id);

    try {
      const lifecycleCard = buildChallengeLifecycleCard({
        challengeCard: message.challenge_card,
        actorName: user.username,
        statusKind,
        sourceMessageId: message.id,
      });

      if (!lifecycleCard) {
        throw new Error('Could not update challenge state.');
      }

      const payload = await sendConversationMessage(conversationId, { challenge_card: lifecycleCard });
      if (payload?.message) {
        setMessages((prev) => [...prev, payload.message]);
      }
      if (payload?.conversation) {
        setActiveConversation(payload.conversation);
      }
      loadConversations();
    } catch (err) {
      setActionError(err?.message || 'Failed to update challenge.');
    } finally {
      setLoadingId('');
    }
  }, [conversationId, loadConversations, user]);

  const handleAcceptChallenge = useCallback(async (message) => {
    await sendChallengeLifecycleUpdate(message, 'accepted', setAcceptingMessageId);
  }, [sendChallengeLifecycleUpdate]);

  const handleExpireChallenge = useCallback(async (message) => {
    await sendChallengeLifecycleUpdate(message, 'expired', setExpiringMessageId);
  }, [sendChallengeLifecycleUpdate]);

  const handleSendRematch = useCallback(async (message) => {
    if (!conversationId || !user || !message?.id || message?.message_type !== 'link_share') return;
    const linkShare = message.link_share || null;
    if (!linkShare || linkShare.kind !== 'chart_compare') return;

    setActionError('');
    setRematchingMessageId(message.id);

    try {
      const chartId = await resolveChartReference({
        chartPath: linkShare.chartPath || linkShare.path,
        songTitle: linkShare.songTitle,
        mode: linkShare.mode,
        level: linkShare.level,
      });
      if (!chartId) {
        throw new Error('Could not find the chart for this rematch.');
      }

      let targetScore = parseInt(linkShare.score, 10) || 0;
      let targetGrade = String(linkShare.grade || '').trim();
      let chartTitle = String(linkShare.songTitle || '').trim();
      let mode = String(linkShare.mode || '').trim();
      let level = parseInt(linkShare.level, 10) || 0;

      if (!targetScore || !chartTitle || !mode || !level) {
        const detail = await getSongChartDetail(chartId, { user_id: message.sender?.id || '' });
        const chart = detail?.chart || null;
        const best = detail?.user_summary?.best || null;
        if (!chart) {
          throw new Error('That chart could not be loaded.');
        }
        chartTitle = chart.title;
        mode = chart.mode;
        level = chart.level;
        targetScore = targetScore || (parseInt(best?.score, 10) || 0);
        targetGrade = targetGrade || String(best?.grade || '').trim();
      }

      if (!targetScore) {
        throw new Error('No rematch target is available for this reply yet.');
      }

      const rematchCard = buildRematchChallengeCard({
        chartId,
        chartTitle,
        mode,
        level,
        challengerName: user.username,
        targetScore,
        targetGrade,
      });

      if (!rematchCard) {
        throw new Error('Could not build a rematch challenge.');
      }

      const payload = await sendConversationMessage(conversationId, { challenge_card: rematchCard });
      if (payload?.message) {
        setMessages((prev) => [...prev, payload.message]);
      }
      if (payload?.conversation) {
        setActiveConversation(payload.conversation);
      }
      loadConversations();
    } catch (err) {
      setActionError(err?.message || 'Failed to send rematch.');
    } finally {
      setRematchingMessageId('');
    }
  }, [conversationId, loadConversations, resolveChartReference, user]);

  const handleStartConversation = async (selectedUser) => {
    const payload = await getOrCreateDirectConversation(selectedUser.id);
    setPickerOpen(false);
    await loadConversations();
    if (payload?.conversation?.id) {
      navigate(`/messages/${payload.conversation.id}`);
    }
  };

  return (
    <>
      {conversationId ? (
        <ConversationView
          activeConversation={activeConversation}
          activePartner={activePartner}
          loadingMessages={loadingMessages}
          messageError={messageError}
          actionError={actionError}
          messages={messages}
          getMessageStatus={getChallengeStatusForMessage}
          messagesViewportRef={messagesViewportRef}
          messagesEndRef={messagesEndRef}
          draft={draft}
          draftInputRef={draftInputRef}
          onDraftChange={setDraft}
          onComposerKeyDown={handleComposerKeyDown}
          onSend={handleSend}
          onInsertSticker={handleInsertSticker}
          onReplyWithBest={handleReplyWithBest}
          canReplyWithBest={canReplyWithBest}
          onSendRematch={handleSendRematch}
          canSendRematch={canSendRematch}
          rematchingMessageId={rematchingMessageId}
          onAcceptChallenge={handleAcceptChallenge}
          canAcceptChallenge={canAcceptChallenge}
          acceptingMessageId={acceptingMessageId}
          onExpireChallenge={handleExpireChallenge}
          canExpireChallenge={canExpireChallenge}
          expiringMessageId={expiringMessageId}
          replyingMessageId={replyingMessageId}
          sending={sending}
        />
      ) : (
        <InboxView
          conversations={conversations}
          loadingConversations={loadingConversations}
          conversationError={conversationError}
          onStartChat={() => setPickerOpen(true)}
        />
      )}

      <UserPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleStartConversation}
        excludeUserIds={excludeUserIds}
      />
    </>
  );
}
