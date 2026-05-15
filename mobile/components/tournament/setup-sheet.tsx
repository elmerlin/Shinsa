import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
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
import { tournamentsApi } from '@/lib/api';
import { FORMAT_ICONS, FORMAT_LABELS } from '@/lib/tournament-format';
import type { ThemeColors } from '@/constants/theme';
import type { Tournament, TournamentPhase } from '@shared/api';

const ALL_FORMATS = [
  'round_robin',
  'pools',
  'single_elim',
  'double_elim',
  'gauntlet',
  'hour_of_power',
  'b15',
] as const;

type FormatKey = (typeof ALL_FORMATS)[number];

/** Sensible default knob values per format — mirrors DEFAULT_CONFIGS in
 *  client/src/pages/TournamentSetup.jsx so a phase opens with the same
 *  numbers as the desktop wizard. */
const DEFAULT_CONFIGS: Record<FormatKey, Record<string, unknown>> = {
  round_robin: { rounds: 3, cards_per_draw: 5, vetoes_per_player: 1, best_of: 3 },
  pools: { pool_count: 4, rounds_per_pool: 1, difficulty_min: 18, difficulty_max: 21, cards_per_draw: 5, vetoes_per_player: 1, best_of: 3 },
  single_elim: { difficulty_min: 20, difficulty_max: 23, cards_per_draw: 5, vetoes_per_player: 1, best_of: 3, third_place_match: true },
  double_elim: { difficulty_min: 20, difficulty_max: 23, cards_per_draw: 5, vetoes_per_player: 1, best_of: 3, grand_final_reset: true },
  gauntlet: { start_level: 19, final_level: 24, final_level_max: 25, best_of: 3 },
  hour_of_power: { duration_minutes: 60, difficulty_min: 18, difficulty_max: 23 },
  b15: { duration_minutes: 60, difficulty_min: 18, difficulty_max: 23 },
};

interface PhaseDraft {
  /** Stable local key for React (independent of server id). */
  _key: string;
  /** Set only when this phase already exists on the server (edit mode). */
  id?: string;
  format: FormatKey;
  name: string;
  config: Record<string, unknown>;
  advancement: Record<string, unknown>;
}

function freshPhaseDraft(format: FormatKey): PhaseDraft {
  return {
    _key: `${Date.now()}-${format}-${Math.random().toString(36).slice(2, 7)}`,
    format,
    name: '',
    config: { ...DEFAULT_CONFIGS[format] },
    advancement: { type: 'all' },
  };
}

interface Props {
  visible: boolean;
  /** Set on edit; omit for create. */
  tournamentId?: string | null;
  onClose: () => void;
  /** Fired after a successful create / save, with the resulting tournament. */
  onSaved?: (tournament: Tournament) => void;
}

/**
 * Multi-phase tournament setup sheet — mirrors the desktop
 * /tournament/new and /tournament/:id/edit page in a single modal. In
 * create mode it POSTs a new tournament + phase rows; in edit mode it
 * PUTs the metadata and reconciles the phase list (insert/update/delete).
 */
