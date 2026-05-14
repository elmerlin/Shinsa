/**
 * Pets API — wraps every endpoint under `/api/pets/*` declared in
 * `server/routes/pets.js`. Mirrors the response shape from the server's
 * `formatPet()` (loosely — many fields are stable scalars; nested config
 * blobs like `activities`, `toys`, `habitat_items`, `tricks` are exposed
 * via `Record<string, unknown>` arrays so we don't need to hand-mirror
 * the server's per-character/per-toy/per-trick rules.)
 *
 * Mini-games endpoints intentionally not wrapped here — mobile is
 * skipping them. If you need them later, add a `petMinigamesApi` wrapper.
 */
import type { ApiClient } from './client';

export type PetCharacterId = 'dojocat' | 'buu' | 'devit' | 'pixiu';

/** Most-used pet fields we type as concrete primitives. Nested rich
 *  fields (mastery, fashion, needs, etc.) stay as `Record<string,
 *  unknown>` so the mobile UI can read them without dragging the whole
 *  server config into TS. */
export interface Pet {
  character: PetCharacterId;
  nickname: string;

  // Vitals
  hunger: number;
  happiness: number;
  energy: number;
  trust: number;
  momentum: number;
  hype: number;
  bond: number;
  mood: string;
  mood_state: string;
  weight_state: string;
  bond_rank: number | string;

  // Progression
  experience: number;
  level: number;
  level_progress: number;
  current_level_xp: number;
  next_level_xp: number;
  highest_level: number;
  reward_multiplier: number;

  // Currencies (mine-only — public profile omits these)
  combo_balance?: number;
  bond_tokens?: number;
  rare_shards?: number;

  // Care state
  total_songs_fed: number;
  lifetime_feeds?: number;
  lifetime_activities?: number;
  daily_streak: number;
  longest_streak: number;
  interactions_today?: number;
  interaction_count?: number;
  taps_today?: number;
  tap_limit?: number;
  rest_cooldown?: number;
  neglect_strikes: number;
  last_fed_at?: string;
  last_food_id?: string;
  last_food_at?: string;
  last_toy_id?: string;
  last_toy_at?: string;
  last_trick_performed?: string;
  last_trick_at?: string;
  created_at?: string;

  // Identity / cosmetics
  identity_title?: string;
  is_pet_avatar?: number | boolean;
  equipped_hat?: string;
  equipped_belt?: string;
  equipped_shoes?: string;
  equipped_top?: string;
  hat_color?: string;
  belt_color?: string;
  shoes_color?: string;
  top_color?: string;

  // Habitat
  habitat?: {
    active_background?: string;
    active_prop?: string;
    active_floor?: string;
    active_wall?: string;
  };

  // Loose / nested config blobs
  needs?: Array<Record<string, unknown>>;
  recommended_actions?: Array<Record<string, unknown>>;
  current_request?: Record<string, unknown> | null;
  wellbeing?: Record<string, unknown>;
  progression?: Record<string, unknown>;
  food_preferences?: {
    favorites?: string[];
    dislikes?: string[];
    last_food_id?: string;
    last_food_at?: string;
  };
  personality?: { title?: string; desc?: string };
  specialty?: Record<string, unknown>;
  mastery?: Record<string, unknown>;
  form?: Record<string, unknown>;
  fashion?: Record<string, unknown>;
  owned_items?: string[];
  owned_toys?: string[];
  owned_habitat_items?: string[];
  tricks?: PetTrick[];
  tricks_unlocked?: string[];
  next_trick?: PetTrick & { xp_remaining?: number; progress?: number };
  pending_trick?: string;
  trick_demand_level?: number;
  trick_demand_grade?: string;
  activities?: PetActivity[];
  toys?: PetToy[];
  habitat_items?: {
    backgrounds?: PetHabitatItem[];
    props?: PetHabitatItem[];
    floor?: PetHabitatItem[];
    wall?: PetHabitatItem[];
  };
  missions?: Array<Record<string, unknown>>;
  memories?: Array<Record<string, unknown>>;
  milestones?: Array<Record<string, unknown>>;
  activity_summary?: Record<string, unknown>;
  time_greeting?: string;
}

export interface PetActivity {
  id: string;
  label: string;
  description?: string;
  emoji?: string;
  costs?: Array<{ stat: string; value: number }>;
  gains?: Array<{ stat: string; value: number }>;
  locked?: boolean;
  lock_reason?: string;
  minTrust?: number;
  minEnergy?: number;
  [key: string]: unknown;
}

