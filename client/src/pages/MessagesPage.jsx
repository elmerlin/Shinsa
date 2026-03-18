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
  buildClearChallengeCard,
  buildUpscoreChallengeCard,
} from '../utils/directMessageShares';
import { getProfilePath } from '../utils/profile';
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
    return 'Score challenge';
  }
  if (message.message_type === 'challenge_card' && message.challenge_card?.kind === 'clear_chart') {
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

function MessageLinkCard({ linkShare, compareAction = null, compareLoading = false, responseStatus = null }) {
  if (!linkShare) return null;

  const title = String(linkShare.title || '').trim() || 'Open link';
  const subtitle = String(linkShare.subtitle || '').trim();
  const badge = LINK_SHARE_BADGES[linkShare.kind] || 'Link';
  const buttonLabel = String(linkShare.buttonLabel || '').trim() || 'Open';
  const isCompare = linkShare.kind === 'chart_compare';
  const frameClass = isCompare
    ? 'border-emerald-400/30 bg-emerald-500/10'
    : 'border-piu-border/50 bg-piu-dark/45';
  const badgeClass = isCompare ? 'text-emerald-200/90' : 'text-cyan-200/80';
  const buttonClass = isCompare
    ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100 hover:text-white'
    : 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100 hover:text-white';
  const compareButtonLabel = responseStatus ? 'Send updated best' : 'Reply with my best';

  return (
    <div className={`rounded-xl border px-3 py-3 ${frameClass}`}>
      <p className={`text-[10px] font-display font-bold uppercase tracking-[0.2em] ${badgeClass}`}>{badge}</p>
      <p className="mt-1 text-sm font-display font-black text-white">{title}</p>
      {subtitle ? <p className="mt-1 text-xs text-gray-400">{subtitle}</p> : null}
      {isCompare && linkShare.statusLabel ? (
        <div className="mt-3">
          <CompareStatusPill statusKind={linkShare.statusKind} statusLabel={linkShare.statusLabel} />
        </div>
      ) : null}
      {!isCompare && responseStatus ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CompareStatusPill
            statusKind={responseStatus.statusKind}
            statusLabel={responseStatus.statusLabel}
            prefix={responseStatus.senderName ? `Latest reply from ${responseStatus.senderName}` : 'Latest reply'}
          />
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {linkShare.path ? (
          <Link
            to={linkShare.path}
            className={`inline-flex rounded-md border px-3 py-1.5 text-[11px] font-display font-bold transition-colors ${buttonClass}`}
          >
            {buttonLabel}
          </Link>
        ) : (
          <a
            href={linkShare.url}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex rounded-md border px-3 py-1.5 text-[11px] font-display font-bold transition-colors ${buttonClass}`}
          >
            {buttonLabel}
          </a>
        )}
        {compareAction ? (
          <button
            type="button"
            onClick={compareAction}
            disabled={compareLoading}
            className="inline-flex rounded-md border border-emerald-300/35 bg-emerald-500/15 px-3 py-1.5 text-[11px] font-display font-bold text-emerald-100 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {compareLoading ? 'Sending...' : compareButtonLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MessageChallengeCard({ challengeCard, compareAction = null, compareLoading = false, responseStatus = null }) {
  if (!challengeCard) return null;

  const badge = CHALLENGE_BADGES[challengeCard.kind] || 'Challenge';
  const title = String(challengeCard.title || '').trim() || badge;
  const subtitle = String(challengeCard.subtitle || '').trim();
  const targetLabel = String(challengeCard.targetLabel || '').trim();
  const detailLabel = String(challengeCard.detailLabel || '').trim();
  const buttonLabel = String(challengeCard.buttonLabel || '').trim() || 'Open challenge';
  const compareButtonLabel = responseStatus ? 'Send updated best' : 'Reply with my best';

  return (
    <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-3">
      <p className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-amber-200/90">{badge}</p>
      <p className="mt-1 text-sm font-display font-black text-white">{title}</p>
      {subtitle ? <p className="mt-1 text-xs text-gray-300">{subtitle}</p> : null}
      {targetLabel ? (
        <p className="mt-3 inline-flex rounded-md border border-amber-300/25 bg-black/15 px-2.5 py-1 text-[11px] font-display font-bold text-amber-100">
          {targetLabel}
        </p>
      ) : null}
      {detailLabel ? <p className="mt-2 text-xs text-amber-100/80">{detailLabel}</p> : null}
      {responseStatus ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CompareStatusPill
            statusKind={responseStatus.statusKind}
            statusLabel={responseStatus.statusLabel}
            prefix={responseStatus.senderName ? `Latest reply from ${responseStatus.senderName}` : 'Latest reply'}
          />
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          to={challengeCard.path}
          className="inline-flex rounded-md border border-amber-300/30 bg-amber-400/15 px-3 py-1.5 text-[11px] font-display font-bold text-amber-100 transition-colors hover:text-white"
        >
          {buttonLabel}
        </Link>
        {compareAction ? (
          <button
            type="button"
            onClick={compareAction}
            disabled={compareLoading}
            className="inline-flex rounded-md border border-emerald-300/35 bg-emerald-500/15 px-3 py-1.5 text-[11px] font-display font-bold text-emerald-100 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {compareLoading ? 'Sending...' : compareButtonLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MessageBubble({ message, onReplyWithBest = null, compareLoading = false, responseStatus = null }) {
  const isOwn = !!message?.is_own;
  const alignmentClass = isOwn ? 'items-end' : 'items-start';
  const bubbleTone = isOwn
    ? 'border-cyan-400/30 bg-cyan-500/10'
    : 'border-piu-border/60 bg-piu-dark/60';
  const senderName = message?.sender?.username || 'Unknown';
  const shareLabel = getMessageLabel(message);

  return (
    <div className={`flex flex-col ${alignmentClass}`}>
      {!isOwn ? (
        <p className="mb-1 px-1 text-[10px] font-display font-bold uppercase tracking-[0.18em] text-gray-500">
          {senderName}
        </p>
      ) : null}
      <div className={`max-w-full rounded-2xl border ${bubbleTone} px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.18)]`}>
        {message?.content ? (
          <p className="whitespace-pre-wrap break-words text-sm text-gray-100">{message.content}</p>
        ) : null}
        {message?.share ? (
          <div className={message?.content ? 'mt-3' : ''}>
            {shareLabel ? (
              <p className="mb-2 text-[10px] font-display font-bold uppercase tracking-[0.2em] text-cyan-200/80">
                {shareLabel}
              </p>
            ) : null}
            <SessionShareCard share={message.share} />
          </div>
        ) : null}
        {message?.link_share ? (
          <div className={message?.content || message?.share ? 'mt-3' : ''}>
            {shareLabel ? (
              <p className="mb-2 text-[10px] font-display font-bold uppercase tracking-[0.2em] text-cyan-200/80">
                {shareLabel}
              </p>
            ) : null}
            <MessageLinkCard
              linkShare={message.link_share}
              compareAction={onReplyWithBest}
              compareLoading={compareLoading}
              responseStatus={responseStatus}
            />
          </div>
        ) : null}
        {message?.challenge_card ? (
          <div className={message?.content || message?.share || message?.link_share ? 'mt-3' : ''}>
            {shareLabel ? (
              <p className="mb-2 text-[10px] font-display font-bold uppercase tracking-[0.2em] text-cyan-200/80">
                {shareLabel}
              </p>
            ) : null}
            <MessageChallengeCard
              challengeCard={message.challenge_card}
              compareAction={onReplyWithBest}
              compareLoading={compareLoading}
              responseStatus={responseStatus}
            />
          </div>
        ) : null}
      </div>
      <p className="mt-1 px-1 text-[10px] text-gray-500">{formatConversationTime(message?.created_at)}</p>
    </div>
  );
}

function ConversationRow({ conversation }) {
  const partner = conversation?.partner;

  return (
    <Link
      to={`/messages/${conversation.id}`}
      className="flex items-center gap-3 border-b border-piu-border/20 px-4 py-3 transition-colors hover:bg-piu-dark/35"
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
          {conversation?.last_message?.preview || 'Open conversation'}
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4 sm:py-6">
      <section className="card min-h-[16rem] overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b border-piu-border/50 px-4 py-3">
          <div>
            <p className="text-[10px] font-display font-bold uppercase tracking-[0.24em] text-cyan-300">Inbox</p>
            <h1 className="mt-1 text-lg font-display font-black text-white">Direct Messages</h1>
          </div>
          <button
            type="button"
            onClick={onStartChat}
            className="rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-3 py-1.5 text-xs font-display font-bold text-cyan-100 transition-colors hover:text-white"
          >
            New chat
          </button>
        </div>

        <div className="max-h-[calc(100vh-13rem)] overflow-y-auto">
          {loadingConversations ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">Loading conversations...</div>
          ) : conversations.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-gray-400">No conversations yet.</p>
              <p className="mt-1 text-xs text-gray-500">Start one from here, from a profile, or by sending a play into DM.</p>
              <button
                type="button"
                onClick={onStartChat}
                className="mt-4 rounded-xl border border-cyan-400/35 bg-cyan-500/10 px-4 py-2 text-sm font-display font-bold text-cyan-100 transition-colors hover:text-white"
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
  latestCompareBySourceId,
  messagesEndRef,
  draft,
  onDraftChange,
  onComposerKeyDown,
  onSend,
  onReplyWithBest,
  canReplyWithBest,
  replyingMessageId,
  sending,
}) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-4 sm:py-6">
      <section className="card flex min-h-[40rem] flex-col overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b border-piu-border/50 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/messages"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-piu-border/60 bg-piu-dark/70 text-lg text-gray-300 transition-colors hover:text-white"
              aria-label="Back to inbox"
            >
              ←
            </Link>
            <div className="min-w-0">
              <p className="text-[10px] font-display font-bold uppercase tracking-[0.22em] text-cyan-300">Conversation</p>
              <h1 className="mt-1 truncate text-lg font-display font-black text-white">{activePartner?.username || 'Unknown player'}</h1>
            </div>
          </div>
          {activePartner?.id ? (
            <Link
              to={getProfilePath(activePartner.id, activePartner.username)}
              className="rounded-lg border border-piu-border/60 bg-piu-dark/70 px-3 py-1.5 text-xs font-display font-bold text-gray-300 transition-colors hover:text-white"
            >
              View profile
            </Link>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
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
            <div className="space-y-4">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onReplyWithBest={canReplyWithBest(message) ? () => onReplyWithBest(message) : null}
                  compareLoading={replyingMessageId === message.id}
                  responseStatus={latestCompareBySourceId?.[message.id] || null}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="border-t border-piu-border/50 bg-piu-dark/30 px-4 py-3">
          {actionError ? <p className="mb-3 text-sm text-red-300">{actionError}</p> : null}
          <div className="flex items-end gap-3">
            <textarea
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={onComposerKeyDown}
              rows={3}
              maxLength={4000}
              placeholder={`Message ${activePartner?.username || 'player'}...`}
              className="input-field min-h-[5.25rem] flex-1 resize-none"
              disabled={sending || !activeConversation}
            />
            <button
              type="button"
              onClick={onSend}
              disabled={sending || !draft.trim() || !activeConversation}
              className="rounded-xl bg-cyan-500 px-4 py-3 text-sm font-display font-black text-white transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
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

  const canReplyWithBest = useCallback((message) => {
    if (!message || message.is_own) return false;
    if (message.message_type === 'challenge_card' && message.challenge_card) {
      return message.challenge_card.kind === 'beat_score' || message.challenge_card.kind === 'clear_chart';
    }
    if (message.message_type !== 'link_share') return false;
    return message.link_share?.kind === 'upscore' || message.link_share?.kind === 'clear';
  }, []);

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
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, conversationId]);

  const handleSend = async () => {
    if (!conversationId || sending) return;
    if (!draft.trim()) return;
    setActionError('');
    setSending(true);
    try {
      const payload = await sendConversationMessage(conversationId, { content: draft });
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
          latestCompareBySourceId={latestCompareBySourceId}
          messagesEndRef={messagesEndRef}
          draft={draft}
          onDraftChange={setDraft}
          onComposerKeyDown={handleComposerKeyDown}
          onSend={handleSend}
          onReplyWithBest={handleReplyWithBest}
          canReplyWithBest={canReplyWithBest}
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
