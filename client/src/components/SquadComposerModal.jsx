import React, { useEffect, useMemo, useState } from 'react';
import AvatarPicker, { getAvatarUrl } from './AvatarPicker';
import UserPickerDialog from './UserPickerDialog';

function getInitial(value) {
  const text = String(value || '').trim();
  return text ? text.slice(0, 1).toUpperCase() : 'S';
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

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setAvatar('');
    setMembers([]);
    setPickerOpen(false);
    setError('');
  }, [open]);

  const excludeUserIds = useMemo(
    () => [currentUserId, ...members.map((member) => member?.id)].filter(Boolean),
    [currentUserId, members]
  );

  if (!open) return null;

  const handleSubmit = async () => {
    if (submitting) return;
    if (!String(title || '').trim()) {
      setError('Pick a squad name first.');
      return;
    }
    if (members.length === 0) {
      setError('Add at least one player.');
      return;
    }

    setError('');
    try {
      await onSubmit?.({
        title: String(title || '').trim(),
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
      <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
        <div
          className="w-full max-w-2xl rounded-[1.8rem] border border-piu-border/70 bg-[#07111f] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.46)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-display font-bold uppercase tracking-[0.24em] text-cyan-200/70">Squads</p>
              <h2 className="mt-2 text-2xl font-display font-black text-white">Create a squad</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-gray-400">
                Build a group chat for your crew. You can promote moderators later from squad settings.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white transition-colors hover:border-cyan-300/30 hover:text-cyan-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-5">
              <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                <label className="block">
                  <p className="text-sm font-display font-black text-white">Squad name</p>
                  <input
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={60}
                    placeholder="Weekend lab, London crew, Arcade family..."
                    className="mt-3 w-full rounded-[1rem] border border-piu-border/60 bg-piu-dark/45 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-cyan-300/35 focus:outline-none"
                  />
                </label>
              </div>

              <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-display font-black text-white">Players</p>
                <p className="mt-1 text-xs leading-5 text-gray-400">
                  Add the players who should be in the squad from day one.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {members.length > 0 ? members.map((member) => (
                    <span
                      key={member.id}
                      className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1.5 text-xs text-cyan-50"
                    >
                      {member?.avatar ? (
                        <img src={getAvatarUrl(member.avatar)} alt="" className="h-6 w-6 rounded-full object-cover" />
                      ) : (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-emerald-500 font-display font-black text-[10px] text-white">
                          {getInitial(member?.username)}
                        </span>
                      )}
                      <span className="max-w-[8rem] truncate font-display font-bold">{member?.username || 'Player'}</span>
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
                    <div className="rounded-[1rem] border border-dashed border-white/10 px-4 py-4 text-sm text-gray-500">
                      No players added yet.
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-[1rem] border border-cyan-300/25 bg-cyan-500/10 px-3.5 py-2 text-sm font-display font-bold text-cyan-100 transition-colors hover:border-cyan-300/40 hover:text-white"
                >
                  <span className="text-base leading-none">+</span>
                  <span>Add player</span>
                </button>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-display font-black text-white">Avatar</p>
                <p className="mt-1 text-xs leading-5 text-gray-400">
                  Pick a PIU avatar or upload one for the squad.
                </p>
                <div className="mt-4">
                  <AvatarPicker value={avatar} onChange={setAvatar} size="md" />
                </div>
              </div>

              <div className="rounded-[1.4rem] border border-white/10 bg-gradient-to-br from-cyan-500/12 via-cyan-400/6 to-emerald-500/10 p-4">
                <p className="text-[11px] font-display font-bold uppercase tracking-[0.22em] text-cyan-100/70">Preview</p>
                <div className="mt-3 flex items-center gap-3 rounded-[1.2rem] border border-white/10 bg-[#04111d]/75 px-3 py-3">
                  {avatar ? (
                    <img src={getAvatarUrl(avatar)} alt="" className="h-14 w-14 rounded-[1rem] object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-[1rem] bg-gradient-to-br from-cyan-500 to-emerald-500 font-display font-black text-lg text-white">
                      {getInitial(title)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-base font-display font-black text-white">
                      {String(title || '').trim() || 'Untitled squad'}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      {members.length + 1} {members.length + 1 === 1 ? 'member' : 'members'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {error ? (
            <p className="mt-4 text-sm text-red-300">{error}</p>
          ) : null}

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[1rem] border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-display font-bold text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-[1rem] border border-cyan-300/30 bg-cyan-500/15 px-4 py-2.5 text-sm font-display font-black text-cyan-50 transition-colors hover:border-cyan-200/45 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Creating...' : 'Create squad'}
            </button>
          </div>
        </div>
      </div>

      <UserPickerDialog
        open={pickerOpen}
        title="Add squad player"
        selectLabel="Add"
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelectMember}
        excludeUserIds={excludeUserIds}
      />
    </>
  );
}
