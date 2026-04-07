import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getMyPet, adoptPet, feedPet, getPetCharacters, getPetShop,
  buyPetFood, buyPetItem, equipPetItem, unequipPetSlot,
  setPetColor, togglePetAvatar, demandTrick, performTrick,
  interactPet, doPetActivity, claimPetMission, buyPetToy, usePetToy,
  buyPetHabitatItem, equipPetHabitat,
} from '../utils/api';
import SpritePet from '../components/SpritePet';

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
  { id: 'mission', label: 'Ask Mission', icon: '🎯' },
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
    const iv = setInterval(() => setSpeechText(randomMsg(pet.mood)), 8000);
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
      showFeedback(`Fed ${r.food}! Yum!`);
      setSpeechText(r.pet_response || ['Mmm, delicious!', 'Om nom nom!', 'That hit the spot!'][Math.floor(Math.random() * 3)]);
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
    setInteractionBusy(true);
    interactPet('tap')
      .then((r) => {
        setPet(r.pet);
        if (r.reaction) setPetReaction(r.reaction);
        if (r.expression) setPetExpression(r.expression);
        setSpeechText(r.speech || randomMsg(r.pet?.mood || pet?.mood));
        setPetTapped(true);
        setTimeout(() => {
          setPetTapped(false);
          setPetReaction('');
          setPetExpression('');
        }, 900);
      })
      .catch((e) => console.error(e))
      .finally(() => setInteractionBusy(false));
  };

  const triggerPetResponse = (speech, reaction = '', expression = '', duration = 1200) => {
    if (reaction) setPetReaction(reaction);
    if (expression) setPetExpression(expression);
    if (speech) setSpeechText(speech);
    setPetTapped(true);
    setTimeout(() => {
      setPetTapped(false);
      setPetReaction('');
      setPetExpression('');
    }, duration);
  };

  const handlePetAction = async (actionId) => {
    if (interactionBusy) return;
    setInteractionBusy(true);
    try {
      const r = await interactPet(actionId);
      setPet(r.pet);
      triggerPetResponse(r.speech, r.reaction, r.expression);
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
      showFeedback('Activity complete');
      triggerPetResponse(r.speech, r.reaction, r.expression, 1500);
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
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-black tracking-tight">My {charName}</h1>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-gray-500">{experience.toLocaleString()} XP</span>
            <span className="text-xs font-bold text-amber-400">{combo_balance.toLocaleString()} Combo</span>
            <span className="text-xs font-bold text-cyan-300">{bond_tokens.toLocaleString()} Bond</span>
            {rare_shards > 0 ? <span className="text-xs font-bold text-fuchsia-300">{rare_shards} Shards</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleToggleAvatar}
            className={`text-[10px] px-2 py-1 rounded-lg border transition-all ${pet.is_pet_avatar ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-white/[0.06] text-gray-500 hover:text-white'}`}>
            {pet.is_pet_avatar ? 'Avatar ON' : 'Set Avatar'}
          </button>
          <button onClick={() => setShowSelect(true)} className="text-xs text-gray-500 hover:text-white border border-white/[0.06] rounded-lg px-2 py-1 transition-all">Switch</button>
        </div>
      </div>

      {/* Pet habitat */}
      <div className="sticky top-[56px] sm:top-[64px] z-30 -mx-2 mb-4 px-2 pt-1 pb-3 bg-gradient-to-b from-[#070b14] via-[#070b14]/95 to-transparent backdrop-blur-sm">
        <div className={`relative rounded-[1.6rem] border border-white/[0.06] overflow-hidden bg-gradient-to-b shadow-[0_18px_45px_rgba(0,0,0,0.28)] ${CHARACTER_BG[pet.character] || ''}`}>
          <HabitatBackdrop backgroundId={pet.habitat?.active_background} />
          <HabitatParticles character={pet.character} mood={pet.mood} />
          <HabitatPropDisplay propId={pet.habitat?.active_prop} />
          <div className="absolute top-3 right-3 z-10"><WeightBadge state={pet.weight_state} /></div>
          <div className="absolute top-3 left-3 z-10"><BondBadge rank={pet.bond_rank} /></div>
          <div className={`relative z-10 flex flex-col items-center px-4 pt-7 pb-5 min-h-[312px] sm:min-h-[332px] ${petTapped ? 'animate-[wiggle_400ms_ease]' : ''}`}>
            <div className="flex min-h-[210px] items-end justify-center">
              <SpritePet
                character={pet.character} weightState={pet.weight_state} mood={pet.mood}
                equippedHat={pet.equipped_hat} equippedBelt={pet.equipped_belt} equippedShoes={pet.equipped_shoes}
                equippedTop={pet.equipped_top}
                hatColor={pet.hat_color} beltColor={pet.belt_color} shoesColor={pet.shoes_color}
                topColor={pet.top_color}
                isEating={isEating} isTricking={isTricking} reaction={petReaction}
                expression={petExpression} foodId={activeFoodId}
                size={176} onClick={handlePetTap} />
            </div>
            {/* Speech bubble */}
            <div className="mt-1 relative max-w-[280px]">
              <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 bg-white/[0.06] border-l border-t border-white/[0.08]" />
              <div className="bg-white/[0.06] backdrop-blur-sm border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-gray-300 text-center italic transition-all duration-500">
                &ldquo;{speechText}&rdquo;
              </div>
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
            onAction={handlePetAction}
            onActivity={handleActivity}
            onClaimMission={handleClaimMission}
            onBuyToy={handleBuyToy}
            onUseToy={handleUseToy}
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

function HabitatPropDisplay({ propId }) {
  if (!propId) return null;

  if (propId === 'training-dummy') {
    return (
      <div className="pointer-events-none absolute right-5 bottom-5 z-[1] opacity-75">
        <div className="relative h-20 w-12">
          <div className="absolute bottom-0 left-1/2 h-8 w-1.5 -translate-x-1/2 rounded-full bg-amber-900/70" />
          <div className="absolute bottom-7 left-1/2 h-10 w-10 -translate-x-1/2 rounded-[999px] border border-amber-300/20 bg-amber-700/35" />
          <div className="absolute bottom-13 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-amber-200/30" />
        </div>
      </div>
    );
  }

  if (propId === 'lucky-banner') {
    return (
      <div className="pointer-events-none absolute left-5 top-12 z-[1] opacity-75">
        <div className="relative h-20 w-10">
          <div className="absolute left-1/2 top-0 h-20 w-[2px] -translate-x-1/2 bg-amber-100/35" />
          <div className="absolute left-1/2 top-2 h-10 w-8 -translate-x-1/2 rounded-md border border-amber-200/20 bg-rose-500/25" />
          <div className="absolute left-1/2 top-12 h-3 w-5 -translate-x-1/2 rounded-b-full bg-amber-300/25" />
        </div>
      </div>
    );
  }

  if (propId === 'boombox') {
    return (
      <div className="pointer-events-none absolute left-5 bottom-5 z-[1] opacity-80">
        <div className="relative h-12 w-20 rounded-xl border border-cyan-200/15 bg-cyan-950/35">
          <div className="absolute left-3 top-3 h-6 w-6 rounded-full border border-cyan-200/20 bg-black/30" />
          <div className="absolute right-3 top-3 h-6 w-6 rounded-full border border-cyan-200/20 bg-black/30" />
          <div className="absolute inset-x-8 top-4 h-2 rounded-full bg-cyan-100/15" />
        </div>
      </div>
    );
  }

  if (propId === 'trophy-stand') {
    return (
      <div className="pointer-events-none absolute right-5 top-14 z-[1] opacity-80">
        <div className="relative h-20 w-14">
          <div className="absolute left-1/2 top-0 h-7 w-8 -translate-x-1/2 rounded-b-[10px] border border-amber-200/20 bg-amber-300/25" />
          <div className="absolute left-1/2 top-6 h-8 w-2 -translate-x-1/2 bg-amber-800/50" />
          <div className="absolute bottom-0 left-1/2 h-5 w-12 -translate-x-1/2 rounded-lg bg-slate-900/55" />
        </div>
      </div>
    );
  }

  return null;
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
    <div className="rounded-xl border border-cyan-400/10 bg-cyan-500/[0.05] p-3">
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-cyan-200/80">Bond</span>
        <span className="font-mono text-cyan-100/80 tabular-nums">{bond}</span>
      </div>
      <div className="w-full h-2.5 bg-white/[0.04] rounded-full overflow-hidden border border-white/[0.04]">
        <div className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-sky-300 transition-all duration-700" style={{ width: `${currentProgress}%` }} />
      </div>
      <div className="mt-2 text-[10px] text-cyan-100/70">
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
function PetTab({ pet, shop, combo, economy, interactionBusy, activityBusy, missionBusyId, toyBusy, onAction, onActivity, onClaimMission, onBuyToy, onUseToy }) {
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
        <div className="text-xs text-gray-500 mb-2">Quick interactions</div>
        <div className="grid grid-cols-2 gap-2">
          {PET_ACTIONS.map((action) => (
            <button
              key={action.id}
              onClick={() => onAction(action.id)}
              disabled={interactionBusy}
              className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-left hover:border-white/15 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <div className="text-lg">{action.icon}</div>
              <div className="text-[11px] font-semibold text-white/80 mt-1">{action.label}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
        <div className="text-xs text-gray-500 mb-2">Activities</div>
        <div className="grid grid-cols-2 gap-2">
          {(pet.activities || []).map((activity) => (
            <button
              key={activity.id}
              onClick={() => onActivity(activity.id)}
              disabled={activityBusy}
              className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-left hover:border-white/15 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <div className="text-[11px] font-semibold text-white/85">{activity.label}</div>
              <div className="text-[10px] text-gray-500 mt-1">{activity.desc}</div>
            </button>
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
        <div className="grid grid-cols-2 gap-2">
          {(shop?.toys || []).map((toy) => {
            const owned = !!toy.owned || (pet.owned_toys || []).includes(toy.id);
            const favorite = toy.preference === 'favorite';
            const canAfford = combo >= toy.cost;
            return (
              <div key={toy.id} className="rounded-xl border border-white/[0.06] bg-black/20 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-white/85 truncate">{toy.name}</div>
                    <div className="text-[10px] text-gray-500 mt-1">{toy.desc}</div>
                  </div>
                  {favorite ? <span className="shrink-0 rounded-full border border-emerald-400/15 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-200">fav</span> : null}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
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
