import React, { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { shareList } from '../utils/api';
import { sendDirectPayloadToRecipients, sendPayloadToConversation } from '../utils/directMessageDelivery';
import UserPickerDialog from './UserPickerDialog';

export default function ShareListButton({ list, className = '' }) {
  const { user } = useAuth();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sentResults, setSentResults] = useState(null);
  const [sending, setSending] = useState(false);

  const excludeUserIds = useMemo(() => [user?.id].filter(Boolean), [user?.id]);

  if (!user || !list) return null;

  const itemCount = Array.isArray(list.items) ? list.items.length : 0;

  const buildPayload = (sharedListId) => ({
    list_share: {
      sharedListId,
      listName: list.name,
      itemCount,
      ownerUsername: user.username || '',
    },
  });

  const handleSubmit = async (selectedUsers, selectedSquads) => {
    setSending(true);
    try {
      const users = Array.isArray(selectedUsers) ? selectedUsers : [];
      const squads = Array.isArray(selectedSquads) ? selectedSquads : [];

      // For direct users — send DM first to get conversationId, then register share
      if (users.length > 0) {
        // First create shared list record (no conversation for direct)
        const shareRes = await shareList(list.id, '');
        const sharedListId = shareRes?.sharedList?.id;
        if (sharedListId) {
          await sendDirectPayloadToRecipients(users, buildPayload(sharedListId));
        }
      }

      // For squads — register share with conversationId, then send DM
      for (const squad of squads) {
        const convId = String(squad?.id || '').trim();
        const shareRes = await shareList(list.id, convId);
        const sharedListId = shareRes?.sharedList?.id;
        if (sharedListId) {
          await sendPayloadToConversation(squad, buildPayload(sharedListId));
        }
      }

      setSentResults({ users, squads });
    } catch (err) {
      console.error('Share list error:', err);
    } finally {
      setSending(false);
    }
  };

  const handleSelect = async (selectedUser) => {
    setSending(true);
    try {
      const shareRes = await shareList(list.id, '');
      const sharedListId = shareRes?.sharedList?.id;
      if (sharedListId) {
        await sendDirectPayloadToRecipients([selectedUser], buildPayload(sharedListId));
      }
      setSentResults({ users: [selectedUser], squads: [] });
    } catch (err) {
      console.error('Share list error:', err);
    } finally {
      setSending(false);
    }
  };

  const handleSelectConversation = async (conversation) => {
    setSending(true);
    try {
      const convId = String(conversation?.id || '').trim();
      const shareRes = await shareList(list.id, convId);
      const sharedListId = shareRes?.sharedList?.id;
      if (sharedListId) {
        await sendPayloadToConversation(conversation, buildPayload(sharedListId));
      }
      setSentResults({ users: [], squads: [conversation] });
    } catch (err) {
      console.error('Share list error:', err);
    } finally {
      setSending(false);
    }
  };

  const resetPicker = () => {
    setPickerOpen(false);
    setSentResults(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className={`text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors ${className}`.trim()}
        title="Share this list"
        disabled={sending}
      >
        Share
      </button>

      <UserPickerDialog
        open={pickerOpen}
        title="Share list"
        description={`Share "${list.name}" (${itemCount} song${itemCount !== 1 ? 's' : ''})`}
        eyebrowLabel="Share to"
        selectLabel="Share"
        submitLabel="Share"
        searchPlaceholder="Search players or squads"
        onClose={resetPicker}
        onSelect={handleSelect}
        onSelectConversation={handleSelectConversation}
        onSubmit={handleSubmit}
        excludeUserIds={excludeUserIds}
        multiSelect
        showSquads
        sentResults={sentResults}
      />
    </>
  );
}
