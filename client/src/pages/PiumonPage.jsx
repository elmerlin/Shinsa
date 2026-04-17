import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import piuAvatarCatalog from '../data/piuAvatarCatalog.json';

const TOTAL_SUPPLY_DEFAULT = 1000;
const SOURCE_URL = 'https://piugame.com/my_page/avatar_shop.php';

const CUSTOM_HEROES = [
  {
    id: 'hero-dojocat',
    name: 'Dojocat',
    preview: '/piumon-assets/bodies/hero-dojocat.png',
    source: 'Approved Hero · Complete Look',
    sourceNote: 'Shinsa mascot · 128px pro-quality concept regeneration · red dojo headband, white chicken hood, gold STOMP medallion chain, cream gi',
    generationStatus: 'Approved',
    weight: 6,
    lockedName: true,
    characterGroups: ['Dojocat'],
    rarity: 'epic',
    accent: 'dojo-tabby',
    accentGradient: 'from-orange-300 via-amber-500 to-red-600',
    accentBorder: 'border-orange-400/60',
    accentShadow: 'shadow-[0_0_18px_-6px_rgba(251,146,60,0.5)]',
  },
  {
    id: 'hero-dojocat-hood',
    name: 'Dojocat · Chicken Hood',
    preview: '/piumon-assets/bodies/hero-dojocat-hood.png',
    source: 'Legendary · Complete Look',
    sourceNote: 'Dojocat wearing the iconic white chicken hood with small red comb',
    generationStatus: 'Legendary',
    weight: 3,
    lockedName: true,
    characterGroups: ['Dojocat'],
    rarity: 'legendary',
    accent: 'dojo-hood',
    accentGradient: 'from-white via-orange-200 to-red-500',
    accentBorder: 'border-orange-300/60',
    accentShadow: 'shadow-[0_0_20px_-6px_rgba(248,113,113,0.55)]',
  },
  {
    id: 'hero-dojocat-hood-alpha',
    name: 'Dojocat · Alpha Mohawk Hood',
    preview: '/piumon-assets/bodies/hero-dojocat-hood-alpha.png',
    source: 'Unique · Complete Look',
    sourceNote: 'Dojocat crowned with the alpha chicken hood — massive dramatic red mohawk signals dominance',
    generationStatus: 'Unique',
    weight: 1,
    lockedName: true,
    characterGroups: ['Dojocat'],
    rarity: 'unique',
    accent: 'dojo-alpha',
    accentGradient: 'from-red-400 via-red-600 to-rose-700',
    accentBorder: 'border-red-400/70',
    accentShadow: 'shadow-[0_0_22px_-6px_rgba(239,68,68,0.65)]',
  },
  {
    id: 'hero-dojocat-chain-silver',
    name: 'Dojocat · Silver STOMP Chain',
    preview: '/piumon-assets/bodies/hero-dojocat-chain-silver.png',
    source: 'Legendary · Complete Look',
    sourceNote: 'Dojocat flexing the silver STOMP chain — entry tier of the iconic medallion',
    generationStatus: 'Legendary',
    weight: 3,
    lockedName: true,
    characterGroups: ['Dojocat'],
    rarity: 'legendary',
    accent: 'dojo-silver',
    accentGradient: 'from-slate-200 via-zinc-300 to-slate-500',
    accentBorder: 'border-slate-300/60',
    accentShadow: 'shadow-[0_0_20px_-6px_rgba(148,163,184,0.6)]',
  },
  {
    id: 'hero-dojocat-chain-gold',
    name: 'Dojocat · Gold STOMP Chain',
    preview: '/piumon-assets/bodies/hero-dojocat-chain-gold.png',
    source: 'Legendary · Complete Look',
    sourceNote: 'Dojocat flexing the golden STOMP chain — the signature champion medallion',
    generationStatus: 'Legendary',
    weight: 2,
    lockedName: true,
    characterGroups: ['Dojocat'],
    rarity: 'legendary',
    accent: 'dojo-gold',
    accentGradient: 'from-amber-200 via-yellow-400 to-amber-600',
    accentBorder: 'border-amber-300/70',
    accentShadow: 'shadow-[0_0_22px_-6px_rgba(251,191,36,0.6)]',
  },
  {
    id: 'hero-dojocat-chain-diamond',
    name: 'Dojocat · Diamond STOMP Chain',
    preview: '/piumon-assets/bodies/hero-dojocat-chain-diamond.png',
    source: 'Unique · Complete Look',
    sourceNote: 'Dojocat flexing the diamond-encrusted STOMP medallion — blinding sparkle, top of the pyramid',
    generationStatus: 'Unique',
    weight: 1,
    lockedName: true,
    characterGroups: ['Dojocat'],
    rarity: 'unique',
    accent: 'dojo-diamond',
    accentGradient: 'from-white via-cyan-200 to-sky-400',
    accentBorder: 'border-cyan-300/70',
    accentShadow: 'shadow-[0_0_24px_-6px_rgba(103,232,249,0.7)]',
  },
  {
    id: 'hero-dojocat-apex',
    name: 'Dojocat · Apex King',
    preview: '/piumon-assets/bodies/hero-dojocat-apex.png',
    source: 'Unique · Complete Look',
    sourceNote: 'Apex Dojocat · alpha mohawk hood + diamond STOMP medallion · maximum rarity',
    generationStatus: 'Unique',
    weight: 1,
    lockedName: true,
    characterGroups: ['Dojocat'],
    rarity: 'unique',
    accent: 'dojo-apex',
    accentGradient: 'from-amber-200 via-red-500 to-fuchsia-600',
    accentBorder: 'border-amber-300/70',
    accentShadow: 'shadow-[0_0_26px_-6px_rgba(251,113,133,0.7)]',
  },
  {
    id: 'hero-buu',
    name: 'Buu',
    preview: '/piumon-assets/bodies/hero-buu.png',
    source: 'Approved Hero · Complete Look',
    sourceNote: 'Shinsa mascot · 128px pro-quality concept regeneration · chicken hood with red comb, yellow gi robe, gold STOMP medallion chain',
    generationStatus: 'Approved',
    weight: 6,
    lockedName: true,
    characterGroups: ['Buu'],
    rarity: 'epic',
    accent: 'buu-bubble',
    accentGradient: 'from-pink-300 via-rose-400 to-fuchsia-500',
    accentBorder: 'border-pink-300/60',
    accentShadow: 'shadow-[0_0_18px_-6px_rgba(244,114,182,0.5)]',
  },
  {
    id: 'hero-buu-hood',
    name: 'Buu · Chicken Hood',
    preview: '/piumon-assets/bodies/hero-buu-hood.png',
    source: 'Legendary · Complete Look',
    sourceNote: 'Buu crowned with the iconic white chicken hood — pink blob energy meets dojo tradition',
    generationStatus: 'Legendary',
    weight: 3,
    lockedName: true,
    characterGroups: ['Buu'],
    rarity: 'legendary',
    accent: 'buu-hood',
    accentGradient: 'from-white via-pink-200 to-rose-500',
    accentBorder: 'border-rose-300/60',
    accentShadow: 'shadow-[0_0_20px_-6px_rgba(251,113,133,0.55)]',
  },
  {
    id: 'hero-buu-hood-alpha',
    name: 'Buu · Alpha Mohawk Hood',
    preview: '/piumon-assets/bodies/hero-buu-hood-alpha.png',
    source: 'Unique · Complete Look',
    sourceNote: 'Buu sporting the alpha chicken hood — dramatic red mohawk signals top-of-pack',
    generationStatus: 'Unique',
    weight: 1,
    lockedName: true,
    characterGroups: ['Buu'],
    rarity: 'unique',
    accent: 'buu-alpha',
    accentGradient: 'from-rose-400 via-red-500 to-fuchsia-600',
    accentBorder: 'border-red-400/70',
    accentShadow: 'shadow-[0_0_22px_-6px_rgba(244,63,94,0.65)]',
  },
  {
    id: 'hero-buu-apex',
    name: 'Buu · Champion Apex',
    preview: '/piumon-assets/bodies/hero-buu-apex.png',
    source: 'Unique · Complete Look',
    sourceNote: 'Apex Buu · alpha mohawk hood + champion belt medallion · maximum rarity',
    generationStatus: 'Unique',
    weight: 1,
    lockedName: true,
    characterGroups: ['Buu'],
    rarity: 'unique',
    accent: 'buu-apex',
    accentGradient: 'from-amber-200 via-rose-500 to-fuchsia-600',
    accentBorder: 'border-amber-300/70',
    accentShadow: 'shadow-[0_0_26px_-6px_rgba(251,113,133,0.7)]',
  },
  {
    id: 'hero-devit',
    name: 'Devit',
    preview: '/piumon-assets/bodies/hero-devit.png',
    source: 'Approved Hero · Complete Look',
    sourceNote: 'Shinsa mascot · PixelLab concept regeneration · cute baby imp with red horns',
    generationStatus: 'Approved',
    weight: 6,
    lockedName: true,
    characterGroups: ['Devit'],
    rarity: 'epic',
    accent: 'devit-imp',
    accentGradient: 'from-white via-rose-200 to-red-500',
    accentBorder: 'border-red-300/60',
    accentShadow: 'shadow-[0_0_18px_-6px_rgba(248,113,113,0.5)]',
  },
  {
    id: 'hero-devit-trident',
    name: 'Devit · Infernal Trident',
    preview: '/piumon-assets/bodies/hero-devit-trident.png',
    source: 'Legendary · Complete Look',
    sourceNote: 'Devit wielding the red infernal trident — signature mischief weapon',
    generationStatus: 'Legendary',
    weight: 3,
    lockedName: true,
    characterGroups: ['Devit'],
    rarity: 'legendary',
    accent: 'devit-trident',
    accentGradient: 'from-red-300 via-red-500 to-rose-700',
    accentBorder: 'border-red-400/60',
    accentShadow: 'shadow-[0_0_20px_-6px_rgba(239,68,68,0.6)]',
  },
  {
    id: 'hero-devit-crown-horns',
    name: 'Devit · Crowned Alpha Horns',
    preview: '/piumon-assets/bodies/hero-devit-crown-horns.png',
    source: 'Unique · Complete Look',
    sourceNote: 'Devit with oversized alpha horns under a golden crown — royal imp energy',
    generationStatus: 'Unique',
    weight: 1,
    lockedName: true,
    characterGroups: ['Devit'],
    rarity: 'unique',
    accent: 'devit-crown',
    accentGradient: 'from-amber-200 via-red-400 to-rose-600',
    accentBorder: 'border-amber-300/70',
    accentShadow: 'shadow-[0_0_22px_-6px_rgba(251,191,36,0.65)]',
  },
  {
    id: 'hero-devit-infernal',
    name: 'Devit · Infernal Sovereign',
    preview: '/piumon-assets/bodies/hero-devit-infernal.png',
    source: 'Unique · Complete Look',
    sourceNote: 'Apex Devit · alpha horns + golden crown + trident + infernal cape · maximum rarity',
    generationStatus: 'Unique',
    weight: 1,
    lockedName: true,
    characterGroups: ['Devit'],
    rarity: 'unique',
    accent: 'devit-sovereign',
    accentGradient: 'from-amber-200 via-red-600 to-rose-900',
    accentBorder: 'border-amber-300/70',
    accentShadow: 'shadow-[0_0_26px_-6px_rgba(220,38,38,0.7)]',
  },
  {
    id: 'hero-pixiu',
    name: 'Pixiu',
    preview: '/piumon-assets/bodies/hero-pixiu.png',
    source: 'Approved Hero · Complete Look',
    sourceNote: 'Shinsa mascot · PixelLab concept regeneration · fluffy white cat-creature',
    generationStatus: 'Approved',
    weight: 6,
    lockedName: true,
    characterGroups: ['Pixiu'],
    rarity: 'epic',
    accent: 'pixiu-frost',
    accentGradient: 'from-white via-sky-200 to-indigo-400',
    accentBorder: 'border-sky-300/60',
    accentShadow: 'shadow-[0_0_18px_-6px_rgba(125,211,252,0.5)]',
  },
  {
    id: 'hero-pixiu-ice-crown',
    name: 'Pixiu · Ice Crown',
    preview: '/piumon-assets/bodies/hero-pixiu-ice-crown.png',
    source: 'Legendary · Complete Look',
    sourceNote: 'Pixiu adorned with the snowflake ice crown — frost sovereign entry tier',
    generationStatus: 'Legendary',
    weight: 3,
    lockedName: true,
    characterGroups: ['Pixiu'],
    rarity: 'legendary',
    accent: 'pixiu-ice',
    accentGradient: 'from-white via-cyan-200 to-sky-500',
    accentBorder: 'border-cyan-300/60',
    accentShadow: 'shadow-[0_0_20px_-6px_rgba(103,232,249,0.6)]',
  },
  {
    id: 'hero-pixiu-imperial',
    name: 'Pixiu · Imperial Robe',
    preview: '/piumon-assets/bodies/hero-pixiu-imperial.png',
    source: 'Unique · Complete Look',
    sourceNote: 'Pixiu draped in the blue/white imperial snowflake robe — regal frost bearing',
    generationStatus: 'Unique',
    weight: 1,
    lockedName: true,
    characterGroups: ['Pixiu'],
    rarity: 'unique',
    accent: 'pixiu-imperial',
    accentGradient: 'from-sky-200 via-indigo-400 to-blue-700',
    accentBorder: 'border-indigo-300/70',
    accentShadow: 'shadow-[0_0_22px_-6px_rgba(99,102,241,0.65)]',
  },
  {
    id: 'hero-pixiu-celestial',
    name: 'Pixiu · Celestial Moon',
    preview: '/piumon-assets/bodies/hero-pixiu-celestial.png',
    source: 'Unique · Complete Look',
    sourceNote: 'Apex Pixiu · ice crown + imperial robe + bat wings + moon medallion · maximum rarity',
    generationStatus: 'Unique',
    weight: 1,
    lockedName: true,
    characterGroups: ['Pixiu'],
    rarity: 'unique',
    accent: 'pixiu-celestial',
    accentGradient: 'from-white via-indigo-300 to-violet-700',
    accentBorder: 'border-violet-300/70',
    accentShadow: 'shadow-[0_0_26px_-6px_rgba(139,92,246,0.7)]',
  },
  {
    id: 'hero-arcade-regular',
    name: 'Arcade Regular',
    preview: '/piumon-assets/bodies/hero-arcade-regular.png',
    source: 'Common · Complete Look',
    sourceNote: 'Common-tier chibi · turquoise cap, black hoodie, gaming headphones',
    generationStatus: 'Common',
    weight: 14,
    lockedName: true,
    characterGroups: ['Commons'],
    rarity: 'common',
  },
  {
    id: 'hero-neon-dancer',
    name: 'Neon Dancer',
    preview: '/piumon-assets/bodies/hero-neon-dancer.png',
    source: 'Common · Complete Look',
    sourceNote: 'Common-tier chibi · magenta LED-trim jacket, neon pink shorts',
    generationStatus: 'Common',
    weight: 14,
    lockedName: true,
    characterGroups: ['Commons'],
    rarity: 'common',
  },
  {
    id: 'hero-street-rival',
    name: 'Street Rival',
    preview: '/piumon-assets/bodies/hero-street-rival.png',
    source: 'Common · Complete Look',
    sourceNote: 'Common-tier chibi · black bomber over red tee, backwards snapback',
    generationStatus: 'Common',
    weight: 14,
    lockedName: true,
    characterGroups: ['Commons'],
    rarity: 'common',
  },
  {
    id: 'hero-festival-guest',
    name: 'Festival Guest',
    preview: '/piumon-assets/bodies/hero-festival-guest.png',
    source: 'Common · Complete Look',
    sourceNote: 'Common-tier chibi · yellow tank, denim shorts, flower crown',
    generationStatus: 'Common',
    weight: 14,
    lockedName: true,
    characterGroups: ['Commons'],
    rarity: 'common',
  },
  {
    id: 'hero-rookie-stepper',
    name: 'Rookie Stepper',
    preview: '/piumon-assets/bodies/hero-rookie-stepper.png',
    source: 'Common · Complete Look',
    sourceNote: 'Common-tier chibi · plain white tee and shorts, fresh sneakers',
    generationStatus: 'Common',
    weight: 14,
    lockedName: true,
    characterGroups: ['Commons'],
    rarity: 'common',
  },
  {
    id: 'hero-night-owl',
    name: 'Night Owl',
    preview: '/piumon-assets/bodies/hero-night-owl.png',
    source: 'Common · Complete Look',
    sourceNote: 'Common-tier chibi · deep purple hood, glowing yellow eyes',
    generationStatus: 'Common',
    weight: 14,
    lockedName: true,
    characterGroups: ['Commons'],
    rarity: 'common',
  },
  {
    id: 'hero-legendary-celestial-monk',
    name: 'Celestial Monk',
    preview: '/piumon-assets/bodies/hero-legendary-celestial-monk.png',
    source: 'Legendary · Complete Look',
    sourceNote: 'Legendary-tier chibi · white and gold holy robe with floating halo fragments',
    generationStatus: 'Legendary',
    weight: 2,
    lockedName: true,
    characterGroups: ['Legendaries'],
    rarity: 'legendary',
    accent: 'celestial-gold',
    accentGradient: 'from-amber-100 via-yellow-300 to-amber-500',
    accentBorder: 'border-amber-300/60',
    accentShadow: 'shadow-[0_0_20px_-6px_rgba(252,211,77,0.55)]',
  },
  {
    id: 'hero-legendary-shadow-diplomat',
    name: 'Shadow Diplomat',
    preview: '/piumon-assets/bodies/hero-legendary-shadow-diplomat.png',
    source: 'Legendary · Complete Look',
    sourceNote: 'Legendary-tier chibi · black tuxedo with crimson silk lining and ornate mask',
    generationStatus: 'Legendary',
    weight: 2,
    lockedName: true,
    characterGroups: ['Legendaries'],
    rarity: 'legendary',
    accent: 'shadow-crimson',
    accentGradient: 'from-neutral-700 via-red-700 to-black',
    accentBorder: 'border-red-500/60',
    accentShadow: 'shadow-[0_0_20px_-6px_rgba(220,38,38,0.55)]',
  },
  {
    id: 'hero-legendary-prismatic-duelist',
    name: 'Prismatic Duelist',
    preview: '/piumon-assets/bodies/hero-legendary-prismatic-duelist.png',
    source: 'Legendary · Complete Look',
    sourceNote: 'Legendary-tier chibi · iridescent mirror armor with holographic rapier',
    generationStatus: 'Legendary',
    weight: 3,
    lockedName: true,
    characterGroups: ['Legendaries'],
    rarity: 'legendary',
    accent: 'prismatic-iris',
    accentGradient: 'from-rose-300 via-sky-300 to-emerald-300',
    accentBorder: 'border-sky-300/60',
    accentShadow: 'shadow-[0_0_20px_-6px_rgba(125,211,252,0.55)]',
  },
  {
    id: 'hero-epic-thunder-chaser',
    name: 'Thunder Chaser',
    preview: '/piumon-assets/bodies/hero-epic-thunder-chaser.png',
    source: 'Epic · Complete Look',
    sourceNote: 'Epic-tier chibi · yellow jumpsuit with electric blue lightning accents, aviator goggles',
    generationStatus: 'Epic',
    weight: 5,
    lockedName: true,
    characterGroups: ['Epics'],
    rarity: 'epic',
    accent: 'thunder-bolt',
    accentGradient: 'from-yellow-300 via-amber-400 to-sky-500',
    accentBorder: 'border-yellow-300/60',
    accentShadow: 'shadow-[0_0_18px_-6px_rgba(250,204,21,0.5)]',
  },
  {
    id: 'hero-epic-carnival-trickster',
    name: 'Carnival Trickster',
    preview: '/piumon-assets/bodies/hero-epic-carnival-trickster.png',
    source: 'Epic · Complete Look',
    sourceNote: 'Epic-tier chibi · red and white striped tailcoat, top hat, painted smile',
    generationStatus: 'Epic',
    weight: 5,
    lockedName: true,
    characterGroups: ['Epics'],
    rarity: 'epic',
    accent: 'carnival-stripe',
    accentGradient: 'from-red-400 via-white to-red-500',
    accentBorder: 'border-red-400/60',
    accentShadow: 'shadow-[0_0_18px_-6px_rgba(248,113,113,0.5)]',
  },
  {
    id: 'hero-epic-deep-sea-explorer',
    name: 'Deep Sea Explorer',
    preview: '/piumon-assets/bodies/hero-epic-deep-sea-explorer.png',
    source: 'Epic · Complete Look',
    sourceNote: 'Epic-tier chibi · brass diving suit, porthole helmet with teal glowing glass',
    generationStatus: 'Epic',
    weight: 6,
    lockedName: true,
    characterGroups: ['Epics'],
    rarity: 'epic',
    accent: 'abyss-brass',
    accentGradient: 'from-amber-500 via-teal-400 to-cyan-700',
    accentBorder: 'border-teal-300/60',
    accentShadow: 'shadow-[0_0_18px_-6px_rgba(45,212,191,0.5)]',
  },
  {
    id: 'hero-epic-cyber-monk',
    name: 'Cyber Monk',
    preview: '/piumon-assets/bodies/hero-epic-cyber-monk.png',
    source: 'Epic · Complete Look',
    sourceNote: 'Epic-tier chibi · gray hooded robe with neon green circuit patterns, data visor',
    generationStatus: 'Epic',
    weight: 6,
    lockedName: true,
    characterGroups: ['Epics'],
    rarity: 'epic',
    accent: 'cyber-circuit',
    accentGradient: 'from-slate-500 via-emerald-400 to-lime-300',
    accentBorder: 'border-emerald-300/60',
    accentShadow: 'shadow-[0_0_18px_-6px_rgba(52,211,153,0.5)]',
  },
  {
    id: 'hero-rare-pyro-ranger',
    name: 'Pyro Ranger',
    preview: '/piumon-assets/bodies/hero-rare-pyro-ranger.png',
    source: 'Rare · Complete Look',
    sourceNote: 'Rare-tier chibi · red leather jacket with flame pattern details, heat-resistant goggles',
    generationStatus: 'Rare',
    weight: 9,
    lockedName: true,
    characterGroups: ['Rares'],
    rarity: 'rare',
  },
  {
    id: 'hero-rare-frost-scout',
    name: 'Frost Scout',
    preview: '/piumon-assets/bodies/hero-rare-frost-scout.png',
    source: 'Rare · Complete Look',
    sourceNote: 'Rare-tier chibi · navy parka with white fur trim, icy crystal-topped staff',
    generationStatus: 'Rare',
    weight: 9,
    lockedName: true,
    characterGroups: ['Rares'],
    rarity: 'rare',
  },
  {
    id: 'hero-rare-urban-sprinter',
    name: 'Urban Sprinter',
    preview: '/piumon-assets/bodies/hero-rare-urban-sprinter.png',
    source: 'Rare · Complete Look',
    sourceNote: 'Rare-tier chibi · sleek black tracksuit with cyan racing stripes',
    generationStatus: 'Rare',
    weight: 10,
    lockedName: true,
    characterGroups: ['Rares'],
    rarity: 'rare',
  },
  {
    id: 'hero-special-obsidian-prism',
    name: 'Obsidian Prism',
    preview: '/piumon-assets/bodies/hero-special-obsidian-prism.png',
    source: 'Special · Complete Look',
    sourceNote: 'Unique complete-look special · jet-black chibi with iridescent holographic highlights',
    generationStatus: 'Path A Pilot',
    weight: 1,
    lockedName: true,
    characterGroups: ['Specials'],
    special: true,
    rarity: 'unique',
    accent: 'holo-black',
    accentGradient: 'from-fuchsia-400 via-cyan-400 to-emerald-400',
    accentBorder: 'border-fuchsia-400/60',
    accentShadow: 'shadow-[0_0_24px_-6px_rgba(217,70,239,0.55)]',
  },
  {
    id: 'hero-special-void-archon',
    name: 'Void Archon',
    preview: '/piumon-assets/bodies/hero-special-void-archon.png',
    source: 'Special · Complete Look',
    sourceNote: 'Unique complete-look special · indigo robe with gold constellations and phoenix-flame crown',
    generationStatus: 'Path A Pilot',
    weight: 1,
    lockedName: true,
    characterGroups: ['Specials'],
    special: true,
    rarity: 'unique',
    accent: 'void-indigo',
    accentGradient: 'from-indigo-400 via-violet-500 to-amber-300',
    accentBorder: 'border-violet-400/60',
    accentShadow: 'shadow-[0_0_24px_-6px_rgba(167,139,250,0.55)]',
  },
  {
    id: 'hero-special-solar-emperor',
    name: 'Solar Emperor',
    preview: '/piumon-assets/bodies/hero-special-solar-emperor.png',
    source: 'Special · Complete Look',
    sourceNote: 'Unique complete-look special · radiant gold chibi with sunburst halo crown and flame cape',
    generationStatus: 'Path A Pilot',
    weight: 1,
    lockedName: true,
    characterGroups: ['Specials'],
    special: true,
    rarity: 'unique',
    accent: 'solar-gold',
    accentGradient: 'from-amber-300 via-orange-500 to-rose-500',
    accentBorder: 'border-orange-400/60',
    accentShadow: 'shadow-[0_0_24px_-6px_rgba(251,146,60,0.55)]',
  },
  {
    id: 'hero-special-frost-oracle',
    name: 'Frost Oracle',
    preview: '/piumon-assets/bodies/hero-special-frost-oracle.png',
    source: 'Special · Complete Look',
    sourceNote: 'Unique complete-look special · icy cyan seer draped in frost-silk robes and crystal circlet',
    generationStatus: 'Path A Pilot',
    weight: 1,
    lockedName: true,
    characterGroups: ['Specials'],
    special: true,
    rarity: 'unique',
    accent: 'frost-cyan',
    accentGradient: 'from-sky-300 via-cyan-400 to-indigo-400',
    accentBorder: 'border-cyan-300/60',
    accentShadow: 'shadow-[0_0_24px_-6px_rgba(103,232,249,0.55)]',
  },
  {
    id: 'hero-special-verdant-sage',
    name: 'Verdant Sage',
    preview: '/piumon-assets/bodies/hero-special-verdant-sage.png',
    source: 'Special · Complete Look',
    sourceNote: 'Unique complete-look special · emerald druid wrapped in vines with glowing leaf crown',
    generationStatus: 'Path A Pilot',
    weight: 1,
    lockedName: true,
    characterGroups: ['Specials'],
    special: true,
    rarity: 'unique',
    accent: 'verdant-green',
    accentGradient: 'from-lime-300 via-emerald-400 to-green-600',
    accentBorder: 'border-emerald-400/60',
    accentShadow: 'shadow-[0_0_24px_-6px_rgba(52,211,153,0.55)]',
  },
  {
    id: 'hero-special-tidal-warden',
    name: 'Tidal Warden',
    preview: '/piumon-assets/bodies/hero-special-tidal-warden.png',
    source: 'Special · Complete Look',
    sourceNote: 'Unique complete-look special · cobalt guardian in coral-plated armor with trident halo',
    generationStatus: 'Path A Pilot',
    weight: 1,
    lockedName: true,
    characterGroups: ['Specials'],
    special: true,
    rarity: 'unique',
    accent: 'tidal-blue',
    accentGradient: 'from-cyan-300 via-blue-500 to-indigo-600',
    accentBorder: 'border-blue-400/60',
    accentShadow: 'shadow-[0_0_24px_-6px_rgba(59,130,246,0.55)]',
  },
  {
    id: 'hero-special-crimson-reaver',
    name: 'Crimson Reaver',
    preview: '/piumon-assets/bodies/hero-special-crimson-reaver.png',
    source: 'Special · Complete Look',
    sourceNote: 'Unique complete-look special · dark crimson warrior with obsidian horns and blood-gold trim',
    generationStatus: 'Path A Pilot',
    weight: 1,
    lockedName: true,
    characterGroups: ['Specials'],
    special: true,
    rarity: 'unique',
    accent: 'crimson-ember',
    accentGradient: 'from-rose-400 via-red-600 to-neutral-900',
    accentBorder: 'border-rose-500/60',
    accentShadow: 'shadow-[0_0_24px_-6px_rgba(244,63,94,0.55)]',
  },
  {
    id: 'hero-special-lilac-enchantress',
    name: 'Lilac Enchantress',
    preview: '/piumon-assets/bodies/hero-special-lilac-enchantress.png',
    source: 'Special · Complete Look',
    sourceNote: 'Unique complete-look special · lilac sorceress with star-silk robe and moonlight aura',
    generationStatus: 'Path A Pilot',
    weight: 1,
    lockedName: true,
    characterGroups: ['Specials'],
    special: true,
    rarity: 'unique',
    accent: 'lilac-dream',
    accentGradient: 'from-fuchsia-300 via-purple-500 to-violet-600',
    accentBorder: 'border-purple-400/60',
    accentShadow: 'shadow-[0_0_24px_-6px_rgba(192,132,252,0.55)]',
  },
  {
    id: 'hero-special-bronze-colossus',
    name: 'Bronze Colossus',
    preview: '/piumon-assets/bodies/hero-special-bronze-colossus.png',
    source: 'Special · Complete Look',
    sourceNote: 'Unique complete-look special · mechanical bronze titan with steam-gold plating and gear crown',
    generationStatus: 'Path A Pilot',
    weight: 1,
    lockedName: true,
    characterGroups: ['Specials'],
    special: true,
    rarity: 'unique',
    accent: 'bronze-steam',
    accentGradient: 'from-yellow-300 via-amber-500 to-orange-700',
    accentBorder: 'border-amber-500/60',
    accentShadow: 'shadow-[0_0_24px_-6px_rgba(234,179,8,0.55)]',
  },
  {
    id: 'hero-special-pearl-seraph',
    name: 'Pearl Seraph',
    preview: '/piumon-assets/bodies/hero-special-pearl-seraph.png',
    source: 'Special · Complete Look',
    sourceNote: 'Unique complete-look special · pearl-white angelic chibi with gold-leaf wings and radiant halo',
    generationStatus: 'Path A Pilot',
    weight: 1,
    lockedName: true,
    characterGroups: ['Specials'],
    special: true,
    rarity: 'unique',
    accent: 'pearl-light',
    accentGradient: 'from-white via-amber-200 to-rose-300',
    accentBorder: 'border-amber-200/60',
    accentShadow: 'shadow-[0_0_24px_-6px_rgba(253,230,138,0.55)]',
  },
];

