import { Image } from 'expo-image';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type { ScoutingCard } from '@shared/api';

/** Attribute buckets used by the scout card. Order matters — same order
 *  as the desktop TournamentPoster.MiniScoutCard so users see a familiar
 *  shape when comparing players. */
const BUCKETS: { key: 'speed' | 'stamina' | 'mobility' | 'tech'; label: string; icon: string }[] = [
  { key: 'speed', label: 'Speed', icon: '⚡' },
  { key: 'stamina', label: 'Stamina', icon: '🔥' },
  { key: 'mobility', label: 'Mobility', icon: '🌀' },
  { key: 'tech', label: 'Tech', icon: '⚙️' },
];

function clamp(n: unknown): number {
  const v = Math.max(0, Math.min(100, Number(n) || 0));
  return v;
}

export interface ScoutPlayerInfo {
  id?: string;
  user_id?: string;
  name?: string;
  username?: string;
  avatar?: string;
  nationality?: string;
  skill_title?: string;
  pumbility?: number;
}

interface MiniProps {
  /** Tournament-player shape OR a profile user — anything with name/avatar. */
  player: ScoutPlayerInfo;
  scout?: ScoutingCard | null;
  onPress?: () => void;
}

/**
 * Compact scout card — avatar + name + flag + S/D levels + 4 attribute
 * bars. Mirrors the desktop MiniScoutCard. Tappable when onPress is
 * supplied (caller opens ScoutCardSheet).
 */
