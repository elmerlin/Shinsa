import React, { useEffect, useState } from 'react';
import { getPublicPet, reactToPet } from '../utils/api';
import SpritePet from './SpritePet';

/**
 * Public pet modal — shown when clicking a user's pet avatar.
 * Non-owners see: pet sprite, speech bubble, hunger/happiness meters, weight state.
 * No wallet/inventory info is shown to visitors.
 */

const MOOD_MESSAGES = {
  desperate: "I'm so hungry...",
  hungry: 'I could use a snack...',
  happy: "I'm feeling great!",
  content: 'Life is good!',
  stuffed: 'So full!',
};

export default function PetModal({ userId, onClose }) {
  const [pet, setPet] = useState(null);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [reacting, setReacting] = useState('');
  const [reacted, setReacted] = useState({});

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
            {/* Pet display */}
            <div className="relative pt-6 pb-4 flex flex-col items-center bg-gradient-to-b from-white/[0.02] to-transparent">
              <SpritePet
                character={pet.character}
                weightState={pet.weight_state}
                mood={pet.mood}
                equippedHat={pet.equipped_hat}
                equippedBelt={pet.equipped_belt}
                equippedShoes={pet.equipped_shoes}
                equippedTop={pet.equipped_top}
                hatColor={pet.hat_color}
                beltColor={pet.belt_color}
                shoesColor={pet.shoes_color}
                topColor={pet.top_color}
                size={100}
              />
              {/* Speech */}
              <div className="mt-2 bg-white/[0.06] rounded-xl px-3 py-1.5 text-xs text-gray-300 italic text-center max-w-[200px]">
                &ldquo;{MOOD_MESSAGES[pet.mood] || 'Hello!'}&rdquo;
              </div>
            </div>

            {/* Info */}
            <div className="px-4 pb-4">
              <div className="text-center mb-3">
                <div className="text-sm font-bold text-white/90">{username ? `${username}'s` : ''} {capitalize(pet.character)}</div>
                <WeightBadge state={pet.weight_state} />
                <div className="mt-1 text-[10px] text-cyan-200/80">{pet.bond_rank?.label || 'Training Partner'}</div>
                <div className="text-[10px] text-white/75">{pet.identity_title || pet.mastery?.path?.label || pet.specialty?.label || 'Companion'}</div>
                {pet.form?.label ? <div className="text-[10px] text-gray-500 mt-0.5">{pet.form.label}</div> : null}
              </div>

              {/* Meters */}
              <div className="space-y-2">
                <MiniMeter label="Hunger" value={pet.hunger} color="orange" />
                <MiniMeter label="Happiness" value={pet.happiness} color="pink" />
              </div>

              {/* Identity badges */}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                {pet.bond_rank?.label && (
                  <span className="rounded-full border border-cyan-400/15 bg-cyan-500/[0.06] px-2 py-0.5 text-[9px] font-semibold text-cyan-200">{pet.bond_rank.label}</span>
                )}
                {pet.form?.label && (
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${
                    pet.form.id === 'beyond' ? 'border-purple-400/20 text-purple-300' :
                    pet.form.id === 'ascendant' ? 'border-amber-400/20 text-amber-300' :
                    pet.form.id === 'showcase' ? 'border-cyan-400/15 text-cyan-300' :
                    pet.form.id === 'trusted' ? 'border-emerald-400/15 text-emerald-300' :
                    'border-white/[0.08] text-gray-400'
                  } bg-black/30`}>{pet.form.label}</span>
                )}
                {pet.mastery?.rank?.label && (
                  <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 text-[9px] font-semibold text-gray-300">{pet.mastery.rank.label}</span>
                )}
              </div>

              {/* Stats */}
              <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="text-sm font-bold text-white/80">{pet.total_songs_fed}</div>
                  <div className="text-[9px] text-gray-500">Songs</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-white/80 capitalize">{pet.mood}</div>
                  <div className="text-[9px] text-gray-500">Mood</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-white/80">{pet.bond || 0}</div>
                  <div className="text-[9px] text-gray-500">Bond</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-white/80">{pet.daily_streak ? `${pet.daily_streak}d` : '—'}</div>
                  <div className="text-[9px] text-gray-500">Streak</div>
                </div>
              </div>

              {/* Memories */}
              {pet.memories?.length > 0 && (
                <div className="mt-3 space-y-1">
                  {pet.memories.slice(0, 3).map(m => (
                    <div key={m.id} className={`rounded-lg border px-2 py-1 text-[10px] ${
                      m.rarity === 'legendary' ? 'border-amber-400/20 bg-amber-500/[0.06] text-amber-200' :
                      m.rarity === 'rare' ? 'border-purple-400/15 bg-purple-500/[0.04] text-purple-200' :
                      'border-white/[0.05] bg-black/20 text-gray-400'
                    }`}>
                      <span className="font-semibold text-white/70">{m.title}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Social reactions */}
              <div className="mt-3 flex items-center justify-center gap-2">
                {['cheer', 'wow', 'flex', 'heart'].map(type => {
                  const icons = { cheer: '\u{1F4E3}', wow: '\u{1F929}', flex: '\u{1F4AA}', heart: '\u{1F497}' };
                  const done = reacted[type];
                  return (
                    <button
                      key={type}
                      onClick={async () => {
                        if (done || reacting) return;
                        setReacting(type);
                        try {
                          await reactToPet(userId, type);
                          setReacted(prev => ({ ...prev, [type]: true }));
                        } catch {}
                        setReacting('');
                      }}
                      disabled={!!done || !!reacting}
                      className={`rounded-lg border px-2 py-1.5 text-sm transition-all ${
                        done ? 'border-amber-400/20 bg-amber-400/10 opacity-70' : 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06]'
                      } disabled:opacity-50`}
                    >
                      {icons[type]}
                    </button>
                  );
                })}
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
        `}</style>
      </div>
    </div>
  );
}

function WeightBadge({ state }) {
  const s = { starving: 'text-red-400', thin: 'text-orange-400', normal: 'text-emerald-400', chubby: 'text-blue-400', fat: 'text-purple-400' };
  return <span className={`text-[10px] font-semibold uppercase tracking-wider ${s[state] || s.normal}`}>{state}</span>;
}

function MiniMeter({ label, value, color }) {
  const bg = color === 'pink' ? 'bg-pink-500' : 'bg-orange-500';
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] mb-0.5">
        <span className="text-gray-500">{label}</span>
        <span className="text-gray-600 tabular-nums">{value}%</span>
      </div>
      <div className="w-full h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${bg} transition-all duration-500`} style={{ width: `${value}%`, opacity: 0.7 }} />
      </div>
    </div>
  );
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
