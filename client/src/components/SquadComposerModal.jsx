import React, { useEffect, useMemo, useState } from 'react';
import AvatarPicker, { getAvatarUrl } from './AvatarPicker';
import UserPickerDialog from './UserPickerDialog';

const STEPS = [
  {
    id: 'name',
    label: 'Name',
    eyebrow: 'Step 1 of 3',
    title: 'Name your squad',
    description: 'Pick the name that will show at the top of the group chat.',
  },
  {
    id: 'players',
    label: 'Players',
    eyebrow: 'Step 2 of 3',
    title: 'Choose the starting players',
    description: 'Add the people who should be in the squad from day one.',
  },
  {
    id: 'avatar',
    label: 'Avatar',
    eyebrow: 'Step 3 of 3',
    title: 'Finish the look',
    description: 'Choose an avatar, then review the squad before you create it.',
  },
];

function getInitial(value) {
  const text = String(value || '').trim();
  return text ? text.slice(0, 1).toUpperCase() : 'S';
}

function getStepButtonClass(isActive, isComplete) {
  if (isActive) {
    return 'border-cyan-300/35 bg-cyan-400/12 text-white shadow-[0_18px_32px_rgba(12,72,96,0.22)]';
  }
  if (isComplete) {
    return 'border-white/12 bg-white/[0.06] text-cyan-100';
  }
  return 'border-white/10 bg-white/[0.03] text-gray-500';
}

