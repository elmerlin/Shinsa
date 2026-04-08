const express = require('express');
const { getDb } = require('../db/schema');
const { requireAuth } = require('./auth');
const { normalizeGrade, gradeFromScore } = require('../lib/titleProgress');

const router = express.Router();

// ─── Constants ────────────────────────────────────────────────────
const VALID_CHARACTERS = ['dojocat', 'buu', 'devit', 'pixiu'];
const MAX_STAT = 100;
const TARGET_WEEKLY_SONGS = 75;
const TARGET_WEEKLY_HUNGER_UPKEEP = 134;
const TARGET_WEEKLY_HAPPINESS_UPKEEP = 20;
const HUNGER_DECAY_PER_HOUR = 0.8;
const HAPPINESS_DECAY_PER_HOUR = TARGET_WEEKLY_HAPPINESS_UPKEEP / (7 * 24);
const ENERGY_DECAY_PER_HOUR = 0;
const MOMENTUM_DECAY_PER_HOUR = 1.25;
const HYPE_DECAY_PER_HOUR = MOMENTUM_DECAY_PER_HOUR;
const ENERGY_RECOVERY_HIGH_PER_HOUR = 4;
const ENERGY_RECOVERY_MEDIUM_PER_HOUR = 2;
const ENERGY_RECOVERY_LOW_PER_HOUR = 0;
const NEGLECT_DECAY_DELAY_HOURS = 48;
const TRUST_NEGLECT_DECAY_PER_DAY = 2;
const CRITICAL_HUNGER_THRESHOLD = 15;
const LOW_HUNGER_THRESHOLD = 30;
const LOW_ENERGY_THRESHOLD = 20;
const LOW_TRUST_THRESHOLD = 25;
const MID_TRUST_THRESHOLD = 40;
const LOW_MOMENTUM_THRESHOLD = 20;
const REQUEST_LIFETIME_HOURS = 24;
const REQUEST_REFRESH_COOLDOWN_HOURS = 8;
const PET_ECONOMY = {
  target_songs_per_week: TARGET_WEEKLY_SONGS,
  weekly_hunger_upkeep: TARGET_WEEKLY_HUNGER_UPKEEP,
  weekly_happiness_upkeep: TARGET_WEEKLY_HAPPINESS_UPKEEP,
  currencies: {
    combo: { name: 'Combo', desc: 'Earned from syncing PIU plays. Spent on food, clothing, habitat, and toys.', icon: '🎵' },
    bond_tokens: { name: 'Bond Tokens', desc: 'Earned from missions and deep care. Used for rare unlocks and gifts.', icon: '💎' },
    rare_shards: { name: 'Rare Shards', desc: 'Dropped from special events and HoP sessions. For legendary items.', icon: '✨' },
  },
  sinks: ['Food upkeep', 'Clothing & accessories', 'Habitat decorations', 'Toys & play items', 'Gifts to friends'],
};
// Minigame play costs
const MINIGAME_COST = {
  'mini-pump': { combo: 5, energy: -4, hunger: -3, happiness: 2, hype: 4 },
  'pet-invaders': { combo: 8, energy: -6, hunger: -4, happiness: 2, hype: 6 },
};

