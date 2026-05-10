import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/auth-context';
import { fullImageUrl } from '@/lib/images';

function Field({ label, value }: { label: string; value: string | number | undefined | null }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ThemedText style={styles.fieldValue}>{String(value)}</ThemedText>
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();

  if (!user) return null;

  const avatarUrl = typeof user.avatar === 'string' ? fullImageUrl(user.avatar) : undefined;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16 }]}>
        <View style={styles.header}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" transition={200} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarLetter}>{user.username.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <ThemedText type="title" style={styles.username}>@{user.username}</ThemedText>
          {typeof user.skill_title === 'string' && user.skill_title ? (
            <Text style={styles.skill}>{user.skill_title}</Text>
          ) : null}
        </View>

        <View style={styles.fields}>
          <Field label="Skill level" value={typeof user.skill_level === 'number' ? user.skill_level : undefined} />
          <Field label="Pumbility" value={typeof user.pumbility === 'number' && user.pumbility > 0 ? user.pumbility : undefined} />
          <Field label="Nationality" value={typeof user.nationality === 'string' ? user.nationality : undefined} />
          <Field label="Timezone" value={typeof user.timezone === 'string' ? user.timezone : undefined} />
          <Field label="Playing status" value={typeof user.playing_status === 'string' ? user.playing_status : undefined} />
        </View>

        <Pressable onPress={signOut} style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.6 }]}>
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, gap: 24, paddingBottom: 60 },
  header: { alignItems: 'center', gap: 8 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#1e293b' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 40, fontWeight: '700', color: '#94a3b8' },
  username: { fontSize: 24, fontWeight: '700' },
  skill: { fontSize: 14, opacity: 0.6 },
  fields: { gap: 4, backgroundColor: '#141428', borderRadius: 12, padding: 16 },
  field: { paddingVertical: 8, gap: 2 },
  fieldLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.5 },
  fieldValue: { fontSize: 15 },
  logoutBtn: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ef4444',
    alignItems: 'center',
  },
  logoutText: { color: '#ef4444', fontWeight: '600', fontSize: 15 },
});
