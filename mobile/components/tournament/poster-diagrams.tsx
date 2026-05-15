import { Image } from 'expo-image';
import { View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { fullImageUrl } from '@/lib/images';
import type { Player } from '@shared/api';

/** Per-format color palette used by the poster diagrams + section borders.
 *  Mirrors FORMAT_COLORS in client/src/pages/TournamentPoster.jsx. */
export const FORMAT_COLOR: Record<string, { accent: string; tint: string }> = {
  round_robin: { accent: '#38bdf8', tint: 'rgba(56, 189, 248, 0.12)' },
  pools: { accent: '#22d3ee', tint: 'rgba(34, 211, 238, 0.12)' },
  single_elim: { accent: '#facc15', tint: 'rgba(250, 204, 21, 0.12)' },
  double_elim: { accent: '#fbbf24', tint: 'rgba(251, 191, 36, 0.12)' },
  gauntlet: { accent: '#ff3366', tint: 'rgba(255, 51, 102, 0.12)' },
  hour_of_power: { accent: '#34d399', tint: 'rgba(52, 211, 153, 0.12)' },
  b15: { accent: '#a78bfa', tint: 'rgba(167, 139, 250, 0.12)' },
};

export function getFormatColor(format: string): { accent: string; tint: string } {
  return FORMAT_COLOR[format] || FORMAT_COLOR.round_robin;
}

interface PlayerNodeProps {
  cx: number;
  cy: number;
  r: number;
  player?: Partial<Player>;
  accent: string;
}

/** Avatar circle inside an SVG diagram. Falls back to the player's
 *  initial when no avatar is set. */
function PlayerNode({ cx, cy, r, player, accent }: PlayerNodeProps) {
  const avatarUrl = typeof player?.avatar === 'string' && player.avatar ? fullImageUrl(player.avatar) : null;
  const initial = String(player?.name || '?').charAt(0).toUpperCase();
  const clipId = `clip-${cx}-${cy}-${player?.id || initial}`;
  return (
    <G>
      <Defs>
        <ClipPath id={clipId}>
          <Circle cx={cx} cy={cy} r={r} />
        </ClipPath>
      </Defs>
      <Circle cx={cx} cy={cy} r={r} fill={`${accent}26`} stroke={accent} strokeWidth={1.5} opacity={0.7} />
      {avatarUrl ? (
        <SvgImage cx={cx} cy={cy} r={r} href={avatarUrl} clipId={clipId} />
      ) : (
        <SvgText
          x={cx}
          y={cy + r * 0.32}
          textAnchor="middle"
          fill={accent}
          fontSize={r * 0.9}
          fontWeight="bold">
          {initial}
        </SvgText>
      )}
    </G>
  );
}

// react-native-svg's Image component is exported but typings can be flaky
// across versions; wrap as a plain SVG image element so we type it locally.
function SvgImage({ cx, cy, r, href, clipId }: { cx: number; cy: number; r: number; href: string; clipId: string }) {
  // Re-export as a typed element via a constant cast — RN-Web renders this
  // through the underlying <image> SVG tag with `href`, which is what we
  // need for cross-origin avatars.
  const ImageEl: React.ComponentType<Record<string, unknown>> = (require('react-native-svg').Image as React.ComponentType<Record<string, unknown>>);
  return (
    <ImageEl
      href={href}
      x={cx - r}
      y={cy - r}
      width={r * 2}
      height={r * 2}
      clipPath={`url(#${clipId})`}
      preserveAspectRatio="xMidYMid slice"
    />
  );
}

// ─── Round Robin diagram ──────────────────────────────────────────────────

export function RoundRobinDiagram({ players }: { players: Player[] }) {
  const accent = FORMAT_COLOR.round_robin.accent;
  const visible = players.slice(0, 8);
  const n = visible.length || 6;
  const size = 240;
  const center = size / 2;
  const r = 92;
  const nodeR = 16;
  const positions = Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: center + Math.cos(angle) * r, y: center + Math.sin(angle) * r };
  });

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Every player plays every other — render every pair line at low
          opacity so the "everyone vs everyone" mesh comes through. */}
      {positions.map((p, i) =>
        positions.slice(i + 1).map((q, j) => (
          <Line
            key={`l-${i}-${j}`}
            x1={p.x}
            y1={p.y}
            x2={q.x}
            y2={q.y}
            stroke={accent}
            strokeWidth={1}
            opacity={0.18}
          />
        )),
      )}
      {positions.map((p, i) => (
        <PlayerNode
          key={`n-${i}`}
          cx={p.x}
          cy={p.y}
          r={nodeR}
          player={visible[i] || { name: `P${i + 1}` }}
          accent={accent}
        />
      ))}
    </Svg>
  );
}