const GRADE_ORDER = ['F', 'D', 'C', 'B', 'A', 'A+', 'AA', 'AA+', 'AAA', 'AAA+', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+'];
const GRADE_INDEX = Object.fromEntries(GRADE_ORDER.map((grade, index) => [grade, index]));

// Combo earned per grade when syncing plays
const GRADE_COMBO = {
  'SSS+': 5, 'SSS': 5, 'SS+': 4, 'SS': 4, 'S+': 4, 'S': 3,
  'AAA+': 3, 'AAA': 3, 'AA+': 2, 'AA': 2, 'A+': 2, 'A': 1,
  'B': 1, 'C': 0, 'D': 0, 'F': 0,
};

// Pump sync should generate resources and momentum, not directly solve upkeep.
const GRADE_SYNC_REWARD_TABLE = {
  'SSS+': { xp: 42, momentum: 6, trust: 2, hunger: -2, energy: -3 },
  'SSS':  { xp: 38, momentum: 6, trust: 2, hunger: -2, energy: -3 },
  'SS+':  { xp: 34, momentum: 5, trust: 1, hunger: -2, energy: -3 },
  'SS':   { xp: 30, momentum: 5, trust: 1, hunger: -2, energy: -3 },
  'S+':   { xp: 26, momentum: 5, trust: 1, hunger: -2, energy: -2 },
  'S':    { xp: 23, momentum: 4, trust: 1, hunger: -2, energy: -2 },
  'AAA+': { xp: 19, momentum: 4, trust: 1, hunger: -1, energy: -2 },
  'AAA':  { xp: 16, momentum: 4, trust: 1, hunger: -1, energy: -2 },
  'AA+':  { xp: 13, momentum: 3, trust: 0, hunger: -1, energy: -1 },
  'AA':   { xp: 11, momentum: 3, trust: 0, hunger: -1, energy: -1 },
  'A+':   { xp: 9, momentum: 2, trust: 0, hunger: -1, energy: -1 },
  'A':    { xp: 7, momentum: 2, trust: 0, hunger: -1, energy: -1 },
  'B':    { xp: 4, momentum: 1, trust: 0, hunger: -1, energy: 0 },
  'C':    { xp: 2, momentum: 0, trust: 0, hunger: 0, energy: 0 },
  'D':    { xp: 1, momentum: 0, trust: 0, hunger: 0, energy: 0 },
  'F':    { xp: 0, momentum: 0, trust: 0, hunger: 0, energy: 0 },
};

function levelXpBonus(level) {
  if (level >= 25) return 20;
  if (level >= 22) return 12;
  if (level >= 19) return 7;
  if (level >= 16) return 4;
  if (level >= 13) return 2;
  return 0;
}

function levelComboBonus(level) {
  if (level >= 25) return 3;
  if (level >= 22) return 2;
  if (level >= 19) return 1;
  if (level >= 16) return 1;
  return 0;
}

// XP thresholds per level — increases by 15 per level, caps at level 100
function xpForNextLevel(level) {
  if (level < 1) return 100;
  const increase = Math.min(level - 1, 98) * 15;
  return 100 + increase;
}

function getLevelFromXp(totalXp) {
  let remaining = totalXp || 0;
  let level = 1;
  while (remaining >= xpForNextLevel(level)) {
    remaining -= xpForNextLevel(level);
    level++;
  }
  const needed = xpForNextLevel(level);
  return { level, currentLevelXp: remaining, nextLevelXp: needed, progress: needed > 0 ? remaining / needed : 0 };
}

// ─── Pet Food ─────────────────────────────────────────────────────
const PET_FOODS = [
  { id: 'pump-chow', name: 'Pump Chow', cost: 22, hunger: 7, happiness: 1, emoji: '🥩', desc: 'Basic upkeep kibble for hungry stompers' },
  { id: 'beat-bites', name: 'Beat Bites', cost: 28, hunger: 6, happiness: 5, emoji: '🍪', desc: 'Crunchy snacks that cheer them up' },
  { id: 'slam-grub', name: 'Slam Grub', cost: 36, hunger: 11, happiness: 2, emoji: '🍖', desc: 'A proper meal after a hard set' },
  { id: 'step-fuel', name: 'Step Fuel', cost: 42, hunger: 13, happiness: 4, emoji: '⚡', desc: 'Reliable energy with a little spark' },
  { id: 'rhythm-rations', name: 'Rhythm Rations', cost: 26, hunger: 5, happiness: 7, emoji: '🎵', desc: 'Lighter food with a happiness boost' },
  { id: 'gargoyle-munch', name: 'Gargoyle Munch', cost: 52, hunger: 16, happiness: 2, emoji: '👹', desc: 'Dense feed for serious recovery' },
  { id: 'pad-power', name: 'Pad Power', cost: 68, hunger: 21, happiness: 8, emoji: '💪', desc: 'Premium fuel for well-loved pets' },
  { id: 'dance-dust', name: 'Dance Dust', cost: 18, hunger: 3, happiness: 10, emoji: '✨', desc: 'Not filling, but impossible not to love' },
  { id: 'doof-bites', name: 'Doof Bites', cost: 32, hunger: 9, happiness: 6, emoji: '🔥', desc: 'Spicy bites with extra personality' },
  { id: 'adrenaline-chow', name: 'Adrenaline Chow', cost: 82, hunger: 25, happiness: 10, emoji: '🚀', desc: 'Expensive, but it keeps them thriving' },
  { id: 'banya-biscuits', name: 'Banya Biscuits', cost: 94, hunger: 24, happiness: 16, emoji: '🏆', desc: 'Legendary treats for pampered champions' },
];
const PET_FOODS_MAP = Object.fromEntries(PET_FOODS.map(f => [f.id, f]));

const CHARACTER_PROFILES = {
  dojocat: {
    title: 'Proud training companion',
    personality: 'Disciplined, proud, and quietly affectionate once trust is earned.',
    favorite_foods: ['pump-chow', 'step-fuel', 'banya-biscuits'],
    disliked_foods: ['dance-dust'],
    interaction_lines: {
      praise: ['Acceptable form.', 'That was disciplined.', 'You noticed. Good.'],
      cuddle: ['A brief headbutt.', 'Only for a moment.', '*tiny purr*'],
      tease: ['Watch it.', 'Do not test the dojo mascot.', 'Hmph.'],
      perform: ['A demonstration of form.', 'Watch closely.', 'This is a real kata.'],
      mission: ['Train with intent today.', 'Bring me a clean clear.', 'We should sharpen our form.'],
      tap: ['Eyes up, stance strong.', 'Ready when you are.', '*whiskers twitch*'],
    },
  },
  buu: {
    title: 'Indulgent rhythm goblin',
    personality: 'Smug, food-motivated, and happiest when showing off.',
    favorite_foods: ['beat-bites', 'dance-dust', 'doof-bites'],
    disliked_foods: ['pump-chow'],
    interaction_lines: {
      praise: ['Of course I was amazing.', 'Tell me more.', 'Hehe, keep going.'],
      cuddle: ['Mmm, cozy.', 'I will allow this.', 'Soft pats accepted.'],
      tease: ['Rude. Funny, but rude.', 'You wish you looked this good.', 'Hehehe.'],
      perform: ['Watch my moves!', 'Prepare to be amazed.', 'I was BORN for this.'],
      mission: ['Let us make today delicious.', 'Bring me something flashy.', 'A replay would look good on us.'],
      tap: ['Hehehe.', 'Admiring me again?', 'I am listening.'],
    },
  },
  devit: {
    title: 'Chaotic step gremlin',
    personality: 'Playful, restless, and always trying to turn training into mischief.',
    favorite_foods: ['doof-bites', 'adrenaline-chow', 'slam-grub'],
    disliked_foods: ['rhythm-rations'],
    interaction_lines: {
      praise: ['Again, again!', 'That ruled.', 'Did you see me hop?'],
      cuddle: ['Only if we wrestle after.', 'Quick hug, then zoomies.', 'Fine, but make it fast.'],
      tease: ['Catch me first.', 'Heh. Try harder.', 'That just made me stronger.'],
      perform: ['CHECK THIS OUT!', 'Hold my snacks.', 'Bet you cannot do THIS.'],
      mission: ['Let us cause a little trouble.', 'I want doubles chaos.', 'Bring me something hard.'],
      tap: ['Heh.', 'Ready to dash.', 'Do it again.'],
    },
  },
  pixiu: {
    title: 'Ceremonial luck guardian',
    personality: 'Warm, auspicious, and protective, with a taste for elegant rituals.',
    favorite_foods: ['rhythm-rations', 'banya-biscuits', 'pad-power'],
    disliked_foods: ['doof-bites'],
    interaction_lines: {
      praise: ['Fortune smiles on discipline.', 'A graceful effort.', 'I am pleased.'],
      cuddle: ['A warm blessing for you.', 'Stay a while.', 'Such a gentle moment.'],
      tease: ['I choose mercy.', 'Mischief clouds the spirit.', '*tiny amused snort*'],
      perform: ['A ceremonial display.', 'Witness the ancient art.', 'Blessings through movement.'],
      mission: ['Let us seek a worthy clear.', 'A ceremonial challenge awaits.', 'We should honour today with good play.'],
      tap: ['Auspicious timing.', 'I am here.', 'Let us see what today brings.'],
    },
  },
};

// ─── Contextual speech pools ────────────────────────────
// Deep per-character lines keyed by mood, activity, trust tier, food preference, and rare hidden lines.
const CONTEXTUAL_SPEECH = {
  dojocat: {
    mood_lines: {
      desperate: ['My stance... falters...', 'A warrior needs sustenance.', 'Even dojos close when hungry.'],
      hungry: ['Training on empty is no honour.', 'A snack would sharpen my form.', 'The body needs fuel for the dojo.'],
      happy: ['Form is strong today.', 'The dojo sings.', 'A worthy session awaits.'],
      content: ['Discipline rewarded.', 'Every kata flows true.', 'This is how a champion rests.'],
      stuffed: ['I may have overdone it.', 'So full... no more treats.', 'The belly betrays the warrior.'],
    },
    activity_lines: {
      train: ['Sharpen the fundamentals.', 'Again. Precision demands repetition.', 'Good form. Once more.', 'The pad does not lie.'],
      play: ['Even a dojo cat chases string.', 'A break between katas.', 'One moment of play, then back to training.'],
      groom: ['A clean coat honours the dojo.', 'Maintenance is discipline.', 'You may proceed... gently.'],
      rest: ['Resting between sets.', 'A warrior knows when to recover.', 'The body repairs what training breaks.'],
      spar: ['Show me your best!', 'I will not hold back.', 'Steel sharpens steel.', 'A worthy opponent!'],
      explore: ['New grounds to survey.', 'The dojo extends beyond walls.', 'Scouting for wisdom.'],
    },
    hidden_lines: [
      '...I dreamed I was a regular cat once.',
      'Between us — I like belly rubs.',
      'The first dojo I trained at had a fish pond.',
      'Sometimes I watch replays alone. For inspiration.',
    ],
    trust_lines: {
      low: ['You are still proving yourself.', 'Watch. Learn. Then we talk.', 'Earn it.'],
      mid: ['You are becoming reliable.', 'I see improvement.', 'Not bad, student.'],
      high: ['I trust you with my training.', 'We move as one.', 'My finest sparring partner.'],
    },
    feed_lines: {
      favorite: ['THIS is a feast.', 'Now that is a worthy offering.', 'You know my palate well.'],
      disliked: ['...what is this.', 'I will eat it. Out of discipline.', 'Do not bring this again.'],
      neutral: ['Acceptable nourishment.', 'It fuels the body.', 'Adequate.'],
    },
  },
  buu: {
    mood_lines: {
      desperate: ['Buu... needs... snacks...', 'So empty inside...', 'The rhythm fades without food.'],
      hungry: ['My tummy makes its own beats.', 'Feed me something flashy.', 'A snack would hit different right now.'],
      happy: ['Vibes are immaculate.', 'Everything tastes better when you are happy.', 'Keep this energy going.'],
      content: ['Mmm, perfectly full.', 'I could nap right here.', 'Bliss is a full belly and good beats.'],
      stuffed: ['Cannot. Move.', 'I regret nothing. Maybe that last bite.', 'Roll me to the stage.'],
    },
    activity_lines: {
      train: ['Training is just choreography practice.', 'I look good working out.', 'One more rep for the fans.'],
      play: ['THIS is what life is about!', 'Hehehe, more more more!', 'Play is my cardio.', 'Catch me if you can!'],
      groom: ['Make me shine.', 'Every hair in place.', 'Beauty maintenance is self-care.'],
      rest: ['Nap time is sacred.', 'Five more minutes...', 'Dreaming of snacks...'],
      spar: ['I fight pretty.', 'You are about to lose... gorgeously.', 'These paws are registered weapons.'],
      explore: ['New snack spots incoming.', 'Adventure! ...with snack breaks.', 'I heard there are treats out here.'],
    },
    hidden_lines: [
      '...sometimes I eat in secret.',
      'Do not tell anyone, but I practise when nobody watches.',
      'I was the smallest of my litter. Look at me now.',
      'I once cried at a really good combo. Do NOT tell.',
    ],
    trust_lines: {
      low: ['You are amusing. For now.', 'I will allow your company.', 'Prove yourself with snacks.'],
      mid: ['Okay, you are growing on me.', 'You bring good vibes.', 'Acceptable human.'],
      high: ['You are my favourite person.', 'We are a TEAM.', 'Best duo in the arcade.'],
    },
    feed_lines: {
      favorite: ['YESSS! My favourite!', 'You really DO love me!', 'More of this. Always more.'],
      disliked: ['Ew. Ew ew ew.', 'This is NOT it.', 'My taste buds weep.'],
      neutral: ['Om nom nom.', 'Not bad, not bad.', 'It will do for now.'],
    },
  },
  devit: {
    mood_lines: {
      desperate: ['Need... energy... to cause... trouble...', 'Even devils gotta eat.', 'So weak...'],
      hungry: ['Feed me or I break something.', 'My stomach is GROWLING.', 'Hungry devit is cranky devit.'],
      happy: ['LETS GOOO!', 'Chaos feels so good!', 'Best. Day. Ever.'],
      content: ['Heh. Not bad at all.', 'I could get used to this.', 'Satisfied... for now.'],
      stuffed: ['Food coma incoming...', 'Oof, too much.', 'I ate the whole thing and I would do it AGAIN.'],
    },
    activity_lines: {
      train: ['Training is just advanced mischief.', 'Faster! FASTER!', 'I do not train — I level up.'],
      play: ['ZOOMIES!', 'Catch me! You cannot!', 'Hahahaha!', 'Again! Again! AGAIN!'],
      groom: ['Do not touch the horns.', 'Quick, before anyone sees me being cute.', 'Fine. But make it FAST.'],
      rest: ['Not sleeping. Planning.', 'Power nap for power plays.', 'Recharging chaos batteries.'],
      spar: ['FINALLY some action!', 'You are going DOWN!', 'Best activity EVER.', 'Come at me!'],
      explore: ['Secret shortcuts everywhere!', 'I found something! It might explode.', 'Adventure time, let us go!'],
    },
    hidden_lines: [
      '...I keep a collection of shiny things hidden under the pad.',
      'Once I got scared by a butterfly. Do NOT tell anyone.',
      'I pretend I do not need hugs. I do.',
      'My first clear was a fluke. Second one was NOT.',
    ],
    trust_lines: {
      low: ['You are entertaining at least.', 'Keep up or get lost.', 'Still deciding about you.'],
      mid: ['You are alright, human.', 'We make a good chaos team.', 'I guess you can stay.'],
      high: ['You are MY human now.', 'Nobody messes with my crew.', 'Ride or die, partner!'],
    },
    feed_lines: {
      favorite: ['FIRE FOOD!', 'This SLAPS!', 'Give me ALL of it!'],
      disliked: ['Gross gross gross!', 'Are you TRYING to poison me?', 'Absolutely not.'],
      neutral: ['Munch munch. Fine.', 'Fuel acquired.', 'It is edible. Moving on.'],
    },
  },
  pixiu: {
    mood_lines: {
      desperate: ['The fortune... dims...', 'A guardian must not go unfed.', 'The blessings grow faint.'],
      hungry: ['A meal would restore the balance.', 'The spirit hungers softly.', 'Even celestial beings need nourishment.'],
      happy: ['Fortune flows abundantly.', 'The stars align for us.', 'A blessed moment indeed.'],
      content: ['All is in harmony.', 'The cosmos smiles upon us.', 'Perfectly balanced, as things should be.'],
      stuffed: ['Such... abundance...', 'The guardian is very well nourished.', 'A feast worthy of the heavens.'],
    },
    activity_lines: {
      train: ['Discipline honours the ancestors.', 'Each movement carries meaning.', 'The path of mastery is walked, not rushed.'],
      play: ['Even the celestial dance.', 'A moment of levity between rituals.', 'Joy feeds the spirit.'],
      groom: ['A ceremonial cleansing.', 'The mane must be kept with care.', 'Presentation honours tradition.'],
      rest: ['Meditation restores all.', 'The spirit settles into stillness.', 'In stillness, strength gathers.'],
      spar: ['A sacred duel begins.', 'Show me your honour.', 'The guardian tests you now.', 'May the worthy prevail.'],
      explore: ['The world holds ancient secrets.', 'A pilgrimage of discovery.', 'Fortune reveals itself to the seeker.'],
    },
    hidden_lines: [
      '...I sometimes miss the clouds.',
      'In another age, I guarded a temple. It had the best garden.',
      'You remind me of my first keeper. That is rare.',
      'I have never told anyone my true name.',
    ],
    trust_lines: {
      low: ['Trust is earned through ceremony.', 'Your intentions are yet unclear.', 'The guardian observes.'],
      mid: ['Your aura shows promise.', 'I sense dedication in you.', 'The bond deepens.'],
      high: ['I bestow my full protection upon you.', 'You carry my blessing always.', 'A sacred bond, forged in devotion.'],
    },
    feed_lines: {
      favorite: ['An exquisite offering.', 'The ancestors approve.', 'Truly auspicious flavours.'],
      disliked: ['This disrupts the harmony.', 'An unfortunate choice.', 'Perhaps reconsider next time.'],
      neutral: ['Nourishment received with grace.', 'A simple offering, accepted.', 'It sustains the spirit.'],
    },
  },
};

const PET_INTERACTIONS = {
  praise: { label: 'Praise', bond: 4, trust: 4, happiness: 4, hype: 3, energy: 0, expression: 'proud', reaction: 'proud' },
  cuddle: { label: 'Cuddle', bond: 5, trust: 3, happiness: 5, hype: 0, energy: 1, expression: 'soft', reaction: 'sway' },
  tease: { label: 'Tease', bond: 1, trust: -2, happiness: -1, hype: 6, energy: 0, expression: 'smirk', reaction: 'mischief' },
  mission: { label: 'Ask Mission', bond: 2, trust: 2, happiness: 1, hype: 2, energy: 0, expression: 'sparkle', reaction: 'nod' },
  tap: { label: 'Tap', bond: 1, trust: 1, happiness: 2, hype: 1, energy: 0, expression: '', reaction: '' },
  perform: { label: 'Perform', bond: 3, trust: 3, happiness: 6, hype: 8, energy: -6, expression: 'excited', reaction: 'hop', minBond: 40 },
};

const PET_ACTIVITIES = {
  train: {
    id: 'train', label: 'Train', desc: 'Sharpens discipline and trust.',
    energy: -16, happiness: 3, trust: 5, hype: 5, bond: 5, combo: 6, bond_tokens: 1, expression: 'proud', reaction: 'kata',
  },
  play: {
    id: 'play', label: 'Play', desc: 'Pure bonding and playful chaos.',
    energy: -10, happiness: 7, trust: 2, hype: 8, bond: 4, combo: 4, bond_tokens: 0, expression: 'grin', reaction: 'hop',
  },
  groom: {
    id: 'groom', label: 'Groom', desc: 'Raises trust and keeps them feeling special.',
    energy: -4, happiness: 8, trust: 6, hype: 1, bond: 3, combo: 0, bond_tokens: 1, expression: 'soft', reaction: 'bless',
  },
  rest: {
    id: 'rest', label: 'Rest', desc: 'Recovers energy but makes them hungry. 5min cooldown.',
    energy: 22, happiness: 2, trust: 1, hype: -4, bond: 2, combo: 0, bond_tokens: 0, expression: 'soft', reaction: 'sway',
  },
  spar: {
    id: 'spar', label: 'Spar', desc: 'Higher-risk bonding for confident pairs.',
    energy: -18, happiness: 4, trust: 7, hype: 10, bond: 6, combo: 10, bond_tokens: 1, expression: 'excited', reaction: 'dart',
    minTrust: 35,
  },
  explore: {
    id: 'explore', label: 'Explore', desc: 'Search for stories, keepsakes, and scene energy.',
    energy: -14, happiness: 5, trust: 3, hype: 7, bond: 4, combo: 8, bond_tokens: 2, rare_shards: 1, expression: 'sparkle', reaction: 'swish',
    minEnergy: 18,
  },
};

// ─── Companion Coach ──────────────────────────────────────────────
const COACH_TEMPLATES = {
  care: {
    headlines: {
      dojocat: 'A warrior needs fuel.',
      buu: 'Tummy noises... loud ones.',
      devit: 'Running on fumes here.',
      pixiu: 'The flame needs tending.',
    },
    suggestions: {
      dojocat: 'Feed me before we train. Discipline starts with upkeep.',
      buu: 'I can\'t bounce on an empty belly. Snacks first!',
      devit: 'Even chaos needs energy. Don\'t let me fade.',
      pixiu: 'Nourish the bond. A hungry guardian is a distracted one.',
    },
    focus: 'Pet care',
    why: 'Your pet is hungry or low on energy — stats recover slower when neglected.',
    cta_label: 'Feed now',
    related_surface: 'feed',
  },
  recovery: {
    headlines: {
      dojocat: 'Rest period.',
      buu: 'Nap time vibes.',
      devit: 'Even I need a breather.',
      pixiu: 'A moment of stillness.',
    },
    suggestions: {
      dojocat: 'We trained hard. Let your companion recharge before the next push.',
      buu: 'Low energy means grumpy gremlin. Let me recover a bit.',
      devit: 'I can go harder after a rest. Trust the cooldown.',
      pixiu: 'Patience restores what haste depletes.',
    },
    focus: 'Rest & recharge',
    why: 'Energy is low — activities cost more than they return right now.',
    cta_label: 'Rest',
    related_surface: 'pet',
  },
  accuracy: {
    headlines: {
      dojocat: 'Sharpen the form.',
      buu: 'Grade obsession mode!',
      devit: 'Hit cleaner.',
      pixiu: 'Precision honours the path.',
    },
    suggestions: {
      dojocat: 'Focus on AAA-or-better clears. Your timing can go higher.',
      buu: 'Go for fewer songs but cleaner grades today.',
      devit: 'Pick a chart you almost AAA and nail it.',
      pixiu: 'A single perfect clear teaches more than ten rushed ones.',
    },
    focus: 'Grade improvement',
    why: 'Your accuracy path benefits most from high-grade plays right now.',
    cta_label: 'Train accuracy',
    related_surface: 'training',
  },
  stamina: {
    headlines: {
      dojocat: 'Push the level ceiling.',
      buu: 'Heavy set incoming!',
      devit: 'Time to suffer.',
      pixiu: 'Endurance reveals character.',
    },
    suggestions: {
      dojocat: 'Try clearing three level 18+ charts this week.',
      buu: 'You haven\'t done enough hard charts lately. Let\'s grind.',
      devit: 'Higher levels mean more mastery. Stop playing it safe.',
      pixiu: 'The mountain does not move. You must climb.',
    },
    focus: 'Hard chart clears',
    why: 'Your stamina path needs level 18+ clears to progress efficiently.',
    cta_label: 'Train stamina',
    related_surface: 'training',
  },
  tech: {
    headlines: {
      dojocat: 'Footwork check.',
      buu: 'Doubles, doubles, doubles.',
      devit: 'Get clever.',
      pixiu: 'The silk path demands agility.',
    },
    suggestions: {
      dojocat: 'Work in some doubles charts or tricky footwork patterns.',
      buu: 'You haven\'t touched doubles much. Even one today helps.',
      devit: 'Try a doubles chart at your comfort level. Expand the toolkit.',
      pixiu: 'New movement vocabulary strengthens the bond.',
    },
    focus: 'Doubles & footwork',
    why: 'Your tech path grows fastest from doubles play and varied chart types.',
    cta_label: 'Try doubles',
    related_surface: 'training',
  },
  social: {
    headlines: {
      dojocat: 'Show the scene.',
      buu: 'Replay diva mode.',
      devit: 'Feed presence.',
      pixiu: 'Let the light be seen.',
    },
    suggestions: {
      dojocat: 'Post a replay of a clean clear. The dojo notices.',
      buu: 'Record a replay! I want to be famous.',
      devit: 'One good replay clip is worth more than ten silent clears.',
      pixiu: 'Share your journey. Others draw strength from your progress.',
    },
    focus: 'Replay & sharing',
    why: 'Your social path thrives on replays and community visibility.',
    cta_label: 'Post a replay',
    related_surface: 'profile',
  },
  tournament: {
    headlines: {
      dojocat: 'Bracket prep.',
      buu: 'Tournament energy!',
      devit: 'Stage mode.',
      pixiu: 'The arena calls.',
    },
    suggestions: {
      dojocat: 'Enter an Hour of Power or weekly challenge to sharpen your edge.',
      buu: 'You should do an HoP run — it\'s where the hype lives.',
      devit: 'Weekly challenge or HoP. Pick one and commit.',
      pixiu: 'Ceremonial challenge sharpens both player and companion.',
    },
    focus: 'Competitive readiness',
    why: 'Your tournament path benefits from challenge entries and HoP runs.',
    cta_label: 'Join event',
    related_surface: 'live',
  },
  consistency: {
    headlines: {
      dojocat: 'Keep the rhythm.',
      buu: 'Daily vibes.',
      devit: 'Steady wins.',
      pixiu: 'The garden grows with patience.',
    },
    suggestions: {
      dojocat: 'Feed me and play a few songs today. Consistency is the real grind.',
      buu: 'Just check in daily. I remember who shows up.',
      devit: 'Even a short session counts. Don\'t break the streak.',
      pixiu: 'Daily care compounds. Small acts build the deepest bonds.',
    },
    focus: 'Daily routine',
    why: 'Consistent daily engagement gives the strongest long-term bond growth.',
    cta_label: 'Daily check-in',
    related_surface: 'pet',
  },
};

function getCoachPriority(pet, summary) {
  const vitals = buildPetVitalsSnapshot(pet);
  const hunger = vitals.hunger;
  const energy = vitals.energy;

  // Urgent care
  if (hunger < 20 || energy < 12) return 'care';
  if (hunger < 35 && energy < 25) return 'recovery';

  const path = pet.active_training_path || 'consistency';
  const played7d = summary.plays_7d || 0;
  const playedToday = summary.plays_today || 0;
  const highGrades7d = summary.high_grades_7d || 0;
  const doubles7d = summary.doubles_7d || 0;
  const hard7d = summary.hard_7d || 0;
  const replays7d = summary.replays_7d || 0;
  const hop7d = summary.hop_sessions_7d || 0;

  // Not played at all this week
  if (played7d === 0) return 'consistency';

  // Path-aware priorities
  if (path === 'accuracy' && played7d > 0 && highGrades7d / played7d < 0.3) return 'accuracy';
  if (path === 'stamina' && hard7d < 2) return 'stamina';
  if (path === 'tech' && doubles7d === 0) return 'tech';
  if (path === 'social' && replays7d === 0) return 'social';
  if (path === 'tournament' && hop7d === 0 && !(summary.weekly_challenge_entries > 0)) return 'tournament';

  // General gaps
  if (energy < 20) return 'recovery';
  if (replays7d === 0 && played7d >= 5) return 'social';
  if (hard7d === 0 && (summary.max_level_all || 0) >= 16) return 'stamina';
  if (doubles7d === 0 && played7d >= 8) return 'tech';

  // Default to path focus
  return path;
}

function buildCompanionCoach(pet, summary) {
  const character = pet.character || 'dojocat';
  const priority = getCoachPriority(pet, summary);
  const template = COACH_TEMPLATES[priority] || COACH_TEMPLATES.consistency;
  const lastPriority = pet.last_coach_priority || '';
  const focusCount = pet.coach_focus_count || 0;
  const sameFocus = lastPriority === priority;

  return {
    priority,
    headline: template.headlines[character] || template.headlines.dojocat,
    suggestion: template.suggestions[character] || template.suggestions.dojocat,
    focus: template.focus,
    why: template.why,
    cta_label: template.cta_label,
    related_surface: template.related_surface,
    streak_note: sameFocus && focusCount >= 3 ? `${focusCount} sessions on ${template.focus}` : '',
    is_new_focus: !sameFocus && !!lastPriority,
  };
}

const PET_TOYS = [
  {
    id: 'mini-pad',
    name: 'Mini Pad',
    cost: 64,
    desc: 'A tiny practice stage for proud little performances.',
    bond: 5, trust: 2, happiness: 6, energy: -8, hype: 7,
    bond_tokens: 1,
    expression: 'excited',
    reaction: 'hop',
    favored: ['dojocat', 'devit'],
    visual_type: 'ground',
    hold_slot: 'none',
    action_state: 'dance_step',
    overlay_id: 'mini-pad',
    duration_ms: 2400,
    fx: 'step_flash',
  },
  {
    id: 'laser-pointer',
    name: 'Laser Pointer',
    cost: 56,
    desc: 'Turns idle paws into full chibi chase mode.',
    bond: 4, trust: 1, happiness: 8, energy: -6, hype: 9,
    expression: 'grin',
    reaction: 'dart',
    favored: ['dojocat', 'buu', 'devit'],
    visual_type: 'projectile',
    hold_slot: 'none',
    action_state: 'chase',
    overlay_id: 'laser-dot',
    duration_ms: 2000,
    fx: 'dot_bounce',
  },
  {
    id: 'lucky-lantern',
    name: 'Lucky Lantern',
    cost: 72,
    desc: 'A ceremonial toy that fills the habitat with soft glow.',
    bond: 6, trust: 4, happiness: 5, energy: -4, hype: 5,
    bond_tokens: 1,
    expression: 'sparkle',
    reaction: 'bless',
    favored: ['pixiu', 'dojocat'],
    visual_type: 'held',
    hold_slot: 'mouth',
    action_state: 'lantern_bless',
    overlay_id: 'lantern',
    duration_ms: 2800,
    fx: 'warm_glow',
  },
  {
    id: 'punch-mitts',
    name: 'Punch Mitts',
    cost: 78,
    desc: 'Training mitts for fierce little sparring drills.',
    bond: 6, trust: 5, happiness: 4, energy: -10, hype: 8,
    combo_balance: 8,
    expression: 'proud',
    reaction: 'kata',
    favored: ['dojocat', 'devit'],
    visual_type: 'held',
    hold_slot: 'hand',
    action_state: 'spar_combo',
    overlay_id: 'mitts',
    duration_ms: 2200,
    fx: 'impact_flash',
  },
];
const PET_TOY_MAP = Object.fromEntries(PET_TOYS.map((toy) => [toy.id, toy]));

const TRAINING_PATHS = {
  accuracy: {
    id: 'accuracy',
    label: 'Accuracy',
    short_label: 'Accuracy',
    desc: 'Clean timing, polished grades, and composed play.',
    icon: '🎯',
    milestones: [
      { threshold: 40, title: 'Eye for Timing', desc: 'Your pet starts reading cleaner patterns in your play.', reward: { type: 'title', value: 'Precision Student', label: 'Title: Precision Student' } },
      { threshold: 120, title: 'Judge Whisperer', desc: 'A sharper, calmer presence settles into the bond.', reward: { type: 'habitat', value: 'medal-rack', label: 'Unlock: Medal Rack (Room)' } },
      { threshold: 260, title: 'Perfect Form', desc: 'This pet now carries itself like a refined score hunter.', reward: { type: 'aura', value: 'precision', label: 'Aura: Precision Glow' } },
    ],
  },
  stamina: {
    id: 'stamina',
    label: 'Stamina',
    short_label: 'Stamina',
    desc: 'Heavy sets, long sessions, and level 18+ grit.',
    icon: '💪',
    milestones: [
      { threshold: 40, title: 'Endurance Spark', desc: 'The pet starts thriving on harder clears.', reward: { type: 'title', value: 'Iron Trainee', label: 'Title: Iron Trainee' } },
      { threshold: 120, title: 'Iron Rhythm', desc: 'Its stance becomes tougher and more grounded.', reward: { type: 'habitat', value: 'punching-bag', label: 'Unlock: Punching Bag (Room)' } },
      { threshold: 260, title: 'Arena Engine', desc: 'A full-bodied training-beast energy takes over.', reward: { type: 'aura', value: 'ironclad', label: 'Aura: Ironclad Pulse' } },
    ],
  },
  tech: {
    id: 'tech',
    label: 'Tech',
    short_label: 'Tech',
    desc: 'Footwork, doubles, and clever chart solving.',
    icon: '🧠',
    milestones: [
      { threshold: 40, title: 'Footwork Instinct', desc: 'The pet leans into tricky movement and agility.', reward: { type: 'title', value: 'Clever Feet', label: 'Title: Clever Feet' } },
      { threshold: 120, title: 'Pattern Reader', desc: 'It starts to feel clever, agile, and hard to catch.', reward: { type: 'habitat', value: 'arcade-cab', label: 'Unlock: Arcade Cabinet (Room)' } },
      { threshold: 260, title: 'Lab Monster', desc: 'A sharp little tactician has fully emerged.', reward: { type: 'aura', value: 'circuit', label: 'Aura: Circuit Trace' } },
    ],
  },
  consistency: {
    id: 'consistency',
    label: 'Consistency',
    short_label: 'Consistency',
    desc: 'Reliable routines, daily care, and steady improvement.',
    icon: '🪴',
    milestones: [
      { threshold: 40, title: 'Care Rhythm', desc: 'The pet settles into dependable routines with you.', reward: { type: 'title', value: 'Steady Caretaker', label: 'Title: Steady Caretaker' } },
      { threshold: 120, title: 'Steady Partner', desc: 'Its mood and bond feel more stable and grounded.', reward: { type: 'habitat', value: 'cherry-petals', label: 'Unlock: Cherry Petals (Floor)' } },
      { threshold: 260, title: 'Evergreen Companion', desc: 'A deeply reliable training partner identity forms.', reward: { type: 'aura', value: 'evergreen', label: 'Aura: Evergreen Calm' } },
    ],
  },
  tournament: {
    id: 'tournament',
    label: 'Tournament',
    short_label: 'Tournament',
    desc: 'Pressure moments, challenge runs, and standout clears.',
    icon: '🏆',
    milestones: [
      { threshold: 40, title: 'Bracket Pulse', desc: 'The pet starts responding to higher-stakes moments.', reward: { type: 'title', value: 'Bracket Runner', label: 'Title: Bracket Runner' } },
      { threshold: 120, title: 'Stage Instinct', desc: 'Its presence turns bolder and more competitive.', reward: { type: 'habitat', value: 'champion-banner', label: 'Unlock: Champion Banner (Wall)' } },
      { threshold: 260, title: 'Finals Aura', desc: 'Your companion carries true spotlight energy now.', reward: { type: 'aura', value: 'spotlight', label: 'Aura: Stage Spotlight' } },
    ],
  },
  social: {
    id: 'social',
    label: 'Social',
    short_label: 'Social',
    desc: 'Replays, shared moments, and scene presence.',
    icon: '✨',
    milestones: [
      { threshold: 40, title: 'Replay Spark', desc: 'The pet starts to love attention and shared moments.', reward: { type: 'title', value: 'Scene Kid', label: 'Title: Scene Kid' } },
      { threshold: 120, title: 'Scene Familiar', desc: 'A charismatic, visible identity takes shape.', reward: { type: 'habitat', value: 'photo-wall', label: 'Unlock: Photo Wall (Wall)' } },
      { threshold: 260, title: 'Dojo Celebrity', desc: 'This pet now feels born for the spotlight.', reward: { type: 'aura', value: 'fame', label: 'Aura: Fame Shimmer' } },
    ],
  },
};

const MASTERY_RANKS = [
  { threshold: 0, label: 'Rookie' },
  { threshold: 45, label: 'Apprentice' },
  { threshold: 120, label: 'Specialist' },
  { threshold: 240, label: 'Elite' },
  { threshold: 420, label: 'Master' },
  { threshold: 700, label: 'Grandmaster' },
  { threshold: 1050, label: 'Sage' },
  { threshold: 1500, label: 'Transcendent' },
  { threshold: 2100, label: 'Eternal' },
];

const HABITAT_ITEMS = {
  backgrounds: [
    { id: 'dojo-night', name: 'Dojo Night', cost: 90, kind: 'background', desc: 'Blue-lit training hall energy.', default_owned: true },
    { id: 'sunset-arcade', name: 'Sunset Arcade', cost: 120, kind: 'background', desc: 'Warm neon after-hours arcade glow.' },
    { id: 'moon-festival', name: 'Moon Festival', cost: 140, kind: 'background', desc: 'Ceremonial lantern light for calmer moods.' },
    { id: 'inferno-stage', name: 'Inferno Stage', cost: 150, kind: 'background', desc: 'A dramatic red arena for wilder pets.' },
    { id: 'neon-alley', name: 'Neon Alley', cost: 180, kind: 'background', desc: 'Pink and cyan city lights after midnight.', minBond: 40 },
    { id: 'sakura-garden', name: 'Sakura Garden', cost: 200, kind: 'background', desc: 'Soft petals drifting through warm twilight.', minBond: 90 },
    { id: 'thunderdome', name: 'Thunderdome', cost: 240, kind: 'background', desc: 'Electric arena energy for tournament veterans.', minBond: 160, minMastery: 120 },
    { id: 'celestial-shrine', name: 'Celestial Shrine', cost: 300, kind: 'background', desc: 'An ancient glow reserved for ascendant companions.', minBond: 260, minMastery: 220 },
  ],
  props: [
    { id: 'training-dummy', name: 'Training Dummy', cost: 70, kind: 'prop', desc: 'A sparring buddy for focused companions.' },
    { id: 'lucky-banner', name: 'Lucky Banner', cost: 82, kind: 'prop', desc: 'A hanging charm that brings festive energy.' },
    { id: 'boombox', name: 'Boombox', cost: 88, kind: 'prop', desc: 'A chunky little speaker stack for practice sessions.' },
    { id: 'trophy-stand', name: 'Trophy Stand', cost: 110, kind: 'prop', desc: 'A pedestal for pets who know they are stars.' },
    { id: 'punching-bag', name: 'Punching Bag', cost: 95, kind: 'prop', desc: 'A heavy bag for when your pet needs to blow off steam.', minBond: 40 },
    { id: 'arcade-cab', name: 'Arcade Cabinet', cost: 130, kind: 'prop', desc: 'A tiny PIU cab — your pet watches the screen intently.', minBond: 90 },
    { id: 'medal-rack', name: 'Medal Rack', cost: 160, kind: 'prop', desc: 'A gleaming display of hard-earned accolades.', minBond: 90, minMastery: 45 },
    { id: 'spirit-lantern', name: 'Spirit Lantern', cost: 220, kind: 'prop', desc: 'An ethereal glow that responds to bond strength.', minBond: 160, minMastery: 120 },
  ],
  floor: [
    { id: 'tatami-mat', name: 'Tatami Mat', cost: 60, kind: 'floor', desc: 'Traditional woven mats for a proper dojo feel.' },
    { id: 'led-tiles', name: 'LED Tiles', cost: 100, kind: 'floor', desc: 'Light-up dance tiles that pulse with energy.', minBond: 40 },
    { id: 'cherry-petals', name: 'Cherry Petals', cost: 140, kind: 'floor', desc: 'Scattered blossoms across the habitat floor.', minBond: 90 },
    { id: 'galaxy-floor', name: 'Galaxy Floor', cost: 200, kind: 'floor', desc: 'Stars beneath your companion\'s feet.', minBond: 160, minMastery: 120 },
  ],
  wall: [
    { id: 'dojo-scroll', name: 'Dojo Scroll', cost: 55, kind: 'wall', desc: 'A hanging scroll with training wisdom.' },
    { id: 'neon-sign', name: 'Neon Sign', cost: 90, kind: 'wall', desc: 'A glowing sign that says "STOMP".', minBond: 40 },
    { id: 'photo-wall', name: 'Photo Wall', cost: 120, kind: 'wall', desc: 'Pinned memories and polaroids from past sessions.', minBond: 90 },
    { id: 'champion-banner', name: 'Champion Banner', cost: 180, kind: 'wall', desc: 'A legendary banner only elite companions earn.', minBond: 160, minMastery: 120 },
  ],
};
const ALL_HABITAT_ITEMS = [...HABITAT_ITEMS.backgrounds, ...HABITAT_ITEMS.props, ...(HABITAT_ITEMS.floor || []), ...(HABITAT_ITEMS.wall || [])];
const HABITAT_ITEM_MAP = Object.fromEntries(ALL_HABITAT_ITEMS.map((item) => [item.id, item]));

function getHabitatSlot(itemId) {
  if (HABITAT_ITEMS.backgrounds.find((item) => item.id === itemId)) return 'background';
  if (HABITAT_ITEMS.props.find((item) => item.id === itemId)) return 'prop';
  if ((HABITAT_ITEMS.floor || []).find((item) => item.id === itemId)) return 'floor';
  if ((HABITAT_ITEMS.wall || []).find((item) => item.id === itemId)) return 'wall';
  return null;
}

const BOND_RANKS = [
  { threshold: 0, key: 'training-partner', label: 'Training Partner' },
  { threshold: 40, key: 'pad-gremlin', label: 'Pad Gremlin' },
  { threshold: 90, key: 'dojo-mascot', label: 'Dojo Mascot' },
  { threshold: 160, key: 'arena-spirit', label: 'Arena Spirit' },
  { threshold: 260, key: 'blessed-beast', label: 'Blessed Beast' },
  { threshold: 400, key: 'legendary-bond', label: 'Legendary Bond' },
  { threshold: 600, key: 'eternal-companion', label: 'Eternal Companion' },
  { threshold: 900, key: 'mythic-guardian', label: 'Mythic Guardian' },
  { threshold: 1300, key: 'celestial-warden', label: 'Celestial Warden' },
  { threshold: 1800, key: 'astral-sovereign', label: 'Astral Sovereign' },
  { threshold: 2500, key: 'primordial-spirit', label: 'Primordial Spirit' },
];

// ─── Bond gain scaling ───────────────────────────────────────────
// Bond gain diminishes as bond grows — each tier reduces effective gain
// so maintaining a high bond requires consistent, diverse engagement.
function scaleBondGain(rawGain, currentBond) {
  if (currentBond < 100) return rawGain;
  if (currentBond < 260) return Math.max(1, Math.round(rawGain * 0.75));
  if (currentBond < 500) return Math.max(1, Math.round(rawGain * 0.5));
  if (currentBond < 900) return Math.max(1, Math.round(rawGain * 0.3));
  if (currentBond < 1300) return Math.max(1, Math.round(rawGain * 0.15));
  if (currentBond < 1800) return Math.max(1, Math.round(rawGain * 0.10));
  return Math.max(1, Math.round(rawGain * 0.07));
}

// ─── Tap diminishing returns ─────────────────────────────────────
// First 8 taps per day: full rewards. 9-15: no bond gain. 16+: pet gets annoyed.
const TAP_FULL_REWARD_LIMIT = 8;
const TAP_NEUTRAL_LIMIT = 15;
function getTapEffects(dailyTapCount) {
  if (dailyTapCount < TAP_FULL_REWARD_LIMIT) {
    return { bond: 1, trust: 1, happiness: 2, hype: 1, phase: 'full' };
  }
  if (dailyTapCount < TAP_NEUTRAL_LIMIT) {
    return { bond: 0, trust: 0, happiness: 1, hype: 0, phase: 'diminished' };
  }
  // Pet gets annoyed — over-tapping
  return { bond: 0, trust: -1, happiness: -1, hype: -1, phase: 'annoyed' };
}

// ─── Energy → Hunger conversion ──────────────────────────────────
// For every point of energy spent, hunger drops proportionally
// (burning energy makes you hungry!)
const ENERGY_TO_HUNGER_RATIO = 0.2; // spend 10 energy → lose 2 hunger

// ─── Rest cooldown ───────────────────────────────────────────────
const REST_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between rests
const REST_HUNGER_COST = 4; // resting makes you hungrier

// ─── Clothing ─────────────────────────────────────────────────────
const CLOTHING = {
  hats: [
    { id: 'chicken-hat', name: 'Chicken Hat', cost: 50, defaultColor: '#FFEB3B' },
    { id: 'headband', name: 'Headband', cost: 20, defaultColor: '#E53935' },
    { id: 'crown', name: 'Crown', cost: 100, defaultColor: '#FFD700' },
    { id: 'beanie', name: 'Beanie', cost: 30, defaultColor: '#607D8B' },
    { id: 'wizard-hat', name: 'Wizard Hat', cost: 75, defaultColor: '#7B1FA2' },
    { id: 'party-hat', name: 'Party Hat', cost: 15, defaultColor: '#FF4081' },
    { id: 'astronaut-helmet', name: 'Astronaut Helmet', cost: 120, defaultColor: '#CFD8DC' },
    { id: 'goggles', name: 'Lab Goggles', cost: 35, defaultColor: '#4FC3F7' },
    { id: 'cat-hoodie', name: 'Cat Hoodie', cost: 60, defaultColor: '#FFEB3B' },
    { id: 'ranger-helmet', name: 'Ranger Helmet', cost: 90, defaultColor: '#E53935' },
    { id: 'santa-hat', name: 'Santa Hat', cost: 40, defaultColor: '#E53935' },
  ],
  tops: [
    { id: 'denim-jacket', name: 'STOMP Jacket', cost: 60, defaultColor: '#42649f' },
    { id: 'leather-jacket', name: 'Leather Jacket', cost: 70, defaultColor: '#1a1a1a' },
    { id: 'lab-coat', name: 'Lab Coat', cost: 55, defaultColor: '#f5f5f5' },
    { id: 'sailor-shirt', name: 'Sailor Shirt', cost: 40, defaultColor: '#f5f5f5' },
    { id: 'dress', name: 'Dress', cost: 45, defaultColor: '#F48FB1' },
    { id: 'hoodie', name: 'Hoodie', cost: 35, defaultColor: '#90CAF9' },
    { id: 'camo-vest', name: 'Camo Vest', cost: 50, defaultColor: '#6b8e4e' },
    { id: 'power-suit', name: 'Power Suit', cost: 100, defaultColor: '#E53935' },
    { id: 'traditional-robe', name: 'Traditional Robe', cost: 80, defaultColor: '#E91E63' },
  ],
  belts: [
    { id: 'stomp-belt', name: 'Stomp Belt', cost: 40, defaultColor: '#1A1A2E' },
    { id: 'chain-belt', name: 'Chain Belt', cost: 35, defaultColor: '#B0BEC5' },
    { id: 'medal-chain', name: 'Medal Chain', cost: 55, defaultColor: '#FFD700' },
    { id: 'ribbon', name: 'Ribbon', cost: 15, defaultColor: '#F06292' },
    { id: 'sash', name: 'Champion Sash', cost: 60, defaultColor: '#FFD700' },
    { id: 'utility-belt', name: 'Utility Belt', cost: 45, defaultColor: '#5D4037' },
  ],
  shoes: [
    { id: 'sneakers', name: 'Sneakers', cost: 25, defaultColor: '#FFFFFF' },
    { id: 'boots', name: 'Boots', cost: 45, defaultColor: '#5D4037' },
    { id: 'sandals', name: 'Sandals', cost: 10, defaultColor: '#8D6E63' },
    { id: 'dance-shoes', name: 'Dance Shoes', cost: 55, defaultColor: '#E53935' },
    { id: 'power-boots', name: 'Power Boots', cost: 65, defaultColor: '#E53935' },
    { id: 'cat-slippers', name: 'Cat Slippers', cost: 30, defaultColor: '#FFEB3B' },
  ],
};
const ALL_CLOTHING = [...CLOTHING.hats, ...(CLOTHING.tops || []), ...CLOTHING.belts, ...CLOTHING.shoes];
const CLOTHING_MAP = Object.fromEntries(ALL_CLOTHING.map(c => [c.id, c]));
function getClothingSlot(itemId) {
  if (CLOTHING.hats.find(h => h.id === itemId)) return 'hat';
  if (CLOTHING.tops && CLOTHING.tops.find(t => t.id === itemId)) return 'top';
  if (CLOTHING.belts.find(b => b.id === itemId)) return 'belt';
  if (CLOTHING.shoes.find(s => s.id === itemId)) return 'shoes';
  return null;
}

// ─── Tricks ───────────────────────────────────────────────────────
const TRICKS = {
  dojocat: [
    { id: 'pose', name: 'Strike a Pose', xp: 0, description: 'A confident smirk and power stance', comboReward: 5, happinessReward: 5 },
    { id: 'flex', name: 'Show Off', xp: 150, description: 'Thumbs up with maximum swagger', comboReward: 12, happinessReward: 8 },
    { id: 'science', name: 'Lab Experiment', xp: 600, description: 'Dons a lab coat for pad science', comboReward: 20, happinessReward: 12 },
    { id: 'rage', name: 'POWER UP!', xp: 2500, description: 'Unleashes tournament energy', comboReward: 35, happinessReward: 18 },
  ],
  buu: [
    { id: 'smile', name: 'Big Smile', xp: 0, description: 'A warm, content grin', comboReward: 5, happinessReward: 5 },
    { id: 'dressup', name: 'Costume Party', xp: 150, description: 'Shows off a fabulous outfit', comboReward: 12, happinessReward: 8 },
    { id: 'ranger', name: 'Go Ranger!', xp: 600, description: 'Transforms into a Power Ranger', comboReward: 20, happinessReward: 12 },
    { id: 'wizard', name: 'Cast Spell', xp: 2500, description: 'Channels arcane dance magic', comboReward: 35, happinessReward: 18 },
  ],
  devit: [
    { id: 'idle', name: 'Stand Still', xp: 0, description: 'Idle and looking cute', comboReward: 5, happinessReward: 5 },
    { id: 'scamper', name: 'Quick Dash', xp: 150, description: 'Zips across with tiny steps', comboReward: 12, happinessReward: 8 },
    { id: 'prance', name: 'Happy Dance', xp: 600, description: 'Prances with pure joy', comboReward: 20, happinessReward: 12 },
    { id: 'cheer', name: 'Victory Cheer', xp: 2500, description: 'Jumps and cheers with all might', comboReward: 35, happinessReward: 18 },
  ],
  pixiu: [
    { id: 'greet', name: 'Greeting', xp: 0, description: 'A warm traditional welcome', comboReward: 5, happinessReward: 5 },
    { id: 'laugh', name: 'Big Laugh', xp: 150, description: 'Laughs so hard eyes close', comboReward: 12, happinessReward: 8 },
    { id: 'dance', name: 'Lion Dance', xp: 600, description: 'Celebratory lion dance', comboReward: 20, happinessReward: 12 },
    { id: 'fortune', name: 'Fortune Blessing', xp: 2500, description: 'Bestows a golden blessing', comboReward: 35, happinessReward: 18 },
  ],
};
const TRICK_DEMAND_GRADES = ['A', 'A', 'AA', 'S'];

// ─── Schema ───────────────────────────────────────────────────────
function ensurePetTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_pets (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      character TEXT NOT NULL DEFAULT 'dojocat',
      fullness INTEGER NOT NULL DEFAULT 50,
      total_songs_fed INTEGER NOT NULL DEFAULT 0,
      last_fed_at TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  const cols = db.prepare("PRAGMA table_info(user_pets)").all().map(c => c.name);
  const addCol = (name, def) => { if (!cols.includes(name)) db.exec(`ALTER TABLE user_pets ADD COLUMN ${name} ${def}`); };
  addCol('experience', "INTEGER NOT NULL DEFAULT 0");
  addCol('tricks_unlocked', "TEXT NOT NULL DEFAULT '[]'");
  addCol('pending_trick', "TEXT NOT NULL DEFAULT ''");
  addCol('trick_demand_level', "INTEGER NOT NULL DEFAULT 0");
  addCol('trick_demand_grade', "TEXT NOT NULL DEFAULT ''");
  addCol('trick_demand_expires', "TEXT NOT NULL DEFAULT ''");
  addCol('last_trick_performed', "TEXT NOT NULL DEFAULT ''");
  addCol('last_trick_at', "TEXT NOT NULL DEFAULT ''");
  addCol('highest_level', "INTEGER NOT NULL DEFAULT 0");
  // New columns for v2
  addCol('happiness', "INTEGER NOT NULL DEFAULT 50");
  addCol('combo_balance', "INTEGER NOT NULL DEFAULT 0");
  addCol('owned_items', "TEXT NOT NULL DEFAULT '[]'");
  addCol('equipped_hat', "TEXT NOT NULL DEFAULT ''");
  addCol('equipped_belt', "TEXT NOT NULL DEFAULT ''");
  addCol('equipped_shoes', "TEXT NOT NULL DEFAULT ''");
  addCol('equipped_top', "TEXT NOT NULL DEFAULT ''");
  addCol('hat_color', "TEXT NOT NULL DEFAULT ''");
  addCol('belt_color', "TEXT NOT NULL DEFAULT ''");
  addCol('shoes_color', "TEXT NOT NULL DEFAULT ''");
  addCol('top_color', "TEXT NOT NULL DEFAULT ''");
  addCol('is_pet_avatar', "INTEGER NOT NULL DEFAULT 0");
  addCol('bond', "INTEGER NOT NULL DEFAULT 0");
  addCol('energy', "INTEGER NOT NULL DEFAULT 65");
  addCol('trust', "INTEGER NOT NULL DEFAULT 35");
  addCol('hype', "INTEGER NOT NULL DEFAULT 25");
  addCol('bond_tokens', "INTEGER NOT NULL DEFAULT 0");
  addCol('rare_shards', "INTEGER NOT NULL DEFAULT 0");
  addCol('interaction_count', "INTEGER NOT NULL DEFAULT 0");
  addCol('daily_interaction_count', "INTEGER NOT NULL DEFAULT 0");
  addCol('daily_interaction_key', "TEXT NOT NULL DEFAULT ''");
  addCol('claimed_missions', "TEXT NOT NULL DEFAULT '[]'");
  addCol('last_food_id', "TEXT NOT NULL DEFAULT ''");
  addCol('last_food_at', "TEXT NOT NULL DEFAULT ''");
  addCol('owned_toys', "TEXT NOT NULL DEFAULT '[]'");
  addCol('last_toy_id', "TEXT NOT NULL DEFAULT ''");
  addCol('last_toy_at', "TEXT NOT NULL DEFAULT ''");
  addCol('owned_habitat_items', "TEXT NOT NULL DEFAULT '[\"dojo-night\"]'");
  addCol('active_habitat_bg', "TEXT NOT NULL DEFAULT 'dojo-night'");
  addCol('active_habitat_prop', "TEXT NOT NULL DEFAULT ''");
  addCol('active_habitat_floor', "TEXT NOT NULL DEFAULT ''");
  addCol('active_habitat_wall', "TEXT NOT NULL DEFAULT ''");
  addCol('unlocked_mastery_rewards', "TEXT NOT NULL DEFAULT '[]'");
  addCol('gift_log', "TEXT NOT NULL DEFAULT '[]'");
  addCol('active_training_path', "TEXT NOT NULL DEFAULT 'consistency'");
  addCol('mastery_xp', "INTEGER NOT NULL DEFAULT 0");
  // Streak & engagement tracking
  addCol('daily_streak', "INTEGER NOT NULL DEFAULT 0");
  addCol('longest_streak', "INTEGER NOT NULL DEFAULT 0");
  addCol('last_active_date', "TEXT NOT NULL DEFAULT ''");
  addCol('lifetime_feeds', "INTEGER NOT NULL DEFAULT 0");
  addCol('lifetime_activities', "INTEGER NOT NULL DEFAULT 0");
  addCol('last_coach_priority', "TEXT NOT NULL DEFAULT ''");
  addCol('last_coach_at', "TEXT NOT NULL DEFAULT ''");
  addCol('coach_focus_count', "INTEGER NOT NULL DEFAULT 0");
  // v3: tap limits, rest cooldown, daily tap tracking
  addCol('daily_tap_count', "INTEGER NOT NULL DEFAULT 0");
  addCol('daily_tap_key', "TEXT NOT NULL DEFAULT ''");
  addCol('last_rest_at', "TEXT NOT NULL DEFAULT ''");
  addCol('nickname', "TEXT NOT NULL DEFAULT ''");
  addCol('last_meaningful_care_at', "TEXT NOT NULL DEFAULT ''");
  addCol('last_pump_play_at', "TEXT NOT NULL DEFAULT ''");
  addCol('last_request_refresh_at', "TEXT NOT NULL DEFAULT ''");
  addCol('active_request_type', "TEXT NOT NULL DEFAULT ''");
  addCol('active_request_payload', "TEXT NOT NULL DEFAULT '{}'");
  addCol('active_request_status', "TEXT NOT NULL DEFAULT ''");
  addCol('active_request_created_at', "TEXT NOT NULL DEFAULT ''");
  addCol('active_request_expires_at', "TEXT NOT NULL DEFAULT ''");
  addCol('active_request_completed_at', "TEXT NOT NULL DEFAULT ''");
  addCol('neglect_strikes', "INTEGER NOT NULL DEFAULT 0");
}

function ensurePetSocialTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pet_social_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      reaction_type TEXT NOT NULL DEFAULT 'cheer',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(from_user_id, to_user_id, reaction_type, created_at)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS pet_gifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      gift_type TEXT NOT NULL,
      gift_id TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

// ─── Helpers ──────────────────────────────────────────────────────
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function toSqliteDateTime(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function getUtcDayKey(date = new Date()) {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

function getUtcWeekKey(date = new Date()) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + diff);
  return copy.toISOString().slice(0, 10);
}

/**
 * Update daily streak. Call on any meaningful pet interaction.
 * Returns { streak, longest, isNewDay, streakBonus }
 */
function updateStreak(db, pet) {
  const today = getUtcDayKey();
  const lastActive = pet.last_active_date || '';
  if (lastActive === today) {
    // Already active today — no change
    return { streak: pet.daily_streak || 1, longest: pet.longest_streak || 1, isNewDay: false, streakBonus: 0 };
  }
  const yesterday = getUtcDayKey(new Date(Date.now() - 86400000));
  let streak = 1;
  if (lastActive === yesterday) {
    streak = (pet.daily_streak || 0) + 1;
  }
  const longest = Math.max(streak, pet.longest_streak || 0);
  const streakBonus = Math.min(streak, 7); // cap at +7 per streak day
  db.prepare(`
    UPDATE user_pets SET daily_streak = ?, longest_streak = ?, last_active_date = ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(streak, longest, today, pet.user_id);
  return { streak, longest, isNewDay: true, streakBonus };
}

/** Time-of-day greeting flavour (UTC-based, good enough for most users) */
function getTimeGreeting() {
  const h = new Date().getUTCHours();
  if (h < 6) return 'night';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

const TIME_GREETINGS = {
  dojocat: {
    morning: 'Morning drills begin.', afternoon: 'Afternoon training awaits.', evening: 'Evening kata session.', night: 'The dojo rests... for now.',
  },
  buu: {
    morning: 'Good morning! Breakfast?', afternoon: 'Afternoon snack time!', evening: 'Evening vibes are the best.', night: 'Midnight munchies...',
  },
  devit: {
    morning: 'Up early? Chaos waits for no one!', afternoon: 'Peak mischief hours.', evening: 'Evening chaos is elite chaos.', night: 'The night shift troublemaker.',
  },
  pixiu: {
    morning: 'The morning light brings fortune.', afternoon: 'A blessed afternoon.', evening: 'Evening blessings upon you.', night: 'The stars watch over us.',
  },
};

/**
 * Build milestone events from lifetime stats.
 * Returns array of { id, label, unlocked } milestone markers.
 */
function detectMilestones(pet) {
  const milestones = [];
  const interactions = pet.interaction_count || 0;
  const feeds = pet.lifetime_feeds || pet.total_songs_fed || 0;
  const activities = pet.lifetime_activities || 0;
  const bond = pet.bond || 0;
  const streak = pet.daily_streak || 0;

  const checks = [
    { id: 'first_tap', label: 'First Touch', threshold: 1, stat: interactions },
    { id: 'social_10', label: '10 Interactions', threshold: 10, stat: interactions },
    { id: 'social_50', label: '50 Interactions', threshold: 50, stat: interactions },
    { id: 'social_200', label: '200 Interactions', threshold: 200, stat: interactions },
    { id: 'fed_10', label: '10 Meals Served', threshold: 10, stat: feeds },
    { id: 'fed_50', label: '50 Meals Served', threshold: 50, stat: feeds },
    { id: 'active_10', label: '10 Activities', threshold: 10, stat: activities },
    { id: 'active_50', label: '50 Activities', threshold: 50, stat: activities },
    { id: 'bond_40', label: 'Bond 40 — Perform Unlocked', threshold: 40, stat: bond },
    { id: 'bond_90', label: 'Bond 90 — Dojo Mascot', threshold: 90, stat: bond },
    { id: 'bond_160', label: 'Bond 160 — Arena Spirit', threshold: 160, stat: bond },
    { id: 'streak_3', label: '3-Day Streak', threshold: 3, stat: streak },
    { id: 'streak_7', label: '7-Day Streak', threshold: 7, stat: streak },
    { id: 'streak_14', label: '14-Day Streak', threshold: 14, stat: streak },
    { id: 'streak_30', label: '30-Day Streak', threshold: 30, stat: streak },
  ];
  for (const c of checks) {
    milestones.push({ id: c.id, label: c.label, unlocked: c.stat >= c.threshold });
  }
  return milestones;
}

function computeDecayed(storedValue, lastFedAt, decayPerHour) {
  if (!lastFedAt) return storedValue;
  const lastFed = new Date(lastFedAt + 'Z').getTime();
  const hoursSince = Math.max(0, (Date.now() - lastFed) / (1000 * 60 * 60));
  return clamp(Math.round(storedValue - hoursSince * decayPerHour), 0, MAX_STAT);
}

function getHoursSince(lastAt) {
  if (!lastAt) return 0;
  const lastMs = new Date(`${lastAt}Z`).getTime();
  if (!Number.isFinite(lastMs)) return 0;
  return Math.max(0, (Date.now() - lastMs) / (1000 * 60 * 60));
}

function formatPetStatLabel(key = '') {
  const map = {
    combo_balance: 'combo',
    bond_tokens: 'bond tokens',
    rare_shards: 'shards',
    hype: 'momentum',
  };
  return map[key] || key.replace(/_/g, ' ');
}

function getStateValue(storedValue, lastAt, decayPerHour) {
  return computeDecayed(storedValue, lastAt, decayPerHour);
}

function getEnergyRecoveryRate(hunger) {
  if (hunger >= 40) return ENERGY_RECOVERY_HIGH_PER_HOUR;
  if (hunger >= 20) return ENERGY_RECOVERY_MEDIUM_PER_HOUR;
  return ENERGY_RECOVERY_LOW_PER_HOUR;
}

function getEnergyStateValue(storedValue, lastAt, hunger) {
  const safeStored = clamp(parseInt(storedValue, 10) || 0, 0, MAX_STAT);
  const hoursSince = getHoursSince(lastAt);
  if (hoursSince <= 0) return safeStored;
  const recovery = getEnergyRecoveryRate(hunger);
  return clamp(Math.round(safeStored + (hoursSince * recovery)), 0, MAX_STAT);
}

function getMomentumStateValue(storedValue, lastAt) {
  return computeDecayed(storedValue, lastAt, MOMENTUM_DECAY_PER_HOUR);
}

function getTrustStateValue(storedValue, lastMeaningfulCareAt) {
  const safeStored = clamp(parseInt(storedValue, 10) || 0, 0, MAX_STAT);
  const hoursSince = getHoursSince(lastMeaningfulCareAt);
  if (hoursSince <= NEGLECT_DECAY_DELAY_HOURS) return safeStored;
  const decayHours = hoursSince - NEGLECT_DECAY_DELAY_HOURS;
  const decayAmount = (decayHours / 24) * TRUST_NEGLECT_DECAY_PER_DAY;
  return clamp(Math.round(safeStored - decayAmount), 0, MAX_STAT);
}

function getWeightState(hunger) {
  if (hunger <= 15) return 'starving';
  if (hunger <= 35) return 'thin';
  if (hunger <= 65) return 'normal';
  if (hunger <= 85) return 'chubby';
  return 'fat';
}

function getMood(hunger, happiness) {
  const avg = (hunger + happiness) / 2;
  if (avg <= 15) return 'desperate';
  if (avg <= 35) return 'hungry';
  if (avg <= 65) return 'happy';
  if (avg <= 85) return 'content';
  return 'stuffed';
}

function getMoodState(vitals) {
  const hunger = vitals?.hunger || 0;
  const energy = vitals?.energy || 0;
  const trust = vitals?.trust || 0;
  const momentum = vitals?.momentum || 0;
  if (hunger >= 70 && energy >= 60 && trust >= 50 && momentum >= 40) return 'thriving';
  if (hunger < 20 || energy < 15 || (hunger < 30 && energy < 30)) return 'neglected';
  if (hunger < 35 || energy < 35 || momentum < 20) return 'restless';
  return 'stable';
}

function getWellbeingRewardMultiplier(vitals) {
  const values = [vitals?.hunger || 0, vitals?.energy || 0, vitals?.trust || 0, vitals?.momentum || 0];
  if (values.some((value) => value < 20)) return 0.6;
  if (values.some((value) => value < 40)) return 0.85;
  if (values.every((value) => value >= 70)) return 1.15;
  return 1;
}

function buildPetVitalsSnapshot(pet) {
  const hunger = computeDecayed(pet.fullness || 50, pet.last_fed_at, HUNGER_DECAY_PER_HOUR);
  const happiness = computeDecayed(pet.happiness || 50, pet.last_fed_at, HAPPINESS_DECAY_PER_HOUR);
  const energy = getEnergyStateValue(pet.energy || 65, pet.updated_at || pet.last_fed_at, hunger);
  const momentum = getMomentumStateValue(pet.hype || 25, pet.updated_at || pet.last_fed_at);
  const trust = getTrustStateValue(
    pet.trust || 35,
    pet.last_meaningful_care_at || pet.last_food_at || pet.last_fed_at || ''
  );
  const bond = Math.max(0, pet.bond || 0);
  const moodState = getMoodState({ hunger, energy, trust, momentum });
  return {
    hunger,
    happiness,
    energy,
    momentum,
    trust,
    bond,
    mood_state: moodState,
    mood: getMood(hunger, happiness),
    reward_multiplier: getWellbeingRewardMultiplier({ hunger, energy, trust, momentum }),
  };
}

function buildPetNeeds(vitals, pet, summary = {}) {
  const needs = [];
  if ((vitals?.hunger || 0) < CRITICAL_HUNGER_THRESHOLD) {
    needs.push({
      id: 'feed-now',
      priority: 'critical',
      label: 'Very hungry',
      detail: 'Feed your pet before trying demanding actions.',
      cta: 'food',
    });
  } else if ((vitals?.hunger || 0) < LOW_HUNGER_THRESHOLD) {
    needs.push({
      id: 'feed-soon',
      priority: 'high',
      label: 'Getting hungry',
      detail: 'A meal will keep recovery and training reliable.',
      cta: 'food',
    });
  }

  if ((vitals?.energy || 0) < LOW_ENERGY_THRESHOLD) {
    needs.push({
      id: 'rest',
      priority: (vitals?.energy || 0) < 10 ? 'critical' : 'high',
      label: 'Low energy',
      detail: 'Rest or feed before sparring, exploring, or minigames.',
      cta: 'pet',
    });
  }

  if ((vitals?.trust || 0) < MID_TRUST_THRESHOLD) {
    needs.push({
      id: 'bonding',
      priority: (vitals?.trust || 0) < LOW_TRUST_THRESHOLD ? 'high' : 'medium',
      label: 'Trust needs work',
      detail: 'Grooming, praise, and consistent care will unlock stronger actions.',
      cta: 'pet',
    });
  }

  if ((vitals?.momentum || 0) < LOW_MOMENTUM_THRESHOLD) {
    needs.push({
      id: 'pump-session',
      priority: 'medium',
      label: 'Momentum fading',
      detail: (summary?.plays_today || 0) > 0
        ? 'A strong play, replay, or live session will wake the pet up again.'
        : 'Sync a Pump session to rebuild short-term excitement.',
      cta: 'pump',
    });
  }

  if (!needs.length) {
    needs.push({
      id: 'thriving',
      priority: 'low',
      label: 'Doing well',
      detail: 'Your pet is stable. Push bond, missions, or style next.',
      cta: 'pet',
    });
  }

  return needs;
}

function getRecommendedActions(vitals, pet, summary = {}) {
  const actions = [];
  if ((vitals?.hunger || 0) < LOW_HUNGER_THRESHOLD) actions.push('feed');
  if ((vitals?.energy || 0) < LOW_ENERGY_THRESHOLD) actions.push('rest');
  if ((vitals?.trust || 0) < MID_TRUST_THRESHOLD) actions.push('groom');
  if ((vitals?.momentum || 0) < LOW_MOMENTUM_THRESHOLD || !(summary?.plays_today > 0)) actions.push('play-pump');
  if ((pet?.bond || 0) >= 40 && (vitals?.energy || 0) >= 35 && (vitals?.trust || 0) >= 40) actions.push('perform');
  return Array.from(new Set(actions)).slice(0, 4);
}

function getBondRank(bond = 0) {
  let current = BOND_RANKS[0];
  let next = null;
  for (let i = 0; i < BOND_RANKS.length; i++) {
    const rank = BOND_RANKS[i];
    if (bond >= rank.threshold) {
      current = rank;
      next = BOND_RANKS[i + 1] || null;
    }
  }
  return {
    ...current,
    progress: next
      ? clamp((bond - current.threshold) / Math.max(1, next.threshold - current.threshold), 0, 1)
      : 1,
    next_label: next?.label || '',
    next_threshold: next?.threshold || current.threshold,
  };
}

function getCharacterProfile(character = 'dojocat') {
  return CHARACTER_PROFILES[character] || CHARACTER_PROFILES.dojocat;
}

function getFoodPreference(character, foodId) {
  const profile = getCharacterProfile(character);
  if (profile.favorite_foods.includes(foodId)) return 'favorite';
  if (profile.disliked_foods.includes(foodId)) return 'disliked';
  return 'neutral';
}

function pickRandom(list, fallback = '') {
  if (!Array.isArray(list) || !list.length) return fallback;
  return list[Math.floor(Math.random() * list.length)] || fallback;
}

/**
 * Build a contextual speech line that considers mood, trust, activity, and food preference.
 * Has a small chance of returning a rare "hidden" line the player hasn't seen.
 * @param {object} pet - raw pet row from DB
 * @param {{ type: 'interact'|'activity'|'feed', actionId?: string, activityId?: string, preference?: string }} ctx
 * @returns {{ speech: string, rare: boolean, mood_aware: boolean }}
 */
function buildContextualSpeech(pet, ctx = {}) {
  const character = pet.character || 'dojocat';
  const sd = CONTEXTUAL_SPEECH[character] || CONTEXTUAL_SPEECH.dojocat;
  const profile = getCharacterProfile(character);
  const hunger = computeDecayed(pet.fullness || 50, pet.last_fed_at, HUNGER_DECAY_PER_HOUR);
  const happiness = computeDecayed(pet.happiness || 50, pet.last_fed_at, HAPPINESS_DECAY_PER_HOUR);
  const mood = getMood(hunger, happiness);
  const trust = pet.trust || 35;
  const trustTier = trust < 45 ? 'low' : trust < 75 ? 'mid' : 'high';

  // 8% chance of a rare hidden line (regardless of context)
  if (Math.random() < 0.08 && sd.hidden_lines?.length) {
    return { speech: pickRandom(sd.hidden_lines), rare: true, mood_aware: false };
  }

  // Feed context — use preference-specific pool
  if (ctx.type === 'feed' && ctx.preference) {
    const pool = sd.feed_lines?.[ctx.preference] || sd.feed_lines?.neutral || [];
    return { speech: pickRandom(pool, 'Mmm.'), rare: false, mood_aware: false };
  }

  // Activity context — use per-activity pool
  if (ctx.type === 'activity' && ctx.activityId) {
    const pool = sd.activity_lines?.[ctx.activityId];
    if (pool?.length) return { speech: pickRandom(pool), rare: false, mood_aware: false };
  }

  // Interaction context — blend mood / trust / character lines
  if (ctx.type === 'interact') {
    // Extreme moods override 50% of the time
    if (['desperate', 'stuffed'].includes(mood) && Math.random() < 0.5) {
      return { speech: pickRandom(sd.mood_lines?.[mood] || [], 'Hmm.'), rare: false, mood_aware: true };
    }
    // 20% chance of a trust-flavoured line
    if (Math.random() < 0.2 && sd.trust_lines?.[trustTier]?.length) {
      return { speech: pickRandom(sd.trust_lines[trustTier]), rare: false, mood_aware: false };
    }
    // Default: character interaction_lines for this action
    const actionId = ctx.actionId || 'tap';
    const pool = profile.interaction_lines[actionId] || profile.interaction_lines.tap || [];
    return { speech: pickRandom(pool, 'A tiny moment passes between you.'), rare: false, mood_aware: false };
  }

  // Fallback — mood line
  return { speech: pickRandom(sd.mood_lines?.[mood] || [], 'Hello!'), rare: false, mood_aware: true };
}

function getToyPreference(character, toy) {
  if (!toy) return 'neutral';
  return Array.isArray(toy.favored) && toy.favored.includes(character) ? 'favorite' : 'neutral';
}

function getDefaultTrainingPathForSpecialty(specialtyKey = '') {
  const map = {
    'accuracy-fiend': 'accuracy',
    'stamina-hound': 'stamina',
    'double-grinder': 'tech',
    'scene-showoff': 'social',
    'hop-regular': 'tournament',
    'all-rounder': 'consistency',
  };
  return map[specialtyKey] || 'consistency';
}

function getTrainingPath(pathId = 'consistency') {
  return TRAINING_PATHS[pathId] || TRAINING_PATHS.consistency;
}

function getMasteryRank(masteryXp = 0) {
  let current = MASTERY_RANKS[0];
  let next = null;
  for (let i = 0; i < MASTERY_RANKS.length; i++) {
    const rank = MASTERY_RANKS[i];
    if (masteryXp >= rank.threshold) {
      current = rank;
      next = MASTERY_RANKS[i + 1] || null;
    }
  }
  return {
    ...current,
    progress: next
      ? clamp((masteryXp - current.threshold) / Math.max(1, next.threshold - current.threshold), 0, 1)
      : 1,
    next_label: next?.label || '',
    next_threshold: next?.threshold || current.threshold,
  };
}

function getPathMasteryGain(pathId, play) {
  const score = parseInt(play?.score, 10) || 0;
  const grade = normalizeGrade(play?.grade) || (score > 0 ? gradeFromScore(score) : 'F');
  const gradeIndex = GRADE_ORDER.indexOf(grade);
  const level = parseInt(play?.level, 10) || 0;
  const isReplay = !!(String(play?.replay_embed_url || '').trim() || String(play?.replay_video_id || '').trim());
  const isDouble = String(play?.mode || '').startsWith('Double');
  let gain = 1;

  switch (pathId) {
    case 'accuracy':
      gain += gradeIndex >= GRADE_INDEX.AAA ? 2 : 0;
      gain += gradeIndex >= GRADE_INDEX.S ? 1 : 0;
      break;
    case 'stamina':
      gain += level >= 18 ? 2 : 0;
      gain += level >= 21 ? 1 : 0;
      break;
    case 'tech':
      gain += isDouble ? 2 : 0;
      gain += level >= 17 ? 1 : 0;
      break;
    case 'tournament':
      gain += level >= 20 ? 2 : 0;
      gain += gradeIndex >= GRADE_INDEX.S ? 1 : 0;
      break;
    case 'social':
      gain += isReplay ? 3 : 0;
      gain += gradeIndex >= GRADE_INDEX.AAA ? 1 : 0;
      break;
    case 'consistency':
    default:
      gain += gradeIndex >= GRADE_INDEX.AA ? 1 : 0;
      break;
  }

  return gain;
}

function getActivityMasteryGain(pathId, activityId) {
  const base = { train: 7, play: 5, groom: 4, rest: 3, spar: 8, explore: 6 }[activityId] || 4;
  if ((pathId === 'accuracy' || pathId === 'consistency') && ['train', 'groom'].includes(activityId)) return base + 2;
  if ((pathId === 'stamina' || pathId === 'tech') && ['spar', 'train', 'explore'].includes(activityId)) return base + 2;
  if ((pathId === 'social' || pathId === 'tournament') && ['play', 'explore', 'spar'].includes(activityId)) return base + 2;
  return base;
}

function getMissionMasteryGain(pathId, missionId, cadence = 'daily') {
  const base = cadence === 'weekly' ? 14 : 7;
  const map = {
    accuracy: ['aaa_pair'],
    stamina: ['hard_clear_week'],
    tech: ['double_today', 'double_week', 'new_chart_today'],
    consistency: ['feed_today', 'interact_three'],
    tournament: ['hop_run', 'weekly_challenge_entry'],
    social: ['replay_today', 'replay_week'],
  };
  return base + ((map[pathId] || []).includes(missionId) ? 4 : 0);
}

function buildMasteryProfile(pet, specialtyKey = '') {
  const activePathId = getTrainingPath(pet.active_training_path || getDefaultTrainingPathForSpecialty(specialtyKey)).id;
  const path = getTrainingPath(activePathId);
  const masteryXp = pet.mastery_xp || 0;
  const rank = getMasteryRank(masteryXp);
  const milestones = path.milestones.map((node, index) => ({
    id: `${path.id}-${index + 1}`,
    threshold: node.threshold,
    title: node.title,
    desc: node.desc,
    unlocked: masteryXp >= node.threshold,
  }));
  const nextMilestone = milestones.find((node) => !node.unlocked) || null;
  return {
    active_path: path.id,
    path,
    mastery_xp: masteryXp,
    rank,
    milestones,
    next_milestone: nextMilestone,
    available_paths: Object.values(TRAINING_PATHS).map((entry) => ({
      id: entry.id,
      label: entry.label,
      short_label: entry.short_label,
      desc: entry.desc,
      icon: entry.icon,
      active: entry.id === path.id,
    })),
  };
}

function getPetForm(bond = 0, masteryXp = 0) {
  if (bond >= 2500 && masteryXp >= 1800) {
    return {
      id: 'primordial',
      label: 'Primordial Form',
      aura: 'primordial',
      desc: 'The first form. The last form. A companion that simply IS.',
      tier: 9,
    };
  }
  if (bond >= 1800 && masteryXp >= 1200) {
    return {
      id: 'astral',
      label: 'Astral Form',
      aura: 'astral',
      desc: 'A being of pure rhythm and light, beyond mortal understanding.',
      tier: 8,
    };
  }
  if (bond >= 1300 && masteryXp >= 850) {
    return {
      id: 'celestial',
      label: 'Celestial Form',
      aura: 'celestial',
      desc: 'A companion that channels the stars themselves.',
      tier: 7,
    };
  }
  if (bond >= 900 && masteryXp >= 600) {
    return {
      id: 'mythic',
      label: 'Mythic Form',
      aura: 'divine',
      desc: 'An ancient companion of unfathomable depth and devotion.',
      tier: 6,
    };
  }
  if (bond >= 500 && masteryXp >= 400) {
    return {
      id: 'beyond',
      label: 'Beyond Form',
      aura: 'transcendent',
      desc: 'A companion that has surpassed all known limits.',
      tier: 5,
    };
  }
  if (bond >= 320 && masteryXp >= 220) {
    return {
      id: 'ascendant',
      label: 'Ascendant Form',
      aura: 'legend',
      desc: 'A scene-defining companion presence.',
      tier: 4,
    };
  }
  if (bond >= 190 && masteryXp >= 120) {
    return {
      id: 'showcase',
      label: 'Showcase Form',
      aura: 'spotlight',
      desc: 'A polished companion that turns heads.',
      tier: 3,
    };
  }
  if (bond >= 90 && masteryXp >= 45) {
    return {
      id: 'trusted',
      label: 'Trusted Form',
      aura: 'bonded',
      desc: 'A companion visibly shaped by routine and trust.',
      tier: 2,
    };
  }
  return {
    id: 'fresh',
    label: 'Fresh Form',
    aura: 'calm',
    desc: 'A young companion still finding its rhythm.',
    tier: 1,
  };
}

function getPetIdentityTitle(character = 'dojocat', mastery = null, specialty = null, bondRank = null, form = null) {
  const pathId = mastery?.path?.id || 'consistency';
  const pathTitles = {
    accuracy: { dojocat: 'Precision Sensei', buu: 'Perfect Gremlin', devit: 'Redline Judge', pixiu: 'Fortune Reader' },
    stamina: { dojocat: 'Endurance Mascot', buu: 'Bottomless Belly', devit: 'Inferno Runner', pixiu: 'Golden Strider' },
    tech: { dojocat: 'Dojo Technician', buu: 'Pattern Thief', devit: 'Chaos Stepper', pixiu: 'Silk Dancer' },
    consistency: { dojocat: 'Training Partner', buu: 'Rhythm Buddy', devit: 'Steady Menace', pixiu: 'Lucky Companion' },
    tournament: { dojocat: 'Arena Spirit', buu: 'Bracket Menace', devit: 'Gauntlet Imp', pixiu: 'Ceremonial Guardian' },
    social: { dojocat: 'Spotlight Cat', buu: 'Replay Diva', devit: 'Feed Menace', pixiu: 'Festival Mascot' },
  };
  const fallback = {
    dojocat: 'Training Partner',
    buu: 'Rhythm Buddy',
    devit: 'Chaos Familiar',
    pixiu: 'Lucky Guardian',
  };
  const baseTitle = pathTitles[pathId]?.[character] || fallback[character] || 'Companion';
  if (form?.id === 'ascendant') return `${baseTitle} Prime`;
  if ((bondRank?.label || '').toLowerCase().includes('mascot')) return `${baseTitle} Mascot`;
  if ((specialty?.key || '') === 'scene-showoff') return `${baseTitle} Deluxe`;
  return baseTitle;
}

function getUnlockedTricks(character, xp) {
  return (TRICKS[character] || []).filter(t => xp >= t.xp).map(t => t.id);
}

function getNextTrick(character, xp) {
  return (TRICKS[character] || []).find(t => xp < t.xp) || null;
}

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str || '[]'); } catch { return fallback || []; }
}

function queryPlayActivitySummary(db, userId) {
  const base = db.prepare(`
    SELECT
      COUNT(*) AS plays_all,
      MAX(level) AS max_level_all,
      SUM(CASE WHEN mode LIKE 'Double%' THEN 1 ELSE 0 END) AS doubles_all,
      SUM(CASE WHEN (replay_embed_url != '' OR replay_video_id != '') THEN 1 ELSE 0 END) AS replays_all
    FROM user_recently_played
    WHERE user_id = ?
  `).get(userId) || {};

  const recent7d = db.prepare(`
    SELECT
      COUNT(*) AS plays_7d,
      COUNT(DISTINCT song_title || '|' || mode || '|' || level) AS unique_7d,
      SUM(CASE WHEN mode LIKE 'Double%' THEN 1 ELSE 0 END) AS doubles_7d,
      SUM(CASE WHEN level >= 18 THEN 1 ELSE 0 END) AS hard_7d,
      SUM(CASE WHEN (replay_embed_url != '' OR replay_video_id != '') THEN 1 ELSE 0 END) AS replays_7d,
      SUM(CASE WHEN COALESCE(NULLIF(grade, ''), CASE WHEN score >= 995000 THEN 'SSS' WHEN score >= 980000 THEN 'SS' WHEN score >= 960000 THEN 'S' WHEN score >= 930000 THEN 'AAA' WHEN score >= 900000 THEN 'AA' WHEN score >= 850000 THEN 'A' WHEN score > 0 THEN 'B' ELSE 'F' END) IN ('AAA+', 'AAA', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+') THEN 1 ELSE 0 END) AS high_grades_7d
    FROM user_recently_played
    WHERE user_id = ?
      AND COALESCE(NULLIF(played_at_utc, ''), date_played) >= datetime('now', '-7 days')
  `).get(userId) || {};

  const today = db.prepare(`
    SELECT
      COUNT(*) AS plays_today,
      COUNT(DISTINCT song_title || '|' || mode || '|' || level) AS unique_today,
      SUM(CASE WHEN mode LIKE 'Double%' THEN 1 ELSE 0 END) AS doubles_today,
      SUM(CASE WHEN (replay_embed_url != '' OR replay_video_id != '') THEN 1 ELSE 0 END) AS replays_today,
      SUM(CASE WHEN COALESCE(NULLIF(grade, ''), CASE WHEN score >= 995000 THEN 'SSS' WHEN score >= 980000 THEN 'SS' WHEN score >= 960000 THEN 'S' WHEN score >= 930000 THEN 'AAA' WHEN score >= 900000 THEN 'AA' WHEN score >= 850000 THEN 'A' WHEN score > 0 THEN 'B' ELSE 'F' END) IN ('AAA+', 'AAA', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+') THEN 1 ELSE 0 END) AS high_grades_today
    FROM user_recently_played
    WHERE user_id = ?
      AND COALESCE(NULLIF(played_at_utc, ''), date_played) >= datetime('now', 'start of day')
  `).get(userId) || {};

  const newChartsToday = db.prepare(`
    SELECT COUNT(*) AS new_charts_today
    FROM (
      SELECT rp.song_title, rp.mode, rp.level
      FROM user_recently_played rp
      WHERE rp.user_id = ?
        AND COALESCE(NULLIF(rp.played_at_utc, ''), rp.date_played) >= datetime('now', 'start of day')
      GROUP BY rp.song_title, rp.mode, rp.level
      HAVING NOT EXISTS (
        SELECT 1
        FROM user_recently_played older
        WHERE older.user_id = rp.user_id
          AND older.song_title = rp.song_title
          AND older.mode = rp.mode
          AND older.level = rp.level
          AND COALESCE(NULLIF(older.played_at_utc, ''), older.date_played) < datetime('now', 'start of day')
      )
    )
  `).get(userId) || {};

  const hop = db.prepare(`
    SELECT COUNT(DISTINCT lsp.live_session_id) AS hop_sessions_7d
    FROM live_session_plays lsp
    JOIN live_sessions ls ON ls.id = lsp.live_session_id
    WHERE lsp.user_id = ?
      AND ls.session_type = 'hop'
      AND COALESCE(NULLIF(lsp.played_at_utc, ''), lsp.date_played, lsp.created_at) >= datetime('now', '-7 days')
  `).get(userId) || {};

  const weeklyChallenge = db.prepare(`
    SELECT COUNT(*) AS weekly_challenge_entries
    FROM weekly_challenge_results r
    JOIN weekly_challenge_charts wc ON wc.id = r.weekly_chart_id
    JOIN weekly_challenge_weeks ww ON ww.id = wc.week_id
    WHERE r.user_id = ?
      AND ww.status = 'active'
      AND datetime('now') >= ww.starts_at_utc
      AND datetime('now') <= ww.ends_at_utc
  `).get(userId) || {};

  return {
    plays_all: base.plays_all || 0,
    max_level_all: base.max_level_all || 0,
    doubles_all: base.doubles_all || 0,
    replays_all: base.replays_all || 0,
    plays_7d: recent7d.plays_7d || 0,
    unique_7d: recent7d.unique_7d || 0,
    doubles_7d: recent7d.doubles_7d || 0,
    hard_7d: recent7d.hard_7d || 0,
    replays_7d: recent7d.replays_7d || 0,
    high_grades_7d: recent7d.high_grades_7d || 0,
    plays_today: today.plays_today || 0,
    unique_today: today.unique_today || 0,
    new_charts_today: newChartsToday.new_charts_today || 0,
    doubles_today: today.doubles_today || 0,
    replays_today: today.replays_today || 0,
    high_grades_today: today.high_grades_today || 0,
    hop_sessions_7d: hop.hop_sessions_7d || 0,
    weekly_challenge_entries: weeklyChallenge.weekly_challenge_entries || 0,
  };
}

function derivePetSpecialty(summary = {}) {
  if ((summary.doubles_7d || 0) >= 5 && (summary.doubles_7d || 0) >= ((summary.plays_7d || 0) * 0.4)) {
    return { key: 'double-grinder', label: 'Double grinder', desc: 'Your pet is leaning into doubles stamina and footwork.' };
  }
  if ((summary.high_grades_7d || 0) >= 6) {
    return { key: 'accuracy-fiend', label: 'Accuracy fiend', desc: 'Clean timing and tidy clears are shaping this pet.' };
  }
  if ((summary.hard_7d || 0) >= 5) {
    return { key: 'stamina-hound', label: 'Stamina hound', desc: 'Big clears are making your pet tougher and prouder.' };
  }
  if ((summary.replays_7d || 0) >= 2) {
    return { key: 'scene-showoff', label: 'Scene showoff', desc: "Replay-ready moments are feeding this pet's confidence." };
  }
  if ((summary.hop_sessions_7d || 0) >= 1) {
    return { key: 'hop-regular', label: 'HoP regular', desc: 'Hour of Power energy is making this pet thrive.' };
  }
  return { key: 'all-rounder', label: 'All-rounder', desc: 'A balanced companion still figuring out its calling.' };
}

function buildPetMemories(pet, summary = {}) {
  const memories = [];

  // ── Firsts ──
  if (pet.created_at) {
    memories.push({ id: 'adopted', title: 'Bond began', detail: `Adopted on ${String(pet.created_at).slice(0, 10)}`, tone: 'bond', category: 'firsts', rarity: 'common' });
  }
  if ((pet.total_songs_fed || 0) >= 1) {
    memories.push({ id: 'first-song', title: 'First song synced', detail: 'The very first score your pet witnessed.', tone: 'bond', category: 'firsts', rarity: 'common' });
  }
  if ((pet.bond || 0) >= 40) {
    memories.push({ id: 'first-bond-rank', title: 'Trust earned', detail: 'Reached Pad Gremlin bond rank for the first time.', tone: 'bond', category: 'firsts', rarity: 'uncommon' });
  }
  if ((pet.mastery_xp || 0) >= 45) {
    memories.push({ id: 'first-mastery', title: 'Path awakened', detail: 'Reached Apprentice mastery rank.', tone: 'mastery', category: 'firsts', rarity: 'uncommon' });
  }

  // ── Bests ──
  if ((summary.max_level_all || 0) > 0) {
    const lvl = summary.max_level_all;
    memories.push({ id: 'max-level', title: 'Biggest clear watched', detail: `Level ${lvl} is the highest chart your pet has seen you conquer.`, tone: 'level', category: 'bests', rarity: lvl >= 22 ? 'rare' : lvl >= 18 ? 'uncommon' : 'common' });
  }
  if ((summary.best_grade_all || '') !== '') {
    memories.push({ id: 'best-grade', title: 'Peak precision', detail: `Best grade achieved: ${summary.best_grade_all}.`, tone: 'grade', category: 'bests', rarity: ['SSS+', 'SSS', 'SS+', 'SS'].includes(summary.best_grade_all) ? 'rare' : 'common' });
  }
  if ((pet.longest_streak || 0) >= 7) {
    memories.push({ id: 'best-streak', title: 'Streak legend', detail: `Longest daily streak: ${pet.longest_streak} days of care.`, tone: 'streak', category: 'bests', rarity: pet.longest_streak >= 30 ? 'legendary' : pet.longest_streak >= 14 ? 'rare' : 'uncommon' });
  }
  if ((pet.lifetime_feeds || 0) >= 50) {
    memories.push({ id: 'dedicated-feeder', title: 'Well-fed companion', detail: `${pet.lifetime_feeds} meals served with care.`, tone: 'feed', category: 'bests', rarity: pet.lifetime_feeds >= 200 ? 'rare' : 'uncommon' });
  }

  // ── Social ──
  if ((summary.replays_all || 0) > 0) {
    memories.push({ id: 'replays', title: 'Replay memory', detail: `${summary.replays_all} replay-ready ${summary.replays_all === 1 ? 'moment' : 'moments'} recorded together.`, tone: 'replay', category: 'social', rarity: summary.replays_all >= 20 ? 'rare' : 'common' });
  }
  if ((summary.weekly_challenge_entries || 0) > 0) {
    memories.push({ id: 'weekly', title: 'Weekly challenger', detail: 'Active in this week\'s weekly challenge board.', tone: 'challenge', category: 'social', rarity: 'common' });
  }

  // ── Endurance ──
  if ((summary.hop_sessions_7d || 0) > 0) {
    memories.push({ id: 'hop', title: 'Hour of Power spark', detail: `Shared ${summary.hop_sessions_7d} HoP ${summary.hop_sessions_7d === 1 ? 'session' : 'sessions'} in the last week.`, tone: 'hop', category: 'endurance', rarity: summary.hop_sessions_7d >= 3 ? 'rare' : 'common' });
  }
  if ((summary.hard_7d || 0) >= 3) {
    memories.push({ id: 'hard-grind', title: 'Heavy lifter', detail: `${summary.hard_7d} level 18+ clears this week.`, tone: 'stamina', category: 'endurance', rarity: summary.hard_7d >= 10 ? 'rare' : 'uncommon' });
  }
  if ((pet.lifetime_activities || 0) >= 30) {
    memories.push({ id: 'active-companion', title: 'Active companion', detail: `${pet.lifetime_activities} activities completed together.`, tone: 'activity', category: 'endurance', rarity: pet.lifetime_activities >= 100 ? 'rare' : 'uncommon' });
  }

  // ── Identity ──
  const specialty = derivePetSpecialty(summary);
  memories.push({ id: 'specialty', title: specialty.label, detail: specialty.desc, tone: 'specialty', category: 'identity', rarity: 'common' });

  if ((pet.bond || 0) >= 160) {
    memories.push({ id: 'deep-bond', title: 'Unbreakable bond', detail: 'A connection forged through hundreds of interactions.', tone: 'bond', category: 'identity', rarity: 'rare' });
  }
  if ((pet.mastery_xp || 0) >= 240) {
    memories.push({ id: 'elite-mastery', title: 'Elite practitioner', detail: 'Mastery that few companions ever reach.', tone: 'mastery', category: 'identity', rarity: 'rare' });
  }

  return memories;
}

const PET_MISSIONS = {
  feed_today: {
    cadence: 'daily',
    label: 'Care routine',
    desc: 'Feed your pet at least once today.',
    target: 1,
    progress: ({ fed_today }) => fed_today ? 1 : 0,
    reward: { bond: 6, bond_tokens: 1, happiness: 4 },
  },
  interact_three: {
    cadence: 'daily',
    label: 'Quality time',
    desc: 'Interact with your pet three times today.',
    target: 3,
    progress: ({ interactions_today }) => interactions_today || 0,
    reward: { bond: 8, trust: 4, bond_tokens: 1 },
  },
  aaa_pair: {
    cadence: 'daily',
    label: 'Clean timing',
    desc: 'Hit two AAA-or-better plays today.',
    target: 2,
    progress: ({ high_grades_today }) => high_grades_today || 0,
    reward: { bond: 10, combo_balance: 16, hype: 8 },
  },
  replay_today: {
    cadence: 'daily',
    label: 'Capture the moment',
    desc: 'Record one replay-enabled score today.',
    target: 1,
    progress: ({ replays_today }) => replays_today || 0,
    reward: { bond: 8, combo_balance: 14, hype: 10 },
  },
  new_chart_today: {
    cadence: 'daily',
    label: 'Fresh chart',
    desc: 'Play a new chart today.',
    target: 1,
    progress: ({ new_charts_today }) => new_charts_today || 0,
    reward: { bond: 7, trust: 2, hype: 5 },
  },
  double_today: {
    cadence: 'daily',
    label: 'Double trouble',
    desc: 'Play one doubles chart today.',
    target: 1,
    progress: ({ doubles_today }) => doubles_today || 0,
    reward: { bond: 7, hype: 7, combo_balance: 12 },
  },
  hard_clear_week: {
    cadence: 'weekly',
    label: 'Heavy set',
    desc: 'Clear three level 18+ charts this week.',
    target: 3,
    progress: ({ hard_7d }) => hard_7d || 0,
    reward: { bond: 14, trust: 8, combo_balance: 24, bond_tokens: 2 },
  },
  double_week: {
    cadence: 'weekly',
    label: 'Doubles grind',
    desc: 'Play five doubles charts this week.',
    target: 5,
    progress: ({ doubles_7d }) => doubles_7d || 0,
    reward: { bond: 14, hype: 10, combo_balance: 24, bond_tokens: 2 },
  },
  replay_week: {
    cadence: 'weekly',
    label: 'Scene presence',
    desc: 'Land three replay-enabled plays this week.',
    target: 3,
    progress: ({ replays_7d }) => replays_7d || 0,
    reward: { bond: 16, hype: 12, combo_balance: 28, bond_tokens: 2 },
  },
  hop_run: {
    cadence: 'weekly',
    label: 'Hour of Power',
    desc: 'Join one Hour of Power session this week.',
    target: 1,
    progress: ({ hop_sessions_7d }) => hop_sessions_7d || 0,
    reward: { bond: 16, trust: 6, combo_balance: 24, rare_shards: 1 },
  },
  weekly_challenge_entry: {
    cadence: 'weekly',
    label: 'Weekly challenger',
    desc: 'Log at least one current weekly challenge result.',
    target: 1,
    progress: ({ weekly_challenge_entries }) => weekly_challenge_entries || 0,
    reward: { bond: 12, trust: 5, combo_balance: 20, bond_tokens: 2 },
  },
};

const PET_MISSIONS_BY_CHARACTER = {
  dojocat: ['feed_today', 'aaa_pair', 'hard_clear_week', 'weekly_challenge_entry'],
  buu: ['feed_today', 'replay_today', 'replay_week', 'hop_run'],
  devit: ['interact_three', 'double_today', 'double_week', 'hard_clear_week'],
  pixiu: ['feed_today', 'new_chart_today', 'hop_run', 'weekly_challenge_entry'],
};

function buildPetMissions(pet, summary = {}) {
  const claimed = new Set(safeJsonParse(pet.claimed_missions));
  const missionIds = PET_MISSIONS_BY_CHARACTER[pet.character] || PET_MISSIONS_BY_CHARACTER.dojocat;
  return missionIds.map((id) => {
    const mission = PET_MISSIONS[id];
    const windowKey = mission.cadence === 'daily' ? getUtcDayKey() : getUtcWeekKey();
    const claimKey = `${id}:${windowKey}`;
    const progress = mission.progress(summary, pet);
    const complete = progress >= mission.target;
    return {
      id,
      cadence: mission.cadence,
      label: mission.label,
      desc: mission.desc,
      target: mission.target,
      progress: Math.min(mission.target, progress),
      complete,
      claimed: claimed.has(claimKey),
      claim_key: claimKey,
      reward: mission.reward,
      reward_summary: Object.entries(mission.reward)
        .map(([key, value]) => `${value} ${formatPetStatLabel(key)}`)
        .join(' • '),
    };
  });
}

function formatPetRequestRewardSummary(reward = {}) {
  return Object.entries(reward)
    .filter(([, value]) => Number(value) > 0)
    .map(([key, value]) => `${value} ${formatPetStatLabel(key)}`)
    .join(' • ');
}

function buildPetRequestTemplate(type, payload = {}) {
  if (type === 'meal') {
    const target = Math.max(55, Math.min(MAX_STAT, parseInt(payload.target_hunger, 10) || 60));
    const reward = { bond: 6, trust: 2, combo_balance: 6 };
    return {
      type,
      label: 'Meal request',
      desc: `Get hunger back to ${target}% or higher.`,
      cta_label: 'Open Food',
      cta_target: 'food',
      target_hunger: target,
      reward,
      reward_summary: formatPetRequestRewardSummary(reward),
    };
  }
  if (type === 'recovery') {
    const target = Math.max(50, Math.min(MAX_STAT, parseInt(payload.target_energy, 10) || 55));
    const reward = { bond: 5, trust: 3, bond_tokens: 1 };
    return {
      type,
      label: 'Recovery request',
      desc: `Restore energy to ${target}% or higher.`,
      cta_label: 'Rest Up',
      cta_target: 'pet',
      target_energy: target,
      reward,
      reward_summary: formatPetRequestRewardSummary(reward),
    };
  }
  if (type === 'bonding') {
    const target = Math.max(2, parseInt(payload.target_interactions, 10) || 3);
    const reward = { bond: 7, trust: 4, combo_balance: 8 };
    return {
      type,
      label: 'Bonding request',
      desc: `Spend quality time with ${target} interaction${target === 1 ? '' : 's'} today.`,
      cta_label: 'Interact',
      cta_target: 'pet',
      target_interactions: target,
      reward,
      reward_summary: formatPetRequestRewardSummary(reward),
    };
  }
  if (type === 'pump-session') {
    const targetPlays = Math.max(1, parseInt(payload.target_plays_today, 10) || 2);
    const targetMomentum = Math.max(35, parseInt(payload.target_momentum, 10) || 40);
    const reward = { bond: 6, hype: 10, combo_balance: 10 };
    return {
      type,
      label: 'Momentum request',
      desc: `Sync ${targetPlays} Pump ${targetPlays === 1 ? 'play' : 'plays'} today or rebuild momentum to ${targetMomentum}%.`,
      cta_label: 'Play Pump',
      cta_target: 'pump',
      target_plays_today: targetPlays,
      target_momentum: targetMomentum,
      reward,
      reward_summary: formatPetRequestRewardSummary(reward),
    };
  }
  return null;
}

function pickPetRequestTemplate(pet, vitals, summary = {}) {
  if ((vitals?.hunger || 0) < 45) {
    return buildPetRequestTemplate('meal', { target_hunger: 60 });
  }
  if ((vitals?.energy || 0) < 40) {
    return buildPetRequestTemplate('recovery', { target_energy: 55 });
  }
  if ((vitals?.trust || 0) < 45) {
    const interactionsToday = pet.daily_interaction_key === getUtcDayKey() ? (pet.daily_interaction_count || 0) : 0;
    return buildPetRequestTemplate('bonding', { target_interactions: Math.max(3, interactionsToday + 2) });
  }
  if ((vitals?.momentum || 0) < 30 || !(summary?.plays_today > 0)) {
    return buildPetRequestTemplate('pump-session', {
      target_plays_today: Math.max(2, (summary?.plays_today || 0) + 1),
      target_momentum: 42,
    });
  }
  return null;
}

function getCurrentPetRequest(pet, vitals, summary = {}) {
  const requestType = String(pet?.active_request_type || '').trim();
  const status = String(pet?.active_request_status || '').trim();
  if (!requestType || !status) return null;
  const payload = safeJsonParse(pet?.active_request_payload || '{}', {});
  const template = buildPetRequestTemplate(requestType, payload);
  if (!template) return null;

  const interactionsToday = pet?.daily_interaction_key === getUtcDayKey() ? (pet?.daily_interaction_count || 0) : 0;
  let progress = 0;
  let target = 1;

  if (template.type === 'meal') {
    progress = vitals?.hunger || 0;
    target = template.target_hunger || 60;
  } else if (template.type === 'recovery') {
    progress = vitals?.energy || 0;
    target = template.target_energy || 55;
  } else if (template.type === 'bonding') {
    progress = interactionsToday;
    target = template.target_interactions || 3;
  } else if (template.type === 'pump-session') {
    progress = Math.max(summary?.plays_today || 0, Math.round((vitals?.momentum || 0) / 10));
    target = Math.max(template.target_plays_today || 2, Math.round((template.target_momentum || 40) / 10));
  }

  return {
    ...template,
    status,
    progress: Math.min(target, progress),
    progress_raw: progress,
    target,
    complete: status === 'completed',
    created_at: pet.active_request_created_at || '',
    expires_at: pet.active_request_expires_at || '',
    completed_at: pet.active_request_completed_at || '',
  };
}

function isPetRequestSatisfied(request, vitals, pet, summary = {}) {
  if (!request) return false;
  if (request.type === 'meal') return (vitals?.hunger || 0) >= (request.target_hunger || 60);
  if (request.type === 'recovery') return (vitals?.energy || 0) >= (request.target_energy || 55);
  if (request.type === 'bonding') {
    const interactionsToday = pet?.daily_interaction_key === getUtcDayKey() ? (pet?.daily_interaction_count || 0) : 0;
    return interactionsToday >= (request.target_interactions || 3);
  }
  if (request.type === 'pump-session') {
    return (summary?.plays_today || 0) >= (request.target_plays_today || 2)
      || (vitals?.momentum || 0) >= (request.target_momentum || 40);
  }
  return false;
}

function syncPetRequestState(db, pet, summary = null) {
  if (!pet?.user_id) return pet;
  const activitySummary = summary || queryPlayActivitySummary(db, pet.user_id);
  let workingPet = pet;
  let vitals = buildPetVitalsSnapshot(workingPet);
  let changed = false;

  const activeStatus = String(workingPet.active_request_status || '').trim();
  const activeType = String(workingPet.active_request_type || '').trim();
  const expiresAt = String(workingPet.active_request_expires_at || '').trim();

  if (activeType && activeStatus === 'active' && expiresAt && getHoursSince(expiresAt) > 0) {
    const nextTrust = clamp((workingPet.trust || 35) - 4, 0, MAX_STAT);
    const nextHype = clamp((workingPet.hype || 25) - 6, 0, MAX_STAT);
    db.prepare(`
      UPDATE user_pets
      SET trust = ?,
          hype = ?,
          neglect_strikes = neglect_strikes + 1,
          active_request_status = 'expired',
          updated_at = datetime('now')
      WHERE user_id = ?
    `).run(nextTrust, nextHype, workingPet.user_id);
    workingPet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(workingPet.user_id);
    vitals = buildPetVitalsSnapshot(workingPet);
    changed = true;
  }

  const currentRequest = getCurrentPetRequest(workingPet, vitals, activitySummary);
  if (currentRequest && currentRequest.status === 'active' && isPetRequestSatisfied(currentRequest, vitals, workingPet, activitySummary)) {
    db.prepare(`
      UPDATE user_pets
      SET active_request_status = 'completed',
          active_request_completed_at = datetime('now'),
          updated_at = datetime('now')
      WHERE user_id = ?
    `).run(workingPet.user_id);
    workingPet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(workingPet.user_id);
    vitals = buildPetVitalsSnapshot(workingPet);
    changed = true;
  }

  const resolvedStatus = String(workingPet.active_request_status || '').trim();
  const hasBlockingRequest = !!String(workingPet.active_request_type || '').trim()
    && (resolvedStatus === 'active' || resolvedStatus === 'completed');
  const hoursSinceRefresh = getHoursSince(workingPet.last_request_refresh_at || '');
  const canRefresh = !hasBlockingRequest
    && (!workingPet.last_request_refresh_at || hoursSinceRefresh >= REQUEST_REFRESH_COOLDOWN_HOURS);

  if (canRefresh) {
    const nextRequest = pickPetRequestTemplate(workingPet, vitals, activitySummary);
    if (nextRequest) {
      const expires = new Date(Date.now() + (REQUEST_LIFETIME_HOURS * 60 * 60 * 1000));
      db.prepare(`
        UPDATE user_pets
        SET active_request_type = ?,
            active_request_payload = ?,
            active_request_status = 'active',
            active_request_created_at = datetime('now'),
            active_request_expires_at = ?,
            active_request_completed_at = '',
            last_request_refresh_at = datetime('now'),
            updated_at = datetime('now')
        WHERE user_id = ?
      `).run(
        nextRequest.type,
        JSON.stringify(nextRequest),
        toSqliteDateTime(expires),
        workingPet.user_id
      );
      workingPet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(workingPet.user_id);
      changed = true;
    } else if (!workingPet.last_request_refresh_at) {
      db.prepare(`UPDATE user_pets SET last_request_refresh_at = datetime('now') WHERE user_id = ?`).run(workingPet.user_id);
      workingPet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(workingPet.user_id);
      changed = true;
    }
  }

  if (changed) {
    return db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(workingPet.user_id);
  }
  return workingPet;
}

function loadPetWithRequestState(db, userId, summary = null) {
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(userId);
  if (!pet) return null;
  return syncPetRequestState(db, pet, summary);
}

function clearPetRequestFields(db, userId) {
  db.prepare(`
    UPDATE user_pets
    SET active_request_type = '',
        active_request_payload = '{}',
        active_request_status = '',
        active_request_created_at = '',
        active_request_expires_at = '',
        active_request_completed_at = '',
        last_request_refresh_at = datetime('now'),
        updated_at = datetime('now')
    WHERE user_id = ?
  `).run(userId);
}

// ─── Format pet for API response ──────────────────────────────────
function formatPet(pet, isPublic = false, db = null) {
  const vitals = buildPetVitalsSnapshot(pet);
  const hunger = vitals.hunger;
  const happiness = vitals.happiness;
  const energy = vitals.energy;
  const momentum = vitals.momentum;
  const hype = momentum;
  const xp = pet.experience || 0;
  const levelInfo = getLevelFromXp(xp);
  const character = pet.character || 'dojocat';
  const charTricks = TRICKS[character] || [];
  const nextTrick = getNextTrick(character, xp);
  const profile = getCharacterProfile(character);
  const bond = pet.bond || 0;
  const trust = vitals.trust;
  const bondRank = getBondRank(bond);
  const interactionsToday = pet.daily_interaction_key === getUtcDayKey() ? (pet.daily_interaction_count || 0) : 0;
  const activitySummary = db ? queryPlayActivitySummary(db, pet.user_id) : {};
  const specialty = derivePetSpecialty(activitySummary);
  const mastery = buildMasteryProfile(pet, specialty.key);
  const form = getPetForm(bond, mastery.mastery_xp || 0);
  const identityTitle = getPetIdentityTitle(character, mastery, specialty, bondRank, form);
  const missions = buildPetMissions({ ...pet, character }, {
    ...activitySummary,
    fed_today: !!pet.last_food_at && String(pet.last_food_at).startsWith(getUtcDayKey()),
    interactions_today: interactionsToday,
  });
  const memories = buildPetMemories(pet, activitySummary);
  const needs = buildPetNeeds(vitals, pet, activitySummary);
  const currentRequest = getCurrentPetRequest(pet, vitals, activitySummary);
  const recommendedActions = getRecommendedActions(vitals, pet, activitySummary);

  let pendingTrick = pet.pending_trick || '';
  let trickDemandLevel = pet.trick_demand_level || 0;
  let trickDemandGrade = pet.trick_demand_grade || '';
  if (pendingTrick && pet.trick_demand_expires) {
    if (Date.now() > new Date(pet.trick_demand_expires + 'Z').getTime()) {
      pendingTrick = '';
      trickDemandLevel = 0;
      trickDemandGrade = '';
    }
  }

  const base = {
    character,
    hunger,
    happiness,
    weight_state: getWeightState(hunger),
    mood: vitals.mood,
    mood_state: vitals.mood_state,
    bond,
    bond_rank: bondRank,
    energy,
    trust,
    momentum,
    hype,
    needs,
    recommended_actions: recommendedActions,
    reward_multiplier: vitals.reward_multiplier,
    current_request: currentRequest,
    wellbeing: {
      hunger,
      energy,
      trust,
      momentum,
      mood_state: vitals.mood_state,
      reward_multiplier: vitals.reward_multiplier,
    },
    progression: {
      bond,
      combo_balance: pet.combo_balance || 0,
      bond_tokens: pet.bond_tokens || 0,
      rare_shards: pet.rare_shards || 0,
      experience: xp,
      level: levelInfo.level,
    },
    total_songs_fed: pet.total_songs_fed,
    experience: xp,
    level: levelInfo.level,
    level_progress: levelInfo.progress,
    current_level_xp: levelInfo.currentLevelXp,
    next_level_xp: levelInfo.nextLevelXp,
    nickname: pet.nickname || '',
    highest_level: pet.highest_level || 0,
    equipped_hat: pet.equipped_hat || '',
    equipped_belt: pet.equipped_belt || '',
    equipped_shoes: pet.equipped_shoes || '',
    equipped_top: pet.equipped_top || '',
    hat_color: pet.hat_color || '',
    belt_color: pet.belt_color || '',
    shoes_color: pet.shoes_color || '',
    top_color: pet.top_color || '',
    is_pet_avatar: pet.is_pet_avatar || 0,
    last_trick_performed: pet.last_trick_performed || '',
    last_trick_at: pet.last_trick_at || '',
    created_at: pet.created_at || '',
    specialty,
    mastery,
    form,
    identity_title: identityTitle,
    personality: {
      title: profile.title,
      desc: profile.personality,
    },
    food_preferences: {
      favorites: profile.favorite_foods,
      dislikes: profile.disliked_foods,
      last_food_id: pet.last_food_id || '',
      last_food_at: pet.last_food_at || '',
    },
    last_toy_id: pet.last_toy_id || '',
    last_toy_at: pet.last_toy_at || '',
    neglect_strikes: pet.neglect_strikes || 0,
    habitat: {
      active_background: pet.active_habitat_bg || 'dojo-night',
      active_prop: pet.active_habitat_prop || '',
      active_floor: pet.active_habitat_floor || '',
      active_wall: pet.active_habitat_wall || '',
    },
  };

  if (isPublic) {
    return {
      ...base,
      daily_streak: pet.daily_streak || 0,
      longest_streak: pet.longest_streak || 0,
      interactions_today: interactionsToday,
      memories: memories.filter(m => m.rarity !== 'common').slice(0, 4),
    };
  }

  return {
    ...base,
    combo_balance: pet.combo_balance || 0,
    bond_tokens: pet.bond_tokens || 0,
    rare_shards: pet.rare_shards || 0,
    owned_items: safeJsonParse(pet.owned_items),
    owned_toys: safeJsonParse(pet.owned_toys),
    owned_habitat_items: safeJsonParse(pet.owned_habitat_items),
    tricks_unlocked: getUnlockedTricks(character, xp),
    tricks: charTricks.map(t => ({
      ...t,
      unlocked: xp >= t.xp,
      progress: Math.min(1, xp / Math.max(t.xp, 1)),
    })),
    next_trick: nextTrick ? {
      ...nextTrick,
      xp_remaining: nextTrick.xp - xp,
      progress: xp / nextTrick.xp,
    } : null,
    pending_trick: pendingTrick,
    trick_demand_level: trickDemandLevel,
    trick_demand_grade: trickDemandGrade,
    last_fed_at: pet.last_fed_at || '',
    interactions_today: interactionsToday,
    interaction_count: pet.interaction_count || 0,
    taps_today: pet.daily_tap_key === getUtcDayKey() ? (pet.daily_tap_count || 0) : 0,
    tap_limit: TAP_FULL_REWARD_LIMIT,
    rest_cooldown: pet.last_rest_at
      ? Math.max(0, REST_COOLDOWN_MS - (Date.now() - new Date(pet.last_rest_at + 'Z').getTime()))
      : 0,
    daily_streak: pet.daily_streak || 0,
    longest_streak: pet.longest_streak || 0,
    lifetime_feeds: pet.lifetime_feeds || pet.total_songs_fed || 0,
    lifetime_activities: pet.lifetime_activities || 0,
    time_greeting: (TIME_GREETINGS[character] || TIME_GREETINGS.dojocat)[getTimeGreeting()],
    milestones: detectMilestones(pet),
    activity_summary: activitySummary,
    activities: Object.values(PET_ACTIVITIES).map(a => ({
      ...a,
      locked: !!(a.minTrust && trust < a.minTrust)
        || !!(a.minEnergy && energy < a.minEnergy)
        || (a.id !== 'rest' && hunger < CRITICAL_HUNGER_THRESHOLD)
        || ((a.id === 'spar' || a.id === 'explore') && energy < Math.max(a.minEnergy || 0, LOW_ENERGY_THRESHOLD))
        || ((a.id === 'spar' || a.id === 'explore') && momentum < LOW_MOMENTUM_THRESHOLD)
        || (a.id === 'rest' && pet.last_rest_at && (Date.now() - new Date(pet.last_rest_at + 'Z').getTime()) < REST_COOLDOWN_MS),
      lock_reason: a.id !== 'rest' && hunger < CRITICAL_HUNGER_THRESHOLD
        ? 'Feed first - hunger is too low'
        : a.minTrust && trust < a.minTrust
          ? `Trust ${a.minTrust}+ needed`
          : a.minEnergy && energy < a.minEnergy
            ? `Energy ${a.minEnergy}+ needed`
            : ((a.id === 'spar' || a.id === 'explore') && momentum < LOW_MOMENTUM_THRESHOLD)
              ? `Momentum ${LOW_MOMENTUM_THRESHOLD}+ needed`
              : (a.id === 'rest' && pet.last_rest_at && (Date.now() - new Date(pet.last_rest_at + 'Z').getTime()) < REST_COOLDOWN_MS)
                ? `Cooldown: ${Math.ceil((REST_COOLDOWN_MS - (Date.now() - new Date(pet.last_rest_at + 'Z').getTime())) / 1000)}s`
                : '',
      // Cost/gain breakdown for the UI
      costs: (() => {
        const c = [];
        if (a.energy < 0) c.push({ stat: 'energy', value: a.energy });
        const hDrain = a.id === 'rest' ? REST_HUNGER_COST : (a.energy < 0 ? Math.round(Math.abs(a.energy) * ENERGY_TO_HUNGER_RATIO) : 0);
        if (hDrain > 0) c.push({ stat: 'hunger', value: -hDrain });
        if (a.hype < 0) c.push({ stat: 'momentum', value: a.hype });
        return c;
      })(),
      gains: (() => {
        const g = [];
        if (a.energy > 0) g.push({ stat: 'energy', value: a.energy });
        if (a.happiness > 0) g.push({ stat: 'happiness', value: a.happiness });
        if (a.trust > 0) g.push({ stat: 'trust', value: a.trust });
        if (a.bond > 0) g.push({ stat: 'bond', value: scaleBondGain(a.bond, bond) });
        if (a.hype > 0) g.push({ stat: 'momentum', value: a.hype });
        if (a.combo > 0) g.push({ stat: 'combo', value: a.combo });
        if (a.bond_tokens > 0) g.push({ stat: 'tokens', value: a.bond_tokens });
        if (a.rare_shards > 0) g.push({ stat: 'shards', value: a.rare_shards });
        return g;
      })(),
    })),
    toys: PET_TOYS.map((toy) => ({
      ...toy,
      owned: safeJsonParse(pet.owned_toys).includes(toy.id),
      preference: getToyPreference(character, toy),
    })),
    habitat_items: {
      backgrounds: HABITAT_ITEMS.backgrounds.map((item) => ({
        ...item,
        owned: safeJsonParse(pet.owned_habitat_items).includes(item.id) || !!item.default_owned,
        active: (pet.active_habitat_bg || 'dojo-night') === item.id,
        locked: !!(item.minBond && bond < item.minBond) || !!(item.minMastery && (pet.mastery_xp || 0) < item.minMastery),
        lock_reason: item.minBond && bond < item.minBond ? `Bond ${item.minBond}+` : item.minMastery && (pet.mastery_xp || 0) < item.minMastery ? `Mastery ${item.minMastery}+` : '',
      })),
      props: HABITAT_ITEMS.props.map((item) => ({
        ...item,
        owned: safeJsonParse(pet.owned_habitat_items).includes(item.id),
        active: (pet.active_habitat_prop || '') === item.id,
        locked: !!(item.minBond && bond < item.minBond) || !!(item.minMastery && (pet.mastery_xp || 0) < item.minMastery),
        lock_reason: item.minBond && bond < item.minBond ? `Bond ${item.minBond}+` : item.minMastery && (pet.mastery_xp || 0) < item.minMastery ? `Mastery ${item.minMastery}+` : '',
      })),
      floor: (HABITAT_ITEMS.floor || []).map((item) => ({
        ...item,
        owned: safeJsonParse(pet.owned_habitat_items).includes(item.id),
        active: (pet.active_habitat_floor || '') === item.id,
        locked: !!(item.minBond && bond < item.minBond) || !!(item.minMastery && (pet.mastery_xp || 0) < item.minMastery),
        lock_reason: item.minBond && bond < item.minBond ? `Bond ${item.minBond}+` : item.minMastery && (pet.mastery_xp || 0) < item.minMastery ? `Mastery ${item.minMastery}+` : '',
      })),
      wall: (HABITAT_ITEMS.wall || []).map((item) => ({
        ...item,
        owned: safeJsonParse(pet.owned_habitat_items).includes(item.id),
        active: (pet.active_habitat_wall || '') === item.id,
        locked: !!(item.minBond && bond < item.minBond) || !!(item.minMastery && (pet.mastery_xp || 0) < item.minMastery),
        lock_reason: item.minBond && bond < item.minBond ? `Bond ${item.minBond}+` : item.minMastery && (pet.mastery_xp || 0) < item.minMastery ? `Mastery ${item.minMastery}+` : '',
      })),
    },
    companion_coach: buildCompanionCoach(pet, activitySummary),
    missions,
    memories,
  };
}

// ─── Routes ───────────────────────────────────────────────────────

// GET /api/pets/me
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = loadPetWithRequestState(db, req.user.id);
  if (!pet) return res.json({ pet: null, economy: PET_ECONOMY });
  res.json({ pet: formatPet(pet, false, db), economy: PET_ECONOMY });
});

// GET /api/pets/user/:userId — public pet view (for avatar modals)
router.get('/user/:userId', (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.params.userId);
  if (!pet) return res.json({ pet: null });
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.params.userId);
  res.json({ pet: formatPet(pet, true, db), username: user?.username || '' });
});

// POST /api/pets/adopt
router.post('/adopt', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const { character } = req.body;
  if (!character || !VALID_CHARACTERS.includes(character)) {
    return res.status(400).json({ error: `Invalid character. Choose from: ${VALID_CHARACTERS.join(', ')}` });
  }
  const existing = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (existing) {
    db.prepare(`
      UPDATE user_pets SET character = ?, fullness = 50, happiness = 50, total_songs_fed = 0, experience = 0,
      bond = 0, energy = 65, trust = 35, hype = 25, bond_tokens = 0, rare_shards = 0,
      interaction_count = 0, daily_interaction_count = 0, daily_interaction_key = '',
      claimed_missions = '[]', last_food_id = '', last_food_at = '', owned_toys = '[]', last_toy_id = '', last_toy_at = '',
      active_training_path = 'consistency', mastery_xp = 0,
      tricks_unlocked = '[]', pending_trick = '', trick_demand_level = 0, trick_demand_grade = '',
      trick_demand_expires = '', last_trick_performed = '', last_trick_at = '',
      equipped_hat = '', equipped_belt = '', equipped_shoes = '', equipped_top = '',
      hat_color = '', belt_color = '', shoes_color = '', top_color = '',
      last_meaningful_care_at = datetime('now'), last_pump_play_at = '', last_request_refresh_at = '',
      active_request_type = '', active_request_payload = '{}', active_request_status = '',
      active_request_created_at = '', active_request_expires_at = '', active_request_completed_at = '',
      neglect_strikes = 0,
      last_fed_at = datetime('now'), updated_at = datetime('now')
      WHERE user_id = ?
    `).run(character, req.user.id);
  } else {
    db.prepare(`
      INSERT INTO user_pets (
        user_id, character, fullness, happiness, total_songs_fed, experience,
        bond, energy, trust, hype, bond_tokens, rare_shards,
        daily_interaction_count, daily_interaction_key, claimed_missions, last_food_id, last_food_at, owned_toys, last_toy_id, last_toy_at,
        active_training_path, mastery_xp,
        last_fed_at, last_meaningful_care_at
      )
      VALUES (?, ?, 50, 50, 0, 0, 0, 65, 35, 25, 0, 0, 0, '', '[]', '', '', '[]', '', '', 'consistency', 0, datetime('now'), datetime('now'))
    `).run(req.user.id, character);
  }
  const pet = loadPetWithRequestState(db, req.user.id);
  res.json({ pet: formatPet(pet, false, db) });
});

// ── Rename pet ─────────────────────────────────────────────
router.post('/rename', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet found' });

  let { nickname } = req.body;
  if (typeof nickname !== 'string') return res.status(400).json({ error: 'Nickname must be a string' });
  nickname = nickname.trim().substring(0, 20); // Max 20 chars

  db.prepare('UPDATE user_pets SET nickname = ?, updated_at = datetime(\'now\') WHERE user_id = ?').run(nickname, req.user.id);
  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(updated, false, db) });
});

// GET /api/pets/shop — food + clothing catalog
router.get('/shop', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT combo_balance, owned_items, owned_toys, owned_habitat_items, active_habitat_bg, active_habitat_prop, active_habitat_floor, active_habitat_wall, character, bond, mastery_xp FROM user_pets WHERE user_id = ?').get(req.user.id);
  const owned = safeJsonParse(pet?.owned_items);
  const ownedToys = safeJsonParse(pet?.owned_toys);
  const ownedHabitat = safeJsonParse(pet?.owned_habitat_items, ['dojo-night']);
  res.json({
    combo_balance: pet?.combo_balance || 0,
    economy: PET_ECONOMY,
    foods: PET_FOODS.map((food) => ({
      ...food,
      preference: pet?.character ? getFoodPreference(pet.character, food.id) : 'neutral',
    })),
    clothing: {
      hats: CLOTHING.hats.map(c => ({ ...c, owned: owned.includes(c.id) })),
      tops: (CLOTHING.tops || []).map(c => ({ ...c, owned: owned.includes(c.id) })),
      belts: CLOTHING.belts.map(c => ({ ...c, owned: owned.includes(c.id) })),
      shoes: CLOTHING.shoes.map(c => ({ ...c, owned: owned.includes(c.id) })),
    },
    toys: PET_TOYS.map((toy) => ({
      ...toy,
      owned: ownedToys.includes(toy.id),
      preference: pet?.character ? getToyPreference(pet.character, toy) : 'neutral',
    })),
    habitat: {
      backgrounds: HABITAT_ITEMS.backgrounds.map((item) => ({
        ...item,
        owned: ownedHabitat.includes(item.id) || !!item.default_owned,
        active: (pet?.active_habitat_bg || 'dojo-night') === item.id,
        locked: !!(item.minBond && (pet?.bond || 0) < item.minBond) || !!(item.minMastery && (pet?.mastery_xp || 0) < item.minMastery),
        lock_reason: item.minBond && (pet?.bond || 0) < item.minBond ? `Bond ${item.minBond}+` : item.minMastery && (pet?.mastery_xp || 0) < item.minMastery ? `Mastery ${item.minMastery}+` : '',
      })),
      props: HABITAT_ITEMS.props.map((item) => ({
        ...item,
        owned: ownedHabitat.includes(item.id),
        active: (pet?.active_habitat_prop || '') === item.id,
        locked: !!(item.minBond && (pet?.bond || 0) < item.minBond) || !!(item.minMastery && (pet?.mastery_xp || 0) < item.minMastery),
        lock_reason: item.minBond && (pet?.bond || 0) < item.minBond ? `Bond ${item.minBond}+` : item.minMastery && (pet?.mastery_xp || 0) < item.minMastery ? `Mastery ${item.minMastery}+` : '',
      })),
      floor: (HABITAT_ITEMS.floor || []).map((item) => ({
        ...item,
        owned: ownedHabitat.includes(item.id),
        active: (pet?.active_habitat_floor || '') === item.id,
        locked: !!(item.minBond && (pet?.bond || 0) < item.minBond) || !!(item.minMastery && (pet?.mastery_xp || 0) < item.minMastery),
        lock_reason: item.minBond && (pet?.bond || 0) < item.minBond ? `Bond ${item.minBond}+` : item.minMastery && (pet?.mastery_xp || 0) < item.minMastery ? `Mastery ${item.minMastery}+` : '',
      })),
      wall: (HABITAT_ITEMS.wall || []).map((item) => ({
        ...item,
        owned: ownedHabitat.includes(item.id),
        active: (pet?.active_habitat_wall || '') === item.id,
        locked: !!(item.minBond && (pet?.bond || 0) < item.minBond) || !!(item.minMastery && (pet?.mastery_xp || 0) < item.minMastery),
        lock_reason: item.minBond && (pet?.bond || 0) < item.minBond ? `Bond ${item.minBond}+` : item.minMastery && (pet?.mastery_xp || 0) < item.minMastery ? `Mastery ${item.minMastery}+` : '',
      })),
    },
  });
});

// POST /api/pets/buy-food — buy and feed a food item
router.post('/buy-food', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });

  const food = PET_FOODS_MAP[req.body.foodId];
  if (!food) return res.status(400).json({ error: 'Unknown food item' });

  const balance = pet.combo_balance || 0;
  if (balance < food.cost) return res.status(400).json({ error: 'Not enough Combo', need: food.cost, have: balance });

  const vitals = buildPetVitalsSnapshot(pet);
  const hunger = vitals.hunger;
  const happiness = vitals.happiness;
  const energy = vitals.energy;
  const momentum = vitals.momentum;
  const trust = vitals.trust;
  const preference = getFoodPreference(pet.character, food.id);
  const favoriteBonus = preference === 'favorite' ? { happiness: 4, bond: 5, trust: 2, energy: 5, hype: 4 } : null;
  const dislikedPenalty = preference === 'disliked' ? { happiness: -3, trust: -1, hype: -2 } : null;
  const newHunger = clamp(hunger + food.hunger, 0, MAX_STAT);
  const newHappiness = clamp(happiness + food.happiness + (favoriteBonus?.happiness || 0) + (dislikedPenalty?.happiness || 0), 0, MAX_STAT);
  const newEnergy = clamp(energy + Math.max(2, Math.floor(food.hunger / 2)) + (favoriteBonus?.energy || 0), 0, MAX_STAT);
  const newHype = clamp(momentum + Math.max(0, Math.floor(food.happiness / 2)) + (favoriteBonus?.hype || 0) + (dislikedPenalty?.hype || 0), 0, MAX_STAT);
  const newBond = Math.max(0, (pet.bond || 0) + (favoriteBonus?.bond || 1));
  const newTrust = clamp(trust + (favoriteBonus?.trust || 0) + (dislikedPenalty?.trust || 0), 0, MAX_STAT);
  const feedCtx = buildContextualSpeech(pet, { type: 'feed', preference });
  const response = feedCtx.speech;
  updateStreak(db, pet);

  db.prepare(`
    UPDATE user_pets
    SET fullness = ?, happiness = ?, energy = ?, hype = ?, bond = ?, trust = ?,
        combo_balance = combo_balance - ?,
        lifetime_feeds = lifetime_feeds + 1,
        last_food_id = ?, last_food_at = datetime('now'),
        last_meaningful_care_at = datetime('now'),
        last_fed_at = datetime('now'), updated_at = datetime('now')
    WHERE user_id = ?
  `).run(newHunger, newHappiness, newEnergy, newHype, newBond, newTrust, food.cost, food.id, req.user.id);

  const updated = loadPetWithRequestState(db, req.user.id);
  res.json({
    pet: formatPet(updated, false, db),
    food: food.name,
    food_preference: preference,
    pet_response: response,
    rare: feedCtx.rare || false,
  });
});

// POST /api/pets/buy-item — buy a clothing item
router.post('/buy-item', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });

  const item = CLOTHING_MAP[req.body.itemId];
  if (!item) return res.status(400).json({ error: 'Unknown item' });

  const owned = safeJsonParse(pet.owned_items);
  if (owned.includes(item.id)) return res.status(400).json({ error: 'Already owned' });

  const balance = pet.combo_balance || 0;
  if (balance < item.cost) return res.status(400).json({ error: 'Not enough Combo', need: item.cost, have: balance });

  owned.push(item.id);
  db.prepare(`
    UPDATE user_pets SET combo_balance = combo_balance - ?, owned_items = ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(item.cost, JSON.stringify(owned), req.user.id);

  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(updated, false, db), item: item.name });
});

// POST /api/pets/buy-toy — buy a toy
router.post('/buy-toy', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });

  const toy = PET_TOY_MAP[req.body.toyId];
  if (!toy) return res.status(400).json({ error: 'Unknown toy' });

  const ownedToys = safeJsonParse(pet.owned_toys);
  if (ownedToys.includes(toy.id)) return res.status(400).json({ error: 'Already owned' });

  const balance = pet.combo_balance || 0;
  if (balance < toy.cost) return res.status(400).json({ error: 'Not enough Combo', need: toy.cost, have: balance });

  ownedToys.push(toy.id);
  db.prepare(`
    UPDATE user_pets SET combo_balance = combo_balance - ?, owned_toys = ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(toy.cost, JSON.stringify(ownedToys), req.user.id);

  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(updated, false, db), toy: toy.name });
});

// POST /api/pets/buy-habitat-item — buy a room background, prop, floor, or wall item
router.post('/buy-habitat-item', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });

  const item = HABITAT_ITEM_MAP[req.body.itemId];
  if (!item) return res.status(400).json({ error: 'Unknown habitat item' });

  const ownedHabitat = safeJsonParse(pet.owned_habitat_items, ['dojo-night']);
  if (ownedHabitat.includes(item.id)) return res.status(400).json({ error: 'Already owned' });

  // Lock gate checks
  const bond = pet.bond || 0;
  const masteryXp = pet.mastery_xp || 0;
  if (item.minBond && bond < item.minBond) return res.status(400).json({ error: `Bond ${item.minBond}+ required`, need_bond: item.minBond, have_bond: bond });
  if (item.minMastery && masteryXp < item.minMastery) return res.status(400).json({ error: `Mastery ${item.minMastery}+ required`, need_mastery: item.minMastery, have_mastery: masteryXp });

  const balance = pet.combo_balance || 0;
  if (balance < item.cost) return res.status(400).json({ error: 'Not enough Combo', need: item.cost, have: balance });

  ownedHabitat.push(item.id);
  db.prepare(`
    UPDATE user_pets SET combo_balance = combo_balance - ?, owned_habitat_items = ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(item.cost, JSON.stringify(ownedHabitat), req.user.id);

  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(updated, false, db), item: item.name });
});

