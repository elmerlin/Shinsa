/**
 * Horizontal stories strip rendered at the top of the messages inbox.
 * Keeps the strip lightweight: only highlight buckets load here. Story stacks,
 * comments, stats, and sharing load later when the user opens a story.
 */
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DefaultAvatar } from '@/components/default-avatar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { messagesApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type { StoryHighlightCircle } from '@shared/api';

const HIGHLIGHTS_QUERY_KEY = ['messages', 'highlights'] as const;

interface Props {
  /** Disable network work while the messages route is underneath another screen. */
  enabled?: boolean;
  /** Called when a circle opens; includes ordered story users for next/previous navigation. */
  onPickStory: (userId: string, userIds: string[]) => void;
}

export function StoriesStrip({ enabled = true, onPickStory }: Props) {
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [storyCaption, setStoryCaption] = useState('');
  const [pickedImage, setPickedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);

  const query = useQuery({
    queryKey: HIGHLIGHTS_QUERY_KEY,
    queryFn: () => messagesApi.highlights(),
    enabled: enabled,
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });

  const list = useMemo(() => {
    const out: StoryHighlightCircle[] = [];
    const seen = new Set<string>();
    if (query.data?.me?.user?.id) {
      out.push({ ...query.data.me, is_self: true });
      seen.add(query.data.me.user.id);
    }
    for (const c of query.data?.circles ?? []) {
      if (!c?.user?.id || seen.has(c.user.id)) continue;
      if (!c.has_story && !c.is_self && !getNoteContent(c.note)) continue;
      seen.add(c.user.id);
      out.push(c);
    }
    return out;
  }, [query.data]);

  const storyUserIds = useMemo(
    () => list.filter((circle) => circle.has_story).map((circle) => circle.user.id),
    [list],
  );

  const selfCircle = list.find((circle) => circle.is_self) || null;

  useEffect(() => {
    if (!toolsOpen) return;
    setNoteDraft(getNoteContent(selfCircle?.note));
    setStoryCaption('');
    setPickedImage(null);
  }, [selfCircle?.note, toolsOpen]);

  const invalidateHighlights = () => queryClient.invalidateQueries({ queryKey: HIGHLIGHTS_QUERY_KEY });

  const saveNoteMutation = useMutation({
    mutationFn: () => messagesApi.createNote({ content: noteDraft.trim() }),
    onSuccess: async () => {
      await invalidateHighlights();
      setToolsOpen(false);
    },
  });

  const clearNoteMutation = useMutation({
    mutationFn: () => messagesApi.clearNote(),
    onSuccess: async () => {
      await invalidateHighlights();
      setNoteDraft('');
    },
  });

  const createStoryMutation = useMutation({
    mutationFn: async () => {
      if (!pickedImage?.uri) throw new Error('Choose an image first.');
      const form = new FormData();
      form.append('story_type', 'image');
      if (storyCaption.trim()) form.append('caption', storyCaption.trim());
      form.append('image', {
        uri: pickedImage.uri,
        name: pickedImage.fileName || 'story.jpg',
        type: pickedImage.mimeType || 'image/jpeg',
      } as never);
      return messagesApi.createStoryItem(form);
    },
    onSuccess: async () => {
      await invalidateHighlights();
      setToolsOpen(false);
    },
  });

  const pickStoryImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.88,
      allowsEditing: true,
      aspect: [9, 16],
    });
    if (!result.canceled && result.assets?.[0]) {
      setPickedImage(result.assets[0]);
    }
  };

  if (query.isLoading && !query.data) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={s.circleSkeleton} />
        ))}
      </ScrollView>
    );
  }

  if (list.length === 0) return null;

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
        {list.map((circle) => (
          <StoryCircle
            key={circle.user.id}
            circle={circle}
            onOpenTools={() => setToolsOpen(true)}
            onPress={() => {
              if (circle.has_story) onPickStory(circle.user.id, storyUserIds);
              else if (circle.is_self) setToolsOpen(true);
            }}
          />
        ))}
      </ScrollView>

      <Modal visible={toolsOpen} transparent animationType="none" onRequestClose={() => setToolsOpen(false)}>
        <View style={s.sheetBackdrop}>
          <Pressable style={s.sheetScrim} onPress={() => setToolsOpen(false)} />
          <View style={[s.sheet, { paddingBottom: insets.bottom + 14 }]}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.sheetEyebrow}>Your story</Text>
                <Text style={s.sheetTitle}>Share a photo or status</Text>
              </View>
              <Pressable onPress={() => setToolsOpen(false)} hitSlop={8} style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.7 }]}>
                <IconSymbol name="xmark" size={16} color="#fff" />
              </Pressable>
            </View>

            <View style={s.toolCard}>
              <View style={s.toolHeader}>
                <Text style={s.toolTitle}>Photo story</Text>
                <Pressable onPress={pickStoryImage} style={({ pressed }) => [s.smallBtn, pressed && { opacity: 0.82 }]}>
                  <IconSymbol name="photo" size={14} color="#fff" />
                  <Text style={s.smallBtnText}>{pickedImage ? 'Change' : 'Choose'}</Text>
                </Pressable>
              </View>
              {pickedImage ? (
                <Image source={{ uri: pickedImage.uri }} style={s.storyPreview} contentFit="cover" />
              ) : (
                <View style={s.emptyPreview}>
                  <IconSymbol name="photo" size={22} color="rgba(255,255,255,0.45)" />
                </View>
              )}
              <TextInput
                value={storyCaption}
                onChangeText={setStoryCaption}
                placeholder="Caption"
                placeholderTextColor="rgba(255,255,255,0.45)"
                maxLength={420}
                style={s.input}
              />
              {createStoryMutation.isError ? (
                <Text style={s.errorText}>{createStoryMutation.error instanceof Error ? createStoryMutation.error.message : 'Failed to add story.'}</Text>
              ) : null}
              <Pressable
                disabled={!pickedImage || createStoryMutation.isPending}
                onPress={() => createStoryMutation.mutate()}
                style={({ pressed }) => [s.primaryBtn, (!pickedImage || createStoryMutation.isPending) && s.disabledBtn, pressed && { opacity: 0.85 }]}>
                {createStoryMutation.isPending ? <ActivityIndicator color="#05070d" /> : <Text style={s.primaryBtnText}>Add to story</Text>}
              </Pressable>
            </View>

            <View style={s.toolCard}>
              <Text style={s.toolTitle}>Status bubble</Text>
              <TextInput
                value={noteDraft}
                onChangeText={setNoteDraft}
                placeholder="What are you up to?"
                placeholderTextColor="rgba(255,255,255,0.45)"
                maxLength={120}
                multiline
                style={[s.input, s.noteInput]}
              />
              {saveNoteMutation.isError ? (
                <Text style={s.errorText}>{saveNoteMutation.error instanceof Error ? saveNoteMutation.error.message : 'Failed to save note.'}</Text>
              ) : null}
              <View style={s.noteActions}>
                <Pressable
                  disabled={clearNoteMutation.isPending}
                  onPress={() => clearNoteMutation.mutate()}
                  style={({ pressed }) => [s.secondaryBtn, pressed && { opacity: 0.8 }]}>
                  <Text style={s.secondaryBtnText}>Clear</Text>
                </Pressable>
                <Pressable
                  disabled={!noteDraft.trim() || saveNoteMutation.isPending}
                  onPress={() => saveNoteMutation.mutate()}
                  style={({ pressed }) => [s.primaryBtn, s.noteSaveBtn, (!noteDraft.trim() || saveNoteMutation.isPending) && s.disabledBtn, pressed && { opacity: 0.85 }]}>
                  {saveNoteMutation.isPending ? <ActivityIndicator color="#05070d" /> : <Text style={s.primaryBtnText}>Save note</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function StoryCircle({
  circle,
  onPress,
  onOpenTools,
}: {
  circle: StoryHighlightCircle;
  onPress: () => void;
  onOpenTools: () => void;
}) {
  const s = useThemedStyles(makeStyles);
  const { theme } = useTheme();
  const avatar = circle.user.avatar ? fullImageUrl(circle.user.avatar) : undefined;
  const note = getNoteContent(circle.note);
  const ringStyle = circle.has_story
    ? (circle.has_unseen ? s.ringUnseen : s.ringSeen)
    : circle.is_self
      ? s.ringDashed
      : s.ringNone;

  return (
    <View style={s.circleColumn}>
      {note ? (
        <Pressable
          onPress={circle.is_self ? onOpenTools : onPress}
          style={({ pressed }) => [s.noteBubble, pressed && { opacity: 0.75 }]}>
          <Text style={s.noteText} numberOfLines={2}>{note}</Text>
        </Pressable>
      ) : circle.is_self ? (
        <Pressable
          onPress={onOpenTools}
          style={({ pressed }) => [s.noteBubble, s.noteBubbleEmpty, pressed && { opacity: 0.75 }]}>
          <Text style={s.noteText} numberOfLines={1}>Set status</Text>
        </Pressable>
      ) : null}

      <Pressable onPress={onPress} style={({ pressed }) => [s.circleWrap, pressed && { opacity: 0.7 }]}>
        <View style={[s.ring, ringStyle]}>
          <View style={s.avatarInner}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={s.avatarImg} contentFit="cover" />
            ) : (
              <DefaultAvatar size={52} />
            )}
          </View>
          {circle.is_self ? (
            <Pressable onPress={onOpenTools} hitSlop={8} style={[s.composeBadge, { backgroundColor: theme.accent }]}>
              <Text style={s.composeBadgePlus}>+</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={s.label} numberOfLines={1}>
          {circle.is_self ? 'Your story' : circle.user.username}
        </Text>
      </Pressable>
    </View>
  );
}

function getNoteContent(note: StoryHighlightCircle['note'] | undefined | null): string {
  return String(note?.content || note?.text || '').trim();
}

const makeStyles = (t: ThemeColors) => ({
  strip: {
    paddingHorizontal: 8,
    paddingTop: 26,
    paddingBottom: 8,
    gap: 8,
    alignItems: 'flex-end' as const,
  },
  circleSkeleton: { width: 64, height: 64, borderRadius: 32, backgroundColor: t.surfaceMuted },
  circleColumn: { width: 76, alignItems: 'center' as const, position: 'relative' as const },
  circleWrap: { width: 68, alignItems: 'center' as const, gap: 4 },
  noteBubble: {
    minHeight: 24,
    maxWidth: 76,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    marginBottom: 5,
    backgroundColor: t.surfaceMuted,
    borderWidth: 1,
    borderColor: t.border,
  },
  noteBubbleEmpty: { borderStyle: 'dashed' as const, backgroundColor: 'transparent' },
  noteText: { color: t.text, fontSize: 9, fontWeight: '800' as const, lineHeight: 12, textAlign: 'center' as const },
  ring: {
    width: 64,
    height: 64,
    borderRadius: 32,
    padding: 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    position: 'relative' as const,
  },
  ringUnseen: { borderWidth: 2, borderColor: t.accent },
  ringSeen: { borderWidth: 2, borderColor: t.border },
  ringDashed: { borderWidth: 1.5, borderColor: t.accent, borderStyle: 'dashed' as const },
  ringNone: { borderWidth: 0 },
  avatarInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden' as const,
    backgroundColor: t.surfaceMuted,
  },
  avatarImg: { width: '100%' as const, height: '100%' as const },
  composeBadge: {
    position: 'absolute' as const,
    bottom: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
    borderColor: t.bg,
  },
  composeBadgePlus: { color: t.bg, fontSize: 12, fontWeight: '900' as const, lineHeight: 14 },
  label: { fontSize: 10, fontWeight: '700' as const, color: t.textMuted, maxWidth: 64 },

  sheetBackdrop: { flex: 1, justifyContent: 'flex-end' as const, backgroundColor: 'rgba(0,0,0,0.62)' },
  sheetScrim: { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0 },
  sheet: {
    backgroundColor: '#070b13',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 14,
    paddingTop: 8,
    gap: 12,
  },
  sheetHandle: { alignSelf: 'center' as const, width: 42, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', marginBottom: 2 },
  sheetHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  sheetEyebrow: { color: '#67e8f9', fontSize: 10, fontWeight: '900' as const, letterSpacing: 1.2, textTransform: 'uppercase' as const },
  sheetTitle: { color: '#fff', fontSize: 18, fontWeight: '900' as const, marginTop: 2 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: 'rgba(255,255,255,0.08)' },
  toolCard: { borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.045)', padding: 12, gap: 10 },
  toolHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 12 },
  toolTitle: { color: '#fff', fontSize: 14, fontWeight: '900' as const },
  smallBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, borderRadius: 999, paddingHorizontal: 12, height: 32, backgroundColor: 'rgba(255,255,255,0.1)' },
  smallBtnText: { color: '#fff', fontSize: 12, fontWeight: '900' as const },
  storyPreview: { width: '100%' as const, height: 180, borderRadius: 14, backgroundColor: '#0f172a' },
  emptyPreview: { height: 90, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed' as const, borderColor: 'rgba(255,255,255,0.14)', alignItems: 'center' as const, justifyContent: 'center' as const },
  input: { minHeight: 42, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, color: '#fff', backgroundColor: 'rgba(0,0,0,0.32)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', fontSize: 13, fontWeight: '700' as const },
  noteInput: { minHeight: 82, textAlignVertical: 'top' as const },
  noteActions: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 10 },
  primaryBtn: { minHeight: 42, borderRadius: 999, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: '#facc15', paddingHorizontal: 18 },
  noteSaveBtn: { flex: 1 },
  primaryBtnText: { color: '#05070d', fontSize: 13, fontWeight: '900' as const },
  secondaryBtn: { minHeight: 42, borderRadius: 999, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 18 },
  secondaryBtnText: { color: '#fff', fontSize: 13, fontWeight: '900' as const },
  disabledBtn: { opacity: 0.45 },
  errorText: { color: '#fca5a5', fontSize: 12, fontWeight: '700' as const },
});

export { HIGHLIGHTS_QUERY_KEY };
