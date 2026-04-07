import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getMyPet } from '../../utils/api';
import SpritePet from '../SpritePet';

// ─── Idle speech pools ───────────────────────────────────────
const SPEECH_IDLE = [
  'Hey there!', "Let's play!", 'How are you?', 'Feed me?', "I'm here!",
  'Nice day!', 'Pet me!', 'Combo time!', "What's up?",
];
const SPEECH_HUNGRY = ["I'm hungry...", 'Feed me...', 'So empty...'];
const SPEECH_HAPPY = ["I'm great!", 'Love this!', 'Feeling good!'];

// ─── Pump reaction speech pools ──────────────────────────────
const PUMP_GENERIC = [
  'Nice pump!', 'Spread the love!', 'You pumped it! 🔥', 'That was fire!',
  'Pumping is caring!', 'Good vibes only!', 'Keep pumping!', 'Energy!',
  'The people approve!', 'Community moment!', 'You love to see it!',
  'Hype train! 🚂', 'Pump it up!', "That's the spirit!",
  'Good taste!', 'Respect ✊', 'The crowd goes wild!',
];

// Pump reactions that reference the post author — {name} is replaced
const PUMP_AUTHOR = [
  '{name} earned that pump!', 'Big ups for {name}!', '{name} is on fire!',
  'Showing {name} some love!', 'You and {name} — vibes!',
  '{name} will appreciate that!', "Let's go {name}!",
  '{name} is putting in work!', 'Respect to {name}!',
  '{name} just got pumped!', "That's {name} for you!",
  'Another one for {name}!', '{name} stays winning!',
  'Pump for {name}! 💪', '{name} needs to see this love!',
];

// Post-pump comment nudges
const COMMENT_NUDGE = [
  'Leave a comment too!', 'Say something nice?', 'Drop a comment!',
  'Words > silence!', 'They\'d love a comment!', 'Comment = extra love!',
  'A comment goes far!', 'Tell them how you feel!', 'Share your thoughts!',
  'Pumps are cool but comments hit different!', 'Type something!',
  'Comments make their day!', 'Don\'t be shy, comment!',
  'Pump ✓ Comment next?', 'One more step — comment!',
  'A comment would be 🔥', 'Words of encouragement?',
  "Wouldn't a comment be nice?", 'Let them know!', 'Say the thing!',
];

