import { getOrCreateDirectConversation, sendConversationMessage } from './api';

export async function sendDirectPayloadToRecipients(recipients, payload = {}) {
  const users = Array.isArray(recipients) ? recipients.filter(Boolean) : [];
  if (users.length === 0) {
    throw new Error('Choose at least one player.');
  }

  const results = [];
  for (const user of users) {
    const userId = String(user?.id || '').trim();
    if (!userId) continue;

    const response = await getOrCreateDirectConversation(userId, payload || {});
    const conversationId = String(response?.conversation?.id || '').trim();
    if (!conversationId) {
      const username = String(user?.username || 'that player').trim() || 'that player';
      throw new Error(`Could not open a DM for ${username}.`);
    }

    results.push({
      user,
      conversationId,
      conversation: response?.conversation || null,
      message: response?.message || null,
    });
  }

  if (results.length === 0) {
    throw new Error('Choose at least one player.');
  }

  return {
    count: results.length,
    results,
    lastConversationId: results[results.length - 1]?.conversationId || '',
  };
}

export async function sendPayloadToConversation(conversation, payload = {}) {
  const conversationId = String(conversation?.id || '').trim();
  if (!conversationId) {
    throw new Error('No conversation selected.');
  }

  const data = { ...(payload || {}) };
  if (!data.content && !data.session_share && !data.challenge_card && !data.link_share && !data.list_share) {
    throw new Error('Nothing to send.');
  }

  const response = await sendConversationMessage(conversationId, data);
  return {
    count: 1,
    results: [{
      conversation,
      conversationId,
      message: response?.message || null,
    }],
    lastConversationId: conversationId,
  };
}
