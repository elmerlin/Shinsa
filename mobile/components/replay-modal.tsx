import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { YouTubeEmbed } from '@/components/youtube-embed';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  visible: boolean;
  url?: string;
  title?: string;
  onClose: () => void;
}

/**
 * Fullscreen modal that plays a YouTube replay clip with autoplay. The replay
 * URL typically already has `?start=...&end=...` baked in by the server (see
 * `replay_embed_url` on play rows) so the player jumps straight to the song
 * segment.
 */
export function ReplayModal({ visible, url, title, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(makeStyles);
  if (!url) {
    return (
      <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
        <Pressable style={s.backdrop} onPress={onClose} />
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { marginTop: insets.top + 12, marginBottom: insets.bottom + 12 }]}>
          <View style={s.header}>
            <Text style={s.title} numberOfLines={2}>{title || 'Replay clip'}</Text>
            <Pressable onPress={onClose} hitSlop={8} style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.7 }]}>
              <IconSymbol name="xmark" size={14} color="#fff" />
            </Pressable>
          </View>
          <View style={s.player}>
            <YouTubeEmbed url={url} autoplay />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (t: ThemeColors) => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 12,
  },
  sheet: {
    width: '100%' as const,
    maxWidth: 720,
    borderRadius: 14,
    overflow: 'hidden' as const,
    backgroundColor: '#07111f',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    gap: 10,
  },
  title: { flex: 1, fontSize: 13, fontWeight: '800' as const, color: '#fff' },
  closeBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  player: { width: '100%' as const, backgroundColor: '#000' },
});
