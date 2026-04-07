import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getMyPet } from '../../utils/api';
import SpritePet from '../SpritePet';

const SPEECH_IDLE = [
  'Hey there!', "Let's play!", 'How are you?', 'Feed me?', "I'm here!",
  'Nice day!', 'Pet me!', 'Combo time!', "What's up?",
];
const SPEECH_HUNGRY = ["I'm hungry...", 'Feed me...', 'So empty...'];
const SPEECH_HAPPY = ["I'm great!", 'Love this!', 'Feeling good!'];

/**
 * FloatingPetCompanion — a Clippy-style pet that floats on every page.
 * Shows a small sprite in the bottom-right. Tap to expand a status card.
 * Hidden on the pet page itself and on chromeless routes.
 */
export default function FloatingPetCompanion() {
  const location = useLocation();
  const navigate = useNavigate();
  const [pet, setPet] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(() => localStorage.getItem('pet_clippy_hidden') === '1');
  const [speech, setSpeech] = useState('');
  const [showSpeech, setShowSpeech] = useState(false);
  const speechTimer = useRef(null);
  const refreshTimer = useRef(null);
  const mounted = useRef(true);

  // Don't show on pet page or chromeless routes
  const isPetPage = location.pathname === '/pet';
  const isChromeless = /\/(overlay|embed)/.test(location.pathname);

  const loadPet = useCallback(async () => {
    try {
      const res = await getMyPet();
      if (mounted.current) setPet(res.pet || null);
    } catch { /* no pet or not logged in */ }
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadPet();
    // Refresh every 3 minutes
    refreshTimer.current = setInterval(loadPet, 180000);
    return () => {
      mounted.current = false;
      clearInterval(refreshTimer.current);
    };
  }, [loadPet]);

  // Occasional speech bubble
  useEffect(() => {
    if (!pet || isPetPage || isChromeless || hidden) return;
    const speak = () => {
      const pool = pet.hunger < 30 ? SPEECH_HUNGRY : pet.mood === 'happy' ? SPEECH_HAPPY : SPEECH_IDLE;
      setSpeech(pool[Math.floor(Math.random() * pool.length)]);
      setShowSpeech(true);
      setTimeout(() => { if (mounted.current) setShowSpeech(false); }, 3500);
    };
    // First speech after 5s
    const initial = setTimeout(speak, 5000);
    // Then every 20-40s
    speechTimer.current = setInterval(speak, 20000 + Math.random() * 20000);
    return () => { clearTimeout(initial); clearInterval(speechTimer.current); };
  }, [pet, isPetPage, isChromeless, hidden]);

  // Close expanded card on route change
  useEffect(() => { setExpanded(false); }, [location.pathname]);

  if (!pet || isPetPage || isChromeless || hidden) return null;

  const hungryWarning = pet.hunger < 25;
  const lowEnergy = pet.energy < 20;

  return (
    <>
      {/* Floating pet sprite */}
      <div
        className="fixed z-[90] select-none"
        style={{ bottom: 72, right: 12 }}
      >
        {/* Speech bubble */}
        {showSpeech && !expanded && (
          <div className="absolute bottom-full right-0 mb-1 animate-[clippyFadeIn_200ms_ease-out]">
            <div className="relative bg-gray-950/95 border border-white/[0.1] rounded-xl px-2.5 py-1.5 text-[10px] text-gray-300 whitespace-nowrap shadow-lg backdrop-blur-sm">
              {speech}
              <div className="absolute -bottom-1 right-4 w-2 h-2 rotate-45 bg-gray-950/95 border-r border-b border-white/[0.1]" />
            </div>
          </div>
        )}

        {/* Vitals indicator dots */}
        {!expanded && (
          <div className="absolute -top-1 -left-1 flex gap-0.5">
            {hungryWarning && <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" title="Hungry" />}
            {lowEnergy && <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" title="Low energy" />}
          </div>
        )}

        {/* Pet sprite button */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="relative w-16 h-16 rounded-2xl border border-white/[0.08] bg-gray-950/80 backdrop-blur-sm shadow-[0_8px_24px_rgba(0,0,0,0.4)] flex items-center justify-center hover:border-white/15 active:scale-95 transition-all overflow-hidden group"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <SpritePet
            character={pet.character}
            weightState={pet.weight_state}
            mood={pet.mood}
            equippedHat={pet.equipped_hat}
            equippedTop={pet.equipped_top}
            hatColor={pet.hat_color}
            topColor={pet.top_color}
            size={52}
          />
        </button>

        {/* Expanded status card */}
        {expanded && (
          <div className="absolute bottom-full right-0 mb-2 w-56 animate-[clippyCardIn_200ms_ease-out]">
            <div className="bg-gray-950/95 border border-white/[0.08] rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-md overflow-hidden">
              {/* Header */}
              <div className="px-3 pt-2.5 pb-2 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white/90 truncate capitalize">{pet.character}</div>
                  <div className="text-[9px] text-gray-500">{pet.identity_title || pet.bond_rank?.label || 'Companion'}</div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setHidden(true); localStorage.setItem('pet_clippy_hidden', '1'); setExpanded(false); }}
                  className="text-[9px] text-gray-600 hover:text-gray-400 transition-colors"
                  title="Hide companion"
                >
                  hide
                </button>
              </div>

              {/* Vitals */}
              <div className="px-3 pb-2 space-y-1.5">
                <VitalBar label="Hunger" value={pet.hunger} color="orange" warn={hungryWarning} />
                <VitalBar label="Happy" value={pet.happiness} color="pink" />
                <VitalBar label="Energy" value={pet.energy} color="cyan" warn={lowEnergy} />
              </div>

              {/* Quick stats */}
              <div className="px-3 pb-2 flex items-center gap-3 text-[10px]">
                <span className="text-gray-500 capitalize">{pet.mood}</span>
                {pet.daily_streak > 0 && <span className="text-amber-300">{pet.daily_streak}d streak</span>}
                <span className="text-gray-600 tabular-nums">Bond {pet.bond || 0}</span>
              </div>

              {/* Coach hint */}
              {pet.companion_coach?.headline && (
                <div className="mx-3 mb-2 rounded-lg border border-cyan-500/10 bg-cyan-500/[0.04] px-2 py-1.5">
                  <p className="text-[10px] text-cyan-100/70 leading-tight">{pet.companion_coach.headline}</p>
                </div>
              )}

              {/* Action */}
              <div className="px-3 pb-3">
                <button
                  onClick={() => { setExpanded(false); navigate('/pet'); }}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] py-1.5 text-[10px] font-semibold text-gray-300 hover:text-white hover:border-white/15 transition-all"
                >
                  Open Pet Page
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Backdrop to close expanded card */}
      {expanded && (
        <div className="fixed inset-0 z-[89]" onClick={() => setExpanded(false)} />
      )}

      <style>{`
        @keyframes clippyFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes clippyCardIn { from { opacity: 0; transform: translateY(8px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @media (prefers-reduced-motion: reduce) {
          .animate-\\[clippyFadeIn_200ms_ease-out\\], .animate-\\[clippyCardIn_200ms_ease-out\\] { animation: none !important; }
        }
      `}</style>
    </>
  );
}

function VitalBar({ label, value, color, warn }) {
  const bg = color === 'orange' ? 'bg-orange-500' : color === 'pink' ? 'bg-pink-500' : 'bg-cyan-500';
  return (
    <div>
      <div className="flex items-center justify-between text-[9px] mb-0.5">
        <span className={`${warn ? 'text-orange-300' : 'text-gray-500'}`}>{label}</span>
        <span className="text-gray-600 tabular-nums">{value}%</span>
      </div>
      <div className="w-full h-1 bg-white/[0.04] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${bg} transition-all duration-500`} style={{ width: `${value}%`, opacity: 0.7 }} />
      </div>
    </div>
  );
}
