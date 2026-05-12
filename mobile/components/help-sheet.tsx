import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ThemeColors } from '@/constants/theme';
import type { HelpContent } from '@/lib/training-help';

interface Props {
  visible: boolean;
  content: HelpContent | null;
  onClose: () => void;
}

/**
 * Generic explainer bottom sheet. Drives the (?) buttons throughout the
 * Training screen — pass it any `HelpContent` from `lib/training-help.ts`
 * and it renders a scrollable card stack with a title, subtitle and one
 * card per section.
 */
export function HelpSheet({ visible, content, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  if (!content) return null;
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={s.backdropFill} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={s.handle} />
          <View style={s.titleRow}>
            <View style={s.titleText}>
              <Text style={s.title}>{content.title}</Text>
              {content.subtitle ? <Text style={s.subtitle}>{content.subtitle}</Text> : null}
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.6 }]}>
              <IconSymbol name="xmark" size={16} color={theme.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={s.list} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
            {content.sections.map((section) => (
              <View key={section.label} style={s.section}>
                <Text style={s.sectionLabel}>{section.label}</Text>
                <Text style={s.sectionBody}>{section.body}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Tiny circular (?) tap target used inline next to section titles. Keeping
 * it visually quiet on purpose — the mark only needs to register as
 * "tappable for more info" without competing with the data behind it.
 */
export function HelpButton({ onPress, color, size = 18 }: { onPress: () => void; color?: string; size?: number }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [
        styles.btn,
        { width: size, height: size, borderRadius: size / 2, borderColor: color || theme.border },
        pressed && { opacity: 0.6 },
      ]}
      accessibilityLabel="Show help">
      <Text style={[styles.btnGlyph, { color: color || theme.textMuted, fontSize: size * 0.6 }]}>?</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGlyph: {
    fontWeight: '900',
    lineHeight: 14,
    includeFontPadding: false,
  },
});

const makeStyles = (t: ThemeColors) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' as const },
  backdropFill: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: t.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: t.border,
    maxHeight: '85%' as const,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center' as const,
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: t.border,
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 4,
    paddingBottom: 12,
    gap: 8,
  },
  titleText: { flex: 1, gap: 2 },
  title: { fontSize: 18, fontWeight: '900' as const, color: t.text, letterSpacing: 0.3 },
  subtitle: { fontSize: 12, color: t.textMuted },
  closeBtn: { padding: 6 },

  list: { maxHeight: 600 },
  listContent: { gap: 10, paddingBottom: 12 },

  section: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 14,
    gap: 6,
  },
  sectionLabel: { fontSize: 11, fontWeight: '900' as const, letterSpacing: 1.4, color: t.accent },
  sectionBody: { fontSize: 13, lineHeight: 19, color: t.text },
});
