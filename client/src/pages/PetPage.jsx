import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getMyPet, adoptPet, feedPet, getPetCharacters, demandTrick, performTrick } from '../utils/api';
import SpritePet from '../components/SpritePet';

// ─── Mood dialogue ────────────────────────────────────────────────
const MOOD_MESSAGES = {
  desperate: [
    "I'm wasting away... play some songs!",
    'So... hungry... help...',
    'Feed me or I fade away!',
  ],
  hungry: [
    'I could really use some food...',
    'My tummy is rumbling! Play a song?',
    'A snack would be nice right about now.',
  ],
  happy: [
    "I'm feeling great! Keep it up!",
    'Life is good! More songs!',
    'You and me, we make a great team!',
  ],
  content: [
    'Mmm, that was delicious. Nice and full!',
    "I'm so cozy right now.",
    'Perfectly satisfied. *purrs*',
  ],
  stuffed: [
    "I can't eat another bite!",
    'SO. FULL. No more!',
    'I might explode if you feed me again!',
  ],
};

const CHARACTER_DESCRIPTIONS = {
  dojocat: 'Martial arts master. Loves pad stomping and denim jackets.',
  buu: 'Absorbs rhythms. Grows stronger with every beat dropped.',
  devit: 'Mischievous little devil. Dances to the fire of music.',
  pixiu: 'Mystical guardian spirit. Feasts on musical energy.',
};

const CHARACTER_GRADIENTS = {
  dojocat: 'from-amber-600 via-orange-500 to-yellow-400',
  buu: 'from-purple-600 via-fuchsia-500 to-pink-400',
  devit: 'from-red-600 via-rose-500 to-orange-400',
  pixiu: 'from-yellow-600 via-amber-500 to-orange-300',
};

const CHARACTER_BG = {
  dojocat: 'from-amber-950/40 via-gray-950 to-gray-950',
  buu: 'from-purple-950/40 via-gray-950 to-gray-950',
  devit: 'from-red-950/40 via-gray-950 to-gray-950',
  pixiu: 'from-yellow-950/30 via-gray-950 to-gray-950',
};

function randomMessage(mood) {
  const msgs = MOOD_MESSAGES[mood] || MOOD_MESSAGES.happy;
  return msgs[Math.floor(Math.random() * msgs.length)];
}