export interface PetTrick {
  id: string;
  name: string;
  description?: string;
  xp: number;
  unlocked?: boolean;
  progress?: number;
  emoji?: string;
}

export interface PetToy {
  id: string;
  name: string;
  cost: number;
  emoji?: string;
  desc?: string;
  owned?: boolean;
  preference?: string;
  category?: string;
  [key: string]: unknown;
}

export interface PetHabitatItem {
  id: string;
  name: string;
  cost?: number;
  desc?: string;
  emoji?: string;
  owned?: boolean;
  active?: boolean;
  locked?: boolean;
  lock_reason?: string;
  category?: string;
  default_owned?: boolean;
  minBond?: number;
  minMastery?: number;
  [key: string]: unknown;
}

export interface PetFood {
  id: string;
  name: string;
  cost: number;
  hunger: number;
  happiness: number;
  emoji?: string;
  desc?: string;
  preference?: 'favorite' | 'disliked' | 'neutral' | string;
}

export interface PetClothingItem {
  id: string;
  name: string;
  cost: number;
  desc?: string;
  emoji?: string;
  owned?: boolean;
  category?: string;
  [key: string]: unknown;
}

export interface PetEconomy {
  target_songs_per_week?: number;
  weekly_hunger_upkeep?: number;
  weekly_happiness_upkeep?: number;
  currencies?: Record<string, { name: string; desc: string; icon: string }>;
  sinks?: string[];
}

export interface PetShopResponse {
  combo_balance: number;
  economy: PetEconomy;
  foods: PetFood[];
  clothing: {
    hats: PetClothingItem[];
    tops?: PetClothingItem[];
    belts: PetClothingItem[];
    shoes: PetClothingItem[];
  };
  toys: PetToy[];
  habitat: {
    backgrounds: PetHabitatItem[];
    props: PetHabitatItem[];
    floor: PetHabitatItem[];
    wall: PetHabitatItem[];
  };
}

export interface PetMeResponse {
  pet: Pet | null;
  economy: PetEconomy;
}

export interface PublicPetResponse {
  pet: Pet | null;
  username?: string;
}

export interface PetCharacterMeta {
  id: PetCharacterId;
  name: string;
  tricks: { id: string; name: string; xp: number }[];
}

export interface PetCharactersResponse {
  characters: PetCharacterMeta[];
}

export interface PetLeaderboardEntry {
  rank: number;
  username: string;
  user_id?: string;
  character: PetCharacterId;
  level: number;
  experience: number;
  bond: number;
  bond_rank?: number | string;
  mastery_xp?: number;
  form?: Record<string, unknown>;
  identity_title?: string;
  nickname?: string;
  is_pet_avatar?: number;
  [key: string]: unknown;
}

export interface PetLeaderboardResponse {
  entries: PetLeaderboardEntry[];
}

export interface PetCurrentRequestResponse {
  request: Record<string, unknown> | null;
}

export interface PetSocialReactResponse {
  ok: boolean;
  reactions?: Record<string, number>;
  [key: string]: unknown;
}

export interface PetSocialGiftResponse {
  ok: boolean;
  pet?: Pet;
  [key: string]: unknown;
}

