import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getOrCreateDirectConversation } from '../utils/api';
import UserPickerDialog from './UserPickerDialog';

export default function SendToDirectMessageButton({
  share,
  label = 'Send to DM',
  className = '',
  title = 'Send to a player',
  description = 'Choose a player to send this recap to.',
  navigateAfterSend = true,
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);

  const excludeUserIds = useMemo(() => [user?.id].filter(Boolean), [user?.id]);

  if (!user || !share) return null;

  const handleSelect = async (selectedUser) => {
    const payload = await getOrCreateDirectConversation(selectedUser.id, {
      session_share: share,
    });
    const conversationId = String(payload?.conversation?.id || '').trim();
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
        className={`rounded-md border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-display font-bold text-cyan-100 transition-colors hover:text-white ${className}`.trim()}
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