// ─── Main Component ───────────────────────────────────────────────
export default function PetPage() {
  const { user } = useAuth();
  const [pet, setPet] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adopting, setAdopting] = useState(false);
  const [feeding, setFeeding] = useState(false);
  const [showSelect, setShowSelect] = useState(false);
  const [isEating, setIsEating] = useState(false);
  const [isTricking, setIsTricking] = useState(false);
  const [activeTrickId, setActiveTrickId] = useState(null);
  const [trickResult, setTrickResult] = useState(null);
  const [speechText, setSpeechText] = useState('');
  const [showTricks, setShowTricks] = useState(false);
  const [demanding, setDemanding] = useState(false);
  const [petTapped, setPetTapped] = useState(false);
  const containerRef = useRef(null);

  const loadPet = useCallback(async () => {
    try {
      const [petRes, charRes] = await Promise.all([getMyPet(), getPetCharacters()]);
      setPet(petRes.pet);
      setCharacters(charRes.characters || []);
      if (!petRes.pet) setShowSelect(true);
      if (petRes.pet) setSpeechText(randomMessage(petRes.pet.mood));
    } catch (err) {
      console.error('Failed to load pet:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadPet();
    else setLoading(false);
  }, [user, loadPet]);

  // Rotate speech bubble text
  useEffect(() => {
    if (!pet) return;
    const interval = setInterval(() => {
      setSpeechText(randomMessage(pet.mood));
    }, 8000);
    return () => clearInterval(interval);
  }, [pet]);

  const handleAdopt = async (characterId) => {
    setAdopting(true);
    try {
      const res = await adoptPet(characterId);
      setPet(res.pet);
      setShowSelect(false);
      setSpeechText(randomMessage(res.pet.mood));
    } catch (err) {
      console.error('Failed to adopt pet:', err);
    } finally {
      setAdopting(false);
    }
  };

  const handleFeed = async () => {
    if (feeding || !pet || pet.fullness >= 100) return;
    setFeeding(true);
    setIsEating(true);
    try {
      const res = await feedPet(1);
      setPet(res.pet);
      setSpeechText('Yum! That hit the spot!');
    } catch (err) {
      console.error('Failed to feed pet:', err);
    } finally {
      setFeeding(false);
      setTimeout(() => setIsEating(false), 800);
    }
  };

  const handleDemand = async (trickId) => {
    setDemanding(true);
    try {
      const res = await demandTrick(trickId);
      setPet(res.pet);
      const trick = pet.tricks?.find(t => t.id === trickId);
      setSpeechText(`I want to ${trick?.name || 'do a trick'}! Go play a song for me!`);
    } catch (err) {
      console.error('Failed to demand trick:', err);
    } finally {
      setDemanding(false);
    }
  };

  const handlePerformTrick = async (trickId) => {
    try {
      const res = await performTrick(trickId);
      if (res.success) {
        setActiveTrickId(trickId);
        setIsTricking(true);
        setTrickResult('success');
        setPet(res.pet);
        const trick = pet.tricks?.find(t => t.id === trickId);
        setSpeechText(`TA-DA! ${trick?.name || 'Trick'}! +${res.bonus_xp} XP!`);
        setTimeout(() => {
          setIsTricking(false);
          setActiveTrickId(null);
          setTrickResult(null);
        }, 2500);
      } else {
        setTrickResult('pending');
        setSpeechText(res.message || 'I still need you to play a song!');
        setTimeout(() => setTrickResult(null), 3000);
      }
    } catch (err) {
      console.error('Failed to perform trick:', err);
    }
  };

  const handlePetTap = () => {
    setPetTapped(true);
    const reactions = ['Hey! That tickles!', '*purrs happily*', 'Hehe, stop it!', 'More headpats please!', 'I love you too!'];
    setSpeechText(reactions[Math.floor(Math.random() * reactions.length)]);
    setTimeout(() => setPetTapped(false), 500);
  };

  // ─── Auth gate ────────────────────────────────────────────
  if (!user) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center">
        <h1 className="text-2xl font-bold mb-4">My Pet</h1>
        <p className="text-gray-400">Log in to adopt your very own pet companion!</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto p-6 flex items-center justify-center min-h-[50vh]">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-2 border-white/10 border-t-white/60 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">loading</div>
        </div>
      </div>
    );
  }

  // ─── Character selection ──────────────────────────────────
  if (showSelect || !pet) {
    return (
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black tracking-tight mb-2">Choose Your Companion</h1>
          <p className="text-gray-400 text-sm">
            Your pet grows stronger as you play. Higher scores = better food = happier pet!
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {characters.map((char) => (
            <button
              key={char.id}
              onClick={() => handleAdopt(char.id)}
              disabled={adopting}
              className="group relative rounded-2xl border border-white/[0.06] p-5 text-left
                bg-gradient-to-br from-white/[0.04] to-transparent
                hover:border-white/20 hover:from-white/[0.08] active:scale-[0.97]
                transition-all duration-300 disabled:opacity-50 overflow-hidden"
            >
              {/* Accent gradient on hover */}
              <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500
                bg-gradient-to-br ${CHARACTER_GRADIENTS[char.id] || ''} mix-blend-soft-light`}
                style={{ opacity: 0.08 }}
              />
              <div className="relative z-10">
                <div className="flex justify-center mb-4">
                  <SpritePet character={char.id} mood="happy" size={100} />
                </div>
                <div className="font-bold text-lg">{char.name}</div>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  {CHARACTER_DESCRIPTIONS[char.id] || ''}
                </p>
                <div className="mt-3 flex gap-1">
                  {(char.tricks || []).map((t, i) => (
                    <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-500">
                      {t.name}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
        {pet && (
          <button
            onClick={() => setShowSelect(false)}
            className="mt-4 w-full text-center text-sm text-gray-500 hover:text-white transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    );
  }

  // ─── Main pet view ────────────────────────────────────────
  const fullness = pet.fullness;
  const experience = pet.experience || 0;
  const nextTrick = pet.next_trick;
  const charName = characters.find((c) => c.id === pet.character)?.name || pet.character;
  const hasPendingDemand = !!pet.pending_trick;
  const pendingTrickObj = pet.tricks?.find(t => t.id === pet.pending_trick);

  return (
    <div ref={containerRef} className="max-w-lg mx-auto p-4 sm:p-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-black tracking-tight">My {charName}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{experience.toLocaleString()} XP earned</p>
        </div>
        <button
          onClick={() => setShowSelect(true)}
          className="text-xs text-gray-500 hover:text-white border border-white/[0.06] hover:border-white/20
            rounded-lg px-3 py-1.5 transition-all duration-200"
        >
          Switch
        </button>
      </div>

      {/* Pet habitat */}
      <div className={`relative rounded-2xl border border-white/[0.06] overflow-hidden
        bg-gradient-to-b ${CHARACTER_BG[pet.character] || 'from-gray-900 to-gray-950'}`}>

        {/* Animated background particles */}
        <HabitatParticles character={pet.character} mood={pet.mood} />

        {/* Weight badge */}
        <div className="absolute top-3 right-3 z-10">
          <WeightBadge state={pet.weight_state} />
        </div>

        {/* Pet */}
        <div className={`relative z-10 flex flex-col items-center pt-8 pb-6 px-4
          ${petTapped ? 'animate-[wiggle_400ms_ease-in-out]' : ''}`}>
          <SpritePet
            character={pet.character}
            mood={pet.mood}
            trickId={activeTrickId}
            isEating={isEating}
            isTricking={isTricking}
            size={140}
            onClick={handlePetTap}
            className="cursor-pointer"
          />

          {/* Speech bubble */}
          <div className="mt-3 relative max-w-[280px]">
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45
              bg-white/[0.06] border-l border-t border-white/[0.08]" />
            <div className="bg-white/[0.06] backdrop-blur-sm border border-white/[0.08] rounded-xl
              px-4 py-2.5 text-sm text-gray-300 text-center leading-relaxed
              transition-all duration-500">
              <span className="italic">&ldquo;{speechText}&rdquo;</span>
            </div>
          </div>
        </div>

        {/* Active demand banner */}
        {hasPendingDemand && (
          <div className="relative z-10 mx-4 mb-4">
            <button
              onClick={() => handlePerformTrick(pet.pending_trick)}
              className="w-full group"
            >
              <div className={`relative rounded-xl border overflow-hidden
                ${trickResult === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10'
                  : trickResult === 'pending'
                    ? 'border-amber-500/30 bg-amber-500/10'
                    : 'border-white/10 bg-white/[0.04]'
                }
                px-4 py-3 transition-all duration-300
                hover:border-white/20 active:scale-[0.98]`}>
                {/* Shimmer */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent
                  translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                <div className="relative flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center text-lg shrink-0">
                    {trickResult === 'success' ? '🎉' : '🎯'}
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="text-xs font-semibold text-white/80 truncate">
                      {pendingTrickObj?.name || pet.pending_trick} Demand
                    </div>
                    <div className="text-[11px] text-gray-500 truncate">
                      Play Lv.{pet.trick_demand_level}+ with {pet.trick_demand_grade}+ grade
                    </div>
                  </div>
                  <div className="text-xs font-bold text-amber-400 shrink-0">
                    {trickResult === 'success' ? 'Done!' : 'Check'}
                  </div>
                </div>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Fullness bar */}
      <div className="mt-5">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-gray-500 font-medium">Fullness</span>
          <span className="font-mono text-white/70 tabular-nums">{fullness}%</span>
        </div>
        <FullnessBar value={fullness} character={pet.character} />
      </div>

      {/* XP progress to next trick */}
      {nextTrick && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-gray-500 font-medium">
              Next: <span className="text-white/60">{nextTrick.name}</span>
            </span>
            <span className="font-mono text-white/40 tabular-nums">
              {experience}/{nextTrick.xp} XP
            </span>
          </div>
          <div className="w-full h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${Math.min(100, (nextTrick.progress || 0) * 100)}%`,
                background: `linear-gradient(90deg, ${getCharAccent(pet.character)}88, ${getCharAccent(pet.character)})`,
              }}
            />
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="mt-5 grid grid-cols-3 gap-2">
        <StatCard label="Songs Fed" value={pet.total_songs_fed.toLocaleString()} />
        <StatCard label="Mood" value={capitalize(pet.mood)} />
        <StatCard label="Best Level" value={pet.highest_level || '—'} />
      </div>

      {/* Tricks section */}
      <div className="mt-5">
        <button
          onClick={() => setShowTricks(v => !v)}
          className="w-full flex items-center justify-between text-sm font-semibold text-white/80
            border border-white/[0.06] rounded-xl px-4 py-3
            hover:border-white/15 transition-all duration-200"
        >
          <span>Tricks ({pet.tricks_unlocked?.length || 0}/{pet.tricks?.length || 0})</span>
          <span className={`text-gray-500 transition-transform duration-200 ${showTricks ? 'rotate-180' : ''}`}>
            &#9662;
          </span>
        </button>

        {showTricks && (
          <div className="mt-2 space-y-2 animate-[slideDown_200ms_ease-out]">
            {(pet.tricks || []).map((trick) => (
              <TrickCard
                key={trick.id}
                trick={trick}
                pet={pet}
                onDemand={handleDemand}
                onPerform={handlePerformTrick}
                demanding={demanding}
              />
            ))}
          </div>
        )}
      </div>

      {/* Feed button */}
      <div className="mt-5">
        <button
          onClick={handleFeed}
          disabled={feeding || fullness >= 100}
          className={`w-full py-3.5 rounded-xl font-bold text-base relative overflow-hidden
            transition-all duration-300 active:scale-[0.97]
            ${fullness >= 100
              ? 'bg-white/[0.04] text-gray-600 cursor-not-allowed'
              : `bg-gradient-to-r ${CHARACTER_GRADIENTS[pet.character] || 'from-green-600 to-emerald-600'}
                 text-white shadow-lg hover:shadow-xl hover:brightness-110`
            }
            disabled:opacity-50`}
        >
          {/* Shimmer effect */}
          {fullness < 100 && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent
              -translate-x-full animate-[shimmer_3s_ease-in-out_infinite]" />
          )}
          <span className="relative z-10">
            {feeding ? 'Feeding...' : fullness >= 100 ? 'Pet is Full!' : 'Feed Pet'}
          </span>
        </button>
        <p className="text-[11px] text-gray-600 text-center mt-2">
          Sync your PIU scores for quality meals — higher grades give more food & XP!
        </p>
      </div>

      {/* Global keyframes */}
      <style>{`
        @keyframes eat-sparkle {
          0% { opacity: 1; transform: translate(var(--x, 0), 0) scale(1); }
          100% { opacity: 0; transform: translate(var(--x, 0), -40px) scale(0.3); }
        }
        @keyframes trick-burst {
          0% { opacity: 1; transform: translate(0, 0) scale(1); }
          100% { opacity: 0; transform: translate(var(--tx), var(--ty)) scale(0.2); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes wiggle {
          0%, 100% { transform: rotate(0); }
          25% { transform: rotate(-3deg); }
          75% { transform: rotate(3deg); }
        }
        @keyframes float-up {
          0% { opacity: 0.6; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-60px) scale(0.5); }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.3; }
        }
        @keyframes orbit {
          from { transform: rotate(0deg) translateX(var(--radius)) rotate(0deg); }
          to { transform: rotate(360deg) translateX(var(--radius)) rotate(-360deg); }
        }
      `}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────

function HabitatParticles({ character, mood }) {
  const accents = {
    dojocat: '#f5a623',
    buu: '#c98bbd',
    devit: '#e53935',
    pixiu: '#ffd54f',
  };
  const color = accents[character] || '#ffffff';
  const isHappy = mood === 'happy' || mood === 'content' || mood === 'stuffed';
  const count = isHappy ? 6 : 3;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: 2 + Math.random() * 3,
            height: 2 + Math.random() * 3,
            background: color,
            left: `${10 + Math.random() * 80}%`,
            bottom: `${Math.random() * 30}%`,
            opacity: 0.15,
            animation: `float-up ${4 + Math.random() * 4}s ease-out ${Math.random() * 4}s infinite`,
          }}
        />
      ))}
      {/* Center glow */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 200,
          height: 200,
          background: `radial-gradient(circle, ${color}08 0%, transparent 70%)`,
          animation: 'pulse-glow 4s ease-in-out infinite',
        }}
      />
    </div>
  );
}

