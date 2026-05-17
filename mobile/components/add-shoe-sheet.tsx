import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
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
import { piugameApi } from '@/lib/api';
import type { PiugameShoeCatalogEntry } from '@shared/api';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  visible: boolean;
  /** Tells the form whether the cabinet already has a current pair — informs
   *  the default for the "Set as current" toggle. */
  hasCurrentShoe: boolean;
  onClose: () => void;
  /** Called after a successful add — parent should invalidate the cabinet query. */
  onAdded: () => void;
}

function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * Bottom sheet for adding a shoe to the current user's cabinet. Has two
 * entry paths:
 *  - Catalog search → tap a curated result to pre-fill all three fields
 *    plus auto-attach the catalog's image via `catalog_id`.
 *  - Manual entry — free-type make / model / colorway when the catalog
 *    doesn't have what you wear.
 *
 * Photo upload from device is deferred to a follow-up — the catalog
 * already covers most plays with high-quality images, and shoes added
 * without a catalog_id still render fine in the cabinet via the fallback
 * 👟 emoji.
 */
export function AddShoeSheet({ visible, hasCurrentShoe, onClose, onAdded }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 220);
  const [selected, setSelected] = useState<PiugameShoeCatalogEntry | null>(null);
  // Free-form overrides — only used when `selected` is null.
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [colorway, setColorway] = useState('');
  const [setCurrent, setSetCurrent] = useState(!hasCurrentShoe);
  /** Local-file photo the user picked. Sent server-side as multipart on submit. */
  const [photo, setPhoto] = useState<{ uri: string; mimeType: string; fileName: string } | null>(null);

  // Reset state on close.
  useEffect(() => {
    if (!visible) {
      setSearch('');
      setSelected(null);
      setMake('');
      setModel('');
      setColorway('');
      setPhoto(null);
    }
  }, [visible]);

  const pickPhoto = async () => {
    // Request media-library permission lazily. Skip the prompt if it's
    // already been granted/denied — the picker handles redirect to settings
    // for the user if they've previously denied.
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setPhoto({
      uri: asset.uri,
      mimeType: asset.mimeType || 'image/jpeg',
      fileName: asset.fileName || `shoe-${Date.now()}.jpg`,
    });
  };

  // Sync the default "set as current" toggle when the cabinet state changes
  // between opens — first shoe should default to current; subsequent ones
  // should default off so the user opts in.
  useEffect(() => {
    if (visible) setSetCurrent(!hasCurrentShoe);
  }, [visible, hasCurrentShoe]);

  const catalogQuery = useQuery({
    queryKey: ['shoe-catalog', debouncedSearch],
    queryFn: () => piugameApi.shoesCatalog({ q: debouncedSearch, limit: 20 }),
    enabled: visible,
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: () => {
      // Resolve which fields go into the request — catalog selections take
      // precedence over manual entry, with the catalog_id linking the row to
      // the curated entry server-side.
      const fields = selected
        ? {
            make: selected.make,
            model: selected.model,
            colorway: selected.colorway,
            catalog_id: String(selected.catalog_id),
            set_current: setCurrent ? '1' : '0',
          }
        : {
            make: make.trim(),
            model: model.trim(),
            colorway: colorway.trim(),
            set_current: setCurrent ? '1' : '0',
          };

      // When the user picked a photo, we need multipart/form-data so the
      // server's Sharp pipeline gets the raw bytes. Otherwise JSON is fine
      // (catalog selections auto-attach the curated photo).
      if (photo) {
        const form = new FormData();
        Object.entries(fields).forEach(([k, v]) => {
          if (v != null && v !== '') form.append(k, String(v));
        });
        // RN's FormData accepts the `{ uri, name, type }` shape — `as any`
        // satisfies TS since this is a platform-specific extension to the spec.
        form.append('photo', {
          uri: photo.uri,
          name: photo.fileName,
          type: photo.mimeType,
        } as unknown as Blob);
        return piugameApi.addShoe(form);
      }

      return piugameApi.addShoe(fields as unknown as Parameters<typeof piugameApi.addShoe>[0]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['piugame-shoes'] });
      onAdded();
    },
  });

  const canSubmit = useMemo(() => {
    if (selected) return true;
    return make.trim().length > 0 && model.trim().length > 0;
  }, [selected, make, model]);

  const results = catalogQuery.data?.results ?? [];

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={s.backdropFill} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.sheetWrap}>
          <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={s.handle} />
            <View style={s.titleRow}>
              <Text style={s.title}>Add a shoe</Text>
              <Pressable onPress={onClose} hitSlop={10} style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.6 }]}>
                <IconSymbol name="xmark" size={16} color={theme.textMuted} />
              </Pressable>
            </View>

            <ScrollView style={s.body} contentContainerStyle={s.bodyContent} keyboardShouldPersistTaps="handled">
              {!selected ? (
                <>
                  <View style={s.searchRow}>
                    <TextInput
                      style={s.search}
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Search Nike, Free RN, Pegasus…"
                      placeholderTextColor={theme.textDim}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="search"
                      clearButtonMode="while-editing"
                    />
                  </View>

                  <Text style={s.eyebrow}>CATALOG</Text>
                  {catalogQuery.isLoading ? (
                    <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
                  ) : results.length === 0 ? (
                    <Text style={s.emptyText}>
                      {debouncedSearch
                        ? 'No catalog matches. Add it manually below.'
                        : 'Start typing to search.'}
                    </Text>
                  ) : (
                    <View style={s.resultsCol}>
                      {results.map((entry) => (
                        <Pressable
                          key={entry.id}
                          onPress={() => setSelected(entry)}
                          style={({ pressed }) => [s.resultRow, pressed && { opacity: 0.8 }]}>
                          {entry.image_data ? (
                            <Image source={{ uri: entry.image_data }} style={s.resultImg} contentFit="contain" />
                          ) : (
                            <View style={[s.resultImg, s.resultImgFallback]}>
                              <Text style={s.resultEmoji}>👟</Text>
                            </View>
                          )}
                          <View style={s.resultText}>
                            <Text style={s.resultMake}>{entry.make}</Text>
                            <Text style={s.resultModel} numberOfLines={1}>{entry.model}</Text>
                            {entry.colorway ? (
                              <Text style={s.resultColorway} numberOfLines={1}>{entry.colorway}</Text>
                            ) : null}
                          </View>
                          {entry.usage_count > 0 ? (
                            <Text style={s.resultUsage}>{entry.usage_count}×</Text>
                          ) : null}
                        </Pressable>
                      ))}
                    </View>
                  )}

                  <View style={s.divider}>
                    <View style={s.dividerLine} />
                    <Text style={s.dividerText}>OR ADD MANUALLY</Text>
                    <View style={s.dividerLine} />
                  </View>

                  <View style={s.formCol}>
                    <Field label="Make" value={make} onChange={setMake} placeholder="Nike, Adidas, New Balance…" s={s} theme={theme} maxLength={80} />
                    <Field label="Model" value={model} onChange={setModel} placeholder="Pegasus 40, Free RN 2018…" s={s} theme={theme} maxLength={80} />
                    <Field label="Colorway (optional)" value={colorway} onChange={setColorway} placeholder="Black/White" s={s} theme={theme} maxLength={120} />
                  </View>
                </>
              ) : (
                <View style={s.selectedCard}>
                  <Text style={s.eyebrow}>SELECTED</Text>
                  <View style={s.selectedRow}>
                    {selected.image_data ? (
                      <Image source={{ uri: selected.image_data }} style={s.selectedImg} contentFit="contain" />
                    ) : (
                      <View style={[s.selectedImg, s.resultImgFallback]}>
                        <Text style={s.resultEmoji}>👟</Text>
                      </View>
                    )}
                    <View style={s.selectedText}>
                      <Text style={s.selectedMake}>{selected.make}</Text>
                      <Text style={s.selectedModel}>{selected.model}</Text>
                      {selected.colorway ? <Text style={s.selectedColorway}>{selected.colorway}</Text> : null}
                    </View>
                  </View>
                  <Pressable
                    onPress={() => setSelected(null)}
                    hitSlop={6}
                    style={({ pressed }) => [s.changeBtn, pressed && { opacity: 0.7 }]}>
                    <Text style={s.changeBtnText}>Change</Text>
                  </Pressable>
                </View>
              )}

              <View style={s.photoRow}>
                <Pressable
                  onPress={pickPhoto}
                  style={({ pressed }) => [s.photoPicker, pressed && { opacity: 0.85 }]}>
                  {photo ? (
                    <Image source={{ uri: photo.uri }} style={s.photoPreview} contentFit="cover" />
                  ) : selected?.image_data ? (
                    <Image source={{ uri: selected.image_data }} style={s.photoPreview} contentFit="contain" />
                  ) : (
                    <Text style={s.photoEmoji}>📷</Text>
                  )}
                </Pressable>
                <View style={s.photoText}>
                  <Text style={s.photoLabel}>
                    {photo ? 'Photo selected' : selected?.image_data ? 'Using catalog photo' : 'Add a photo (optional)'}
                  </Text>
                  <Text style={s.photoHint}>
                    {photo
                      ? 'Tap to swap, or clear to use the catalog photo.'
                      : selected
                        ? 'Tap to override with your own snap.'
                        : 'JPG, PNG, or HEIC — server resizes for you.'}
                  </Text>
                  {photo ? (
                    <Pressable onPress={() => setPhoto(null)} hitSlop={4} style={({ pressed }) => [s.photoClearBtn, pressed && { opacity: 0.7 }]}>
                      <Text style={s.photoClearBtnText}>Remove photo</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              <View style={s.toggleRow}>
                <View style={s.toggleText}>
                  <Text style={s.toggleLabel}>Set as current pair</Text>
                  <Text style={s.toggleHint}>
                    {hasCurrentShoe
                      ? 'Your existing current pair will be moved to available.'
                      : 'This will be your first current pair.'}
                  </Text>
                </View>
                <Switch
                  value={setCurrent}
                  onValueChange={setSetCurrent}
                  trackColor={{ false: theme.surfaceMuted, true: theme.accent }}
                  thumbColor="#ffffff"
                />
              </View>

              {addMutation.isError ? (
                <Text style={s.errorText}>
                  {addMutation.error instanceof Error ? addMutation.error.message : 'Failed to add shoe'}
                </Text>
              ) : null}

              <Pressable
                onPress={() => addMutation.mutate()}
                disabled={!canSubmit || addMutation.isPending}
                style={({ pressed }) => [
                  s.submitBtn,
                  (!canSubmit || addMutation.isPending) && { opacity: 0.4 },
                  pressed && { opacity: 0.85 },
                ]}>
                {addMutation.isPending ? (
                  <ActivityIndicator color="#0a0f1c" size="small" />
                ) : (
                  <Text style={s.submitBtnText}>ADD TO CABINET</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function Field({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  s,
  theme,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  s: Styles;
  theme: ThemeColors;
}) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textDim}
        style={s.fieldInput}
        maxLength={maxLength}
        autoCapitalize="words"
      />
    </View>
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
    maxHeight: '92%' as const,
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
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  title: { fontSize: 16, fontWeight: '800' as const, color: t.text, letterSpacing: 0.5 },
  closeBtn: { padding: 6 },

  body: { maxHeight: 700 },
  bodyContent: { gap: 12, paddingVertical: 8, paddingBottom: 24 },

  searchRow: { paddingHorizontal: 2 },
  search: {
    backgroundColor: t.card,
    color: t.text,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },

  eyebrow: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 1.4, color: t.textDim, paddingHorizontal: 4, marginTop: 4 },

  center: { padding: 24, alignItems: 'center' as const },
  emptyText: { padding: 12, color: t.textMuted, fontSize: 13, textAlign: 'center' as const },

  resultsCol: { gap: 4 },
  resultRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    backgroundColor: t.card,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  resultImg: { width: 56, height: 36, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.04)' },
  resultImgFallback: { alignItems: 'center' as const, justifyContent: 'center' as const },
  resultEmoji: { fontSize: 22 },
  resultText: { flex: 1, gap: 2 },
  resultMake: { fontSize: 10, fontWeight: '900' as const, color: t.textDim, letterSpacing: 1, textTransform: 'uppercase' as const },
  resultModel: { fontSize: 13, fontWeight: '800' as const, color: t.text },
  resultColorway: { fontSize: 11, color: '#7dd3fc', fontStyle: 'italic' as const },
  resultUsage: { fontSize: 11, fontWeight: '800' as const, color: t.textDim, fontVariant: ['tabular-nums' as const] },

  divider: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginVertical: 4 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: t.border },
  dividerText: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.4, color: t.textDim },

  formCol: { gap: 8 },
  field: { gap: 4 },
  fieldLabel: { fontSize: 11, fontWeight: '700' as const, color: t.textMuted, paddingHorizontal: 4 },
  fieldInput: {
    backgroundColor: t.card,
    color: t.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },

  selectedCard: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.accent,
    padding: 14,
    gap: 8,
  },
  selectedRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14 },
  selectedImg: { width: 72, height: 56, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)' },
  selectedText: { flex: 1, gap: 2 },
  selectedMake: { fontSize: 11, fontWeight: '900' as const, color: t.textDim, letterSpacing: 1.2, textTransform: 'uppercase' as const },
  selectedModel: { fontSize: 16, fontWeight: '900' as const, color: t.text },
  selectedColorway: { fontSize: 12, color: '#7dd3fc', fontStyle: 'italic' as const },
  changeBtn: { alignSelf: 'flex-start' as const, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: t.surfaceMuted },
  changeBtnText: { fontSize: 11, fontWeight: '700' as const, color: t.text },

  photoRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    backgroundColor: t.card,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  photoPicker: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    borderStyle: 'dashed' as const,
    overflow: 'hidden' as const,
  },
  photoPreview: { width: '100%' as const, height: '100%' as const },
  photoEmoji: { fontSize: 26 },
  photoText: { flex: 1, gap: 2 },
  photoLabel: { fontSize: 13, fontWeight: '800' as const, color: t.text },
  photoHint: { fontSize: 11, color: t.textDim },
  photoClearBtn: { alignSelf: 'flex-start' as const, marginTop: 4 },
  photoClearBtnText: { fontSize: 11, fontWeight: '700' as const, color: t.danger },

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
    backgroundColor: t.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 4,
  },
  submitBtnText: { fontSize: 13, fontWeight: '900' as const, color: '#0a0f1c', letterSpacing: 1.4 },
});
