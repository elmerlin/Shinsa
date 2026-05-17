/**
 * Long-press action sheet for a message bubble. Shows the reaction picker
 * row at the top, then standard message actions (Unsend).
 *
 * Server only allows the sender to unsend; we hide the row when `own` is
 * false. Copy + Reply are deferred — Copy needs `expo-clipboard` and
 * Reply needs a thread-level reply-target banner.
 */
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ReactionPickerRow } from '@/components/messages/message-reactions';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ThemeColors } from '@/constants/theme';

export interface MessageActionTarget {
  messageId: string;
  /** True when the viewer is the sender (enables Unsend). */
  own: boolean;
  /** Plain-text body for Copy. Empty for unsent / pure-embed messages. */
  body: string;
  viewerReaction?: string;
}

interface Props {
  target: MessageActionTarget | null;
  onClose: () => void;
  onReact: (messageId: string, key: string) => void;
  onUnsend: (messageId: string) => void;
}

export function MessageActionSheet({ target, onClose, onReact, onUnsend }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);

  if (!target) return null;

  const handleReact = (key: string) => {
    onReact(target.messageId, key);
    onClose();
  };

  const handleCopy = () => {
    // expo-clipboard isn't installed yet; fall back to the web Clipboard API
    // so at least desktop preview / web build can copy.
    if (target.body && Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(target.body).catch(() => {});
    }
    onClose();
  };

  const handleUnsend = () => {
    onUnsend(target.messageId);
    onClose();
  };

  const showCopy = target.body && Platform.OS === 'web';

  return (
    <Modal visible={!!target} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable
          style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={s.handle} />

          <ReactionPickerRow viewerReaction={target.viewerReaction} onPick={handleReact} />

          <View style={s.divider} />

          {showCopy ? (
            <ActionRow
              icon="doc.on.doc"
              label="Copy text"
              color={theme.text}
              onPress={handleCopy}
            />
          ) : null}
          {target.own ? (
            <ActionRow
              icon="trash"
              label="Unsend message"
              color={theme.danger}
              onPress={handleUnsend}
            />
          ) : null}
          <ActionRow icon="xmark" label="Cancel" color={theme.textMuted} onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ActionRow({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) {
  const s = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.actionRow, pressed && { opacity: 0.7 }]}>
      {/* IconSymbol's name prop is typed to a closed enum — relax to string */}
      <IconSymbol name={icon as never} size={18} color={color} />
      <Text style={[s.actionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' as const },
  sheet: {
    backgroundColor: t.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: t.border,
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  handle: { alignSelf: 'center' as const, width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginBottom: 4 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginVertical: 4 },

  actionRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 10,
  },
  actionLabel: { fontSize: 15, fontWeight: '700' as const },
});