const HABITATS = [
  {
    id: 'rock',
    name: 'Rock Habitat',
    weight: 7,
    accent: 'from-stone-300/30 via-stone-500/20 to-stone-900/70',
    border: 'border-stone-300/30',
    note: 'Craggy ground, broken monoliths, old ruin light.',
  },
  {
    id: 'fire',
    name: 'Fire Habitat',
    weight: 6,
    accent: 'from-orange-300/30 via-red-500/20 to-red-950/80',
    border: 'border-orange-300/30',
    note: 'Volcanic ash, ember lanterns, heat haze, molten cracks.',
  },
  {
    id: 'water',
    name: 'Water Habitat',
    weight: 8,
    accent: 'from-cyan-300/30 via-sky-500/20 to-blue-950/80',
    border: 'border-cyan-300/30',
    note: 'Lagoon blue, floating pads, stone piers, mist shadow.',
  },
  {
    id: 'ice',
    name: 'Ice Habitat',
    weight: 5,
    accent: 'from-sky-100/35 via-blue-200/20 to-slate-900/80',
    border: 'border-sky-200/30',
    note: 'Frost bloom, hard light, glassy snow, pale wind.',
  },
  {
    id: 'habitat-grassland',
    name: 'Grassland',
    weight: 7,
    accent: 'from-lime-300/30 via-emerald-400/20 to-sky-900/70',
    border: 'border-emerald-300/30',
    note: 'Rolling hills, wildflowers, golden sunlight, distant tree line.',
    rarity: 'common',
  },
  {
    id: 'habitat-electric-grid',
    name: 'Electric Grid',
    weight: 6,
    accent: 'from-fuchsia-400/30 via-cyan-400/20 to-indigo-950/80',
    border: 'border-cyan-300/30',
    note: 'Synthwave grid, magenta sunset, neon sparks, deep indigo ground.',
    rarity: 'common',
  },
  {
    id: 'habitat-windswept-peaks',
    name: 'Windswept Peaks',
    weight: 5,
    accent: 'from-rose-200/30 via-orange-300/20 to-slate-900/80',
    border: 'border-rose-200/30',
    note: 'Cloud-sea cliffs, dawn sky, streaked wind, tiny eagle in the distance.',
    rarity: 'common',
  },
  {
    id: 'habitat-shadow-glade',
    name: 'Shadow Glade',
    weight: 5,
    accent: 'from-purple-400/30 via-violet-700/25 to-black/80',
    border: 'border-purple-300/30',
    note: 'Misty purple forest, glowing mushrooms, moonbeam shafts, fireflies.',
    rarity: 'common',
  },
  {
    id: 'habitat-special-aurora-abyss',
    name: 'Aurora Abyss',
    weight: 1,
    accent: 'from-teal-300/30 via-fuchsia-500/20 to-indigo-950/80',
    border: 'border-fuchsia-300/40',
    note: 'Cosmic void with swirling teal and magenta aurora ribbons. Unique · 1 of 10.',
    special: true,
    rarity: 'unique',
    accentGradient: 'from-teal-300 via-fuchsia-400 to-indigo-400',
    accentBorder: 'border-fuchsia-400/60',
    accentShadow: 'shadow-[0_0_22px_-6px_rgba(232,121,249,0.55)]',
  },
  {
    id: 'habitat-special-emberflow-caldera',
    name: 'Emberflow Caldera',
    weight: 1,
    accent: 'from-amber-300/35 via-orange-600/25 to-red-950/80',
    border: 'border-orange-300/40',
    note: 'Active volcanic caldera with lava rivers and ember ash. Unique · 1 of 10.',
    special: true,
    rarity: 'unique',
    accentGradient: 'from-amber-300 via-orange-500 to-red-600',
    accentBorder: 'border-orange-400/60',
    accentShadow: 'shadow-[0_0_22px_-6px_rgba(249,115,22,0.55)]',
  },
  {
    id: 'habitat-special-abyssal-reef',
    name: 'Abyssal Reef',
    weight: 1,
    accent: 'from-cyan-300/30 via-teal-500/20 to-indigo-950/80',
    border: 'border-cyan-300/40',
    note: 'Deep ocean reef lit by bioluminescent coral and drifting rays. Unique · 1 of 10.',
    special: true,
    rarity: 'unique',
    accentGradient: 'from-cyan-300 via-teal-400 to-indigo-500',
    accentBorder: 'border-cyan-400/60',
    accentShadow: 'shadow-[0_0_22px_-6px_rgba(45,212,191,0.55)]',
  },
  {
    id: 'habitat-special-moonstone-bluff',
    name: 'Moonstone Bluff',
    weight: 1,
    accent: 'from-slate-200/30 via-violet-400/20 to-slate-900/80',
    border: 'border-violet-200/40',
    note: 'Moonlit cliffside with silver grass and glowing moonstone pillars. Unique · 1 of 10.',
    special: true,
    rarity: 'unique',
    accentGradient: 'from-slate-200 via-violet-300 to-indigo-400',
    accentBorder: 'border-violet-300/60',
    accentShadow: 'shadow-[0_0_22px_-6px_rgba(196,181,253,0.55)]',
  },
  {
    id: 'habitat-special-glacier-vault',
    name: 'Glacier Vault',
    weight: 1,
    accent: 'from-sky-200/35 via-cyan-400/20 to-blue-950/80',
    border: 'border-sky-200/40',
    note: 'Crystalline ice cavern with aurora light refracting through glacier walls. Unique · 1 of 10.',
    special: true,
    rarity: 'unique',
    accentGradient: 'from-sky-200 via-cyan-300 to-blue-500',
    accentBorder: 'border-sky-300/60',
    accentShadow: 'shadow-[0_0_22px_-6px_rgba(125,211,252,0.55)]',
  },
];