export function MiniScoutCard({ player, scout, onPress }: MiniProps) {
  const s = useThemedStyles(makeStyles);
  const name = player.name || player.username || '?';
  const avatar = typeof player.avatar === 'string' && player.avatar ? fullImageUrl(player.avatar) : undefined;
  const initial = String(name).charAt(0).toUpperCase();
  const competitive = scout?.competitive || {};
  const attrs = scout?.attributes?.overall || {};
  const rating = scout?.ratings?.overall?.score100;
  const hasData = !!scout?.coverage?.hasPiuData;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [s.miniCard, pressed && onPress && { opacity: 0.85 }]}>
      <View style={s.miniHeader}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={s.miniAvatar} contentFit="cover" />
        ) : (
          <View style={[s.miniAvatar, s.miniAvatarFallback]}>
            <Text style={s.miniAvatarLetter}>{initial}</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <Text style={s.miniName} numberOfLines={1}>{name}</Text>
          <View style={s.miniSubLine}>
            {competitive.singleLevel ? (
              <Text style={s.miniLevelSingle}>S{competitive.singleLevel}</Text>
            ) : null}
            {competitive.doubleLevel ? (
              <Text style={s.miniLevelDouble}>D{competitive.doubleLevel}</Text>
            ) : null}
            {typeof rating === 'number' && rating > 0 ? (
              <Text style={s.miniRating}>{Math.round(rating)}</Text>
            ) : null}
          </View>
        </View>
      </View>

      {hasData ? (
        <View style={s.miniBars}>
          {BUCKETS.map(({ key, icon }) => {
            const v = clamp(attrs[key]);
            return (
              <View key={key} style={s.miniBarRow}>
                <Text style={s.miniBarIcon}>{icon}</Text>
                <View style={s.miniBarTrack}>
                  <View style={[s.miniBarFill, { width: `${v}%` }]} />
                </View>
                <Text style={s.miniBarValue}>{Math.round(v)}</Text>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={s.miniNoData}>No scouting data</Text>
      )}

      {/* Top 3 specialty pills */}
      {scout?.specialties && scout.specialties.length > 0 ? (
        <View style={s.miniSpecRow}>
          {scout.specialties.slice(0, 3).map((sp, i) => (
            <View key={`${i}-${sp.label}`} style={s.miniSpecPill}>
              <Text style={s.miniSpecText} numberOfLines={1}>{sp.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

interface SheetProps {
  visible: boolean;
  player: ScoutPlayerInfo | null;
  scout?: ScoutingCard | null;
  onClose: () => void;
}

/**
 * Bottom-sheet expansion of the scout card. Full-size attribute bars,
 * 3 rating tiles (Overall / Singles / Doubles), specialty pills, cadence,
 * pumbility — mirrors the desktop ExpandedScoutCard.
 */
export function ScoutCardSheet({ visible, player, scout, onClose }: SheetProps) {
  const s = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  if (!player) return null;

  const name = player.name || player.username || '?';
  const avatar = typeof player.avatar === 'string' && player.avatar ? fullImageUrl(player.avatar) : undefined;
  const initial = String(name).charAt(0).toUpperCase();
  const competitive = scout?.competitive || {};
  const attrs = scout?.attributes?.overall || {};
  const ratings = scout?.ratings || {};
  const specialties = scout?.specialties || [];
  const cadence = scout?.cadence || null;
  const signature = scout?.signature || {};
  const hasData = !!scout?.coverage?.hasPiuData;

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
      <Pressable style={s.sheetBackdrop} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 12 }]} onPress={() => undefined}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={s.sheetAvatar} contentFit="cover" />
            ) : (
              <View style={[s.sheetAvatar, s.sheetAvatarFallback]}>
                <Text style={s.sheetAvatarLetter}>{initial}</Text>
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.sheetEyebrow}>SCOUTING REPORT</Text>
              <Text style={s.sheetName} numberOfLines={1}>{name}</Text>
              {player.skill_title ? (
                <Text style={s.sheetSkill} numberOfLines={1}>{player.skill_title}</Text>
              ) : null}
              <View style={s.sheetSubLine}>
                {competitive.singleLevel ? (
                  <Text style={s.miniLevelSingle}>S{competitive.singleLevel}</Text>
                ) : null}
                {competitive.doubleLevel ? (
                  <Text style={s.miniLevelDouble}>D{competitive.doubleLevel}</Text>
                ) : null}
                {competitive.dominantLabel ? (
                  <Text style={s.sheetDominant}>{competitive.dominantLabel}</Text>
                ) : null}
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={({ pressed }) => [s.sheetCloseBtn, pressed && { opacity: 0.7 }]}>
              <Text style={s.sheetCloseText}>×</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={s.sheetBody}>
            {signature.summaryLabel ? (
              <Text style={s.sheetSignature}>“{signature.summaryLabel}”</Text>
            ) : null}

            {hasData ? (
              <View style={s.bigBars}>
                {BUCKETS.map(({ key, icon, label }) => {
                  const v = clamp(attrs[key]);
                  const isTop = v >= 70;
                  return (
                    <View key={key} style={s.bigBarRow}>
                      <Text style={s.bigBarIcon}>{icon}</Text>
                      <Text style={s.bigBarLabel}>{label}</Text>
                      <View style={s.bigBarTrack}>
                        <View style={[s.bigBarFill, isTop && s.bigBarFillTop, { width: `${v}%` }]} />
                      </View>
                      <Text style={[s.bigBarValue, isTop && s.bigBarValueTop]}>{Math.round(v)}</Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={s.sheetEmpty}>This player hasn’t synced PIUGame data yet.</Text>
            )}

            {hasData ? (
              <View style={s.ratingsGrid}>
                {[
                  { label: 'Overall', val: ratings.overall?.score100 },
                  { label: 'Singles', val: ratings.singles?.score100 },
                  { label: 'Doubles', val: ratings.doubles?.score100 },
                ].map((r) => (
                  <View key={r.label} style={s.ratingTile}>
                    <Text style={s.ratingLabel}>{r.label}</Text>
                    <Text style={s.ratingValue}>
                      {typeof r.val === 'number' && r.val > 0 ? Math.round(r.val) : '–'}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {specialties.length > 0 ? (
              <View style={s.specRow}>
                {specialties.map((sp, i) => (
                  <View key={`${i}-${sp.label}`} style={s.specPill}>
                    <Text style={s.specText}>{sp.label}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {cadence?.label ? (
              <View style={s.cadenceRow}>
                <Text style={s.cadenceLabel}>Activity</Text>
                <Text style={s.cadenceValue}>{cadence.label}</Text>
                {typeof cadence.activeDaysPerWeek === 'number' && cadence.activeDaysPerWeek > 0 ? (
                  <Text style={s.cadenceMeta}>{cadence.activeDaysPerWeek.toFixed(1)} days/wk</Text>
                ) : null}
              </View>
            ) : null}

            {typeof player.pumbility === 'number' && player.pumbility > 0 ? (
              <View style={s.pumbilityWrap}>
                <Text style={s.pumbilityLabel}>PUMBILITY</Text>
                <Text style={s.pumbilityValue}>{Number(player.pumbility).toLocaleString()}</Text>
              </View>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (t: ThemeColors) => ({
  // ── Mini ──
  miniCard: {
    padding: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    gap: 8,
  },
  miniHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  miniAvatar: { width: 36, height: 36, borderRadius: 10, backgroundColor: t.surfaceMuted },
  miniAvatarFallback: {
    backgroundColor: t.accentTint,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  miniAvatarLetter: { fontSize: 16, fontWeight: '900' as const, color: t.accent },
  miniName: { fontSize: 13, fontWeight: '900' as const, color: t.text },
  miniSubLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  miniLevelSingle: { fontSize: 10, fontWeight: '900' as const, color: '#fb7185' },
  miniLevelDouble: { fontSize: 10, fontWeight: '900' as const, color: '#34d399' },
  miniRating: { fontSize: 10, color: t.textDim, fontVariant: ['tabular-nums' as const] },

  miniBars: { gap: 4 },
  miniBarRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  miniBarIcon: { fontSize: 10, width: 14, textAlign: 'center' as const },
  miniBarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' as const },
  miniBarFill: { height: '100%' as const, borderRadius: 3, backgroundColor: '#22d3ee' },
  miniBarValue: { fontSize: 9, color: t.textDim, fontVariant: ['tabular-nums' as const], width: 22, textAlign: 'right' as const },

  miniNoData: { fontSize: 10, color: t.textDim, fontStyle: 'italic' as const, textAlign: 'center' as const, paddingVertical: 4 },

  miniSpecRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 4 },
  miniSpecPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  miniSpecText: { fontSize: 9, fontWeight: '700' as const, color: t.textMuted },

  // ── Sheet ──
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'flex-end' as const,
    alignItems: 'center' as const,
  },
  sheet: {
    width: '100%' as const,
    maxWidth: 560,
    maxHeight: '92%' as const,
    backgroundColor: t.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden' as const,
  },
  sheetHandle: {
    alignSelf: 'center' as const,
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: t.border,
    marginTop: 8,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
    gap: 12,
  },
  sheetAvatar: { width: 56, height: 56, borderRadius: 14, backgroundColor: t.surfaceMuted },
  sheetAvatarFallback: { backgroundColor: t.accentTint, alignItems: 'center' as const, justifyContent: 'center' as const },
  sheetAvatarLetter: { fontSize: 22, fontWeight: '900' as const, color: t.accent },
  sheetEyebrow: { fontSize: 10, letterSpacing: 1.6, color: t.accent, fontWeight: '900' as const },
  sheetName: { fontSize: 20, fontWeight: '900' as const, color: t.text, marginTop: 2 },
  sheetSkill: { fontSize: 11, color: t.textMuted },
  sheetSubLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginTop: 2 },
  sheetDominant: { fontSize: 10, color: t.textDim },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sheetCloseText: { fontSize: 20, color: t.textMuted, fontWeight: '800' as const, marginTop: -3 },
  sheetBody: { padding: 16, gap: 14 },
  sheetSignature: { fontSize: 13, color: t.textMuted, fontStyle: 'italic' as const, lineHeight: 18 },
  sheetEmpty: { fontSize: 12, color: t.textDim, paddingVertical: 16, textAlign: 'center' as const },

  bigBars: { gap: 8 },
  bigBarRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  bigBarIcon: { fontSize: 13, width: 18, textAlign: 'center' as const },
  bigBarLabel: { fontSize: 11, fontWeight: '800' as const, color: t.textMuted, width: 58 },
  bigBarTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' as const },
  bigBarFill: { height: '100%' as const, borderRadius: 4, backgroundColor: '#22d3ee' },
  bigBarFillTop: { backgroundColor: '#facc15' },
  bigBarValue: { fontSize: 11, color: t.textMuted, fontVariant: ['tabular-nums' as const], width: 28, textAlign: 'right' as const, fontWeight: '800' as const },
  bigBarValueTop: { color: '#facc15' },

  ratingsGrid: { flexDirection: 'row' as const, gap: 6 },
  ratingTile: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    alignItems: 'center' as const,
    gap: 2,
  },
  ratingLabel: { fontSize: 9, letterSpacing: 1.2, color: t.textDim, fontWeight: '900' as const },
  ratingValue: { fontSize: 18, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },

  specRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 5 },
  specPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  specText: { fontSize: 10, fontWeight: '800' as const, color: t.textMuted },

  cadenceRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  cadenceLabel: { fontSize: 9, letterSpacing: 1.2, color: t.textDim, fontWeight: '900' as const },
  cadenceValue: { fontSize: 11, fontWeight: '800' as const, color: t.text, flex: 1 },
  cadenceMeta: { fontSize: 10, color: t.textDim, fontVariant: ['tabular-nums' as const] },

  pumbilityWrap: {
    alignItems: 'center' as const,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
    marginTop: 4,
  },
  pumbilityLabel: { fontSize: 9, letterSpacing: 1.4, color: t.textDim, fontWeight: '900' as const },
  pumbilityValue: { fontSize: 22, fontWeight: '900' as const, color: '#facc15', fontVariant: ['tabular-nums' as const], marginTop: 2 },
});
