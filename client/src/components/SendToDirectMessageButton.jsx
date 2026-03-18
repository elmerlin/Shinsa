import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getOrCreateDirectConversation } from '../utils/api';
import ActionIconButton from './ActionIconButton';
import UserPickerDialog from './UserPickerDialog';

export default function SendToDirectMessageButton({
  share,
  linkShare,
  challengeCard,
  messageData = null,
  content = '',
  label = 'Send to DM',
  tone = 'cyan',
  variant = 'button',
  className = '',
  title = 'Send to a player',
  description = '',
  navigateAfterSend = true,
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);

  const excludeUserIds = useMemo(() => [user?.id].filter(Boolean), [user?.id]);
  const payload = useMemo(() => {
    if (messageData && typeof messageData === 'object') {
      return Object.keys(messageData).length > 0 ? messageData : null;
    }

    const nextPayload = {};
    const normalizedContent = String(content || '').trim();
    if (normalizedContent) nextPayload.content = normalizedContent;
    if (share) {
      nextPayload.session_share = share;
    } else if (challengeCard) {
      nextPayload.challenge_card = challengeCard;
    } else if (linkShare) {
      nextPayload.link_share = linkShare;
    }
    return Object.keys(nextPayload).length > 0 ? nextPayload : null;
  }, [challengeCard, content, linkShare, messageData, share]);

  if (!user || !payload) return null;

  const toneClassName = tone === 'amber'
    ? 'border-amber-400/30 bg-amber-500/10 text-amber-100'
    : 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100';
  const isIcon = variant === 'icon';
  const selectLabel = tone === 'amber' ? 'Challenge' : 'Send';

  const handleSelect = async (selectedUser) => {
    const response = await getOrCreateDirectConversation(selectedUser.id, payload);
    const conversationId = String(response?.conversation?.id || '').trim();
    if (!conversationId) {
      throw new Error('Failed to open conversation.');
    }
    setPickerOpen(false);
    if (navigateAfterSend) {
      navigate(`/messages/${conversationId}`);
    }
  };

  return (
    <>
      {isIcon ? (
        <ActionIconButton
          onClick={() => {
            setPickerOpen(true);
          }}
          title={title}
          ariaLabel={title}
          tone={tone === 'amber' ? 'amber' : 'neutral'}
          className={className}
        >
          {tone === 'amber' ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 16v-2m6-6h2M4 12H2m14.243 4.243 1.414 1.414M6.343 6.343 4.93 4.93m11.313 0-1.414 1.413M6.343 17.657l-1.414 1.414" />
              <circle cx="12" cy="12" r="4.75" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.7 8.7 0 0 1-3.08-.56L3 21l1.64-5.76A8.46 8.46 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m9.5 11.5 2 2 4-4" />
            </svg>
          )}
        </ActionIconButton>
      ) : (
        <button
          type="button"
          onClick={() => {
            setPickerOpen(true);
          }}
          className={`rounded-md border px-3 py-1.5 text-[11px] font-display font-bold transition-colors hover:text-white ${toneClassName} ${className}`.trim()}
          aria-label={title}
          title={title}
        >
          {label}
        </button>
      )}

      <UserPickerDialog
        open={pickerOpen}
        title={title}
        description={description}
        selectLabel={selectLabel}
        onClose={() => {
          setPickerOpen(false);
        }}
        onSelect={handleSelect}
        excludeUserIds={excludeUserIds}
      />
    </>
  );
}
