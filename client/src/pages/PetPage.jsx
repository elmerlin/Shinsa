import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  getMyPet, adoptPet, feedPet, getPetCharacters, getPetShop,
  buyPetFood, buyPetItem, equipPetItem, unequipPetSlot,
  setPetColor, togglePetAvatar, demandTrick, performTrick,
  interactPet, doPetActivity, claimPetMission, buyPetToy, usePetToy,
  buyPetHabitatItem, equipPetHabitat, setPetTrainingPath, getPetLeaderboard,
  getPetSocialFeed, renamePet, getMiniPumpStats, completeMiniPump,
} from '../utils/api';
import SpritePet, { renderPetToCanvas } from '../components/SpritePet';
import PetCoachPanel from '../components/pet/PetCoachPanel';
import PetToyOverlay from '../components/pet/PetToyOverlay';
import PetMomentCard from '../components/pet/PetMomentCard';
import MiniPumpLauncher from '../components/pet/minigames/MiniPumpLauncher';
import MiniPumpModal from '../components/pet/minigames/MiniPumpModal';

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
  const [editingName, setEditingName] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [miniPumpOpen, setMiniPumpOpen] = useState(false);
  const [miniPumpStats, setMiniPumpStats] = useState(null);
  const habitatRef = useRef(null);

  const loadPet = useCallback(async () => {
    try {
      const [petRes, charRes] = await Promise.all([getMyPet(), getPetCharacters()]);
      setPet(petRes.pet);
      setEconomy(petRes.economy || null);
      setCharacters(charRes.characters || []);
      if (!petRes.pet) setShowSelect(true);
      if (petRes.pet) setSpeechText(petRes.pet.time_greeting || randomMsg(petRes.pet.mood));
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
    if (user) { loadPet(); loadShop(); getPetSocialFeed().then(setSocialFeed).catch(() => {}); }
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

  // ─── Share pet as image — captures habitat + pet ─
  const handleSharePet = async () => {
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

      // ─── Render pet at center ───
      const pixelSize = 5;
      const petW = 60 * pixelSize;
      const petX = (W - petW) / 2;
      const petY = habitatImg ? 80 : 200;
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
      const charName = pet.character || 'pet';

      // Convert data URL to blob synchronously (no fetch required)
      function dataUrlToBlob(url) {
        const [hdr, data] = url.split(',');
        const mime = hdr.match(/:(.*?);/)[1];
        const bin = atob(data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new Blob([bytes], { type: mime });
      }

      const blob = dataUrlToBlob(dataUrl);
      const file = new File([blob], `shinsa-${charName}.png`, { type: 'image/png' });

      // Try native share API (works on mobile)
      if (typeof navigator?.share === 'function') {
        try {
          await navigator.share({ files: [file], title: `${displayName} \u2014 Pump Shinsa` });
          setShareStatus('done');
          setTimeout(() => setShareStatus(''), 2000);
          return;
        } catch (shareErr) {
          if (shareErr?.name === 'AbortError') {
            setShareStatus('done');
            setTimeout(() => setShareStatus(''), 2000);
            return;
          }
          // Fall through to download
        }
      }

      // Fallback: download via blob URL
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `shinsa-${charName}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

      setShareStatus('done');
      setTimeout(() => setShareStatus(''), 2000);
    } catch (e) {
      console.error('Share failed', e);
      setShareStatus('');
      alert('Could not generate share image. Please try again.');
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
  };
  const handleMiniPumpComplete = async (results) => {
    try {
      const r = await completeMiniPump(results);
      setMiniPumpStats(r);
      // Refresh pet to reflect happiness/bond bump
      const petData = await getMyPet();
      if (petData?.pet) setPet(petData.pet);
    } catch (e) { console.error('Mini-pump save failed', e); }
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
                <h1 className="text-lg font-black tracking-tight text-white">{pet.nickname || `My ${charName}`}</h1>
                <button onClick={handleStartRename} className="text-gray-500 hover:text-white transition-colors" title="Rename pet">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path d="M13.5 3.3a1.1 1.1 0 00-1.6 0L4.6 10.6l-.6 2 2-.6L13.5 4.8a1.1 1.1 0 000-1.5zM3 13h10v1H3v-1z" /></svg>
                </button>
              </div>
            )}
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
              onClick={handleSharePet}
              disabled={shareStatus === 'capturing'}
              className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition-all ${
                shareStatus === 'done'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-white/[0.08] bg-white/[0.03] text-gray-400 hover:border-white/15 hover:text-white'
              } disabled:opacity-50`}
            >
              {shareStatus === 'capturing' ? 'Saving...' : shareStatus === 'done' ? 'Shared!' : 'Share'}
            </button>
            <button
              onClick={() => setShowSelect(true)}
              className="whitespace-nowrap rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 transition-all hover:border-white/15 hover:text-white"
            >
              Switch
            </button>
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
        <div ref={habitatRef} className={`relative rounded-[1.6rem] border border-white/[0.06] overflow-hidden bg-gradient-to-b shadow-[0_18px_45px_rgba(0,0,0,0.28)] ${CHARACTER_BG[pet.character] || ''}`}>
          <HabitatBackdrop backgroundId={pet.habitat?.active_background} />
          <HabitatFloorDisplay floorId={pet.habitat?.active_floor} />
          <HabitatWallDisplay wallId={pet.habitat?.active_wall} />
          <HabitatParticles character={pet.character} mood={pet.mood} />
          <HabitatPropDisplay propId={pet.habitat?.active_prop} />
          <div className="absolute top-3 right-3 z-10">
            <WeightBadge state={pet.weight_state} />
          </div>
          <div data-share-exclude="true" className="absolute top-3 left-3 z-10"><BondBadge rank={pet.bond_rank} /></div>
          {pet.form?.label ? (
            <div data-share-exclude="true" className="absolute left-1/2 top-10 z-10 -translate-x-1/2">
              <FormBadge form={pet.form} />
            </div>
          ) : null}
          <div data-share-exclude="true" className={`relative z-10 flex flex-col items-center justify-end px-4 pt-16 pb-3 min-h-[290px] sm:min-h-[310px] ${petTapped ? 'animate-[wiggle_400ms_ease]' : ''}`}>
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
            <StatCard label="Streak" value={pet.daily_streak ? `${pet.daily_streak}d` : '—'} />
            <StatCard label="Specialty" value={pet.specialty?.label || '—'} />
          </div>

          {/* Tab bar */}
          <div className="mt-4 flex rounded-xl border border-white/[0.06] overflow-hidden">
            {TABS.map(t => (
              <button key={t} onClick={() => { setTab(t); if (t === 'food' || t === 'clothing' || t === 'habitat') loadShop(); if (t === 'ranks' && !leaderboard) getPetLeaderboard().then(r => setLeaderboard(r.leaderboard)).catch(() => {}); }}
                className={`flex-1 py-2 text-[10px] sm:text-xs font-semibold capitalize transition-all ${tab === t ? 'bg-white/[0.08] text-white' : 'text-gray-500 hover:text-white/70'}`}>
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

      <p className="text-[10px] text-gray-600 text-center mt-4">Sync PIU scores to earn Combo, then budget it carefully to keep your pet thriving.</p>

      <style>{`
        @keyframes slideDown { from { opacity: 0; transform: translate(-50%, -12px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes wiggle { 0%,100% { transform: rotate(0); } 25% { transform: rotate(-3deg); } 75% { transform: rotate(3deg); } }
        @keyframes float-up { 0% { opacity: 0.5; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-50px) scale(0.5); } }
        @keyframes pulse-glow { 0%,100% { opacity: 0.15; } 50% { opacity: 0.3; } }
        @keyframes unlock-pop { 0% { transform: scale(0.8); opacity: 0; } 50% { transform: scale(1.05); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
        }
      `}</style>

      {/* Mini-Pump game modal */}
      <MiniPumpModal
        open={miniPumpOpen}
        onClose={() => setMiniPumpOpen(false)}
        character={pet?.character || 'dojocat'}
        onComplete={handleMiniPumpComplete}
      />
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
    trusted: 'border-emerald-400/20 text-emerald-300',
    showcase: 'border-cyan-400/20 text-cyan-300',
    ascendant: 'border-amber-400/25 text-amber-300',
    beyond: 'border-purple-400/30 text-purple-300 animate-pulse',
    mythic: 'border-rose-400/30 text-rose-200 animate-pulse',
  };
  return (
    <span className={`rounded-full border bg-black/40 backdrop-blur-sm px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${formStyles[form.id] || formStyles.fresh}`}>
      {form.label}
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
function PetTab({ pet, shop, combo, economy, socialFeed, interactionBusy, activityBusy, missionBusyId, toyBusy, trainingBusy, onAction, onActivity, onClaimMission, onBuyToy, onUseToy, onSetTrainingPath, onTabSwitch, onMiniPump, miniPumpStats }) {
  const REACTION_ICONS = { cheer: '📣', wow: '🤩', flex: '💪', heart: '💗' };
  const claimableMissions = (pet.missions || []).filter(m => m.complete && !m.claimed).length;
  return (
    <div className="space-y-3 text-sm text-gray-400">
      {/* ── Always visible: coach + alerts ── */}
      {pet.companion_coach && (
        <PetCoachPanel coach={pet.companion_coach} character={pet.character} onTabSwitch={onTabSwitch} />
      )}
      {(pet.energy < 20 || pet.hunger < 25) && (
        <div className={`rounded-xl p-3 border ${pet.energy < 10 || pet.hunger < 15 ? 'bg-red-500/[0.06] border-red-500/15' : 'bg-amber-500/[0.06] border-amber-500/10'}`}>
          <div className="flex items-center gap-2">
            <span className="text-sm">{pet.energy < 10 || pet.hunger < 15 ? '⚠️' : '💤'}</span>
            <div className="text-[11px]">
              {pet.hunger < 15 && <span className="text-red-300">Very hungry — feed your pet! </span>}
              {pet.hunger >= 15 && pet.hunger < 25 && <span className="text-amber-200">Getting hungry. </span>}
              {pet.energy < 10 && <span className="text-red-300">Exhausted — let them rest. </span>}
              {pet.energy >= 10 && pet.energy < 20 && <span className="text-amber-200">Low energy. </span>}
            </div>
          </div>
        </div>
      )}

      {/* ── Guide link ── */}
      <Link to="/pet/guide" className="flex items-center gap-2 rounded-xl border border-cyan-400/10 bg-cyan-500/[0.04] px-3 py-2 hover:bg-cyan-500/[0.06] hover:border-cyan-400/15 transition-all group">
        <span className="text-sm">📖</span>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold text-cyan-200 group-hover:text-cyan-100 transition-colors">Pet Companion Guide</div>
          <div className="text-[10px] text-gray-500">Learn how to care for, train, and evolve your pet</div>
        </div>
        <span className="text-[10px] text-gray-600 group-hover:text-gray-400 transition-colors">→</span>
      </Link>

      {/* ── Section 1: Play & Care (open) ── */}
      <CollapsibleSection title="Play & Care" icon="🎮" defaultOpen={true}>
        {/* Mini-Pump launcher */}
        <div className="mb-3">
          <MiniPumpLauncher onPlay={onMiniPump} stats={miniPumpStats} />
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
              const ACTIVITY_ICONS = { train: '\u{1F94B}', play: '\u{1F3AE}', groom: '\u{2728}', rest: '\u{1F4A4}', spar: '\u{1F94A}', explore: '\u{1FA7A}' };
              return (
                <button
                  key={activity.id}
                  onClick={() => !locked && onActivity(activity.id)}
                  disabled={activityBusy || locked}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-all active:scale-[0.98] disabled:opacity-50 ${
                    locked
                      ? 'border-white/[0.04] bg-white/[0.01] cursor-not-allowed'
                      : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
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
                          {activity.gains.map((g, i) => (
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
