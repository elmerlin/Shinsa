import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { TopBar } from '@/components/top-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { socialApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import { parseLiveSessionMarker } from '@/lib/liveSessionMarker';
import type { ThemeColors } from '@/constants/theme';
import type { Post } from '@shared/api';

const MAX_IMAGES = 9;
const MAX_CONTENT = 5000;

interface DraftImage {
  uri: string;
  /** File name with extension. */
  name: string;
  /** MIME type, e.g. image/jpeg. */
  type: string;
}

function timeAgo(input?: string): string {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  const ms = Date.now() - d.getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return d.toLocaleDateString();
}

function parseImages(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as string[];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function inferImageMeta(uri: string, fallbackIdx: number): { name: string; type: string } {
  const lastSegment = uri.split('?')[0].split('/').pop() || `image-${fallbackIdx}.jpg`;
  const ext = (lastSegment.split('.').pop() || 'jpg').toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'heic' ? 'image/heic' : 'image/jpeg';
  return { name: lastSegment.includes('.') ? lastSegment : `image-${fallbackIdx}.${ext}`, type: mime };
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

export default function PostsScreen() {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const router = useRouter();
  const { user } = useAuth();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();

  const [content, setContent] = useState('');
  const [images, setImages] = useState<DraftImage[]>([]);
  const [youtubeOpen, setYoutubeOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');

  const myPostsQuery = useQuery({
    queryKey: ['my-posts', user?.id ?? null],
    queryFn: () => (user?.id ? socialApi.userPosts(user.id, 1) : Promise.resolve([] as Post[])),
    enabled: !!user?.id,
  });

  const submitMutation = useMutation({
    mutationFn: () => socialApi.createPost({
      content: content.trim() || undefined,
      images,
      youtubeUrl: youtubeUrl.trim() || undefined,
    }),
    onSuccess: () => {
      setContent('');
      setImages([]);
      setYoutubeUrl('');
      setYoutubeOpen(false);
      queryClient.invalidateQueries({ queryKey: ['my-posts'] });
      queryClient.invalidateQueries({ queryKey: ['social-feed'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => socialApi.deletePost(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-posts'] });
      queryClient.invalidateQueries({ queryKey: ['social-feed'] });
    },
  });

  const hasContent = content.trim().length > 0 || images.length > 0 || youtubeUrl.trim().length > 0;
  const canSubmit = hasContent && !submitMutation.isPending;

  const pickImages = async () => {
    if (images.length >= MAX_IMAGES) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to attach images.');
      return;
    }
    const remaining = MAX_IMAGES - images.length;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.85,
    });
    if (result.canceled) return;
    const next = result.assets.map((asset, i) => {
      const meta = inferImageMeta(asset.uri, images.length + i);
      return {
        uri: asset.uri,
        name: asset.fileName || meta.name,
        type: asset.mimeType || meta.type,
      };
    });
    setImages((prev) => [...prev, ...next].slice(0, MAX_IMAGES));
  };

  const removeImage = (idx: number) => setImages((prev) => prev.filter((_, i) => i !== idx));

  const confirmDelete = (post: Post) => {
    Alert.alert('Delete post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(String(post.id)) },
    ]);
  };

  const submitError = submitMutation.error instanceof Error ? submitMutation.error.message : '';

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={[s.scroll, { paddingTop: insets.top + 12, paddingBottom: keyboardHeight > 0 ? keyboardHeight + 16 : 80 }]} keyboardShouldPersistTaps="handled">
        <View style={s.topBar}>
          <TopBar />
        </View>

        <View style={s.composer}>
          <TextInput
            style={s.textArea}
            value={content}
            onChangeText={setContent}
            placeholder="What's on your mind?"
            placeholderTextColor={theme.textDim}
            multiline
            maxLength={MAX_CONTENT}
            editable={!submitMutation.isPending}
          />

          {images.length > 0 ? (
            <View style={s.imageGrid}>
              {images.map((img, i) => (
                <View key={`${img.uri}:${i}`} style={s.imageWrap}>
                  <Image source={{ uri: img.uri }} style={s.imageThumb} contentFit="cover" />
                  <Pressable
                    onPress={() => removeImage(i)}
                    hitSlop={6}
                    style={({ pressed }) => [s.imageRemove, pressed && { opacity: 0.7 }]}>
                    <IconSymbol name="xmark" size={10} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {youtubeOpen ? (
            <View style={s.youtubeRow}>
              <IconSymbol name="play.rectangle.fill" size={16} color={theme.textMuted} />
              <TextInput
                style={s.youtubeInput}
                value={youtubeUrl}
                onChangeText={setYoutubeUrl}
                placeholder="Paste YouTube URL"
                placeholderTextColor={theme.textDim}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                editable={!submitMutation.isPending}
              />
              <Pressable
                onPress={() => { setYoutubeOpen(false); setYoutubeUrl(''); }}
                hitSlop={6}
                style={({ pressed }) => [s.youtubeClose, pressed && { opacity: 0.7 }]}>
                <IconSymbol name="xmark" size={10} color={theme.textMuted} />
              </Pressable>
            </View>
          ) : null}

          <View style={s.toolbar}>
            <Pressable
              onPress={pickImages}
              disabled={images.length >= MAX_IMAGES || submitMutation.isPending}
              hitSlop={6}
              style={({ pressed }) => [s.toolBtn, pressed && { opacity: 0.6 }, images.length >= MAX_IMAGES && { opacity: 0.4 }]}>
              <IconSymbol name="photo" size={18} color={theme.textMuted} />
              {images.length > 0 ? <Text style={s.toolBtnCount}>{images.length}</Text> : null}
            </Pressable>
            <Pressable
              onPress={() => setYoutubeOpen((v) => !v)}
              hitSlop={6}
              style={({ pressed }) => [s.toolBtn, pressed && { opacity: 0.6 }, youtubeOpen && s.toolBtnActive]}>
              <IconSymbol name="play.rectangle.fill" size={18} color={youtubeOpen ? theme.accent : theme.textMuted} />
            </Pressable>

            <View style={{ flex: 1 }} />

            <Pressable
              onPress={() => submitMutation.mutate()}
              disabled={!canSubmit}
              style={({ pressed }) => [
                s.postBtn,
                !canSubmit && { opacity: 0.4 },
                pressed && { opacity: 0.7 },
              ]}>
              {submitMutation.isPending ? (
                <ActivityIndicator color={theme.textOnAccent} size="small" />
              ) : (
                <Text style={s.postBtnText}>Post</Text>
              )}
            </Pressable>
          </View>

          {submitError ? <Text style={s.error}>{submitError}</Text> : null}
        </View>

        <View style={s.section}>
          <Text style={s.eyebrow}>YOUR POSTS</Text>
          {myPostsQuery.isLoading ? (
            <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
          ) : myPostsQuery.isError ? (
            <Text style={s.error}>
              {myPostsQuery.error instanceof Error ? myPostsQuery.error.message : 'Failed to load posts'}
            </Text>
          ) : (myPostsQuery.data?.length ?? 0) === 0 ? (
            <View style={s.emptyCard}>
              <Text style={s.emptyText}>No posts yet</Text>
            </View>
          ) : (
            <View style={s.postsList}>
              {(myPostsQuery.data ?? []).map((post) => {
                const imgs = parseImages(post.images);
                const firstImg = imgs[0] ? fullImageUrl(imgs[0]) : undefined;
                const { content: bodyText, summary } = parseLiveSessionMarker(post.content);
                // Strip any other SHINSA_*_V1 share markers (e.g. SHINSA_SHARE_V1
                // for chart shares) — they're rendered fully on the post detail
                // page, so a placeholder is enough in the snippet.
                const stripped = bodyText.replace(/\[\[SHINSA_[A-Z]+_V\d+:[^\]]+\]\]/g, '').trim();
                const placeholder = summary
                  ? `Live session recap${summary.sessionMachineName ? ` · ${summary.sessionMachineName}` : ''}`
                  : (bodyText !== stripped ? 'Shared link' : '');
                const displayBody = stripped || placeholder;
                return (
                  <Pressable
                    key={String(post.id)}
                    onPress={() => router.push({ pathname: '/post/[id]', params: { id: String(post.id) } })}
                    style={({ pressed }) => [s.postCard, pressed && { opacity: 0.85 }]}>
                    <View style={s.postHeader}>
                      <Text style={s.postTime}>{timeAgo(post.created_at)}</Text>
                      <Pressable
                        onPress={(e) => { e.stopPropagation(); confirmDelete(post); }}
                        hitSlop={8}
                        style={({ pressed }) => [s.deleteBtn, pressed && { opacity: 0.6 }]}>
                        <IconSymbol name="xmark" size={11} color={theme.danger} />
                      </Pressable>
                    </View>
                    {displayBody ? <Text style={s.postContent} numberOfLines={4}>{displayBody}</Text> : null}
                    {firstImg ? (
                      <Image source={{ uri: firstImg }} style={s.postImage} contentFit="cover" />
                    ) : null}
                    <View style={s.postFooter}>
                      <Text style={s.metric}>↑ {post.pump_count ?? 0}</Text>
                      <Text style={s.metric}>💬 {post.comment_count ?? 0}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  scroll: { padding: 16, paddingBottom: 80, gap: 18 },
  topBar: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingBottom: 8 },
  heading: { flex: 1, fontSize: 28, fontWeight: '800' as const, color: t.text, letterSpacing: 2 },
  center: { padding: 32, alignItems: 'center' as const },

  composer: {
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 12,
    gap: 10,
  },
  textArea: {
    color: t.text,
    fontSize: 15,
    lineHeight: 21,
    minHeight: 84,
    maxHeight: 260,
    paddingVertical: 4,
    textAlignVertical: 'top' as const,
  },

  imageGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  imageWrap: {
    width: 76,
    height: 76,
    borderRadius: 8,
    overflow: 'hidden' as const,
    position: 'relative' as const,
  },
  imageThumb: { width: '100%' as const, height: '100%' as const, backgroundColor: t.surfaceMuted },
  imageRemove: {
    position: 'absolute' as const,
    top: 3,
    right: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  youtubeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: t.surfaceMuted,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  youtubeInput: { flex: 1, color: t.text, fontSize: 13 },
  youtubeClose: { padding: 4 },

  toolbar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },
  toolBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  toolBtnActive: { backgroundColor: t.accentTint },
  toolBtnCount: { fontSize: 11, fontWeight: '800' as const, color: t.accent },

  postBtn: {
    backgroundColor: t.accent,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
    minWidth: 64,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  postBtnText: { color: t.textOnAccent, fontSize: 13, fontWeight: '800' as const, letterSpacing: 0.5 },

  error: { color: t.danger, fontSize: 12, paddingTop: 4 },

  section: { gap: 8 },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800' as const,
    letterSpacing: 2,
    color: t.accent,
    textTransform: 'uppercase' as const,
  },

  emptyCard: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 20,
    alignItems: 'center' as const,
  },
  emptyText: { fontSize: 12, color: t.textDim },

  postsList: { gap: 8 },
  postCard: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 12,
    gap: 8,
  },
  postHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  postTime: { fontSize: 11, color: t.textDim },
  deleteBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: t.dangerBg,
  },
  postContent: { fontSize: 14, color: t.text, lineHeight: 20 },
  postImage: { width: '100%' as const, aspectRatio: 16 / 9, borderRadius: 8, backgroundColor: t.surfaceMuted },
  postFooter: {
    flexDirection: 'row' as const,
    gap: 14,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },
  metric: { fontSize: 12, fontWeight: '700' as const, color: t.textMuted },
});