// POST /api/pets/equip-habitat — set active room background, prop, floor, or wall
router.post('/equip-habitat', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });

  const { itemId = '', slot = '' } = req.body || {};
  const ownedHabitat = safeJsonParse(pet.owned_habitat_items, []);
  const defaultOwned = ALL_HABITAT_ITEMS.filter(i => i.default_owned).map(i => i.id);
  const allOwned = new Set([...ownedHabitat, ...defaultOwned]);
  const slotColumnMap = { background: 'active_habitat_bg', prop: 'active_habitat_prop', floor: 'active_habitat_floor', wall: 'active_habitat_wall' };
  const slotFallbackMap = { background: 'dojo-night', prop: '', floor: '', wall: '' };

  if (itemId) {
    if (!allOwned.has(itemId)) return res.status(400).json({ error: 'Habitat item not owned' });
    const habitatSlot = getHabitatSlot(itemId);
    if (!habitatSlot) return res.status(400).json({ error: 'Unknown habitat item type' });
    // Lock gate check on equip
    const item = HABITAT_ITEM_MAP[itemId];
    if (item) {
      const bond = pet.bond || 0;
      const masteryXp = pet.mastery_xp || 0;
      if (item.minBond && bond < item.minBond) return res.status(400).json({ error: `Bond ${item.minBond}+ required` });
      if (item.minMastery && masteryXp < item.minMastery) return res.status(400).json({ error: `Mastery ${item.minMastery}+ required` });
    }
    const column = slotColumnMap[habitatSlot];
    if (!column) return res.status(400).json({ error: 'Unknown habitat slot' });
    db.prepare(`UPDATE user_pets SET ${column} = ?, updated_at = datetime('now') WHERE user_id = ?`).run(itemId, req.user.id);
  } else {
    if (!['background', 'prop', 'floor', 'wall'].includes(slot)) return res.status(400).json({ error: 'Invalid habitat slot' });
    const column = slotColumnMap[slot];
    const fallback = slotFallbackMap[slot];
    db.prepare(`UPDATE user_pets SET ${column} = ?, updated_at = datetime('now') WHERE user_id = ?`).run(fallback, req.user.id);
  }

  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(updated, false, db) });
});

