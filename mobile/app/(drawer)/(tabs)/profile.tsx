import { Image } from 'expo-image';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HamburgerButton } from '@/components/hamburger-button';
import { useAuth } from '@/contexts/auth-context';
import { useTheme, type ThemePreference } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';

const PREFERENCE_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Auto' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function Field({ label, value, s }: { label: string; value: string | number | undefined | null; s: Styles }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Text style={s.fieldValue}>{String(value)}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { preference, setPreference } = useTheme();
  const s = useThemedStyles(makeStyles);

  if (!user) return null;

  const avatarUrl = typeof user.avatar === 'string' ? fullImageUrl(user.avatar) : undefined;

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={[s.scroll, { paddingTop: insets.top + 16 }]}>
        <View style={s.topBar}>
          <HamburgerButton />
        </View>
        <View style={s.header}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={s.avatar} contentFit="cover" transition={200} />
          ) : (
            <View style={[s.avatar, s.avatarFallback]}>
              <Text style={s.avatarLetter}>{user.username.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={s.username}>@{user.username}</Text>
          {typeof user.skill_title === 'string' && user.skill_title ? (
            <Text style={s.skill}>{user.skill_title}</Text>
          ) : null}
        </View>

        <View style={s.fields}>
          <Field s={s} label="Skill level" value={typeof user.skill_level === 'number' ? user.skill_level : undefined} />
          <Field s={s} label="Pumbility" value={typeof user.pumbility === 'number' && user.pumbility > 0 ? user.pumbility : undefined} />
          <Field s={s} label="Nationality" value={typeof user.nationality === 'string' ? user.nationality : undefined} />
          <Field s={s} label="Timezone" value={typeof user.timezone === 'string' ? user.timezone : undefined} />
          <Field s={s} label="Playing status" value={typeof user.playing_status === 'string' ? user.playing_status : undefined} />
        </View>

        <View style={s.themeSection}>
          <Text style={s.sectionLabel}>Theme</Text>
          <View style={s.segments}>
            {PREFERENCE_OPTIONS.map((opt) => {
              const active = preference === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setPreference(opt.value)}
                  style={[s.segment, active && s.segmentActive]}>
                  <Text style={[s.segmentText, active && s.segmentTextActive]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable onPress={signOut} style={({ pressed }) => [s.logoutBtn, pressed && { opacity: 0.6 }]}>
          <Text style={s.logoutText}>Log out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  scroll: { padding: 20, gap: 16, paddingBottom: 60 },
  topBar: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 8 },
  header: { alignItems: 'center' as const, gap: 8 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: t.surfaceMuted },
  avatarFallback: { alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarLetter: { fontSize: 40, fontWeight: '800' as const, color: t.textMuted },
  username: { fontSize: 24, fontWeight: '800' as const, color: t.text },
  skill: { fontSize: 14, color: t.textMuted },
  fields: { gap: 4, backgroundColor: t.card, borderRadius: 12, borderWidth: 1, borderColor: t.border, padding: 16 },
  field: { paddingVertical: 8, gap: 2 },
  fieldLabel: { fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 1, color: t.textDim },
  fieldValue: { fontSize: 15, color: t.text },
  themeSection: { gap: 8 },
  sectionLabel: { fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 1, color: t.textDim, paddingHorizontal: 4 },
  segments: { flexDirection: 'row' as const, backgroundColor: t.card, borderRadius: 10, borderWidth: 1, borderColor: t.border, padding: 3 },
  segment: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' as const },
  segmentActive: { backgroundColor: t.accent },
  segmentText: { fontSize: 13, fontWeight: '700' as const, color: t.textMuted },
  segmentTextActive: { color: t.textOnAccent },
  logoutBtn: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.danger,
    alignItems: 'center' as const,
  },
  logoutText: { color: t.danger, fontWeight: '700' as const, fontSize: 15 },
});