// ─── Hardcoded user-specific reactions ───────────────────────
const USER_REACTIONS = {
  afii: [
    'No back pain I hope!',
    'Vying for the best brown player!',
    'Mr. I see arrow, I hit, has done it again!',
    'He screamed like Moonearth to do this!',
    'Afii plays like his life depends on it!',
    'Back pain is temporary, SSS is forever!',
    'The Brown Baron strikes again!',
    'His chiropractor sends a thank-you note!',
    'Afii diff!',
    'Built different, plays different!',
  ],
  soft: [
    'Bad bitch 不 cry',
    'The twist queen is back in business!',
    'Anything less than SSS is a fail',
    'She obviously hates this game',
    'Reconsidering her life choices',
    'Queen of twists, ruler of pads!',
    'Another day, another slay!',
    'She makes it look easy!',
    'SSS or she\'s filing a complaint!',
    'Soft by name, ruthless by game!',
  ],
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Build a contextual pump speech line.
 * Priority: user-specific > author-aware > generic
 */
function buildPumpSpeech(detail) {
  const username = (detail?.username || '').toLowerCase().trim();
  const name = detail?.username || '';

  // 40% chance of user-specific joke if available
  if (username && USER_REACTIONS[username] && Math.random() < 0.4) {
    return pick(USER_REACTIONS[username]);
  }

  // 50% chance of author-aware line
  if (name && Math.random() < 0.5) {
    return pick(PUMP_AUTHOR).replace(/\{name\}/g, name);
  }

  return pick(PUMP_GENERIC);
}

/**
 * FloatingPetCompanion — a Clippy-style pet that floats on every page.
 * Shows a small sprite in the bottom-right. Tap to expand a status card.
 * Reacts contextually to feed actions (pumps, comments).
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
  const [petReaction, setPetReaction] = useState('');
  const speechTimer = useRef(null);
  const refreshTimer = useRef(null);
  const reactiveSpeechTimer = useRef(null);
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

  // Show a speech bubble for a duration, then hide it
  const showBubble = useCallback((text, duration = 3500) => {
    if (!mounted.current) return;
    setSpeech(text);
    setShowSpeech(true);
    // Clear any pending hide
    clearTimeout(reactiveSpeechTimer.current);
    reactiveSpeechTimer.current = setTimeout(() => {
      if (mounted.current) setShowSpeech(false);
    }, duration);
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadPet();
    // Refresh every 3 minutes
    refreshTimer.current = setInterval(loadPet, 180000);
    // Listen for toggle from PetPage
    const onToggle = () => {
      if (mounted.current) setHidden(localStorage.getItem('pet_clippy_hidden') === '1');
    };
    window.addEventListener('pet-clippy-toggle', onToggle);
    return () => {
      mounted.current = false;
      clearInterval(refreshTimer.current);
      window.removeEventListener('pet-clippy-toggle', onToggle);
    };
  }, [loadPet]);

  // ─── Reactive speech: respond to feed actions ───────────────
  useEffect(() => {
    if (!pet || isPetPage || isChromeless || hidden) return;

    let nudgeTimeout = null;

    const onFeedAction = (e) => {
      const detail = e.detail || {};
      if (detail.action === 'pump') {
        // Immediate pump reaction
        const line = buildPumpSpeech(detail);
        showBubble(line, 3200);

        // Trigger a happy sprite reaction
        setPetReaction('happy');
        setTimeout(() => { if (mounted.current) setPetReaction(''); }, 1200);

        // Follow up with a comment nudge after 4-6s
        clearTimeout(nudgeTimeout);
        nudgeTimeout = setTimeout(() => {
          if (mounted.current) {
            showBubble(pick(COMMENT_NUDGE), 3500);
          }
        }, 4000 + Math.random() * 2000);
      }
    };

    window.addEventListener('pet-feed-action', onFeedAction);
    return () => {
      window.removeEventListener('pet-feed-action', onFeedAction);
      clearTimeout(nudgeTimeout);
    };
  }, [pet, isPetPage, isChromeless, hidden, showBubble]);

  // ─── Idle speech (ambient chatter when nothing is happening) ─
  useEffect(() => {
    if (!pet || isPetPage || isChromeless || hidden) return;
    const speak = () => {
      // Don't interrupt reactive speech
      if (showSpeech) return;
      const pool = pet.hunger < 30 ? SPEECH_HUNGRY : pet.mood === 'happy' ? SPEECH_HAPPY : SPEECH_IDLE;
      showBubble(pick(pool), 3500);
    };
    // First idle speech after 8s (give reactive speech priority)
    const initial = setTimeout(speak, 8000);
    // Then every 25-45s
    speechTimer.current = setInterval(speak, 25000 + Math.random() * 20000);
    return () => { clearTimeout(initial); clearInterval(speechTimer.current); };
  }, [pet, isPetPage, isChromeless, hidden, showBubble, showSpeech]);

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
            <div className="relative bg-gray-950/95 border border-white/[0.1] rounded-xl px-2.5 py-1.5 text-[10px] text-gray-300 shadow-lg backdrop-blur-sm" style={{ maxWidth: 220, whiteSpace: 'normal', overflowWrap: 'break-word' }}>
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
          className="relative w-[72px] h-[72px] rounded-2xl border border-white/[0.08] bg-gray-950/80 backdrop-blur-sm shadow-[0_8px_24px_rgba(0,0,0,0.4)] flex items-end justify-center hover:border-white/15 active:scale-95 transition-all group"
          style={{ paddingBottom: 2 }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
          <SpritePet
            character={pet.character}
            weightState={pet.weight_state}
            mood={pet.mood}
            equippedHat={pet.equipped_hat}
            equippedTop={pet.equipped_top}
            hatColor={pet.hat_color}
            topColor={pet.top_color}
            size={56}
            reaction={petReaction}
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
                  onClick={(e) => { e.stopPropagation(); setHidden(true); localStorage.setItem('pet_clippy_hidden', '1'); setExpanded(false); window.dispatchEvent(new Event('pet-clippy-toggle')); }}
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