// POST /api/pets/training-path — choose active mastery path
router.post('/training-path', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });

  const pathId = String(req.body?.pathId || '').trim();
  if (!TRAINING_PATHS[pathId]) return res.status(400).json({ error: 'Unknown training path' });

  db.prepare(`
    UPDATE user_pets
    SET active_training_path = ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(pathId, req.user.id);

  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  const profile = getCharacterProfile(updated.character);
  res.json({
    pet: formatPet(updated, false, db),
    speech: `${pickRandom(profile.interaction_lines.mission, 'A new focus begins.')} ${TRAINING_PATHS[pathId].label} training it is.`,
    path: pathId,
  });
});

// POST /api/pets/coach-ack — acknowledge coach suggestion
router.post('/coach-ack', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });

  const { priority } = req.body || {};
  if (!priority) return res.status(400).json({ error: 'Missing priority' });

  const sameFocus = (pet.last_coach_priority || '') === priority;
  const newCount = sameFocus ? (pet.coach_focus_count || 0) + 1 : 1;

  db.prepare(`
    UPDATE user_pets
    SET last_coach_priority = ?, last_coach_at = datetime('now'), coach_focus_count = ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(priority, newCount, req.user.id);

  res.json({ success: true, focus_count: newCount });
});

// POST /api/pets/equip — equip or unequip clothing
router.post('/equip', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });

  const { itemId } = req.body; // empty string = unequip
  if (itemId) {
    const owned = safeJsonParse(pet.owned_items);
    if (!owned.includes(itemId)) return res.status(400).json({ error: 'Item not owned' });
    const slot = getClothingSlot(itemId);
    if (!slot) return res.status(400).json({ error: 'Unknown item type' });
    const colMap = { hat: 'equipped_hat', belt: 'equipped_belt', shoes: 'equipped_shoes', top: 'equipped_top' };
    const colorColMap = { hat: 'hat_color', belt: 'belt_color', shoes: 'shoes_color', top: 'top_color' };
    const item = CLOTHING_MAP[itemId];
    db.prepare(`UPDATE user_pets SET ${colMap[slot]} = ?, ${colorColMap[slot]} = ?, updated_at = datetime('now') WHERE user_id = ?`)
      .run(itemId, item.defaultColor, req.user.id);
  } else {
    // Unequip a slot
    const slot = req.body.slot; // 'hat', 'belt', 'shoes', or 'top'
    if (!['hat', 'belt', 'shoes', 'top'].includes(slot)) return res.status(400).json({ error: 'Invalid slot' });
    const colMap = { hat: 'equipped_hat', belt: 'equipped_belt', shoes: 'equipped_shoes', top: 'equipped_top' };
    db.prepare(`UPDATE user_pets SET ${colMap[slot]} = '', updated_at = datetime('now') WHERE user_id = ?`).run(req.user.id);
  }

  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(updated, false, db) });
});

