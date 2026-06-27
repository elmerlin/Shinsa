import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChartJacket } from '@/components/chart-jacket';
import { GradeChip } from '@/components/grade-chip';
import { HeartRateStrip } from '@/components/heart-rate-strip';
import { HrZoneBar } from '@/components/hr-zone-bar';
import { ReplayModal } from '@/components/replay-modal';
import { ScoreCardSheet, type ScoreCardData } from '@/components/score-card-sheet';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { liveApi } from '@/lib/api';
import { hrZoneColor } from '@/lib/heartRate';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type { LiveSessionHrBlock, LiveSessionPlay, LiveSessionSummaryPayload } from '@shared/api';

function fmtNum(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

// Post-session recap: segmented [Recap | ♥ Heart rate]. Recap = the old
// pumpshinsa.com summary card's Top Plays (top 3 by score / by rating);
// the HR slide = session curve over personal zone bands, time-in-zone, and
// per-level intensity with S/D separated (D23 ≠ S23). Shared by the live
// session screen and recap feed posts.
export function LiveRecap({ summary, onPlayPress }: {
  summary: Partial<LiveSessionSummaryPayload>;
  /** Override to reuse a parent ScoreCardSheet; defaults to an internal one. */
  onPlayPress?: (play: LiveSessionPlay) => void;
}) {
  const s = useThemedStyles(makeStyles);
  const [tab, setTab] = useState<'recap' | 'hr'>('recap');
  const [internalPlay, setInternalPlay] = useState<LiveSessionPlay | null>(null);
  const [replay, setReplay] = useState<{ url: string; title: string } | null>(null);
  const hr = summary.hr;

  const handlePlay = onPlayPress ?? setInternalPlay;
  const internalPlayData: ScoreCardData | null = internalPlay
    ? {
        ...internalPlay,
        username: internalPlay.username,
        avatar: internalPlay.avatar,
        score: internalPlay.score,
        grade: internalPlay.grade,
        jacket_url: (internalPlay.jacket_url as string | undefined) || internalPlay.background_url,
        is_stage_break: internalPlay.score === 0,
      }
    : null;

  return (
    <View style={s.recapCard}>
      <View style={s.segRow}>
        <Pressable
          onPress={() => setTab('recap')}
          style={({ pressed }) => [s.segBtn, tab === 'recap' && s.segBtnActive, pressed && { opacity: 0.8 }]}>
          <Text style={[s.segText, tab === 'recap' && s.segTextActive]}>RECAP</Text>
        </Pressable>
        {hr ? (
          <Pressable
            onPress={() => setTab('hr')}
            style={({ pressed }) => [s.segBtn, tab === 'hr' && s.segBtnActive, pressed && { opacity: 0.8 }]}>
            <Text style={[s.segText, tab === 'hr' && s.segTextActive]}>♥ HEART RATE</Text>
          </Pressable>
        ) : null}
      </View>

      {tab === 'recap' ? (
        <View style={s.body}>
          <TopPlaysTable title="Top 3 by score" rows={summary.topSongsByScore || []} type="score" onPlayPress={handlePlay} s={s} />
          <TopPlaysTable title="Top 3 by rating" rows={summary.topSongsByRating || []} type="rating" onPlayPress={handlePlay} s={s} />
          {summary.postText ? <Text style={s.recapText}>{summary.postText}</Text> : null}
        </View>
      ) : hr ? (
        <SessionHrView hr={hr} s={s} />
      ) : null}

      {/* Internal score card — only mounted when no parent handler is given. */}
      {!onPlayPress ? (
        <>
          <ScoreCardSheet
            visible={!!internalPlay}
            data={internalPlayData}
            onClose={() => setInternalPlay(null)}
            onReplay={(url, title) => setReplay({ url, title })}
          />
          <ReplayModal
            visible={!!replay}
            url={replay?.url}
            title={replay?.title}
            onClose={() => setReplay(null)}
          />
        </>
      ) : null}
    </View>
  );
}

// Recap for FEED POSTS: old posts were serialized before the hr block (and
// some before topSongs), so when the marker lacks hr but knows its sessionId,
// fetch the live session's fresh summary and render that instead.
export function PostLiveRecap({ summary, collapsible }: {
  summary: Partial<LiveSessionSummaryPayload>;
  /** Feed lists: render a compact expand bar; fetch + full recap on tap. */
  collapsible?: boolean;
}) {
  const s = useThemedStyles(makeStyles);
  const [expanded, setExpanded] = useState(!collapsible);
  const sessionId = String(summary.sessionId || '');
  // Old posts predate the hr block in the marker — refetch the session's
  // fresh summary. Only once expanded, so feed lists don't fan out requests.
  const needsFresh = expanded && !summary.hr && !!sessionId;
  const freshQuery = useQuery({
    queryKey: ['live-session', sessionId],
    queryFn: () => liveApi.session(sessionId),
    enabled: needsFresh,
    staleTime: 5 * 60_000,
  });

  if (!expanded) {
    const hasAny = (summary.topSongsByScore?.length || 0) > 0
      || (summary.topSongsByRating?.length || 0) > 0
      || !!summary.hr
      || !!sessionId;
    if (!hasAny) return null;
    return (
      <Pressable
        onPress={() => setExpanded(true)}
        style={({ pressed }) => [s.expandBar, pressed && { opacity: 0.7 }]}>
        <Text style={s.expandBarText}>TOP PLAYS{summary.hr || sessionId ? ' · ♥ HEART RATE' : ''}</Text>
        <Text style={s.expandBarChevron}>▾</Text>
      </Pressable>
    );
  }

  const fresh = freshQuery.data?.summary;
  const effective = (needsFresh && fresh) ? { ...summary, ...fresh, postText: '' } : { ...summary, postText: '' };
  return <LiveRecap summary={effective} />;
}

function TopPlaysTable({ title, rows, type, onPlayPress, s }: {
  title: string;
  rows: LiveSessionPlay[];
  type: 'score' | 'rating';
  onPlayPress: (play: LiveSessionPlay) => void;
  s: Styles;
}) {
  const list = Array.isArray(rows) ? rows.slice(0, 3) : [];
  if (list.length === 0) return null;
  return (
    <View style={s.topTable}>
      <Text style={s.topTableTitle}>{title.toUpperCase()}</Text>
      {list.map((row, idx) => {
        const value = type === 'score'
          ? fmtNum(Number(row.score) || 0)
          : fmtNum(Number((row as Record<string, unknown>)._rating ?? row.rating) || 0);
        return (
          <Pressable
            key={`${row.id ?? idx}`}
            onPress={() => onPlayPress(row)}
            style={({ pressed }) => [s.topRow, pressed && { opacity: 0.7 }]}>
            <Text style={s.topRank}>{idx + 1}</Text>
            <ChartJacket
              jacketUrl={typeof row.jacket_url === 'string' ? fullImageUrl(row.jacket_url) : (row.background_url ? fullImageUrl(row.background_url) : undefined)}
              mode={row.mode}
              level={row.level}
              size="xs"
            />
            <View style={s.topMain}>
              <Text style={s.topSong} numberOfLines={1}>{row.song_title || '—'}</Text>
              {Number(row.over_top100_rank) > 0 ? (
                <Text style={s.topBadge}>TOP #{Number(row.over_top100_rank)}</Text>
              ) : null}
            </View>
            <View style={s.topValueCol}>
              <Text style={[s.topValue, type === 'rating' && { color: '#7dd3fc' }]}>{value}</Text>
              <GradeChip grade={row.grade} score={Number(row.score) || 0} size="xs" />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function SessionHrView({ hr, s }: { hr: LiveSessionHrBlock; s: Styles }) {
  const mins = Math.round((Number(hr.duration_s) || 0) / 60);
  return (
    <View style={s.body}>
      <View style={s.hrStatRow}>
        <View style={s.hrStatCell}>
          <Text style={[s.hrStatValue, { color: '#f87171' }]}>{hr.hr_avg || '—'}</Text>
          <Text style={s.hrStatLabel}>AVG BPM</Text>
        </View>
        <View style={s.hrStatCell}>
          <Text style={[s.hrStatValue, { color: hrZoneColor(hr.hr_peak, hr.max_hr) }]}>{hr.hr_peak || '—'}</Text>
          <Text style={s.hrStatLabel}>PEAK BPM</Text>
        </View>
        <View style={s.hrStatCell}>
          <Text style={s.hrStatValue}>{mins > 0 ? `${mins}m` : '—'}</Text>
          <Text style={s.hrStatLabel}>SONG TIME</Text>
        </View>
        <View style={s.hrStatCell}>
          <Text style={s.hrStatValue}>{hr.play_count}</Text>
          <Text style={s.hrStatLabel}>PLAYS</Text>
        </View>
      </View>

      <HeartRateStrip
        avg={hr.hr_avg}
        peak={hr.hr_peak}
        series={hr.series}
        durationS={hr.duration_s}
        maxHr={hr.max_hr}
      />

      <HrZoneBar zoneSeconds={hr.zone_seconds || {}} />

      {hr.peak_song ? (
        <Text style={s.hrPeakSong}>
          Highest HR: <Text style={s.hrPeakSongStrong}>{hr.peak_song.hr_peak} BPM</Text> on{' '}
          {hr.peak_song.song_title} ({String(hr.peak_song.mode).startsWith('D') ? 'D' : 'S'}{hr.peak_song.level})
        </Text>
      ) : null}

      {hr.per_level.length > 0 ? (
        <View style={s.hrLevelTable}>
          <Text style={s.topTableTitle}>AVG HR BY LEVEL</Text>
          {hr.per_level.map((g) => (
            <View key={g.key} style={s.hrLevelRow}>
              <Text style={[s.hrLevelKey, { color: g.mode === 'D' ? '#4cf4aa' : '#ff7a7a' }]}>{g.key}</Text>
              <View style={s.hrLevelBarTrack}>
                <View
                  style={[
                    s.hrLevelBarFill,
                    {
                      width: `${Math.min(100, Math.round((g.hr_avg / Math.max(1, hr.max_hr)) * 100))}%` as never,
                      backgroundColor: hrZoneColor(g.hr_avg, hr.max_hr),
                    },
                  ]}
                />
              </View>
              <Text style={s.hrLevelAvg}>{g.hr_avg}</Text>
              <Text style={s.hrLevelPeak}>pk {g.hr_peak}</Text>
              <Text style={s.hrLevelPlays}>×{g.plays}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  recapCard: {
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 12,
    gap: 10,
  },
  recapText: { fontSize: 12, color: t.textMuted, lineHeight: 18 },
  expandBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
  },
  expandBarText: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 1, color: t.textMuted },
  expandBarChevron: { fontSize: 12, color: t.textDim },
  segRow: { flexDirection: 'row' as const, gap: 6 },
  segBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
  },
  segBtnActive: { backgroundColor: t.accentTint, borderColor: t.accent },
  segText: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 1, color: t.textMuted },
  segTextActive: { color: t.accent },
  body: { gap: 12 },

  topTable: { gap: 6 },
  topTableTitle: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 1.2, color: t.textDim },
  topRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  topRank: { width: 14, fontSize: 12, fontWeight: '900' as const, color: t.textMuted, fontVariant: ['tabular-nums' as const] },
  topMain: { flex: 1, minWidth: 0, gap: 2 },
  topSong: { fontSize: 12, fontWeight: '800' as const, color: t.text },
  topBadge: {
    alignSelf: 'flex-start' as const,
    fontSize: 8,
    fontWeight: '900' as const,
    color: '#FFE06B',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,196,0,0.55)',
    backgroundColor: 'rgba(255,196,0,0.15)',
    overflow: 'hidden' as const,
    letterSpacing: 0.5,
  },
  topValueCol: { alignItems: 'flex-end' as const, gap: 2 },
  topValue: { fontSize: 12, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },

  hrStatRow: { flexDirection: 'row' as const, gap: 6 },
  hrStatCell: {
    flex: 1,
    alignItems: 'center' as const,
    gap: 2,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: t.surfaceMuted,
  },
  hrStatValue: { fontSize: 16, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  hrStatLabel: { fontSize: 8, fontWeight: '800' as const, color: t.textDim, letterSpacing: 0.6 },
  hrPeakSong: { fontSize: 12, color: t.textMuted, lineHeight: 17 },
  hrPeakSongStrong: { fontWeight: '900' as const, color: '#f87171' },
  hrLevelTable: { gap: 6 },
  hrLevelRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  hrLevelKey: { width: 34, fontSize: 12, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },
  hrLevelBarTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: t.surfaceMuted,
    overflow: 'hidden' as const,
  },
  hrLevelBarFill: { height: 8, borderRadius: 4 },
  hrLevelAvg: { width: 30, textAlign: 'right' as const, fontSize: 12, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  hrLevelPeak: { width: 44, textAlign: 'right' as const, fontSize: 10, color: t.textMuted, fontVariant: ['tabular-nums' as const] },
  hrLevelPlays: { width: 26, textAlign: 'right' as const, fontSize: 10, color: t.textDim, fontVariant: ['tabular-nums' as const] },
});
