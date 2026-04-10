import React, { useEffect, useRef, useState } from 'react';
import { getPublicPet, reactToPet } from '../utils/api';
import PublicPetShowcaseCard from './pet/PublicPetShowcaseCard';

/**
 * Public pet modal — shown when clicking a user's pet avatar.
 * Non-owners see: pet sprite, speech bubble, hunger/happiness meters, weight state.
 * No wallet/inventory info is shown to visitors.
 */

export default function PetModal({ userId, onClose }) {
  const [pet, setPet] = useState(null);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [reacting, setReacting] = useState('');
  const [reacted, setReacted] = useState({});
  const [floatingEmoji, setFloatingEmoji] = useState(null);   // { id, emoji, x }
  const [confirmText, setConfirmText] = useState('');
  const [petReaction, setPetReaction] = useState('');           // triggers SpritePet reaction
  let floatIdRef = useRef(0);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    getPublicPet(userId)
      .then(res => { setPet(res.pet); setUsername(res.username || ''); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  if (!userId) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-gray-950 border border-white/[0.08] rounded-2xl max-w-xs w-full overflow-hidden shadow-2xl animate-[modalIn_200ms_ease-out]"
        onClick={e => e.stopPropagation()}>

        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Loading...</div>
        ) : !pet ? (
          <div className="p-8 text-center">
            <p className="text-gray-500 text-sm">No pet found</p>
          </div>
        ) : (
          <>
            <div className="p-4">
              <PublicPetShowcaseCard pet={pet} username={username} reaction={petReaction} />

              <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                {pet.bond_rank?.label ? (
                  <span className="rounded-full border border-cyan-400/15 bg-cyan-500/[0.06] px-2 py-0.5 text-[9px] font-semibold text-cyan-200">{pet.bond_rank.label}</span>
                ) : null}
                {pet.form?.label ? (
                  <span className="rounded-full border border-white/[0.08] bg-black/30 px-2 py-0.5 text-[9px] font-semibold text-gray-300">{pet.form.label}</span>
                ) : null}
                {pet.identity_title ? (
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[9px] font-semibold text-gray-300">{pet.identity_title}</span>
                ) : null}
              </div>

              {/* Social reactions */}
              <div className="mt-3 relative">
                <div className="flex items-center justify-center gap-2">
                  {['cheer', 'wow', 'flex', 'heart'].map((type, i) => {
                    const icons = { cheer: '📣', wow: '🤩', flex: '💪', heart: '💗' };
                    const labels = { cheer: 'Cheer', wow: 'Wow', flex: 'Flex', heart: 'Love' };
                    const done = reacted[type];
                    return (
                      <button
                        key={type}
                        onClick={async () => {
                          if (done || reacting) return;
                          setReacting(type);
                          try {
                            const res = await reactToPet(userId, type);
                            setReacted(prev => ({ ...prev, [type]: true }));
                            // Floating emoji burst
                            const fid = ++floatIdRef.current;
                            setFloatingEmoji({ id: fid, emoji: icons[type] });
                            setTimeout(() => setFloatingEmoji(prev => prev?.id === fid ? null : prev), 900);
                            // Pet reacts
                            setPetReaction('happy');
                            setTimeout(() => setPetReaction(''), 1200);
                            // Confirmation text
                            setConfirmText(res.label || `${labels[type]}ed!`);
                            setTimeout(() => setConfirmText(''), 2500);
                          } catch (err) {
                            if (err?.message?.includes('Already')) {
                              setReacted(prev => ({ ...prev, [type]: true }));
                              setConfirmText('Already sent today');
                              setTimeout(() => setConfirmText(''), 2000);
                            }
                          }
                          setReacting('');
                        }}
                        disabled={!!done || !!reacting}
                        className={`group flex flex-col items-center gap-0.5 rounded-xl border px-2.5 py-1.5 text-sm transition-all ${
                          done
                            ? 'border-amber-400/20 bg-amber-400/10 scale-95'
                            : reacting === type
                              ? 'border-white/15 bg-white/[0.08] scale-110'
                              : 'border-white/[0.06] bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.06] active:scale-110'
                        } disabled:opacity-50`}
                      >
                        <span className={`text-base transition-transform ${reacting === type ? 'animate-[reactionPop_300ms_ease-out]' : ''}`}>{icons[type]}</span>
                        <span className="text-[8px] text-gray-500 font-medium">{labels[type]}</span>
                      </button>
                    );
                  })}
                </div>
                {/* Floating emoji */}
                {floatingEmoji && (
                  <div key={floatingEmoji.id} className="absolute left-1/2 -translate-x-1/2 bottom-full pointer-events-none animate-[emojiFloat_800ms_ease-out_forwards] text-2xl">
                    {floatingEmoji.emoji}
                  </div>
                )}
                {/* Confirmation text */}
                {confirmText && (
                  <div className="mt-1.5 text-center text-[10px] text-amber-200/80 font-medium animate-[fadeInUp_200ms_ease-out]">
                    {confirmText}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Close */}
        <button onClick={onClose}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/[0.06] text-gray-400 hover:text-white flex items-center justify-center text-sm transition-colors">
          &times;
        </button>

        <style>{`
          @keyframes modalIn { from { opacity: 0; transform: scale(0.95) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
          @keyframes emojiFloat { 0% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } 100% { opacity: 0; transform: translateX(-50%) translateY(-48px) scale(1.5); } }
          @keyframes reactionPop { 0% { transform: scale(1); } 40% { transform: scale(1.4); } 100% { transform: scale(1); } }
          @keyframes fadeInUp { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>
      </div>
    </div>
  );
}
