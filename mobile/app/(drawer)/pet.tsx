/**
 * Pet hub. One screen, vertically scrollable, that wraps the whole pet
 * experience minus mini-games:
 *   • Hero: character art (emoji for now, swap to sprite later) on a
 *     character-tinted gradient, with name, identity title, level, mood.
 *   • Vitals strip: hunger / happiness / energy / trust / momentum bars
 *     with critical-tier glows.
 *   • Currencies row: combo / bond tokens / rare shards.
 *   • Current request card (if any): accept / dismiss.
 *   • Recommended actions: server-derived list of "do this next" hints.
 *   • Care actions: tap / praise / cuddle / tease / perform.
 *   • Activities: real-time gated by trust/energy/etc. Each renders its
 *     cost / gain breakdown.
 *   • Tabs at the bottom for Tricks / Missions / Toys / Habitat / Shop /
 *     Customize / Leaderboard. Each tab body is rendered inline below
 *     the tab strip — no extra navigation needed.
 *   • If no pet exists yet, show the four-character adoption picker.
 *
 * Mini-games are intentionally not wired here. Add a `Play` tab later
 * if/when those screens come over.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageStyle,
  type StyleProp,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CosmeticPreview, HabitatScene, PropMini } from '@/components/pet-visuals';
import SpritePet from '@/components/sprite-pet';
import { TopBar } from '@/components/top-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { petsApi } from '@/lib/api';
import {
  clampStat,
  moodEmoji,
  petCharacterEmoji,
  petCharacterGradient,
  petCharacterName,
  petCharacterTagline,
  statTier,
  VITALS,
} from '@/lib/pets';
import { PET_UI_ASSETS, type PetUiAssetKey } from '@/lib/pet-ui-assets';
import type { ThemeColors } from '@/constants/theme';
import type { Pet, PetActivity, PetCharacterId, PetTrick } from '@shared/api';

type TabKey = 'tricks' | 'missions' | 'toys' | 'outfits' | 'habitat' | 'shop' | 'customize' | 'leaderboard';

const TABS: { key: TabKey; label: string; asset: PetUiAssetKey }[] = [
  { key: 'tricks',      label: 'Tricks',      asset: 'trick' },
  { key: 'missions',    label: 'Missions',    asset: 'mission' },
  { key: 'toys',        label: 'Toys',        asset: 'toy' },
  { key: 'outfits',     label: 'Outfits',     asset: 'outfit' },
  { key: 'habitat',     label: 'Habitat',     asset: 'habitat' },
  { key: 'shop',        label: 'Shop',        asset: 'shop' },
  { key: 'customize',   label: 'Customize',   asset: 'groom' },
  { key: 'leaderboard', label: 'Leaderboard', asset: 'leaderboard' },
];

const VITAL_ASSETS: Record<(typeof VITALS)[number]['key'], PetUiAssetKey> = {
  hunger: 'food',
  happiness: 'happy',
  energy: 'energy',
  trust: 'trust',
  momentum: 'momentum',
};

const CURRENCY_ASSETS = [
  { key: 'combo_balance', label: 'COMBO', asset: 'trick' as const },
  { key: 'bond_tokens', label: 'TOKENS', asset: 'trust' as const },
  { key: 'rare_shards', label: 'SHARDS', asset: 'happy' as const },
  { key: 'daily_streak', label: 'STREAK', asset: 'momentum' as const },
];

function PetArt({
  asset,
  size = 24,
  style,
  dimmed = false,
}: {
  asset: PetUiAssetKey;
  size?: number;
  style?: StyleProp<ImageStyle>;
  dimmed?: boolean;
}) {
  return (
    <Image
      source={PET_UI_ASSETS[asset]}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
      style={[{ width: size, height: size }, dimmed && { opacity: 0.5 }, style]}
    />
  );
}

function CostPill({ cost, s }: { cost: number | undefined | null; s: Styles }) {
  return (
    <View style={s.costPill}>
      <PetArt asset="trick" size={14} />
      <Text style={s.shopCost}>{(Number(cost) || 0).toLocaleString()}</Text>
    </View>
  );
}

export default function PetScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { isDesktop } = useBreakpoint();
  const s = useThemedStyles(makeStyles);
  const [tab, setTab] = useState<TabKey>('tricks');

  const meQuery = useQuery({
    queryKey: ['pet-me', user?.id ?? null],
    queryFn: () => petsApi.me(),
    enabled: !!user,
  });

  if (!user) {
    return (
      <View style={s.container}>
        <View style={[s.headerBar, { paddingTop: insets.top + 8 }]}>
          {isDesktop ? <Text style={s.deskHeading}>Pet</Text> : null}
          <TopBar />
        </View>
        <View style={s.empty}>
          <Text style={s.emptyEmoji}>🐾</Text>
          <Text style={s.emptyTitle}>Sign in to adopt a pet</Text>
        </View>
      </View>
    );
  }

  if (meQuery.isLoading) {
    return (
      <View style={s.container}>
        <View style={[s.headerBar, { paddingTop: insets.top + 8 }]}>
          {isDesktop ? <Text style={s.deskHeading}>Pet</Text> : null}
          <TopBar />
        </View>
        <View style={s.empty}><ActivityIndicator color={theme.spinner} /></View>
      </View>
    );
  }

  // Adoption flow when no pet has been claimed yet.
  if (!meQuery.data?.pet) {
    return (
      <AdoptScreen
        s={s}
        topBar={
          <View style={[s.headerBar, { paddingTop: insets.top + 8 }]}>
            {isDesktop ? <Text style={s.deskHeading}>Pet</Text> : null}
            <TopBar />
          </View>
        }
      />
    );
  }

  const pet = meQuery.data.pet;

  return (
    <View style={s.container}>
      <View style={[s.headerBar, { paddingTop: insets.top + 8 }]}>
        {isDesktop ? <Text style={s.deskHeading}>Pet</Text> : null}
        <TopBar />
      </View>

      <ScrollView
        contentContainerStyle={[
          s.scroll,
          isDesktop && s.scrollDesktop,
          { paddingBottom: insets.bottom + 80 },
        ]}
        showsVerticalScrollIndicator={false}>
        {/* Desktop: 2-col grid (main + helper rail with the live
            HabitatScene). The main column hosts hero + actions; the
            rail anchors the actual habitat preview so the pet is
            always visible while you scroll the action stack. */}
        <View style={isDesktop ? s.deskGrid : undefined}>
          <View style={isDesktop ? s.deskMain : undefined}>
            <PetHero pet={pet} s={s} compact={isDesktop} />
            <CurrenciesRow pet={pet} s={s} />
            <VitalsCard pet={pet} s={s} />
            <CurrentRequestCard pet={pet} s={s} />
            <RecommendedActionsCard pet={pet} s={s} />
            <CareActionsCard pet={pet} s={s} />
            <ActivitiesCard pet={pet} s={s} />
          </View>
          {isDesktop ? (
            <View style={s.deskRail}>
              <View style={s.card}>
                <Text style={s.cardEyebrow}>HABITAT</Text>
                <HabitatScene pet={pet} height={300} />
              </View>
            </View>
          ) : null}
        </View>

        <View style={isDesktop ? s.deskGrid : s.lowerSection}>
          <View style={isDesktop ? s.deskMain : undefined}>
            <View style={s.tabStrip}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabRow}>
                {TABS.map((t) => {
                  const active = tab === t.key;
                  return (
                    <Pressable
                      key={t.key}
                      onPress={() => setTab(t.key)}
                      style={({ pressed }) => [
                        s.tabBtn,
                        active && s.tabBtnActive,
                        pressed && { opacity: 0.7 },
                      ]}>
                      <View style={s.tabBtnContent}>
                        <PetArt asset={t.asset} size={18} dimmed={!active} />
                        <Text style={[s.tabText, active && s.tabTextActive]}>{t.label}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {tab === 'tricks'      ? <TricksTab pet={pet} s={s} /> : null}
            {tab === 'missions'    ? <MissionsTab pet={pet} s={s} /> : null}
            {tab === 'toys'        ? <ToysTab pet={pet} s={s} /> : null}
            {tab === 'outfits'     ? <OutfitsTab pet={pet} s={s} /> : null}
            {tab === 'habitat'     ? <HabitatTab pet={pet} s={s} /> : null}
            {tab === 'shop'        ? <ShopTab pet={pet} s={s} /> : null}
            {tab === 'customize'   ? <CustomizeTab pet={pet} s={s} onOpenLeaderboard={() => setTab('leaderboard')} /> : null}
            {tab === 'leaderboard' ? <LeaderboardTab s={s} onOpenUser={(id) => router.push({ pathname: '/profile/[id]', params: { id } })} /> : null}
          </View>
          {isDesktop ? <View style={s.deskRailSpacer} /> : null}
        </View>
      </ScrollView>
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════
 * OUTFITS TAB — owned clothing + equip + per-slot color picker
 * ══════════════════════════════════════════════════════════════════ */

const COLOR_PALETTE = [
  '#ffc400', '#fb7185', '#f43f5e', '#a78bfa', '#7dd3fc',
  '#34d399', '#fbbf24', '#fb923c', '#cbd5e1', '#1f2937',
];

const SLOTS: { kind: 'hat' | 'top' | 'belt' | 'shoes'; label: string; equipped: keyof Pet; color: keyof Pet }[] = [
  { kind: 'hat',   label: 'Hat',   equipped: 'equipped_hat',   color: 'hat_color' },
  { kind: 'top',   label: 'Top',   equipped: 'equipped_top',   color: 'top_color' },
  { kind: 'belt',  label: 'Belt',  equipped: 'equipped_belt',  color: 'belt_color' },
  { kind: 'shoes', label: 'Shoes', equipped: 'equipped_shoes', color: 'shoes_color' },
];

function OutfitsTab({ pet, s }: { pet: Pet; s: Styles }) {
  const queryClient = useQueryClient();
  const shopQuery = useQuery({ queryKey: ['pet-shop'], queryFn: () => petsApi.shop() });
  const equip = useMutation({
    mutationFn: (id: string) => petsApi.equip(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pet-me'] }),
    onError: (e: unknown) => Alert.alert('Hmm', e instanceof Error ? e.message : 'Equip failed'),
  });
  const setColor = useMutation({
    mutationFn: ({ slot, color }: { slot: 'hat' | 'belt' | 'shoes' | 'top'; color: string }) =>
      petsApi.setColor(slot, color),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pet-me'] }),
    onError: (e: unknown) => Alert.alert('Hmm', e instanceof Error ? e.message : 'Color change failed'),
  });

  if (shopQuery.isLoading) return <View style={s.empty}><ActivityIndicator /></View>;
  const clothing = shopQuery.data?.clothing;
  if (!clothing) return <EmptyTab s={s} text="Outfits unavailable right now." />;

  return (
    <View style={s.tabBody}>
      {SLOTS.map((slot) => {
        const items = (clothing[slot.kind === 'hat' ? 'hats' : slot.kind === 'top' ? 'tops' : slot.kind === 'belt' ? 'belts' : 'shoes'] ?? []) as Record<string, unknown>[];
        const owned = items.filter((it) => it.owned);
        const currentId = String(pet[slot.equipped] ?? '');
        const currentColor = String(pet[slot.color] ?? '');
        return (
          <View key={slot.kind} style={s.outfitSection}>
            <View style={s.outfitHeader}>
              <Text style={s.cardEyebrow}>{slot.label.toUpperCase()}</Text>
              {currentId ? (
                <Pressable
                  onPress={() => equip.mutate(currentId)}
                  style={({ pressed }) => [s.outfitUnequip, pressed && { opacity: 0.7 }]}>
                  <Text style={s.outfitUnequipText}>Tap equipped item to unequip</Text>
                </Pressable>
              ) : null}
            </View>
            {owned.length === 0 ? (
              <Text style={s.outfitEmpty}>None owned. Find {slot.label.toLowerCase()} in Shop → Clothing.</Text>
            ) : (
              <View style={s.outfitGrid}>
                {owned.map((it) => {
                  const id = String(it.id);
                  const isEquipped = currentId === id;
                  return (
                    <Pressable
                      key={id}
                      onPress={() => equip.mutate(id)}
                      disabled={equip.isPending}
                      style={({ pressed }) => [
                        s.outfitCard,
                        isEquipped && s.outfitCardActive,
                        pressed && { opacity: 0.85 },
                      ]}>
                      <CosmeticPreview
                        kind={slot.kind}
                        id={id}
                        color={isEquipped ? currentColor : ''}
                        character={pet.character}
                        weightState={pet.weight_state}
                        size={64}
                      />
                      <Text style={s.outfitName} numberOfLines={1}>{String(it.name)}</Text>
                      {isEquipped ? <Text style={s.outfitBadge}>EQUIPPED</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
            {currentId ? (
              <View style={s.colorRow}>
                <Text style={s.colorLabel}>Color</Text>
                {COLOR_PALETTE.map((c) => {
                  const active = currentColor === c;
                  return (
                    <Pressable
                      key={c}
                      onPress={() => setColor.mutate({ slot: slot.kind, color: c })}
                      disabled={setColor.isPending}
                      style={({ pressed }) => [
                        s.colorSwatch,
                        { backgroundColor: c },
                        active && s.colorSwatchActive,
                        pressed && { opacity: 0.7 },
                      ]} />
                  );
                })}
                <Pressable
                  onPress={() => setColor.mutate({ slot: slot.kind, color: '' })}
                  style={({ pressed }) => [s.colorReset, pressed && { opacity: 0.7 }]}>
                  <Text style={s.colorResetText}>Reset</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════
 * ADOPTION
 * ══════════════════════════════════════════════════════════════════ */

function AdoptScreen({ s, topBar }: { s: Styles; topBar: React.ReactNode }) {
  const queryClient = useQueryClient();
  const charactersQuery = useQuery({
    queryKey: ['pet-characters'],
    queryFn: () => petsApi.characters(),
    staleTime: 5 * 60_000,
  });
  const adopt = useMutation({
    mutationFn: (id: PetCharacterId) => petsApi.adopt(id),
    onSuccess: (data) => {
      queryClient.setQueryData(['pet-me', undefined as unknown as string | null], data);
      queryClient.invalidateQueries({ queryKey: ['pet-me'] });
    },
  });

  return (
    <View style={s.container}>
      {topBar}
      <ScrollView contentContainerStyle={s.adoptScroll}>
        <Text style={s.adoptTitle}>Pick your training partner</Text>
        <Text style={s.adoptSub}>
          Each character has a different personality, food preferences, and trick set.
          You can change your mind later — they will still remember you.
        </Text>

        <View style={s.adoptGrid}>
          {(charactersQuery.data?.characters ?? []).map((c) => (
            <Pressable
              key={c.id}
              onPress={() => adopt.mutate(c.id)}
              disabled={adopt.isPending}
              style={({ pressed }) => [s.adoptCard, pressed && { opacity: 0.85 }]}>
              <LinearGradient
                colors={petCharacterGradient(c.id)}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.adoptHero}>
                <Text style={s.adoptEmoji}>{petCharacterEmoji(c.id)}</Text>
              </LinearGradient>
              <Text style={s.adoptName}>{c.name}</Text>
              <Text style={s.adoptTagline} numberOfLines={3}>
                {petCharacterTagline(c.id)}
              </Text>
              <View style={s.adoptTrickRow}>
                {c.tricks.slice(0, 3).map((t) => (
                  <Text key={t.id} style={s.adoptTrickPill}>
                    {t.name}
                  </Text>
                ))}
              </View>
              <View style={s.adoptCta}>
                <Text style={s.adoptCtaText}>
                  {adopt.isPending ? 'Adopting…' : 'Adopt'}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════
 * HERO
 * ══════════════════════════════════════════════════════════════════ */

function PetHero({ pet, s, compact = false }: { pet: Pet; s: Styles; compact?: boolean }) {
  const gradient = petCharacterGradient(pet.character);
  const name = pet.nickname || petCharacterName(pet.character);
  const identityTitle = String(pet.identity_title || '').trim();
  const xpProgress = Math.max(0, Math.min(1, Number(pet.level_progress) || 0));
  const xpNow = Number(pet.current_level_xp) || 0;
  const xpNext = Number(pet.next_level_xp) || 0;
  const petSize = compact ? 80 : 120;

  return (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={s.hero}>
      <View style={[s.heroPetWrap, { width: petSize, height: petSize }]}>
        {/* Animated pixel-art pet on web; emoji fallback on native.
            See `mobile/components/sprite-pet.tsx` for the platform
            split — `.web.jsx` ships the full 2-D box-shadow renderer
            with idle/blink/tail-wag frames. */}
        <SpritePet
          character={pet.character}
          weightState={pet.weight_state}
          mood={pet.mood}
          equippedHat={pet.equipped_hat}
          equippedBelt={pet.equipped_belt}
          equippedShoes={pet.equipped_shoes}
          equippedTop={pet.equipped_top}
          hatColor={pet.hat_color}
          beltColor={pet.belt_color}
          shoesColor={pet.shoes_color}
          topColor={pet.top_color}
          size={petSize}
        />
        <View style={s.heroMoodBubble}>
          <Text style={s.heroMoodEmoji}>{moodEmoji(pet.mood)}</Text>
        </View>
      </View>
      <View style={s.heroBody}>
        <Text style={s.heroName} numberOfLines={1}>{name}</Text>
        {identityTitle ? (
          <Text style={s.heroIdentity} numberOfLines={2}>{identityTitle}</Text>
        ) : null}
        <View style={s.heroLevelRow}>
          <Text style={s.heroLevel}>LV {pet.level}</Text>
          <Text style={s.heroMood}>{pet.mood || '—'}</Text>
        </View>
        <View style={s.heroXpBar}>
          <View style={[s.heroXpFill, { width: `${Math.round(xpProgress * 100)}%` }]} />
        </View>
        <Text style={s.heroXpText}>
          {xpNow.toLocaleString()} / {xpNext.toLocaleString()} XP
        </Text>
      </View>
    </LinearGradient>
  );
}

/* ════════════════════════════════════════════════════════════════════
 * CURRENCIES
 * ══════════════════════════════════════════════════════════════════ */

function CurrenciesRow({ pet, s }: { pet: Pet; s: Styles }) {
  return (
    <View style={s.currencyRow}>
      {CURRENCY_ASSETS.map((c) => {
        const raw = Number((pet as unknown as Record<string, number | undefined>)[c.key]) || 0;
        const value = c.key === 'daily_streak' ? `${raw}d` : raw.toLocaleString();
        return (
          <View key={c.key} style={s.currencyTile}>
            <View style={s.currencyIcon}>
              <PetArt asset={c.asset} size={28} />
            </View>
            <Text style={s.currencyValue}>{value}</Text>
            <Text style={s.currencyLabel}>{c.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════
 * VITALS
 * ══════════════════════════════════════════════════════════════════ */

function VitalsCard({ pet, s }: { pet: Pet; s: Styles }) {
  return (
    <View style={s.card}>
      <Text style={s.cardEyebrow}>VITALS</Text>
      {VITALS.map((v) => {
        const value = clampStat((pet as unknown as Record<string, number>)[v.key]);
        const tier = statTier(value);
        return (
          <View key={v.key} style={s.vitalRow}>
            <View style={s.vitalIcon}>
              <PetArt asset={VITAL_ASSETS[v.key]} size={24} />
            </View>
            <View style={s.vitalBody}>
              <View style={s.vitalLabelRow}>
                <Text style={s.vitalLabel}>{v.label}</Text>
                <Text style={[s.vitalValue, tier === 'critical' && { color: '#fda4af' }, tier === 'low' && { color: '#fbbf24' }]}>
                  {value}
                </Text>
              </View>
              <View style={s.vitalBar}>
                <View
                  style={[
                    s.vitalFill,
                    {
                      width: `${value}%`,
                      backgroundColor: tier === 'critical' ? '#fb7185' : tier === 'low' ? '#fbbf24' : v.color,
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════
 * CURRENT REQUEST
 * ══════════════════════════════════════════════════════════════════ */

function CurrentRequestCard({ pet, s }: { pet: Pet; s: Styles }) {
  const queryClient = useQueryClient();
  const req = pet.current_request as Record<string, unknown> | null;
  const complete = useMutation({
    mutationFn: () => petsApi.completeRequest(),
    onSuccess: (data) => {
      if (data?.pet) queryClient.setQueryData(['pet-me', undefined], { pet: data.pet, economy: undefined });
      queryClient.invalidateQueries({ queryKey: ['pet-me'] });
    },
  });
  const dismiss = useMutation({
    mutationFn: () => petsApi.dismissRequest(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pet-me'] }),
  });
  if (!req) return null;
  return (
    <View style={[s.card, { borderColor: 'rgba(255,196,0,0.4)' }]}>
      <Text style={[s.cardEyebrow, { color: '#FFC400' }]}>YOUR PET WANTS…</Text>
      <Text style={s.requestTitle}>{String(req.title || req.label || 'A favour')}</Text>
      {req.description ? (
        <Text style={s.requestDesc}>{String(req.description)}</Text>
      ) : null}
      {req.reward_summary ? (
        <Text style={s.requestReward}>Reward: {String(req.reward_summary)}</Text>
      ) : null}
      <View style={s.requestActions}>
        <Pressable
          onPress={() => complete.mutate()}
          disabled={complete.isPending}
          style={({ pressed }) => [s.btnPrimary, pressed && { opacity: 0.8 }]}>
          <Text style={s.btnPrimaryText}>{complete.isPending ? 'Completing…' : 'Complete'}</Text>
        </Pressable>
        <Pressable
          onPress={() => dismiss.mutate()}
          disabled={dismiss.isPending}
          style={({ pressed }) => [s.btnGhost, pressed && { opacity: 0.7 }]}>
          <Text style={s.btnGhostText}>Dismiss</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════
 * RECOMMENDED ACTIONS
 * ══════════════════════════════════════════════════════════════════ */

function RecommendedActionsCard({ pet, s }: { pet: Pet; s: Styles }) {
  const recs = pet.recommended_actions ?? [];
  if (recs.length === 0) return null;
  return (
    <View style={s.card}>
      <Text style={s.cardEyebrow}>DO NEXT</Text>
      {recs.slice(0, 4).map((r, i) => (
        <View key={i} style={s.recRow}>
          <View style={s.recIcon}>
            <PetArt asset={recommendedActionAsset(r)} size={22} />
          </View>
          <Text style={s.recText}>{String(r.label || r.text || r.message || '')}</Text>
        </View>
      ))}
    </View>
  );
}

function recommendedActionAsset(action: unknown): PetUiAssetKey {
  const r = action as Record<string, unknown>;
  return petAssetFromText(`${String(r.id || '')} ${String(r.label || '')} ${String(r.text || '')} ${String(r.message || '')}`, 'happy');
}

/* ════════════════════════════════════════════════════════════════════
 * CARE ACTIONS — interact endpoint
 * ══════════════════════════════════════════════════════════════════ */

const CARE_ACTIONS = [
  { id: 'tap',     label: 'Tap',     asset: 'trust', tone: '#A8A8AE' },
  { id: 'praise',  label: 'Praise',  asset: 'happy', tone: '#FDE047' },
  { id: 'cuddle',  label: 'Cuddle',  asset: 'trust', tone: '#FB7185' },
  { id: 'tease',   label: 'Tease',   asset: 'toy', tone: '#A78BFA' },
  { id: 'perform', label: 'Perform', asset: 'trick', tone: '#FFC400' },
] as const;

function CareActionsCard({ pet: _pet, s }: { pet: Pet; s: Styles }) {
  const queryClient = useQueryClient();
  const interact = useMutation({
    mutationFn: (actionId: string) => petsApi.interact(actionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pet-me'] }),
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Could not interact right now';
      Alert.alert('Hmm', msg);
    },
  });
  return (
    <View style={s.card}>
      <Text style={s.cardEyebrow}>CARE</Text>
      <View style={s.careRow}>
        {CARE_ACTIONS.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => interact.mutate(a.id)}
            disabled={interact.isPending}
            style={({ pressed }) => [
              s.careBtn,
              { borderColor: a.tone, backgroundColor: `${a.tone}18` },
              pressed && { opacity: 0.8 },
            ]}>
            <PetArt asset={a.asset} size={28} />
            <Text style={[s.careLabel, { color: a.tone }]}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════
 * ACTIVITIES — full-fat with cost/gain breakdown
 * ══════════════════════════════════════════════════════════════════ */

function ActivitiesCard({ pet, s }: { pet: Pet; s: Styles }) {
  const queryClient = useQueryClient();
  const activities: PetActivity[] = (pet.activities ?? []) as PetActivity[];
  const run = useMutation({
    mutationFn: (id: string) => petsApi.activity(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pet-me'] }),
    onError: (err: unknown) => Alert.alert('Hmm', err instanceof Error ? err.message : 'Activity failed'),
  });
  if (!activities.length) return null;
  return (
    <View style={s.card}>
      <Text style={s.cardEyebrow}>ACTIVITIES</Text>
      <View style={s.activityGrid}>
        {activities.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => run.mutate(a.id)}
            disabled={a.locked || run.isPending}
            style={({ pressed }) => [
              s.activityCard,
              a.locked && { opacity: 0.45 },
              pressed && { opacity: 0.8 },
            ]}>
            <View style={s.activityHead}>
              <View style={s.activityIcon}>
                <PetArt asset={activityAsset(a)} size={22} />
              </View>
              <Text style={s.activityLabel}>{a.label}</Text>
            </View>
            {a.description ? <Text style={s.activityDesc} numberOfLines={2}>{a.description}</Text> : null}
            <View style={s.activityChips}>
              {(a.gains || []).slice(0, 3).map((g, i) => (
                <Text key={`g-${i}`} style={[s.activityChip, { color: '#34D399', borderColor: 'rgba(52,211,153,0.4)' }]}>
                  +{g.value} {g.stat}
                </Text>
              ))}
              {(a.costs || []).slice(0, 2).map((c, i) => (
                <Text key={`c-${i}`} style={[s.activityChip, { color: '#FB7185', borderColor: 'rgba(251,113,133,0.4)' }]}>
                  {c.value} {c.stat}
                </Text>
              ))}
            </View>
            {a.locked && a.lock_reason ? (
              <View style={s.lockRow}>
                <IconSymbol name="lock.fill" size={11} color="#777" />
                <Text style={s.activityLock}>{a.lock_reason}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════
 * TRICKS TAB
 * ══════════════════════════════════════════════════════════════════ */

function TricksTab({ pet, s }: { pet: Pet; s: Styles }) {
  const queryClient = useQueryClient();
  const tricks: PetTrick[] = (pet.tricks ?? []) as PetTrick[];
  const demand = useMutation({
    mutationFn: (id: string) => petsApi.demandTrick(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pet-me'] }),
    onError: (err: unknown) => Alert.alert('Hmm', err instanceof Error ? err.message : 'Could not demand'),
  });
  const perform = useMutation({
    mutationFn: (id: string) => petsApi.performTrick(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pet-me'] }),
    onError: (err: unknown) => Alert.alert('Hmm', err instanceof Error ? err.message : 'Could not perform'),
  });
  if (!tricks.length) return <EmptyTab s={s} text="No tricks for this character yet." />;
  return (
    <View style={s.tabBody}>
      {tricks.map((t) => (
        <View key={t.id} style={[s.trickRow, !t.unlocked && { opacity: 0.55 }]}>
          <View style={s.trickIcon}>
            <PetArt asset={trickAsset(t)} size={34} dimmed={!t.unlocked} />
          </View>
          <View style={s.trickBody}>
            <Text style={s.trickName}>{t.name}</Text>
            {t.description ? <Text style={s.trickDesc} numberOfLines={2}>{t.description}</Text> : null}
            {!t.unlocked ? (
              <Text style={s.trickXp}>Unlocks at {t.xp.toLocaleString()} XP</Text>
            ) : null}
          </View>
          {t.unlocked ? (
            <View style={s.trickActions}>
              <Pressable
                onPress={() => demand.mutate(t.id)}
                style={({ pressed }) => [s.btnGhost, pressed && { opacity: 0.7 }]}>
                <Text style={s.btnGhostText}>Demand</Text>
              </Pressable>
              <Pressable
                onPress={() => perform.mutate(t.id)}
                style={({ pressed }) => [s.btnPrimary, pressed && { opacity: 0.8 }]}>
                <Text style={s.btnPrimaryText}>Perform</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════
 * MISSIONS TAB
 * ══════════════════════════════════════════════════════════════════ */

function MissionsTab({ pet, s }: { pet: Pet; s: Styles }) {
  const queryClient = useQueryClient();
  const claim = useMutation({
    mutationFn: (id: string) => petsApi.claimMission(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pet-me'] }),
    onError: (err: unknown) => Alert.alert('Hmm', err instanceof Error ? err.message : 'Claim failed'),
  });
  const missions = (pet.missions ?? []) as Record<string, unknown>[];
  if (missions.length === 0) return <EmptyTab s={s} text="No missions right now. New ones drop daily." />;
  return (
    <View style={s.tabBody}>
      {missions.map((m, i) => {
        const id = String(m.id || i);
        const claimed = !!m.claimed;
        const ready = !!m.ready_to_claim || !!m.complete;
        return (
          <View key={id} style={[s.missionRow, claimed && { opacity: 0.5 }]}>
            <View style={s.missionIcon}>
              <PetArt asset={missionAsset(m)} size={32} />
            </View>
            <View style={s.missionBody}>
              <Text style={s.missionName}>{String(m.label || m.title || id)}</Text>
              {m.description ? <Text style={s.missionDesc}>{String(m.description)}</Text> : null}
              {m.progress_text ? <Text style={s.missionProgress}>{String(m.progress_text)}</Text> : null}
            </View>
            {ready && !claimed ? (
              <Pressable
                onPress={() => claim.mutate(id)}
                style={({ pressed }) => [s.btnPrimary, pressed && { opacity: 0.8 }]}>
                <Text style={s.btnPrimaryText}>Claim</Text>
              </Pressable>
            ) : claimed ? (
              <Text style={s.missionClaimed}>✓ Claimed</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════
 * TOYS TAB
 * ══════════════════════════════════════════════════════════════════ */

function ToysTab({ pet, s }: { pet: Pet; s: Styles }) {
  const queryClient = useQueryClient();
  const use = useMutation({
    mutationFn: (id: string) => petsApi.useToy(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pet-me'] }),
    onError: (err: unknown) => Alert.alert('Hmm', err instanceof Error ? err.message : 'Could not play'),
  });
  const owned = (pet.toys ?? []).filter((t) => t.owned);
  if (owned.length === 0) {
    return <EmptyTab s={s} text="No toys yet — pick some up in Shop." />;
  }
  return (
    <View style={s.tabBody}>
      <View style={s.toyGrid}>
        {owned.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => use.mutate(t.id)}
            disabled={use.isPending}
            style={({ pressed }) => [s.toyCard, pressed && { opacity: 0.85 }]}>
            <View style={s.toyThumb}>
              <PetArt asset={toyAsset(t.id)} size={44} />
            </View>
            <Text style={s.toyName} numberOfLines={1}>{t.name}</Text>
            {t.preference && t.preference !== 'neutral' ? (
              <Text style={[s.toyPref, t.preference === 'favorite' && { color: '#FDE047' }, t.preference === 'disliked' && { color: '#FB7185' }]}>
                {t.preference}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════
 * HABITAT TAB — equip backgrounds / props / floor / wall
 * ══════════════════════════════════════════════════════════════════ */

function HabitatTab({ pet, s }: { pet: Pet; s: Styles }) {
  const queryClient = useQueryClient();
  const equip = useMutation({
    mutationFn: (id: string) => petsApi.equipHabitat(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pet-me'] }),
    onError: (err: unknown) => Alert.alert('Hmm', err instanceof Error ? err.message : 'Could not equip'),
  });
  const groups = pet.habitat_items ?? {};
  const sections: { label: string; kind: 'background' | 'prop' | 'floor' | 'wall'; items: typeof groups.backgrounds }[] = [
    { label: 'Backgrounds', kind: 'background', items: groups.backgrounds ?? [] },
    { label: 'Props',       kind: 'prop',       items: groups.props ?? [] },
    { label: 'Floor',       kind: 'floor',      items: groups.floor ?? [] },
    { label: 'Wall',        kind: 'wall',       items: groups.wall ?? [] },
  ];
  return (
    <View style={s.tabBody}>
      {/* Live preview at the top so the user sees changes apply
          immediately as they tap items. */}
      <HabitatScene pet={pet} height={260} />

      {sections.map((sec) => {
        const owned = (sec.items ?? []).filter((it) => it.owned);
        if (owned.length === 0) return null;
        return (
          <View key={sec.label} style={s.habitatSection}>
            <Text style={s.cardEyebrow}>{sec.label.toUpperCase()}</Text>
            <View style={s.habitatGrid}>
              {owned.map((it) => (
                <Pressable
                  key={it.id}
                  onPress={() => equip.mutate(it.id)}
                  disabled={equip.isPending || it.active}
                  style={({ pressed }) => [
                    s.habitatItem,
                    it.active && s.habitatItemActive,
                    pressed && { opacity: 0.85 },
                  ]}>
                  <View style={s.habitatThumb}>
                    {sec.kind === 'prop' ? <PropMini id={it.id} scale={3} /> : <PetArt asset={habitatAsset(sec.kind, it.id)} size={48} />}
                  </View>
                  <Text style={s.habitatName} numberOfLines={2}>{it.name}</Text>
                  {it.active ? <Text style={s.habitatBadge}>EQUIPPED</Text> : null}
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}
      {sections.every((sec) => (sec.items ?? []).filter((it) => it.owned).length === 0) ? (
        <EmptyTab s={s} text="No habitat items owned. Buy some in Shop → Habitat." />
      ) : null}
    </View>
  );
}

function petAssetFromText(text: string, fallback: PetUiAssetKey): PetUiAssetKey {
  const value = text.toLowerCase();
  if (/feed|food|snack|treat|hunger|meal|cookie|biscuit|kibble|bowl/.test(value)) return 'food';
  if (/spar|train|fight|battle|pad/.test(value)) return 'spar';
  if (/groom|brush|wash/.test(value)) return 'groom';
  if (/rest|sleep|nap|recover|tired|cushion/.test(value)) return 'rest';
  if (/explore|walk|map|route|visit/.test(value)) return 'explore';
  if (/mission|daily|task|claim|check/.test(value)) return 'mission';
  if (/toy|play|ball|orb|laser|feather|mouse|catnip|drum|whistle/.test(value)) return 'toy';
  if (/outfit|costume|clothing|hat|jacket|shoe|belt|ranger/.test(value)) return 'outfit';
  if (/habitat|room|floor|wall|background|prop|dojo|banner|tatami/.test(value)) return 'habitat';
  if (/shop|buy|store|crate/.test(value)) return 'shop';
  if (/leader|rank|podium|trophy/.test(value)) return 'leaderboard';
  if (/trust|bond|cuddle|tap|heart/.test(value)) return 'trust';
  if (/happy|praise|smile|joy|content/.test(value)) return 'happy';
  if (/energy|boost|momentum|streak|power/.test(value)) return 'momentum';
  if (/trick|perform|dance|spell|magic|stage/.test(value)) return 'trick';
  return fallback;
}

function activityAsset(activity: PetActivity): PetUiAssetKey {
  return petAssetFromText(`${activity.id} ${activity.label} ${activity.description || ''}`, 'trick');
}

function trickAsset(trick: PetTrick): PetUiAssetKey {
  return petAssetFromText(`${trick.id} ${trick.name} ${trick.description || ''}`, 'trick');
}

function missionAsset(mission: Record<string, unknown>): PetUiAssetKey {
  return petAssetFromText(`${String(mission.id || '')} ${String(mission.label || '')} ${String(mission.title || '')} ${String(mission.description || '')}`, 'mission');
}

function toyAsset(id: string): PetUiAssetKey {
  return petAssetFromText(id, 'toy');
}

function foodAsset(_food: { id?: string; name?: string; desc?: string }): PetUiAssetKey {
  return 'food';
}

function habitatAsset(kind: 'background' | 'prop' | 'floor' | 'wall', id: string): PetUiAssetKey {
  return petAssetFromText(`${kind} ${id}`, 'habitat');
}

/* ════════════════════════════════════════════════════════════════════
 * SHOP TAB
 * ══════════════════════════════════════════════════════════════════ */

type ShopCategory = 'food' | 'clothing' | 'toys' | 'habitat';

function ShopTab({ pet, s }: { pet: Pet; s: Styles }) {
  const queryClient = useQueryClient();
  const [cat, setCat] = useState<ShopCategory>('food');
  const shopQuery = useQuery({ queryKey: ['pet-shop'], queryFn: () => petsApi.shop() });
  const buyFood = useMutation({
    mutationFn: (id: string) => petsApi.buyFood(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pet-me'] }); queryClient.invalidateQueries({ queryKey: ['pet-shop'] }); },
    onError: (e: unknown) => Alert.alert('Hmm', e instanceof Error ? e.message : 'Buy failed'),
  });
  const buyToy = useMutation({
    mutationFn: (id: string) => petsApi.buyToy(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pet-me'] }); queryClient.invalidateQueries({ queryKey: ['pet-shop'] }); },
    onError: (e: unknown) => Alert.alert('Hmm', e instanceof Error ? e.message : 'Buy failed'),
  });
  const buyItem = useMutation({
    mutationFn: (id: string) => petsApi.buyItem(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pet-me'] }); queryClient.invalidateQueries({ queryKey: ['pet-shop'] }); },
    onError: (e: unknown) => Alert.alert('Hmm', e instanceof Error ? e.message : 'Buy failed'),
  });
  const buyHabitat = useMutation({
    mutationFn: (id: string) => petsApi.buyHabitatItem(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pet-me'] }); queryClient.invalidateQueries({ queryKey: ['pet-shop'] }); },
    onError: (e: unknown) => Alert.alert('Hmm', e instanceof Error ? e.message : 'Buy failed'),
  });

  if (shopQuery.isLoading) return <View style={s.empty}><ActivityIndicator /></View>;
  const data = shopQuery.data;
  if (!data) return <EmptyTab s={s} text="Shop unavailable right now." />;

  const SHOP_CATS: { key: ShopCategory; label: string; asset: PetUiAssetKey }[] = [
    { key: 'food',     label: 'Food',     asset: 'food' },
    { key: 'clothing', label: 'Clothing', asset: 'outfit' },
    { key: 'toys',     label: 'Toys',     asset: 'toy' },
    { key: 'habitat',  label: 'Habitat',  asset: 'habitat' },
  ];

  return (
    <View style={s.tabBody}>
      <View style={s.shopHeader}>
        <View style={s.shopBalance}>
          <PetArt asset="trick" size={20} />
          <Text style={s.shopBalanceValue}>{data.combo_balance.toLocaleString()}</Text>
          <Text style={s.currencyLabel}>COMBO</Text>
        </View>
        <View style={s.shopCatRow}>
          {SHOP_CATS.map((c) => {
            const active = cat === c.key;
            return (
              <Pressable
                key={c.key}
                onPress={() => setCat(c.key)}
                style={({ pressed }) => [s.shopCatBtn, active && s.shopCatBtnActive, pressed && { opacity: 0.7 }]}>
                <View style={s.shopCatContent}>
                  <PetArt asset={c.asset} size={18} dimmed={!active} />
                  <Text style={[s.shopCatText, active && s.shopCatTextActive]}>{c.label}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {cat === 'food' ? (
        <View style={s.foodSection}>
          <View style={s.foodShelf}>
            <PetArt asset="food" size={58} />
            <View style={s.foodShelfText}>
              <Text style={s.foodShelfTitle}>Food</Text>
              <Text style={s.foodShelfSub}>Snacks restore hunger and can lift mood.</Text>
            </View>
          </View>
          <View style={s.shopGrid}>
            {data.foods.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => buyFood.mutate(f.id)}
                disabled={buyFood.isPending || data.combo_balance < f.cost}
                style={({ pressed }) => [
                  s.shopCard,
                  f.preference === 'favorite' && { borderColor: 'rgba(253,224,71,0.6)' },
                  f.preference === 'disliked' && { borderColor: 'rgba(251,113,133,0.4)', opacity: 0.7 },
                  data.combo_balance < f.cost && { opacity: 0.4 },
                  pressed && { opacity: 0.8 },
                ]}>
                <View style={s.shopThumb}>
                  <PetArt asset={foodAsset(f)} size={52} />
                </View>
                <Text style={s.shopName} numberOfLines={1}>{f.name}</Text>
                {f.desc ? <Text style={s.shopDesc} numberOfLines={2}>{f.desc}</Text> : null}
                <View style={s.shopMeta}>
                  <View style={s.foodMetaRow}>
                    <PetArt asset="food" size={14} />
                    <Text style={s.shopMetaText}>+{f.hunger} hunger</Text>
                  </View>
                  <View style={s.foodMetaRow}>
                    <PetArt asset="happy" size={14} />
                    <Text style={s.shopMetaText}>+{f.happiness} happy</Text>
                  </View>
                </View>
                <View style={s.shopCostRow}>
                  <CostPill cost={f.cost} s={s} />
                  {f.preference === 'favorite' ? <Text style={s.shopFav}>LOVES</Text> : null}
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {cat === 'clothing' ? (
        <ClothingShop pet={pet} data={data} buyItem={(id) => buyItem.mutate(id)} pending={buyItem.isPending} s={s} />
      ) : null}

      {cat === 'toys' ? (
        <View style={s.shopGrid}>
          {data.toys.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => buyToy.mutate(t.id)}
              disabled={buyToy.isPending || t.owned || data.combo_balance < t.cost}
              style={({ pressed }) => [
                s.shopCard,
                t.owned && { opacity: 0.55 },
                data.combo_balance < t.cost && !t.owned && { opacity: 0.4 },
                pressed && { opacity: 0.8 },
              ]}>
              <View style={s.shopThumb}>
                <PetArt asset={toyAsset(t.id)} size={52} />
              </View>
              <Text style={s.shopName} numberOfLines={1}>{t.name}</Text>
              {t.desc ? <Text style={s.shopDesc} numberOfLines={2}>{t.desc}</Text> : null}
              <View style={s.shopCostRow}>
                <CostPill cost={t.cost} s={s} />
                {t.owned ? <Text style={s.shopOwned}>OWNED</Text> : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      {cat === 'habitat' ? (
        <View>
          {(['backgrounds', 'props', 'floor', 'wall'] as const).map((kind) => {
            const items = data.habitat[kind] ?? [];
            if (items.length === 0) return null;
            return (
              <View key={kind} style={s.habitatSection}>
                <Text style={s.cardEyebrow}>{kind.toUpperCase()}</Text>
                <View style={s.shopGrid}>
                  {items.map((it) => (
                    <Pressable
                      key={it.id}
                      onPress={() => buyHabitat.mutate(it.id)}
                      disabled={buyHabitat.isPending || it.owned || it.locked || (it.cost ?? 0) > data.combo_balance}
                      style={({ pressed }) => [
                        s.shopCard,
                        it.owned && { opacity: 0.55 },
                        it.locked && { opacity: 0.4 },
                        pressed && { opacity: 0.8 },
                      ]}>
                      <View style={s.shopThumb}>
                        {kind === 'props' ? (
                          <PropMini id={it.id} scale={3} />
                        ) : (
                          <PetArt
                            asset={habitatAsset(kind === 'backgrounds' ? 'background' : kind === 'floor' ? 'floor' : 'wall', it.id)}
                            size={52}
                          />
                        )}
                      </View>
                      <Text style={s.shopName} numberOfLines={1}>{it.name}</Text>
                      {it.desc ? <Text style={s.shopDesc} numberOfLines={2}>{it.desc}</Text> : null}
                      <View style={s.shopCostRow}>
                        <CostPill cost={it.cost ?? 0} s={s} />
                        {it.owned ? <Text style={s.shopOwned}>OWNED</Text> : it.locked ? (
                          <View style={s.lockRow}>
                            <IconSymbol name="lock.fill" size={11} color="#777" />
                            <Text style={s.shopLocked}>{it.lock_reason}</Text>
                          </View>
                        ) : null}
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function ClothingShop({
  pet,
  data,
  buyItem,
  pending,
  s,
}: {
  pet: Pet;
  data: { combo_balance: number; clothing: { hats: any[]; tops?: any[]; belts: any[]; shoes: any[] } };
  buyItem: (id: string) => void;
  pending: boolean;
  s: Styles;
}) {
  const sections: { label: string; kind: 'hat' | 'top' | 'belt' | 'shoes'; items: any[] }[] = [
    { label: 'Hats',  kind: 'hat',   items: data.clothing.hats ?? [] },
    { label: 'Tops',  kind: 'top',   items: data.clothing.tops ?? [] },
    { label: 'Belts', kind: 'belt',  items: data.clothing.belts ?? [] },
    { label: 'Shoes', kind: 'shoes', items: data.clothing.shoes ?? [] },
  ];
  return (
    <View>
      {sections.map((sec) => sec.items.length > 0 ? (
        <View key={sec.label} style={s.habitatSection}>
          <Text style={s.cardEyebrow}>{sec.label.toUpperCase()}</Text>
          <View style={s.shopGrid}>
            {sec.items.map((it: { id: string; name: string; cost: number; desc?: string; owned?: boolean }) => (
              <Pressable
                key={it.id}
                onPress={() => buyItem(it.id)}
                disabled={pending || it.owned || it.cost > data.combo_balance}
                style={({ pressed }) => [
                  s.shopCard,
                  it.owned && { opacity: 0.55 },
                  pressed && { opacity: 0.8 },
                ]}>
                <View style={s.shopThumbLg}>
                  <CosmeticPreview
                    kind={sec.kind}
                    id={it.id}
                    character={pet.character}
                    weightState={pet.weight_state}
                    size={64}
                  />
                </View>
                <Text style={s.shopName} numberOfLines={1}>{it.name}</Text>
                {it.desc ? <Text style={s.shopDesc} numberOfLines={2}>{it.desc}</Text> : null}
                <View style={s.shopCostRow}>
                  <CostPill cost={it.cost} s={s} />
                  {it.owned ? <Text style={s.shopOwned}>OWNED</Text> : null}
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null)}
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════
 * CUSTOMIZE TAB
 * ══════════════════════════════════════════════════════════════════ */

function CustomizeTab({ pet, s, onOpenLeaderboard: _onOpenLeaderboard }: { pet: Pet; s: Styles; onOpenLeaderboard: () => void }) {
  const queryClient = useQueryClient();
  const [renameOpen, setRenameOpen] = useState(false);
  const [draftName, setDraftName] = useState(pet.nickname || '');

  const rename = useMutation({
    mutationFn: (name: string) => petsApi.rename(name),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pet-me'] }); setRenameOpen(false); },
    onError: (e: unknown) => Alert.alert('Hmm', e instanceof Error ? e.message : 'Could not rename'),
  });
  const swap = useMutation({
    mutationFn: (id: PetCharacterId) => petsApi.adopt(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pet-me'] }),
    onError: (e: unknown) => Alert.alert('Hmm', e instanceof Error ? e.message : 'Swap failed'),
  });
  const toggleAvatar = useMutation({
    mutationFn: () => petsApi.toggleAvatar(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pet-me'] }),
  });
  const charsQuery = useQuery({ queryKey: ['pet-characters'], queryFn: () => petsApi.characters(), staleTime: 5 * 60_000 });

  return (
    <View style={s.tabBody}>
      {/* Name */}
      <View style={s.customRow}>
        <View style={s.customMain}>
          <Text style={s.customLabel}>Nickname</Text>
          <Text style={s.customValue}>{pet.nickname || petCharacterName(pet.character)}</Text>
        </View>
        <Pressable onPress={() => setRenameOpen(true)} style={({ pressed }) => [s.btnGhost, pressed && { opacity: 0.7 }]}>
          <Text style={s.btnGhostText}>Rename</Text>
        </Pressable>
      </View>

      {/* Avatar toggle */}
      <View style={s.customRow}>
        <View style={s.customMain}>
          <Text style={s.customLabel}>Show pet as profile avatar</Text>
          <Text style={s.customHint}>Replaces your avatar with your pet.</Text>
        </View>
        <Pressable
          onPress={() => toggleAvatar.mutate()}
          style={({ pressed }) => [
            s.toggle,
            pet.is_pet_avatar ? s.toggleOn : null,
            pressed && { opacity: 0.7 },
          ]}>
          <Text style={[s.toggleText, pet.is_pet_avatar ? { color: '#050505' } : { color: '#A8A8AE' }]}>
            {pet.is_pet_avatar ? 'ON' : 'OFF'}
          </Text>
        </Pressable>
      </View>

      {/* Character swap */}
      <Text style={[s.cardEyebrow, { marginTop: 16 }]}>SWAP CHARACTER</Text>
      <Text style={s.swapWarn}>
        Heads up: swapping resets bond, level, currencies, and tricks. Cosmetics stay.
      </Text>
      <View style={s.swapGrid}>
        {(charsQuery.data?.characters ?? []).map((c) => {
          const active = c.id === pet.character;
          return (
            <Pressable
              key={c.id}
              onPress={() => {
                if (active) return;
                Alert.alert(
                  `Swap to ${c.name}?`,
                  'This resets level, bond, currencies, and tricks. Cosmetics stay.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Swap', style: 'destructive', onPress: () => swap.mutate(c.id) },
                  ],
                );
              }}
              disabled={active || swap.isPending}
              style={({ pressed }) => [s.swapCard, active && s.swapCardActive, pressed && { opacity: 0.85 }]}>
              <Text style={s.swapEmoji}>{petCharacterEmoji(c.id)}</Text>
              <Text style={s.swapName}>{c.name}</Text>
              {active ? <Text style={s.swapActiveBadge}>CURRENT</Text> : null}
            </Pressable>
          );
        })}
      </View>

      {/* Rename modal */}
      <Modal visible={renameOpen} transparent animationType="none" onRequestClose={() => setRenameOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setRenameOpen(false)}>
          <Pressable onPress={(e) => e.stopPropagation?.()} style={s.modalCard}>
            <Text style={s.modalTitle}>Rename your pet</Text>
            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              maxLength={24}
              placeholder={petCharacterName(pet.character)}
              placeholderTextColor="#666"
              style={s.modalInput}
              autoFocus
            />
            <View style={s.modalActions}>
              <Pressable onPress={() => setRenameOpen(false)} style={({ pressed }) => [s.btnGhost, pressed && { opacity: 0.7 }]}>
                <Text style={s.btnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => rename.mutate(draftName.trim())}
                disabled={rename.isPending || !draftName.trim()}
                style={({ pressed }) => [s.btnPrimary, pressed && { opacity: 0.8 }]}>
                <Text style={s.btnPrimaryText}>{rename.isPending ? 'Saving…' : 'Save'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════
 * LEADERBOARD TAB
 * ══════════════════════════════════════════════════════════════════ */

function LeaderboardTab({ s, onOpenUser }: { s: Styles; onOpenUser: (userId: string) => void }) {
  const lb = useQuery({ queryKey: ['pet-leaderboard'], queryFn: () => petsApi.leaderboard(), staleTime: 60_000 });
  if (lb.isLoading) return <View style={s.empty}><ActivityIndicator /></View>;
  const entries = lb.data?.entries ?? [];
  if (entries.length === 0) return <EmptyTab s={s} text="No pets on the leaderboard yet." />;
  return (
    <View style={s.tabBody}>
      {entries.map((e) => (
        <Pressable
          key={String(e.user_id || e.username)}
          onPress={() => e.user_id ? onOpenUser(e.user_id) : null}
          style={({ pressed }) => [s.lbRow, pressed && { opacity: 0.8 }]}>
          <Text style={s.lbRank}>#{e.rank}</Text>
          <Text style={s.lbEmoji}>{petCharacterEmoji(e.character)}</Text>
          <View style={s.lbBody}>
            <Text style={s.lbName}>{e.nickname || e.username}</Text>
            {e.identity_title ? <Text style={s.lbTitle} numberOfLines={1}>{e.identity_title}</Text> : null}
          </View>
          <View style={s.lbScores}>
            <Text style={s.lbLevel}>LV {e.level}</Text>
            <Text style={s.lbXp}>{(e.experience || 0).toLocaleString()} XP</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

/* ════════════════════════════════════════════════════════════════════
 * EMPTY tab placeholder
 * ══════════════════════════════════════════════════════════════════ */

function EmptyTab({ s, text }: { s: Styles; text: string }) {
  return <View style={[s.empty, { paddingVertical: 24 }]}><Text style={s.emptyTitle}>{text}</Text></View>;
}

/* ════════════════════════════════════════════════════════════════════
 * STYLES
 * ══════════════════════════════════════════════════════════════════ */

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  headerBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  deskHeading: { fontSize: 22, fontWeight: '800' as const, color: t.text, letterSpacing: 0.5 },
  scroll: { paddingHorizontal: 16, gap: 14 },
  // Desktop: cap the scroll container width so the layout doesn't
  // stretch edge-to-edge on wide monitors. The hub feels tighter when
  // the main column maxes out around 720px and the helper rail takes
  // a fixed 360px. Anything wider than 1100 just adds margin.
  scrollDesktop: { maxWidth: 1180, alignSelf: 'center' as const, width: '100%' as const, paddingHorizontal: 24 },
  deskGrid: {
    flexDirection: 'row' as const,
    gap: 18,
    alignItems: 'flex-start' as const,
  },
  deskMain: { flex: 1, minWidth: 0, gap: 14 },
  deskRail: { width: 360, gap: 14 },
  deskRailSpacer: { width: 360 },
  lowerSection: { gap: 14 },

  // Empty state
  empty: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 32, gap: 8 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 14, fontWeight: '700' as const, color: t.text, textAlign: 'center' as const },

  // Adoption
  adoptScroll: { padding: 24, gap: 16 },
  adoptTitle: { fontSize: 26, fontWeight: '900' as const, color: t.text, letterSpacing: -0.5 },
  adoptSub: { fontSize: 14, color: t.textMuted, lineHeight: 20 },
  adoptGrid: { gap: 16 },
  adoptCard: {
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  adoptHero: {
    height: 120, borderRadius: 12,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  adoptEmoji: { fontSize: 56 },
  adoptName: { fontSize: 18, fontWeight: '900' as const, color: t.text },
  adoptTagline: { fontSize: 13, color: t.textMuted, lineHeight: 18 },
  adoptTrickRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 4 },
  adoptTrickPill: {
    fontSize: 10, fontWeight: '800' as const, color: t.textMuted,
    backgroundColor: t.surfaceMuted,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  adoptCta: {
    marginTop: 6,
    backgroundColor: t.accent,
    paddingVertical: 10, borderRadius: 10, alignItems: 'center' as const,
  },
  adoptCtaText: { color: '#050505', fontWeight: '900' as const, fontSize: 14, letterSpacing: 0.5 },

  // Hero
  hero: {
    borderRadius: 18,
    padding: 18,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  heroPetWrap: {
    // Box for the SpritePet (or emoji fallback). Lets the mood bubble
    // overlay stay anchored bottom-right of the actual pet sprite.
    width: 120, height: 120,
    alignItems: 'center' as const, justifyContent: 'center' as const,
    position: 'relative' as const,
  },
  heroMoodBubble: {
    position: 'absolute' as const, bottom: -4, right: -4,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#050505', borderWidth: 2, borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  heroMoodEmoji: { fontSize: 14 },
  heroBody: { flex: 1, minWidth: 0, gap: 4 },
  heroName: { fontSize: 22, fontWeight: '900' as const, color: '#fff', letterSpacing: -0.3 },
  heroIdentity: { fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 16 },
  heroLevelRow: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: 8 },
  heroLevel: { fontSize: 13, fontWeight: '900' as const, color: '#FFC400', letterSpacing: 1 },
  heroMood: { fontSize: 11, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' as const, letterSpacing: 1 },
  heroXpBar: {
    marginTop: 4, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.42)', overflow: 'hidden' as const,
  },
  heroXpFill: { height: '100%' as const, backgroundColor: '#FFC400', borderRadius: 3 },
  heroXpText: { fontSize: 10, color: 'rgba(255,255,255,0.55)', fontVariant: ['tabular-nums' as const] },

  // Currencies
  currencyRow: { flexDirection: 'row' as const, gap: 8 },
  currencyTile: {
    flex: 1, alignItems: 'center' as const, gap: 4,
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    borderRadius: 12, paddingVertical: 12,
  },
  currencyIcon: {
    width: 34, height: 34,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  currencyValue: { fontSize: 14, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  currencyLabel: { fontSize: 9, fontWeight: '800' as const, color: t.textDim, letterSpacing: 1 },

  // Cards
  card: {
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  cardEyebrow: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 1.5, color: t.textDim, textTransform: 'uppercase' as const },

  // Vitals
  vitalRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  vitalIcon: {
    width: 30, height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.24)',
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  vitalBody: { flex: 1, minWidth: 0, gap: 4 },
  vitalLabelRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'baseline' as const },
  vitalLabel: { fontSize: 12, fontWeight: '700' as const, color: t.text },
  vitalValue: { fontSize: 12, fontWeight: '900' as const, color: t.textMuted, fontVariant: ['tabular-nums' as const] },
  vitalBar: { height: 6, borderRadius: 3, backgroundColor: t.surfaceMuted, overflow: 'hidden' as const },
  vitalFill: { height: '100%' as const, borderRadius: 3 },

  // Request
  requestTitle: { fontSize: 16, fontWeight: '900' as const, color: t.text },
  requestDesc: { fontSize: 13, color: t.textMuted, lineHeight: 18 },
  requestReward: { fontSize: 11, color: '#FDE047', fontWeight: '800' as const, letterSpacing: 0.5 },
  requestActions: { flexDirection: 'row' as const, gap: 8, marginTop: 4 },

  // Recommended
  recRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  recIcon: {
    width: 30, height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(255,196,0,0.08)',
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  recText: { flex: 1, fontSize: 13, color: t.text, fontWeight: '600' as const },

  // Care row
  careRow: { flexDirection: 'row' as const, gap: 6, flexWrap: 'wrap' as const },
  careBtn: {
    flex: 1, minWidth: 60,
    paddingVertical: 10, paddingHorizontal: 4,
    borderRadius: 10, borderWidth: 1,
    alignItems: 'center' as const, gap: 3,
  },
  careLabel: { fontSize: 11, fontWeight: '800' as const, letterSpacing: 0.4 },

  // Activities
  activityGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  activityCard: {
    width: '48%' as const,
    minHeight: 110,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    borderRadius: 10, padding: 10, gap: 6,
  },
  activityHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  activityIcon: {
    width: 28, height: 28,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  activityLabel: { fontSize: 13, fontWeight: '900' as const, color: t.text },
  activityDesc: { fontSize: 10, color: t.textMuted, lineHeight: 14 },
  activityChips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 4 },
  activityChip: {
    fontSize: 9, fontWeight: '800' as const,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999,
    borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.32)',
  },
  lockRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  activityLock: { flex: 1, fontSize: 10, color: t.textDim, fontStyle: 'italic' as const },

  // Tab strip
  tabStrip: { marginTop: 4 },
  tabRow: { paddingVertical: 4, gap: 6 },
  tabBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
  },
  tabBtnActive: { backgroundColor: t.accentTint, borderColor: t.accent },
  tabBtnContent: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 7 },
  tabText: { fontSize: 12, fontWeight: '700' as const, color: t.textMuted },
  tabTextActive: { color: t.accent, fontWeight: '900' as const },
  tabBody: { gap: 8 },

  // Buttons
  btnPrimary: {
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: t.accent,
    alignItems: 'center' as const,
  },
  btnPrimaryText: { color: '#050505', fontWeight: '900' as const, fontSize: 12, letterSpacing: 0.4 },
  btnGhost: {
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1, borderColor: t.border,
    alignItems: 'center' as const,
  },
  btnGhostText: { color: t.text, fontWeight: '800' as const, fontSize: 12, letterSpacing: 0.4 },

  // Tricks
  trickRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10,
    backgroundColor: t.card, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    borderRadius: 12, padding: 12,
  },
  trickIcon: {
    width: 42, height: 42,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.24)',
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  trickBody: { flex: 1, minWidth: 0, gap: 3 },
  trickName: { fontSize: 13, fontWeight: '900' as const, color: t.text },
  trickDesc: { fontSize: 11, color: t.textMuted, lineHeight: 14 },
  trickXp: { fontSize: 10, color: t.textDim, fontWeight: '800' as const },
  trickActions: { gap: 4 },

  // Missions
  missionRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10,
    backgroundColor: t.card, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    borderRadius: 12, padding: 12,
  },
  missionIcon: {
    width: 42, height: 42,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.24)',
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  missionBody: { flex: 1, minWidth: 0, gap: 3 },
  missionName: { fontSize: 13, fontWeight: '900' as const, color: t.text },
  missionDesc: { fontSize: 11, color: t.textMuted, lineHeight: 14 },
  missionProgress: { fontSize: 10, color: '#FFC400', fontWeight: '800' as const },
  missionClaimed: { fontSize: 11, fontWeight: '800' as const, color: '#34D399' },

  // Toys
  toyGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  toyCard: {
    width: '31%' as const,
    backgroundColor: t.card, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    borderRadius: 12, padding: 10, gap: 4, alignItems: 'center' as const,
  },
  toyThumb: {
    width: 56, height: 56,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.24)',
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  toyName: { fontSize: 11, fontWeight: '700' as const, color: t.text, textAlign: 'center' as const },
  toyPref: { fontSize: 9, fontWeight: '900' as const, color: t.textDim, letterSpacing: 0.5, textTransform: 'uppercase' as const },

  // Habitat
  habitatSection: { gap: 8, marginTop: 8 },
  habitatGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  habitatItem: {
    width: '31%' as const,
    backgroundColor: t.card, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    borderRadius: 12, padding: 10, gap: 6, alignItems: 'center' as const,
  },
  habitatItemActive: { borderColor: t.accent, backgroundColor: t.accentTint },
  habitatThumb: {
    width: 56, height: 56,
    backgroundColor: 'rgba(0,0,0,0.32)',
    alignItems: 'center' as const, justifyContent: 'center' as const,
    borderRadius: 6,
  },
  habitatName: { fontSize: 10, fontWeight: '700' as const, color: t.text, textAlign: 'center' as const },
  habitatBadge: { fontSize: 8, fontWeight: '900' as const, color: t.accent, letterSpacing: 0.6 },

  // Outfits
  outfitSection: { gap: 8, marginTop: 8 },
  outfitHeader: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const },
  outfitUnequip: {},
  outfitUnequipText: { fontSize: 10, color: t.textDim, fontStyle: 'italic' as const },
  outfitEmpty: { fontSize: 11, color: t.textDim, fontStyle: 'italic' as const },
  outfitGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  outfitCard: {
    width: '31%' as const,
    backgroundColor: t.card, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    borderRadius: 12, padding: 10, alignItems: 'center' as const, gap: 4,
  },
  outfitCardActive: { borderColor: t.accent, backgroundColor: t.accentTint },
  outfitName: { fontSize: 11, fontWeight: '700' as const, color: t.text, textAlign: 'center' as const },
  outfitBadge: { fontSize: 8, fontWeight: '900' as const, color: t.accent, letterSpacing: 0.6 },
  colorRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const, flexWrap: 'wrap' as const,
    gap: 6, paddingTop: 6,
  },
  colorLabel: { fontSize: 10, fontWeight: '900' as const, color: t.textDim, letterSpacing: 0.8, marginRight: 4 },
  colorSwatch: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.12)',
  },
  colorSwatchActive: { borderColor: t.accent, transform: [{ scale: 1.1 }] },
  colorReset: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
    borderWidth: 1, borderColor: t.border,
  },
  colorResetText: { fontSize: 10, color: t.textMuted, fontWeight: '700' as const },

  // Shop
  shopHeader: { gap: 10 },
  shopBalance: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
    alignSelf: 'flex-start' as const,
    backgroundColor: t.surfaceMuted,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
  },
  shopBalanceValue: { fontSize: 14, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  shopCatRow: { flexDirection: 'row' as const, gap: 6 },
  shopCatBtn: {
    flex: 1, paddingVertical: 8,
    borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    backgroundColor: t.surfaceMuted, alignItems: 'center' as const,
  },
  shopCatBtnActive: { backgroundColor: t.accentTint, borderColor: t.accent },
  shopCatContent: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 5 },
  shopCatText: { fontSize: 11, fontWeight: '700' as const, color: t.textMuted, letterSpacing: 0.4 },
  shopCatTextActive: { color: t.accent, fontWeight: '900' as const },
  foodSection: { gap: 10 },
  foodShelf: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    backgroundColor: 'rgba(251,146,60,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(251,146,60,0.28)',
    borderRadius: 12,
    padding: 12,
  },
  foodShelfText: { flex: 1, minWidth: 0, gap: 2 },
  foodShelfTitle: { fontSize: 15, fontWeight: '900' as const, color: t.text },
  foodShelfSub: { fontSize: 11, color: t.textMuted, lineHeight: 15 },
  shopGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  shopCard: {
    width: '48%' as const,
    backgroundColor: t.card, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    borderRadius: 12, padding: 12, gap: 4, alignItems: 'center' as const,
  },
  shopThumb: {
    width: 64, height: 64,
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderRadius: 8,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  shopThumbLg: {
    width: 80, height: 80,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  shopName: { fontSize: 12, fontWeight: '900' as const, color: t.text, textAlign: 'center' as const },
  shopDesc: { fontSize: 10, color: t.textMuted, textAlign: 'center' as const, lineHeight: 13 },
  shopMeta: { paddingTop: 2, gap: 2 },
  foodMetaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 4 },
  shopMetaText: { fontSize: 10, color: t.textDim },
  shopCostRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingTop: 4 },
  costPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    backgroundColor: 'rgba(255,196,0,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,196,0,0.24)',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  shopCost: { fontSize: 11, fontWeight: '900' as const, color: t.accent, fontVariant: ['tabular-nums' as const] },
  shopFav: { fontSize: 10, fontWeight: '800' as const, color: '#FDE047' },
  shopOwned: { fontSize: 10, fontWeight: '900' as const, color: '#34D399', letterSpacing: 0.5 },
  shopLocked: { fontSize: 10, fontWeight: '800' as const, color: t.textDim },

  // Customize
  customRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12,
    backgroundColor: t.card, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    borderRadius: 12, padding: 14,
  },
  customMain: { flex: 1, gap: 3 },
  customLabel: { fontSize: 13, fontWeight: '800' as const, color: t.text },
  customValue: { fontSize: 12, color: t.textMuted },
  customHint: { fontSize: 11, color: t.textDim },
  toggle: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    backgroundColor: t.surfaceMuted, borderWidth: 1, borderColor: t.border,
  },
  toggleOn: { backgroundColor: t.accent, borderColor: t.accent },
  toggleText: { fontSize: 11, fontWeight: '900' as const, letterSpacing: 0.6 },
  swapWarn: { fontSize: 11, color: t.textDim, fontStyle: 'italic' as const },
  swapGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  swapCard: {
    width: '23%' as const, alignItems: 'center' as const, gap: 4,
    backgroundColor: t.card, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    borderRadius: 12, padding: 12,
  },
  swapCardActive: { borderColor: t.accent, backgroundColor: t.accentTint },
  swapEmoji: { fontSize: 32 },
  swapName: { fontSize: 11, fontWeight: '800' as const, color: t.text, textAlign: 'center' as const },
  swapActiveBadge: { fontSize: 8, fontWeight: '900' as const, color: t.accent, letterSpacing: 0.6 },

  // Modal
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center' as const, justifyContent: 'center' as const, padding: 24,
  },
  modalCard: {
    width: '100%' as const, maxWidth: 360,
    backgroundColor: t.card, borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    padding: 18, gap: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: '900' as const, color: t.text },
  modalInput: {
    borderWidth: 1, borderColor: t.border, borderRadius: 8,
    padding: 10, color: t.text, fontSize: 14,
    backgroundColor: t.surfaceMuted,
  },
  modalActions: { flexDirection: 'row' as const, justifyContent: 'flex-end' as const, gap: 8 },

  // Leaderboard
  lbRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10,
    backgroundColor: t.card, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    borderRadius: 12, padding: 12,
  },
  lbRank: { fontSize: 13, fontWeight: '900' as const, color: t.accent, width: 36, fontVariant: ['tabular-nums' as const] },
  lbEmoji: { fontSize: 24, width: 28 },
  lbBody: { flex: 1, minWidth: 0, gap: 2 },
  lbName: { fontSize: 13, fontWeight: '900' as const, color: t.text },
  lbTitle: { fontSize: 10, color: t.textMuted },
  lbScores: { alignItems: 'flex-end' as const, gap: 2 },
  lbLevel: { fontSize: 12, fontWeight: '900' as const, color: t.text },
  lbXp: { fontSize: 10, color: t.textDim, fontVariant: ['tabular-nums' as const] },
});
