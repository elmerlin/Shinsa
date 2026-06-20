import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { ChartJacket } from '@/components/chart-jacket';
import { useTheme } from '@/contexts/theme-context';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { socialApi, songsApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type { Song, SongOfWeekItem } from '@shared/api';

const MODE_OPTIONS = [
  { value: 'all' as const, label: 'All' },
  { value: 'Single' as const, label: 'Single' },
  { value: 'Double' as const, label: 'Double' },
  { value: 'CoOp' as const, label: 'Co-Op' },
];
type ModeFilter = (typeof MODE_OPTIONS)[number]['value'];

const MAX_GROUPS = 80;

function modeShort(mode?: string): string {
  if (mode === 'Single') return 'S';
  if (mode === 'Double') return 'D';
  if (mode === 'CoOp') return 'C';
  return '';
}

interface ChartChoice {
  id: number;
  title: string;
  artist: string;
  mode: string;
  level: number;
  jacket_url: string;
}

interface Group {
  key: string;
  title: string;
  artist: string;
  jacket_url: string;
  charts: ChartChoice[];
}

function groupCharts(songs: Song[], q: string, modeFilter: ModeFilter): Group[] {
  if (!songs.length) return [];
  const needle = q.trim().toLowerCase();
  const map = new Map<string, Group>();
  for (const row of songs) {
    if (!row || !row.title || !row.mode || !row.level) continue;
    if (modeFilter !== 'all' && row.mode !== modeFilter) continue;
    if (needle) {
      const hay = `${row.title} ${row.artist || ''}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    const key = `${row.title}|${row.artist || ''}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        title: row.title,
        artist: row.artist || '',
        jacket_url: (row.jacket_url as string) || '',
        charts: [],
      });
    }
    const g = map.get(key)!;
    if (g.charts.some((c) => c.mode === row.mode && c.level === row.level)) continue;
    g.charts.push({
      id: row.id as number,
      title: row.title,
      artist: row.artist || '',
      mode: row.mode,
      level: row.level,
      jacket_url: (row.jacket_url as string) || '',
    });
  }
  const groups = Array.from(map.values());
  const modeOrder: Record<string, number> = { Single: 0, Double: 1, CoOp: 2 };
  for (const g of groups) {
    g.charts.sort((a, b) => {
      const am = modeOrder[a.mode] ?? 99;
      const bm = modeOrder[b.mode] ?? 99;
      if (am !== bm) return am - bm;
      return (a.level || 0) - (b.level || 0);
    });
  }
  groups.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  return groups.slice(0, MAX_GROUPS);
}

interface Props {
  visible: boolean;
  existingPick: SongOfWeekItem | null;
  onClose: () => void;
  onSaved?: (pick: SongOfWeekItem) => void;
}