// POST /api/pets/set-color — change clothing color
router.post('/set-color', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const { slot, color } = req.body;
  if (!['hat', 'belt', 'shoes', 'top'].includes(slot)) return res.status(400).json({ error: 'Invalid slot' });
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return res.status(400).json({ error: 'Invalid color (use #RRGGBB)' });
  const colMap = { hat: 'hat_color', belt: 'belt_color', shoes: 'shoes_color', top: 'top_color' };
  db.prepare(`UPDATE user_pets SET ${colMap[slot]} = ?, updated_at = datetime('now') WHERE user_id = ?`).run(color, req.user.id);
  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(updated, false, db) });
});

// POST /api/pets/toggle-avatar — toggle pet as profile avatar
router.post('/toggle-avatar', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT is_pet_avatar FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });
  const newVal = pet.is_pet_avatar ? 0 : 1;
  db.prepare('UPDATE user_pets SET is_pet_avatar = ?, updated_at = datetime(\'now\') WHERE user_id = ?').run(newVal, req.user.id);
  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(updated, false, db) });
});

// POST /api/pets/feed — legacy manual feed (small amount)
router.post('/feed', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });
  const hunger = computeDecayed(pet.fullness, pet.last_fed_at, HUNGER_DECAY_PER_HOUR);
  const currentEnergy = getEnergyStateValue(pet.energy || 65, pet.updated_at || pet.last_fed_at, hunger);
  const currentMomentum = getMomentumStateValue(pet.hype || 25, pet.updated_at || pet.last_fed_at);
  const newHunger = clamp(hunger + 5, 0, MAX_STAT);
  const newEnergy = clamp(currentEnergy + 2, 0, MAX_STAT);
  const newMomentum = clamp(currentMomentum + 1, 0, MAX_STAT);
  db.prepare(`
    UPDATE user_pets SET fullness = ?, energy = ?, hype = ?,
    lifetime_feeds = lifetime_feeds + 1,
    last_meaningful_care_at = datetime('now'),
    last_fed_at = datetime('now'), updated_at = datetime('now') WHERE user_id = ?
  `).run(newHunger, newEnergy, newMomentum, req.user.id);
  const updated = loadPetWithRequestState(db, req.user.id);
  res.json({ pet: formatPet(updated, false, db), fed: 1 });
});

