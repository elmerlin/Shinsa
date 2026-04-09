import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  getMyPet, adoptPet, getPetCharacters, getPetShop,
  buyPetFood, buyPetItem, equipPetItem, unequipPetSlot,
  setPetColor, togglePetAvatar, demandTrick, performTrick,
  interactPet, doPetActivity, claimPetMission, buyPetToy, usePetToy,
  buyPetHabitatItem, equipPetHabitat, setPetTrainingPath, getPetLeaderboard,
  getPetSocialFeed, renamePet, getMiniPumpStats, getMiniPumpLeaderboard, completeMiniPump,
  getPetInvadersStats, getPetInvadersLeaderboard, completePetInvaders,
  getPacItUpStats, getPacItUpLeaderboard, completePacItUp, getMinigameCosts,
  completeCurrentPetRequest, dismissCurrentPetRequest,
  getOrCreateDirectConversation,
} from '../utils/api';
import SpritePet, { renderPetToCanvas } from '../components/SpritePet';
import PetCoachPanel from '../components/pet/PetCoachPanel';
import PetToyOverlay from '../components/pet/PetToyOverlay';
import PetMomentCard from '../components/pet/PetMomentCard';
import MiniPumpLauncher from '../components/pet/minigames/MiniPumpLauncher';
import MiniPumpModal from '../components/pet/minigames/MiniPumpModal';
import PetInvadersLauncher from '../components/pet/minigames/PetInvadersLauncher';
import PetInvadersModal from '../components/pet/minigames/PetInvadersModal';
import PacItUpLauncher from '../components/pet/minigames/PacItUpLauncher';
import PacItUpModal from '../components/pet/minigames/PacItUpModal';
import UserPickerDialog from '../components/UserPickerDialog';

// ─── Sound ─────────────────────────────────────────────────────────
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx || _audioCtx.state === 'closed') _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}
function playSynth(freq, endFreq, type = 'sine', dur = 0.15, vol = 0.10) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + dur);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur + 0.02);
  } catch (e) { /* Audio not available */ }
}
function playPetBoop() { playSynth(800, 400, 'sine', 0.12, 0.10); }
function playPetPraise() { playSynth(520, 780, 'sine', 0.18, 0.09); }
function playPetCuddle() { playSynth(340, 280, 'triangle', 0.22, 0.08); }
function playPetTease() { playSynth(600, 900, 'square', 0.10, 0.06); }
function playPetPerform() {
  playSynth(440, 660, 'sine', 0.12, 0.09);
  setTimeout(() => playSynth(660, 880, 'sine', 0.14, 0.08), 130);
}
function playPetActivity() { playSynth(380, 520, 'triangle', 0.20, 0.08); }
function playPetFeed(pref) {
  if (pref === 'favorite') { playSynth(500, 800, 'sine', 0.15, 0.10); setTimeout(() => playSynth(800, 1000, 'sine', 0.12, 0.07), 160); }
  else if (pref === 'disliked') { playSynth(300, 200, 'sawtooth', 0.18, 0.06); }
  else { playSynth(440, 550, 'sine', 0.14, 0.08); }
}
function playPetRare() {
  playSynth(600, 900, 'sine', 0.14, 0.08);
  setTimeout(() => playSynth(900, 1200, 'triangle', 0.18, 0.07), 160);
}
const VERB_SOUND = { tap: playPetBoop, praise: playPetPraise, cuddle: playPetCuddle, tease: playPetTease, perform: playPetPerform, mission: playPetBoop };

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
    { speech: 'Focus!', reaction: 'nod', expression: 'sparkle' },
    { speech: '*quick stretch*', reaction: 'hop', expression: 'grin' },
    { speech: 'Not bad.', reaction: 'sway', expression: 'soft' },
  ],
  buu: [
    { speech: 'Hehehe.', reaction: 'squish', expression: 'smirk' },
    { speech: 'More pats.', reaction: 'wobble', expression: 'grin' },
    { speech: 'I know I am cute.', reaction: 'swagger', expression: 'proud' },
    { speech: '*happy wiggle*', reaction: 'hop', expression: 'excited' },
    { speech: 'Mmhmm.', reaction: 'sway', expression: 'soft' },
    { speech: 'You may continue.', reaction: 'nod', expression: 'sparkle' },
  ],
  devit: [
    { speech: 'Heh.', reaction: 'hop', expression: 'grin' },
    { speech: 'Again!', reaction: 'dart', expression: 'excited' },
    { speech: 'Caught you.', reaction: 'mischief', expression: 'smirk' },
    { speech: 'Too slow!', reaction: 'swish', expression: 'wink' },
    { speech: '*chaos giggle*', reaction: 'wobble', expression: 'grin' },
    { speech: 'Do that again.', reaction: 'nod', expression: 'sparkle' },
  ],
  pixiu: [
    { speech: 'Fortune favours us.', reaction: 'bless', expression: 'sparkle' },
    { speech: '*tail swish*', reaction: 'sway', expression: 'soft' },
    { speech: 'A fine tribute.', reaction: 'nod', expression: 'proud' },
    { speech: 'Blessed touch.', reaction: 'hop', expression: 'grin' },
    { speech: '*warm glow*', reaction: 'wobble', expression: 'sparkle' },
    { speech: 'The stars notice.', reaction: 'proud', expression: 'wink' },
  ],
};
const _tapIndex = { dojocat: 0, buu: 0, devit: 0, pixiu: 0 };

const PET_ACTIONS = [
  { id: 'praise', label: 'Praise', icon: '✨' },
  { id: 'cuddle', label: 'Cuddle', icon: '🫶' },
  { id: 'tease', label: 'Tease', icon: '😼' },
  { id: 'perform', label: 'Perform', icon: '🎭', minBond: 40 },
  { id: 'mission', label: 'Mission', icon: '🎯' },
];

