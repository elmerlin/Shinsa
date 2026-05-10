import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';

export default function RegisterScreen() {
  const { signUp } = useAuth();
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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.inner}>
        <Text style={styles.title}>SHINSA</Text>
        <Text style={styles.subtitle}>Create your account</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <TextInput
          style={styles.input}
          placeholder="Username (2-30 characters)"
          placeholderTextColor="#6b7280"
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
          placeholderTextColor="#6b7280"
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
          placeholderTextColor="#6b7280"
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a1a' },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 36, fontWeight: '800', color: '#fff', textAlign: 'center', letterSpacing: 8 },
  subtitle: { fontSize: 14, color: '#9ca3af', textAlign: 'center', marginTop: 8, marginBottom: 32 },
  input: {
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#111729',
    color: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#ff3366',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonPressed: { opacity: 0.8 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText: { color: '#9ca3af', fontSize: 14 },
  link: { color: '#ff3366', fontSize: 14, fontWeight: '600' },
  error: {
    color: '#fca5a5',
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderColor: 'rgba(239,68,68,0.3)',
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 14,
  },
});