// Pilot "Specials" manifest — one unique per category for visual review before
// scaling to 10 unique per category. Each entry resolves via getAssetUrl so
// the Specials Gallery below renders the actual generated PixelLab assets.
const SPECIAL_PILOT_ENTRIES = [
  { type: 'bodies',   id: 'hero-special-obsidian-prism',    name: 'Obsidian Prism',    category: 'Complete Look', theme: 'Jet black · iridescent rainbow highlights',       gradient: 'from-fuchsia-400 via-cyan-400 to-emerald-400', ring: 'ring-fuchsia-400/50', chip: 'bg-fuchsia-400/[0.12] text-fuchsia-200 border-fuchsia-400/30' },
  { type: 'bodies',   id: 'hero-special-void-archon',       name: 'Void Archon',       category: 'Complete Look', theme: 'Indigo robe · phoenix crown · cosmic silhouette', gradient: 'from-indigo-400 via-violet-500 to-amber-300',  ring: 'ring-violet-400/50', chip: 'bg-violet-400/[0.12] text-violet-200 border-violet-400/30' },
  { type: 'bodies',   id: 'hero-special-solar-emperor',     name: 'Solar Emperor',     category: 'Complete Look', theme: 'Golden chibi · sunburst halo · flame cape',       gradient: 'from-amber-300 via-orange-500 to-rose-500',    ring: 'ring-orange-400/50', chip: 'bg-orange-400/[0.12] text-orange-200 border-orange-400/30' },
  { type: 'bodies',   id: 'hero-special-frost-oracle',      name: 'Frost Oracle',      category: 'Complete Look', theme: 'Icy cyan seer · frost-silk robe · crystal circlet', gradient: 'from-sky-300 via-cyan-400 to-indigo-400',      ring: 'ring-cyan-300/50',   chip: 'bg-cyan-400/[0.12] text-cyan-200 border-cyan-400/30' },
  { type: 'bodies',   id: 'hero-special-verdant-sage',      name: 'Verdant Sage',      category: 'Complete Look', theme: 'Emerald druid · vine wrap · glowing leaf crown',   gradient: 'from-lime-300 via-emerald-400 to-green-600',   ring: 'ring-emerald-400/50', chip: 'bg-emerald-400/[0.12] text-emerald-200 border-emerald-400/30' },
  { type: 'bodies',   id: 'hero-special-tidal-warden',      name: 'Tidal Warden',      category: 'Complete Look', theme: 'Cobalt guardian · coral-plated armor · trident halo', gradient: 'from-cyan-300 via-blue-500 to-indigo-600',   ring: 'ring-blue-400/50',   chip: 'bg-blue-400/[0.12] text-blue-200 border-blue-400/30' },
  { type: 'bodies',   id: 'hero-special-crimson-reaver',    name: 'Crimson Reaver',    category: 'Complete Look', theme: 'Crimson warrior · obsidian horns · blood-gold trim', gradient: 'from-rose-400 via-red-600 to-neutral-900',    ring: 'ring-rose-500/50',   chip: 'bg-rose-500/[0.12] text-rose-200 border-rose-400/30' },
  { type: 'bodies',   id: 'hero-special-lilac-enchantress', name: 'Lilac Enchantress', category: 'Complete Look', theme: 'Lilac sorceress · star-silk robe · moonlight aura',  gradient: 'from-fuchsia-300 via-purple-500 to-violet-600', ring: 'ring-purple-400/50', chip: 'bg-purple-400/[0.12] text-purple-200 border-purple-400/30' },
  { type: 'bodies',   id: 'hero-special-bronze-colossus',   name: 'Bronze Colossus',   category: 'Complete Look', theme: 'Bronze titan · steam-gold plating · gear crown',     gradient: 'from-yellow-300 via-amber-500 to-orange-700', ring: 'ring-amber-500/50',  chip: 'bg-amber-500/[0.12] text-amber-200 border-amber-400/30' },
  { type: 'bodies',   id: 'hero-special-pearl-seraph',      name: 'Pearl Seraph',      category: 'Complete Look', theme: 'Pearl-white seraph · gold-leaf wings · radiant halo', gradient: 'from-white via-amber-200 to-rose-300',        ring: 'ring-amber-200/60',  chip: 'bg-amber-200/[0.14] text-amber-100 border-amber-200/40' },
  { type: 'habitats', id: 'habitat-special-aurora-abyss',     name: 'Aurora Abyss',     category: 'Habitat', theme: 'Cosmic void · teal & magenta aurora backdrop',      gradient: 'from-teal-300 via-fuchsia-400 to-indigo-400', ring: 'ring-fuchsia-400/50', chip: 'bg-fuchsia-400/[0.12] text-fuchsia-200 border-fuchsia-400/30' },
  { type: 'habitats', id: 'habitat-special-emberflow-caldera', name: 'Emberflow Caldera', category: 'Habitat', theme: 'Volcanic caldera · lava rivers · ember ash sky',    gradient: 'from-amber-300 via-orange-500 to-red-600',    ring: 'ring-orange-400/50',  chip: 'bg-orange-400/[0.12] text-orange-200 border-orange-400/30' },
  { type: 'habitats', id: 'habitat-special-abyssal-reef',      name: 'Abyssal Reef',      category: 'Habitat', theme: 'Deep reef · bioluminescent coral · drifting rays',  gradient: 'from-cyan-300 via-teal-400 to-indigo-500',    ring: 'ring-cyan-400/50',    chip: 'bg-cyan-400/[0.12] text-cyan-200 border-cyan-400/30' },
  { type: 'habitats', id: 'habitat-special-moonstone-bluff',   name: 'Moonstone Bluff',   category: 'Habitat', theme: 'Moonlit cliffs · silver grass · glowing moonstones', gradient: 'from-slate-200 via-violet-300 to-indigo-400', ring: 'ring-violet-300/50',  chip: 'bg-violet-300/[0.12] text-violet-200 border-violet-300/30' },
  { type: 'habitats', id: 'habitat-special-glacier-vault',     name: 'Glacier Vault',     category: 'Habitat', theme: 'Crystalline ice cavern · aurora through glacier',   gradient: 'from-sky-200 via-cyan-300 to-blue-500',       ring: 'ring-sky-300/50',     chip: 'bg-sky-300/[0.12] text-sky-200 border-sky-300/30' },
];

