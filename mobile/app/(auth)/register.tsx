import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import { PumpShinsaLogo } from '@/components/pump-shinsa-logo';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ThemeColors } from '@/constants/theme';

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const trimmedUsername = username.trim();
  const usernameValid = trimmedUsername.length >= 2 && trimmedUsername.length <= 30;
  const passwordValid = password.length >= 4;
  const passwordsMatch = password === confirm && confirm.length > 0;
  const canSubmit = usernameValid && passwordValid && passwordsMatch && !submitting;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await signUp(username, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
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
          <Text style={styles.subtitle}>Create your account</Text>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <TextInput
          style={styles.input}
          placeholder="Username (2-30 characters)"
          placeholderTextColor={theme.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username-new"
          textContentType="username"
          value={username}
          onChangeText={setUsername}
          returnKeyType="next"
        />
        <TextInput
          style={styles.input}
          placeholder="Password (min 4 characters)"
          placeholderTextColor={theme.textDim}
          secureTextEntry
          autoComplete="password-new"
          textContentType="newPassword"
          value={password}
          onChangeText={setPassword}
          returnKeyType="next"
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm password"
          placeholderTextColor={theme.textDim}
          secureTextEntry
          autoComplete="password-new"
          textContentType="newPassword"
          value={confirm}
          onChangeText={setConfirm}
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
          <Text style={styles.buttonText}>{submitting ? 'Creating…' : 'Create account'}</Text>
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/(auth)/login" style={styles.link}>
            Log in
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
