/**
 * Reaction primitives:
 *  - REACTION_OPTIONS: the curated set of emoji we surface in the action
 *    sheet. Server normalizes the key (lowercase a–z, 0–9, _), so the
 *    `key` here must use that alphabet.
 *  - <ReactionBar/>: tiny chip cluster shown under a bubble. Tap a chip
 *    to toggle (clears if it's the viewer's reaction, switches if it's
 *    a different one, no-op if not the viewer's).
 *  - <ReactionPickerRow/>: the 6-emoji row inside the action sheet.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ThemeColors } from '@/constants/theme';
import type { MessageReaction } from '@shared/api';

export interface ReactionOption {
  /** Server-normalized key — lowercase letters / digits / underscore only. */
  key: string;
  emoji: string;
  label: string;
}

export const REACTION_OPTIONS: ReactionOption[] = [
  { key: 'pump', emoji: '💪', label: 'Pump' },
  { key: 'fire', emoji: '🔥', label: 'Fire' },
  { key: 'love', emoji: '❤️', label: 'Love' },
  { key: 'laugh', emoji: '😂', label: 'Laugh' },
  { key: 'wow', emoji: '😮', label: 'Wow' },
  { key: 'sad', emoji: '😢', label: 'Sad' },
];

export function getReactionEmoji(key: string): string {
  const found = REACTION_OPTIONS.find((opt) => opt.key === key);
  return found?.emoji || key;
}

interface ReactionBarProps {
  reactions: MessageReaction[];
  viewerReaction?: string;
  /** Coloring switches when the bar sits under the viewer's gold bubble. */
  own: boolean;
  onToggle: (key: string) => void;
}

export function ReactionBar({ reactions, viewerReaction, own, onToggle }: ReactionBarProps) {
  const s = useThemedStyles(makeStyles);
  if (!reactions.length) return null;
  return (
    <View style={[s.barRow, own && s.barRowOwn]}>
      {reactions.map((r) => {
        const isMine = viewerReaction === r.key;
        return (
          <Pressable
            key={r.key}
            onPress={() => onToggle(r.key)}
            style={({ pressed }) => [
              s.chip,
              isMine && s.chipMine,
              pressed && { opacity: 0.7 },
            ]}>
            <Text style={s.chipEmoji}>{getReactionEmoji(r.key)}</Text>
            <Text style={[s.chipCount, isMine && s.chipCountMine]}>{r.count}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface ReactionPickerRowProps {
  viewerReaction?: string;
  onPick: (key: string) => void;
}

export function ReactionPickerRow({ viewerReaction, onPick }: ReactionPickerRowProps) {
  const s = useThemedStyles(makeStyles);
  return (
    <View style={s.pickerRow}>
      {REACTION_OPTIONS.map((opt) => {
        const isMine = viewerReaction === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onPick(opt.key)}
            style={({ pressed }) => [
              s.pickerBtn,
              isMine && s.pickerBtnMine,
              pressed && { opacity: 0.7 },
            ]}>
            <Text style={s.pickerEmoji}>{opt.emoji}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  barRow: { flexDirection: 'row' as const, gap: 4, marginTop: 2, paddingLeft: 12, flexWrap: 'wrap' as const },
  barRowOwn: { paddingLeft: 0, paddingRight: 12, justifyContent: 'flex-end' as const },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  chipMine: { backgroundColor: t.accentTint, borderColor: t.accent },
  chipEmoji: { fontSize: 11 },
  chipCount: { fontSize: 10, fontWeight: '800' as const, color: t.textMuted, fontVariant: ['tabular-nums' as const] },
  chipCountMine: { color: t.accent },

  pickerRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, paddingHorizontal: 6, paddingVertical: 8 },
  pickerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: t.surfaceMuted,
  },
  pickerBtnMine: { backgroundColor: t.accentTint, borderWidth: 2, borderColor: t.accent },
  pickerEmoji: { fontSize: 22 },
});