const ATTRIBUTE_AXES = [
  { id: 'speed', name: 'Speed', note: 'Explosive tempo and initiative.' },
  { id: 'stamina', name: 'Stamina', note: 'Long-form endurance and sustain.' },
  { id: 'tech', name: 'Tech', note: 'Control, precision, and difficult execution.' },
  { id: 'consistency', name: 'Consistency', note: 'Low-variance reliability over time.' },
  { id: 'level', name: 'Level', note: 'Overall class / combat rank.' },
];

const PIPELINE_STEPS = [
  {
    title: 'Identity Source',
    body: 'PIUGAME avatar image + official character name define the base identity. This page now imports the authenticated shop roster, then lets us curate and rename edge cases before PixelLab generation.',
  },
  {
    title: 'Consistent PixelLab Body',
    body: 'Every character is regenerated into one shared full-body pose in the Dojocat-style reference, so clothing and accessories fit every card the same way.',
  },
  {
    title: 'Complete Looks (Path A)',
    body: 'Each mint is one PixelLab-generated character with its outfit, accessories, and colour signature baked in. Abandoned modular layering after the pilot — PixelLab does not split cleanly into hat + outfit sprites, and complete looks give a more cohesive silhouette.',
  },
  {
    title: 'Habitat Backdrops',
    body: 'Rock, fire, water, ice, and cosmic backgrounds sit behind the complete-look character so the same figure can still swap biomes without redrawing the sprite.',
  },
];

function createShopSeeds() {
  return piuAvatarCatalog.map((item) => ({
    id: `piu-${item.filename.replace('.png', '')}`,
    name: item.name,
    officialName: item.name,
    preview: `/avatars/${item.filename}`,
    source: 'PIUGAME Avatar Shop',
    sourceNote: item.owned
      ? 'Official PIUGAME roster import · already owned in source shop'
      : `Official PIUGAME roster import · unlockable for ${item.price || '?'} PP`,
    generationStatus: item.owned ? 'Source Owned' : 'Source Imported',
    weight: item.owned ? 3 : 1,
    lockedName: false,
    ownedInShop: item.owned,
    sourcePrice: item.price,
    multiCharacter: false,
    removed: false,
    characterGroups: [],
  }));
}

function clampWeight(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(999, Math.round(parsed)));
}

function sumActiveWeight(items) {
  return items.reduce((sum, item) => sum + (item.active === false || item.removed ? 0 : Math.max(0, Number(item.weight) || 0)), 0);
}

function formatEstimate(value) {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: value >= 10 ? 0 : 1 }).format(value);
}

function formatComboCount(value) {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value > 999999) return `${(value / 1000000).toFixed(1)}M`;
  if (value > 9999) return `${(value / 1000).toFixed(1)}k`;
  return new Intl.NumberFormat('en-GB').format(Math.round(value));
}

function normalizeGroupName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function getDerivedCharacterGroups(character) {
  const manualGroups = Array.isArray(character.characterGroups)
    ? character.characterGroups.map(normalizeGroupName).filter(Boolean)
    : [];
  const splitNames = character.multiCharacter
    ? String(character.name || '')
      .split(';')
      .map(normalizeGroupName)
      .filter(Boolean)
    : [];
  return [...new Set([...manualGroups, ...splitNames])];
}

function SectionShell({ eyebrow, index, title, children, aside }) {
  return (
    <section className="relative grid gap-5 border-t border-white/10 pt-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-8 lg:pt-6">
      <div className="min-w-0">
        <div className="flex items-baseline gap-3">
          {index ? (
            <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-cyan-300/70">{index}</span>
          ) : null}
          <span className="text-[10px] font-bold uppercase tracking-[0.32em] text-cyan-300/70">{eyebrow}</span>
        </div>
        <h2 className="mt-2 font-display text-[1.75rem] font-black leading-[1.05] tracking-tight text-white sm:text-[2rem]">{title}</h2>
        <div className="mt-5">{children}</div>
      </div>
      {aside ? <aside className="lg:pt-[3.1rem]">{aside}</aside> : null}
    </section>
  );
}