export default function SquadComposerModal({
  open = false,
  currentUserId = '',
  submitting = false,
  onClose,
  onSubmit,
}) {
  const [title, setTitle] = useState('');
  const [avatar, setAvatar] = useState('');
  const [members, setMembers] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState('');
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setAvatar('');
    setMembers([]);
    setPickerOpen(false);
    setError('');
    setStepIndex(0);
  }, [open]);

  const excludeUserIds = useMemo(
    () => [currentUserId, ...members.map((member) => member?.id)].filter(Boolean),
    [currentUserId, members]
  );

  const trimmedTitle = String(title || '').trim();
  const previewTitle = trimmedTitle || 'Untitled squad';
  const totalMembers = members.length + 1;
  const currentStep = STEPS[stepIndex] || STEPS[0];

  if (!open) return null;

  const closeModal = () => {
    if (submitting) return;
    onClose?.();
  };

  const validateStep = (index) => {
    if (index === 0 && !trimmedTitle) {
      setError('Pick a squad name first.');
      return false;
    }
    if (index === 1 && members.length === 0) {
      setError('Add at least one player.');
      return false;
    }
    setError('');
    return true;
  };

  const handleNext = () => {
    if (!validateStep(stepIndex)) return;
    setStepIndex((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setError('');
    setStepIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (!validateStep(0) || !validateStep(1)) return;

    try {
      await onSubmit?.({
        title: trimmedTitle,
        avatar,
        memberIds: members.map((member) => member.id).filter(Boolean),
      });
    } catch (err) {
      setError(err?.message || 'Failed to create squad.');
    }
  };

  const handleSelectMember = async (selectedUser) => {
    if (!selectedUser?.id) return;
    setMembers((prev) => {
      if (prev.some((entry) => String(entry?.id || '') === String(selectedUser.id || ''))) {
        return prev;
      }
      return [...prev, selectedUser];
    });
    setPickerOpen(false);
  };

  return (
    <>
      <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm" onClick={closeModal}>
        <div
          className="flex w-full max-w-[36rem] flex-col overflow-hidden rounded-[1.9rem] border border-piu-border/70 bg-[#07111f] shadow-[0_36px_90px_rgba(0,0,0,0.54)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="border-b border-white/8 px-5 pb-5 pt-5 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-display font-bold uppercase tracking-[0.24em] text-cyan-200/70">Squads</p>
                <h2 className="mt-2 text-[1.85rem] font-display font-black leading-none text-white">Create a squad</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-gray-400">
                  {currentStep.description}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white transition-colors hover:border-cyan-300/30 hover:text-cyan-100"
                aria-label="Close squad creation"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              {STEPS.map((step, index) => {
                const isActive = stepIndex === index;
                const isComplete = stepIndex > index;
                return (
                  <div
                    key={step.id}
                    className={`rounded-[1.1rem] border px-3 py-3 transition-colors ${getStepButtonClass(isActive, isComplete)}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-display font-black ${
                        isActive
                          ? 'border-cyan-200/40 bg-cyan-300/12 text-cyan-50'
                          : isComplete
                            ? 'border-cyan-300/20 bg-cyan-400/10 text-cyan-100'
                            : 'border-white/10 bg-white/[0.04] text-gray-500'
                      }`}
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[10px] font-display font-bold uppercase tracking-[0.18em] text-current/70">{step.eyebrow}</p>
                        <p className="truncate text-sm font-display font-black text-current">{step.label}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="max-h-[calc(100vh-13rem)] overflow-y-auto px-5 py-5 sm:px-6">
            {stepIndex === 0 ? (
              <div className="space-y-4">
                <div className="rounded-[1.45rem] border border-white/10 bg-white/[0.04] p-4 sm:p-5">
                  <p className="text-[11px] font-display font-bold uppercase tracking-[0.22em] text-cyan-100/65">
                    {currentStep.eyebrow}
                  </p>
                  <h3 className="mt-2 text-xl font-display font-black text-white">{currentStep.title}</h3>
                  <label className="mt-4 block">
                    <span className="text-sm font-display font-black text-white">Squad name</span>
                    <input
                      type="text"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      maxLength={60}
                      placeholder="Weekend lab, London crew, Arcade family..."
                      className="mt-3 w-full rounded-[1.1rem] border border-piu-border/60 bg-piu-dark/45 px-4 py-3.5 text-base text-white placeholder:text-gray-500 focus:border-cyan-300/35 focus:outline-none"
                    />
                  </label>
                  <p className="mt-2 text-xs text-gray-500">
                    Keep it short and easy to recognize in the inbox.
                  </p>
                </div>

                <div className="rounded-[1.45rem] border border-cyan-400/14 bg-[linear-gradient(180deg,rgba(42,85,113,0.18),rgba(7,17,31,0.12))] p-4 sm:p-5">
                  <p className="text-[11px] font-display font-bold uppercase tracking-[0.22em] text-cyan-100/65">Live preview</p>
                  <div className="mt-3 flex items-center gap-3 rounded-[1.2rem] border border-white/8 bg-[#07131f]/88 px-3.5 py-3.5">
                    {avatar ? (
                      <img src={getAvatarUrl(avatar)} alt="" className="h-14 w-14 rounded-[1rem] object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-[1rem] bg-gradient-to-br from-cyan-500 to-emerald-500 font-display font-black text-lg text-white">
                        {getInitial(previewTitle)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-base font-display font-black text-white">{previewTitle}</p>
                      <p className="mt-1 text-xs text-gray-400">You and your crew will see this in chat.</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {stepIndex === 1 ? (
              <div className="space-y-4">
                <div className="rounded-[1.45rem] border border-white/10 bg-white/[0.04] p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-display font-bold uppercase tracking-[0.22em] text-cyan-100/65">
                        {currentStep.eyebrow}
                      </p>
                      <h3 className="mt-2 text-xl font-display font-black text-white">{currentStep.title}</h3>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-display font-bold uppercase tracking-[0.18em] text-cyan-50/80">
                      {members.length} added
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {members.length > 0 ? members.map((member) => (
                      <span
                        key={member.id}
                        className="inline-flex items-center gap-2 rounded-full border border-cyan-300/18 bg-cyan-400/[0.08] px-2.5 py-1.5 text-xs text-cyan-50"
                      >
                        {member?.avatar ? (
                          <img src={getAvatarUrl(member.avatar)} alt="" className="h-6 w-6 rounded-full object-cover" />
                        ) : (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-emerald-500 font-display font-black text-[10px] text-white">
                            {getInitial(member?.username)}
                          </span>
                        )}
                        <span className="max-w-[9rem] truncate font-display font-bold">{member?.username || 'Player'}</span>
                        <button
                          type="button"
                          onClick={() => setMembers((prev) => prev.filter((entry) => entry.id !== member.id))}
                          className="text-cyan-100/80 transition-colors hover:text-white"
                          aria-label={`Remove ${member?.username || 'player'}`}
                        >
                          ×
                        </button>
                      </span>
                    )) : (
                      <div className="w-full rounded-[1.15rem] border border-dashed border-white/10 bg-black/10 px-4 py-5 text-sm text-gray-500">
                        No players added yet.
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="mt-4 inline-flex items-center gap-2 rounded-[1rem] border border-cyan-300/25 bg-cyan-500/10 px-3.5 py-2.5 text-sm font-display font-bold text-cyan-100 transition-colors hover:border-cyan-300/40 hover:text-white"
                  >
                    <span className="text-base leading-none">+</span>
                    <span>Add player</span>
                  </button>
                </div>

                <div className="rounded-[1.45rem] border border-white/8 bg-[#081422] p-4 sm:p-5">
                  <p className="text-[11px] font-display font-bold uppercase tracking-[0.22em] text-cyan-100/65">Squad so far</p>
                  <div className="mt-3 flex items-center gap-3 rounded-[1.2rem] border border-white/8 bg-black/15 px-3.5 py-3.5">
                    {avatar ? (
                      <img src={getAvatarUrl(avatar)} alt="" className="h-14 w-14 rounded-[1rem] object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-[1rem] bg-gradient-to-br from-cyan-500 to-emerald-500 font-display font-black text-lg text-white">
                        {getInitial(previewTitle)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-base font-display font-black text-white">{previewTitle}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        {totalMembers} {totalMembers === 1 ? 'member' : 'members'} including you
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {stepIndex === 2 ? (
              <div className="space-y-4">
                <div className="rounded-[1.45rem] border border-white/10 bg-white/[0.04] p-4 sm:p-5">
                  <p className="text-[11px] font-display font-bold uppercase tracking-[0.22em] text-cyan-100/65">
                    {currentStep.eyebrow}
                  </p>
                  <h3 className="mt-2 text-xl font-display font-black text-white">{currentStep.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-400">
                    Upload a custom image or choose from the PIU set. You can always change this later in squad settings.
                  </p>
                  <div className="mt-4">
                    <AvatarPicker value={avatar} onChange={setAvatar} size="md" />
                  </div>
                </div>

                <div className="rounded-[1.45rem] border border-cyan-400/14 bg-[linear-gradient(160deg,rgba(26,48,66,0.58),rgba(7,17,31,0.88))] p-4 sm:p-5">
                  <p className="text-[11px] font-display font-bold uppercase tracking-[0.22em] text-cyan-100/65">Ready to create</p>
                  <div className="mt-3 rounded-[1.25rem] border border-white/8 bg-[#07131f]/88 p-4">
                    <div className="flex items-center gap-3">
                      {avatar ? (
                        <img src={getAvatarUrl(avatar)} alt="" className="h-16 w-16 rounded-[1.15rem] object-cover" />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded-[1.15rem] bg-gradient-to-br from-cyan-500 to-emerald-500 font-display font-black text-xl text-white">
                          {getInitial(previewTitle)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-lg font-display font-black text-white">{previewTitle}</p>
                        <p className="mt-1 text-sm text-gray-400">
                          {totalMembers} {totalMembers === 1 ? 'member' : 'members'} including you
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-[1rem] border border-white/8 bg-black/12 px-3.5 py-3">
                      <p className="text-[11px] font-display font-bold uppercase tracking-[0.18em] text-cyan-100/65">Starting players</p>
                      <p className="mt-2 text-sm leading-6 text-gray-300">
                        {members.length > 0
                          ? members.map((member) => member?.username || 'Player').join(', ')
                          : 'No players added yet.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="mt-4 text-sm text-red-300">{error}</p>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-white/8 px-5 py-4 sm:px-6">
            <div className="text-xs font-display font-bold uppercase tracking-[0.18em] text-gray-500">
              {currentStep.eyebrow}
            </div>
            <div className="flex items-center gap-3">
              {stepIndex > 0 ? (
                <button
                  type="button"
                  onClick={handleBack}
                  className="rounded-[1rem] border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-display font-bold text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
                >
                  Back
                </button>
              ) : (
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-[1rem] border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-display font-bold text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
                >
                  Cancel
                </button>
              )}

              {stepIndex < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="rounded-[1rem] border border-cyan-300/30 bg-cyan-500/15 px-4 py-2.5 text-sm font-display font-black text-cyan-50 transition-colors hover:border-cyan-200/45 hover:bg-cyan-500/20"
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="rounded-[1rem] border border-cyan-300/30 bg-cyan-500/15 px-4 py-2.5 text-sm font-display font-black text-cyan-50 transition-colors hover:border-cyan-200/45 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Creating...' : 'Create squad'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <UserPickerDialog
        open={pickerOpen}
        title="Add squad player"
        description="Search for a player to add to the squad."
        selectLabel="Add"
        eyebrowLabel="Squads"
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelectMember}
        excludeUserIds={excludeUserIds}
      />
    </>
  );
}
