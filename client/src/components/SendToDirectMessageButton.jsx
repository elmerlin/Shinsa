import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getOrCreateDirectConversation } from '../utils/api';
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
  const iconToneClassName = tone === 'amber'
    ? 'text-amber-200 hover:bg-amber-500/10 hover:text-amber-100'
    : 'text-gray-400 hover:bg-piu-dark/50 hover:text-white';
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
      <button
        type="button"
        onClick={() => {
          setPickerOpen(true);
        }}
        className={
          isIcon
            ? `flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-display font-bold transition-colors ${iconToneClassName} ${className}`.trim()
            : `rounded-md border px-3 py-1.5 text-[11px] font-display font-bold transition-colors hover:text-white ${toneClassName} ${className}`.trim()
        }
        aria-label={title}
        title={title}
      >
        {isIcon ? (
          <>
            {tone === 'amber' ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 4v5c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V7l7-4z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 12.5l1.7 1.7 3.8-4.2" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h6m-9 8l-3-3V6a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H7l-4 3z" />
              </svg>
            )}
          </>
        ) : (
          label
        )}
      </button>

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