router.get('/requests/current', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const summary = queryPlayActivitySummary(db, req.user.id);
  const pet = loadPetWithRequestState(db, req.user.id, summary);
  if (!pet) return res.json({ request: null, pet: null });
  const vitals = buildPetVitalsSnapshot(pet);
  res.json({
    request: getCurrentPetRequest(pet, vitals, summary),
    pet: formatPet(pet, false, db),
  });
});

router.post('/requests/current/complete', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const summary = queryPlayActivitySummary(db, req.user.id);
  const pet = loadPetWithRequestState(db, req.user.id, summary);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });

  const vitals = buildPetVitalsSnapshot(pet);
  const request = getCurrentPetRequest(pet, vitals, summary);
  if (!request) return res.status(404).json({ error: 'No active request' });
  if (request.status !== 'completed' && !isPetRequestSatisfied(request, vitals, pet, summary)) {
    return res.status(400).json({ error: 'Request is not complete yet' });
  }

  const reward = request.reward || {};
  db.prepare(`
    UPDATE user_pets
    SET bond = ?,
        trust = ?,
        energy = ?,
        hype = ?,
        happiness = ?,
        combo_balance = ?,
        bond_tokens = ?,
        rare_shards = ?,
        active_request_type = '',
        active_request_payload = '{}',
        active_request_status = '',
        active_request_created_at = '',
        active_request_expires_at = '',
        active_request_completed_at = '',
        last_request_refresh_at = datetime('now'),
        updated_at = datetime('now')
    WHERE user_id = ?
  `).run(
    Math.max(0, (pet.bond || 0) + (reward.bond || 0)),
    clamp(vitals.trust + (reward.trust || 0), 0, MAX_STAT),
    clamp(vitals.energy + (reward.energy || 0), 0, MAX_STAT),
    clamp(vitals.momentum + (reward.hype || reward.momentum || 0), 0, MAX_STAT),
    clamp(vitals.happiness + (reward.happiness || 0), 0, MAX_STAT),
    Math.max(0, (pet.combo_balance || 0) + (reward.combo_balance || 0)),
    Math.max(0, (pet.bond_tokens || 0) + (reward.bond_tokens || 0)),
    Math.max(0, (pet.rare_shards || 0) + (reward.rare_shards || 0)),
    req.user.id
  );

  const updated = loadPetWithRequestState(db, req.user.id);
  res.json({
    request_claimed: true,
    reward,
    pet: formatPet(updated, false, db),
  });
});

router.post('/requests/current/dismiss', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });

  clearPetRequestFields(db, req.user.id);
  const updated = loadPetWithRequestState(db, req.user.id);
  res.json({
    dismissed: true,
    pet: formatPet(updated, false, db),
  });
});