// ─── Tabs ─────────────────────────────────────────────────────────
const TABS = ['pet', 'habitat', 'food', 'clothing', 'tricks', 'ranks'];

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
  const [leaderboard, setLeaderboard] = useState(null);
  const [activeToyVisual, setActiveToyVisual] = useState(null);
  const [socialFeed, setSocialFeed] = useState(null);
  const [shareStatus, setShareStatus] = useState(''); // '' | 'capturing' | 'done'
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [shareDmOpen, setShareDmOpen] = useState(false);
  const [shareDmSentResults, setShareDmSentResults] = useState(null);
  const [rankInfoModal, setRankInfoModal] = useState(null); // { type: 'bond'|'form', data }
  const [editingName, setEditingName] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [miniPumpOpen, setMiniPumpOpen] = useState(false);
  const [miniPumpStats, setMiniPumpStats] = useState(null);
  const [miniPumpLeaderboard, setMiniPumpLeaderboard] = useState(null);
  const [petInvadersOpen, setPetInvadersOpen] = useState(false);
  const [petInvadersStats, setPetInvadersStats] = useState(null);
  const [petInvadersLeaderboard, setPetInvadersLeaderboard] = useState(null);
  const [pacItUpOpen, setPacItUpOpen] = useState(false);
  const [pacItUpStats, setPacItUpStats] = useState(null);
  const [pacItUpLeaderboard, setPacItUpLeaderboard] = useState(null);
  const [minigameCosts, setMinigameCosts] = useState(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const habitatRef = useRef(null);

  const loadPet = useCallback(async () => {
    try {
      const [petRes, charRes] = await Promise.all([getMyPet(), getPetCharacters()]);
      setPet(petRes.pet);
      setEconomy(petRes.economy || null);
      setCharacters(charRes.characters || []);
      if (!petRes.pet) setShowSelect(true);
      if (petRes.pet) setSpeechText(petRes.pet.time_greeting || randomMsg(petRes.pet.mood));
      // Load minigame costs lazily
      if (!minigameCosts) getMinigameCosts().then(setMinigameCosts).catch(() => {});
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

  useEffect(() => {
    if (user) {
      loadPet();
      loadShop();
      getPetSocialFeed().then(setSocialFeed).catch(() => {});
      getMiniPumpLeaderboard().then((r) => setMiniPumpLeaderboard(r.leaderboard || [])).catch(() => {});
    }
    else setLoading(false);
  }, [user, loadPet, loadShop]);

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
      playPetFeed(r.food_preference);
      if (r.rare) playPetRare();
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
        setRareSpeech(false);
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
        if (r.rare) playPetRare();
        const charKey = r.pet?.character || pet?.character || 'dojocat';
        const characterResponses = PET_REACTIONS[charKey] || [];
        let fallback = null;
        if (characterResponses.length > 0) {
          const idx = (_tapIndex[charKey] || 0) % characterResponses.length;
          fallback = characterResponses[idx];
          _tapIndex[charKey] = idx + 1;
        }
        setPet(r.pet);
        // Tap warnings
        if (r.tap_warning === 'diminished') {
          showFeedback('Taps fading \u2014 try other interactions');
        } else if (r.tap_warning === 'annoyed') {
          showFeedback('\u26A0\uFE0F Pet is annoyed by over-tapping!');
        } else if (r.stat_changes?.length) {
          showFeedback(r.stat_changes.join('  '));
        }
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
    (VERB_SOUND[actionId] || playPetBoop)();
    setInteractionBusy(true);
    try {
      const r = await interactPet(actionId);
      if (r.rare) playPetRare();
      setPet(r.pet);
      if (r.streak?.day) showFeedback(`\uD83D\uDD25 Day ${r.streak.day} streak! +${r.streak.bonus} bond bonus`);
      else if (r.stat_changes?.length) showFeedback(r.stat_changes.join('  '));
      triggerPetResponse(r.speech, r.reaction, r.expression, 1200, r.rare);
    } catch (e) {
      showFeedback(e?.message || 'Could not interact');
    } finally {
      setInteractionBusy(false);
    }
  };

  // Activity-specific extended animations — hold pose longer, use activity-unique reaction
  const ACTIVITY_ANIM = {
    train: { reaction: 'kata', expression: 'proud', duration: 2000 },
    play:  { reaction: 'hop', expression: 'grin', duration: 1800 },
    groom: { reaction: 'bless', expression: 'soft', duration: 2200 },
    rest:  { reaction: 'sway', expression: 'soft', duration: 2400 },
    spar:  { reaction: 'dart', expression: 'excited', duration: 1800 },
    explore: { reaction: 'swish', expression: 'sparkle', duration: 2000 },
  };

  const handleActivity = async (activityId) => {
    if (activityBusy) return;
    playPetActivity();
    setActivityBusy(true);
    try {
      const r = await doPetActivity(activityId);
      if (r.rare) playPetRare();
      setPet(r.pet);
      showFeedback(r.stat_changes?.length ? r.stat_changes.join('  ') : `${r.activity || activityId} complete`);
      // Use activity-specific animation with longer duration so the user can see the difference
      const anim = ACTIVITY_ANIM[activityId] || {};
      triggerPetResponse(
        r.speech,
        r.reaction || anim.reaction || '',
        r.expression || anim.expression || '',
        anim.duration || 1500,
        r.rare,
      );
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

  const handleClaimCurrentRequest = async () => {
    if (requestBusy) return;
    setRequestBusy(true);
    try {
      const r = await completeCurrentPetRequest();
      setPet(r.pet);
      showFeedback('Request rewards claimed');
      triggerPetResponse('Perfect. That helped a lot.', 'nod', 'sparkle', 1500);
    } catch (e) {
      showFeedback(e?.message || 'Request is not ready yet');
    } finally {
      setRequestBusy(false);
    }
  };

  const handleDismissCurrentRequest = async () => {
    if (requestBusy) return;
    setRequestBusy(true);
    try {
      const r = await dismissCurrentPetRequest();
      setPet(r.pet);
      showFeedback('Request cleared');
    } catch (e) {
      showFeedback(e?.message || 'Could not clear request');
    } finally {
      setRequestBusy(false);
    }
  };

  const handleRequestCta = async (request) => {
    const target = request?.cta_target;
    if (target === 'food') {
      setTab('food');
      loadShop();
      return;
    }
    if (target === 'pet') {
      setTab('pet');
      return;
    }
    if (target === 'pump') {
      showFeedback('Play Pump, then refresh here to check progress');
      const petData = await getMyPet().catch(() => null);
      if (petData?.pet) setPet(petData.pet);
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
      const dur = r.toy_visual?.duration_ms || 1600;
      triggerPetResponse(r.speech, r.reaction, r.expression, dur);
      showFeedback(r.preference === 'favorite' ? 'Favourite toy time' : 'Toy chest opened');
      if (r.toy_visual?.overlay_id) {
        setActiveToyVisual(r.toy_visual);
        setTimeout(() => setActiveToyVisual(null), dur + 200);
      }
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

  // ─── Generate pet share image (returns data URL or null) ─
  const generateShareImage = async () => {
    if (!pet || shareStatus === 'capturing') return;
    setShareStatus('capturing');
    try {
      const W = 600, H = 800;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');

      // ─── Capture habitat background (walls, floor, props) via html-to-image ───
      const habitatEl = habitatRef.current;
      let habitatImg = null;
      if (habitatEl) {
        try {
          // Hide UI overlays and pet sprite — keep habitat scenery
          const excludeEls = habitatEl.querySelectorAll('[data-share-exclude], .pixel-pet-wrap');
          excludeEls.forEach(el => { el.dataset._prevVis = el.style.visibility; el.style.visibility = 'hidden'; });
          const { toPng } = await import('html-to-image');
          const habitatDataUrl = await toPng(habitatEl, { cacheBust: true, pixelRatio: 2, backgroundColor: null });
          // Restore visibility
          excludeEls.forEach(el => { el.style.visibility = el.dataset._prevVis || ''; delete el.dataset._prevVis; });
          // Load as Image for canvas drawing
          habitatImg = await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = habitatDataUrl;
          });
        } catch (captureErr) {
          console.warn('Habitat capture failed, using fallback', captureErr);
          // Restore visibility on error
          const excludeEls = habitatEl?.querySelectorAll('[data-share-exclude], .pixel-pet-wrap');
          excludeEls?.forEach(el => { el.style.visibility = el.dataset._prevVis || ''; delete el.dataset._prevVis; });
        }
      }

      // ─── Draw background ───
      if (habitatImg) {
        // Draw captured habitat as the top portion of the card
        const hAspect = habitatImg.width / habitatImg.height;
        const drawH = Math.min(W / hAspect, 520);
        ctx.drawImage(habitatImg, 0, 0, W, drawH);
        // Darken bottom fade for text readability
        const fade = ctx.createLinearGradient(0, drawH - 100, 0, drawH);
        fade.addColorStop(0, 'rgba(7,11,20,0)');
        fade.addColorStop(1, 'rgba(7,11,20,1)');
        ctx.fillStyle = fade;
        ctx.fillRect(0, drawH - 100, W, 100);
        // Fill below habitat
        ctx.fillStyle = '#070b14';
        ctx.fillRect(0, drawH, W, H - drawH);
      } else {
        // Fallback gradient background
        const BG_COLORS = { dojocat: ['#0a1628', '#0f2845'], buu: ['#1a0a28', '#2d0f45'], devit: ['#280a0a', '#451515'], pixiu: ['#1a1a0a', '#2d3015'] };
        const [c1, c2] = BG_COLORS[pet.character] || BG_COLORS.dojocat;
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, c1);
        grad.addColorStop(1, c2);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      // ─── Render pet at center (pushed down to avoid speech bubble overlap) ───
      const pixelSize = 5;
      const petW = 60 * pixelSize;
      const petX = (W - petW) / 2;
      const petY = habitatImg ? 160 : 240;
      renderPetToCanvas(ctx, {
        character: pet.character,
        weightState: pet.weight_state,
        mood: pet.mood,
        pose: 'wave',
        equippedHat: pet.equipped_hat,
        equippedBelt: pet.equipped_belt,
        equippedShoes: pet.equipped_shoes,
        equippedTop: pet.equipped_top,
        hatColor: pet.hat_color,
        beltColor: pet.belt_color,
        shoesColor: pet.shoes_color,
        topColor: pet.top_color,
        x: petX,
        y: petY,
        pixelSize,
      });

      // ─── Pet name ───
      const displayName = pet.nickname || (pet.character || 'pet').toUpperCase();
      ctx.textAlign = 'center';
      ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(displayName, W / 2, 560);

      // ─── Level + Bond rank ───
      ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(`Lv.${pet.level || 1}`, W / 2 - 60, 585);
      ctx.fillStyle = 'rgba(120,200,255,0.7)';
      ctx.fillText(pet.bond_rank?.label?.toUpperCase() || 'TRAINING PARTNER', W / 2 + 30, 585);

      // ─── Stats row ───
      const stats = [
        { label: 'XP', value: String(pet.experience || 0), color: '#a78bfa' },
        { label: 'BOND', value: String(pet.bond || 0), color: '#67d4ff' },
        { label: 'TRUST', value: String(Math.round(pet.trust || 0)), color: '#6ee7b7' },
        { label: 'STREAK', value: `${pet.daily_streak || 0}d`, color: '#fbbf24' },
      ];
      const statY = 640;
      const statSpacing = 130;
      const statStart = (W - statSpacing * (stats.length - 1)) / 2;
      stats.forEach((s, i) => {
        const sx = statStart + i * statSpacing;
        ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = s.color;
        ctx.fillText(s.value, sx, statY);
        ctx.font = '600 10px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillText(s.label, sx, statY + 16);
      });

      // ─── Form badge ───
      if (pet.form?.label) {
        ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText(pet.form.label, W / 2, 700);
      }

      // ─── Branding ───
      ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillText('PUMP SHINSA', W / 2, 760);

      // ─── Export ───
      const dataUrl = canvas.toDataURL('image/png');
      return dataUrl;
    } catch (e) {
      console.error('Share image generation failed', e);
      return null;
    }
  };

  function dataUrlToBlob(url) {
    const [hdr, data] = url.split(',');
    const mime = hdr.match(/:(.*?);/)[1];
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  const handleShareSaveImage = async () => {
    if (!pet || shareStatus === 'capturing') return;
    setShareStatus('capturing');
    setShareMenuOpen(false);
    try {
      const dataUrl = await generateShareImage();
      if (!dataUrl) { setShareStatus(''); alert('Could not generate share image.'); return; }
      const charName = pet.character || 'pet';
      const displayName = pet.nickname || (pet.character || 'pet').toUpperCase();
      const blob = dataUrlToBlob(dataUrl);
      const file = new File([blob], `shinsa-${charName}.png`, { type: 'image/png' });
      if (typeof navigator?.share === 'function') {
        try {
          await navigator.share({ files: [file], title: `${displayName} \u2014 Pump Shinsa` });
          setShareStatus('done'); setTimeout(() => setShareStatus(''), 2000); return;
        } catch (shareErr) {
          if (shareErr?.name === 'AbortError') { setShareStatus('done'); setTimeout(() => setShareStatus(''), 2000); return; }
        }
      }
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = blobUrl; a.download = `shinsa-${charName}.png`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      setShareStatus('done'); setTimeout(() => setShareStatus(''), 2000);
    } catch (e) { console.error('Share failed', e); setShareStatus(''); alert('Could not generate share image.'); }
  };

  const handleShareToDmOpen = () => {
    setShareMenuOpen(false);
    setShareDmSentResults(null);
    setShareDmOpen(true);
  };

  const handleShareDmClose = () => {
    setShareDmOpen(false);
    setShareDmSentResults(null);
  };

  const handleShareDmSend = async (targetUser) => {
    try {
      const dataUrl = await generateShareImage();
      if (!dataUrl) {
        setShareStatus('');
        throw new Error('Could not generate pet card.');
      }
      const displayName = pet.nickname || (pet.character || 'pet').toUpperCase();
      await getOrCreateDirectConversation(targetUser.id, {
        content: `Check out my pet ${displayName}!`,
        link_share: {
          kind: 'link',
          path: '/pet',
          title: `${displayName} — Lv.${pet.level || 1}`,
          subtitle: `${pet.bond_rank?.label || 'Training Partner'} • ${pet.form?.label || 'Fresh Form'}`,
          previewImage: dataUrl,
        },
      });
      setShareDmSentResults({ users: [targetUser], squads: [] });
      setShareStatus('done');
      setTimeout(() => setShareStatus(''), 2000);
    } catch (e) {
      console.error('DM share failed', e);
      setShareStatus('');
      throw e instanceof Error ? e : new Error('Could not send pet card.');
    }
  };

  // ─── Rename pet ─────────────────────────────────────────
  const handleStartRename = () => {
    setNicknameInput(pet?.nickname || '');
    setEditingName(true);
  };
  const handleSaveNickname = async () => {
    if (renameBusy) return;
    setRenameBusy(true);
    try {
      const res = await renamePet(nicknameInput.trim());
      setPet(res.pet);
      setEditingName(false);
    } catch (e) { console.error('Rename failed', e); }
    finally { setRenameBusy(false); }
  };

  // ─── Mini-Pump minigame ─────────────────────────────
  const handleOpenMiniPump = () => {
    setMiniPumpOpen(true);
    if (!miniPumpStats) getMiniPumpStats().then(setMiniPumpStats).catch(() => {});
    if (!miniPumpLeaderboard) getMiniPumpLeaderboard().then((r) => setMiniPumpLeaderboard(r.leaderboard || [])).catch(() => {});
  };
  const handleMiniPumpComplete = async (results) => {
    try {
      const r = await completeMiniPump(results);
      setMiniPumpStats(r);
      getMiniPumpLeaderboard().then((lb) => setMiniPumpLeaderboard(lb.leaderboard || [])).catch(() => {});
      // Refresh pet to reflect updated rewards and vitals
      const petData = await getMyPet();
      if (petData?.pet) setPet(petData.pet);
    } catch (e) { console.error('Mini-pump save failed', e); }
  };

  // ─── Pet Invaders minigame ─────────────────────────
  const handleOpenPetInvaders = () => {
    setPetInvadersOpen(true);
    if (!petInvadersStats) getPetInvadersStats().then(setPetInvadersStats).catch(() => {});
    if (!petInvadersLeaderboard) getPetInvadersLeaderboard().then((r) => setPetInvadersLeaderboard(r.leaderboard || [])).catch(() => {});
  };
  const handlePetInvadersComplete = async (results) => {
    try {
      const r = await completePetInvaders(results);
      setPetInvadersStats(r);
      getPetInvadersLeaderboard().then((lb) => setPetInvadersLeaderboard(lb.leaderboard || [])).catch(() => {});
      const petData = await getMyPet();
      if (petData?.pet) setPet(petData.pet);
    } catch (e) { console.error('Pet-invaders save failed', e); }
  };

  // ─── Pac It Up minigame ───────────────────────────
  const handleOpenPacItUp = () => {
    setPacItUpOpen(true);
    if (!pacItUpStats) getPacItUpStats().then(setPacItUpStats).catch(() => {});
    if (!pacItUpLeaderboard) getPacItUpLeaderboard().then((r) => setPacItUpLeaderboard(r.leaderboard || [])).catch(() => {});
  };
  const handlePacItUpComplete = async (results) => {
    try {
      const r = await completePacItUp(results);
      setPacItUpStats(r);
      getPacItUpLeaderboard().then((lb) => setPacItUpLeaderboard(lb.leaderboard || [])).catch(() => {});
      const petData = await getMyPet();
      if (petData?.pet) setPet(petData.pet);
    } catch (e) { console.error('Pac-it-up save failed', e); }
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
          <p className="text-gray-400 text-sm">Play songs to earn Combo, then spend it on food, rest, and care.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {characters.map((c) => (
            <button key={c.id} onClick={() => handleAdopt(c.id)} disabled={adopting}
              className="group relative rounded-2xl border border-white/[0.06] p-5 text-left bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04] hover:shadow-[0_8px_32px_rgba(0,0,0,0.2)] active:scale-[0.97] transition-all duration-300 disabled:opacity-50"
              style={{ animation: `pop-in 400ms ease-out backwards`, animationDelay: `${150}ms` }}>
              <div className="flex justify-center mb-3 transition-transform duration-300 group-hover:scale-105 group-hover:-translate-y-1">
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
  const wellbeing = pet.wellbeing || {};
  const progression = pet.progression || {};
  const needs = Array.isArray(pet.needs) ? pet.needs : [];
  const currentRequest = pet.current_request || null;
  const {
    bond = progression.bond ?? 0,
    combo_balance = progression.combo_balance ?? 0,
    bond_tokens = progression.bond_tokens ?? 0,
    rare_shards = progression.rare_shards ?? 0,
    experience = progression.experience ?? 0,
  } = progression;
  const hunger = wellbeing.hunger ?? pet.hunger ?? 50;
  const energy = wellbeing.energy ?? pet.energy ?? 65;
  const trust = wellbeing.trust ?? pet.trust ?? 35;
  const momentum = wellbeing.momentum ?? pet.momentum ?? pet.hype ?? 25;
  const moodState = pet.mood_state || wellbeing.mood_state || 'stable';

  const BOND_RANK_TABLE = [
    { threshold: 0, label: 'Training Partner', desc: 'Your first bond rank — you\'re just starting to build a relationship with your companion.' },
    { threshold: 40, label: 'Pad Gremlin', desc: 'Your pet has claimed a spot on the pad and refuses to leave. You\'re becoming familiar.' },
    { threshold: 90, label: 'Dojo Mascot', desc: 'Your companion is known around the dojo. A real presence in the scene.' },
    { threshold: 160, label: 'Arena Spirit', desc: 'The crowd feels your pet\'s energy. A bond forged through shared intensity.' },
    { threshold: 260, label: 'Blessed Beast', desc: 'A bond this deep brings blessings. Your companion radiates rare energy.' },
    { threshold: 400, label: 'Legendary Bond', desc: 'Few reach this depth. Your companion has become part of your legend.' },
    { threshold: 600, label: 'Eternal Companion', desc: 'An unbreakable bond. This companion has been through everything with you.' },
    { threshold: 900, label: 'Mythic Guardian', desc: 'Your companion has transcended the mortal dojo. A guardian of myth and rhythm.' },
    { threshold: 1300, label: 'Celestial Warden', desc: 'A guardian between realms. Your bond resonates across dimensions.' },
    { threshold: 1800, label: 'Astral Sovereign', desc: 'Sovereign of the stars. Your companion\'s presence warps reality itself.' },
    { threshold: 2500, label: 'Primordial Spirit', desc: 'A bond older than the dojo itself. Your companion remembers the first beat.' },
    { threshold: 3500, label: 'Void Walker', desc: 'Your companion has peered beyond the veil and returned with forbidden knowledge.' },
    { threshold: 5000, label: 'World Shaper', desc: 'The dojo reshapes itself around your companion. Reality bends to your bond.' },
    { threshold: 7000, label: 'Rhythm Incarnate', desc: 'Your companion IS the rhythm. Every beat in every song echoes your bond.' },
    { threshold: 10000, label: 'The Eternal One', desc: 'There is no rank beyond this. You and your companion are one. Always have been.' },
  ];
  const FORM_TABLE = [
    { id: 'fresh', label: 'Fresh Form', bond: 0, mastery: 0, desc: 'A young companion still finding its rhythm.', aura: 'calm' },
    { id: 'trusted', label: 'Trusted Form', bond: 90, mastery: 45, desc: 'A companion visibly shaped by routine and trust.', aura: 'bonded' },
    { id: 'showcase', label: 'Showcase Form', bond: 190, mastery: 120, desc: 'A polished companion that turns heads.', aura: 'spotlight' },
    { id: 'ascendant', label: 'Ascendant Form', bond: 320, mastery: 220, desc: 'A scene-defining companion presence.', aura: 'legend' },
    { id: 'beyond', label: 'Beyond Form', bond: 500, mastery: 400, desc: 'A companion that has surpassed all known limits.', aura: 'transcendent' },
    { id: 'mythic', label: 'Mythic Form', bond: 900, mastery: 600, desc: 'An ancient companion of unfathomable depth and devotion.', aura: 'divine' },
    { id: 'celestial', label: 'Celestial Form', bond: 1300, mastery: 850, desc: 'A companion that channels the stars themselves.', aura: 'celestial' },
    { id: 'astral', label: 'Astral Form', bond: 1800, mastery: 1200, desc: 'A being of pure rhythm and light, beyond mortal understanding.', aura: 'astral' },
    { id: 'primordial', label: 'Primordial Form', bond: 2500, mastery: 1800, desc: 'The first form. The last form. A companion that simply IS.', aura: 'primordial' },
    { id: 'void', label: 'Void Form', bond: 3500, mastery: 2100, desc: 'A companion that has seen beyond the veil and returned changed.', aura: 'void' },
    { id: 'world-shaper', label: 'World Shaper Form', bond: 5000, mastery: 3000, desc: 'Reality reshapes at every step. The dojo exists because this companion wills it.', aura: 'worldshaper' },
    { id: 'omniscient', label: 'Omniscient Form', bond: 7000, mastery: 4200, desc: 'A companion that perceives every rhythm across every dimension simultaneously.', aura: 'omniscient' },
    { id: 'eternal', label: 'Eternal Form', bond: 10000, mastery: 6000, desc: 'Time itself bends around this companion. There is no beginning. There is no end.', aura: 'eternal' },
  ];

  function getBondRankInfo(currentRank, currentBond) {
    const currentIdx = BOND_RANK_TABLE.findIndex(r => r.label === currentRank?.label);
    const nextRank = BOND_RANK_TABLE[currentIdx + 1];
    return {
      title: currentRank?.label || 'Training Partner',
      desc: BOND_RANK_TABLE[currentIdx]?.desc || 'Build bond by playing songs, feeding, and interacting with your pet.',
      requirements: nextRank ? [
        { label: 'Bond needed', value: `${nextRank.threshold}`, met: currentBond >= nextRank.threshold },
      ] : null,
      currentTier: nextRank ? `${currentBond} / ${nextRank.threshold} bond to ${nextRank.label}` : 'Max bond rank reached!',
    };
  }

  function getFormInfo(currentForm, currentBond, currentMastery) {
    const currentIdx = FORM_TABLE.findIndex(f => f.id === currentForm?.id);
    const nextForm = FORM_TABLE[currentIdx + 1];
    return {
      title: currentForm?.label || 'Fresh Form',
      desc: FORM_TABLE[currentIdx]?.desc || 'Forms evolve as your bond and mastery grow.',
      requirements: nextForm ? [
        { label: 'Bond needed', value: `${nextForm.bond}`, met: currentBond >= nextForm.bond },
        { label: 'Mastery XP needed', value: `${nextForm.mastery}`, met: currentMastery >= nextForm.mastery },
      ] : null,
      currentTier: nextForm ? `Next: ${nextForm.label}` : 'Ultimate form achieved!',
    };
  }

  const charName = characters.find(c => c.id === pet.character)?.name || pet.character;
  const nextTrick = pet.next_trick;
  const pendingTrickObj = pet.tricks?.find(t => t.id === pet.pending_trick);

  return (
    <div className="max-w-lg mx-auto p-4 sm:p-6 pb-24">
      {/* Header */}
      <div className="mb-2 rounded-[1.25rem] border border-white/[0.06] bg-white/[0.025] px-3.5 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={nicknameInput}
                  onChange={e => setNicknameInput(e.target.value.substring(0, 20))}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveNickname(); if (e.key === 'Escape') setEditingName(false); }}
                  className="w-full max-w-[160px] bg-white/10 border border-white/20 rounded-lg px-2 py-0.5 text-sm font-bold text-white outline-none focus:border-cyan-400/50"
                  placeholder={charName}
                  autoFocus
                  maxLength={20}
                />
                <button onClick={handleSaveNickname} disabled={renameBusy} className="text-[10px] text-emerald-400 font-bold hover:text-emerald-300">Save</button>
                <button onClick={() => setEditingName(false)} className="text-[10px] text-gray-500 hover:text-gray-300">&times;</button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <h1 className="truncate text-lg font-black tracking-tight text-white">{pet.nickname || `My ${charName}`}</h1>
                <button onClick={handleStartRename} className="text-gray-500 hover:text-white transition-colors" title="Rename pet">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path d="M13.5 3.3a1.1 1.1 0 00-1.6 0L4.6 10.6l-.6 2 2-.6L13.5 4.8a1.1 1.1 0 000-1.5zM3 13h10v1H3v-1z" /></svg>
                </button>
              </div>
            )}
            <div className="mt-1 inline-flex max-w-full items-center rounded-full border border-cyan-400/15 bg-cyan-500/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100/85">
              <span className="truncate whitespace-nowrap">{pet.identity_title || 'Training Partner'}</span>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <HeaderIconButton
              label={pet.is_pet_avatar ? 'Pet avatar on' : 'Set pet avatar'}
              title={pet.is_pet_avatar ? 'Pet avatar on' : 'Set pet avatar'}
              active={pet.is_pet_avatar}
              onClick={handleToggleAvatar}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M12 12.75a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2.25c-4.83 0-8.75 2.46-8.75 5.5 0 .41.34.75.75.75h16a.75.75 0 0 0 .75-.75c0-3.04-3.92-5.5-8.75-5.5Z" />
              </svg>
            </HeaderIconButton>
            <div className="relative">
              <HeaderIconButton
                label={shareStatus === 'capturing' ? 'Saving...' : shareStatus === 'done' ? 'Shared!' : 'Share pet'}
                title="Share pet"
                active={shareStatus === 'done' || shareMenuOpen}
                disabled={shareStatus === 'capturing'}
                onClick={() => setShareMenuOpen(v => !v)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M15.75 8.25a3 3 0 1 0-2.82-3.99l-4.71 2.36a3 3 0 0 0 0 2.76l4.71 2.36a3 3 0 1 0 .67-1.34l-4.71-2.36a3.02 3.02 0 0 0 0-.72l4.71-2.36a3 3 0 0 0 2.15.93Z" />
                </svg>
              </HeaderIconButton>
              {shareMenuOpen && (
                <>
                  <div className="fixed inset-0 z-[70]" onClick={() => setShareMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1.5 z-[71] w-48 rounded-xl border border-white/[0.08] bg-[#0e1420]/95 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.5)] overflow-hidden animate-[slideDown_150ms_ease-out]">
                    <button onClick={handleShareToDmOpen} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-gray-200 hover:bg-white/[0.06] transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-cyan-400 shrink-0"><path d="M3.505 2.365A41.369 41.369 0 0 1 9 2c1.863 0 3.697.124 5.495.365 1.247.167 2.18 1.108 2.435 2.268a4.45 4.45 0 0 0-.577-.069 43.141 43.141 0 0 0-4.706 0C9.229 4.696 7.5 6.727 7.5 8.998v2.24c0 1.413.67 2.735 1.76 3.562l-2.98 2.98A.75.75 0 0 1 5 17.25v-3.443c-.501-.14-.97-.357-1.388-.642A4.216 4.216 0 0 1 2 10.085V5.075c0-1.419 1.076-2.565 2.505-2.71ZM15.989 5.07A41.197 41.197 0 0 0 11.647 4.8c-1.562.085-2.897 1.7-2.897 3.198v2.24c0 1.272.816 2.67 2.897 2.962.683.096 1.38.158 2.084.184l2.549 2.549a.75.75 0 0 0 1.28-.531v-2.903a3.466 3.466 0 0 0 .56-.542c.593-.737.93-1.652.93-2.72V8.998c0-2.27-1.728-3.843-4.06-3.928Z" /></svg>
                      Send to DM
                    </button>
                    <div className="h-px bg-white/[0.04]" />
                    <button onClick={handleShareSaveImage} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-gray-200 hover:bg-white/[0.06] transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-amber-400 shrink-0"><path d="M13.75 7h-3v5.296l1.943-2.048a.75.75 0 0 1 1.114 1.004l-3.25 3.5a.75.75 0 0 1-1.114 0l-3.25-3.5a.75.75 0 1 1 1.114-1.004L9.25 12.296V7H5.75a.75.75 0 0 1 0-1.5h8a.75.75 0 0 1 0 1.5ZM5 15.25a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1-.75-.75Z" /></svg>
                      Save image
                    </button>
                  </div>
                </>
              )}
            </div>
            <HeaderIconButton
              label="Switch companion"
              title="Switch companion"
              onClick={() => setShowSelect(true)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M4.5 7.5A2.25 2.25 0 0 1 6.75 5.25h9.19l-1.72-1.72a.75.75 0 1 1 1.06-1.06l3 3a.75.75 0 0 1 0 1.06l-3 3a.75.75 0 0 1-1.06-1.06l1.72-1.72H6.75A.75.75 0 0 0 6 7.5v1.5a.75.75 0 0 1-1.5 0V7.5Zm15 9A2.25 2.25 0 0 1 17.25 18.75H8.06l1.72 1.72a.75.75 0 1 1-1.06 1.06l-3-3a.75.75 0 0 1 0-1.06l3-3a.75.75 0 0 1 1.06 1.06l-1.72 1.72h9.19a.75.75 0 0 0 .75-.75V15a.75.75 0 0 1 1.5 0v1.5Z" />
              </svg>
            </HeaderIconButton>
          </div>
        </div>
        {/* Level + XP progress bar */}
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-[11px] font-black text-amber-400">Lv.{pet.level || 1}</span>
          <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-500" style={{ width: `${Math.round((pet.level_progress || 0) * 100)}%` }} />
          </div>
          <span className="text-[9px] text-gray-500">{(pet.current_level_xp || 0).toLocaleString()}/{(pet.next_level_xp || 100).toLocaleString()} XP</span>
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
        <div ref={habitatRef} className={`habitat-wrap relative rounded-[1.6rem] border border-white/[0.06] overflow-hidden bg-gradient-to-b shadow-[0_18px_45px_rgba(0,0,0,0.28)] ${CHARACTER_BG[pet.character] || ''}`}>
          <HabitatBackdrop backgroundId={pet.habitat?.active_background} />
          <HabitatFloorDisplay floorId={pet.habitat?.active_floor} />
          <HabitatWallDisplay wallId={pet.habitat?.active_wall} />
          <HabitatParticles character={pet.character} mood={pet.mood} />
          <HabitatPropDisplay propId={pet.habitat?.active_prop} />
          <div className="absolute top-3 right-3 z-10">
            <WeightBadge state={pet.weight_state} />
          </div>
          <div data-share-exclude="true" className="absolute top-3 left-3 z-20">
            <button type="button" onClick={(e) => { e.stopPropagation(); setRankInfoModal(getBondRankInfo(pet.bond_rank, bond)); }} className="cursor-pointer block">
              <BondBadge rank={pet.bond_rank} />
            </button>
          </div>
          {pet.form?.label ? (
            <div data-share-exclude="true" className="absolute left-1/2 top-10 z-20 -translate-x-1/2">
              <button type="button" onClick={(e) => { e.stopPropagation(); setRankInfoModal(getFormInfo(pet.form, bond, pet.mastery?.mastery_xp || 0)); }} className="cursor-pointer block">
                <FormBadge form={pet.form} />
              </button>
            </div>
          ) : null}
          <div data-share-exclude="true" className={`relative z-10 flex flex-col items-center justify-end px-4 pt-16 pb-3 min-h-[290px] sm:min-h-[310px] ${petTapped ? 'animate-[wiggle_400ms_ease]' : ''}`}>
            {/* Speech bubble — single instance, above pet */}
            <div className="mb-2 relative max-w-[240px]">
              <div className={`backdrop-blur-sm border rounded-xl px-3 py-1.5 text-[13px] text-center italic transition-all duration-500 animate-[speech-float_300ms_ease-out] ${
                rareSpeech
                  ? 'bg-amber-500/[0.08] border-amber-400/20 text-amber-200 shadow-[0_0_16px_rgba(245,158,11,0.12)]'
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
            <div className="flex items-end justify-center relative">
              <SpritePet
                character={pet.character} weightState={pet.weight_state} mood={pet.mood}
                equippedHat={pet.equipped_hat} equippedBelt={pet.equipped_belt} equippedShoes={pet.equipped_shoes}
                equippedTop={pet.equipped_top}
                hatColor={pet.hat_color} beltColor={pet.belt_color} shoesColor={pet.shoes_color}
                topColor={pet.top_color}
                isEating={isEating} isTricking={isTricking} reaction={petReaction}
                expression={petExpression} foodId={activeFoodId}
                actionState={activeToyVisual?.action_state || ''}
                size={170} onClick={handlePetTap} />
              <PetToyOverlay
                overlayId={activeToyVisual?.overlay_id}
                active={!!activeToyVisual}
                durationMs={activeToyVisual?.duration_ms || 1600}
              />
            </div>
          </div>
          {/* Demand banner */}
          {pet.pending_trick && (
            <div data-share-exclude="true" className="relative z-10 mx-4 mb-4">
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
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-black/90 border border-white/10 rounded-xl px-4 py-2 text-sm text-white font-semibold shadow-[0_8px_32px_rgba(0,0,0,0.4)] animate-[slideDown_250ms_cubic-bezier(0.34,1.56,0.64,1)] backdrop-blur-md">
          {feedbackMsg}
        </div>
      )}

      <div className="mt-3 space-y-2.5">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] px-3.5 py-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <VitalBar label="Hunger" value={hunger} color="orange" />
            <VitalBar label="Energy" value={energy} color="cyan" />
            <VitalBar label="Trust" value={trust} color="emerald" />
            <VitalBar label="Momentum" value={momentum} color="violet" />
          </div>
          <div className="flex items-center gap-3 pt-1 border-t border-white/[0.04]">
            <MoodBadge moodState={moodState} />
            <div className="flex-1" />
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-[0.12em] text-white/40">Wellbeing</div>
              <div className="text-sm font-black text-white/85 tabular-nums">{Math.round((pet.reward_multiplier || 1) * 100)}%</div>
            </div>
          </div>
          {needs.length > 0 && <NeedsPanel needs={needs} />}
        </div>
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
            <StatCard label="Mood" value={capitalize(moodState)} />
            <StatCard label="Streak" value={pet.daily_streak ? `${pet.daily_streak}d` : '—'} />
            <StatCard label="Specialty" value={pet.specialty?.label || '—'} />
          </div>

          {/* Tab bar */}
          <div className="mt-4 flex rounded-xl border border-white/[0.06] overflow-hidden bg-white/[0.01]">
            {TABS.map(t => (
              <button key={t} onClick={() => { setTab(t); if (t === 'food' || t === 'clothing' || t === 'habitat') loadShop(); if (t === 'ranks' && !leaderboard) getPetLeaderboard().then(r => setLeaderboard(r.leaderboard)).catch(() => {}); }}
                className={`flex-1 py-2 text-[10px] sm:text-xs font-semibold capitalize transition-all duration-200 relative ${tab === t ? 'bg-white/[0.08] text-white shadow-[inset_0_-2px_0_rgba(34,211,238,0.4)]' : 'text-gray-500 hover:text-white/70 hover:bg-white/[0.03]'}`}>
                {t === 'food' ? '🍖 Food' : t === 'clothing' ? '👒 Gear' : t === 'tricks' ? '⭐ Tricks' : t === 'habitat' ? '🏠 Room' : t === 'ranks' ? '🏆 Ranks' : '🐾 Pet'}
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
                socialFeed={socialFeed}
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
                onTabSwitch={setTab}
                onMiniPump={handleOpenMiniPump}
                miniPumpStats={miniPumpStats}
                miniPumpLeaderboard={miniPumpLeaderboard}
                onPetInvaders={handleOpenPetInvaders}
                petInvadersStats={petInvadersStats}
                petInvadersLeaderboard={petInvadersLeaderboard}
                onPacItUp={handleOpenPacItUp}
                pacItUpStats={pacItUpStats}
                pacItUpLeaderboard={pacItUpLeaderboard}
                minigameCosts={minigameCosts}
                comboBalance={combo_balance}
                currentRequest={currentRequest}
                requestBusy={requestBusy}
                onClaimCurrentRequest={handleClaimCurrentRequest}
                onDismissCurrentRequest={handleDismissCurrentRequest}
                onRequestCta={handleRequestCta}
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
            {tab === 'ranks' && <LeaderboardTab leaderboard={leaderboard} myCharacter={pet.character} />}
          </div>

      <p className="text-[10px] text-gray-600 text-center mt-4">Sync PIU scores to earn Combo and Momentum, then turn that into food, rest, and stronger bond growth.</p>

      <style>{`
        @keyframes slideDown { from { opacity: 0; transform: translate(-50%, -12px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes wiggle { 0%,100% { transform: rotate(0); } 25% { transform: rotate(-3deg); } 75% { transform: rotate(3deg); } }
        @keyframes float-up { 0% { opacity: 0.5; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-50px) scale(0.5); } }
        @keyframes pulse-glow { 0%,100% { opacity: 0.15; } 50% { opacity: 0.3; } }
        @keyframes unlock-pop { 0% { transform: scale(0.8); opacity: 0; } 50% { transform: scale(1.05); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes breathe { 0%,100% { box-shadow: 0 0 0 0 transparent; } 50% { box-shadow: 0 0 18px 2px var(--breathe-color, rgba(34,211,238,0.12)); } }
        @keyframes bar-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }
        @keyframes critical-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.7; } }
        @keyframes pop-in { 0% { transform: scale(0.85); opacity: 0; } 60% { transform: scale(1.04); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes glow-ring { 0%,100% { box-shadow: 0 0 0 0 transparent; } 50% { box-shadow: 0 0 0 3px var(--ring-color, rgba(255,255,255,0.08)); } }
        @keyframes speech-float { 0% { transform: translateY(3px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
        @keyframes habitat-breathe { 0%,100% { opacity: 0.85; } 50% { opacity: 1; } }
        .vital-bar-fill { position: relative; overflow: hidden; }
        .vital-bar-fill::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent); animation: bar-shimmer 2.5s ease-in-out infinite; }
        .vital-critical { animation: critical-pulse 1.5s ease-in-out infinite; }
        .action-btn { transition: all 200ms cubic-bezier(0.34, 1.56, 0.64, 1); }
        .action-btn:hover { transform: translateY(-1px); }
        .action-btn:active { transform: translateY(0) scale(0.97); }
        .habitat-wrap { animation: habitat-breathe 6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
          .vital-bar-fill::after { animation: none; }
        }
      `}</style>

      {/* Mini-Pump game modal */}
      <MiniPumpModal
        open={miniPumpOpen}
        onClose={() => setMiniPumpOpen(false)}
        character={pet?.character || 'dojocat'}
        onComplete={handleMiniPumpComplete}
        stats={miniPumpStats}
        leaderboard={miniPumpLeaderboard}
      />

      {/* Pet Invaders game modal */}
      <PetInvadersModal
        open={petInvadersOpen}
        onClose={() => setPetInvadersOpen(false)}
        character={pet?.character || 'dojocat'}
        onComplete={handlePetInvadersComplete}
        stats={petInvadersStats}
        leaderboard={petInvadersLeaderboard}
      />

      {/* Pac It Up game modal */}
      <PacItUpModal
        open={pacItUpOpen}
        onClose={() => setPacItUpOpen(false)}
        character={pet?.character || 'dojocat'}
        onComplete={handlePacItUpComplete}
        stats={pacItUpStats}
        leaderboard={pacItUpLeaderboard}
      />

      <UserPickerDialog
        open={shareDmOpen}
        title="Send pet card"
        description={pet ? `Share ${pet.nickname || (pet.character || 'pet').toUpperCase()} with a player.` : ''}
        eyebrowLabel="Direct Messages"
        selectLabel="Send"
        submitLabel="Send"
        searchPlaceholder="Search players"
        onClose={handleShareDmClose}
        onSelect={handleShareDmSend}
        excludeUserIds={[user?.id].filter(Boolean)}
        multiSelect={false}
        sentResults={shareDmSentResults}
      />

      {/* Rank / Form info modal */}
      {rankInfoModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center" onClick={() => setRankInfoModal(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-xs mx-4 rounded-2xl border border-white/[0.08] bg-[#0c1018] shadow-[0_12px_50px_rgba(0,0,0,0.5)] overflow-hidden animate-[slideDown_200ms_ease-out]" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-1 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">{rankInfoModal.title}</h3>
              <button onClick={() => setRankInfoModal(null)} className="text-gray-500 hover:text-white text-lg leading-none">&times;</button>
            </div>
            <div className="px-5 pb-5 space-y-3">
              <p className="text-xs text-gray-400 leading-relaxed">{rankInfoModal.desc}</p>
              {rankInfoModal.requirements && (
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1.5">Requirements</div>
                  {rankInfoModal.requirements.map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-0.5">
                      <span className="text-gray-400">{r.label}</span>
                      <span className={`font-semibold ${r.met ? 'text-emerald-400' : 'text-gray-500'}`}>{r.value} {r.met ? '✓' : ''}</span>
                    </div>
                  ))}
                </div>
              )}
              {rankInfoModal.currentTier && (
                <div className="text-center text-[10px] text-white/30 pt-1">
                  Current: <span className="text-white/60 font-semibold">{rankInfoModal.currentTier}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────

function HabitatParticles({ character, mood }) {
  const accents = { dojocat: '#f5a623', buu: '#c98bbd', devit: '#e53935', pixiu: '#ffd54f' };
  const color = accents[character] || '#fff';
  const happy = ['happy', 'content', 'stuffed'].includes(mood);
  const particleCount = happy ? 7 : 3;
  // Use deterministic pseudo-random values based on index for stable renders
  const particles = Array.from({ length: particleCount }, (_, i) => ({
    size: 2 + ((i * 7 + 3) % 4),
    left: 8 + ((i * 31 + 11) % 84),
    bottom: ((i * 17 + 5) % 35),
    delay: ((i * 13 + 2) % 40) / 10,
    duration: 4 + ((i * 19 + 7) % 5),
  }));
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p, i) => (
        <div key={i} className="absolute rounded-full" style={{
          width: p.size, height: p.size, background: color,
          left: `${p.left}%`, bottom: `${p.bottom}%`, opacity: happy ? 0.2 : 0.12,
          animation: `float-up ${p.duration}s ease-out ${p.delay}s infinite`,
        }} />
      ))}
      {/* Central ambient glow */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{
        width: 200, height: 200, background: `radial-gradient(circle, ${color}0a 0%, transparent 70%)`, animation: 'pulse-glow 4s ease-in-out infinite',
      }} />
      {/* Secondary offset glow for depth */}
      <div className="absolute rounded-full" style={{
        width: 120, height: 120, left: '25%', top: '40%',
        background: `radial-gradient(circle, ${color}06 0%, transparent 70%)`, animation: 'pulse-glow 5s ease-in-out 1.5s infinite',
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
    'neon-alley': 'radial-gradient(circle at 30% 20%, rgba(255,80,180,0.14), transparent 38%), radial-gradient(circle at 70% 25%, rgba(80,200,255,0.12), transparent 35%), linear-gradient(180deg, rgba(30,10,50,0.22) 0%, rgba(3,7,18,0) 72%)',
    'sakura-garden': 'radial-gradient(circle at 50% 15%, rgba(255,180,200,0.16), transparent 40%), linear-gradient(180deg, rgba(120,50,80,0.14) 0%, rgba(3,7,18,0) 72%)',
    'thunderdome': 'radial-gradient(circle at 50% 20%, rgba(120,180,255,0.18), transparent 40%), radial-gradient(circle at 50% 60%, rgba(255,200,60,0.08), transparent 40%), linear-gradient(180deg, rgba(15,20,60,0.25) 0%, rgba(3,7,18,0) 72%)',
    'celestial-shrine': 'radial-gradient(circle at 50% 15%, rgba(255,230,180,0.12), transparent 35%), radial-gradient(circle at 50% 50%, rgba(200,160,255,0.08), transparent 40%), linear-gradient(180deg, rgba(40,20,60,0.20) 0%, rgba(3,7,18,0) 72%)',
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
  'punching-bag': {
    width: 16,
    pixels: [
      '______aaa_______',
      '_____abbba______',
      '_____abbba______',
      '______bbb_______',
      '_____cdddc______',
      '____cddddc______',
      '____cddddc______',
      '____cdeedc______',
      '____cddddc______',
      '____cddddc______',
      '____cddddc______',
      '_____cdddc______',
      '______ccc_______',
      '______fff_______',
      '_____fffff______',
      '________________',
    ],
    colors: { a: '#8a8a8a', b: '#b0b0b0', c: '#5a2a1a', d: '#8b4513', e: '#d4a574', f: '#3d3d3d' },
  },
  'arcade-cab': {
    width: 16,
    pixels: [
      '___aaaaaaaaa____',
      '___abbbbbba_____',
      '___abcccba______',
      '___abcdcba______',
      '___abcccba______',
      '___abbbbbba_____',
      '___aeeeeea______',
      '___aeffea_______',
      '___aeeeeea______',
      '___aaaaaa_______',
      '____affa________',
      '____affa________',
      '___affffa_______',
      '___affffa_______',
      '___agggga_______',
      '________________',
    ],
    colors: { a: '#1a1a2e', b: '#0f0f23', c: '#2a4a8a', d: '#5ac8fa', e: '#2d2d44', f: '#3a3a55', g: '#151525' },
  },
  'medal-rack': {
    width: 16,
    pixels: [
      '__aaaaaaaaaa____',
      '__abbbbbbbba____',
      '__aaaaaaaaaa____',
      '___cd__ef__g____',
      '___cd__ef__g____',
      '___hh__ii__jj___',
      '___hkh_ili_jmj__',
      '___hhh_iii_jjj__',
      '____h___i___j___',
      '________________',
      '________________',
      '________________',
      '________________',
      '________________',
      '________________',
      '________________',
    ],
    colors: { a: '#5a3a2a', b: '#8a6a4a', c: '#d4a017', d: '#ffd700', e: '#c0c0c0', f: '#e8e8e8', g: '#cd7f32', h: '#ffd700', i: '#c0c0c0', j: '#cd7f32', k: '#fff8dc', l: '#f0f0f0', m: '#deb887' },
  },
  'spirit-lantern': {
    width: 16,
    pixels: [
      '______aa________',
      '______aa________',
      '_____abba_______',
      '____abccba______',
      '____acdca_______',
      '____abccba______',
      '_____abba_______',
      '______ee________',
      '______ee________',
      '_____efffe______',
      '_____efffe______',
      '_____efffe______',
      '______eee_______',
      '______gg________',
      '______gg________',
      '________________',
    ],
    colors: { a: '#4a3060', b: '#8a60b0', c: '#e0c0ff', d: '#ffffff', e: '#3a2040', f: '#6040a0', g: '#2a1530' },
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
    'punching-bag': 'right-6 bottom-6',
    'arcade-cab': 'left-3 bottom-3',
    'medal-rack': 'right-3 top-14',
    'spirit-lantern': 'left-6 top-12',
  };
  return <PixelPropSprite art={PIXEL_PROP_ART[propId]} className={positions[propId] || 'right-4 bottom-4'} />;
}

function HabitatFloorDisplay({ floorId }) {
  if (!floorId) return null;
  const floors = {
    'tatami-mat': {
      background: 'repeating-linear-gradient(0deg, rgba(180,150,100,0.08) 0px, rgba(180,150,100,0.08) 2px, transparent 2px, transparent 8px)',
      borderTop: '1px solid rgba(180,150,100,0.12)',
    },
    'led-tiles': {
      background: 'repeating-linear-gradient(90deg, rgba(80,200,255,0.06) 0px, rgba(80,200,255,0.06) 12px, rgba(255,80,180,0.06) 12px, rgba(255,80,180,0.06) 24px)',
      boxShadow: 'inset 0 -2px 16px rgba(80,200,255,0.08)',
    },
    'cherry-petals': {
      background: 'radial-gradient(circle at 20% 40%, rgba(255,150,180,0.12) 0%, transparent 25%), radial-gradient(circle at 70% 60%, rgba(255,180,200,0.10) 0%, transparent 20%), radial-gradient(circle at 45% 30%, rgba(255,160,190,0.08) 0%, transparent 18%)',
    },
    'galaxy-floor': {
      background: 'radial-gradient(circle at 30% 50%, rgba(120,80,200,0.10) 0%, transparent 30%), radial-gradient(circle at 60% 40%, rgba(80,120,255,0.08) 0%, transparent 25%), radial-gradient(circle at 80% 70%, rgba(200,100,255,0.06) 0%, transparent 20%)',
      boxShadow: 'inset 0 0 20px rgba(120,80,200,0.06)',
    },
  };
  const style = floors[floorId];
  if (!style) return null;
  return (
    <div
      className="absolute bottom-0 left-0 right-0 h-[35%] pointer-events-none z-[1] opacity-90"
      style={style}
    />
  );
}

function HabitatWallDisplay({ wallId }) {
  if (!wallId) return null;
  const walls = {
    'dojo-scroll': (
      <div className="absolute top-14 right-6 pointer-events-none z-[1] opacity-80">
        <div className="w-3 h-10 rounded-sm" style={{ background: 'linear-gradient(180deg, #d4c4a0 0%, #b8a882 50%, #a89470 100%)', boxShadow: '0 2px 6px rgba(0,0,0,0.25)' }}>
          <div className="w-full h-[2px] bg-amber-900/30 mt-1" />
          <div className="w-full h-[2px] bg-amber-900/20 mt-1" />
          <div className="w-full h-[2px] bg-amber-900/20 mt-1" />
        </div>
      </div>
    ),
    'neon-sign': (
      <div className="absolute top-14 left-5 pointer-events-none z-[1]">
        <div className="px-1.5 py-0.5 rounded text-[7px] font-black tracking-wider" style={{
          color: '#ff80d0', textShadow: '0 0 6px rgba(255,80,200,0.5), 0 0 12px rgba(255,80,200,0.3)',
          border: '1px solid rgba(255,80,200,0.3)', background: 'rgba(255,80,200,0.06)',
        }}>STOMP</div>
      </div>
    ),
    'photo-wall': (
      <div className="absolute top-16 left-4 pointer-events-none z-[1] opacity-70 flex gap-0.5">
        <div className="w-3 h-2.5 rounded-[1px] bg-white/10 border border-white/[0.08]" />
        <div className="w-2.5 h-3 rounded-[1px] bg-white/8 border border-white/[0.06] mt-1" />
        <div className="w-3 h-2 rounded-[1px] bg-white/10 border border-white/[0.08] mt-0.5" />
      </div>
    ),
    'champion-banner': (
      <div className="absolute top-12 right-5 pointer-events-none z-[1] opacity-85">
        <div className="w-5 h-8 relative" style={{
          background: 'linear-gradient(180deg, #8b0000 0%, #cc2200 100%)',
          clipPath: 'polygon(0 0, 100% 0, 100% 70%, 50% 100%, 0 70%)',
          boxShadow: '0 2px 8px rgba(140,0,0,0.3)',
        }}>
          <div className="absolute top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-yellow-400/60" />
        </div>
      </div>
    ),
  };
  return walls[wallId] || null;
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
  if (!form) return null;
  const formStyles = {
    fresh: 'border-white/[0.08] text-gray-400',
    trusted: 'border-emerald-400/20 text-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.10)]',
    showcase: 'border-cyan-400/20 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.12)]',
    ascendant: 'border-amber-400/25 text-amber-300 shadow-[0_0_16px_rgba(245,158,11,0.15)]',
    beyond: 'border-purple-400/30 text-purple-300 shadow-[0_0_20px_rgba(168,85,247,0.18)] animate-pulse',
    mythic: 'border-rose-400/30 text-rose-200 shadow-[0_0_24px_rgba(244,63,94,0.20)] animate-pulse',
    celestial: 'border-sky-300/30 text-sky-200 shadow-[0_0_28px_rgba(56,189,248,0.22)] animate-pulse',
    astral: 'border-indigo-300/35 text-indigo-200 shadow-[0_0_32px_rgba(129,140,248,0.25)] animate-pulse',
    primordial: 'border-yellow-200/40 text-yellow-100 shadow-[0_0_36px_rgba(253,224,71,0.28)] animate-pulse',
    void: 'border-slate-300/40 text-slate-100 shadow-[0_0_32px_rgba(148,163,184,0.25)] animate-pulse',
    'world-shaper': 'border-teal-300/40 text-teal-100 shadow-[0_0_36px_rgba(94,234,212,0.28)] animate-pulse',
    omniscient: 'border-violet-200/45 text-violet-100 shadow-[0_0_40px_rgba(196,181,253,0.30)] animate-pulse',
    eternal: 'border-white/50 text-white shadow-[0_0_44px_rgba(255,255,255,0.35)] animate-pulse',
  };
  return (
    <span className={`rounded-full border bg-black/40 backdrop-blur-sm px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-all ${formStyles[form.id] || formStyles.fresh}`}>
      {form.label}
    </span>
  );
}

function HeaderIconButton({ label, title, active = false, disabled = false, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title || label}
      aria-label={label}
      disabled={disabled}
      className={`action-btn flex h-11 w-11 items-center justify-center rounded-2xl border disabled:opacity-50 ${
        active
          ? 'border-amber-400/25 bg-amber-500/[0.10] text-amber-200 shadow-[0_0_20px_rgba(245,158,11,0.12)]'
          : 'border-white/[0.08] bg-white/[0.03] text-gray-300 hover:border-white/15 hover:text-white hover:shadow-[0_0_16px_rgba(255,255,255,0.04)]'
      }`}
    >
      {children}
    </button>
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

function getVitalBand(value) {
  if (value < 20) return { label: 'Critical', tone: 'critical' };
  if (value < 40) return { label: 'Low', tone: 'low' };
  if (value < 70) return { label: 'Stable', tone: 'stable' };
  return { label: 'Thriving', tone: 'high' };
}

function VitalBar({ label, value, color }) {
  const hues = {
    orange: { lo: '0', hi: '35' },
    cyan: { lo: '185', hi: '200' },
    emerald: { lo: '140', hi: '155' },
    violet: { lo: '255', hi: '280' },
  };
  const h = hues[color] || hues.orange;
  const hue = value <= 30 ? h.lo : h.hi;
  const isCritical = value < 20;
  return (
    <div className={`transition-all duration-500 ${isCritical ? 'vital-critical' : ''}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-[0.12em] text-white/45">{label}</span>
        <span className={`text-[11px] font-bold tabular-nums transition-colors duration-500 ${isCritical ? 'text-rose-300' : 'text-white/80'}`}>{value}%</span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div className="vital-bar-fill relative h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: `linear-gradient(90deg, hsl(${hue}, 70%, 35%), hsl(${hue}, 70%, 50%))` }}>
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
    <div className="rounded-2xl border border-cyan-400/10 bg-white/[0.03] p-3" style={{ '--breathe-color': 'rgba(34,211,238,0.06)', animation: 'breathe 4s ease-in-out infinite' }}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">Bond</div>
          <div className="mt-1 text-2xl font-black tabular-nums text-white/90">{bond}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">Rank</div>
          <div className="mt-1 text-sm font-semibold text-cyan-100/80">{bondRank?.label || 'Training Partner'}</div>
        </div>
      </div>
      <div className="w-full h-2.5 bg-white/[0.04] rounded-full overflow-hidden border border-white/[0.04]">
        <div className="vital-bar-fill h-full rounded-full bg-gradient-to-r from-sky-700 to-cyan-300 transition-all duration-700 relative" style={{ width: `${currentProgress}%` }}>
          <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent rounded-full" />
        </div>
      </div>
      <div className="mt-2 text-[10px] text-cyan-100/70 px-0.5">
        {bondRank?.next_label ? `${bondRank.label} \u2192 ${bondRank.next_label}` : bondRank?.label || 'Training Partner'}
      </div>
    </div>
  );
}

function MoodBadge({ moodState }) {
  const tones = {
    thriving: 'border-emerald-400/20 bg-emerald-500/[0.10] text-emerald-200 shadow-[0_0_12px_rgba(52,211,153,0.10)]',
    stable: 'border-cyan-400/15 bg-cyan-500/[0.08] text-cyan-100',
    restless: 'border-amber-400/20 bg-amber-500/[0.10] text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.10)]',
    neglected: 'border-rose-400/20 bg-rose-500/[0.10] text-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.12)]',
  };
  const ringColors = { thriving: 'rgba(52,211,153,0.12)', neglected: 'rgba(244,63,94,0.10)' };
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] transition-all duration-500 ${tones[moodState] || tones.stable}`}
      style={ringColors[moodState] ? { '--ring-color': ringColors[moodState], animation: 'glow-ring 3s ease-in-out infinite' } : undefined}
    >
      {moodState}
    </span>
  );
}

function NeedsPanel({ needs = [] }) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">Needs now</div>
      <div className="flex flex-wrap gap-2">
        {needs.slice(0, 3).map((need) => (
          <div key={need.id} className={`rounded-xl border px-2.5 py-2 text-[11px] transition-all duration-300 ${
            need.priority === 'critical'
              ? 'border-rose-400/15 bg-rose-500/[0.08] text-rose-100 shadow-[0_0_12px_rgba(244,63,94,0.08)] vital-critical'
              : need.priority === 'high'
                ? 'border-amber-400/15 bg-amber-500/[0.08] text-amber-100 shadow-[0_0_8px_rgba(245,158,11,0.06)]'
                : 'border-white/[0.06] bg-white/[0.03] text-gray-200'
          }`}>
            <div className="font-semibold">{need.label}</div>
            <div className="mt-1 text-[10px] text-white/55">{need.detail}</div>
          </div>
        ))}
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

// ─── Collapsible section ─────────────────────────────
function CollapsibleSection({ title, icon, defaultOpen = true, count, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
      >
        {icon && <span className="text-sm">{icon}</span>}
        <span className="text-[11px] font-semibold text-gray-400 flex-1">{title}</span>
        {count != null && <span className="text-[9px] text-gray-600 tabular-nums">{count}</span>}
        <span className={`text-[10px] text-gray-600 transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`}>▾</span>
      </button>
      {open && <div className="px-1 pb-1 space-y-2">{children}</div>}
    </div>
  );
}

// ─── Pet tab ──────────────────────────────────────────
function PetTab({ pet, shop, combo, economy, socialFeed, interactionBusy, activityBusy, missionBusyId, toyBusy, trainingBusy, onAction, onActivity, onClaimMission, onBuyToy, onUseToy, onSetTrainingPath, onTabSwitch, onMiniPump, miniPumpStats, miniPumpLeaderboard, onPetInvaders, petInvadersStats, petInvadersLeaderboard, onPacItUp, pacItUpStats, pacItUpLeaderboard, minigameCosts, comboBalance, currentRequest, requestBusy, onClaimCurrentRequest, onDismissCurrentRequest, onRequestCta }) {
  const REACTION_ICONS = { cheer: '📣', wow: '🤩', flex: '💪', heart: '💗' };
  const claimableMissions = (pet.missions || []).filter(m => m.complete && !m.claimed).length;
  const needs = Array.isArray(pet.needs) ? pet.needs : [];
  return (
    <div className="space-y-3 text-sm text-gray-400">
      {/* ── Always visible: coach + needs ── */}
      {pet.companion_coach && (
        <PetCoachPanel coach={pet.companion_coach} character={pet.character} onTabSwitch={onTabSwitch} />
      )}
      <div className="rounded-xl border border-white/[0.05] bg-white/[0.03] p-3">
        <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">What your pet needs now</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {needs.slice(0, 3).map((need) => (
            <button
              key={need.id}
              type="button"
              onClick={() => {
                if (need.cta === 'food') onTabSwitch('food');
                else if (need.cta === 'pet') onTabSwitch('pet');
              }}
              className={`rounded-xl border px-3 py-2 text-left transition-all ${
                need.priority === 'critical'
                  ? 'border-rose-400/15 bg-rose-500/[0.08] text-rose-100'
                  : need.priority === 'high'
                    ? 'border-amber-400/15 bg-amber-500/[0.08] text-amber-100'
                    : 'border-white/[0.06] bg-black/20 text-gray-200'
              }`}
            >
              <div className="text-[11px] font-semibold">{need.label}</div>
              <div className="mt-1 text-[10px] text-white/55">{need.detail}</div>
            </button>
          ))}
        </div>
      </div>

      {currentRequest ? (
        <div className={`rounded-xl border p-3 transition-all duration-500 ${
          currentRequest.complete
            ? 'border-emerald-400/20 bg-emerald-500/[0.08] shadow-[0_0_20px_rgba(52,211,153,0.08)]'
            : 'border-cyan-400/15 bg-cyan-500/[0.06]'
        }`} style={currentRequest.complete ? { animation: 'pop-in 400ms ease-out' } : undefined}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">Current request</div>
              <div className="mt-1 text-sm font-semibold text-white/90">{currentRequest.label}</div>
              <div className="mt-1 text-[11px] text-white/70">{currentRequest.desc}</div>
              <div className="mt-2 text-[10px] text-white/55">{currentRequest.reward_summary}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className={`text-xs font-bold ${currentRequest.complete ? 'text-emerald-300' : 'text-cyan-200'}`}>
                {currentRequest.complete ? 'Ready' : `${currentRequest.progress}/${currentRequest.target}`}
              </div>
              <div className="mt-1 text-[10px] text-white/45">{currentRequest.type === 'pump-session' ? 'session goal' : 'care goal'}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {currentRequest.complete ? (
              <button
                type="button"
                onClick={onClaimCurrentRequest}
                disabled={requestBusy}
                className="action-btn rounded-lg border border-emerald-400/20 bg-emerald-500/[0.12] px-3 py-2 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/[0.18] hover:shadow-[0_0_16px_rgba(52,211,153,0.15)] disabled:opacity-50"
              >
                Claim rewards
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onRequestCta(currentRequest)}
                disabled={requestBusy}
                className="rounded-lg border border-cyan-400/20 bg-cyan-500/[0.12] px-3 py-2 text-[11px] font-semibold text-cyan-100 transition-all hover:bg-cyan-500/[0.16] disabled:opacity-50"
              >
                {currentRequest.cta_label || 'Do it'}
              </button>
            )}
            <button
              type="button"
              onClick={onDismissCurrentRequest}
              disabled={requestBusy}
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-white/70 transition-all hover:border-white/15 hover:text-white disabled:opacity-50"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Guide link ── */}
      <Link to="/pet/guide" className="action-btn flex items-center gap-2 rounded-xl border border-cyan-400/10 bg-cyan-500/[0.04] px-3 py-2 hover:bg-cyan-500/[0.06] hover:border-cyan-400/15 hover:shadow-[0_0_20px_rgba(34,211,238,0.06)] group">
        <span className="text-sm">📖</span>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold text-cyan-200 group-hover:text-cyan-100 transition-colors">Pet Companion Guide</div>
          <div className="text-[10px] text-gray-500">Play Pump, earn Combo and Momentum, then care for your companion</div>
        </div>
        <span className="text-[10px] text-gray-600 group-hover:text-gray-400 transition-all group-hover:translate-x-0.5">&rarr;</span>
      </Link>

      {/* ── Section 1: Play & Care (open) ── */}
      <CollapsibleSection title="Play & Care" icon="🎮" defaultOpen={true}>
        {/* Minigame launchers */}
        <div className="space-y-2 mb-3">
          <MiniPumpLauncher onPlay={onMiniPump} stats={miniPumpStats} cost={minigameCosts?.['mini-pump']} comboBalance={comboBalance} />
          <PetInvadersLauncher onPlay={onPetInvaders} stats={petInvadersStats} cost={minigameCosts?.['pet-invaders']} comboBalance={comboBalance} />
          <PacItUpLauncher onPlay={onPacItUp} stats={pacItUpStats} cost={minigameCosts?.['pac-it-up']} comboBalance={comboBalance} />
        </div>
        <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-gray-500">Interact</div>
            <div className="flex items-center gap-2">
              {pet.taps_today != null && (
                <div className={`text-[10px] tabular-nums ${
                  pet.taps_today >= (pet.tap_limit || 8) * 2 ? 'text-rose-400' : pet.taps_today >= (pet.tap_limit || 8) ? 'text-amber-400' : 'text-gray-600'
                }`}>
                  {pet.taps_today}/{pet.tap_limit || 8} taps
                </div>
              )}
              <div className="text-[10px] text-gray-600 tabular-nums">{pet.interactions_today || 0} today</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PET_ACTIONS.map((action) => {
              const locked = action.minBond && (pet.bond || 0) < action.minBond;
              return (
                <button
                  key={action.id}
                  onClick={() => !locked && onAction(action.id)}
                  disabled={interactionBusy || locked}
                  className={`action-btn flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50 ${
                    locked
                      ? 'border-white/[0.04] bg-white/[0.01] text-gray-600 cursor-not-allowed'
                      : 'border-white/[0.08] bg-white/[0.03] text-white/80 hover:border-white/15 hover:bg-white/[0.05] hover:shadow-[0_0_12px_rgba(255,255,255,0.04)]'
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
              const ACTIVITY_ICONS = { train: '\u{1F94B}', play: '\u{1F3AE}', groom: '\u{2728}', rest: '\u{1F4A4}', spar: '\u{1F94A}', explore: '\u{1FA7A}' };
              return (
                <button
                  key={activity.id}
                  onClick={() => !locked && onActivity(activity.id)}
                  disabled={activityBusy || locked}
                  className={`action-btn rounded-xl border px-3 py-2.5 text-left disabled:opacity-50 ${
                    locked
                      ? 'border-white/[0.04] bg-white/[0.01] cursor-not-allowed'
                      : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:shadow-[0_4px_16px_rgba(0,0,0,0.15)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{ACTIVITY_ICONS[activity.id] || '\u{1F3AF}'}</span>
                      <span className="text-[11px] font-semibold text-white/85">{activity.label}</span>
                    </div>
                    {locked && <span className="text-[9px] text-gray-600">&#128274;</span>}
                  </div>
                  {locked && activity.lock_reason && <div className="text-[9px] text-rose-300/60 mt-1">{activity.lock_reason}</div>}
                  {!locked && (
                    <div className="mt-1.5 space-y-0.5">
                      {/* Costs */}
                      {activity.costs?.length > 0 && (
                        <div className="flex flex-wrap gap-x-2 gap-y-0">
                          {activity.costs.map((c, i) => (
                            <span key={i} className="text-[9px] tabular-nums text-rose-300/70">{c.value} {c.stat}</span>
                          ))}
                        </div>
                      )}
                      {/* Gains */}
                      {activity.gains?.length > 0 && (
                        <div className="flex flex-wrap gap-x-2 gap-y-0">
                          {activity.gains.filter((g) => g.stat !== 'happiness').map((g, i) => (
                            <span key={i} className="text-[9px] tabular-nums text-emerald-300/70">+{g.value} {g.stat}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        {/* Toy chest */}
        <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="text-xs text-gray-500">Toys</div>
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
      </CollapsibleSection>

      {/* ── Section 2: Progress (open) ── */}
      <CollapsibleSection title="Progress" icon="📈" defaultOpen={true} count={claimableMissions ? `${claimableMissions} claimable` : null}>
        {/* Mastery */}
        <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <div className="text-xs text-gray-500">Mastery</div>
              <div className="text-sm font-semibold text-white/85 mt-0.5">
                {pet.mastery?.path?.icon ? `${pet.mastery.path.icon} ` : ''}{pet.mastery?.path?.label || 'Consistency'}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-base font-bold text-cyan-100 tabular-nums">{pet.mastery?.mastery_xp || 0}</div>
              <div className="text-[10px] text-cyan-200/75">{pet.mastery?.rank?.label || 'Rookie'}</div>
            </div>
          </div>
          <div className="w-full h-2.5 bg-white/[0.04] rounded-full overflow-hidden border border-white/[0.04]">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-sky-300 transition-all duration-700" style={{ width: `${Math.max(6, (pet.mastery?.rank?.progress || 0) * 100)}%` }} />
          </div>
          <div className="mt-2 text-[10px] text-gray-500">
            {pet.mastery?.rank?.next_label
              ? `${pet.mastery.rank.label} → ${pet.mastery.rank.next_label} at ${pet.mastery.rank.next_threshold} XP`
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
          {(pet.mastery?.milestones || []).length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Talent nodes</div>
              {(pet.mastery?.milestones || []).map((node, idx) => (
                <div key={node.id} className={`relative rounded-xl border px-3 py-2.5 transition-all ${node.unlocked ? 'border-emerald-400/15 bg-emerald-500/[0.06]' : 'border-white/[0.05] bg-black/20'}`}>
                  {idx > 0 && <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-px h-2 bg-white/10" />}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm">{node.unlocked ? '✅' : '🔒'}</span>
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-white/85">{node.title}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">{node.desc}</div>
                      </div>
                    </div>
                    <div className={`text-[10px] font-semibold shrink-0 ${node.unlocked ? 'text-emerald-300' : 'text-gray-500'}`}>
                      {node.unlocked ? 'Unlocked' : `${node.threshold} XP`}
                    </div>
                  </div>
                  {node.reward && (
                    <div className={`mt-1.5 flex items-center gap-1.5 rounded-lg px-2 py-1 text-[9px] ${
                      node.unlocked
                        ? 'bg-amber-500/[0.08] border border-amber-400/15 text-amber-200'
                        : 'bg-white/[0.02] border border-white/[0.04] text-gray-500'
                    }`}>
                      <span>{node.reward.type === 'title' ? '🏷️' : node.reward.type === 'habitat' ? '🏠' : '✨'}</span>
                      <span>{node.reward.label}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Missions */}
        <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
          <div className="text-xs text-gray-500 mb-2">Missions</div>
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
        {/* Milestones */}
        {(pet.milestones?.length > 0) && (
          <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-gray-500">Milestones</div>
              <div className="text-[10px] text-gray-600 tabular-nums">{pet.milestones.filter(m => m.unlocked).length}/{pet.milestones.length}</div>
            </div>
            {pet.daily_streak > 0 && (
              <div className="flex items-center gap-2 mb-2 rounded-lg border border-amber-500/10 bg-amber-500/[0.04] px-2.5 py-1.5">
                <span className="text-sm">{pet.daily_streak >= 7 ? '🔥' : '⚡'}</span>
                <div>
                  <div className="text-[11px] font-semibold text-amber-200">{pet.daily_streak}-day streak</div>
                  <div className="text-[9px] text-gray-500">Best: {pet.longest_streak || pet.daily_streak}d</div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              {pet.milestones.map(m => (
                <div key={m.id} className={`rounded-lg border px-2 py-1.5 text-[10px] ${m.unlocked ? 'border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-100/80' : 'border-white/[0.04] bg-black/20 text-gray-600'}`}>
                  {m.unlocked ? '✓ ' : '○ '}{m.label}
                </div>
              ))}
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* ── Section 3: Identity & Social (collapsed) ── */}
      <CollapsibleSection title="Identity & Social" icon="🪪" defaultOpen={false}>
        {/* Personality */}
        <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
          <div className="text-xs text-gray-500 mb-1">Personality</div>
          <p className="text-[11px] text-white/80">{pet.personality?.title}</p>
          <p className="text-[11px] mt-1">{pet.personality?.desc}</p>
        </div>
        {/* Likes & dislikes */}
        <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
          <div className="text-xs text-gray-500 mb-2">Likes & dislikes</div>
          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <div>
              <div className="text-emerald-300 mb-1">Favourites</div>
              <div className="flex flex-wrap gap-1">
                {(pet.food_preferences?.favorites || []).map((foodId) => (
                  <span key={foodId} className="px-2 py-0.5 rounded-full border border-emerald-400/15 bg-emerald-400/10 text-emerald-100/80">{foodId.replace(/-/g, ' ')}</span>
                ))}
              </div>
            </div>
            <div>
              <div className="text-rose-300 mb-1">Dislikes</div>
              <div className="flex flex-wrap gap-1">
                {(pet.food_preferences?.dislikes || []).map((foodId) => (
                  <span key={foodId} className="px-2 py-0.5 rounded-full border border-rose-400/15 bg-rose-400/10 text-rose-100/80">{foodId.replace(/-/g, ' ')}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* Social activity */}
        {socialFeed && (socialFeed.today_count > 0 || socialFeed.total_reactions > 0) && (
          <div className="bg-gradient-to-r from-amber-500/[0.06] to-pink-500/[0.04] rounded-xl p-3 border border-amber-400/10">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-sm">✨</span>
              <div className="text-xs text-amber-200 font-semibold">Social Activity</div>
            </div>
            {socialFeed.today_count > 0 ? (
              <>
                <p className="text-[11px] text-white/70 mb-2">
                  {socialFeed.today_count === 1
                    ? 'Someone interacted with your pet today!'
                    : `${socialFeed.today_count} reactions today!`}
                </p>
                <div className="flex flex-wrap gap-1">
                  {socialFeed.today_reactions.slice(0, 8).map((r, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 text-[10px]">
                      <span>{REACTION_ICONS[r.type] || '💬'}</span>
                      <span className="text-white/60 font-medium">{r.from}</span>
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-[11px] text-white/50">{socialFeed.total_reactions} reaction{socialFeed.total_reactions !== 1 ? 's' : ''} all-time.</p>
            )}
            {socialFeed.reactions?.length > 0 && (
              <div className="flex items-center gap-2.5 mt-2 pt-2 border-t border-white/[0.04]">
                {socialFeed.reactions.map(r => (
                  <span key={r.type} className="text-[10px] text-gray-400 flex items-center gap-0.5">
                    <span>{REACTION_ICONS[r.type]}</span>
                    <span className="tabular-nums">{r.count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Showcase */}
        {(() => {
          const moments = [];
          if (pet.form?.id && pet.form.id !== 'fresh') moments.push({ type: 'form_upgrade', title: pet.form.label, detail: pet.form.desc });
          if (pet.bond_rank?.label && (pet.bond || 0) >= 40) moments.push({ type: 'bond_rank', title: pet.bond_rank.label, detail: `Bond level ${pet.bond}` });
          if ((pet.mastery?.milestones || []).filter(m => m.unlocked).length > 0) {
            const latest = [...(pet.mastery?.milestones || [])].reverse().find(m => m.unlocked);
            if (latest) moments.push({ type: 'mastery_milestone', title: latest.title, detail: latest.desc });
          }
          if ((pet.daily_streak || 0) >= 7) moments.push({ type: 'streak_milestone', title: `${pet.daily_streak}-day streak`, detail: `Best: ${pet.longest_streak || pet.daily_streak}d` });
          if (!moments.length) return null;
          return (
            <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
              <div className="text-xs text-gray-500 mb-2">Showcase</div>
              <div className="space-y-2">
                {moments.slice(0, 3).map((m, i) => <PetMomentCard key={i} moment={m} />)}
              </div>
            </div>
          );
        })()}
      </CollapsibleSection>

      {/* ── Section 4: Journal (collapsed) ── */}
      <CollapsibleSection title="Journal" icon="📖" defaultOpen={false} count={`${(pet.memories || []).length}`}>
        <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
          {(() => {
            const grouped = {};
            (pet.memories || []).forEach(m => {
              const cat = m.category || 'other';
              if (!grouped[cat]) grouped[cat] = [];
              grouped[cat].push(m);
            });
            const catLabels = { firsts: '🌱 Firsts', bests: '🏆 Bests', social: '🤝 Social', endurance: '💪 Endurance', identity: '🪪 Identity', other: '📝 Other' };
            const catOrder = ['firsts', 'bests', 'social', 'endurance', 'identity', 'other'];
            const rarityColors = {
              legendary: 'border-amber-400/25 bg-amber-500/[0.08]',
              rare: 'border-purple-400/20 bg-purple-500/[0.06]',
              uncommon: 'border-cyan-400/15 bg-cyan-500/[0.04]',
              common: 'border-white/[0.05] bg-black/20',
            };
            const rarityDot = { legendary: 'text-amber-400', rare: 'text-purple-400', uncommon: 'text-cyan-400', common: 'text-gray-600' };
            return catOrder.filter(cat => grouped[cat]?.length).map(cat => (
              <div key={cat} className="mb-3 last:mb-0">
                <div className="text-[10px] text-gray-500 mb-1.5">{catLabels[cat] || cat}</div>
                <div className="space-y-1.5">
                  {grouped[cat].map(memory => (
                    <div key={memory.id} className={`rounded-xl border px-3 py-2 ${rarityColors[memory.rarity] || rarityColors.common}`}>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[8px] ${rarityDot[memory.rarity] || rarityDot.common}`}>●</span>
                        <div className="text-[11px] font-semibold text-white/80">{memory.title}</div>
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5 ml-3.5">{memory.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>
      </CollapsibleSection>

      {/* ── Section 5: Reference (collapsed) ── */}
      <CollapsibleSection title="Reference" icon="📋" defaultOpen={false}>
        {economy?.target_songs_per_week ? (
          <div className="bg-amber-500/[0.06] rounded-xl p-3 border border-amber-500/10">
            <div className="text-xs text-amber-300 mb-1">Upkeep target</div>
            <p className="text-[11px] text-amber-100/80">~{economy.target_songs_per_week} songs/week to stay comfortably fed.</p>
          </div>
        ) : null}
        <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
          <div className="text-xs text-gray-500 mb-2">Economy</div>
          <div className="space-y-1.5 text-[10px]">
            <div className="flex gap-2"><span>🎵</span><span><span className="text-amber-200 font-semibold">Combo</span> — from PIU plays. Buy food, gear, habitat, toys.</span></div>
            <div className="flex gap-2"><span>💎</span><span><span className="text-cyan-200 font-semibold">Bond Tokens</span> — from missions. For rare unlocks & gifts.</span></div>
            <div className="flex gap-2"><span>✨</span><span><span className="text-fuchsia-200 font-semibold">Rare Shards</span> — from events & HoP. For legendary items.</span></div>
          </div>
          <div className="mt-2 pt-2 border-t border-white/[0.04] space-y-0.5 text-[10px] text-gray-400">
            <div>🐾 Play style shapes specialty over time</div>
            <div>💗 Bond rises through care, missions, activities</div>
            <div>🧠 Mastery turns habits into long-term identity</div>
            <div>⭐ Form evolves: Fresh → Trusted → Showcase → Ascendant → Beyond</div>
          </div>
        </div>
      </CollapsibleSection>

      {/* ── Floating Companion toggle ── */}
      <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] px-3 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm">📎</span>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-gray-300">Companion Overlay</div>
            <div className="text-[10px] text-gray-600">Show your pet on every page</div>
          </div>
        </div>
        <CompanionToggle />
      </div>
    </div>
  );
}

function CompanionToggle() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem('pet_clippy_hidden') !== '1');
  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    if (next) {
      localStorage.removeItem('pet_clippy_hidden');
    } else {
      localStorage.setItem('pet_clippy_hidden', '1');
    }
    // Notify FloatingPetCompanion in real time
    window.dispatchEvent(new Event('pet-clippy-toggle'));
  };
  return (
    <button
      onClick={toggle}
      className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${enabled ? 'bg-cyan-500/40' : 'bg-white/[0.08]'}`}
    >
      <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200 ${enabled ? 'left-5 bg-cyan-400' : 'left-0.5 bg-gray-500'}`} />
    </button>
  );
}

function HabitatTab({ pet, shop, combo, habitatBusy, onBuyItem, onEquipItem }) {
  const habitat = pet?.habitat_items || shop?.habitat || { backgrounds: [], props: [], floor: [], wall: [] };
  const sections = [
    { key: 'background', label: 'Backdrops', items: habitat.backgrounds || [] },
    { key: 'prop', label: 'Props', items: habitat.props || [] },
    { key: 'floor', label: 'Floor', items: habitat.floor || [] },
    { key: 'wall', label: 'Wall', items: habitat.wall || [] },
  ];

  return (
    <div className="space-y-4 text-sm text-gray-400">
      <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
        <div className="text-xs text-gray-500 mb-1">Habitat</div>
        <p className="text-[11px] text-white/75">Give your companion a room identity. Backdrops shift the mood, props add character, and floor and wall decor make the space feel lived in.</p>
      </div>
      {sections.map((section) => {
        if (!section.items.length) return null;
        return (
          <div key={section.key} className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-xs text-gray-500">{section.label}</div>
              <div className="text-[10px] font-semibold text-amber-300">{combo.toLocaleString()} Combo</div>
            </div>
            <div className="space-y-2">
              {section.items.map((item) => {
                const canAfford = combo >= item.cost;
                const locked = item.locked;
                return (
                  <div key={item.id} className={`rounded-xl border px-3 py-2.5 ${locked ? 'border-white/[0.03] bg-black/30 opacity-60' : 'border-white/[0.06] bg-black/20'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <div className="text-sm font-semibold text-white/85">{item.name}</div>
                          {locked && <span className="text-[9px] text-gray-500">🔒</span>}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5">{item.desc}</div>
                        {locked && item.lock_reason && (
                          <div className="text-[9px] text-rose-300/60 mt-1">{item.lock_reason} required</div>
                        )}
                      </div>
                      <div className="text-[10px] text-amber-300 shrink-0">{item.cost}c</div>
                    </div>
                    {!locked && (
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
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Leaderboard tab ─────────────────────────────────────
function LeaderboardTab({ leaderboard, myCharacter }) {
  if (!leaderboard) return <div className="text-center text-gray-500 text-sm py-4"><div className="w-8 h-8 border-2 border-white/10 border-t-white/60 rounded-full animate-spin mx-auto" /></div>;
  if (!leaderboard.length) return <div className="text-center text-gray-500 text-sm py-4">No pets yet.</div>;

  const rankColors = ['text-amber-400', 'text-gray-300', 'text-amber-600'];
  const formBorder = { beyond: 'border-purple-400/25', ascendant: 'border-amber-400/20', showcase: 'border-cyan-400/15', trusted: 'border-emerald-400/12', fresh: 'border-white/[0.06]' };

  return (
    <div className="space-y-3 text-sm text-gray-400">
      <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
        <div className="text-xs text-gray-500 mb-1">Dojo Rankings</div>
        <p className="text-[11px] text-white/65">Top companions ranked by level. Play songs and care for your pet to climb.</p>
      </div>
      <div className="space-y-1.5">
        {leaderboard.map((entry) => (
          <div key={entry.rank} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${formBorder[entry.form?.id] || formBorder.fresh} bg-black/20`}>
            <div className={`text-sm font-black w-6 text-center tabular-nums ${rankColors[entry.rank - 1] || 'text-gray-500'}`}>
              {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}
            </div>
            <div className="w-11 h-11 shrink-0 flex items-center justify-center">
              <SpritePet character={entry.character} weightState={entry.weight_state || 'normal'} mood={entry.mood || 'happy'}
                equippedHat={entry.equipped_hat} hatColor={entry.hat_color}
                equippedTop={entry.equipped_top} topColor={entry.top_color}
                size={44} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-white/85 truncate">{entry.nickname || entry.username}</div>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="text-[9px] text-cyan-200/70">{entry.bond_rank?.label || 'Training Partner'}</span>
                {entry.form?.label && entry.form.id !== 'fresh' && (
                  <span className={`text-[9px] ${entry.form.id === 'beyond' ? 'text-purple-300' : entry.form.id === 'ascendant' ? 'text-amber-300' : 'text-gray-400'}`}>{entry.form.label}</span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[11px] font-bold text-amber-400 tabular-nums">Lv.{entry.level || 1}</div>
              <div className="text-[9px] text-gray-500">level</div>
            </div>
          </div>
        ))}
      </div>
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
                <span className="text-[10px] text-pink-400">+{food.happiness} mood</span>
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
                {trick.unlocked && <div className="text-[10px] text-amber-400/70 mt-0.5">+{trick.comboReward}c +{trick.happinessReward} mood</div>}
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