export interface PetSocialFeedSummary {
  pets?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/** Common return shape for endpoints that mutate the pet and echo it
 *  back. Some also include a contextual message ('item', 'toy', etc). */
export interface PetMutationResponse {
  pet: Pet;
  item?: string;
  toy?: string;
  message?: string;
  [key: string]: unknown;
}

export function createPetsApi(client: ApiClient) {
  return {
    /** Current viewer's pet + economy. `pet === null` means not adopted. */
    me() {
      return client.request<PetMeResponse>('/api/pets/me');
    },
    /** Public pet view of any user (used on profile + leaderboard tap). */
    user(userId: string) {
      return client.request<PublicPetResponse>(`/api/pets/user/${encodeURIComponent(userId)}`);
    },
    adopt(character: PetCharacterId) {
      return client.request<{ pet: Pet }>('/api/pets/adopt', {
        method: 'POST',
        body: { character },
      });
    },
    rename(nickname: string) {
      return client.request<{ pet: Pet }>('/api/pets/rename', {
        method: 'POST',
        body: { nickname },
      });
    },
    shop() {
      return client.request<PetShopResponse>('/api/pets/shop');
    },
    buyFood(foodId: string) {
      return client.request<PetMutationResponse>('/api/pets/buy-food', {
        method: 'POST',
        body: { foodId },
      });
    },
    buyItem(itemId: string) {
      return client.request<PetMutationResponse>('/api/pets/buy-item', {
        method: 'POST',
        body: { itemId },
      });
    },
    buyToy(toyId: string) {
      return client.request<PetMutationResponse>('/api/pets/buy-toy', {
        method: 'POST',
        body: { toyId },
      });
    },
    buyHabitatItem(itemId: string) {
      return client.request<PetMutationResponse>('/api/pets/buy-habitat-item', {
        method: 'POST',
        body: { itemId },
      });
    },
    /** Equip a habitat item. `slot` is the item kind: bg / prop / floor / wall. */
    equipHabitat(itemId: string) {
      return client.request<PetMutationResponse>('/api/pets/equip-habitat', {
        method: 'POST',
        body: { itemId },
      });
    },
    setTrainingPath(pathId: string) {
      return client.request<PetMutationResponse>('/api/pets/training-path', {
        method: 'POST',
        body: { pathId },
      });
    },
    coachAck(coachId: string) {
      return client.request<PetMutationResponse>('/api/pets/coach-ack', {
        method: 'POST',
        body: { coachId },
      });
    },
    /** Equip a clothing item. Server figures out the slot from the item id. */
    equip(itemId: string) {
      return client.request<PetMutationResponse>('/api/pets/equip', {
        method: 'POST',
        body: { itemId },
      });
    },
    setColor(slot: 'hat' | 'belt' | 'shoes' | 'top', color: string) {
      return client.request<PetMutationResponse>('/api/pets/set-color', {
        method: 'POST',
        body: { slot, color },
      });
    },
    /** Toggle whether the pet appears as the user's avatar. */
    toggleAvatar() {
      return client.request<PetMutationResponse>('/api/pets/toggle-avatar', {
        method: 'POST',
      });
    },
    /** Old-style "feed one song" endpoint (used by sync hooks). */
    feed(songCount = 1) {
      return client.request<PetMutationResponse>('/api/pets/feed', {
        method: 'POST',
        body: { songCount },
      });
    },
    currentRequest() {
      return client.request<PetCurrentRequestResponse>('/api/pets/requests/current');
    },
    completeRequest() {
      return client.request<PetMutationResponse>('/api/pets/requests/current/complete', {
        method: 'POST',
      });
    },
    dismissRequest() {
      return client.request<PetMutationResponse>('/api/pets/requests/current/dismiss', {
        method: 'POST',
      });
    },
    /** Generic interaction. `actionId`: 'tap' | 'praise' | 'cuddle' | 'tease' | 'perform' | … */
    interact(actionId: string) {
      return client.request<PetMutationResponse>('/api/pets/interact', {
        method: 'POST',
        body: { actionId },
      });
    },
    /** Trigger a named activity (rest, train, spar, explore, …). */
    activity(activityId: string) {
      return client.request<PetMutationResponse>(
        `/api/pets/activities/${encodeURIComponent(activityId)}`,
        { method: 'POST' },
      );
    },
    useToy(toyId: string) {
      return client.request<PetMutationResponse>(
        `/api/pets/toys/${encodeURIComponent(toyId)}/use`,
        { method: 'POST' },
      );
    },
    claimMission(missionId: string) {
      return client.request<PetMutationResponse>(
        `/api/pets/missions/${encodeURIComponent(missionId)}/claim`,
        { method: 'POST' },
      );
    },
    demandTrick(trickId: string) {
      return client.request<PetMutationResponse>(
        `/api/pets/tricks/${encodeURIComponent(trickId)}/demand`,
        { method: 'POST' },
      );
    },
    performTrick(trickId: string) {
      return client.request<PetMutationResponse>(
        `/api/pets/tricks/${encodeURIComponent(trickId)}/perform`,
        { method: 'POST' },
      );
    },
    /** Catalog of available characters (id, name, tricks). Used by the
     *  adoption screen + character-swap UI. Public, no auth needed. */
    characters() {
      return client.request<PetCharactersResponse>('/api/pets/characters');
    },
    leaderboard() {
      return client.request<PetLeaderboardResponse>('/api/pets/leaderboard');
    },
    socialReact(targetUserId: string, reaction: string) {
      return client.request<PetSocialReactResponse>('/api/pets/social/react', {
        method: 'POST',
        body: { targetUserId, reaction },
      });
    },
    socialGift(targetUserId: string, giftId: string) {
      return client.request<PetSocialGiftResponse>('/api/pets/social/gift', {
        method: 'POST',
        body: { targetUserId, giftId },
      });
    },
    socialFeedSummary() {
      return client.request<PetSocialFeedSummary>('/api/pets/social/feed-summary');
    },
  };
}

export type PetsApi = ReturnType<typeof createPetsApi>;
