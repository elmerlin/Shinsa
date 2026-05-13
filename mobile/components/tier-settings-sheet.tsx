import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { TierDisplayMode, TierSettings } from '@/lib/tier-settings';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  visible: boolean;
  settings: TierSettings;
  onChange: (patch: Partial<TierSettings>) => void;
  onClose: () => void;
}

const DENSITY_OPTIONS: { value: 4 | 5 | 6; label: string }[] = [
  { value: 4, label: 'Roomy' },
  { value: 5, label: 'Balanced' },
  { value: 6, label: 'Compact' },
];

const OPACITY_OPTIONS: { value: number; label: string }[] = [
  { value: 25, label: 'Faint' },
  { value: 55, label: 'Default' },
  { value: 85, label: 'Bright' },
];

// Width % the grade letters span on each jacket. Mirrors the web's
// `tiers_overlay_size` slider (20–100, default 78). Three discrete steps
// here so it fits the existing SegmentedRow pattern; users wanting a
// continuous slider can come later.
const OVERLAY_SIZE_OPTIONS: { value: number; label: string }[] = [
  { value: 50, label: 'Small' },
  { value: 78, label: 'Default' },
  { value: 100, label: 'Huge' },
];

const DISPLAY_OPTIONS: { value: TierDisplayMode; label: string }[] = [
  { value: 'grade', label: 'Grade' },
  { value: 'score', label: 'Score' },
];

const DEFAULT_MODE_OPTIONS: { value: 'Single' | 'Double'; label: string }[] = [
  { value: 'Single', label: 'Singles' },
  { value: 'Double', label: 'Doubles' },
];

/**
 * Bottom-sheet preferences panel for the Tiers screen. Mirrors the web
 * TiersPage SettingsModal but trims to the settings that make sense on a
 * narrow phone screen (no overlay-size slider — the auto-fit handles that;
 * songs-per-row caps at 6 instead of 7).
 */
export function TierSettingsSheet({ visible, settings, onChange, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={s.backdropFill} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={s.handle} />
          <View style={s.titleRow}>
            <Text style={s.title}>Tier settings</Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.6 }]}>
              <IconSymbol name="xmark" size={16} color={theme.textMuted} />
            </Pressable>
          </View>

          {/* flex:1 + minHeight:0 so the ScrollView claims the remaining
              space inside the maxHeight-capped sheet and scrolls internally
              instead of overflowing past the viewport (which on Chrome
              mobile triggered a zoom-out). */}
          <ScrollView
            style={s.scrollHost}
            contentContainerStyle={s.scroll}
            showsVerticalScrollIndicator={false}>
            <Section label="Display" s={s}>
              <SegmentedRow
                value={settings.displayMode}
                options={DISPLAY_OPTIONS}
                onSelect={(value) => onChange({ displayMode: value })}
                s={s}
              />
            </Section>

            <Section label="Grid density" s={s}>
              <SegmentedRow
                value={settings.songsPerRow}
                options={DENSITY_OPTIONS}
                onSelect={(value) => onChange({ songsPerRow: value })}
                s={s}
              />
            </Section>

            <Section label="Jacket visibility" s={s}>
              <SegmentedRow
                value={settings.jacketOpacity}
                options={OPACITY_OPTIONS}
                onSelect={(value) => onChange({ jacketOpacity: value })}
                s={s}
              />
            </Section>

            <Section label="Grade letter size" s={s}>
              <SegmentedRow
                value={settings.overlaySize}
                options={OVERLAY_SIZE_OPTIONS}
                onSelect={(value) => onChange({ overlaySize: value })}
                s={s}
              />
              <Text style={s.hint}>How much of each jacket the chunky grade letters cover.</Text>
            </Section>

            <Section label="Default mode" s={s}>
              <SegmentedRow
                value={settings.defaultMode}
                options={DEFAULT_MODE_OPTIONS}
                onSelect={(value) => onChange({ defaultMode: value })}
                s={s}
              />
              <Text style={s.hint}>Used the first time you open Tiers — switch any time with the mode pill.</Text>
            </Section>

            <Section label="Filters" s={s}>
              <ToggleRow
                label="Show unplayed charts"
                hint="Off = only show charts you've passed."
                value={settings.showUnplayed}
                onChange={(value) => onChange({ showUnplayed: value })}
                s={s}
              />
              <ToggleRow
                label="Show empty tiers"
                hint="Keep tier headers visible even when no charts match."
                value={settings.showEmptyTiers}
                onChange={(value) => onChange({ showEmptyTiers: value })}
                s={s}
              />
              <ToggleRow
                label="Show Co-Op mode"
                hint="Include Co-Op (2P/3P/4P/5P) in the mode picker."
                value={settings.showCoOp}
                onChange={(value) => onChange({ showCoOp: value })}
                s={s}
              />
            </Section>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function Section({
  label,
  children,
  s,
}: {
  label: string;
  children: React.ReactNode;
  s: Styles;
}) {
  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>{label.toUpperCase()}</Text>
      <View style={s.sectionBody}>{children}</View>
    </View>
  );
}

function SegmentedRow<T extends string | number>({
  value,
  options,
  onSelect,
  s,
}: {
  value: T;
  options: { value: T; label: string }[];
  onSelect: (value: T) => void;
  s: Styles;
}) {
  return (
    <View style={s.segmentRow}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={String(opt.value)}
            onPress={() => onSelect(opt.value)}
            style={({ pressed }) => [
              s.segment,
              active && s.segmentActive,
              pressed && { opacity: 0.7 },
            ]}>
            <Text style={[s.segmentText, active && s.segmentTextActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
  s,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  s: Styles;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={({ pressed }) => [s.toggleRow, pressed && { opacity: 0.85 }]}>
      <View style={s.toggleText}>
        <Text style={s.toggleLabel}>{label}</Text>
        {hint ? <Text style={s.toggleHint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.surfaceMuted, true: theme.accent }}
        thumbColor="#ffffff"
      />
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' as const },
  backdropFill: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: t.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: t.border,
    maxHeight: '88%' as const,
    paddingHorizontal: 14,
    paddingTop: 8,
    gap: 4,
  },
  handle: {
    alignSelf: 'center' as const,
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: t.border,
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  title: { fontSize: 16, fontWeight: '800' as const, color: t.text, letterSpacing: 0.5 },
  closeBtn: { padding: 6 },

  scrollHost: { flex: 1, minHeight: 0 },
  scroll: { gap: 18, paddingVertical: 8 },

  section: { gap: 8 },
  sectionLabel: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 1.6, color: t.textDim, paddingHorizontal: 4 },
  sectionBody: { gap: 8 },

  segmentRow: {
    flexDirection: 'row' as const,
    backgroundColor: t.surfaceMuted,
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 7,
    alignItems: 'center' as const,
  },
  segmentActive: { backgroundColor: t.card, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  segmentText: { fontSize: 13, fontWeight: '600' as const, color: t.textMuted },
  segmentTextActive: { color: t.text, fontWeight: '700' as const },

  toggleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: t.surfaceMuted,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  toggleText: { flex: 1, gap: 2 },
  toggleLabel: { fontSize: 14, fontWeight: '600' as const, color: t.text },
  toggleHint: { fontSize: 11, color: t.textDim },
  hint: { fontSize: 11, color: t.textDim, paddingHorizontal: 4, marginTop: 2 },
});