// ─── Gauntlet diagram ─────────────────────────────────────────────────────

export function GauntletDiagram({ players }: { players: Player[] }) {
  const accent = FORMAT_COLOR.gauntlet.accent;
  // Rendered top-down: champion at the top, climbing from the bottom. We
  // show up to 6 rungs (7 players) which is the desktop default visual.
  const visible = players.slice(0, 7);
  const n = Math.max(visible.length, 4);
  const stepH = 42;
  const totalH = (n - 1) * stepH + 70;
  const width = 240;
  const cx = width / 2;
  const nodeR = 14;
  const positions = Array.from({ length: n }, (_, i) => ({
    x: cx,
    y: 24 + i * stepH,
  }));

  return (
    <Svg width={width} height={totalH} viewBox={`0 0 ${width} ${totalH}`}>
      {/* Spine */}
      <Line x1={cx} y1={positions[0].y} x2={cx} y2={positions[n - 1].y} stroke={accent} strokeOpacity={0.25} strokeWidth={2} />
      {positions.map((p, i) => (
        <G key={`r-${i}`}>
          <Line x1={cx - 18} y1={p.y} x2={cx + 18} y2={p.y} stroke={accent} strokeOpacity={0.35} strokeWidth={1.5} />
          <PlayerNode cx={p.x} cy={p.y} r={nodeR} player={visible[i] || { name: `#${n - i}` }} accent={accent} />
          {i === 0 ? (
            <SvgText x={cx + 28} y={p.y + 4} fill={accent} fontSize={10} fontWeight="bold">FINAL</SvgText>
          ) : (
            <SvgText x={cx + 28} y={p.y + 4} fill={`${accent}aa`} fontSize={9} fontWeight="bold">#{n - i}</SvgText>
          )}
        </G>
      ))}
    </Svg>
  );
}

// ─── Single-elim bracket diagram ──────────────────────────────────────────

export function BracketDiagram({ players, double = false }: { players: Player[]; double?: boolean }) {
  const accent = (double ? FORMAT_COLOR.double_elim : FORMAT_COLOR.single_elim).accent;
  // Pad / cap to 8 slots so the bracket renders consistently regardless
  // of the actual entrant count.
  const slots: (Player | { name: string })[] = [];
  for (let i = 0; i < 8; i++) slots.push(players[i] || { name: `S${i + 1}` });
  const width = 260;
  const height = 220;
  const nodeR = 9;

  // Round 1: 8 players on the left (4 pairs)
  const r1 = slots.map((p, i) => ({ x: 30, y: 18 + i * 28, player: p }));
  // Round 2: 4 quarters
  const r2 = [0, 1, 2, 3].map((i) => ({
    x: 110,
    y: (r1[i * 2].y + r1[i * 2 + 1].y) / 2,
  }));
  // Round 3: 2 semis
  const r3 = [0, 1].map((i) => ({
    x: 180,
    y: (r2[i * 2].y + r2[i * 2 + 1].y) / 2,
  }));
  // Round 4: final
  const r4 = { x: 240, y: (r3[0].y + r3[1].y) / 2 };

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Connectors r1 → r2 */}
      {r1.map((p, i) => {
        const target = r2[Math.floor(i / 2)];
        return (
          <Line
            key={`c1-${i}`}
            x1={p.x + nodeR}
            y1={p.y}
            x2={target.x - 6}
            y2={target.y}
            stroke={accent}
            strokeOpacity={0.4}
            strokeWidth={1}
          />
        );
      })}
      {/* Connectors r2 → r3 */}
      {r2.map((p, i) => {
        const target = r3[Math.floor(i / 2)];
        return (
          <Line key={`c2-${i}`} x1={p.x + 6} y1={p.y} x2={target.x - 6} y2={target.y} stroke={accent} strokeOpacity={0.4} strokeWidth={1} />
        );
      })}
      {/* Connectors r3 → final */}
      {r3.map((p, i) => (
        <Line key={`c3-${i}`} x1={p.x + 6} y1={p.y} x2={r4.x - 6} y2={r4.y} stroke={accent} strokeOpacity={0.4} strokeWidth={1} />
      ))}
      {/* Player nodes */}
      {r1.map((p, i) => (
        <PlayerNode key={`n1-${i}`} cx={p.x} cy={p.y} r={nodeR} player={p.player as Player} accent={accent} />
      ))}
      {r2.map((p, i) => (
        <Circle key={`n2-${i}`} cx={p.x} cy={p.y} r={5} fill={accent} fillOpacity={0.6} />
      ))}
      {r3.map((p, i) => (
        <Circle key={`n3-${i}`} cx={p.x} cy={p.y} r={5} fill={accent} fillOpacity={0.8} />
      ))}
      <Circle cx={r4.x} cy={r4.y} r={7} fill={accent} />
      <SvgText x={r4.x} y={r4.y - 14} textAnchor="middle" fill={accent} fontSize={9} fontWeight="bold">
        {double ? 'GRAND' : 'FINAL'}
      </SvgText>
    </Svg>
  );
}