function WeightPill({ children, tone = 'cyan' }) {
  const toneClasses = {
    cyan: 'border-cyan-400/25 bg-cyan-400/[0.08] text-cyan-200',
    amber: 'border-amber-400/25 bg-amber-400/[0.08] text-amber-200',
    pink: 'border-pink-400/25 bg-pink-400/[0.08] text-pink-200',
    emerald: 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-200',
    slate: 'border-white/10 bg-white/[0.04] text-gray-300',
  };
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] ${toneClasses[tone] || toneClasses.slate}`}>
      {children}
    </span>
  );
}

function UploadButton({ assetUrl, onUpload, onDelete, size = 'sm', label = 'Upload' }) {
  const inputRef = useRef(null);
  const handleChange = (event) => {
    const file = event.target.files?.[0];
    if (file) onUpload(file);
    event.target.value = '';
  };
  if (assetUrl) {
    return (
      <div className="group/upload relative">
        <img
          src={`${assetUrl}?t=${Date.now()}`}
          alt="Uploaded asset"
          className={`rounded-lg border border-white/[0.08] bg-[#0a0915] object-contain ${size === 'lg' ? 'h-28 w-28' : 'h-10 w-10'}`}
          style={{ imageRendering: 'pixelated' }}
        />
        <button
          type="button"
          onClick={onDelete}
          className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-rose-500/90 text-[8px] font-bold text-white group-hover/upload:flex"
          aria-label="Remove asset"
        >
          x
        </button>
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`rounded-lg border border-dashed border-white/[0.12] bg-white/[0.02] font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-gray-500 transition hover:border-cyan-400/40 hover:bg-cyan-400/[0.04] hover:text-cyan-300 ${
          size === 'lg' ? 'flex h-28 w-28 items-center justify-center' : 'px-2 py-1'
        }`}
      >
        {label}
      </button>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={handleChange} />
    </>
  );
}

