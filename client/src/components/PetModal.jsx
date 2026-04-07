import React, { useEffect, useState } from 'react';
import { getPublicPet } from '../utils/api';
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

              {/* Stats */}
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="text-sm font-bold text-white/80">{pet.total_songs_fed}</div>
                  <div className="text-[9px] text-gray-500">Songs</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-white/80 capitalize">{pet.mood}</div>
                  <div className="text-[9px] text-gray-500">Mood</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-white/80">{pet.experience?.toLocaleString() || 0}</div>
                  <div className="text-[9px] text-gray-500">XP</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-white/80">{pet.mastery?.rank?.label || 'Rookie'}</div>
                  <div className="text-[9px] text-gray-500">Mastery</div>
                </div>
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
