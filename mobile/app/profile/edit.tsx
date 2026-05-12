import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { DefaultAvatar } from '@/components/default-avatar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { authApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { UpdateMePayload } from '@shared/api';
import type { ThemeColors } from '@/constants/theme';

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

/** Form state mirrors the editable subset of `User`. Everything is a string
 *  in-flight so we can validate + show partial input; we coerce to the
 *  proper types only at submit time.
 *  NOTE: `skill_title` + `skill_level` are intentionally omitted — those
 *  reflect PIUGame title progression and are set by the sync pipeline, not
 *  by the user. */
interface FormState {
  avatar: string;
  description: string;
  gender: string;
  nationality: string;
  date_of_birth: string;
  show_age: boolean;
  age: string;
  height_cm: string;
  weight_kg: string;
  location_country: string;
  location_country_code: string;
  location_city: string;
}

const EMPTY_FORM: FormState = {
  avatar: '',
  description: '',
  gender: '',
  nationality: '',
  date_of_birth: '',
  show_age: false,
  age: '',
  height_cm: '',
  weight_kg: '',
  location_country: '',
  location_country_code: '',
  location_city: '',
};

const GENDER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Prefer not to say' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

/**
 * Auto-format a date-of-birth string as the user types. Strips non-digits,
 * caps to 8 chars (YYYYMMDD), then inserts hyphens at the right positions.
 * This is a pragmatic substitute for a native date picker — keeps the form
 * dep-free while still preventing most "1995/04/23" or "23-04-1995" mistakes.
 */
function formatDobInput(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

/** Returns a user-friendly error if `value` is a non-empty, malformed DOB.
 *  Empty values are allowed (user can leave it blank). */
function validateDob(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return 'Use YYYY-MM-DD format.';
  const [y, m, d] = trimmed.split('-').map((n) => parseInt(n, 10));
  // Date constructor accepts impossible dates (e.g. 2024-02-30 → Mar 1), so
  // we re-stringify to confirm the round-trip matches what the user typed.
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())
    || dt.getUTCFullYear() !== y
    || dt.getUTCMonth() !== m - 1
    || dt.getUTCDate() !== d) {
    return 'Not a real date.';
  }
  const currentYear = new Date().getUTCFullYear();
  if (y < 1900 || y > currentYear) return `Year must be between 1900 and ${currentYear}.`;
  return '';
}

function userToForm(user: Record<string, unknown> | null): FormState {
  if (!user) return EMPTY_FORM;
  return {
    avatar: typeof user.avatar === 'string' ? user.avatar : '',
    description: typeof user.description === 'string' ? user.description : '',
    gender: typeof user.gender === 'string' ? user.gender : '',
    nationality: typeof user.nationality === 'string' ? user.nationality : '',
    date_of_birth: typeof user.date_of_birth === 'string' ? user.date_of_birth : '',
    show_age: !!user.show_age,
    age: user.age != null ? String(user.age) : '',
    height_cm: user.height_cm != null ? String(user.height_cm) : '',
    weight_kg: user.weight_kg != null ? String(user.weight_kg) : '',
    location_country: typeof user.location_country === 'string' ? user.location_country : '',
    location_country_code: typeof user.location_country_code === 'string' ? user.location_country_code : '',
    location_city: typeof user.location_city === 'string' ? user.location_city : '',
  };
}

/**
 * Returns a payload containing only the fields whose value differs from the
 * original baseline. Mirrors the web's `avatarDirty` pattern but generalized
 * across every field. Empty strings for previously-empty fields are skipped
 * to avoid sending `""` over the wire as a "clear" operation when the user
 * didn't touch anything.
 */