function WeightBadge({ state }) {
  const styles = {
    starving: 'bg-red-500/15 text-red-400 border-red-500/20',
    thin: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
    normal: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    chubby: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    fat: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider border
      ${styles[state] || styles.normal}`}>
      {state}
    </span>
  );
}

function FullnessBar({ value, character }) {
  const accent = getCharAccent(character);
  const hue =
    value <= 15 ? '0' :
    value <= 35 ? '25' :
    value <= 65 ? '45' :
    value <= 85 ? '140' : '160';

  return (
    <div className="relative w-full h-3 bg-white/[0.04] rounded-full overflow-hidden border border-white/[0.04]">
      <div
        className="h-full rounded-full transition-all duration-700 ease-out relative"
        style={{
          width: `${value}%`,
          background: `linear-gradient(90deg, hsl(${hue}, 70%, 40%), hsl(${hue}, 70%, 55%))`,
        }}
      >
        {/* Inner shine */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent rounded-full" />
        {/* Animated glow at the tip */}
        {value > 5 && (
          <div
            className="absolute right-0 top-0 h-full w-4 rounded-full"
            style={{
              background: `radial-gradient(circle at right, hsl(${hue}, 80%, 65%), transparent)`,
              animation: 'pulse-glow 2s ease-in-out infinite',
            }}
          />
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.04] rounded-xl p-3 text-center">
      <div className="text-lg font-bold text-white/90 tabular-nums">{value}</div>
      <div className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function TrickCard({ trick, pet, onDemand, onPerform, demanding }) {
  const isUnlocked = trick.unlocked;
  const isPending = pet.pending_trick === trick.id;
  const wasLastPerformed = pet.last_trick_performed === trick.id;

  return (
    <div className={`rounded-xl border p-3 transition-all duration-200
      ${isUnlocked
        ? 'border-white/[0.08] bg-white/[0.03]'
        : 'border-white/[0.04] bg-white/[0.01] opacity-50'
      }`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0
          ${isUnlocked ? 'bg-white/[0.06]' : 'bg-white/[0.02]'}`}>
          {isUnlocked ? (isPending ? '🎯' : wasLastPerformed ? '⭐' : '✅') : '🔒'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white/80 truncate">{trick.name}</div>
          <div className="text-[11px] text-gray-500 truncate">{trick.description}</div>
          {!isUnlocked && (
            <div className="mt-1">
              <div className="flex items-center gap-1.5">
                <div className="flex-1 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-white/20 transition-all duration-500"
                    style={{ width: `${Math.min(100, (trick.progress || 0) * 100)}%` }}
                  />
                </div>
                <span className="text-[9px] text-gray-600 tabular-nums">{trick.xp} XP</span>
              </div>
            </div>
          )}
        </div>
        {isUnlocked && !isPending && (
          <button
            onClick={() => onDemand(trick.id)}
            disabled={demanding || !!pet.pending_trick}
            className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg
              bg-white/[0.06] hover:bg-white/[0.1] text-white/60 hover:text-white
              transition-all duration-200 disabled:opacity-30 shrink-0"
          >
            Demand
          </button>
        )}
        {isPending && (
          <button
            onClick={() => onPerform(trick.id)}
            className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg
              bg-amber-500/20 text-amber-400 hover:bg-amber-500/30
              transition-all duration-200 shrink-0 animate-pulse"
          >
            Check
          </button>
        )}
      </div>
    </div>
  );
}

function getCharAccent(character) {
  const accents = { dojocat: '#f5a623', buu: '#c98bbd', devit: '#e53935', pixiu: '#ffd54f' };
  return accents[character] || '#ffffff';
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}
