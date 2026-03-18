import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  getMessageConversation,
  getMessageConversations,
  getOrCreateDirectConversation,
  sendConversationMessage,
} from '../utils/api';
import { getProfilePath } from '../utils/profile';
import SessionShareCard from '../components/SessionShareCard';
import UserPickerDialog from '../components/UserPickerDialog';

const LINK_SHARE_BADGES = {
  live_session: 'Live session',
  post: 'Post',
  upscore: 'Upscore',
  clear: 'Clear',
  hour_of_power: 'Hour of Power',
  link: 'Link',
};
const CHALLENGE_BADGES = {
  beat_score: 'Score Challenge',
  clear_chart: 'Clear Challenge',
};

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

function MessageLinkCard({ linkShare }) {
  if (!linkShare) return null;

  const title = String(linkShare.title || '').trim() || 'Open link';
  const subtitle = String(linkShare.subtitle || '').trim();
  const badge = LINK_SHARE_BADGES[linkShare.kind] || 'Link';
  const buttonLabel = String(linkShare.buttonLabel || '').trim() || 'Open';

  return (
    <div className="rounded-xl border border-piu-border/50 bg-piu-dark/45 px-3 py-3">
      <p className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-cyan-200/80">{badge}</p>
      <p className="mt-1 text-sm font-display font-black text-white">{title}</p>
      {subtitle ? <p className="mt-1 text-xs text-gray-400">{subtitle}</p> : null}
      <div className="mt-3">
        {linkShare.path ? (
          <Link
            to={linkShare.path}
            className="inline-flex rounded-md border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-display font-bold text-cyan-100 transition-colors hover:text-white"
          >
            {buttonLabel}
          </Link>
        ) : (
          <a
            href={linkShare.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-md border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-display font-bold text-cyan-100 transition-colors hover:text-white"
          >
            {buttonLabel}
          </a>
        )}
      </div>
    </div>
  );
}

function MessageChallengeCard({ challengeCard }) {
  if (!challengeCard) return null;

  const badge = CHALLENGE_BADGES[challengeCard.kind] || 'Challenge';
  const title = String(challengeCard.title || '').trim() || badge;
  const subtitle = String(challengeCard.subtitle || '').trim();
  const targetLabel = String(challengeCard.targetLabel || '').trim();
  const detailLabel = String(challengeCard.detailLabel || '').trim();
  const buttonLabel = String(challengeCard.buttonLabel || '').trim() || 'Open challenge';

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
      <div className="mt-3">
        <Link
          to={challengeCard.path}
          className="inline-flex rounded-md border border-amber-300/30 bg-amber-400/15 px-3 py-1.5 text-[11px] font-display font-bold text-amber-100 transition-colors hover:text-white"
        >
          {buttonLabel}
        </Link>
      </div>
    </div>
  );
}

function MessageBubble({ message }) {
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
            <MessageLinkCard linkShare={message.link_share} />
          </div>
        ) : null}
        {message?.challenge_card ? (
          <div className={message?.content || message?.share || message?.link_share ? 'mt-3' : ''}>
            {shareLabel ? (
              <p className="mb-2 text-[10px] font-display font-bold uppercase tracking-[0.2em] text-cyan-200/80">
                {shareLabel}
              </p>
            ) : null}
            <MessageChallengeCard challengeCard={message.challenge_card} />
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
  messages,
  messagesEndRef,
  draft,
  onDraftChange,
  onComposerKeyDown,
  onSend,
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
                <MessageBubble key={message.id} message={message} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="border-t border-piu-border/50 bg-piu-dark/30 px-4 py-3">
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

  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [conversationError, setConversationError] = useState('');

  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageError, setMessageError] = useState('');

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const activePartner = activeConversation?.partner || null;
  const excludeUserIds = useMemo(() => [user?.id].filter(Boolean), [user?.id]);

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
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, conversationId]);

  const handleSend = async () => {
    if (!conversationId || sending) return;
    if (!draft.trim()) return;
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
      setMessageError(err?.message || 'Failed to send message.');
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
          messages={messages}
          messagesEndRef={messagesEndRef}
          draft={draft}
          onDraftChange={setDraft}
          onComposerKeyDown={handleComposerKeyDown}
          onSend={handleSend}
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