// ─── Pools diagram ────────────────────────────────────────────────────────

export function PoolsDiagram({ players, poolCount = 4 }: { players: Player[]; poolCount?: number }) {
  const accent = FORMAT_COLOR.pools.accent;
  const cols = Math.min(poolCount, 4);
  const width = 240;
  const height = 200;
  const cellW = width / cols;
  const playersPerPool = Math.ceil(players.length / cols) || 4;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {Array.from({ length: cols }).map((_, c) => {
        const cx = cellW * (c + 0.5);
        const letter = String.fromCharCode(65 + c);
        return (
          <G key={`pool-${c}`}>
            <Rect
              x={cellW * c + 6}
              y={8}
              width={cellW - 12}
              height={height - 16}
              rx={10}
              ry={10}
              fill={`${accent}1a`}
              stroke={accent}
              strokeOpacity={0.4}
              strokeWidth={1}
            />
            <SvgText x={cx} y={28} textAnchor="middle" fill={accent} fontSize={11} fontWeight="bold">
              POOL {letter}
            </SvgText>
            {Array.from({ length: playersPerPool }).map((__, i) => {
              const idx = c * playersPerPool + i;
              const player = players[idx];
              const py = 50 + i * 30;
              if (py > height - 16) return null;
              return <PlayerNode key={`p-${c}-${i}`} cx={cx} cy={py} r={11} player={player || { name: `${letter}${i + 1}` }} accent={accent} />;
            })}
          </G>
        );
      })}
    </Svg>
  );
}

// ─── Generic clock / timed-session diagram ────────────────────────────────

export function TimedSessionDiagram({ format }: { format: string }) {
  const accent = (FORMAT_COLOR[format] || FORMAT_COLOR.hour_of_power).accent;
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const r = 70;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={cx} cy={cy} r={r} fill={`${accent}1a`} stroke={accent} strokeWidth={2} opacity={0.5} />
      <Circle cx={cx} cy={cy} r={r - 10} fill="transparent" stroke={accent} strokeWidth={1} strokeDasharray="4 6" opacity={0.5} />
      {/* Clock hands */}
      <Line x1={cx} y1={cy} x2={cx} y2={cy - r * 0.55} stroke={accent} strokeWidth={3} strokeLinecap="round" />
      <Line x1={cx} y1={cy} x2={cx + r * 0.4} y2={cy} stroke={accent} strokeWidth={2} strokeLinecap="round" opacity={0.7} />
      <Circle cx={cx} cy={cy} r={5} fill={accent} />
      <SvgText x={cx} y={cy + r + 22} textAnchor="middle" fill={accent} fontSize={11} fontWeight="bold">
        {format === 'b15' ? 'BEST 15' : 'TIMED SESSION'}
      </SvgText>
    </Svg>
  );
}

// ─── Format diagram dispatcher ────────────────────────────────────────────

export function FormatDiagram({
  format,
  players,
  config,
}: {
  format: string;
  players: Player[];
  config?: Record<string, unknown> | null;
}) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      {format === 'round_robin' && <RoundRobinDiagram players={players} />}
      {format === 'gauntlet' && <GauntletDiagram players={players} />}
      {format === 'single_elim' && <BracketDiagram players={players} />}
      {format === 'double_elim' && <BracketDiagram players={players} double />}
      {format === 'pools' && (
        <PoolsDiagram players={players} poolCount={Number(config?.pool_count) || 4} />
      )}
      {(format === 'hour_of_power' || format === 'b15') && (
        <TimedSessionDiagram format={format} />
      )}
    </View>
  );
}
