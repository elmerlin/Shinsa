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
  challengeOptions = null,
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
  const [challengePickerOpen, setChallengePickerOpen] = useState(false);
  const [selectedChallengeCard, setSelectedChallengeCard] = useState(null);

  const excludeUserIds = useMemo(() => [user?.id].filter(Boolean), [user?.id]);
  const selectableChallengeOptions = useMemo(
    () => (Array.isArray(challengeOptions) ? challengeOptions.filter((option) => option?.challengeCard) : []),
    [challengeOptions],
  );
  const payload = useMemo(() => {
    if (messageData && typeof messageData === 'object') {
      return Object.keys(messageData).length > 0 ? messageData : null;
    }

    const nextPayload = {};
    const normalizedContent = String(content || '').trim();
    if (normalizedContent) nextPayload.content = normalizedContent;
    if (share) {
      nextPayload.session_share = share;
    } else if (selectedChallengeCard || challengeCard) {
      nextPayload.challenge_card = selectedChallengeCard || challengeCard;
    } else if (linkShare) {
      nextPayload.link_share = linkShare;
    }
    return Object.keys(nextPayload).length > 0 ? nextPayload : null;
  }, [challengeCard, content, linkShare, messageData, selectedChallengeCard, share]);

  if (!user || !payload) return null;

  const toneClassName = tone === 'amber'
    ? 'border-amber-400/30 bg-amber-500/10 text-amber-100'
    : 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100';
  const isIcon = variant === 'icon';
  const selectLabel = tone === 'amber' ? 'Challenge' : 'Send';

  const resetPickers = () => {
    setPickerOpen(false);
    setChallengePickerOpen(false);
    setSelectedChallengeCard(null);
  };

  const beginSendFlow = () => {
    if (selectableChallengeOptions.length > 0) {
      setChallengePickerOpen(true);
      return;
    }
    setSelectedChallengeCard(null);
    setPickerOpen(true);
  };

  const handleSelect = async (selectedUser) => {
    const response = await getOrCreateDirectConversation(selectedUser.id, payload);
    const conversationId = String(response?.conversation?.id || '').trim();
    if (!conversationId) {
      throw new Error('Failed to open conversation.');
    }
    resetPickers();
    if (navigateAfterSend) {
      navigate(`/messages/${conversationId}`);
    }
  };

  return (
    <>
      {isIcon ? (
        <ActionIconButton
          onClick={beginSendFlow}
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
          onClick={beginSendFlow}
          className={`rounded-md border px-3 py-1.5 text-[11px] font-display font-bold transition-colors hover:text-white ${toneClassName} ${className}`.trim()}
          aria-label={title}
          title={title}
        >
          {label}
        </button>
      )}

      {selectableChallengeOptions.length > 0 ? (
        <div className={challengePickerOpen ? 'block' : 'hidden'}>
          <div className="fixed inset-0 z-[85] bg-black/80 px-4 py-6 backdrop-blur-sm" onClick={resetPickers}>
            <div
              className="mx-auto w-full max-w-lg rounded-2xl border border-piu-border bg-piu-card shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 border-b border-piu-border/50 px-4 py-3">
                <div>
                  <p className="text-[10px] font-display font-bold uppercase tracking-[0.24em] text-amber-300">Challenge</p>
                  <h3 className="mt-1 text-lg font-display font-black text-white">Choose a chart</h3>
                </div>
                <button
                  type="button"
                  onClick={resetPickers}
                  className="rounded-md border border-piu-border/60 bg-piu-dark/70 px-3 py-1 text-xs font-display font-bold text-gray-300 transition-colors hover:text-white"
                >
                  Close
                </button>
              </div>

              <div className="max-h-[70vh] overflow-y-auto p-4">
                <p className="mb-3 text-sm text-gray-400">Pick the song from this post that you want to challenge someone on.</p>
                <div className="space-y-2">
                  {selectableChallengeOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setSelectedChallengeCard(option.challengeCard);
                        setChallengePickerOpen(false);
                        setPickerOpen(true);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-piu-border/50 bg-piu-dark/45 px-3 py-3 text-left transition-colors hover:border-amber-400/35 hover:bg-piu-dark/65"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-display font-black text-white">{option.title || 'Challenge chart'}</p>
                        <p className="mt-0.5 truncate text-xs text-gray-400">{option.subtitle || 'Choose this chart'}</p>
                      </div>
                      <span className="shrink-0 rounded-md border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-[0.18em] text-amber-100">
                        Select
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <UserPickerDialog
        open={pickerOpen}
        title={title}
        description={description}
        selectLabel={selectLabel}
        onClose={resetPickers}
        onSelect={handleSelect}
        excludeUserIds={excludeUserIds}
      />
    </>
  );
}