function buildDirtyPayload(form: FormState, baseline: FormState): UpdateMePayload {
  const payload: UpdateMePayload = {};
  if (form.avatar !== baseline.avatar) payload.avatar = form.avatar;
  if (form.description !== baseline.description) payload.description = form.description;
  if (form.gender !== baseline.gender) payload.gender = form.gender;
  if (form.nationality !== baseline.nationality) {
    payload.nationality = form.nationality.trim().toUpperCase();
  }
  if (form.date_of_birth !== baseline.date_of_birth) {
    payload.date_of_birth = form.date_of_birth.trim();
  }
  if (form.show_age !== baseline.show_age) payload.show_age = form.show_age;
  if (form.age !== baseline.age) {
    const n = parseInt(form.age, 10);
    if (Number.isFinite(n)) payload.age = n;
  }
  if (form.height_cm !== baseline.height_cm) {
    const n = parseFloat(form.height_cm);
    if (Number.isFinite(n)) payload.height_cm = n;
  }
  if (form.weight_kg !== baseline.weight_kg) {
    const n = parseFloat(form.weight_kg);
    if (Number.isFinite(n)) payload.weight_kg = n;
  }
  if (form.location_country !== baseline.location_country) payload.location_country = form.location_country;
  if (form.location_country_code !== baseline.location_country_code) {
    payload.location_country_code = form.location_country_code.trim().toUpperCase();
  }
  if (form.location_city !== baseline.location_city) payload.location_city = form.location_city;
  return payload;
}

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();

  const baseline = useMemo(() => userToForm(user as Record<string, unknown> | null), [user]);
  const [form, setForm] = useState<FormState>(baseline);
  // Re-sync if the auth context's user value changes from underneath us.
  useEffect(() => { setForm(baseline); }, [baseline]);

  const dirtyPayload = useMemo(() => buildDirtyPayload(form, baseline), [form, baseline]);
  const isDirty = Object.keys(dirtyPayload).length > 0;
  // DOB validation is non-blocking until something's actually been entered.
  // We only surface the error message + block save when the value is
  // non-empty AND fails the format/range check.
  const dobError = useMemo(() => validateDob(form.date_of_birth), [form.date_of_birth]);
  const canSave = isDirty && !dobError;

  const saveMutation = useMutation({
    mutationFn: () => authApi.updateMe(dirtyPayload),
    onSuccess: async () => {
      await refreshUser();
      // Invalidate any cached profile data so the page reflects the edits.
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['user-achievements', user?.id] });
      router.back();
    },
  });

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo permission needed', 'Allow photo access in Settings to pick an avatar.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert('Avatar', 'Could not read the selected image.');
      return;
    }
    const mime = asset.mimeType || 'image/jpeg';
    update('avatar', `data:${mime};base64,${asset.base64}`);
  };

  const clearAvatar = () => {
    update('avatar', '');
  };

  if (!user) {
    return null;
  }

  // Resolve the avatar preview source: data: URLs render as-is, preset paths
  // / server paths go through fullImageUrl, empty falls back to the default.
  const avatarSource = form.avatar.startsWith('data:')
    ? form.avatar
    : form.avatar
      ? fullImageUrl(form.avatar)
      : '';

  return (
    <View style={s.container}>
      <Stack.Screen
        options={{
          title: 'Edit profile',
          headerRight: () => (
            <Pressable
              onPress={() => saveMutation.mutate()}
              disabled={!canSave || saveMutation.isPending}
              hitSlop={8}
              style={({ pressed }) => [
                s.saveBtn,
                (!canSave || saveMutation.isPending) && { opacity: 0.4 },
                pressed && { opacity: 0.7 },
              ]}>
              {saveMutation.isPending ? (
                <ActivityIndicator color={theme.accent} size="small" />
              ) : (
                <Text style={s.saveBtnText}>SAVE</Text>
              )}
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled">

          {/* Avatar — tap to pick a new photo; long-press / clear button removes it */}
          <View style={s.avatarBlock}>
            <Pressable onPress={pickAvatar} style={({ pressed }) => [s.avatarTouch, pressed && { opacity: 0.8 }]}>
              {avatarSource ? (
                <Image source={{ uri: avatarSource }} style={s.avatarImg} contentFit="cover" />
              ) : (
                <DefaultAvatar size={96} />
              )}
              <View style={s.avatarBadge}>
                <IconSymbol name="pencil" size={14} color="#fff" />
              </View>
            </Pressable>
            <Text style={s.avatarHint}>Tap to choose a new photo</Text>
            {form.avatar ? (
              <Pressable onPress={clearAvatar} hitSlop={6}>
                <Text style={s.clearAvatarText}>Remove avatar</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Username (read-only) */}
          <Section title="Identity" s={s}>
            <Field label="Username" s={s}>
              <TextInput
                style={[s.input, s.inputDisabled]}
                value={user.username}
                editable={false}
              />
              <Text style={s.fieldHint}>Username cannot be changed.</Text>
            </Field>

            <Field label="Bio" s={s}>
              <TextInput
                style={[s.input, s.inputMulti]}
                value={form.description}
                onChangeText={(v) => update('description', v)}
                placeholder="Tell other players what you're into…"
                placeholderTextColor={theme.textDim}
                multiline
                maxLength={400}
              />
              <Text style={s.fieldHint}>{form.description.length}/400</Text>
            </Field>
          </Section>

          <Section title="Personal" s={s}>
            <Field label="Gender" s={s}>
              <View style={s.segments}>
                {GENDER_OPTIONS.map((opt) => {
                  const active = form.gender === opt.value;
                  return (
                    <Pressable
                      key={opt.value || 'none'}
                      onPress={() => update('gender', opt.value)}
                      style={({ pressed }) => [s.segment, active && s.segmentActive, pressed && { opacity: 0.7 }]}>
                      <Text style={[s.segmentText, active && s.segmentTextActive]} numberOfLines={1}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>

            <Field label="Nationality (ISO code)" s={s}>
              <TextInput
                style={s.input}
                value={form.nationality}
                onChangeText={(v) => update('nationality', v.toUpperCase().slice(0, 2))}
                placeholder="JP, US, KR…"
                placeholderTextColor={theme.textDim}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={2}
              />
              <Text style={s.fieldHint}>Two-letter ISO 3166-1 code drives your flag emoji.</Text>
            </Field>

            <Field label="Date of birth" s={s}>
              <TextInput
                style={[s.input, dobError ? s.inputError : null]}
                value={form.date_of_birth}
                onChangeText={(v) => update('date_of_birth', formatDobInput(v))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.textDim}
                keyboardType="number-pad"
                autoCorrect={false}
                maxLength={10}
              />
              {dobError ? (
                <Text style={s.errorText}>{dobError}</Text>
              ) : (
                <Text style={s.fieldHint}>Hyphens are added automatically as you type.</Text>
              )}
            </Field>

            <View style={s.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.toggleLabel}>Show age on profile</Text>
                <Text style={s.fieldHint}>When off, your DOB stays private.</Text>
              </View>
              <Switch
                value={form.show_age}
                onValueChange={(v) => update('show_age', v)}
                trackColor={{ false: theme.surfaceMuted, true: theme.accent }}
                thumbColor="#fff"
              />
            </View>
          </Section>

          <Section title="Location" s={s}>
            <Field label="Country" s={s}>
              <TextInput
                style={s.input}
                value={form.location_country}
                onChangeText={(v) => update('location_country', v)}
                placeholder="Japan"
                placeholderTextColor={theme.textDim}
                maxLength={60}
              />
            </Field>
            <Field label="Country code (ISO)" s={s}>
              <TextInput
                style={s.input}
                value={form.location_country_code}
                onChangeText={(v) => update('location_country_code', v.toUpperCase().slice(0, 2))}
                placeholder="JP"
                placeholderTextColor={theme.textDim}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={2}
              />
            </Field>
            <Field label="City" s={s}>
              <TextInput
                style={s.input}
                value={form.location_city}
                onChangeText={(v) => update('location_city', v)}
                placeholder="Tokyo"
                placeholderTextColor={theme.textDim}
                maxLength={80}
              />
            </Field>
          </Section>

          <Section title="Health (optional)" s={s}>
            <Text style={s.sectionHint}>
              We use weight to personalize kcal estimates after each session. Numbers stay private to you.
            </Text>
            <Field label="Age (years)" s={s}>
              <TextInput
                style={s.input}
                value={form.age}
                onChangeText={(v) => update('age', v.replace(/[^0-9]/g, ''))}
                placeholder="—"
                placeholderTextColor={theme.textDim}
                keyboardType="number-pad"
                maxLength={3}
              />
            </Field>
            <Field label="Height (cm)" s={s}>
              <TextInput
                style={s.input}
                value={form.height_cm}
                onChangeText={(v) => update('height_cm', v.replace(/[^0-9.]/g, ''))}
                placeholder="—"
                placeholderTextColor={theme.textDim}
                keyboardType="decimal-pad"
                maxLength={5}
              />
            </Field>
            <Field label="Weight (kg)" s={s}>
              <TextInput
                style={s.input}
                value={form.weight_kg}
                onChangeText={(v) => update('weight_kg', v.replace(/[^0-9.]/g, ''))}
                placeholder="—"
                placeholderTextColor={theme.textDim}
                keyboardType="decimal-pad"
                maxLength={5}
              />
            </Field>
          </Section>

          {saveMutation.isError ? (
            <Text style={s.errorText}>
              {saveMutation.error instanceof Error ? saveMutation.error.message : 'Failed to save'}
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Section({ title, children, s }: { title: string; children: React.ReactNode; s: Styles }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Field({ label, children, s }: { label: string; children: React.ReactNode; s: Styles }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  scroll: { padding: 16, gap: 18 },

  // Save button in the navigation header.
  saveBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  saveBtnText: { color: t.accent, fontSize: 13, fontWeight: '900' as const, letterSpacing: 1 },

  // Avatar block at the top.
  avatarBlock: { alignItems: 'center' as const, gap: 8 },
  avatarTouch: { position: 'relative' as const, width: 96, height: 96 },
  avatarImg: { width: 96, height: 96, borderRadius: 48, backgroundColor: t.surfaceMuted },
  avatarBadge: {
    position: 'absolute' as const,
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: t.accent,
    borderWidth: 2,
    borderColor: t.bg,
  },
  avatarHint: { fontSize: 12, color: t.textMuted },
  clearAvatarText: { fontSize: 12, color: t.danger, fontWeight: '700' as const },

  // Section container.
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900' as const,
    letterSpacing: 1.6,
    color: t.accent,
    textTransform: 'uppercase' as const,
  },
  sectionHint: { fontSize: 12, color: t.textDim, lineHeight: 17, marginTop: -4, marginBottom: 2 },

  // Field row.
  field: { gap: 6 },
  fieldLabel: { fontSize: 12, color: t.textMuted, fontWeight: '700' as const },
  fieldHint: { fontSize: 11, color: t.textDim, paddingHorizontal: 2 },
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
  inputMulti: { minHeight: 80, textAlignVertical: 'top' as const },
  inputDisabled: { opacity: 0.6 },
  inputError: { borderColor: t.danger },

  // Segmented control (gender).
  segments: {
    flexDirection: 'row' as const,
    backgroundColor: t.card,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 3,
    gap: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center' as const,
  },
  segmentActive: { backgroundColor: t.accent },
  segmentText: { fontSize: 11, fontWeight: '700' as const, color: t.textMuted, letterSpacing: 0.3 },
  segmentTextActive: { color: t.textOnAccent },

  // Inline toggle row (show-age).
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
  toggleLabel: { fontSize: 14, fontWeight: '700' as const, color: t.text },

  errorText: { fontSize: 12, color: t.danger, paddingHorizontal: 4 },
});