// POST /api/pets/interact
router.post('/interact', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });

  const actionId = String(req.body?.actionId || 'tap').trim();
  const isTap = actionId === 'tap';
  const interaction = PET_INTERACTIONS[actionId] || PET_INTERACTIONS.tap;

  // Bond gate (e.g. perform requires bond ≥ 40)
  if (interaction.minBond && (pet.bond || 0) < interaction.minBond) {
    return res.status(400).json({ error: `${interaction.label} unlocks at bond ${interaction.minBond}` });
  }

  const todayKey = getUtcDayKey();
  const currentDailyInteractions = pet.daily_interaction_key === todayKey ? (pet.daily_interaction_count || 0) : 0;
  const vitals = buildPetVitalsSnapshot(pet);
  const currentEnergy = vitals.energy;
  const currentHype = vitals.momentum;
  const currentHappiness = vitals.happiness;
  const currentHunger = vitals.hunger;
  const currentTrust = vitals.trust;

  // Energy gate for costly interactions (perform costs energy)
  if (interaction.energy < 0 && currentEnergy < Math.abs(interaction.energy)) {
    return res.status(400).json({ error: `Not enough energy for ${interaction.label}` });
  }
  if (actionId === 'perform' && currentHunger < LOW_HUNGER_THRESHOLD) {
    return res.status(400).json({ error: 'Feed your pet first before asking for a performance.' });
  }
  if (actionId === 'perform' && currentHype < LOW_MOMENTUM_THRESHOLD) {
    return res.status(400).json({ error: `Momentum ${LOW_MOMENTUM_THRESHOLD}+ needed for ${interaction.label}` });
  }

  // ─── Tap diminishing returns ───────────────────────────
  const dailyTaps = (pet.daily_tap_key === todayKey ? (pet.daily_tap_count || 0) : 0);
  let effectiveBond, effectiveTrust, effectiveHappy, effectiveHype, tapPhase;
  if (isTap) {
    const tapFx = getTapEffects(dailyTaps);
    effectiveBond = tapFx.bond;
    effectiveTrust = tapFx.trust;
    effectiveHappy = tapFx.happiness;
    effectiveHype = tapFx.hype;
    tapPhase = tapFx.phase;
  } else {
    effectiveBond = interaction.bond || 0;
    effectiveTrust = interaction.trust || 0;
    effectiveHappy = interaction.happiness || 0;
    effectiveHype = interaction.hype || 0;
    tapPhase = 'full';
  }

  // Streak tracking
  const streakInfo = updateStreak(db, pet);

  const energyCost = interaction.energy || 0;
  const newEnergy = clamp(currentEnergy + energyCost, 0, MAX_STAT);
  // Energy→hunger: spending energy makes pet hungrier
  const hungerDrain = energyCost < 0 ? Math.round(Math.abs(energyCost) * ENERGY_TO_HUNGER_RATIO) : 0;
  const newHunger = clamp(currentHunger - hungerDrain, 0, MAX_STAT);
  const newHype = clamp(currentHype + effectiveHype, 0, MAX_STAT);
  const newHappiness = clamp(currentHappiness + effectiveHappy, 0, MAX_STAT);
  const newTrust = clamp(currentTrust + effectiveTrust, 0, MAX_STAT);
  const streakBondExtra = streakInfo.isNewDay ? streakInfo.streakBonus : 0;
  // Scale bond gain based on current bond level
  const rawBondGain = effectiveBond + streakBondExtra;
  const scaledBondGain = rawBondGain > 0 ? scaleBondGain(rawBondGain, pet.bond || 0) : rawBondGain;
  const newBond = Math.max(0, (pet.bond || 0) + scaledBondGain);
  const ctx = buildContextualSpeech(pet, { type: 'interact', actionId, tapPhase });

  const newDailyTaps = isTap ? dailyTaps + 1 : dailyTaps;

  db.prepare(`
    UPDATE user_pets
    SET happiness = ?, energy = ?, hype = ?, trust = ?, bond = ?,
        fullness = ?,
        interaction_count = interaction_count + 1,
        daily_interaction_count = ?,
        daily_interaction_key = ?,
        daily_tap_count = ?,
        daily_tap_key = ?,
        last_meaningful_care_at = datetime('now'),
        updated_at = datetime('now')
    WHERE user_id = ?
  `).run(newHappiness, newEnergy, newHype, newTrust, newBond, newHunger, currentDailyInteractions + 1, todayKey, newDailyTaps, todayKey, req.user.id);

  const updated = loadPetWithRequestState(db, req.user.id);
  const changes = [];
  if (scaledBondGain > 0) changes.push(`+${scaledBondGain} bond`);
  if (effectiveTrust > 0) changes.push(`+${effectiveTrust} trust`);
  else if (effectiveTrust < 0) changes.push(`${effectiveTrust} trust`);
  if (effectiveHappy > 0) changes.push(`+${effectiveHappy} happy`);
  else if (effectiveHappy < 0) changes.push(`${effectiveHappy} happy`);
  if (effectiveHype > 0) changes.push(`+${effectiveHype} momentum`);
  else if (effectiveHype < 0) changes.push(`${effectiveHype} momentum`);
  if (energyCost < 0) changes.push(`${energyCost} energy`);
  else if (energyCost > 0) changes.push(`+${energyCost} energy`);
  if (hungerDrain > 0) changes.push(`-${hungerDrain} hunger`);
  if (streakBondExtra && scaledBondGain > effectiveBond) changes.push(`+${scaledBondGain - effectiveBond} streak`);

  // Tap phase speech overrides
  let speech = ctx.speech;
  let tapWarning = null;
  if (isTap && tapPhase === 'diminished') {
    tapWarning = 'diminished';
  } else if (isTap && tapPhase === 'annoyed') {
    const annoyedLines = {
      dojocat: ['Enough. I am not a drumpad.', 'Discipline means knowing when to stop.', 'My patience wears thin.'],
      buu: ['Stop poking me!', 'Ugh, I need SPACE.', 'That stopped being fun ages ago.'],
      devit: ['OI. Knock it off!', 'You are making me CRANKY.', 'Poke me ONE more time...'],
      pixiu: ['The guardian grows weary of this.', 'Respect must have boundaries.', 'Even blessings have limits.'],
    };
    const charLines = annoyedLines[pet.character || 'dojocat'] || annoyedLines.dojocat;
    speech = charLines[Math.floor(Math.random() * charLines.length)];
    tapWarning = 'annoyed';
  }

  res.json({
    pet: formatPet(updated, false, db),
    speech,
    reaction: tapPhase === 'annoyed' ? 'mischief' : (interaction.reaction || ''),
    expression: tapPhase === 'annoyed' ? 'smirk' : (interaction.expression || ''),
    action: actionId,
    rare: ctx.rare || false,
    mood_aware: ctx.mood_aware || false,
    stat_changes: changes,
    tap_warning: tapWarning,
    taps_today: isTap ? newDailyTaps : undefined,
    tap_limit: isTap ? TAP_FULL_REWARD_LIMIT : undefined,
    streak: streakInfo.isNewDay ? { day: streakInfo.streak, bonus: streakBondExtra } : null,
  });
});

// POST /api/pets/activities/:activityId
router.post('/activities/:activityId', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });

  const activity = PET_ACTIVITIES[req.params.activityId];
  if (!activity) return res.status(404).json({ error: 'Unknown activity' });

  const vitals = buildPetVitalsSnapshot(pet);
  const currentEnergy = vitals.energy;
  const currentHype = vitals.momentum;
  const currentHappiness = vitals.happiness;
  const currentHunger = vitals.hunger;
  const currentTrust = vitals.trust;

  if (activity.minEnergy && currentEnergy < activity.minEnergy) {
    return res.status(400).json({ error: `Needs at least ${activity.minEnergy} energy for ${activity.label}` });
  }
  if (activity.minTrust && currentTrust < activity.minTrust) {
    return res.status(400).json({ error: `${activity.label} unlocks once trust reaches ${activity.minTrust}` });
  }
  if (activity.id !== 'rest' && currentHunger < CRITICAL_HUNGER_THRESHOLD) {
    return res.status(400).json({ error: 'Feed your pet before trying demanding activities.' });
  }
  if ((activity.id === 'spar' || activity.id === 'explore') && currentHype < LOW_MOMENTUM_THRESHOLD) {
    return res.status(400).json({ error: `Momentum ${LOW_MOMENTUM_THRESHOLD}+ needed for ${activity.label}` });
  }

  // ─── Rest cooldown ─────────────────────────────────────
  if (activity.id === 'rest') {
    const lastRestAt = pet.last_rest_at;
    if (lastRestAt) {
      const elapsed = Date.now() - new Date(lastRestAt + 'Z').getTime();
      if (elapsed < REST_COOLDOWN_MS) {
        const remainSec = Math.ceil((REST_COOLDOWN_MS - elapsed) / 1000);
        const mins = Math.floor(remainSec / 60);
        const secs = remainSec % 60;
        return res.status(400).json({ error: `Rest cooldown: ${mins}m ${secs}s remaining`, cooldown_remaining: remainSec });
      }
    }
  }

  // Streak tracking
  const streakInfo = updateStreak(db, pet);

  const newEnergy = clamp(currentEnergy + activity.energy, 0, MAX_STAT);
  const newHappiness = clamp(currentHappiness + activity.happiness, 0, MAX_STAT);
  const newTrust = clamp(currentTrust + activity.trust, 0, MAX_STAT);
  const newHype = clamp(currentHype + activity.hype, 0, MAX_STAT);

  // Scale bond gain based on current bond level
  const rawBond = activity.bond || 0;
  const scaledBond = rawBond > 0 ? scaleBondGain(rawBond, pet.bond || 0) : rawBond;
  const newBond = Math.max(0, (pet.bond || 0) + scaledBond);
  const newCombo = Math.max(0, (pet.combo_balance || 0) + (activity.combo || 0));
  const newBondTokens = Math.max(0, (pet.bond_tokens || 0) + (activity.bond_tokens || 0));
  const newRareShards = Math.max(0, (pet.rare_shards || 0) + (activity.rare_shards || 0));
  const masteryGain = getActivityMasteryGain(pet.active_training_path || 'consistency', activity.id);

  // Energy→hunger: spending energy makes pet hungrier
  let hungerDrain = 0;
  if (activity.energy < 0) {
    hungerDrain = Math.round(Math.abs(activity.energy) * ENERGY_TO_HUNGER_RATIO);
  }
  // Rest costs hunger too (sleeping makes you hungry)
  if (activity.id === 'rest') {
    hungerDrain = REST_HUNGER_COST;
  }
  const newHunger = clamp(currentHunger - hungerDrain, 0, MAX_STAT);

  const ctx = buildContextualSpeech(pet, { type: 'activity', activityId: activity.id });

  const lastRestUpdate = activity.id === 'rest' ? toSqliteDateTime() : (pet.last_rest_at || '');
  db.prepare(`
    UPDATE user_pets
    SET happiness = ?, energy = ?, trust = ?, hype = ?, bond = ?,
        combo_balance = ?, bond_tokens = ?, rare_shards = ?,
        fullness = ?,
        mastery_xp = mastery_xp + ?,
        lifetime_activities = lifetime_activities + 1,
        last_rest_at = ?,
        last_meaningful_care_at = datetime('now'),
        updated_at = datetime('now')
    WHERE user_id = ?
  `).run(newHappiness, newEnergy, newTrust, newHype, newBond, newCombo, newBondTokens, newRareShards, newHunger, masteryGain, lastRestUpdate, req.user.id);

  const updated = loadPetWithRequestState(db, req.user.id);
  const changes = [];
  if (activity.energy < 0) changes.push(`${activity.energy} energy`);
  else if (activity.energy > 0) changes.push(`+${activity.energy} energy`);
  if (hungerDrain > 0) changes.push(`-${hungerDrain} hunger`);
  if (activity.happiness) changes.push(`+${activity.happiness} happy`);
  if (activity.trust) changes.push(`+${activity.trust} trust`);
  if (scaledBond > 0) changes.push(`+${scaledBond} bond`);
  if (activity.hype > 0) changes.push(`+${activity.hype} momentum`);
  else if (activity.hype < 0) changes.push(`${activity.hype} momentum`);
  if (activity.combo) changes.push(`+${activity.combo} combo`);
  if (activity.bond_tokens) changes.push(`+${activity.bond_tokens} token`);
  if (masteryGain) changes.push(`+${masteryGain} mastery`);

  res.json({
    pet: formatPet(updated, false, db),
    speech: ctx.speech,
    reaction: activity.reaction,
    expression: activity.expression,
    activity: activity.id,
    mastery_gain: masteryGain,
    rare: ctx.rare || false,
    stat_changes: changes,
  });
});

// POST /api/pets/toys/:toyId/use
router.post('/toys/:toyId/use', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });

  const toy = PET_TOY_MAP[req.params.toyId];
  if (!toy) return res.status(404).json({ error: 'Unknown toy' });

  const ownedToys = safeJsonParse(pet.owned_toys);
  if (!ownedToys.includes(toy.id)) return res.status(400).json({ error: 'Toy not owned yet' });

  const vitals = buildPetVitalsSnapshot(pet);
  const currentEnergy = vitals.energy;
  const currentHype = vitals.momentum;
  const currentHappiness = vitals.happiness;
  const currentTrust = vitals.trust;
  const todayKey = getUtcDayKey();
  const currentDailyInteractions = pet.daily_interaction_key === todayKey ? (pet.daily_interaction_count || 0) : 0;
  const preference = getToyPreference(pet.character, toy);
  const favoredBonus = preference === 'favorite'
    ? { bond: 2, trust: 2, happiness: 2, hype: 3 }
    : { bond: 0, trust: 0, happiness: 0, hype: 0 };

  if (currentEnergy < Math.max(8, Math.abs(toy.energy || 0))) {
    return res.status(400).json({ error: `${toy.name} works best once your pet has a little more energy.` });
  }

  const newEnergy = clamp(currentEnergy + (toy.energy || 0), 0, MAX_STAT);
  const newHappiness = clamp(currentHappiness + (toy.happiness || 0) + favoredBonus.happiness, 0, MAX_STAT);
  const newTrust = clamp(currentTrust + (toy.trust || 0) + favoredBonus.trust, 0, MAX_STAT);
  const newHype = clamp(currentHype + (toy.hype || 0) + favoredBonus.hype, 0, MAX_STAT);
  const newBond = Math.max(0, (pet.bond || 0) + (toy.bond || 0) + favoredBonus.bond);
  const newBondTokens = Math.max(0, (pet.bond_tokens || 0) + (toy.bond_tokens || 0));
  const newCombo = Math.max(0, (pet.combo_balance || 0) + (toy.combo_balance || 0));
  const profile = getCharacterProfile(pet.character);
  const speech = preference === 'favorite'
    ? `${pickRandom(profile.interaction_lines.praise, 'That was delightful.')} ${toy.name} is a favourite.`
    : `${pickRandom(profile.interaction_lines.tap, 'Another little moment together.')} ${toy.name} time.`;

  db.prepare(`
    UPDATE user_pets
    SET happiness = ?, energy = ?, trust = ?, hype = ?, bond = ?,
        bond_tokens = ?, combo_balance = ?,
        interaction_count = interaction_count + 1,
        daily_interaction_count = ?,
        daily_interaction_key = ?,
        last_toy_id = ?, last_toy_at = datetime('now'),
        last_meaningful_care_at = datetime('now'),
        updated_at = datetime('now')
    WHERE user_id = ?
  `).run(
    newHappiness,
    newEnergy,
    newTrust,
    newHype,
    newBond,
    newBondTokens,
    newCombo,
    currentDailyInteractions + 1,
    todayKey,
    toy.id,
    req.user.id,
  );

  const updated = loadPetWithRequestState(db, req.user.id);
  res.json({
    pet: formatPet(updated, false, db),
    toy: toy.id,
    speech,
    reaction: toy.reaction,
    expression: toy.expression,
    preference,
    toy_visual: {
      action_state: toy.action_state || '',
      overlay_id: toy.overlay_id || '',
      duration_ms: toy.duration_ms || 1600,
      fx: toy.fx || '',
      visual_type: toy.visual_type || '',
      hold_slot: toy.hold_slot || 'none',
    },
  });
});

// POST /api/pets/missions/:missionId/claim
router.post('/missions/:missionId/claim', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });

  const summary = queryPlayActivitySummary(db, req.user.id);
  const missions = buildPetMissions(pet, {
    ...summary,
    fed_today: !!pet.last_food_at && String(pet.last_food_at).startsWith(getUtcDayKey()),
    interactions_today: pet.daily_interaction_key === getUtcDayKey() ? (pet.daily_interaction_count || 0) : 0,
  });
  const mission = missions.find((entry) => entry.id === req.params.missionId);
  if (!mission) return res.status(404).json({ error: 'Mission not found' });
  if (mission.claimed) return res.status(400).json({ error: 'Mission already claimed' });
  if (!mission.complete) return res.status(400).json({ error: 'Mission not complete yet' });

  const claimed = safeJsonParse(pet.claimed_missions);
  claimed.push(mission.claim_key);
  const reward = mission.reward || {};
  const vitals = buildPetVitalsSnapshot(pet);
  const currentEnergy = vitals.energy;
  const currentHype = vitals.momentum;
  const currentHappiness = vitals.happiness;
  const currentTrust = vitals.trust;
  const masteryGain = getMissionMasteryGain(pet.active_training_path || 'consistency', mission.id, mission.cadence);

  db.prepare(`
    UPDATE user_pets
    SET claimed_missions = ?,
        bond = ?,
        trust = ?,
        energy = ?,
        hype = ?,
        happiness = ?,
        combo_balance = ?,
        bond_tokens = ?,
        rare_shards = ?,
        mastery_xp = mastery_xp + ?,
        updated_at = datetime('now')
    WHERE user_id = ?
  `).run(
    JSON.stringify(claimed),
    Math.max(0, (pet.bond || 0) + (reward.bond || 0)),
    clamp(currentTrust + (reward.trust || 0), 0, MAX_STAT),
    clamp(currentEnergy + (reward.energy || 0), 0, MAX_STAT),
    clamp(currentHype + (reward.hype || 0), 0, MAX_STAT),
    clamp(currentHappiness + (reward.happiness || 0), 0, MAX_STAT),
    Math.max(0, (pet.combo_balance || 0) + (reward.combo_balance || 0)),
    Math.max(0, (pet.bond_tokens || 0) + (reward.bond_tokens || 0)),
    Math.max(0, (pet.rare_shards || 0) + (reward.rare_shards || 0)),
    masteryGain,
    req.user.id,
  );

  const updated = loadPetWithRequestState(db, req.user.id);
  res.json({
    pet: formatPet(updated, false, db),
    mission: mission.id,
    reward: mission.reward,
    mastery_gain: masteryGain,
  });
});

// ─── Trick demand/perform ─────────────────────────────────────────
router.post('/tricks/:trickId/demand', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });
  const trickId = req.params.trickId;
  const charTricks = TRICKS[pet.character] || [];
  const trickIndex = charTricks.findIndex(t => t.id === trickId);
  const trick = charTricks[trickIndex];
  if (!trick) return res.status(404).json({ error: 'Trick not found' });
  if ((pet.experience || 0) < trick.xp) return res.status(400).json({ error: 'Trick not unlocked yet' });

  const highestLevel = pet.highest_level || 10;
  const demandLevel = Math.max(10, highestLevel - Math.floor(Math.random() * 3) - 1);
  const demandGrade = TRICK_DEMAND_GRADES[trickIndex] || 'A';
  const expires = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '');

  db.prepare(`
    UPDATE user_pets SET pending_trick = ?, trick_demand_level = ?, trick_demand_grade = ?,
    trick_demand_expires = ?, updated_at = datetime('now') WHERE user_id = ?
  `).run(trickId, demandLevel, demandGrade, expires, req.user.id);

  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ pet: formatPet(updated, false, db) });
});

router.post('/tricks/:trickId/perform', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!pet) return res.status(404).json({ error: 'No pet adopted yet' });
  if (pet.pending_trick !== req.params.trickId) {
    return res.status(400).json({ error: 'No active demand for this trick' });
  }
  const gradeOrder = ['F', 'D', 'C', 'B', 'A', 'A+', 'AA', 'AA+', 'AAA', 'AAA+', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+'];
  const minGradeIndex = gradeOrder.indexOf(pet.trick_demand_grade || 'A');
  const demandLevel = pet.trick_demand_level || 0;

  const recentPlays = db.prepare(`
    SELECT level, grade, score FROM user_recently_played
    WHERE user_id = ? AND level >= ? AND played_at_utc >= datetime('now', '-48 hours')
    ORDER BY played_at_utc DESC LIMIT 50
  `).all(req.user.id, demandLevel);

  const matched = recentPlays.some(play => {
    const g = normalizeGrade(play.grade) || gradeFromScore(play.score);
    return gradeOrder.indexOf(g) >= minGradeIndex;
  });

  if (!matched) {
    return res.json({ success: false, message: `Play a level ${demandLevel}+ song and get at least ${pet.trick_demand_grade} grade!` });
  }

  const charTricks = TRICKS[pet.character] || [];
  const trick = charTricks.find(t => t.id === req.params.trickId);
  const comboReward = trick?.comboReward || 10;
  const happinessReward = trick?.happinessReward || 5;
  const bonusXp = 25;

  const currentHappiness = computeDecayed(pet.happiness || 50, pet.last_fed_at, HAPPINESS_DECAY_PER_HOUR);
  const newHappiness = clamp(currentHappiness + happinessReward, 0, MAX_STAT);

  db.prepare(`
    UPDATE user_pets
    SET pending_trick = '', trick_demand_level = 0, trick_demand_grade = '', trick_demand_expires = '',
        last_trick_performed = ?, last_trick_at = datetime('now'),
        experience = experience + ?, combo_balance = combo_balance + ?,
        happiness = ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(req.params.trickId, bonusXp, comboReward, newHappiness, req.user.id);

  const updated = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ success: true, pet: formatPet(updated, false, db), trick: req.params.trickId, bonus_xp: bonusXp, combo_earned: comboReward });
});

// GET /api/pets/characters
router.get('/characters', (_req, res) => {
  res.json({
    characters: VALID_CHARACTERS.map((id) => ({
      id,
      name: { dojocat: 'Dojo Cat', buu: 'Buu', devit: 'Devit', pixiu: 'Pixiu' }[id],
      tricks: (TRICKS[id] || []).map(t => ({ id: t.id, name: t.name, xp: t.xp })),
    })),
  });
});

// GET /api/pets/leaderboard — pet rankings
router.get('/leaderboard', (req, res) => {
  const db = getDb();
  ensurePetTable(db);
  const pets = db.prepare(`
    SELECT p.*, u.username
    FROM user_pets p
    JOIN users u ON u.id = p.user_id
    ORDER BY p.experience DESC
    LIMIT 25
  `).all();

  const entries = pets.map((pet, index) => {
    const bond = pet.bond || 0;
    const xp = pet.experience || 0;
    const masteryXp = pet.mastery_xp || 0;
    const form = getPetForm(bond, masteryXp);
    const bondRank = getBondRank(bond);
    const rank = getMasteryRank(masteryXp);
    const levelInfo = getLevelFromXp(xp);
    return {
      rank: index + 1,
      username: pet.username || 'Unknown',
      character: pet.character,
      bond,
      bond_rank: bondRank,
      level: levelInfo.level,
      experience: xp,
      mastery_xp: masteryXp,
      mastery_rank: rank.label,
      form: form,
      nickname: pet.nickname || '',
      daily_streak: pet.daily_streak || 0,
      total_songs_fed: pet.total_songs_fed || 0,
      equipped_hat: pet.equipped_hat || '',
      equipped_top: pet.equipped_top || '',
      hat_color: pet.hat_color || '',
      top_color: pet.top_color || '',
      weight_state: getWeightState(computeDecayed(pet.fullness, pet.last_fed_at, HUNGER_DECAY_PER_HOUR)),
      mood: getMood(
        computeDecayed(pet.fullness, pet.last_fed_at, HUNGER_DECAY_PER_HOUR),
        computeDecayed(pet.happiness || 50, pet.last_fed_at, HAPPINESS_DECAY_PER_HOUR),
      ),
    };
  });

  res.json({ leaderboard: entries });
});

// ─── Pet Social ───────────────────────────────────────────────────

// POST /api/pets/social/react — cheer another user's pet
router.post('/social/react', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetSocialTables(db);
  ensurePetTable(db);
  const { targetUserId, reactionType = 'cheer' } = req.body || {};

  if (!targetUserId || targetUserId === req.user.id) return res.status(400).json({ error: 'Invalid target' });
  const validReactions = ['cheer', 'wow', 'flex', 'heart'];
  if (!validReactions.includes(reactionType)) return res.status(400).json({ error: 'Invalid reaction' });

  const targetPet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(targetUserId);
  if (!targetPet) return res.status(404).json({ error: 'Target has no pet' });

  // Rate limit: 1 reaction per type per target per day
  const today = new Date().toISOString().slice(0, 10);
  const existing = db.prepare(
    `SELECT id FROM pet_social_reactions WHERE from_user_id = ? AND to_user_id = ? AND reaction_type = ? AND created_at >= ?`
  ).get(req.user.id, targetUserId, reactionType, today);
  if (existing) return res.status(429).json({ error: 'Already reacted today' });

  db.prepare(
    `INSERT INTO pet_social_reactions (from_user_id, to_user_id, reaction_type) VALUES (?, ?, ?)`
  ).run(req.user.id, targetUserId, reactionType);

  // Small bond boost for the target pet
  db.prepare(`UPDATE user_pets SET bond = bond + 1, hype = MIN(100, hype + 2), updated_at = datetime('now') WHERE user_id = ?`).run(targetUserId);

  const petChar = targetPet.character || 'pet';
  const labels = { cheer: 'Cheered', wow: 'Wowed', flex: 'Flexed on', heart: 'Loved' };
  res.json({ success: true, reaction: reactionType, petCharacter: petChar, label: `${labels[reactionType] || 'Reacted to'} ${petChar.charAt(0).toUpperCase() + petChar.slice(1)}!`, bond_given: 1 });
});

// POST /api/pets/social/gift — send food or toy gift to another user's pet
router.post('/social/gift', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetSocialTables(db);
  ensurePetTable(db);
  const { targetUserId, giftType, giftId, message = '' } = req.body || {};

  if (!targetUserId || targetUserId === req.user.id) return res.status(400).json({ error: 'Invalid target' });
  if (!['food', 'toy'].includes(giftType)) return res.status(400).json({ error: 'Invalid gift type' });

  const senderPet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  if (!senderPet) return res.status(404).json({ error: 'You need a pet to send gifts' });

  const targetPet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(targetUserId);
  if (!targetPet) return res.status(404).json({ error: 'Target has no pet' });

  // Rate limit: 3 gifts per day total
  const today = new Date().toISOString().slice(0, 10);
  const giftCount = db.prepare(
    `SELECT COUNT(*) as cnt FROM pet_gifts WHERE from_user_id = ? AND created_at >= ?`
  ).get(req.user.id, today);
  if ((giftCount?.cnt || 0) >= 3) return res.status(429).json({ error: 'Gift limit reached today (3/day)' });

  // Cost: 1 bond token per gift
  const balance = senderPet.bond_tokens || 0;
  if (balance < 1) return res.status(400).json({ error: 'Need at least 1 Bond Token to send a gift' });

  db.prepare(`UPDATE user_pets SET bond_tokens = bond_tokens - 1, updated_at = datetime('now') WHERE user_id = ?`).run(req.user.id);

  // Apply gift effect to target pet
  if (giftType === 'food') {
    const food = PET_FOODS_MAP[giftId];
    if (food) {
      db.prepare(`UPDATE user_pets SET fullness = MIN(100, fullness + ?), happiness = MIN(100, happiness + ?), bond = bond + 2, last_fed_at = datetime('now'), updated_at = datetime('now') WHERE user_id = ?`)
        .run(Math.floor(food.hunger / 2), Math.floor(food.happiness / 2), targetUserId);
    }
  } else if (giftType === 'toy') {
    db.prepare(`UPDATE user_pets SET happiness = MIN(100, happiness + 5), bond = bond + 3, hype = MIN(100, hype + 4), updated_at = datetime('now') WHERE user_id = ?`).run(targetUserId);
  }

  db.prepare(
    `INSERT INTO pet_gifts (from_user_id, to_user_id, gift_type, gift_id, message) VALUES (?, ?, ?, ?, ?)`
  ).run(req.user.id, targetUserId, giftType, giftId || '', String(message).slice(0, 100));

  const updatedSender = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  res.json({ success: true, pet: formatPet(updatedSender, false, db) });
});

// GET /api/pets/social/feed-summary — recent social activity for current user's pet
router.get('/social/feed-summary', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetSocialTables(db);

  const reactions = db.prepare(`
    SELECT r.reaction_type, COUNT(*) as cnt, MAX(r.created_at) as latest
    FROM pet_social_reactions r
    WHERE r.to_user_id = ?
    GROUP BY r.reaction_type
    ORDER BY latest DESC
  `).all(req.user.id);

  const recentGifts = db.prepare(`
    SELECT g.gift_type, g.gift_id, g.message, g.created_at, u.username as from_username
    FROM pet_gifts g
    JOIN users u ON u.id = g.from_user_id
    WHERE g.to_user_id = ?
    ORDER BY g.created_at DESC
    LIMIT 10
  `).all(req.user.id);

  const totalReactions = reactions.reduce((sum, r) => sum + r.cnt, 0);

  // Today's reactions with who sent them
  const today = new Date().toISOString().slice(0, 10);
  const todayReactions = db.prepare(`
    SELECT r.reaction_type, r.created_at, u.username as from_username
    FROM pet_social_reactions r
    JOIN users u ON u.id = r.from_user_id
    WHERE r.to_user_id = ? AND r.created_at >= ?
    ORDER BY r.created_at DESC
    LIMIT 20
  `).all(req.user.id, today);
  const todayCount = todayReactions.length;

  res.json({
    reactions: reactions.map(r => ({ type: r.reaction_type, count: r.cnt })),
    total_reactions: totalReactions,
    today_count: todayCount,
    today_reactions: todayReactions.map(r => ({ type: r.reaction_type, from: r.from_username, at: r.created_at })),
    recent_gifts: recentGifts,
  });
});

// ─── Mini-Pump Minigame ──────────────────────────────────────

function ensureMinigameTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pet_minigame_stats (
      user_id TEXT NOT NULL,
      game_id TEXT NOT NULL,
      personal_best INTEGER NOT NULL DEFAULT 0,
      best_streak INTEGER NOT NULL DEFAULT 0,
      rounds_played INTEGER NOT NULL DEFAULT 0,
      fastest_cadence INTEGER NOT NULL DEFAULT 1000,
      last_played_at TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, game_id)
    )
  `);
}

