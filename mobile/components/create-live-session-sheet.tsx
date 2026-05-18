import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { liveApi } from '@/lib/api';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Fired with the new session id after a successful create. Parent typically
   *  routes the user straight into the live viewer for that id. */
  onCreated: (sessionId: string) => void;
}

/**
 * Bottom-sheet form for starting a live session. Mirrors the web's
 * "Create Session" card on `/live` — title + optional stream URL + unlisted
 * toggle. Hour of Power is a separate session_type the web exposes through
 * a different entry point, so we keep the type fixed at 'live' here and add
 * HOP support in a follow-up.
 */
export function CreateLiveSessionSheet({ visible, onClose, onCreated }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [isUnlisted, setIsUnlisted] = useState(false);

  const createMutation = useMutation({
    mutationFn: () =>
      liveApi.createSession({
        title: title.trim() || undefined,
        stream_url: streamUrl.trim() || undefined,
        is_unlisted: isUnlisted,
        session_type: 'live',
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['live-sessions'] });
      setTitle('');
      setStreamUrl('');
      setIsUnlisted(false);
      onCreated(data.session.id);
    },
  });

  const handleClose = () => {
    if (createMutation.isPending) return;
    onClose();
  };

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={handleClose}>
      <View style={s.backdrop}>
        <Pressable style={s.backdropFill} onPress={handleClose} />
        <KeyboardAvoidingView behavior="padding" style={s.sheetWrap}>
          <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={s.handle} />
            <View style={s.titleRow}>
              <View style={s.titleStack}>
                <Text style={s.title}>Start a live session</Text>
                <Text style={s.subtitle}>Broadcast your arcade plays to followers in real time.</Text>
              </View>
              <Pressable onPress={handleClose} hitSlop={10} style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.6 }]}>
                <IconSymbol name="xmark" size={16} color={theme.textMuted} />
              </Pressable>
            </View>

            <View style={s.field}>
              <Text style={s.fieldLabel}>Title (optional)</Text>
              <TextInput
                style={s.input}
                value={title}
                onChangeText={setTitle}
                placeholder="London Saturday Dojo"
                placeholderTextColor={theme.textDim}
                maxLength={120}
                editable={!createMutation.isPending}
              />
              <Text style={s.fieldHint}>Leave blank to auto-name "{`{your username}`} live session".</Text>
            </View>

            <View style={s.field}>
              <Text style={s.fieldLabel}>Stream URL (optional)</Text>
              <TextInput
                style={s.input}
                value={streamUrl}
                onChangeText={setStreamUrl}
                placeholder="https://www.youtube.com/watch?v=…"
                placeholderTextColor={theme.textDim}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                editable={!createMutation.isPending}
              />
              <Text style={s.fieldHint}>Viewers can tap through to watch your stream alongside the score feed.</Text>
            </View>

            <View style={s.toggleRow}>
              <View style={s.toggleText}>
                <Text style={s.toggleLabel}>Unlisted</Text>
                <Text style={s.toggleHint}>Only visible to people you share the link with — hidden from the directory.</Text>
              </View>
              <Switch
                value={isUnlisted}
                onValueChange={setIsUnlisted}
                trackColor={{ false: theme.surfaceMuted, true: theme.accent }}
                thumbColor="#ffffff"
              />
            </View>

            {createMutation.isError ? (
              <Text style={s.errorText}>
                {createMutation.error instanceof Error ? createMutation.error.message : 'Failed to create session'}
              </Text>
            ) : null}

            <Pressable
              onPress={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              style={({ pressed }) => [
                s.submitBtn,
                createMutation.isPending && { opacity: 0.6 },
                pressed && { opacity: 0.85 },
              ]}>
              {createMutation.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <View style={s.submitPulse} />
                  <Text style={s.submitText}>GO LIVE</Text>
                </>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const makeStyles = (t: ThemeColors) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' as const },
  backdropFill: { ...StyleSheet.absoluteFillObject },
  sheetWrap: { width: '100%' as const },
  sheet: {
    backgroundColor: t.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: t.border,
    paddingHorizontal: 14,
    paddingTop: 8,
    gap: 14,
  },
  handle: { alignSelf: 'center' as const, width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginBottom: 4 },
  titleRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, justifyContent: 'space-between' as const, paddingHorizontal: 4, gap: 8 },
  titleStack: { flex: 1, gap: 2 },
  title: { fontSize: 18, fontWeight: '900' as const, color: t.text, letterSpacing: 0.3 },
  subtitle: { fontSize: 12, color: t.textMuted },
  closeBtn: { padding: 6 },

  field: { gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: '800' as const, color: t.textMuted, paddingHorizontal: 4 },
  fieldHint: { fontSize: 11, color: t.textDim, paddingHorizontal: 4 },
  input: {
    backgroundColor: t.card,
    color: t.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },

  toggleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: t.card,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  toggleText: { flex: 1, gap: 2 },
  toggleLabel: { fontSize: 14, fontWeight: '700' as const, color: t.text },
  toggleHint: { fontSize: 11, color: t.textDim },

  errorText: { color: t.danger, fontSize: 12, paddingHorizontal: 6 },

  submitBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 10,
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
  },
  submitPulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  submitText: { fontSize: 14, fontWeight: '900' as const, color: '#fff', letterSpacing: 2 },
});
