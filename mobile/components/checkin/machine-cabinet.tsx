import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { DefaultAvatar } from '@/components/default-avatar';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type { ActiveCheckin } from '@shared/api';

/**
 * Stylised Pump It Up cabinet drawn with plain Views — no SVG / no image
 * assets. Aspect-ratio'd so it stays cabinet-shaped at any cell width:
 *
 *   ┌─────────────────────┐
 *   │     marquee bar     │  cabinet header strip + machine name
 *   ├─────────────────────┤
 *   │ ╔═════════════════╗ │  screen — players' avatars sit here
 *   │ ║   [a] [a]       ║ │  ("on the screen" per user request)
 *   │ ╚═════════════════╝ │
 *   │ ┌──┐ ┌──┐ ┌──┐ ┌──┐│  control strip (card reader / start)
 *   ├─────────────────────┤
 *   │ ▢▢▢   ▢▢▢ │      pad area — left pad + right pad,
 *   │ ▢◇▢   ▢◇▢ │      each a 3×3 grid with the 5-panel
 *   │ ▢▢▢   ▢▢▢ │      diamond highlighted in red/blue/yellow
 *   └─────────────────────┘
 *
 * `mine = true` paints the green "you're here" border + tag so the user
 * can spot their current cabinet at a glance.
 */
interface Props {
  name: string;
  players: ActiveCheckin[];
  mine: boolean;
  // Optional badge text shown on the screen when no players are present
  // (e.g. "TAP TO PLAY"). Defaults to a stylised "PUMP IT UP" wordmark.
  idleLabel?: string;
}

