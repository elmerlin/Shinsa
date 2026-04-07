import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getMyPet, adoptPet, feedPet, getPetCharacters, getPetShop,
  buyPetFood, buyPetItem, equipPetItem, unequipPetSlot,
  setPetColor, togglePetAvatar, demandTrick, performTrick,
  interactPet, doPetActivity, claimPetMission, buyPetToy, usePetToy,
  buyPetHabitatItem, equipPetHabitat, setPetTrainingPath,
} from '../utils/api';
import SpritePet from '../components/SpritePet';

// ─── Sound ─────────────────────────────────────────────────────────
function playPetBoop() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
    setTimeout(() => ctx.close(), 200);
  } catch (e) { /* Audio not available */ }
}

// ─── Dialogue ─────────────────────────────────────────────────────
const MOOD_MESSAGES = {
  desperate: ["I'm wasting away... play some songs!", 'So... hungry...', 'Feed me!'],
  hungry: ['My tummy is rumbling!', 'A snack would be nice...', 'I could use some food.'],
  happy: ["I'm feeling great!", 'Life is good!', 'Keep it up!'],
  content: ['Mmm, so cozy.', 'Perfectly satisfied.', '*purrs happily*'],
  stuffed: ["Can't eat another bite!", 'SO. FULL.', 'I might pop!'],
};
const randomMsg = (mood) => { const m = MOOD_MESSAGES[mood] || MOOD_MESSAGES.happy; return m[Math.floor(Math.random() * m.length)]; };

