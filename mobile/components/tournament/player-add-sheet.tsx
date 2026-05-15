import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { authApi, tournamentsApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type { Player, User } from '@shared/api';

interface Props {
  visible: boolean;
  tournamentId: string;
  existingPlayers: Player[];
  onClose: () => void;
}

/**
 * Add players to a tournament — server requires registered Shinsa users
 * (the player row inherits avatar / skill_title / pumbility from the
 * user). Mirrors PlayerRegistration on desktop: typeahead search, tap
 * a result to add, already-added users disabled.
 */
export function PlayerAddSheet({ visible, tournamentId, existingPlayers, onClose }: Props) {
  const s = useThemedStyles(makeStyles);
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');

  // Trim + lowercase the query for the actual fetch but use raw input
  // in the UI. Empty queries skip the request entirely so we don't spam
  // the search endpoint on every keystroke before the user has typed.
  const trimmed = query.trim();
  const searchQuery = useQuery({
    queryKey: ['user-search', trimmed],
    queryFn: () => authApi.searchUsers(trimmed),
    enabled: visible && trimmed.length > 0,
    staleTime: 30_000,
  });

  const addedUserIds = new Set(
    existingPlayers
      .map((p) => String(p.user_id || '').trim())
      .filter(Boolean),
  );

  const addMutation = useMutation({
    mutationFn: (user_id: string) => tournamentsApi.addPlayer({ tournament_id: tournamentId, user_id }),
    onSuccess: () => {
      // Refetch the players list — the orchestrator's TanStack query
      // will pick up the new row and re-render the roster.
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId, 'players'] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    },
    onError: (err) => {
      Alert.alert('Add failed', err instanceof Error ? err.message : 'Try again.');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (playerId: string) => tournamentsApi.removePlayer(playerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId, 'players'] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    },
    onError: (err) => {
      Alert.alert('Remove failed', err instanceof Error ? err.message : 'Try again.');
    },
  });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={s.handle} />
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>PLAYERS</Text>
              <Text style={s.title}>Manage roster ({existingPlayers.length})</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.7 }]}>
              <Text style={s.closeBtnText}>×</Text>
            </Pressable>
          </View>

          <View style={s.searchBar}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search Shinsa users by name…"
              placeholderTextColor={'#8a8a8a'}
              style={s.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            {/* ── Search results ── */}
            {trimmed.length > 0 ? (
              <View style={s.section}>
                <Text style={s.sectionLabel}>SEARCH RESULTS</Text>
                {searchQuery.isLoading ? (
                  <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                    <ActivityIndicator color={theme.spinner} />
                  </View>
                ) : (searchQuery.data ?? []).length === 0 ? (
                  <Text style={s.empty}>No users match “{trimmed}”.</Text>
                ) : (
                  (searchQuery.data ?? []).map((u: User) => {
                    const already = addedUserIds.has(String(u.id));
                    const isAdding = addMutation.isPending && addMutation.variables === u.id;
                    const av = typeof u.avatar === 'string' && u.avatar ? fullImageUrl(u.avatar) : undefined;
                    return (
                      <View key={u.id} style={s.userRow}>
                        {av ? (
                          <Image source={{ uri: av }} style={s.userAvatar} contentFit="cover" />
                        ) : (
                          <View style={[s.userAvatar, s.userAvatarFallback]}>
                            <Text style={s.userAvatarLetter}>{String(u.username || '?').charAt(0).toUpperCase()}</Text>
                          </View>
                        )}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.userName} numberOfLines={1}>@{u.username}</Text>
                          {(u.skill_title || u.nationality) ? (
                            <Text style={s.userMeta} numberOfLines={1}>
                              {[u.skill_title, u.nationality].filter(Boolean).join(' · ')}
                            </Text>
                          ) : null}
                        </View>
                        <Pressable
                          onPress={() => !already && addMutation.mutate(u.id)}
                          disabled={already || isAdding}
                          style={({ pressed }) => [
                            s.addBtn,
                            already && s.addBtnDisabled,
                            pressed && !already && { opacity: 0.85 },
                          ]}>
                          {isAdding ? (
                            <ActivityIndicator size="small" color={theme.textOnAccent} />
                          ) : (
                            <Text style={[s.addBtnText, already && s.addBtnTextDisabled]}>
                              {already ? 'Added' : '+ Add'}
                            </Text>
                          )}
                        </Pressable>
                      </View>
                    );
                  })
                )}
              </View>
            ) : null}

            {/* ── Current roster ── */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>CURRENT ROSTER ({existingPlayers.length})</Text>
              {existingPlayers.length === 0 ? (
                <Text style={s.empty}>No players yet. Search above to add some.</Text>
              ) : (
                existingPlayers.map((p) => {
                  const av = typeof p.avatar === 'string' && p.avatar ? fullImageUrl(p.avatar) : undefined;
                  const isRemoving = removeMutation.isPending && removeMutation.variables === p.id;
                  return (
                    <View key={p.id} style={s.userRow}>
                      {av ? (
                        <Image source={{ uri: av }} style={s.userAvatar} contentFit="cover" />
                      ) : (
                        <View style={[s.userAvatar, s.userAvatarFallback]}>
                          <Text style={s.userAvatarLetter}>{String(p.name || '?').charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.userName} numberOfLines={1}>{p.name}</Text>
                        {(p.skill_title || typeof p.seed_rank === 'number') ? (
                          <Text style={s.userMeta} numberOfLines={1}>
                            {p.skill_title}{typeof p.seed_rank === 'number' && p.seed_rank > 0 ? ` · seed #${p.seed_rank}` : ''}
                          </Text>
                        ) : null}
                      </View>
                      <Pressable
                        onPress={() => {
                          Alert.alert(
                            'Remove player?',
                            `Remove ${p.name} from this tournament?`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Remove', style: 'destructive', onPress: () => removeMutation.mutate(p.id) },
                            ],
                          );
                        }}
                        disabled={isRemoving}
                        style={({ pressed }) => [s.removeBtn, pressed && { opacity: 0.7 }]}>
                        {isRemoving ? (
                          <ActivityIndicator size="small" color={theme.danger} />
                        ) : (
                          <Text style={s.removeBtnText}>Remove</Text>
                        )}
                      </Pressable>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const makeStyles = (t: ThemeColors) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' as const, alignItems: 'center' as const },
  sheet: {
    width: '100%' as const,
    maxWidth: 640,
    maxHeight: '92%' as const,
    backgroundColor: t.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden' as const,
    flex: Platform.OS === 'web' ? undefined : 1,
  },
  handle: { alignSelf: 'center' as const, width: 44, height: 4, borderRadius: 2, backgroundColor: t.border, marginTop: 8, marginBottom: 4 },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
    gap: 12,
  },
  eyebrow: { fontSize: 10, letterSpacing: 1.6, color: t.accent, fontWeight: '900' as const },
  title: { fontSize: 18, fontWeight: '900' as const, color: t.text, marginTop: 2 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: t.border, backgroundColor: t.surfaceMuted,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  closeBtnText: { fontSize: 20, color: t.textMuted, fontWeight: '800' as const, marginTop: -3 },

  searchBar: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  searchInput: {
    backgroundColor: t.surfaceMuted,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    color: t.text,
    fontSize: 13,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },

  body: { padding: 14, gap: 14, paddingBottom: 40 },
  section: { gap: 6 },
  sectionLabel: { fontSize: 9, letterSpacing: 1.4, color: t.textDim, fontWeight: '900' as const },
  empty: { fontSize: 12, color: t.textDim, fontStyle: 'italic' as const, textAlign: 'center' as const, paddingVertical: 12 },

  userRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
  },
  userAvatar: { width: 36, height: 36, borderRadius: 12, backgroundColor: t.bg },
  userAvatarFallback: {
    backgroundColor: t.accentTint,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  userAvatarLetter: { fontSize: 14, fontWeight: '900' as const, color: t.accent },
  userName: { fontSize: 13, fontWeight: '900' as const, color: t.text },
  userMeta: { fontSize: 10, color: t.textDim },

  addBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: t.accent,
    minWidth: 70,
    alignItems: 'center' as const,
  },
  addBtnDisabled: { backgroundColor: t.surfaceMuted, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border },
  addBtnText: { color: t.textOnAccent, fontSize: 11, fontWeight: '900' as const, letterSpacing: 0.5 },
  addBtnTextDisabled: { color: t.textDim },

  removeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(244, 63, 94, 0.45)',
    backgroundColor: 'rgba(244, 63, 94, 0.10)',
    minWidth: 70,
    alignItems: 'center' as const,
  },
  removeBtnText: { color: t.danger, fontSize: 11, fontWeight: '900' as const, letterSpacing: 0.5 },
});