export function MachineCabinet({ name, players, mine, idleLabel }: Props) {
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const visiblePlayers = players.slice(0, 2); // arcade is 2P max per cab
  const extraPlayers = Math.max(0, players.length - visiblePlayers.length);
  const occupied = players.length > 0;

  return (
    <View style={[s.cab, mine && s.cabMine]}>
      {/* Marquee — the lit panel above the screen with the cabinet name */}
      <View style={s.marquee}>
        <View style={s.marqueeGlow} />
        <Text style={s.marqueeText} numberOfLines={1}>{name}</Text>
      </View>

      {/* Main screen — avatars overlay when the machine is occupied */}
      <View style={s.screenBezel}>
        <View style={[s.screen, occupied ? s.screenOn : s.screenIdle]}>
          {occupied ? (
            <View style={s.avatarRow}>
              {visiblePlayers.map((p, i) => (
                <PlayerHead key={p.user_id + ':' + i} player={p} accent={theme.accent} />
              ))}
              {extraPlayers > 0 ? (
                <View style={[s.extraBadge, { borderColor: theme.accent }]}>
                  <Text style={[s.extraBadgeText, { color: theme.accent }]}>+{extraPlayers}</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <Text style={s.idleLogo}>{idleLabel || 'PUMP IT UP'}</Text>
          )}
          {/* Glassy highlight — single semi-transparent rect along the top
              edge so the screen reads as a CRT/LCD rather than flat fill. */}
          <View style={s.screenGlare} />
        </View>
      </View>

      {/* Control strip — card readers + start buttons */}
      <View style={s.controls}>
        <View style={s.cardReader} />
        <View style={s.startBtn} />
        <View style={[s.startBtn, { backgroundColor: '#1e3a8a' }]} />
        <View style={s.cardReader} />
      </View>

      {/* Pads — two side-by-side 5-panel pads, drawn as 3×3 micro-grids */}
      <View style={s.padArea}>
        <PadMini active={!!visiblePlayers[0]} />
        <PadMini active={!!visiblePlayers[1]} />
      </View>

      {mine ? (
        <View style={s.youTag}>
          <Text style={s.youTagText}>YOU&apos;RE HERE</Text>
        </View>
      ) : null}
    </View>
  );
}

function PlayerHead({ player, accent }: { player: ActiveCheckin; accent: string }) {
  const s = useThemedStyles(makeStyles);
  const url = player.avatar ? fullImageUrl(String(player.avatar)) : undefined;
  return (
    <View style={[s.headFrame, { borderColor: accent }]}>
      {url ? (
        <Image source={{ uri: url }} style={s.headImg} contentFit="cover" />
      ) : (
        <DefaultAvatar size={28} />
      )}
    </View>
  );
}

/**
 * Mini 3×3 representation of a single PIU pad. The four diagonals are the
 * stomp panels (blue corners, red opposite-corners is unconventional but
 * keeps the contrast readable at this size), centre is yellow. Non-panel
 * cells stay dim.
 *
 * `active` adds a subtle glow under the pad so an in-use cabinet reads
 * even when the player avatar is small.
 */
function PadMini({ active }: { active: boolean }) {
  const s = useThemedStyles(makeStyles);
  // 9-cell pattern: TL TC TR / ML MC MR / BL BC BR.
  // Pad panels are at indices 0, 2, 4 (center), 6, 8.
  const cells = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const isPanel = (i: number) => i === 0 || i === 2 || i === 4 || i === 6 || i === 8;
  // Match PIU's stage colors: TL/BR blue, TR/BL red, centre yellow.
  const panelColor = (i: number): string => {
    if (i === 4) return '#fbbf24';
    if (i === 0 || i === 8) return '#1d4ed8';
    if (i === 2 || i === 6) return '#dc2626';
    return 'transparent';
  };
  return (
    <View style={[s.pad, active && s.padActive]}>
      {cells.map((i) => (
        <View
          key={i}
          style={[
            s.padCell,
            isPanel(i) && { backgroundColor: panelColor(i) },
          ]}
        />
      ))}
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  // ── Cabinet shell ─────────────────────────────────────────────
  cab: {
    aspectRatio: 0.85, // taller than wide, matches a real PIU cab
    borderRadius: 10,
    overflow: 'hidden' as const,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    padding: 6,
    gap: 4,
    position: 'relative' as const,
  },
  cabMine: {
    borderColor: '#6ee7b7',
    borderWidth: 2,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },

  // ── Marquee strip (cabinet header) ────────────────────────────
  marquee: {
    height: 16,
    borderRadius: 4,
    backgroundColor: '#1e293b',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(148, 163, 184, 0.3)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  },
  marqueeGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(244, 114, 182, 0.12)',
  },
  marqueeText: {
    fontSize: 9,
    fontWeight: '900' as const,
    color: '#fde68a',
    letterSpacing: 1.2,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },

  // ── Screen ────────────────────────────────────────────────────
  screenBezel: {
    backgroundColor: '#020617',
    padding: 3,
    borderRadius: 4,
    flexGrow: 1, // takes the bulk of the cabinet vertical space
  },
  screen: {
    flex: 1,
    borderRadius: 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
    position: 'relative' as const,
  },
  screenIdle: {
    backgroundColor: '#1e1b4b',
  },
  screenOn: {
    backgroundColor: '#312e81',
  },
  screenGlare: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  idleLogo: {
    fontSize: 9,
    fontWeight: '900' as const,
    color: 'rgba(252, 211, 77, 0.55)',
    letterSpacing: 1.4,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  avatarRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 4,
  },
  headFrame: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    overflow: 'hidden' as const,
    backgroundColor: t.surfaceMuted,
  },
  headImg: {
    width: '100%' as const,
    height: '100%' as const,
  },
  extraBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  extraBadgeText: { fontSize: 9, fontWeight: '900' as const },

  // ── Control strip (card readers / start buttons) ──────────────
  controls: {
    height: 10,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-around' as const,
    gap: 3,
  },
  cardReader: {
    flex: 1.2,
    height: 6,
    borderRadius: 2,
    backgroundColor: '#1e293b',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(148, 163, 184, 0.3)',
  },
  startBtn: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#7f1d1d',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(248, 113, 113, 0.5)',
  },

  // ── Pad area ──────────────────────────────────────────────────
  padArea: {
    flexDirection: 'row' as const,
    gap: 6,
    height: 36,
    alignItems: 'flex-end' as const,
    justifyContent: 'center' as const,
  },
  pad: {
    flex: 1,
    aspectRatio: 1,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    padding: 1,
    borderRadius: 3,
    backgroundColor: '#0b0f1a',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    maxWidth: 60,
  },
  padActive: {
    borderColor: 'rgba(110, 231, 183, 0.6)',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  padCell: {
    width: '33.33%' as const,
    height: '33.33%' as const,
    borderRadius: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
  },

  // ── "You're here" ribbon ──────────────────────────────────────
  youTag: {
    position: 'absolute' as const,
    bottom: 2,
    left: 2,
    right: 2,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.85)',
    alignItems: 'center' as const,
  },
  youTagText: {
    fontSize: 8,
    fontWeight: '900' as const,
    color: '#022c22',
    letterSpacing: 1,
  },
});
