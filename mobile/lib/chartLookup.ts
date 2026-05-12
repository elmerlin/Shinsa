/**
 * Resolve a feed entry's `(song_title, mode, level)` to a chart_id using the
 * cached songs library. Used as a fallback when the server-side enrichment
 * doesn't populate `chart_id` directly (typically for Korean-language entries
 * whose alias resolution missed).
 */

import { toCanonicalSongTitle } from './songAliases';
import type { SongLibraryItem, SongLibraryResponse } from '@shared/api';

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function findChartIdInLibrary(
  library: SongLibraryResponse | undefined | null,
  title: string,
  mode: string | undefined,
  level: number | string | undefined,
): number {
  if (!library?.songs?.length) return 0;

  const wantedTitleCanonical = normalize(toCanonicalSongTitle(title));
  if (!wantedTitleCanonical) return 0;
  const wantedMode = String(mode || '').trim();
  const wantedLevel = parseInt(String(level ?? ''), 10) || 0;
  if (!wantedMode || !wantedLevel) return 0;

  const matchSong = (song: SongLibraryItem): boolean => {
    const canonical = normalize(toCanonicalSongTitle(song.title || ''));
    return canonical === wantedTitleCanonical;
  };

  for (const song of library.songs) {
    if (!matchSong(song)) continue;
    for (const chart of song.charts) {
      if (chart.mode !== wantedMode) continue;
      if ((chart.level ?? 0) !== wantedLevel) continue;
      const id = Number(chart.chart_id) || 0;
      if (id) return id;
    }
  }
  return 0;
}