const CHARACTER_DESCRIPTIONS = {
  dojocat: 'Martial arts master cat. Loves pad stomping.',
  buu: 'Absorbs rhythms. Grows stronger every beat.',
  devit: 'Mischievous devil. Dances to fire.',
  pixiu: 'Mystical guardian. Feeds on musical energy.',
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

const PET_REACTIONS = {
  dojocat: [
    { speech: 'Hya!', reaction: 'kata', expression: 'wink' },
    { speech: '*proud purr*', reaction: 'proud', expression: 'proud' },
    { speech: 'Watch this.', reaction: 'swish', expression: 'smirk' },
  ],
  buu: [
    { speech: 'Hehehe.', reaction: 'squish', expression: 'smirk' },
    { speech: 'More pats.', reaction: 'wobble', expression: 'grin' },
    { speech: 'I know I am cute.', reaction: 'swagger', expression: 'proud' },
  ],
  devit: [
    { speech: 'Heh.', reaction: 'hop', expression: 'grin' },
    { speech: 'Again!', reaction: 'dart', expression: 'excited' },
    { speech: 'Caught you.', reaction: 'mischief', expression: 'smirk' },
  ],
  pixiu: [
    { speech: 'Fortune favours us.', reaction: 'bless', expression: 'sparkle' },
    { speech: '*tail swish*', reaction: 'sway', expression: 'soft' },
    { speech: 'A fine tribute.', reaction: 'nod', expression: 'proud' },
  ],
};

const PET_ACTIONS = [
  { id: 'praise', label: 'Praise', icon: '✨' },
  { id: 'cuddle', label: 'Cuddle', icon: '🫶' },
  { id: 'tease', label: 'Tease', icon: '😼' },
  { id: 'perform', label: 'Perform', icon: '🎭', minBond: 40 },
  { id: 'mission', label: 'Mission', icon: '🎯' },
];

// ─── Tabs ─────────────────────────────────────────────────────────
const TABS = ['pet', 'habitat', 'food', 'clothing', 'tricks'];

// ─── Main ─────────────────────────────────────────────────────────
export default function PetPage() {
  const { user } = useAuth();
  const [pet, setPet] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [shop, setShop] = useState(null);
  const [economy, setEconomy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adopting, setAdopting] = useState(false);
  const [showSelect, setShowSelect] = useState(false);
  const [isEating, setIsEating] = useState(false);
  const [isTricking, setIsTricking] = useState(false);
  const [petReaction, setPetReaction] = useState('');
  const [petExpression, setPetExpression] = useState('');
  const [activeFoodId, setActiveFoodId] = useState('');
  const [speechText, setSpeechText] = useState('');
  const [tab, setTab] = useState('pet');
  const [buying, setBuying] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [petTapped, setPetTapped] = useState(false);
  const [colorPickerSlot, setColorPickerSlot] = useState(null);
  const [activityBusy, setActivityBusy] = useState(false);
  const [interactionBusy, setInteractionBusy] = useState(false);
  const [missionBusyId, setMissionBusyId] = useState('');
  const [toyBusy, setToyBusy] = useState(false);
  const [habitatBusy, setHabitatBusy] = useState(false);
  const [trainingBusy, setTrainingBusy] = useState(false);
  const [rareSpeech, setRareSpeech] = useState(false);

  const loadPet = useCallback(async () => {
    try {
      const [petRes, charRes] = await Promise.all([getMyPet(), getPetCharacters()]);
      setPet(petRes.pet);
      setEconomy(petRes.economy || null);
      setCharacters(charRes.characters || []);
      if (!petRes.pet) setShowSelect(true);
      if (petRes.pet) setSpeechText(randomMsg(petRes.pet.mood));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  const loadShop = useCallback(async () => {
    try {
      const s = await getPetShop();
      setShop(s);
      if (s?.economy) setEconomy(s.economy);
    }
    catch (err) { console.error(err); }
  }, []);

  useEffect(() => { if (user) { loadPet(); loadShop(); } else setLoading(false); }, [user, loadPet, loadShop]);

  useEffect(() => {
    if (!pet) return;
    const iv = setInterval(() => { setSpeechText(randomMsg(pet.mood)); setRareSpeech(false); }, 8000);
    return () => clearInterval(iv);
  }, [pet]);

  const showFeedback = (msg) => { setFeedbackMsg(msg); setTimeout(() => setFeedbackMsg(''), 2500); };

  const handleAdopt = async (id) => {
    setAdopting(true);
    try { const r = await adoptPet(id); setPet(r.pet); setShowSelect(false); setSpeechText(randomMsg(r.pet.mood)); loadShop(); }
    catch (e) { console.error(e); } finally { setAdopting(false); }
  };

  const handleBuyFood = async (foodId) => {
    if (buying) return;
    setBuying(true);
    setIsEating(true);
    setActiveFoodId(foodId);
    setPetReaction('feeding');
    setPetExpression('eating');
    try {
      const r = await buyPetFood(foodId);
      setPet(r.pet);
      const prefTag = r.food_preference === 'favorite' ? ' \u2764\uFE0F' : r.food_preference === 'disliked' ? ' \uD83D\uDC94' : '';
      showFeedback(`Fed ${r.food}!${prefTag}`);
      setSpeechText(r.pet_response || 'Mmm!');
      setRareSpeech(!!r.rare);
      loadShop();
    } catch (e) {
      showFeedback(e?.message || 'Not enough Combo!');
      setActiveFoodId('');
      setPetReaction('');
      setPetExpression('');
    } finally {
      setBuying(false);
      setTimeout(() => {
        setIsEating(false);
        setActiveFoodId('');
        setPetReaction('');
        setPetExpression('');
      }, 1400);
    }
  };

  const handleBuyItem = async (itemId) => {
    if (buying) return;
    setBuying(true);
    try {
      const r = await buyPetItem(itemId);
      setPet(r.pet);
      showFeedback(`Bought ${r.item}!`);
      loadShop();
    } catch (e) { showFeedback(e?.message || 'Cannot buy'); }
    finally { setBuying(false); }
  };

  const handleEquip = async (itemId) => {
    try { const r = await equipPetItem(itemId); setPet(r.pet); }
    catch (e) { console.error(e); }
  };

  const handleUnequip = async (slot) => {
    try { const r = await unequipPetSlot(slot); setPet(r.pet); }
    catch (e) { console.error(e); }
  };

  const handleSetColor = async (slot, color) => {
    try { const r = await setPetColor(slot, color); setPet(r.pet); }
    catch (e) { console.error(e); }
  };

  const handleToggleAvatar = async () => {
    try { const r = await togglePetAvatar(); setPet(r.pet); showFeedback(r.pet.is_pet_avatar ? 'Pet is now your avatar!' : 'Avatar restored'); }
    catch (e) { console.error(e); }
  };

  const handleDemand = async (trickId) => {
    try {
      const r = await demandTrick(trickId);
      setPet(r.pet);
      setSpeechText('Go play a song for me!');
    } catch (e) { console.error(e); }
  };

  const handlePerformTrick = async (trickId) => {
    try {
      const r = await performTrick(trickId);
      if (r.success) {
        setIsTricking(true);
        setPetReaction('hop');
        setPetExpression('excited');
        setPet(r.pet);
        showFeedback(`+${r.combo_earned} Combo! +${r.bonus_xp} XP!`);
        setSpeechText('TA-DA!');
        setTimeout(() => {
          setIsTricking(false);
          setPetReaction('');
          setPetExpression('');
        }, 2500);
      } else {
        showFeedback(r.message || 'Not yet!');
      }
    } catch (e) { console.error(e); }
  };

  const handlePetTap = () => {
    if (interactionBusy) return;
    playPetBoop();
    setInteractionBusy(true);
    interactPet('tap')
      .then((r) => {
        const characterResponses = PET_REACTIONS[r.pet?.character || pet?.character] || [];
        const fallback = characterResponses.length > 0
          ? characterResponses[Math.floor(Math.random() * characterResponses.length)]
          : null;
        setPet(r.pet);
        if (r.reaction || fallback?.reaction) setPetReaction(r.reaction || fallback?.reaction || '');
        if (r.expression || fallback?.expression) setPetExpression(r.expression || fallback?.expression || '');
        setSpeechText(r.speech || fallback?.speech || randomMsg(r.pet?.mood || pet?.mood));
        setRareSpeech(!!r.rare);
        setPetTapped(true);
        setTimeout(() => {
          setPetTapped(false);
          setPetReaction('');
          setPetExpression('');
          setRareSpeech(false);
        }, r.rare ? 2200 : fallback ? 1250 : 900);
      })
      .catch((e) => console.error(e))
      .finally(() => setInteractionBusy(false));
  };

  const triggerPetResponse = (speech, reaction = '', expression = '', duration = 1200, rare = false) => {
    if (reaction) setPetReaction(reaction);
    if (expression) setPetExpression(expression);
    if (speech) setSpeechText(speech);
    setRareSpeech(!!rare);
    setPetTapped(true);
    setTimeout(() => {
      setPetTapped(false);
      setPetReaction('');
      setPetExpression('');
      setRareSpeech(false);
    }, rare ? Math.max(duration, 2200) : duration);
  };

  const handlePetAction = async (actionId) => {
    if (interactionBusy) return;
    setInteractionBusy(true);
    try {
      const r = await interactPet(actionId);
      setPet(r.pet);
      triggerPetResponse(r.speech, r.reaction, r.expression, 1200, r.rare);
    } catch (e) {
      showFeedback(e?.message || 'Could not interact');
    } finally {
      setInteractionBusy(false);
    }
  };

  const handleActivity = async (activityId) => {
    if (activityBusy) return;
    setActivityBusy(true);
    try {
      const r = await doPetActivity(activityId);
      setPet(r.pet);
      const gainLabel = r.mastery_gain ? ` +${r.mastery_gain} mastery` : '';
      showFeedback(`${r.activity || activityId} complete${gainLabel}`);
      triggerPetResponse(r.speech, r.reaction, r.expression, 1500, r.rare);
    } catch (e) {
      showFeedback(e?.message || 'Activity failed');
    } finally {
      setActivityBusy(false);
    }
  };

  const handleClaimMission = async (missionId) => {
    if (missionBusyId) return;
    setMissionBusyId(missionId);
    try {
      const r = await claimPetMission(missionId);
      setPet(r.pet);
      showFeedback('Mission rewards claimed');
      triggerPetResponse('Progress acknowledged.', 'nod', 'sparkle', 1500);
    } catch (e) {
      showFeedback(e?.message || 'Mission not ready');
    } finally {
      setMissionBusyId('');
    }
  };

  const handleBuyToy = async (toyId) => {
    if (toyBusy) return;
    setToyBusy(true);
    try {
      const r = await buyPetToy(toyId);
      setPet(r.pet);
      showFeedback(`Bought ${r.toy}!`);
      loadShop();
    } catch (e) {
      showFeedback(e?.message || 'Could not buy toy');
    } finally {
      setToyBusy(false);
    }
  };

  const handleUseToy = async (toyId) => {
    if (toyBusy) return;
    setToyBusy(true);
    try {
      const r = await usePetToy(toyId);
      setPet(r.pet);
      triggerPetResponse(r.speech, r.reaction, r.expression, 1600);
      showFeedback(r.preference === 'favorite' ? 'Favourite toy time' : 'Toy chest opened');
    } catch (e) {
      showFeedback(e?.message || 'Could not use toy');
    } finally {
      setToyBusy(false);
    }
  };

  const handleBuyHabitatItem = async (itemId) => {
    if (habitatBusy) return;
    setHabitatBusy(true);
    try {
      const r = await buyPetHabitatItem(itemId);
      setPet(r.pet);
      showFeedback(`Bought ${r.item}!`);
      loadShop();
    } catch (e) {
      showFeedback(e?.message || 'Could not buy room item');
    } finally {
      setHabitatBusy(false);
    }
  };

  const handleEquipHabitat = async (itemId, slot) => {
    if (habitatBusy) return;
    setHabitatBusy(true);
    try {
      const r = await equipPetHabitat(itemId, slot);
      setPet(r.pet);
      showFeedback(itemId ? 'Habitat updated' : 'Habitat reset');
    } catch (e) {
      showFeedback(e?.message || 'Could not update habitat');
    } finally {
      setHabitatBusy(false);
    }
  };

  const handleSetTrainingPath = async (pathId) => {
    if (trainingBusy) return;
    setTrainingBusy(true);
    try {
      const r = await setPetTrainingPath(pathId);
      setPet(r.pet);
      triggerPetResponse(r.speech, 'nod', 'sparkle', 1500);
      showFeedback(`${r.pet.mastery?.path?.label || 'Training'} focus set`);
    } catch (e) {
      showFeedback(e?.message || 'Could not change training path');
    } finally {
      setTrainingBusy(false);
    }
  };

  // ─── Gates ──────────────────────────────────────────
  if (!user) return <div className="max-w-lg mx-auto p-6 text-center"><h1 className="text-2xl font-bold mb-4">My Pet</h1><p className="text-gray-400">Log in to adopt a pet!</p></div>;
  if (loading) return <div className="max-w-lg mx-auto p-6 flex items-center justify-center min-h-[50vh]"><div className="w-12 h-12 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" /></div>;

  // ─── Character selection ────────────────────────────
  if (showSelect || !pet) {
    return (
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black tracking-tight mb-2">Choose Your Companion</h1>
          <p className="text-gray-400 text-sm">Play songs to earn Combo. Buy food to keep them happy!</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {characters.map((c) => (
            <button key={c.id} onClick={() => handleAdopt(c.id)} disabled={adopting}
              className="group relative rounded-2xl border border-white/[0.06] p-5 text-left bg-white/[0.02] hover:border-white/20 active:scale-[0.97] transition-all duration-300 disabled:opacity-50">
              <div className="flex justify-center mb-3">
                <SpritePet character={c.id} weightState="normal" mood="happy" size={90} />
              </div>
              <div className="font-bold text-lg">{c.name}</div>
              <p className="text-xs text-gray-500 mt-1">{CHARACTER_DESCRIPTIONS[c.id]}</p>
            </button>
          ))}
        </div>
        {pet && <button onClick={() => setShowSelect(false)} className="mt-4 w-full text-center text-sm text-gray-500 hover:text-white transition-colors">Cancel</button>}
      </div>
    );
  }

  // ─── Main pet view ──────────────────────────────────
  const {
    hunger = 50,
    happiness = 50,
    energy = 65,
    trust = 35,
    hype = 25,
    bond = 0,
    combo_balance = 0,
    bond_tokens = 0,
    rare_shards = 0,
    experience = 0,
  } = pet;
  const charName = characters.find(c => c.id === pet.character)?.name || pet.character;
  const nextTrick = pet.next_trick;
  const pendingTrickObj = pet.tricks?.find(t => t.id === pet.pending_trick);

  return (
    <div className="max-w-lg mx-auto p-4 sm:p-6 pb-24">
      {/* Header */}
      <div className="mb-2 rounded-[1.25rem] border border-white/[0.06] bg-white/[0.025] px-3.5 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-black tracking-tight text-white">My {charName}</h1>
            <p className="text-[11px] text-cyan-100/80">{pet.identity_title || 'Training Partner'}</p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={handleToggleAvatar}
              className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition-all ${
                pet.is_pet_avatar
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : 'border-white/[0.08] bg-white/[0.03] text-gray-400 hover:border-white/15 hover:text-white'
              }`}
            >
              {pet.is_pet_avatar ? 'Avatar On' : 'Set Avatar'}
            </button>
            <button
              onClick={() => setShowSelect(true)}
              className="whitespace-nowrap rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 transition-all hover:border-white/15 hover:text-white"
            >
              Switch
            </button>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <HeaderPill label="XP" value={experience.toLocaleString()} tone="slate" />
          <HeaderPill label="Combo" value={combo_balance.toLocaleString()} tone="amber" />
          <HeaderPill label="Bond Tokens" value={bond_tokens.toLocaleString()} tone="cyan" />
          {rare_shards > 0 ? <HeaderPill label="Shards" value={rare_shards.toLocaleString()} tone="fuchsia" /> : null}
        </div>
      </div>

      {/* Pet habitat */}
      <div className="sticky top-0 z-[60] -mx-2 mb-4 px-2 pt-1 pb-3 bg-gradient-to-b from-[#070b14] via-[#070b14]/95 to-transparent backdrop-blur-sm">
        <div className={`relative rounded-[1.6rem] border border-white/[0.06] overflow-hidden bg-gradient-to-b shadow-[0_18px_45px_rgba(0,0,0,0.28)] ${CHARACTER_BG[pet.character] || ''}`}>
          <HabitatBackdrop backgroundId={pet.habitat?.active_background} />
          <HabitatParticles character={pet.character} mood={pet.mood} />
          <HabitatPropDisplay propId={pet.habitat?.active_prop} />
          <div className="absolute top-3 right-3 z-10"><WeightBadge state={pet.weight_state} /></div>
          <div className="absolute top-3 left-3 z-10"><BondBadge rank={pet.bond_rank} /></div>
          {pet.form?.label ? (
            <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
              <FormBadge form={pet.form} />
            </div>
          ) : null}
          <div className={`relative z-10 flex flex-col items-center justify-end px-4 pt-14 pb-3 min-h-[280px] sm:min-h-[300px] ${petTapped ? 'animate-[wiggle_400ms_ease]' : ''}`}>
            {/* Speech bubble — single instance, above pet */}
            <div className="mb-2 relative max-w-[240px]">
              <div className={`backdrop-blur-sm border rounded-xl px-3 py-1.5 text-[13px] text-center italic transition-all duration-500 ${
                rareSpeech
                  ? 'bg-amber-500/[0.08] border-amber-400/20 text-amber-200'
                  : 'bg-white/[0.06] border-white/[0.08] text-gray-300'
              }`}>
                {rareSpeech && <span className="text-amber-400 mr-1 animate-pulse">&#10022;</span>}
                &ldquo;{speechText}&rdquo;
                {rareSpeech && <span className="text-amber-400 ml-1 animate-pulse">&#10022;</span>}
              </div>
              <div className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 border-r border-b transition-colors duration-300 ${
                rareSpeech ? 'bg-amber-500/20 border-amber-400/30' : 'bg-white/[0.06] border-white/[0.08]'
              }`} />
            </div>
            {pet.form?.desc ? (
              <div className="mb-1 text-center text-[10px] text-white/50 max-w-[240px]">
                {pet.form.desc}
              </div>
            ) : null}
            <div className="flex items-end justify-center">
              <SpritePet
                character={pet.character} weightState={pet.weight_state} mood={pet.mood}
                equippedHat={pet.equipped_hat} equippedBelt={pet.equipped_belt} equippedShoes={pet.equipped_shoes}
                equippedTop={pet.equipped_top}
                hatColor={pet.hat_color} beltColor={pet.belt_color} shoesColor={pet.shoes_color}
                topColor={pet.top_color}
                isEating={isEating} isTricking={isTricking} reaction={petReaction}
                expression={petExpression} foodId={activeFoodId}
                size={170} onClick={handlePetTap} />
            </div>
          </div>
          {/* Demand banner */}
          {pet.pending_trick && (
            <div className="relative z-10 mx-4 mb-4">
              <button onClick={() => handlePerformTrick(pet.pending_trick)} className="w-full group">
                <div className="relative rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 flex items-center gap-2 hover:border-amber-500/30 active:scale-[0.98] transition-all">
                  <span className="text-lg">🎯</span>
                  <div className="text-left flex-1 min-w-0">
                    <div className="text-xs font-semibold text-white/80 truncate">{pendingTrickObj?.name || 'Trick'} Demand</div>
                    <div className="text-[10px] text-gray-500">Lv.{pet.trick_demand_level}+ / {pet.trick_demand_grade}+ grade</div>
                  </div>
                  <span className="text-xs font-bold text-amber-400 animate-pulse">Check</span>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Feedback toast */}
      {feedbackMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-black/90 border border-white/10 rounded-xl px-4 py-2 text-sm text-white font-semibold shadow-xl animate-[slideDown_200ms_ease-out]">
          {feedbackMsg}
        </div>
      )}

      {/* Hunger + Happiness bars */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <MeterBar label="Hunger" value={hunger} color="orange" />
        <MeterBar label="Happiness" value={happiness} color="pink" />
        <MeterBar label="Energy" value={energy} color="cyan" />
        <MeterBar label="Trust" value={trust} color="emerald" />
        <MeterBar label="Hype" value={hype} color="violet" />
        <BondMeter bond={bond} bondRank={pet.bond_rank} />
      </div>

      {/* XP to next trick */}
      {nextTrick && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-gray-500">Next: <span className="text-white/60">{nextTrick.name}</span></span>
            <span className="text-gray-600 tabular-nums">{experience}/{nextTrick.xp}</span>
          </div>
          <div className="w-full h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-white/20 transition-all duration-500" style={{ width: `${Math.min(100, (nextTrick.progress || 0) * 100)}%` }} />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="mt-3 grid grid-cols-4 gap-2">
        <StatCard label="Songs" value={pet.total_songs_fed} />
        <StatCard label="Mood" value={capitalize(pet.mood)} />
        <StatCard label="Level" value={pet.highest_level || '—'} />
        <StatCard label="Specialty" value={pet.specialty?.label || '—'} />
      </div>

      {/* Tab bar */}
      <div className="mt-4 flex rounded-xl border border-white/[0.06] overflow-hidden">
        {TABS.map(t => (
          <button key={t} onClick={() => { setTab(t); if (t === 'food' || t === 'clothing' || t === 'habitat') loadShop(); }}
            className={`flex-1 py-2 text-xs font-semibold capitalize transition-all ${tab === t ? 'bg-white/[0.08] text-white' : 'text-gray-500 hover:text-white/70'}`}>
            {t === 'food' ? '🍖 Food' : t === 'clothing' ? '👒 Clothes' : t === 'tricks' ? '⭐ Tricks' : t === 'habitat' ? '🏠 Room' : '🐾 Pet'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mt-3">
        {tab === 'pet' && (
          <PetTab
            pet={pet}
            shop={shop}
            combo={combo_balance}
            economy={economy}
            interactionBusy={interactionBusy}
            activityBusy={activityBusy}
            missionBusyId={missionBusyId}
            toyBusy={toyBusy}
            trainingBusy={trainingBusy}
            onAction={handlePetAction}
            onActivity={handleActivity}
            onClaimMission={handleClaimMission}
            onBuyToy={handleBuyToy}
            onUseToy={handleUseToy}
            onSetTrainingPath={handleSetTrainingPath}
          />
        )}
        {tab === 'habitat' && (
          <HabitatTab
            pet={pet}
            shop={shop}
            combo={combo_balance}
            habitatBusy={habitatBusy}
            onBuyItem={handleBuyHabitatItem}
            onEquipItem={handleEquipHabitat}
          />
        )}
        {tab === 'food' && <FoodTab shop={shop} combo={combo_balance} economy={economy} onBuy={handleBuyFood} buying={buying} />}
        {tab === 'clothing' && <ClothingTab pet={pet} shop={shop} onBuy={handleBuyItem} onEquip={handleEquip} onUnequip={handleUnequip} onSetColor={handleSetColor} buying={buying} colorPickerSlot={colorPickerSlot} setColorPickerSlot={setColorPickerSlot} />}
        {tab === 'tricks' && <TricksTab pet={pet} onDemand={handleDemand} onPerform={handlePerformTrick} />}
      </div>

      <p className="text-[10px] text-gray-600 text-center mt-4">Sync PIU scores to earn Combo, then budget it carefully to keep your pet thriving.</p>

      <style>{`
        @keyframes slideDown { from { opacity: 0; transform: translate(-50%, -12px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes wiggle { 0%,100% { transform: rotate(0); } 25% { transform: rotate(-3deg); } 75% { transform: rotate(3deg); } }
        @keyframes float-up { 0% { opacity: 0.5; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-50px) scale(0.5); } }
        @keyframes pulse-glow { 0%,100% { opacity: 0.15; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────

function HabitatParticles({ character, mood }) {
  const accents = { dojocat: '#f5a623', buu: '#c98bbd', devit: '#e53935', pixiu: '#ffd54f' };
  const color = accents[character] || '#fff';
  const happy = ['happy', 'content', 'stuffed'].includes(mood);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: happy ? 5 : 2 }, (_, i) => (
        <div key={i} className="absolute rounded-full" style={{
          width: 2 + Math.random() * 3, height: 2 + Math.random() * 3, background: color,
          left: `${10 + Math.random() * 80}%`, bottom: `${Math.random() * 30}%`, opacity: 0.15,
          animation: `float-up ${4 + Math.random() * 4}s ease-out ${Math.random() * 4}s infinite`,
        }} />
      ))}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{
        width: 180, height: 180, background: `radial-gradient(circle, ${color}08 0%, transparent 70%)`, animation: 'pulse-glow 4s ease-in-out infinite',
      }} />
    </div>
  );
}

function HabitatBackdrop({ backgroundId }) {
  const backgrounds = {
    'dojo-night': 'radial-gradient(circle at 50% 18%, rgba(88,196,255,0.16), transparent 42%), linear-gradient(180deg, rgba(18,48,80,0.12) 0%, rgba(3,7,18,0) 72%)',
    'sunset-arcade': 'radial-gradient(circle at 50% 16%, rgba(255,158,88,0.18), transparent 42%), linear-gradient(180deg, rgba(129,45,74,0.18) 0%, rgba(3,7,18,0) 72%)',
    'moon-festival': 'radial-gradient(circle at 50% 18%, rgba(255,220,130,0.14), transparent 42%), linear-gradient(180deg, rgba(86,42,108,0.18) 0%, rgba(3,7,18,0) 72%)',
    'inferno-stage': 'radial-gradient(circle at 50% 18%, rgba(255,98,72,0.16), transparent 42%), linear-gradient(180deg, rgba(112,22,22,0.22) 0%, rgba(3,7,18,0) 72%)',
  };
  return (
    <div
      className="absolute inset-0 pointer-events-none opacity-95"
      style={{ backgroundImage: backgrounds[backgroundId] || backgrounds['dojo-night'] }}
    />
  );
}

const PIXEL_PROP_ART = {
  'training-dummy': {
    width: 16,
    pixels: [
      '________________',
      '______aa________',
      '_____abca_______',
      '_____adda_______',
      '_____adda_______',
      '_____adda_______',
      '_____adda_______',
      '_____adda_______',
      '_____aeea_______',
      '______ff________',
      '______ff________',
      '______ff________',
      '_____ghhg_______',
      '____giiiig______',
      '____giiiig______',
      '________________',
    ],
    colors: {
      a: '#4d2c18',
      b: '#f3d295',
      c: '#b56a3f',
      d: '#8a4d27',
      e: '#d49d52',
      f: '#5a341c',
      g: '#31252b',
      h: '#67515e',
      i: '#40333d',
    },
  },
  'lucky-banner': {
    width: 16,
    pixels: [
      '_______aa_______',
      '_______aa_______',
      '_______aa_______',
      '_____bbbbbb_____',
      '_____bccdcb_____',
      '_____beeeeb_____',
      '_____beeeeb_____',
      '_____beeeeb_____',
      '_____beeeeb_____',
      '_____bffffb_____',
      '______fggf______',
      '_______hh_______',
      '_______hh_______',
      '______iiii______',
      '_____ijjjji_____',
      '________________',
    ],
    colors: {
      a: '#d8c79a',
      b: '#70402e',
      c: '#f1d37e',
      d: '#f7efc0',
      e: '#bb2f5c',
      f: '#f0b44e',
      g: '#ffd87a',
      h: '#bb7a2a',
      i: '#7a2d48',
      j: '#e7a63c',
    },
  },
  boombox: {
    width: 16,
    pixels: [
      '________________',
      '________________',
      '___aaaaaaaaaa___',
      '__abbbbbbbbbbca_',
      '__abdddeeeddbca_',
      '__abdfggggfdbca_',
      '__abdfghhgfdbca_',
      '__abdfggggfdbca_',
      '__abdddeeeddbca_',
      '__abbiijjiibbca_',
      '__abbbbbbbbbbca_',
      '___akkkkkkkkla__',
      '____mmmmmmmm____',
      '________________',
      '________________',
      '________________',
    ],
    colors: {
      a: '#233246',
      b: '#162233',
      c: '#49647b',
      d: '#31455d',
      e: '#587697',
      f: '#0e1622',
      g: '#1c2636',
      h: '#7fd5ff',
      i: '#2e475e',
      j: '#88bfe0',
      k: '#0f1724',
      l: '#3a556d',
      m: '#273243',
    },
  },
  'trophy-stand': {
    width: 16,
    pixels: [
      '_______aa_______',
      '______abca______',
      '_____abddca_____',
      '_____aefgea_____',
      '______ahha______',
      '_______ii_______',
      '_______ii_______',
      '______ajka______',
      '______ajka______',
      '______ajka______',
      '_____alllla_____',
      '_____ammmma_____',
      '____annnnnna____',
      '___aoooooooa___',
      '___apppppppa___',
      '________________',
    ],
    colors: {
      a: '#5f4b36',
      b: '#e7c56b',
      c: '#fff1b7',
      d: '#f0b14a',
      e: '#f9e0a1',
      f: '#d7962f',
      g: '#f8f2c9',
      h: '#d58f2c',
      i: '#7b5928',
      j: '#7a5737',
      k: '#c9993f',
      l: '#4a3943',
      m: '#352936',
      n: '#5a4651',
      o: '#2f2530',
      p: '#453541',
    },
  },
};

function PixelPropSprite({ art, className = '' }) {
  if (!art) return null;
  const rows = art.pixels.length;
  const cols = art.width || art.pixels[0]?.length || 0;
  const template = [];
  for (let y = 0; y < rows; y++) {
    const row = art.pixels[y] || '';
    for (let x = 0; x < cols; x++) {
      const key = row[x] || '_';
      template.push(key === '_' ? 'transparent' : (art.colors[key] || 'transparent'));
    }
  }

  return (
    <div
      className={`pointer-events-none absolute z-[1] opacity-90 ${className}`.trim()}
      style={{ width: `${cols * 4}px`, height: `${rows * 4}px` }}
    >
      <div
        className="grid h-full w-full drop-shadow-[0_6px_16px_rgba(0,0,0,0.35)]"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {template.map((color, index) => (
          <span key={index} className="block aspect-square" style={{ backgroundColor: color }} />
        ))}
      </div>
    </div>
  );
}

function HabitatPropDisplay({ propId }) {
  if (!propId) return null;
  const positions = {
    'training-dummy': 'right-4 bottom-4',
    'lucky-banner': 'left-4 top-10',
    boombox: 'left-4 bottom-4',
    'trophy-stand': 'right-4 top-12',
  };
  return <PixelPropSprite art={PIXEL_PROP_ART[propId]} className={positions[propId] || ''} />;
}

function WeightBadge({ state }) {
  const s = { starving: 'bg-red-500/15 text-red-400 border-red-500/20', thin: 'bg-orange-500/15 text-orange-400 border-orange-500/20', normal: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', chubby: 'bg-blue-500/15 text-blue-400 border-blue-500/20', fat: 'bg-purple-500/15 text-purple-400 border-purple-500/20' };
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider border ${s[state] || s.normal}`}>{state}</span>;
}

function BondBadge({ rank }) {
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
      {rank?.label || 'Training Partner'}
    </span>
  );
}

function FormBadge({ form }) {
  const tones = {
    calm: 'border-white/10 bg-black/25 text-white/70',
    bonded: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200',
    spotlight: 'border-fuchsia-400/20 bg-fuchsia-500/10 text-fuchsia-100',
    legend: 'border-amber-400/20 bg-amber-500/10 text-amber-200',
  };
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${tones[form?.aura] || tones.calm}`}>
      {form?.label || 'Fresh Form'}
    </span>
  );
}

function HeaderPill({ label, value, tone = 'slate' }) {
  const tones = {
    slate: 'border-white/[0.08] bg-white/[0.03] text-gray-200',
    amber: 'border-amber-400/20 bg-amber-500/[0.08] text-amber-200',
    cyan: 'border-cyan-400/20 bg-cyan-500/[0.08] text-cyan-100',
    fuchsia: 'border-fuchsia-400/20 bg-fuchsia-500/[0.08] text-fuchsia-100',
  };
  return (
    <div className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 ${tones[tone] || tones.slate}`}>
      <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/55">{label}</span>
      <span className="text-[11px] font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function MeterBar({ label, value, color }) {
  const hues = {
    orange: { lo: '0', hi: '35' },
    pink: { lo: '300', hi: '340' },
    cyan: { lo: '185', hi: '200' },
    emerald: { lo: '140', hi: '155' },
    violet: { lo: '255', hi: '280' },
  };
  const h = hues[color] || hues.orange;
  const hue = value <= 30 ? h.lo : h.hi;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-gray-500">{label}</span>
        <span className="font-mono text-white/60 tabular-nums">{value}%</span>
      </div>
      <div className="w-full h-2.5 bg-white/[0.04] rounded-full overflow-hidden border border-white/[0.04]">
        <div className="h-full rounded-full transition-all duration-700 relative" style={{ width: `${value}%`, background: `linear-gradient(90deg, hsl(${hue}, 70%, 35%), hsl(${hue}, 70%, 50%))` }}>
          <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent rounded-full" />
        </div>
      </div>
    </div>
  );
}

function BondMeter({ bond, bondRank }) {
  const nextThreshold = bondRank?.next_threshold || bondRank?.threshold || 0;
  const currentThreshold = bondRank?.threshold || 0;
  const currentProgress = nextThreshold > currentThreshold
    ? Math.min(100, ((bond - currentThreshold) / (nextThreshold - currentThreshold)) * 100)
    : 100;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-gray-500">Bond</span>
        <span className="font-mono text-white/60 tabular-nums">{bond}</span>
      </div>
      <div className="w-full h-2.5 bg-white/[0.04] rounded-full overflow-hidden border border-white/[0.04]">
        <div className="h-full rounded-full bg-gradient-to-r from-sky-700 to-cyan-300 transition-all duration-700 relative" style={{ width: `${currentProgress}%` }}>
          <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent rounded-full" />
        </div>
      </div>
      <div className="mt-2 text-[10px] text-cyan-100/70 px-0.5">
        {bondRank?.next_label ? `${bondRank.label} -> ${bondRank.next_label}` : bondRank?.label || 'Training Partner'}
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.04] rounded-xl p-2.5 text-center">
      <div className="text-base font-bold text-white/90 tabular-nums">{value}</div>
      <div className="text-[9px] text-gray-500 mt-0.5 uppercase tracking-wider">{label}</div>
    </div>
  );
}

// ─── Pet tab ──────────────────────────────────────────
function PetTab({ pet, shop, combo, economy, interactionBusy, activityBusy, missionBusyId, toyBusy, trainingBusy, onAction, onActivity, onClaimMission, onBuyToy, onUseToy, onSetTrainingPath }) {
  return (
    <div className="space-y-3 text-sm text-gray-400">
      <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
        <div className="text-xs text-gray-500 mb-1">Personality</div>
        <p className="text-[11px] text-white/80">{pet.personality?.title}</p>
        <p className="text-[11px] mt-1">{pet.personality?.desc}</p>
      </div>
      {economy?.target_songs_per_week ? (
        <div className="bg-amber-500/[0.06] rounded-xl p-3 border border-amber-500/10">
          <div className="text-xs text-amber-300 mb-1">Upkeep target</div>
          <p className="text-[11px] text-amber-100/80">A healthy pet now averages about {economy.target_songs_per_week} songs per week to stay comfortably fed.</p>
        </div>
      ) : null}
      <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
        <div className="text-xs text-gray-500 mb-2">Likes & dislikes</div>
        <div className="grid grid-cols-2 gap-3 text-[11px]">
          <div>
            <div className="text-emerald-300 mb-1">Favourite foods</div>
            <div className="flex flex-wrap gap-1">
              {(pet.food_preferences?.favorites || []).map((foodId) => (
                <span key={foodId} className="px-2 py-0.5 rounded-full border border-emerald-400/15 bg-emerald-400/10 text-emerald-100/80">{foodId.replace(/-/g, ' ')}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-rose-300 mb-1">Disliked foods</div>
            <div className="flex flex-wrap gap-1">
              {(pet.food_preferences?.dislikes || []).map((foodId) => (
                <span key={foodId} className="px-2 py-0.5 rounded-full border border-rose-400/15 bg-rose-400/10 text-rose-100/80">{foodId.replace(/-/g, ' ')}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
        <div className="text-xs text-gray-500 mb-2">Interact</div>
        <div className="flex flex-wrap gap-1.5">
          {PET_ACTIONS.map((action) => {
            const locked = action.minBond && (pet.bond || 0) < action.minBond;
            return (
              <button
                key={action.id}
                onClick={() => !locked && onAction(action.id)}
                disabled={interactionBusy || locked}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all active:scale-[0.97] disabled:opacity-50 ${
                  locked
                    ? 'border-white/[0.04] bg-white/[0.01] text-gray-600 cursor-not-allowed'
                    : 'border-white/[0.08] bg-white/[0.03] text-white/80 hover:border-white/15 hover:bg-white/[0.05]'
                }`}
              >
                <span className="text-sm">{action.icon}</span>
                <span>{action.label}</span>
                {locked && <span className="text-[9px] text-gray-600 ml-0.5">&#128274; {action.minBond}</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(pet.activities || []).map((activity) => {
            const locked = activity.locked;
            const costLabel = activity.energy < 0 ? `${Math.abs(activity.energy)} energy` : activity.energy > 0 ? `+${activity.energy} energy` : '';
            return (
              <button
                key={activity.id}
                onClick={() => !locked && onActivity(activity.id)}
                disabled={activityBusy || locked}
                className={`rounded-xl border px-3 py-2 text-left transition-all active:scale-[0.98] disabled:opacity-50 ${
                  locked
                    ? 'border-white/[0.04] bg-white/[0.01] cursor-not-allowed'
                    : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="text-[11px] font-semibold text-white/85">{activity.label}</div>
                  {locked && <span className="text-[9px] text-gray-600">&#128274;</span>}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">{activity.desc}</div>
                {costLabel && <div className="text-[9px] text-cyan-300/50 mt-1">{costLabel}</div>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <div className="text-xs text-gray-500">Mastery path</div>
            <div className="text-sm font-semibold text-white/85 mt-0.5">
              {pet.mastery?.path?.icon ? `${pet.mastery.path.icon} ` : ''}{pet.mastery?.path?.label || 'Consistency'}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">{pet.mastery?.path?.desc}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-cyan-200/70">Mastery</div>
            <div className="text-base font-bold text-cyan-100 tabular-nums">{pet.mastery?.mastery_xp || 0}</div>
            <div className="text-[10px] text-cyan-200/75">{pet.mastery?.rank?.label || 'Rookie'}</div>
          </div>
        </div>
        <div className="w-full h-2.5 bg-white/[0.04] rounded-full overflow-hidden border border-white/[0.04]">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-sky-300 transition-all duration-700" style={{ width: `${Math.max(6, (pet.mastery?.rank?.progress || 0) * 100)}%` }} />
        </div>
        <div className="mt-2 text-[10px] text-gray-500">
          {pet.mastery?.rank?.next_label
            ? `${pet.mastery.rank.label} -> ${pet.mastery.rank.next_label} at ${pet.mastery.rank.next_threshold} XP`
            : `${pet.mastery?.rank?.label || 'Master'} rank reached`}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(pet.mastery?.available_paths || []).map((path) => (
            <button
              key={path.id}
              onClick={() => onSetTrainingPath(path.id)}
              disabled={trainingBusy}
              className={`rounded-xl border px-3 py-2 text-left transition-all ${
                path.active
                  ? 'border-cyan-400/20 bg-cyan-500/[0.08]'
                  : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
              } disabled:opacity-50`}
            >
              <div className="text-[11px] font-semibold text-white/85">{path.icon ? `${path.icon} ` : ''}{path.label}</div>
              <div className="text-[10px] text-gray-500 mt-1">{path.desc}</div>
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          {(pet.mastery?.milestones || []).map((node) => (
            <div key={node.id} className={`rounded-xl border px-3 py-2 ${node.unlocked ? 'border-emerald-400/12 bg-emerald-500/[0.06]' : 'border-white/[0.05] bg-black/20'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-semibold text-white/85">{node.title}</div>
                <div className={`text-[10px] font-semibold ${node.unlocked ? 'text-emerald-300' : 'text-gray-500'}`}>
                  {node.unlocked ? 'Unlocked' : `${node.threshold} XP`}
                </div>
              </div>
              <div className="text-[10px] text-gray-500 mt-1">{node.desc}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div>
            <div className="text-xs text-gray-500">Toy chest</div>
            <div className="text-[11px] text-white/65 mt-0.5">Small objects that unlock more ways to play with your companion.</div>
          </div>
          <div className="text-[10px] font-semibold text-amber-300 whitespace-nowrap">{combo.toLocaleString()} Combo</div>
        </div>
        <div className="space-y-1.5">
          {(shop?.toys || []).map((toy) => {
            const owned = !!toy.owned || (pet.owned_toys || []).includes(toy.id);
            const favorite = toy.preference === 'favorite';
            const canAfford = combo >= toy.cost;
            return (
              <div key={toy.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-white/85 truncate">{toy.name}</span>
                    {favorite ? <span className="shrink-0 rounded-full border border-emerald-400/15 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-200">fav</span> : null}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{toy.desc}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-[10px] text-amber-300">{toy.cost}c</div>
                  <button
                    onClick={() => (owned ? onUseToy(toy.id) : onBuyToy(toy.id))}
                    disabled={toyBusy || (!owned && !canAfford)}
                    className={`rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-all ${
                      owned
                        ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/20 hover:bg-cyan-500/20'
                        : canAfford
                          ? 'bg-white/[0.05] text-white/80 border border-white/[0.07] hover:border-white/15'
                          : 'bg-white/[0.03] text-gray-500 border border-white/[0.05]'
                    } disabled:opacity-50`}
                  >
                    {owned ? 'Use toy' : 'Buy'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {pet.last_toy_id ? (
          <div className="mt-2 text-[10px] text-gray-500">
            Last played with: <span className="text-white/70">{String(pet.last_toy_id).replace(/-/g, ' ')}</span>
          </div>
        ) : null}
      </div>
      <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
        <div className="text-xs text-gray-500 mb-2">Mission board</div>
        <div className="space-y-2">
          {(pet.missions || []).map((mission) => {
            const pct = mission.target > 0 ? (mission.progress / mission.target) * 100 : 0;
            return (
              <div key={mission.id} className="rounded-xl border border-white/[0.05] bg-black/20 p-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-cyan-200/70">{mission.cadence}</div>
                    <div className="text-sm font-semibold text-white/85">{mission.label}</div>
                    <div className="text-[11px] text-gray-500">{mission.desc}</div>
                  </div>
                  <button
                    onClick={() => onClaimMission(mission.id)}
                    disabled={!mission.complete || mission.claimed || missionBusyId === mission.id}
                    className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-all ${
                      mission.claimed
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/15'
                        : mission.complete
                          ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/20 hover:bg-cyan-500/20'
                          : 'bg-white/[0.04] text-gray-500 border border-white/[0.05]'
                    } disabled:opacity-50`}
                  >
                    {mission.claimed ? 'Claimed' : mission.complete ? 'Claim' : `${mission.progress}/${mission.target}`}
                  </button>
                </div>
                <div className="mt-2 w-full h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-sky-300 transition-all duration-500" style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <div className="mt-1 text-[10px] text-gray-500">{mission.reward_summary}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
        <div className="text-xs text-gray-500 mb-2">Memory album</div>
        <div className="space-y-2">
          {(pet.memories || []).map((memory) => (
            <div key={memory.id} className="rounded-xl border border-white/[0.05] bg-black/20 px-3 py-2">
              <div className="text-[11px] font-semibold text-white/80">{memory.title}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{memory.detail}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
        <div className="text-xs text-gray-500 mb-1">How this grows</div>
        <ul className="text-[11px] space-y-0.5 list-disc list-inside">
          <li>Play style shapes your pet specialty over time</li>
          <li>Bond rank rises through care, missions, and activities</li>
          <li>Mastery paths turn your habits into long-term pet identity</li>
          <li>Combo keeps them fed while Bond Tokens feed deeper progression</li>
        </ul>
      </div>
    </div>
  );
}

function HabitatTab({ pet, shop, combo, habitatBusy, onBuyItem, onEquipItem }) {
  const habitat = shop?.habitat || pet?.habitat_items || { backgrounds: [], props: [] };
  const sections = [
    { key: 'background', label: 'Backdrops', items: habitat.backgrounds || [] },
    { key: 'prop', label: 'Props', items: habitat.props || [] },
  ];

  return (
    <div className="space-y-4 text-sm text-gray-400">
      <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
        <div className="text-xs text-gray-500 mb-1">Habitat</div>
        <p className="text-[11px] text-white/75">Give your companion a room identity. Backdrops shift the mood of the habitat card, and props make the space feel lived in.</p>
      </div>
      {sections.map((section) => (
        <div key={section.key} className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="text-xs text-gray-500">{section.label}</div>
            <div className="text-[10px] font-semibold text-amber-300">{combo.toLocaleString()} Combo</div>
          </div>
          <div className="space-y-2">
            {section.items.map((item) => {
              const canAfford = combo >= item.cost;
              return (
                <div key={item.id} className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white/85">{item.name}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">{item.desc}</div>
                    </div>
                    <div className="text-[10px] text-amber-300 shrink-0">{item.cost}c</div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => (item.owned ? onEquipItem(item.id, section.key) : onBuyItem(item.id))}
                      disabled={habitatBusy || (!item.owned && !canAfford)}
                      className={`rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-all ${
                        item.active
                          ? 'bg-emerald-500/12 text-emerald-200 border border-emerald-500/15'
                          : item.owned
                            ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/20 hover:bg-cyan-500/20'
                            : canAfford
                              ? 'bg-white/[0.05] text-white/80 border border-white/[0.07] hover:border-white/15'
                              : 'bg-white/[0.03] text-gray-500 border border-white/[0.05]'
                      } disabled:opacity-50`}
                    >
                      {item.active ? 'Active' : item.owned ? 'Equip' : 'Buy'}
                    </button>
                    {item.active ? (
                      <button
                        onClick={() => onEquipItem('', section.key)}
                        disabled={habitatBusy}
                        className="rounded-lg px-2.5 py-1.5 text-[10px] font-semibold border border-white/[0.06] bg-white/[0.03] text-gray-400 hover:text-white/80 disabled:opacity-50"
                      >
                        Reset
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Food tab ─────────────────────────────────────────
function FoodTab({ shop, combo, economy, onBuy, buying }) {
  if (!shop) return <div className="text-center text-gray-500 text-sm py-4">Loading shop...</div>;
  return (
    <div className="space-y-1.5">
      {economy?.target_songs_per_week ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[11px] text-gray-400">
          Feeding is tuned to stay meaningful: plan around roughly <span className="font-semibold text-white/80">{economy.target_songs_per_week} songs/week</span> for steady upkeep.
        </div>
      ) : null}
      {shop.foods.map(food => {
        const canAfford = combo >= food.cost;
        return (
          <button key={food.id} onClick={() => onBuy(food.id)} disabled={buying || !canAfford}
            className={`w-full flex items-center gap-3 rounded-xl border p-2.5 transition-all duration-200 active:scale-[0.98]
              ${canAfford ? 'border-white/[0.06] bg-white/[0.02] hover:border-white/15' : 'border-white/[0.03] bg-white/[0.01] opacity-40'}
              disabled:opacity-40`}>
            <span className="text-xl w-8 text-center shrink-0">{food.emoji}</span>
            <div className="flex-1 text-left min-w-0">
              <div className="text-sm font-semibold text-white/80 truncate">{food.name}</div>
              <div className="text-[10px] text-gray-500 truncate">{food.desc}</div>
              <div className="flex gap-3 mt-0.5">
                <span className="text-[10px] text-orange-400">+{food.hunger} hunger</span>
                <span className="text-[10px] text-pink-400">+{food.happiness} happy</span>
                {food.preference === 'favorite' ? <span className="text-[10px] text-emerald-300">favorite</span> : null}
                {food.preference === 'disliked' ? <span className="text-[10px] text-rose-300">disliked</span> : null}
              </div>
            </div>
            <div className="text-xs font-bold text-amber-400 shrink-0">{food.cost}c</div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Clothing tab ─────────────────────────────────────
const COLOR_PRESETS = ['#E53935', '#FF9800', '#FFD700', '#43A047', '#1E88E5', '#7B1FA2', '#F06292', '#FFFFFF', '#607D8B', '#5D4037', '#1A1A2E', '#B0BEC5'];

function ClothingTab({ pet, shop, onBuy, onEquip, onUnequip, onSetColor, buying, colorPickerSlot, setColorPickerSlot }) {
  if (!shop) return <div className="text-center text-gray-500 text-sm py-4">Loading...</div>;
  const owned = pet.owned_items || [];
  const slots = [
    { key: 'hat', label: '👒 Hats', items: shop.clothing.hats, equipped: pet.equipped_hat, color: pet.hat_color },
    { key: 'top', label: '👔 Tops', items: shop.clothing.tops || [], equipped: pet.equipped_top, color: pet.top_color },
    { key: 'belt', label: '🥋 Belts', items: shop.clothing.belts, equipped: pet.equipped_belt, color: pet.belt_color },
    { key: 'shoes', label: '👟 Shoes', items: shop.clothing.shoes, equipped: pet.equipped_shoes, color: pet.shoes_color },
  ];

  return (
    <div className="space-y-4">
      {slots.map(slot => (
        <div key={slot.key}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-white/70">{slot.label}</span>
            {slot.equipped && (
              <div className="flex items-center gap-1.5">
                <button onClick={() => setColorPickerSlot(colorPickerSlot === slot.key ? null : slot.key)}
                  className="w-5 h-5 rounded-full border border-white/20 shrink-0" style={{ background: slot.color || '#888' }} title="Change color" />
                <button onClick={() => onUnequip(slot.key)} className="text-[10px] text-gray-500 hover:text-red-400 transition-colors">Remove</button>
              </div>
            )}
          </div>
          {/* Color picker */}
          {colorPickerSlot === slot.key && (
            <div className="flex flex-wrap gap-1.5 mb-2 p-2 bg-white/[0.03] rounded-lg border border-white/[0.06]">
              {COLOR_PRESETS.map(c => (
                <button key={c} onClick={() => { onSetColor(slot.key, c); setColorPickerSlot(null); }}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${slot.color === c ? 'border-white scale-110' : 'border-transparent hover:border-white/40'}`}
                  style={{ background: c }} />
              ))}
            </div>
          )}
          <div className="space-y-1">
            {slot.items.map(item => {
              const isOwned = item.owned || owned.includes(item.id);
              const isEquipped = slot.equipped === item.id;
              return (
                <div key={item.id} className={`flex items-center gap-2 rounded-lg border p-2 transition-all
                  ${isEquipped ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/[0.04] bg-white/[0.02]'}`}>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-white/80">{item.name}</span>
                  </div>
                  {isEquipped ? (
                    <span className="text-[10px] text-amber-400 font-bold">Worn</span>
                  ) : isOwned ? (
                    <button onClick={() => onEquip(item.id)} className="text-[10px] px-2 py-1 rounded bg-white/[0.06] text-white/60 hover:text-white transition-all">Equip</button>
                  ) : (
                    <button onClick={() => onBuy(item.id)} disabled={buying || (pet.combo_balance || 0) < item.cost}
                      className="text-[10px] px-2 py-1 rounded bg-white/[0.04] text-amber-400 hover:bg-white/[0.08] transition-all disabled:opacity-30">
                      {item.cost}c
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Tricks tab ───────────────────────────────────────
function TricksTab({ pet, onDemand, onPerform }) {
  return (
    <div className="space-y-1.5">
      {(pet.tricks || []).map(trick => {
        const isPending = pet.pending_trick === trick.id;
        const wasLast = pet.last_trick_performed === trick.id;
        return (
          <div key={trick.id} className={`rounded-xl border p-3 transition-all ${trick.unlocked ? 'border-white/[0.08] bg-white/[0.03]' : 'border-white/[0.04] bg-white/[0.01] opacity-50'}`}>
            <div className="flex items-center gap-3">
              <span className="text-lg">{trick.unlocked ? (isPending ? '🎯' : wasLast ? '⭐' : '✅') : '🔒'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white/80">{trick.name}</div>
                <div className="text-[10px] text-gray-500">{trick.description}</div>
                {trick.unlocked && <div className="text-[10px] text-amber-400/70 mt-0.5">+{trick.comboReward}c +{trick.happinessReward} happy</div>}
                {!trick.unlocked && (
                  <div className="mt-1 flex items-center gap-1.5">
                    <div className="flex-1 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-white/20 transition-all" style={{ width: `${Math.min(100, (trick.progress || 0) * 100)}%` }} />
                    </div>
                    <span className="text-[9px] text-gray-600">{trick.xp} XP</span>
                  </div>
                )}
              </div>
              {trick.unlocked && !isPending && (
                <button onClick={() => onDemand(trick.id)} disabled={!!pet.pending_trick}
                  className="text-[10px] font-semibold px-2 py-1.5 rounded-lg bg-white/[0.06] text-white/60 hover:text-white transition-all disabled:opacity-30">Demand</button>
              )}
              {isPending && (
                <button onClick={() => onPerform(trick.id)} className="text-[10px] font-bold px-2 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-all animate-pulse">Check</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