function CharacterCard({
  character,
  mintSize,
  totalBaseWeight,
  onUpdate,
  groupDraft,
  onGroupDraftChange,
  onAddGroup,
  onRemoveGroup,
}) {
  const estimate = totalBaseWeight > 0 && character.active !== false && character.weight > 0
    ? (character.weight / totalBaseWeight) * mintSize
    : 0;
  const characterGroups = getDerivedCharacterGroups(character);

  return (
    <article
      className={`group/card rounded-2xl border p-4 transition-colors ${
        character.removed
          ? 'border-rose-300/20 bg-rose-300/[0.04]'
          : 'border-white/[0.08] bg-white/[0.025] hover:border-white/[0.14] hover:bg-white/[0.035]'
      }`}
    >
      <div className="flex items-start gap-3.5">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0915] p-1.5">
          <img src={character.preview} alt={character.name} className="h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-gray-500">{character.source === 'PIUGAME Avatar Shop' ? 'PIUGAME' : 'Custom Hero'}</div>
              <input
                type="text"
                value={character.name}
                disabled={character.lockedName}
                onChange={(event) => onUpdate(character.id, { name: event.target.value })}
                className={`mt-1 w-full bg-transparent font-display text-[18px] font-black leading-tight tracking-tight text-white outline-none ${
                  character.lockedName ? 'cursor-default' : 'focus:text-cyan-200'
                }`}
              />
              {character.officialName && character.name !== character.officialName ? (
                <div className="mt-0.5 text-[10px] text-gray-600">
                  Official: <span className="text-gray-400">{character.officialName}</span>
                </div>
              ) : null}
            </div>
            <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-gray-500 hover:text-gray-300">
              <input
                type="checkbox"
                checked={character.active !== false}
                onChange={(event) => onUpdate(character.id, { active: event.target.checked })}
                className="h-3.5 w-3.5 rounded-sm border-white/20 bg-black/30 text-cyan-400 focus:ring-1 focus:ring-cyan-400/40 focus:ring-offset-0"
              />
              Live
            </label>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1">
            <WeightPill tone={character.generationStatus === 'Ready' ? 'emerald' : 'amber'}>
              {character.generationStatus}
            </WeightPill>
            <WeightPill tone="slate">{formatEstimate(estimate)} est</WeightPill>
            {character.source === 'PIUGAME Avatar Shop' ? (
              <WeightPill tone={character.ownedInShop ? 'emerald' : 'amber'}>
                {character.ownedInShop ? 'Owned' : `${character.sourcePrice || '?'} PP`}
              </WeightPill>
            ) : null}
            {character.multiCharacter ? <WeightPill tone="pink">Multi</WeightPill> : null}
          </div>

          <p className="mt-2.5 text-[11px] leading-snug text-gray-500">{character.sourceNote}</p>
        </div>
      </div>

      <div className="mt-3 border-t border-white/[0.06] pt-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-gray-500">Groups</span>
          <input
            type="number"
            min="0"
            max="999"
            value={character.weight}
            onChange={(event) => onUpdate(character.id, { weight: clampWeight(event.target.value) })}
            className="h-7 w-16 rounded-md border border-white/[0.08] bg-black/30 px-2 text-right font-mono text-[12px] tabular-nums text-white outline-none focus:border-cyan-400/60"
            aria-label="Distribution weight"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {characterGroups.length ? characterGroups.map((groupName) => {
            const removable = !(character.multiCharacter && String(character.name || '').split(';').map(normalizeGroupName).includes(groupName));
            return (
              <span
                key={groupName}
                className="inline-flex items-center gap-1 rounded-md border border-cyan-400/20 bg-cyan-400/[0.08] px-1.5 py-0.5 text-[10px] font-semibold text-cyan-200"
              >
                {groupName}
                {removable ? (
                  <button
                    type="button"
                    onClick={() => onRemoveGroup(character.id, groupName)}
                    className="text-cyan-300/60 transition hover:text-cyan-200"
                    aria-label={`Remove ${groupName} from character group`}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            );
          }) : (
            <span className="text-[10px] text-gray-600">—</span>
          )}
        </div>
        <div className="mt-2 flex gap-1">
          <input
            type="text"
            value={groupDraft}
            onChange={(event) => onGroupDraftChange(character.id, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onAddGroup(character.id);
              }
            }}
            list="piumon-character-groups"
            placeholder="Add group…"
            className="h-7 flex-1 rounded-md border border-white/[0.08] bg-black/20 px-2 text-[11px] text-white outline-none placeholder:text-gray-600 focus:border-cyan-400/60"
          />
          <button
            type="button"
            onClick={() => onAddGroup(character.id)}
            className="h-7 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-gray-300 transition hover:border-cyan-400/40 hover:bg-cyan-400/[0.06] hover:text-cyan-200"
          >
            Add
          </button>
        </div>

        {character.source === 'PIUGAME Avatar Shop' ? (
          <div className="mt-3 flex items-start justify-between gap-2">
            <label className="inline-flex cursor-pointer items-start gap-1.5 text-[10px] text-gray-500">
              <input
                type="checkbox"
                checked={character.multiCharacter === true}
                onChange={(event) => onUpdate(character.id, { multiCharacter: event.target.checked })}
                className="mt-px h-3.5 w-3.5 rounded-sm border-white/20 bg-black/30 text-cyan-400 focus:ring-1 focus:ring-cyan-400/40 focus:ring-offset-0"
              />
              <span className="leading-tight">
                <span className="font-semibold text-gray-300">Multi-char</span>
                <span className="mt-0.5 block font-mono text-[9px] text-gray-600">name1;name2</span>
              </span>
            </label>
            <button
              type="button"
              onClick={() => onUpdate(character.id, { removed: !character.removed, active: character.removed ? character.active : false })}
              className={`h-7 rounded-md border px-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] transition ${
                character.removed
                  ? 'border-emerald-300/30 bg-emerald-300/[0.08] text-emerald-200 hover:bg-emerald-300/[0.14]'
                  : 'border-rose-300/25 bg-rose-300/[0.06] text-rose-200 hover:bg-rose-300/[0.12]'
              }`}
            >
              {character.removed ? 'Restore' : 'Remove'}
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function HabitatCard({ habitat, onToggle, onWeightChange, backdropUrl, onUpload, onDelete }) {
  const active = habitat.active !== false;
  return (
    <div className={`relative overflow-hidden rounded-2xl border ${habitat.border} bg-white/[0.02]`}>
      {backdropUrl ? (
        <img src={`${backdropUrl}?t=${Date.now()}`} alt={habitat.name} className="absolute inset-x-0 top-0 h-24 w-full object-cover opacity-40" style={{ imageRendering: 'pixelated' }} />
      ) : (
        <div className={`absolute inset-x-0 top-0 h-16 bg-gradient-to-b ${habitat.accent} opacity-60`} />
      )}
      <div className="relative p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-white/60">{habitat.id}</div>
            <h3 className="mt-1 font-display text-[15px] font-black tracking-tight text-white">{habitat.name}</h3>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-gray-400 hover:text-gray-200">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => onToggle(habitat.id, event.target.checked)}
              className="h-3.5 w-3.5 rounded-sm border-white/20 bg-black/30 text-cyan-400 focus:ring-1 focus:ring-cyan-400/40 focus:ring-offset-0"
            />
            Live
          </label>
        </div>
        <p className="mt-3 text-[11px] leading-snug text-gray-500">{habitat.note}</p>
        <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3">
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-gray-500">Weight</span>
          <input
            type="number"
            min="0"
            max="999"
            value={habitat.weight}
            onChange={(event) => onWeightChange(habitat.id, event.target.value)}
            className="h-7 w-16 rounded-md border border-white/[0.08] bg-black/30 px-2 text-right font-mono text-[12px] tabular-nums text-white outline-none focus:border-cyan-400/60"
          />
        </div>
        {onUpload ? (
          <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3">
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-gray-500">Backdrop</span>
            <UploadButton
              assetUrl={backdropUrl}
              onUpload={(file) => onUpload('habitats', habitat.id, file)}
              onDelete={() => onDelete?.('habitats', habitat.id)}
              label="Upload"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function PiumonPage() {
  const [mintSize, setMintSize] = useState(TOTAL_SUPPLY_DEFAULT);
  const [baseQuery, setBaseQuery] = useState('');
  const [baseFilter, setBaseFilter] = useState('all');
  const [baseCharacters, setBaseCharacters] = useState(() => [...CUSTOM_HEROES, ...createShopSeeds()].map((item) => ({ ...item, active: true })));
  const [groupDrafts, setGroupDrafts] = useState({});
  const [habitats, setHabitats] = useState(() => HABITATS.map((item) => ({ ...item, active: true })));

  // Asset management
  const [assets, setAssets] = useState({ bodies: [], traits: [], habitats: [] });
  const [assetsLoading, setAssetsLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setAssetsLoading(false); return; }
    fetch('/api/piumon/assets', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : { bodies: [], traits: [], habitats: [] }))
      .then(setAssets)
      .catch(() => {})
      .finally(() => setAssetsLoading(false));
  }, []);

  const getAssetUrl = useCallback((type, id) => {
    const asset = assets[type]?.find((a) => a.id === id);
    return asset ? `/piumon-assets/${type}/${asset.filename}` : null;
  }, [assets]);

  const uploadAsset = useCallback(async (type, id, file) => {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(`/api/piumon/assets/${type}/${id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) return;
    const data = await res.json();
    setAssets((prev) => ({
      ...prev,
      [type]: [...prev[type].filter((a) => a.id !== id), { id, filename: data.filename }],
    }));
  }, []);

  const deleteAsset = useCallback(async (type, id) => {
    const token = localStorage.getItem('token');
    await fetch(`/api/piumon/assets/${type}/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setAssets((prev) => ({
      ...prev,
      [type]: prev[type].filter((a) => a.id !== id),
    }));
  }, []);

  // PixelLab generation
  const [genJobs, setGenJobs] = useState({}); // characterId -> { status, jobId, error }
  const [genSize, setGenSize] = useState(48);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const pollTimers = useRef({});

  const startGeneration = useCallback(async (character) => {
    const token = localStorage.getItem('token');
    setGenJobs((prev) => ({ ...prev, [character.id]: { status: 'starting' } }));
    try {
      const res = await fetch('/api/piumon/generate/body', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          characterId: character.id,
          previewUrl: character.preview,
          name: character.name,
          size: genSize,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        setGenJobs((prev) => ({ ...prev, [character.id]: { status: 'failed', error: err.error } }));
        return;
      }
      const { jobId } = await res.json();
      setGenJobs((prev) => ({ ...prev, [character.id]: { status: 'processing', jobId } }));

      // Start polling
      const poll = async () => {
        try {
          const pollRes = await fetch(`/api/piumon/generate/job/${jobId}?characterId=${encodeURIComponent(character.id)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await pollRes.json();
          if (data.status === 'completed') {
            setGenJobs((prev) => ({ ...prev, [character.id]: { status: 'completed', jobId } }));
            setAssets((prev) => ({
              ...prev,
              bodies: [...prev.bodies.filter((a) => a.id !== character.id), { id: character.id, filename: data.filename }],
            }));
            delete pollTimers.current[character.id];
          } else if (data.status === 'failed') {
            setGenJobs((prev) => ({ ...prev, [character.id]: { status: 'failed', jobId, error: data.error } }));
            delete pollTimers.current[character.id];
          } else {
            pollTimers.current[character.id] = setTimeout(poll, 6000);
          }
        } catch {
          pollTimers.current[character.id] = setTimeout(poll, 8000);
        }
      };
      pollTimers.current[character.id] = setTimeout(poll, 5000);
    } catch (err) {
      setGenJobs((prev) => ({ ...prev, [character.id]: { status: 'failed', error: err.message } }));
    }
  }, [genSize]);

  // Submit job and wait for it to fully complete before resolving
  const generateAndWait = useCallback(async (character) => {
    const token = localStorage.getItem('token');
    setGenJobs((prev) => ({ ...prev, [character.id]: { status: 'starting' } }));
    try {
      const res = await fetch('/api/piumon/generate/body', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          characterId: character.id,
          previewUrl: character.preview,
          name: character.name,
          size: genSize,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        setGenJobs((prev) => ({ ...prev, [character.id]: { status: 'failed', error: err.error } }));
        return;
      }
      const { jobId } = await res.json();
      setGenJobs((prev) => ({ ...prev, [character.id]: { status: 'processing', jobId } }));

      // Poll until done (blocking)
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 6000));
        try {
          const pollRes = await fetch(`/api/piumon/generate/job/${jobId}?characterId=${encodeURIComponent(character.id)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await pollRes.json();
          if (data.status === 'completed') {
            setGenJobs((prev) => ({ ...prev, [character.id]: { status: 'completed', jobId } }));
            setAssets((prev) => ({
              ...prev,
              bodies: [...prev.bodies.filter((a) => a.id !== character.id), { id: character.id, filename: data.filename }],
            }));
            return;
          }
          if (data.status === 'failed') {
            setGenJobs((prev) => ({ ...prev, [character.id]: { status: 'failed', jobId, error: data.error } }));
            return;
          }
        } catch { /* retry */ }
      }
      setGenJobs((prev) => ({ ...prev, [character.id]: { status: 'failed', error: 'Timed out after 6 minutes' } }));
    } catch (err) {
      setGenJobs((prev) => ({ ...prev, [character.id]: { status: 'failed', error: err.message } }));
    }
  }, [genSize]);

  useEffect(() => {
    return () => {
      Object.values(pollTimers.current).forEach(clearTimeout);
    };
  }, []);

  // Composition preview
  const [compBase, setCompBase] = useState('');
  const [compHabitat, setCompHabitat] = useState('');
  const EXPORT_SIZE = 512;

  const filteredCharacters = useMemo(() => {
    const query = baseQuery.trim().toLowerCase();
    return baseCharacters.filter((item) => {
      if (baseFilter === 'removed') {
        if (!item.removed) return false;
      } else {
        if (item.removed) return false;
        if (baseFilter !== 'all' && item.source !== baseFilter) return false;
      }
      if (!query) return true;
      return item.name.toLowerCase().includes(query)
        || item.sourceNote.toLowerCase().includes(query)
        || String(item.officialName || '').toLowerCase().includes(query);
    });
  }, [baseCharacters, baseFilter, baseQuery]);

  const activeBases = useMemo(() => baseCharacters.filter((item) => item.removed !== true && item.active !== false && item.weight > 0), [baseCharacters]);
  const totalBaseWeight = useMemo(() => sumActiveWeight(baseCharacters), [baseCharacters]);
  const removedBaseCount = useMemo(() => baseCharacters.filter((item) => item.removed).length, [baseCharacters]);
  const visibleBaseCount = useMemo(() => baseCharacters.filter((item) => !item.removed).length, [baseCharacters]);
  const activeHabitats = useMemo(() => habitats.filter((item) => item.active !== false && item.weight > 0), [habitats]);
  const totalHabitatWeight = useMemo(() => sumActiveWeight(habitats), [habitats]);
  const characterGroups = useMemo(() => {
    const groupMap = new Map();
    baseCharacters.forEach((character) => {
      if (character.removed) return;
      getDerivedCharacterGroups(character).forEach((groupName) => {
        const next = groupMap.get(groupName) || { count: 0, characters: [] };
        next.count += 1;
        next.characters.push(character.name);
        groupMap.set(groupName, next);
      });
    });
    return [...groupMap.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [baseCharacters]);
  const groupSuggestions = useMemo(() => characterGroups.map((group) => group.name), [characterGroups]);
  const theoreticalCombos = useMemo(() => {
    return activeBases.length * Math.max(1, activeHabitats.length);
  }, [activeBases.length, activeHabitats.length]);

  const projectedTopBases = useMemo(() => {
    if (!totalBaseWeight) return [];
    return [...activeBases]
      .map((item) => ({
        ...item,
        estimate: (item.weight / totalBaseWeight) * mintSize,
      }))
      .sort((a, b) => b.estimate - a.estimate)
      .slice(0, 8);
  }, [activeBases, mintSize, totalBaseWeight]);

  const exportComposite = useCallback(async () => {
    if (!compBase) return;
    const bodyUrl = getAssetUrl('bodies', compBase);
    if (!bodyUrl) return;

    const loadImg = (src) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });

    const bodyImg = await loadImg(bodyUrl);
    const native = bodyImg.naturalWidth || 48;

    const small = document.createElement('canvas');
    small.width = native;
    small.height = native;
    const sCtx = small.getContext('2d');

    const habUrl = compHabitat && getAssetUrl('habitats', compHabitat);
    if (habUrl) {
      try {
        const habImg = await loadImg(habUrl);
        const scale = Math.max(native / habImg.naturalWidth, native / habImg.naturalHeight);
        const w = habImg.naturalWidth * scale;
        const h = habImg.naturalHeight * scale;
        sCtx.drawImage(habImg, (native - w) / 2, (native - h) / 2, w, h);
      } catch { /* skip */ }
    }

    sCtx.drawImage(bodyImg, 0, 0, native, native);

    const big = document.createElement('canvas');
    big.width = EXPORT_SIZE;
    big.height = EXPORT_SIZE;
    const bCtx = big.getContext('2d');
    bCtx.imageSmoothingEnabled = false;
    bCtx.drawImage(small, 0, 0, EXPORT_SIZE, EXPORT_SIZE);

    const link = document.createElement('a');
    const charName = activeBases.find((c) => c.id === compBase)?.name || compBase;
    link.download = `${charName.toLowerCase().replace(/\s+/g, '-')}-512.png`;
    link.href = big.toDataURL('image/png');
    link.click();
  }, [compBase, compHabitat, getAssetUrl, activeBases]);

  const heroReference = activeBases[0] || baseCharacters[0];

  function updateBaseCharacter(id, updates) {
    setBaseCharacters((current) => current.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  }

  function updateGroupDraft(id, value) {
    setGroupDrafts((current) => ({ ...current, [id]: value }));
  }

  function addCharacterGroup(id) {
    const nextGroup = normalizeGroupName(groupDrafts[id]);
    if (!nextGroup) return;
    const target = baseCharacters.find((item) => item.id === id);
    const nextGroups = [...new Set([...(target?.characterGroups || []), nextGroup])];
    updateBaseCharacter(id, { characterGroups: nextGroups });
    updateGroupDraft(id, '');
  }

  function removeCharacterGroup(id, groupName) {
    const target = baseCharacters.find((item) => item.id === id);
    if (!target) return;
    updateBaseCharacter(
      id,
      { characterGroups: (target.characterGroups || []).filter((item) => item !== groupName) }
    );
  }

  function updateHabitat(id, updates) {
    setHabitats((current) => current.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  }

  return (
    <div className="relative min-h-screen bg-[#070610] text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top,rgba(49,196,255,0.14),transparent_60%)]" />
        <div className="absolute left-1/2 top-[-8rem] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-cyan-500/[0.06] blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-[1240px] px-5 pb-20 pt-7 sm:px-8">
        <div className="flex items-center justify-between gap-6 text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-400">
          <Link to="/" className="inline-flex items-center gap-1.5 transition hover:text-cyan-300">
            <span className="text-base leading-none">←</span>
            Shinsa
          </Link>
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 transition hover:text-cyan-300"
          >
            PIUGAME Avatar Shop
            <span className="text-base leading-none">↗</span>
          </a>
        </div>

        <header className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="max-w-3xl">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.32em] text-cyan-300/80">
              Piumon · Preparation Phase
            </div>
            <h1 className="mt-3 font-display text-[3.25rem] font-black leading-[0.88] tracking-[-0.02em] text-white sm:text-[4.25rem]">
              PIUMON
              <br />
              <span className="text-cyan-300">FORGE</span>
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-gray-400 sm:text-[15px]">
              Pipeline prep before the 1K mint. Import PIUGAME identities, regenerate them in one consistent PixelLab body, then layer reusable wearables and elemental habitats on top.
            </p>
          </div>
        </header>

        <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-white/[0.08] py-5 sm:grid-cols-4 sm:gap-x-0 sm:divide-x sm:divide-white/[0.08]">
          <div className="sm:px-6 sm:first:pl-0">
            <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Mint Size</dt>
            <dd className="mt-2 font-display text-[2.25rem] font-black leading-none tracking-tight text-white tabular-nums">{mintSize}</dd>
            <dd className="mt-2 text-[11px] leading-snug text-gray-500">Hard claim ceiling.</dd>
          </div>
          <div className="sm:px-6">
            <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Identity Seeds</dt>
            <dd className="mt-2 font-display text-[2.25rem] font-black leading-none tracking-tight text-white tabular-nums">{visibleBaseCount}</dd>
            <dd className="mt-2 text-[11px] leading-snug text-gray-500">
              <span className="text-cyan-300">{activeBases.length}</span> live in pool{removedBaseCount ? <> · <span className="text-amber-300">{removedBaseCount}</span> removed</> : null}
            </dd>
          </div>
          <div className="sm:px-6">
            <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Habitats</dt>
            <dd className="mt-2 font-display text-[2.25rem] font-black leading-none tracking-tight text-white tabular-nums">{activeHabitats.length}</dd>
            <dd className="mt-2 text-[11px] leading-snug text-gray-500">Backdrops live in rotation.</dd>
          </div>
          <div className="sm:px-6 sm:last:pr-0">
            <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Possible Combos</dt>
            <dd className="mt-2 font-display text-[2.25rem] font-black leading-none tracking-tight text-white tabular-nums">{formatComboCount(theoreticalCombos)}</dd>
            <dd className="mt-2 text-[11px] leading-snug text-gray-500">Room to hide the 1K distribution.</dd>
          </div>
        </dl>

        <div className="mt-10 space-y-10 lg:mt-12 lg:space-y-12">
        <SectionShell
          index="01"
          eyebrow="Generation Contract"
          title="One body. Many swappable layers."
          aside={
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Style Reference</div>
              <div className="mt-3 overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-[#13111e] to-[#09081a]">
                <img
                  src={heroReference?.preview || '/pet-world/heroes/dojocat/base.png'}
                  alt={heroReference?.name || 'Dojocat'}
                  className="mx-auto block h-56 w-auto object-contain"
                />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
                Target density: front-facing, fixed stance, clean head and torso anchors — enough negative space to swap wearables without redrawing.
              </p>
            </div>
          }
        >
          <ol className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
            {PIPELINE_STEPS.map((step, index) => (
              <li key={step.title} className="group grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-1 py-4 sm:grid-cols-[3rem_minmax(0,14rem)_minmax(0,1fr)] sm:gap-x-6">
                <span className="font-mono text-[11px] font-bold tracking-[0.12em] text-cyan-300/60 sm:pt-1">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="col-start-2 font-display text-[15px] font-black tracking-tight text-white">
                  {step.title}
                </h3>
                <p className="col-span-2 text-[13px] leading-relaxed text-gray-400 sm:col-span-1 sm:col-start-3 sm:row-start-1">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
          <div className="mt-6">
            <div className="mb-3 flex items-baseline justify-between">
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-amber-200/70">Attribute Axes</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Rarity-agnostic rank dimensions</div>
            </div>
            <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-5">
              {ATTRIBUTE_AXES.map((axis) => (
                <div key={axis.id} className="border-l border-amber-200/20 pl-3">
                  <div className="font-display text-[11px] font-black uppercase tracking-[0.14em] text-amber-100">{axis.name}</div>
                  <div className="mt-1 text-[11px] leading-snug text-gray-500">{axis.note}</div>
                </div>
              ))}
            </div>
          </div>
        </SectionShell>

        <SectionShell
          index="02"
          eyebrow="Base Roster"
          title="Identity sources to regenerate"
          aside={
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Import Status</div>
              <dl className="mt-3 space-y-4">
                <div>
                  <dt className="font-display text-[11px] font-black uppercase tracking-[0.14em] text-white">PIUGAME avatars</dt>
                  <dd className="mt-1 text-[11px] leading-snug text-gray-500">Authenticated shop import matched against Shinsa&apos;s local avatar cache.</dd>
                </div>
                <div>
                  <dt className="font-display text-[11px] font-black uppercase tracking-[0.14em] text-white">Multi-character</dt>
                  <dd className="mt-1 text-[11px] leading-snug text-gray-500">Rename as <span className="font-mono text-gray-300">name1;name2</span>. Left-most figure first.</dd>
                </div>
                <div>
                  <dt className="font-display text-[11px] font-black uppercase tracking-[0.14em] text-white">Custom heroes</dt>
                  <dd className="mt-1 text-[11px] leading-snug text-gray-500">Buu and Dojocat use approved source art. Devit and Pixiu use curated sticker references.</dd>
                </div>
                <div>
                  <dt className="font-display text-[11px] font-black uppercase tracking-[0.14em] text-white">Rarity model</dt>
                  <dd className="mt-1 text-[11px] leading-snug text-gray-500">Path A — each complete-look character is one unified sprite. Rarity flows through character pool weight plus habitat pairing.</dd>
                </div>
              </dl>
              <div className="mt-5 border-t border-white/[0.06] pt-4">
                <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Character Groups</div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {characterGroups.length ? characterGroups.slice(0, 18).map((group) => (
                    <span
                      key={group.name}
                      className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/15 bg-cyan-400/[0.06] px-2 py-0.5 text-[10px] font-semibold text-cyan-200"
                      title={group.characters.join(', ')}
                    >
                      {group.name}
                      <span className="font-mono text-cyan-300/60">×{group.count}</span>
                    </span>
                  )) : (
                    <span className="text-[11px] text-gray-600">None defined yet.</span>
                  )}
                </div>
              </div>
            </div>
          }
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {[
                { key: 'all', label: 'All' },
                { key: 'PIUGAME Avatar Shop', label: 'PIUGAME' },
                { key: 'Custom Hero', label: 'Custom' },
                { key: 'removed', label: 'Removed' },
              ].map(({ key, label }) => {
                const active = baseFilter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setBaseFilter(key)}
                    className={`h-8 rounded-md border px-3 font-mono text-[10px] font-bold uppercase tracking-[0.16em] transition ${
                      active
                        ? 'border-cyan-300/40 bg-cyan-300/[0.08] text-cyan-200'
                        : 'border-white/[0.08] bg-transparent text-gray-500 hover:border-white/20 hover:text-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="flex h-8 items-center gap-2 rounded-md border border-white/[0.08] bg-black/20 px-3 sm:w-64">
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-gray-600">Search</span>
              <input
                type="text"
                value={baseQuery}
                onChange={(event) => setBaseQuery(event.target.value)}
                placeholder="Name or source note"
                className="min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-gray-600"
              />
            </div>
          </div>
          <datalist id="piumon-character-groups">
            {groupSuggestions.map((groupName) => (
              <option key={groupName} value={groupName} />
            ))}
          </datalist>
          <div className="mt-5 grid max-h-[42rem] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
            {filteredCharacters.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                mintSize={mintSize}
                totalBaseWeight={totalBaseWeight}
                onUpdate={updateBaseCharacter}
                groupDraft={groupDrafts[character.id] || ''}
                onGroupDraftChange={updateGroupDraft}
                onAddGroup={addCharacterGroup}
                onRemoveGroup={removeCharacterGroup}
              />
            ))}
          </div>
        </SectionShell>

        <SectionShell
          index="03"
          eyebrow="Body Generation"
          title="PixelLab base bodies"
          aside={
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Generation Progress</div>
              <div className="mt-3">
                <div className="flex items-baseline justify-between">
                  <div className="font-display text-[2rem] font-black leading-none tabular-nums text-white">
                    {activeBases.filter((c) => getAssetUrl('bodies', c.id)).length}
                    <span className="ml-1 text-[14px] text-gray-500">/ {activeBases.length}</span>
                  </div>
                  <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-300/70">
                    {activeBases.length > 0
                      ? `${Math.round((activeBases.filter((c) => getAssetUrl('bodies', c.id)).length / activeBases.length) * 100)}%`
                      : '0%'}
                  </div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all"
                    style={{ width: activeBases.length > 0 ? `${(activeBases.filter((c) => getAssetUrl('bodies', c.id)).length / activeBases.length) * 100}%` : '0%' }}
                  />
                </div>
              </div>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-gray-500">Sprite Size (px)</label>
                  <input
                    type="number"
                    min="16"
                    max="128"
                    step="8"
                    value={genSize}
                    onChange={(e) => setGenSize(Math.max(16, Math.min(128, Number(e.target.value) || 48)))}
                    className="mt-1 block h-8 w-full rounded-md border border-white/[0.08] bg-black/30 px-2 text-right font-mono text-[12px] tabular-nums text-white outline-none focus:border-cyan-400/60"
                  />
                </div>
                <button
                  type="button"
                  disabled={batchGenerating}
                  onClick={async () => {
                    setBatchGenerating(true);
                    try {
                      const pending = activeBases.filter((c) => !getAssetUrl('bodies', c.id) && !genJobs[c.id]?.status?.match(/starting|processing/));
                      for (const c of pending) {
                        await generateAndWait(c);
                      }
                    } finally {
                      setBatchGenerating(false);
                    }
                  }}
                  className={`w-full rounded-lg border py-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] transition ${batchGenerating ? 'border-cyan-400/40 bg-cyan-400/[0.12] text-cyan-100' : 'border-cyan-300/30 bg-cyan-300/[0.08] text-cyan-200 hover:bg-cyan-300/[0.14]'}`}
                >
                  {batchGenerating ? 'Generating…' : 'Generate All Pending'}
                </button>
              </div>
              <p className="mt-4 text-[11px] leading-snug text-gray-500">
                Uses PixelLab&apos;s create-from-concept API. Each character&apos;s avatar is sent as the concept image and regenerated as an 8-direction pixel sprite.
              </p>
            </div>
          }
        >
          <div className="grid max-h-[42rem] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {activeBases.map((character) => {
              const bodyUrl = getAssetUrl('bodies', character.id);
              const job = genJobs[character.id];
              const isGenerating = job?.status === 'starting' || job?.status === 'processing';
              return (
                <div key={character.id} className={`rounded-2xl border p-3 ${isGenerating ? 'border-cyan-400/20 bg-cyan-400/[0.03]' : 'border-white/[0.08] bg-white/[0.025]'}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0915] p-1">
                      <img src={character.preview} alt={character.name} className="h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} />
                    </div>
                    <div className="text-[10px] font-bold text-gray-500">→</div>
                    {isGenerating ? (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-[#0a0915]">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
                      </div>
                    ) : bodyUrl ? (
                      <div className="group/upload relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-emerald-400/20 bg-[#0a0915] p-1">
                        <img src={`${bodyUrl}?t=${Date.now()}`} alt={`${character.name} body`} className="h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} />
                        <button
                          type="button"
                          onClick={() => deleteAsset('bodies', character.id)}
                          className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-rose-500/90 text-[8px] font-bold text-white group-hover/upload:flex"
                        >
                          x
                        </button>
                      </div>
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-white/[0.12] bg-[#0a0915]">
                        <span className="font-mono text-[8px] text-gray-600">—</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-2">
                    <div className="truncate font-display text-[13px] font-black tracking-tight text-white">{character.name}</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      {isGenerating ? (
                        <WeightPill tone="cyan">Generating…</WeightPill>
                      ) : job?.status === 'failed' ? (
                        <WeightPill tone="pink">Failed</WeightPill>
                      ) : bodyUrl ? (
                        <WeightPill tone="emerald">Generated</WeightPill>
                      ) : (
                        <WeightPill tone="amber">Pending</WeightPill>
                      )}
                      <span className="font-mono text-[9px] text-gray-600">{character.source === 'PIUGAME Avatar Shop' ? 'PIUGAME' : 'Custom'}</span>
                    </div>
                    {job?.error ? (
                      <div className="mt-1 truncate text-[10px] text-rose-300/70" title={job.error}>{job.error}</div>
                    ) : null}
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    {!bodyUrl && !isGenerating ? (
                      <button
                        type="button"
                        onClick={() => startGeneration(character)}
                        className="h-7 flex-1 rounded-md border border-cyan-300/25 bg-cyan-300/[0.06] font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-cyan-200 transition hover:bg-cyan-300/[0.12]"
                      >
                        Generate
                      </button>
                    ) : null}
                    {!bodyUrl && !isGenerating ? (
                      <UploadButton
                        assetUrl={null}
                        onUpload={(file) => uploadAsset('bodies', character.id, file)}
                        onDelete={() => {}}
                        label="Upload"
                      />
                    ) : !isGenerating ? (
                      <button
                        type="button"
                        onClick={() => startGeneration(character)}
                        className="h-7 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-gray-400 transition hover:text-cyan-200"
                      >
                        Regen
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionShell>

        <SectionShell
          index="04"
          eyebrow="Habitats"
          title="Elemental background distributions"
          aside={
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Habitat Logic</div>
              <p className="mt-3 text-[12px] leading-relaxed text-gray-400">
                Habitats are a rarity axis, not a background. Reuse one composition grid so boats, rocks, crystals, or firelight can vary while the pose stays untouched.
              </p>
              <div className="mt-4 border-t border-white/[0.06] pt-3">
                <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Active habitat weight</div>
                <div className="mt-1.5 font-display text-[2rem] font-black leading-none tabular-nums text-white">{totalHabitatWeight}</div>
              </div>
            </div>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {habitats.map((habitat) => (
              <HabitatCard
                key={habitat.id}
                habitat={habitat}
                onToggle={(id, checked) => updateHabitat(id, { active: checked })}
                onWeightChange={(id, value) => updateHabitat(id, { weight: clampWeight(value) })}
                backdropUrl={getAssetUrl('habitats', habitat.id)}
                onUpload={uploadAsset}
                onDelete={deleteAsset}
              />
            ))}
          </div>
        </SectionShell>

        <SectionShell
          index="05"
          eyebrow="Specials Gallery"
          title="Path A pilot — complete looks"
          aside={
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Unique Supply</div>
              <dl className="mt-3 space-y-3">
                <div className="flex items-baseline justify-between">
                  <dt className="text-[12px] text-gray-400">Target specials</dt>
                  <dd className="font-mono text-[11px] font-bold tabular-nums text-fuchsia-300">10</dd>
                </div>
                <div className="flex items-baseline justify-between">
                  <dt className="text-[12px] text-gray-400">Pilot generated</dt>
                  <dd className="font-mono text-[11px] font-bold tabular-nums text-fuchsia-300">
                    {SPECIAL_PILOT_ENTRIES.filter((s) => getAssetUrl(s.type, s.id)).length}/{SPECIAL_PILOT_ENTRIES.length}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between">
                  <dt className="text-[12px] text-gray-400">Uses per mint</dt>
                  <dd className="font-mono text-[11px] font-bold tabular-nums text-fuchsia-300">1</dd>
                </div>
              </dl>
              <p className="mt-4 text-[11px] leading-snug text-gray-500">
                Each complete-look special is one unified PixelLab generation — body, outfit, and accessories baked into a single cohesive sprite. Review the silhouettes below; if these land, the next batch scales to 10 unique complete looks.
              </p>
            </div>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {SPECIAL_PILOT_ENTRIES.map((special) => {
              const url = getAssetUrl(special.type, special.id);
              const isHabitat = special.type === 'habitats';
              return (
                <div
                  key={special.id}
                  className={`group relative overflow-hidden rounded-2xl border bg-[#0a0915] p-0 ring-1 ring-inset transition hover:-translate-y-0.5 ${special.ring} ${url ? 'border-white/[0.08]' : 'border-white/[0.04] opacity-60'}`}
                >
                  {/* Gradient aura — stronger for habitats so transparent PNG edges blend with the card */}
                  <div
                    className={`pointer-events-none absolute inset-0 bg-gradient-to-br transition ${isHabitat ? 'opacity-[0.55] group-hover:opacity-[0.7]' : 'opacity-[0.14] group-hover:opacity-[0.24]'} ${special.gradient}`}
                    aria-hidden
                  />
                  {/* Image area */}
                  <div className="relative flex aspect-square items-center justify-center overflow-hidden">
                    {/* Subtle checker + radial tint */}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_55%,rgba(255,255,255,0.04),transparent_65%)]" />
                    {url ? (
                      <img
                        src={`${url}?t=${Date.now()}`}
                        alt={special.name}
                        className={isHabitat
                          ? 'absolute inset-0 z-10 h-full w-full object-cover'
                          : 'relative z-10 max-h-[85%] max-w-[85%] object-contain'}
                        style={{ imageRendering: 'pixelated' }}
                      />
                    ) : (
                      <span className="relative z-10 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-gray-600">
                        Awaiting generation
                      </span>
                    )}
                    {/* Specials badge */}
                    {url ? (
                      <span
                        className={`absolute right-2 top-2 z-20 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] backdrop-blur ${special.chip}`}
                      >
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
                          <path d="M5 0l1.3 3.3L10 4.6 7 6.8 8 10 5 8 2 10l1-3.2L0 4.6l3.7-1.3z" />
                        </svg>
                        1 of 10
                      </span>
                    ) : null}
                  </div>
                  {/* Metadata footer */}
                  <div className="relative border-t border-white/[0.06] p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="font-display text-[15px] font-black leading-tight tracking-tight text-white">
                        {special.name}
                      </div>
                      <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-gray-500">
                        {special.category}
                      </div>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-gray-400">{special.theme}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-5 text-[11px] leading-relaxed text-gray-500">
            <span className="font-mono font-bold uppercase tracking-[0.16em] text-fuchsia-300/80">Pilot note · </span>
            Path A means each special is a complete, unified PixelLab character — no modular hat/outfit layers. If the art direction lands, the next batch generates 7 more unique complete looks (plus the existing 3) to hit 10 total, each with a distinct colour signature. The Mint Card Preview below lets you pair any complete-look character with a habitat backdrop.
          </p>
        </SectionShell>

        <SectionShell
          index="06"
          eyebrow="Mint Card Preview"
          title="Complete look on a habitat"
          aside={
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Asset Readiness</div>
              <dl className="mt-3 space-y-3">
                <div className="flex items-baseline justify-between">
                  <dt className="text-[12px] text-gray-400">Complete looks</dt>
                  <dd className="font-mono text-[11px] font-bold tabular-nums text-emerald-300">
                    {activeBases.filter((c) => getAssetUrl('bodies', c.id)).length}/{activeBases.length}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between">
                  <dt className="text-[12px] text-gray-400">Habitats</dt>
                  <dd className="font-mono text-[11px] font-bold tabular-nums text-emerald-300">
                    {activeHabitats.filter((h) => getAssetUrl('habitats', h.id)).length}/{activeHabitats.length}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-[11px] leading-snug text-gray-500">
                Under Path A each mint is a single unified character sprite — the only composition is character + habitat backdrop. No trait layers are stacked.
              </p>
            </div>
          }
        >
          <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
            <div className="relative flex h-72 w-72 items-center justify-center overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0915]">
              {compHabitat && getAssetUrl('habitats', compHabitat) ? (
                <img src={getAssetUrl('habitats', compHabitat)} alt="Habitat" className="absolute inset-0 h-full w-full object-cover" style={{ imageRendering: 'pixelated' }} />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-b from-slate-800/40 to-slate-900/80" />
              )}
              {compBase && getAssetUrl('bodies', compBase) ? (
                <img src={getAssetUrl('bodies', compBase)} alt="Body" className="relative z-10 h-56 w-56 object-contain" style={{ imageRendering: 'pixelated' }} />
              ) : null}
              {!compBase ? (
                <span className="relative z-30 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-gray-600">Select a complete look</span>
              ) : null}
            </div>
            <div className="space-y-4">
              <div>
                <label className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-gray-500">Complete Look</label>
                <select
                  value={compBase}
                  onChange={(e) => setCompBase(e.target.value)}
                  className="mt-1.5 block w-full rounded-md border border-white/[0.08] bg-black/30 px-3 py-2 text-[13px] text-white outline-none focus:border-cyan-400/60"
                >
                  <option value="">— select —</option>
                  {activeBases.filter((c) => getAssetUrl('bodies', c.id)).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-gray-500">Habitat</label>
                <select
                  value={compHabitat}
                  onChange={(e) => setCompHabitat(e.target.value)}
                  className="mt-1.5 block w-full rounded-md border border-white/[0.08] bg-black/30 px-3 py-2 text-[13px] text-white outline-none focus:border-cyan-400/60"
                >
                  <option value="">— none —</option>
                  {activeHabitats.filter((h) => getAssetUrl('habitats', h.id)).map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] leading-snug text-gray-500">
                No hat / outfit / eyewear selectors — every special bakes those into the sprite itself. That keeps silhouettes and palettes cohesive and removes alignment bugs between layers.
              </p>
              <button
                type="button"
                disabled={!compBase || !getAssetUrl('bodies', compBase)}
                onClick={exportComposite}
                className="mt-2 w-full rounded-lg border border-emerald-300/30 bg-emerald-300/[0.08] py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-200 transition hover:bg-emerald-300/[0.14] disabled:cursor-not-allowed disabled:opacity-30"
              >
                Export 512 &times; 512 PNG
              </button>
            </div>
          </div>
        </SectionShell>

        <SectionShell
          index="07"
          eyebrow="Distribution Readout"
          title="What the current weights imply"
          aside={
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Why this matters</div>
              <p className="mt-3 text-[12px] leading-relaxed text-gray-400">
                Cards mint progressively until all {mintSize} are claimed. This page should make it hard to accidentally overproduce a trait or underrepresent a base before the claim window opens.
              </p>
            </div>
          }
        >
          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Top Projected Identities</div>
                  <div className="mt-1 font-display text-[15px] font-black tracking-tight text-white">Share of the {mintSize} mint</div>
                </div>
                <label className="flex items-center gap-2">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-gray-500">Mint</span>
                  <input
                    type="number"
                    min="100"
                    max="10000"
                    step="100"
                    value={mintSize}
                    onChange={(event) => setMintSize(Math.max(100, Math.min(10000, clampWeight(event.target.value))))}
                    className="h-8 w-24 rounded-md border border-white/[0.08] bg-black/30 px-2 text-right font-mono text-[12px] tabular-nums text-white outline-none focus:border-cyan-400/60"
                  />
                </label>
              </div>
              <div className="mt-4 divide-y divide-white/[0.05] border-y border-white/[0.05]">
                {projectedTopBases.map((item) => {
                  const share = Math.round((item.weight / totalBaseWeight) * 100);
                  return (
                    <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto_3rem] items-center gap-4 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-white">{item.name}</div>
                        <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-gray-600">{item.source === 'PIUGAME Avatar Shop' ? 'PIUGAME' : 'Custom Hero'}</div>
                      </div>
                      <div className="font-display text-[15px] font-black tabular-nums text-cyan-300">{formatEstimate(item.estimate)}</div>
                      <div className="text-right font-mono text-[11px] tabular-nums text-gray-500">{share}%</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">Habitat Readiness</div>
                <div className="mt-3 divide-y divide-white/[0.05] border-y border-white/[0.05]">
                  {habitats.map((habitat) => {
                    const live = habitat.active !== false && habitat.weight > 0;
                    return (
                      <div key={habitat.id} className="flex items-baseline justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-white">{habitat.name}</div>
                          <div className="font-mono text-[10px] text-gray-600">weight {habitat.weight}{habitat.special ? ' · unique' : ''}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className={`font-display text-[13px] font-black tabular-nums ${live ? 'text-cyan-300' : 'text-gray-600'}`}>{live ? 'live' : 'off'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="border-l-2 border-cyan-300/40 pl-4">
                <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-cyan-300/80">Next Step</div>
                <p className="mt-2 text-[12px] leading-relaxed text-gray-400">
                  Path A is locked in. Next beats: define rarity tiers (common / rare / epic / legendary / unique) against the 1&#8239;000 supply, then wire the mint flow so pool weight becomes actual draw probability on chain.
                </p>
              </div>
            </div>
          </div>
        </SectionShell>
        </div>
      </div>
    </div>
  );
}