export function SongOfWeekComposer({ visible, existingPick, onClose, onSaved }: Props) {
  const s = useThemedStyles(makeStyles);
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const keyboardGap = Platform.OS === 'ios' ? keyboardHeight : 0;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [selected, setSelected] = useState<ChartChoice | null>(null);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState('');

  // Reset / hydrate the form whenever the modal opens. Avoids stale state
  // bleeding between editing an existing pick and creating a new one.
  useEffect(() => {
    if (!visible) return;
    setError('');
    setSearch('');
    setModeFilter('all');
    if (existingPick) {
      setSelected({
        id: (existingPick.chart_id as number) || 0,
        title: existingPick.song_title_snapshot || '',
        artist: existingPick.artist_snapshot || '',
        mode: existingPick.mode || '',
        level: existingPick.level || 0,
        jacket_url: existingPick.jacket_url_snapshot || '',
      });
      setCaption(existingPick.caption || '');
    } else {
      setSelected(null);
      setCaption('');
    }
  }, [visible, existingPick]);

  const songsQuery = useQuery({
    queryKey: ['songs', 'all-for-sow-composer'],
    queryFn: () => songsApi.list({ limit: 5000 }),
    enabled: visible,
    staleTime: 5 * 60 * 1000,
  });
  const songs = songsQuery.data ?? [];

  const grouped = useMemo(() => groupCharts(songs as Song[], search, modeFilter), [songs, search, modeFilter]);

  const saveMutation = useMutation({
    mutationFn: () => socialApi.setSongOfWeekMe({
      chart_id: selected!.id,
      caption: caption.trim(),
    }),
    onSuccess: (saved) => {
      // Tell the dashboard strip + any open detail screen to refetch.
      queryClient.invalidateQueries({ queryKey: ['song-of-week'] });
      if (onSaved) onSaved(saved);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to save');
    },
  });

  const handleSave = () => {
    if (!selected) {
      setError('Pick a chart first.');
      return;
    }
    setError('');
    saveMutation.mutate();
  };

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
      <View style={[s.backdrop, { paddingBottom: keyboardGap }]}>
        <View style={s.sheet}>
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>SONG OF THE WEEK</Text>
              <Text style={s.title}>{existingPick ? 'Edit your pick' : 'Pick this week’s song'}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={s.close}>×</Text>
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body}>
            {selected ? (
              <View style={s.selectedCard}>
                <ChartJacket
                  jacketUrl={selected.jacket_url ? fullImageUrl(selected.jacket_url) : undefined}
                  mode={selected.mode}
                  level={selected.level}
                  size="wide"
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.selectedEyebrow}>SELECTED</Text>
                  <Text style={s.selectedTitle} numberOfLines={1}>{selected.title}</Text>
                  {selected.artist ? (
                    <Text style={s.selectedArtist} numberOfLines={1}>{selected.artist}</Text>
                  ) : null}
                  <Text style={s.selectedMeta}>
                    {modeShort(selected.mode)}{selected.level || ''}
                  </Text>
                </View>
                <Pressable onPress={() => setSelected(null)} hitSlop={6}>
                  <Text style={s.changeText}>Change</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={{ gap: 6 }}>
              <Text style={s.fieldLabel}>Caption (optional)</Text>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                multiline
                maxLength={280}
                placeholder="Why this one? (max 280 chars)"
                placeholderTextColor={'#8a8a8a'}
                style={s.captionInput}
              />
            </View>

            <View style={{ gap: 6 }}>
              <View style={s.searchRow}>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search by title or artist"
                  placeholderTextColor={'#8a8a8a'}
                  style={s.searchInput}
                />
              </View>
              <View style={s.modeRow}>
                {MODE_OPTIONS.map((opt) => {
                  const active = modeFilter === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setModeFilter(opt.value)}
                      style={({ pressed }) => [
                        s.modeBtn,
                        active && s.modeBtnActive,
                        pressed && { opacity: 0.7 },
                      ]}>
                      <Text style={[s.modeBtnText, active && s.modeBtnTextActive]}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {songsQuery.isLoading ? (
                <View style={{ padding: 16, alignItems: 'center' }}>
                  <ActivityIndicator color={theme.spinner} />
                </View>
              ) : grouped.length === 0 ? (
                <Text style={s.emptyText}>
                  {search.trim() ? 'No charts match your search.' : 'No charts available.'}
                </Text>
              ) : (
                <View style={s.results}>
                  {grouped.map((group) => {
                    const jacketUrl = group.jacket_url ? fullImageUrl(group.jacket_url) : undefined;
                    return (
                      <View key={group.key} style={s.groupRow}>
                        <ChartJacket
                          jacketUrl={jacketUrl}
                          mode={group.charts[0]?.mode}
                          level={group.charts[0]?.level}
                          size="md"
                        />
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={s.groupTitle} numberOfLines={1}>{group.title}</Text>
                          {group.artist ? (
                            <Text style={s.groupArtist} numberOfLines={1}>{group.artist}</Text>
                          ) : null}
                          <View style={s.chartChips}>
                            {group.charts.map((c) => {
                              const isSel = selected?.id === c.id;
                              return (
                                <Pressable
                                  key={c.id}
                                  onPress={() => setSelected(c)}
                                  style={({ pressed }) => [
                                    s.chartChip,
                                    chipModeStyle(c.mode, isSel, theme),
                                    pressed && { opacity: 0.7 },
                                  ]}>
                                  <Text style={s.chartChipText}>
                                    {modeShort(c.mode)}{c.level}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                  {grouped.length >= MAX_GROUPS ? (
                    <Text style={s.truncatedHint}>
                      Showing first {MAX_GROUPS} songs — refine your search to see more.
                    </Text>
                  ) : null}
                </View>
              )}
            </View>
          </ScrollView>

          <View style={[s.footer, { paddingBottom: keyboardHeight > 0 ? 8 : insets.bottom + 8 }]}>
            {error ? <Text style={s.errorText}>{error}</Text> : null}
            <Pressable onPress={onClose} hitSlop={6} style={({ pressed }) => [{ paddingHorizontal: 12 }, pressed && { opacity: 0.7 }]}>
              <Text style={s.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={!selected || saveMutation.isPending}
              style={({ pressed }) => [
                s.saveBtn,
                (!selected || saveMutation.isPending) && { opacity: 0.4 },
                pressed && { opacity: 0.85 },
              ]}>
              {saveMutation.isPending ? (
                <ActivityIndicator size="small" color={theme.textOnAccent} />
              ) : (
                <Text style={s.saveBtnText}>{existingPick ? 'Update pick' : 'Save pick'}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function chipModeStyle(mode: string, selected: boolean, theme: ThemeColors): { backgroundColor: string; borderColor: string } {
  if (selected) return { backgroundColor: theme.accent, borderColor: theme.accent };
  if (mode === 'Single') return { backgroundColor: 'rgba(244, 63, 94, 0.10)', borderColor: 'rgba(244, 63, 94, 0.5)' };
  if (mode === 'Double') return { backgroundColor: 'rgba(16, 185, 129, 0.10)', borderColor: 'rgba(16, 185, 129, 0.5)' };
  if (mode === 'CoOp') return { backgroundColor: 'rgba(14, 165, 233, 0.10)', borderColor: 'rgba(14, 165, 233, 0.5)' };
  return { backgroundColor: theme.surfaceMuted, borderColor: theme.border };
}

const makeStyles = (t: ThemeColors) => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center' as const,
    justifyContent: 'flex-end' as const,
  },
  sheet: {
    width: '100%' as const,
    maxWidth: 640,
    maxHeight: '92%' as const,
    backgroundColor: t.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden' as const,
    flexDirection: 'column' as const,
    flex: Platform.OS === 'web' ? undefined : 1,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
    gap: 12,
  },
  eyebrow: { fontSize: 10, letterSpacing: 1.4, fontWeight: '900' as const, color: t.accent },
  title: { fontSize: 16, fontWeight: '900' as const, color: t.text, marginTop: 2 },
  close: { fontSize: 24, color: t.textDim, paddingHorizontal: 4, lineHeight: 28 },
  body: { padding: 14, gap: 14 },

  selectedCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.accent,
    backgroundColor: t.surfaceMuted,
  },
  selectedEyebrow: { fontSize: 9, letterSpacing: 1.4, color: t.accent, fontWeight: '900' as const },
  selectedTitle: { fontSize: 13, fontWeight: '900' as const, color: t.text },
  selectedArtist: { fontSize: 11, color: t.textMuted },
  selectedMeta: { fontSize: 11, color: t.textDim, marginTop: 2 },
  changeText: { fontSize: 11, color: t.textDim, fontWeight: '700' as const },

  fieldLabel: { fontSize: 10, letterSpacing: 1.2, color: t.textDim, fontWeight: '900' as const },
  captionInput: {
    backgroundColor: t.surfaceMuted,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    color: t.text,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 56,
    textAlignVertical: 'top' as const,
  },

  searchRow: { flexDirection: 'row' as const, gap: 6 },
  searchInput: {
    flex: 1,
    backgroundColor: t.surfaceMuted,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    color: t.text,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  modeRow: { flexDirection: 'row' as const, gap: 4 },
  modeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
  },
  modeBtnActive: { backgroundColor: t.accent, borderColor: t.accent },
  modeBtnText: { fontSize: 11, fontWeight: '800' as const, color: t.textMuted, letterSpacing: 0.5 },
  modeBtnTextActive: { color: t.textOnAccent },

  results: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    overflow: 'hidden' as const,
  },
  groupRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    padding: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  groupTitle: { fontSize: 12, fontWeight: '800' as const, color: t.text },
  groupArtist: { fontSize: 10, color: t.textMuted },
  chartChips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 4, marginTop: 2 },
  chartChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  chartChipText: { fontSize: 10, fontWeight: '900' as const, color: t.text, letterSpacing: 0.4 },

  emptyText: { fontSize: 11, color: t.textDim, paddingVertical: 12, textAlign: 'center' as const },
  truncatedHint: {
    fontSize: 10,
    color: t.textDim,
    textAlign: 'center' as const,
    paddingVertical: 8,
  },

  footer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },
  errorText: { fontSize: 11, color: t.danger, flex: 1 },
  cancelText: { fontSize: 13, fontWeight: '700' as const, color: t.textMuted },
  saveBtn: {
    backgroundColor: t.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 110,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  saveBtnText: { fontSize: 13, fontWeight: '900' as const, color: t.textOnAccent, letterSpacing: 0.5 },
});
