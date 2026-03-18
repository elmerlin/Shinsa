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
  className = '',
  title = 'Send to a player',
  description = 'Choose a player to send this to.',
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
        className={`rounded-md border px-3 py-1.5 text-[11px] font-display font-bold transition-colors hover:text-white ${toneClassName} ${className}`.trim()}
      >
        {label}
      </button>

      <UserPickerDialog
        open={pickerOpen}
        title={title}
        description={description}
        onClose={() => {
          setPickerOpen(false);
        }}
        onSelect={handleSelect}
        excludeUserIds={excludeUserIds}
      />
    </>
  );
}