export function TournamentSetupSheet({ visible, tournamentId, onClose, onSaved }: Props) {
  const s = useThemedStyles(makeStyles);
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const isEdit = !!tournamentId;
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [phases, setPhases] = useState<PhaseDraft[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [originalPhaseIds, setOriginalPhaseIds] = useState<string[]>([]);
  const [showFormatPicker, setShowFormatPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Edit mode: hydrate the form from the existing tournament + its phases.
  const tournamentQuery = useQuery({
    queryKey: ['tournament', tournamentId || 'none'],
    queryFn: () => tournamentsApi.get(tournamentId as string),
    enabled: visible && isEdit,
  });
  const phasesQuery = useQuery({
    queryKey: ['tournament', tournamentId || 'none', 'phases'],
    queryFn: () => tournamentsApi.phases(tournamentId as string),
    enabled: visible && isEdit,
    retry: false,
  });

  useEffect(() => {
    if (!visible) return;
    setError('');
    setSaving(false);
    setShowFormatPicker(false);
    if (!isEdit) {
      // Create mode: clean slate + one default round_robin phase.
      setName('');
      setLocation('');
      setDate(new Date().toISOString().split('T')[0]);
      const seed = freshPhaseDraft('round_robin');
      setPhases([seed]);
      setExpandedKey(seed._key);
      setOriginalPhaseIds([]);
    }
  }, [visible, isEdit]);

  useEffect(() => {
    if (!visible || !isEdit) return;
    const t = tournamentQuery.data;
    if (!t) return;
    setName(String(t.name || ''));
    setLocation(String(t.location || ''));
    setDate(String(t.date || new Date().toISOString().split('T')[0]));
  }, [visible, isEdit, tournamentQuery.data]);

  useEffect(() => {
    if (!visible || !isEdit) return;
    const ph = phasesQuery.data;
    if (!ph) return;
    const drafts: PhaseDraft[] = ph.map((p, i) => ({
      _key: `${p.id}-${i}`,
      id: p.id,
      format: (p.format as FormatKey) || 'round_robin',
      name: String(p.name || ''),
      config: (typeof p.config === 'object' && p.config) ? (p.config as Record<string, unknown>) : (() => {
        try { return p.config ? JSON.parse(p.config as string) : {}; } catch { return {}; }
      })(),
      advancement: (typeof p.advancement === 'object' && p.advancement) ? (p.advancement as Record<string, unknown>) : (() => {
        try { return p.advancement ? JSON.parse(p.advancement as string) : { type: 'all' }; } catch { return { type: 'all' }; }
      })(),
    }));
    setPhases(drafts);
    setOriginalPhaseIds(drafts.map((d) => d.id).filter((x): x is string => !!x));
    setExpandedKey(drafts[0]?._key ?? null);
  }, [visible, isEdit, phasesQuery.data]);

  const addPhase = (format: FormatKey) => {
    const draft = freshPhaseDraft(format);
    setPhases((prev) => [...prev, draft]);
    setExpandedKey(draft._key);
    setShowFormatPicker(false);
  };
  const removePhase = (key: string) => {
    setPhases((prev) => prev.filter((p) => p._key !== key));
    if (expandedKey === key) setExpandedKey(null);
  };
  const movePhase = (key: string, dir: -1 | 1) => {
    setPhases((prev) => {
      const idx = prev.findIndex((p) => p._key === key);
      if (idx === -1) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });
  };
  const updatePhase = (key: string, patch: Partial<PhaseDraft>) => {
    setPhases((prev) => prev.map((p) => (p._key === key ? { ...p, ...patch } : p)));
  };
  const updateConfigField = (key: string, field: string, value: unknown) => {
    setPhases((prev) => prev.map((p) => (p._key === key ? { ...p, config: { ...p.config, [field]: value } } : p)));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Tournament name is required');
      if (phases.length === 0) throw new Error('Add at least one phase');
      const firstConfig = phases[0].config || {};
      const tournamentPayload = {
        name: name.trim(),
        location: location.trim(),
        date,
        total_rounds: Number(firstConfig.rounds) || 1,
        config: { ...firstConfig, phases_enabled: true },
      };
      let saved: Tournament;
      if (!isEdit) {
        saved = await tournamentsApi.create(tournamentPayload);
        for (let i = 0; i < phases.length; i++) {
          const p = phases[i];
          await tournamentsApi.createPhase({
            tournament_id: saved.id,
            phase_order: i + 1,
            format: p.format,
            name: p.name,
            config: p.config,
            advancement: p.advancement,
          });
        }
      } else {
        saved = await tournamentsApi.update(tournamentId as string, tournamentPayload);
        const keptIds: string[] = [];
        for (let i = 0; i < phases.length; i++) {
          const p = phases[i];
          if (p.id) {
            await tournamentsApi.updatePhase(p.id, {
              phase_order: i + 1,
              format: p.format,
              name: p.name,
              config: p.config,
              advancement: p.advancement,
            });
            keptIds.push(p.id);
          } else {
            const created = await tournamentsApi.createPhase({
              tournament_id: tournamentId as string,
              phase_order: i + 1,
              format: p.format,
              name: p.name,
              config: p.config,
              advancement: p.advancement,
            }) as TournamentPhase;
            if (created?.id) keptIds.push(created.id);
          }
        }
        for (const old of originalPhaseIds) {
          if (!keptIds.includes(old)) {
            await tournamentsApi.deletePhase(old);
          }
        }
      }
      return saved;
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['tournament', saved.id] });
      queryClient.invalidateQueries({ queryKey: ['tournament', saved.id, 'phases'] });
      onSaved?.(saved);
      onClose();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to save');
      setSaving(false);
    },
  });

  const handleSave = () => {
    setError('');
    setSaving(true);
    saveMutation.mutate();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={s.handle} />
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>TOURNAMENT SETUP</Text>
              <Text style={s.title}>{isEdit ? 'Edit setup' : 'New tournament'}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.7 }]}>
              <Text style={s.closeBtnText}>×</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            {isEdit && tournamentQuery.isLoading ? (
              <View style={{ padding: 16, alignItems: 'center' }}>
                <ActivityIndicator color={theme.spinner} />
              </View>
            ) : null}

            {/* ── Tournament metadata ── */}
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>NAME</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Spring Showdown 2026"
                placeholderTextColor={'#8a8a8a'}
                style={s.input}
                maxLength={120}
              />
            </View>
            <View style={s.fieldRow}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={s.fieldLabel}>DATE</Text>
                <TextInput
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={'#8a8a8a'}
                  style={s.input}
                  maxLength={10}
                />
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={s.fieldLabel}>LOCATION</Text>
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder="Venue or city"
                  placeholderTextColor={'#8a8a8a'}
                  style={s.input}
                />
              </View>
            </View>

            {/* ── Phases ── */}
            <View style={s.phaseSectionHead}>
              <View style={{ flex: 1 }}>
                <Text style={s.eyebrowSmall}>STAGES</Text>
                <Text style={s.sectionTitle}>Phases ({phases.length})</Text>
                <Text style={s.sectionHint}>
                  Run multiple formats back-to-back. The order is how the bracket flows.
                </Text>
              </View>
              <Pressable
                onPress={() => setShowFormatPicker(true)}
                style={({ pressed }) => [s.addPhaseBtn, pressed && { opacity: 0.85 }]}>
                <Text style={s.addPhaseBtnText}>+ Phase</Text>
              </Pressable>
            </View>

            <View style={{ gap: 8 }}>
              {phases.length === 0 ? (
                <Text style={s.empty}>No phases yet. Tap “+ Phase” to add one.</Text>
              ) : null}
              {phases.map((p, idx) => {
                const isExpanded = expandedKey === p._key;
                return (
                  <View key={p._key} style={[s.phaseCard, isExpanded && s.phaseCardActive]}>
                    <Pressable
                      onPress={() => setExpandedKey(isExpanded ? null : p._key)}
                      style={s.phaseHead}>
                      <Text style={s.phaseIcon}>{FORMAT_ICONS[p.format] || '🏆'}</Text>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.phaseHeadLabel}>PHASE {idx + 1}</Text>
                        <Text style={s.phaseHeadTitle} numberOfLines={1}>
                          {p.name || FORMAT_LABELS[p.format] || p.format}
                        </Text>
                      </View>
                      <View style={s.phaseHeadActions}>
                        <Pressable hitSlop={6} onPress={() => movePhase(p._key, -1)} disabled={idx === 0}>
                          <Text style={[s.smallBtn, idx === 0 && { opacity: 0.3 }]}>↑</Text>
                        </Pressable>
                        <Pressable hitSlop={6} onPress={() => movePhase(p._key, 1)} disabled={idx === phases.length - 1}>
                          <Text style={[s.smallBtn, idx === phases.length - 1 && { opacity: 0.3 }]}>↓</Text>
                        </Pressable>
                        <Pressable hitSlop={6} onPress={() => removePhase(p._key)}>
                          <Text style={[s.smallBtn, { color: theme.danger }]}>×</Text>
                        </Pressable>
                      </View>
                    </Pressable>
                    {isExpanded ? (
                      <PhaseConfigBlock
                        phase={p}
                        onChangeFormat={(format) =>
                          updatePhase(p._key, { format, config: { ...DEFAULT_CONFIGS[format] } })
                        }
                        onChangeName={(v) => updatePhase(p._key, { name: v })}
                        onChangeConfigField={(field, value) => updateConfigField(p._key, field, value)}
                        onChangeAdvancement={(adv) => updatePhase(p._key, { advancement: adv })}
                        s={s}
                      />
                    ) : null}
                  </View>
                );
              })}
            </View>

            {error ? <Text style={s.errorText}>{error}</Text> : null}
          </ScrollView>

          <View style={s.footer}>
            <Pressable onPress={onClose} style={({ pressed }) => [s.footerCancel, pressed && { opacity: 0.7 }]}>
              <Text style={s.footerCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving || !name.trim() || phases.length === 0}
              style={({ pressed }) => [
                s.footerSave,
                (saving || !name.trim() || phases.length === 0) && { opacity: 0.4 },
                pressed && { opacity: 0.85 },
              ]}>
              {saving
                ? <ActivityIndicator size="small" color={theme.textOnAccent} />
                : <Text style={s.footerSaveText}>{isEdit ? 'Save changes' : 'Create tournament'}</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>

      {/* Format picker — slides up on top of the setup sheet. */}
      <Modal visible={showFormatPicker} animationType="fade" transparent onRequestClose={() => setShowFormatPicker(false)}>
        <Pressable style={s.pickerBackdrop} onPress={() => setShowFormatPicker(false)}>
          <Pressable style={s.pickerCard} onPress={() => undefined}>
            <Text style={s.pickerTitle}>Add a phase</Text>
            {ALL_FORMATS.map((f) => (
              <Pressable
                key={f}
                onPress={() => addPhase(f)}
                style={({ pressed }) => [s.pickerRow, pressed && { opacity: 0.7 }]}>
                <Text style={s.pickerIcon}>{FORMAT_ICONS[f]}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.pickerLabel}>{FORMAT_LABELS[f]}</Text>
                </View>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function PhaseConfigBlock({
  phase,
  onChangeFormat,
  onChangeName,
  onChangeConfigField,
  onChangeAdvancement,
  s,
}: {
  phase: PhaseDraft;
  onChangeFormat: (f: FormatKey) => void;
  onChangeName: (v: string) => void;
  onChangeConfigField: (field: string, value: unknown) => void;
  onChangeAdvancement: (adv: Record<string, unknown>) => void;
  s: Styles;
}) {
  const c = phase.config;
  const adv = phase.advancement;
  return (
    <View style={s.phaseBody}>
      {/* Format picker chip row — same format pills as desktop */}
      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>FORMAT</Text>
        <View style={s.formatChipRow}>
          {ALL_FORMATS.map((f) => {
            const active = phase.format === f;
            return (
              <Pressable
                key={f}
                onPress={() => onChangeFormat(f)}
                style={({ pressed }) => [
                  s.formatChip,
                  active && s.formatChipActive,
                  pressed && !active && { opacity: 0.7 },
                ]}>
                <Text style={s.formatChipIcon}>{FORMAT_ICONS[f]}</Text>
                <Text style={[s.formatChipLabel, active && s.formatChipLabelActive]} numberOfLines={1}>
                  {FORMAT_LABELS[f]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>PHASE NAME (OPTIONAL)</Text>
        <TextInput
          value={phase.name}
          onChangeText={onChangeName}
          placeholder={FORMAT_LABELS[phase.format]}
          placeholderTextColor={'#8a8a8a'}
          style={s.input}
        />
      </View>

      {/* Format-specific knobs. We show the same set the desktop wizard
          exposes — every field is optional, but defaults are sensible. */}
      <NumberRow label="Rounds" value={c.rounds} onChange={(v) => onChangeConfigField('rounds', v)} show={phase.format === 'round_robin' || phase.format === 'pools'} s={s} />
      <NumberRow label="Pool count" value={c.pool_count} onChange={(v) => onChangeConfigField('pool_count', v)} show={phase.format === 'pools'} s={s} />
      <NumberRow label="Difficulty min" value={c.difficulty_min} onChange={(v) => onChangeConfigField('difficulty_min', v)} show={phase.format !== 'round_robin' && phase.format !== 'gauntlet'} s={s} />
      <NumberRow label="Difficulty max" value={c.difficulty_max} onChange={(v) => onChangeConfigField('difficulty_max', v)} show={phase.format !== 'round_robin' && phase.format !== 'gauntlet'} s={s} />
      <NumberRow label="Gauntlet start lvl" value={c.start_level} onChange={(v) => onChangeConfigField('start_level', v)} show={phase.format === 'gauntlet'} s={s} />
      <NumberRow label="Gauntlet final lvl" value={c.final_level} onChange={(v) => onChangeConfigField('final_level', v)} show={phase.format === 'gauntlet'} s={s} />
      <NumberRow label="Gauntlet final lvl max" value={c.final_level_max} onChange={(v) => onChangeConfigField('final_level_max', v)} show={phase.format === 'gauntlet'} s={s} />
      <NumberRow label="Cards drawn" value={c.cards_per_draw} onChange={(v) => onChangeConfigField('cards_per_draw', v)} show={phase.format !== 'gauntlet' && phase.format !== 'hour_of_power' && phase.format !== 'b15'} s={s} />
      <NumberRow label="Vetoes per player" value={c.vetoes_per_player} onChange={(v) => onChangeConfigField('vetoes_per_player', v)} show={phase.format !== 'gauntlet' && phase.format !== 'hour_of_power' && phase.format !== 'b15'} s={s} />
      <NumberRow label="Best of" value={c.best_of} onChange={(v) => onChangeConfigField('best_of', v)} show={phase.format !== 'hour_of_power' && phase.format !== 'b15'} s={s} />
      <NumberRow label="Duration (min)" value={c.duration_minutes} onChange={(v) => onChangeConfigField('duration_minutes', v)} show={phase.format === 'hour_of_power' || phase.format === 'b15'} s={s} />

      {/* Advancement: simple top-N selector + threshold */}
      <View style={s.fieldGroup}>
        <Text style={s.fieldLabel}>ADVANCEMENT</Text>
        <View style={s.advancementRow}>
          {([
            { value: 'all', label: 'All' },
            { value: 'top_n', label: 'Top N' },
            { value: 'per_pool_top_n', label: 'Top N / pool' },
            { value: 'threshold', label: 'Threshold' },
          ] as { value: string; label: string }[]).map((opt) => {
            const active = (adv.type as string) === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => onChangeAdvancement({ ...adv, type: opt.value })}
                style={({ pressed }) => [
                  s.advChip,
                  active && s.advChipActive,
                  pressed && !active && { opacity: 0.7 },
                ]}>
                <Text style={[s.advChipText, active && s.advChipTextActive]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {(adv.type === 'top_n' || adv.type === 'per_pool_top_n') ? (
          <NumberRow label="Count" value={adv.count} onChange={(v) => onChangeAdvancement({ ...adv, count: v })} s={s} />
        ) : null}
        {adv.type === 'threshold' ? (
          <NumberRow label="Threshold" value={adv.threshold} onChange={(v) => onChangeAdvancement({ ...adv, threshold: v })} s={s} />
        ) : null}
      </View>
    </View>
  );
}

function NumberRow({
  label,
  value,
  onChange,
  show = true,
  s,
}: {
  label: string;
  value: unknown;
  onChange: (v: number | undefined) => void;
  show?: boolean;
  s: Styles;
}) {
  if (!show) return null;
  return (
    <View style={s.numberRow}>
      <Text style={s.numberLabel}>{label}</Text>
      <TextInput
        value={value != null ? String(value) : ''}
        onChangeText={(t) => {
          const n = Number(t);
          onChange(Number.isFinite(n) ? n : undefined);
        }}
        keyboardType="number-pad"
        style={s.numberInput}
        placeholder="–"
        placeholderTextColor={'#8a8a8a'}
      />
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' as const, alignItems: 'center' as const },
  sheet: {
    width: '100%' as const,
    maxWidth: 720,
    maxHeight: '94%' as const,
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
  eyebrowSmall: { fontSize: 9, letterSpacing: 1.4, color: t.textDim, fontWeight: '900' as const },
  title: { fontSize: 18, fontWeight: '900' as const, color: t.text, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '900' as const, color: t.text, marginTop: 2 },
  sectionHint: { fontSize: 11, color: t.textDim, marginTop: 2, lineHeight: 15 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: t.border, backgroundColor: t.surfaceMuted,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  closeBtnText: { fontSize: 20, color: t.textMuted, fontWeight: '800' as const, marginTop: -3 },

  body: { padding: 14, gap: 14 },
  fieldGroup: { gap: 6 },
  fieldRow: { flexDirection: 'row' as const, gap: 8 },
  fieldLabel: { fontSize: 9, letterSpacing: 1.3, color: t.textDim, fontWeight: '900' as const },
  input: {
    backgroundColor: t.surfaceMuted,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    color: t.text,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },

  phaseSectionHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  addPhaseBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: t.accentTint, borderWidth: 1, borderColor: t.accent,
  },
  addPhaseBtnText: { fontSize: 12, fontWeight: '900' as const, color: t.accent, letterSpacing: 0.5 },

  empty: { fontSize: 12, color: t.textDim, fontStyle: 'italic' as const, textAlign: 'center' as const, paddingVertical: 12 },

  phaseCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
    overflow: 'hidden' as const,
  },
  phaseCardActive: { borderColor: t.accent },
  phaseHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, padding: 10 },
  phaseIcon: { fontSize: 18 },
  phaseHeadLabel: { fontSize: 9, letterSpacing: 1.4, color: t.textDim, fontWeight: '900' as const },
  phaseHeadTitle: { fontSize: 14, fontWeight: '900' as const, color: t.text },
  phaseHeadActions: { flexDirection: 'row' as const, gap: 12, alignItems: 'center' as const },
  smallBtn: { fontSize: 16, color: t.textMuted, fontWeight: '900' as const, paddingHorizontal: 4 },

  phaseBody: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },
  formatChipRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  formatChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.bg,
  },
  formatChipActive: { borderColor: t.accent, backgroundColor: t.accentTint },
  formatChipIcon: { fontSize: 11 },
  formatChipLabel: { fontSize: 11, fontWeight: '800' as const, color: t.textMuted },
  formatChipLabelActive: { color: t.accent, fontWeight: '900' as const },

  numberRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  numberLabel: { flex: 1, fontSize: 12, color: t.textMuted, fontWeight: '700' as const },
  numberInput: {
    width: 90,
    backgroundColor: t.bg,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    color: t.text,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },

  advancementRow: { flexDirection: 'row' as const, gap: 6, flexWrap: 'wrap' as const },
  advChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.bg,
  },
  advChipActive: { borderColor: t.accent, backgroundColor: t.accentTint },
  advChipText: { fontSize: 11, fontWeight: '800' as const, color: t.textMuted },
  advChipTextActive: { color: t.accent, fontWeight: '900' as const },

  errorText: { fontSize: 12, color: t.danger, paddingTop: 8 },

  footer: {
    flexDirection: 'row' as const,
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },
  footerCancel: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border, backgroundColor: t.surfaceMuted },
  footerCancelText: { fontSize: 12, fontWeight: '800' as const, color: t.textMuted, letterSpacing: 0.5 },
  footerSave: {
    flex: 1,
    backgroundColor: t.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  footerSaveText: { fontSize: 13, fontWeight: '900' as const, color: t.textOnAccent, letterSpacing: 0.5 },

  // Format picker modal
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 24,
  },
  pickerCard: {
    width: '100%' as const,
    maxWidth: 360,
    borderRadius: 14,
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 14,
    gap: 6,
  },
  pickerTitle: { fontSize: 14, fontWeight: '900' as const, color: t.text, paddingBottom: 6 },
  pickerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: t.surfaceMuted,
  },
  pickerIcon: { fontSize: 18 },
  pickerLabel: { fontSize: 13, fontWeight: '800' as const, color: t.text },
});