// GET /api/pets/minigames/mini-pump — get stats
router.get('/minigames/mini-pump', requireAuth, (req, res) => {
  const db = getDb();
  ensureMinigameTable(db);
  const row = db.prepare('SELECT * FROM pet_minigame_stats WHERE user_id = ? AND game_id = ?')
    .get(req.user.id, 'mini-pump');
  res.json({
    personalBest: row?.personal_best || 0,
    bestStreak: row?.best_streak || 0,
    roundsPlayed: row?.rounds_played || 0,
    fastestCadence: row?.fastest_cadence || 1000,
    lastPlayedAt: row?.last_played_at || '',
  });
});

// GET /api/pets/minigames/mini-pump/leaderboard — community bests
router.get('/minigames/mini-pump/leaderboard', requireAuth, (req, res) => {
  const db = getDb();
  ensureMinigameTable(db);
  ensurePetTable(db);

  const rawLimit = Number(req.query.limit || 10);
  const limit = Math.max(3, Math.min(25, Math.floor(rawLimit) || 10));

  const rows = db.prepare(`
    SELECT
      s.user_id,
      s.personal_best,
      s.best_streak,
      s.rounds_played,
      s.fastest_cadence,
      s.last_played_at,
      u.username,
      p.character,
      p.nickname,
      p.bond,
      p.mastery_xp,
      p.fullness,
      p.happiness,
      p.last_fed_at,
      p.equipped_hat,
      p.equipped_top,
      p.hat_color,
      p.top_color
    FROM pet_minigame_stats s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN user_pets p ON p.user_id = s.user_id
    WHERE s.game_id = 'mini-pump'
    ORDER BY s.personal_best DESC, s.best_streak DESC, s.fastest_cadence ASC, s.rounds_played DESC, s.last_played_at DESC
    LIMIT ?
  `).all(limit);

  const leaderboard = rows.map((row, index) => {
    const bond = row.bond || 0;
    const masteryXp = row.mastery_xp || 0;
    return {
      rank: index + 1,
      user_id: row.user_id,
      username: row.username || 'Unknown',
      character: row.character || 'dojocat',
      nickname: row.nickname || '',
      personal_best: row.personal_best || 0,
      best_streak: row.best_streak || 0,
      rounds_played: row.rounds_played || 0,
      fastest_cadence: row.fastest_cadence || 1000,
      last_played_at: row.last_played_at || '',
      form: getPetForm(bond, masteryXp),
      bond_rank: getBondRank(bond),
      equipped_hat: row.equipped_hat || '',
      equipped_top: row.equipped_top || '',
      hat_color: row.hat_color || '',
      top_color: row.top_color || '',
      weight_state: getWeightState(computeDecayed(row.fullness, row.last_fed_at, HUNGER_DECAY_PER_HOUR)),
      mood: getMood(
        computeDecayed(row.fullness, row.last_fed_at, HUNGER_DECAY_PER_HOUR),
        computeDecayed(row.happiness || 50, row.last_fed_at, HAPPINESS_DECAY_PER_HOUR),
      ),
      is_me: row.user_id === req.user.id,
    };
  });

  res.json({ leaderboard });
});

// POST /api/pets/minigames/mini-pump/complete — save round results
router.post('/minigames/mini-pump/complete', requireAuth, (req, res) => {
  const db = getDb();
  ensureMinigameTable(db);
  ensurePetTable(db);

  const { score = 0, hits = 0, misses = 0, headBonks = 0, bestStreak = 0, fastestCadenceMs = 1000 } = req.body || {};
  const safeScore = Math.max(0, Math.min(999, Math.floor(Number(score) || 0)));
  const safeStreak = Math.max(0, Math.min(999, Math.floor(Number(bestStreak) || 0)));
  const safeCadence = Math.max(100, Math.min(1000, Math.floor(Number(fastestCadenceMs) || 1000)));

  // Upsert stats
  const existing = db.prepare('SELECT * FROM pet_minigame_stats WHERE user_id = ? AND game_id = ?')
    .get(req.user.id, 'mini-pump');

  if (existing) {
    db.prepare(`
      UPDATE pet_minigame_stats SET
        personal_best = MAX(personal_best, ?),
        best_streak = MAX(best_streak, ?),
        fastest_cadence = MIN(fastest_cadence, ?),
        rounds_played = rounds_played + 1,
        last_played_at = datetime('now')
      WHERE user_id = ? AND game_id = ?
    `).run(safeScore, safeStreak, safeCadence, req.user.id, 'mini-pump');
  } else {
    db.prepare(`
      INSERT INTO pet_minigame_stats (user_id, game_id, personal_best, best_streak, fastest_cadence, rounds_played, last_played_at)
      VALUES (?, 'mini-pump', ?, ?, ?, 1, datetime('now'))
    `).run(req.user.id, safeScore, safeStreak, safeCadence);
  }

  // Play cost + reward
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  let petReward = null;
  let costApplied = null;
  if (pet) {
    const cost = MINIGAME_COST['mini-pump'];
    const vitals = buildPetVitalsSnapshot(pet);
    const curHunger = vitals.hunger;
    const curHappiness = vitals.happiness;
    const curEnergy = vitals.energy;
    const curHype = vitals.momentum;

    // Score-based reward on top of base cost effects
    const happyBump = Math.min(3, Math.max(1, Math.floor(safeScore / 5)));
    const bondBump = Math.min(2, Math.max(0, Math.floor(safeScore / 8)));

    const newHunger = clamp(curHunger + (cost.hunger || 0), 0, MAX_STAT);
    const newHappiness = clamp(curHappiness + (cost.happiness || 0) + happyBump, 0, MAX_STAT);
    const newEnergy = clamp(curEnergy + (cost.energy || 0), 0, MAX_STAT);
    const newHype = clamp(curHype + (cost.hype || 0), 0, MAX_STAT);
    const newBond = Math.max(0, (pet.bond || 0) + bondBump);
    const comboDeduct = Math.min(cost.combo || 0, pet.combo_balance || 0);

    db.prepare(`UPDATE user_pets SET fullness = ?, happiness = ?, energy = ?, hype = ?, bond = ?,
      combo_balance = combo_balance - ?, updated_at = datetime('now')
      WHERE user_id = ?`).run(newHunger, newHappiness, newEnergy, newHype, newBond, comboDeduct, req.user.id);
    petReward = { happiness: happyBump + (cost.happiness || 0), bond: bondBump, momentum: cost.hype || 0 };
    costApplied = { combo: comboDeduct, energy: cost.energy || 0, hunger: cost.hunger || 0, momentum: cost.hype || 0 };
  }

  const updated = db.prepare('SELECT * FROM pet_minigame_stats WHERE user_id = ? AND game_id = ?')
    .get(req.user.id, 'mini-pump');

  res.json({
    personalBest: updated?.personal_best || 0,
    bestStreak: updated?.best_streak || 0,
    roundsPlayed: updated?.rounds_played || 0,
    fastestCadence: updated?.fastest_cadence || 1000,
    petReward,
    costApplied,
  });
});

// ─── Pet Invaders Minigame ──────────────────────────────────────

function ensureInvadersTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pet_invaders_stats (
      user_id TEXT NOT NULL,
      high_score INTEGER NOT NULL DEFAULT 0,
      best_wave INTEGER NOT NULL DEFAULT 0,
      bosses_defeated INTEGER NOT NULL DEFAULT 0,
      total_kills INTEGER NOT NULL DEFAULT 0,
      total_runs INTEGER NOT NULL DEFAULT 0,
      last_played_at TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id)
    )
  `);
}

// GET /api/pets/minigames/pet-invaders — get stats
router.get('/minigames/pet-invaders', requireAuth, (req, res) => {
  const db = getDb();
  ensureInvadersTable(db);
  const row = db.prepare('SELECT * FROM pet_invaders_stats WHERE user_id = ?')
    .get(req.user.id);
  res.json({
    highScore: row?.high_score || 0,
    bestWave: row?.best_wave || 0,
    bossesDefeated: row?.bosses_defeated || 0,
    totalKills: row?.total_kills || 0,
    totalRuns: row?.total_runs || 0,
    lastPlayedAt: row?.last_played_at || '',
  });
});

// POST /api/pets/minigames/pet-invaders/complete — save round results
router.post('/minigames/pet-invaders/complete', requireAuth, (req, res) => {
  const db = getDb();
  ensureInvadersTable(db);
  ensurePetTable(db);

  const { score = 0, kills = 0, bossesDefeated = 0, bestWave = 1 } = req.body || {};
  const safeScore = Math.max(0, Math.min(99999, Math.floor(Number(score) || 0)));
  const safeKills = Math.max(0, Math.min(9999, Math.floor(Number(kills) || 0)));
  const safeBosses = Math.max(0, Math.min(999, Math.floor(Number(bossesDefeated) || 0)));
  const safeWave = Math.max(1, Math.min(999, Math.floor(Number(bestWave) || 1)));

  // Upsert stats
  const existing = db.prepare('SELECT * FROM pet_invaders_stats WHERE user_id = ?')
    .get(req.user.id);

  if (existing) {
    db.prepare(`
      UPDATE pet_invaders_stats SET
        high_score = MAX(high_score, ?),
        best_wave = MAX(best_wave, ?),
        bosses_defeated = bosses_defeated + ?,
        total_kills = total_kills + ?,
        total_runs = total_runs + 1,
        last_played_at = datetime('now')
      WHERE user_id = ?
    `).run(safeScore, safeWave, safeBosses, safeKills, req.user.id);
  } else {
    db.prepare(`
      INSERT INTO pet_invaders_stats (user_id, high_score, best_wave, bosses_defeated, total_kills, total_runs, last_played_at)
      VALUES (?, ?, ?, ?, ?, 1, datetime('now'))
    `).run(req.user.id, safeScore, safeWave, safeBosses, safeKills);
  }

  // Play cost + reward
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(req.user.id);
  let petReward = null;
  let costApplied = null;
  if (pet) {
    const cost = MINIGAME_COST['pet-invaders'];
    const vitals = buildPetVitalsSnapshot(pet);
    const curHunger = vitals.hunger;
    const curHappiness = vitals.happiness;
    const curEnergy = vitals.energy;
    const curHype = vitals.momentum;

    const happyBump = Math.min(4, Math.max(1, Math.floor(safeScore / 50)));
    const bondBump = Math.min(3, Math.max(0, Math.floor(safeScore / 100)));

    const newHunger = clamp(curHunger + (cost.hunger || 0), 0, MAX_STAT);
    const newHappiness = clamp(curHappiness + (cost.happiness || 0) + happyBump, 0, MAX_STAT);
    const newEnergy = clamp(curEnergy + (cost.energy || 0), 0, MAX_STAT);
    const newHype = clamp(curHype + (cost.hype || 0), 0, MAX_STAT);
    const newBond = Math.max(0, (pet.bond || 0) + bondBump);
    const comboDeduct = Math.min(cost.combo || 0, pet.combo_balance || 0);

    db.prepare(`UPDATE user_pets SET fullness = ?, happiness = ?, energy = ?, hype = ?, bond = ?,
      combo_balance = combo_balance - ?, updated_at = datetime('now')
      WHERE user_id = ?`).run(newHunger, newHappiness, newEnergy, newHype, newBond, comboDeduct, req.user.id);
    petReward = { happiness: happyBump + (cost.happiness || 0), bond: bondBump, momentum: cost.hype || 0 };
    costApplied = { combo: comboDeduct, energy: cost.energy || 0, hunger: cost.hunger || 0, momentum: cost.hype || 0 };
  }

  const updated = db.prepare('SELECT * FROM pet_invaders_stats WHERE user_id = ?')
    .get(req.user.id);

  res.json({
    highScore: updated?.high_score || 0,
    bestWave: updated?.best_wave || 0,
    bossesDefeated: updated?.bosses_defeated || 0,
    totalKills: updated?.total_kills || 0,
    totalRuns: updated?.total_runs || 0,
    petReward,
    costApplied,
  });
});

// GET /api/pets/minigames/pet-invaders/leaderboard — community bests
router.get('/minigames/pet-invaders/leaderboard', requireAuth, (req, res) => {
  const db = getDb();
  ensureInvadersTable(db);
  ensurePetTable(db);

  const rawLimit = Number(req.query.limit || 10);
  const limit = Math.max(3, Math.min(25, Math.floor(rawLimit) || 10));

  const rows = db.prepare(`
    SELECT
      s.user_id,
      s.high_score,
      s.best_wave,
      s.bosses_defeated,
      s.total_kills,
      s.total_runs,
      s.last_played_at,
      u.username,
      p.character,
      p.nickname,
      p.bond,
      p.mastery_xp,
      p.fullness,
      p.happiness,
      p.last_fed_at,
      p.equipped_hat,
      p.equipped_top,
      p.hat_color,
      p.top_color
    FROM pet_invaders_stats s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN user_pets p ON p.user_id = s.user_id
    WHERE s.high_score > 0
    ORDER BY s.high_score DESC, s.best_wave DESC, s.bosses_defeated DESC, s.total_kills DESC
    LIMIT ?
  `).all(limit);

  const leaderboard = rows.map((row, index) => {
    const bond = row.bond || 0;
    const masteryXp = row.mastery_xp || 0;
    return {
      rank: index + 1,
      user_id: row.user_id,
      username: row.username || 'Unknown',
      character: row.character || 'dojocat',
      nickname: row.nickname || '',
      high_score: row.high_score || 0,
      best_wave: row.best_wave || 0,
      bosses_defeated: row.bosses_defeated || 0,
      total_kills: row.total_kills || 0,
      total_runs: row.total_runs || 0,
      form: getPetForm(bond, masteryXp),
      bond_rank: getBondRank(bond),
      equipped_hat: row.equipped_hat || '',
      equipped_top: row.equipped_top || '',
      hat_color: row.hat_color || '',
      top_color: row.top_color || '',
      weight_state: getWeightState(computeDecayed(row.fullness, row.last_fed_at, HUNGER_DECAY_PER_HOUR)),
      mood: getMood(
        computeDecayed(row.fullness, row.last_fed_at, HUNGER_DECAY_PER_HOUR),
        computeDecayed(row.happiness || 50, row.last_fed_at, HAPPINESS_DECAY_PER_HOUR),
      ),
      is_me: row.user_id === req.user.id,
    };
  });

  res.json({ leaderboard });
});

// GET /api/pets/minigames/cost — return play costs for UI display
router.get('/minigames/cost', requireAuth, (_req, res) => {
  res.json(MINIGAME_COST);
});

module.exports = router;
module.exports.VALID_CHARACTERS = VALID_CHARACTERS;

// ─── Called from piugame sync ─────────────────────────────────────
module.exports.feedPetForUser = function feedPetForUser(userId, playsOrCount) {
  const db = getDb();
  ensurePetTable(db);
  const pet = db.prepare('SELECT * FROM user_pets WHERE user_id = ?').get(userId);
  if (!pet) return null;

  let totalHunger = 0;
  let totalHappiness = 0;
  let totalXp = 0;
  let totalCombo = 0;
  let totalBond = 0;
  let totalTrust = 0;
  let totalHype = 0;
  let totalEnergy = 0;
  let totalMastery = 0;
  let highestLevel = pet.highest_level || 0;
  let songCount = 0;
  let trickDemandMet = false;
  const activePath = pet.active_training_path || 'consistency';

  if (Array.isArray(playsOrCount)) {
    for (const play of playsOrCount) {
      const score = parseInt(play.score, 10) || 0;
      const rawGrade = normalizeGrade(play.grade) || (score > 0 ? gradeFromScore(score) : 'F');
      const level = parseInt(play.level, 10) || 0;
      const isReplay = !!(String(play.replay_embed_url || '').trim() || String(play.replay_video_id || '').trim());
      const isDouble = String(play.mode || '').startsWith('Double');
      const reward = GRADE_SYNC_REWARD_TABLE[rawGrade] || GRADE_SYNC_REWARD_TABLE.F;

      if (level > highestLevel) highestLevel = level;

      totalHunger += reward.hunger || 0;
      totalXp += (reward.xp || 0) + levelXpBonus(level);
      totalCombo += (GRADE_COMBO[rawGrade] || 0) + levelComboBonus(level);
      totalBond += 1 + (level >= 18 ? 1 : 0) + (GRADE_INDEX[rawGrade] >= GRADE_INDEX.AAA ? 1 : 0);
      totalTrust += (reward.trust || 0) + (isDouble ? 1 : 0);
      totalHype += (reward.momentum || 0) + (isReplay ? 1 : 0) + (level >= 20 ? 1 : 0);
      totalEnergy += reward.energy || 0;
      totalMastery += getPathMasteryGain(activePath, play);
      songCount++;

      if (pet.pending_trick && !trickDemandMet) {
        const minIdx = GRADE_ORDER.indexOf(pet.trick_demand_grade || 'A');
        if (level >= (pet.trick_demand_level || 0) && GRADE_ORDER.indexOf(rawGrade) >= minIdx) {
          trickDemandMet = true;
        }
      }
    }
  } else {
    songCount = Math.max(1, Math.min(10, parseInt(playsOrCount, 10) || 1));
    totalHunger = -songCount;
    totalXp = songCount * 6;
    totalCombo = songCount * 2;
    totalBond = Math.max(1, Math.floor(songCount * 0.75));
    totalTrust = Math.max(0, Math.floor(songCount / 3));
    totalHype = songCount * 2;
    totalEnergy = -Math.max(1, Math.floor(songCount / 2));
    totalMastery = songCount * (activePath === 'consistency' ? 2 : 1);
  }

  if (activePath === 'consistency' && songCount >= 5) totalMastery += 4;
  if (activePath === 'tournament' && highestLevel >= 20) totalMastery += 3;

  const vitals = buildPetVitalsSnapshot(pet);
  const curHunger = vitals.hunger;
  const curHappiness = vitals.happiness;
  const curEnergy = vitals.energy;
  const curHype = vitals.momentum;
  const curTrust = vitals.trust;
  const newHunger = clamp(curHunger + totalHunger, 0, MAX_STAT);
  let newHappiness = clamp(curHappiness + totalHappiness, 0, MAX_STAT);
  const newEnergy = clamp(curEnergy + totalEnergy, 0, MAX_STAT);
  let newHype = clamp(curHype + totalHype, 0, MAX_STAT);
  let newBond = Math.max(0, (pet.bond || 0) + totalBond);
  let newTrust = clamp(curTrust + totalTrust, 0, MAX_STAT);

  if (trickDemandMet) {
    const charTricks = TRICKS[pet.character] || [];
    const trick = charTricks.find(t => t.id === pet.pending_trick);
    const bonusCombo = trick?.comboReward || 10;
    const bonusHappy = trick?.happinessReward || 5;
    newHappiness = clamp(newHappiness + bonusHappy, 0, MAX_STAT);
    newBond += 6;
    newTrust = clamp(newTrust + 4, 0, MAX_STAT);
    newHype = clamp(newHype + 8, 0, MAX_STAT);
    db.prepare(`
      UPDATE user_pets
      SET fullness = ?, happiness = ?, total_songs_fed = total_songs_fed + ?,
          energy = ?, hype = ?, bond = ?, trust = ?,
          experience = experience + ?, combo_balance = combo_balance + ?,
          mastery_xp = mastery_xp + ?,
          highest_level = MAX(highest_level, ?),
          last_pump_play_at = datetime('now'), updated_at = datetime('now'),
          last_trick_performed = pending_trick, last_trick_at = datetime('now'),
          pending_trick = '', trick_demand_level = 0, trick_demand_grade = '', trick_demand_expires = ''
      WHERE user_id = ?
    `).run(newHunger, newHappiness, songCount, newEnergy, newHype, newBond, newTrust, totalXp + 25, totalCombo + bonusCombo, totalMastery + 5, highestLevel, userId);
  } else {
    db.prepare(`
      UPDATE user_pets
      SET fullness = ?, happiness = ?, total_songs_fed = total_songs_fed + ?,
          energy = ?, hype = ?, bond = ?, trust = ?,
          experience = experience + ?, combo_balance = combo_balance + ?,
          mastery_xp = mastery_xp + ?,
          highest_level = MAX(highest_level, ?),
          last_pump_play_at = datetime('now'), updated_at = datetime('now')
      WHERE user_id = ?
    `).run(newHunger, newHappiness, songCount, newEnergy, newHype, newBond, newTrust, totalXp, totalCombo, totalMastery, highestLevel, userId);
  }

  return {
    fed: songCount,
    hunger: totalHunger,
    happiness: totalHappiness,
    xp: totalXp,
    combo: totalCombo,
    bond: totalBond,
    trust: totalTrust,
    momentum: totalHype,
    hype: totalHype,
    energy: totalEnergy,
    mastery: totalMastery,
    trickDemandMet,
  };
};

module.exports._test = {
  getEnergyRecoveryRate,
  getEnergyStateValue,
  getMomentumStateValue,
  getTrustStateValue,
  getMoodState,
  getWellbeingRewardMultiplier,
  buildPetVitalsSnapshot,
  buildPetNeeds,
  getRecommendedActions,
  buildPetRequestTemplate,
  getCurrentPetRequest,
  isPetRequestSatisfied,
  formatPetStatLabel,
};
