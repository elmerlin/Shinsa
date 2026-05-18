import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import { PumpShinsaLogo } from '@/components/pump-shinsa-logo';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ThemeColors } from '@/constants/theme';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !submitting;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await signIn(username, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding">
      <View style={styles.inner}>
        <View style={styles.brand}>
          <PumpShinsaLogo variant="horizontal" size={56} />
          <Text style={styles.subtitle}>Log in to continue</Text>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor={theme.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          value={username}
          onChangeText={setUsername}
          returnKeyType="next"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={theme.textDim}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={onSubmit}
          returnKeyType="go"
        />

        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            !canSubmit && styles.buttonDisabled,
          ]}>
          <Text style={styles.buttonText}>{submitting ? 'Logging in…' : 'Log in'}</Text>
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.footerText}>No account? </Text>
          <Link href="/(auth)/register" style={styles.link}>
            Register
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  inner: { flex: 1, justifyContent: 'center' as const, padding: 24 },
  brand: { alignItems: 'center' as const, gap: 8, marginBottom: 32 },
  subtitle: { fontSize: 14, color: t.textMuted, textAlign: 'center' as const },
  input: {
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
    color: t.text,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  button: {
    backgroundColor: t.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center' as const,
    marginTop: 8,
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: t.textOnAccent, fontSize: 16, fontWeight: '700' as const },
  footer: { flexDirection: 'row' as const, justifyContent: 'center' as const, marginTop: 24 },
  footerText: { color: t.textMuted, fontSize: 14 },
  link: { color: t.accent, fontSize: 14, fontWeight: '700' as const },
  error: {
    color: t.danger,
    backgroundColor: t.dangerBg,
    borderColor: t.dangerBorder,
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    textAlign: 'center' as const,
    fontSize: 14,
  },
});
