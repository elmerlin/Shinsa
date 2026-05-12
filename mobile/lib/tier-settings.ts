import { useEffect, useRef, useState } from 'react';
import { prefs } from '@/lib/storage';

/**
 * User-tunable preferences for the Tiers screen. Persisted to the same
 * storage backend as the auth token (SecureStore on native, localStorage
 * on web) so they survive across launches and reinstalls of the app.
 */
export type TierDisplayMode = 'grade' | 'score';
export type TierMode = 'Single' | 'Double' | 'CoOp';

export interface TierSettings {
  /** Show grade letters (SSS+, A, etc.) or numeric score (98.5) on plates. */
  displayMode: TierDisplayMode;
  /** Show charts the user hasn't passed yet. Off = only show passed plays. */
  showUnplayed: boolean;
  /** Show tier sections that have zero charts after filtering. */
  showEmptyTiers: boolean;
  /** Show Co-op charts in the mode picker. Defaults true now that Co-op
   *  scores are tracked end-to-end (server gates dropped, badges fixed). */
  showCoOp: boolean;
  /** Grid density. 4 = chunky, 5 = balanced, 6 = compact. */
  songsPerRow: 4 | 5 | 6;
  /** Jacket image visibility behind the grade overlay (0-100). */
  jacketOpacity: number;
  /** Width % the chunky grade letters span across each jacket (20-100).
   *  Mirrors the web's `tiers_overlay_size` slider. Lower values shrink the
   *  letters so more of the jacket art is visible. */
  overlaySize: number;
  /** Mode the picker lands on the first time the user opens Tiers. */
  defaultMode: TierMode;
  /** Last viewed mode + level — used to restore between sessions. */
  lastMode: TierMode | null;
  lastLevel: number | null;
}

export const DEFAULT_TIER_SETTINGS: TierSettings = {
  displayMode: 'grade',
  showUnplayed: true,
  showEmptyTiers: false,
  showCoOp: true,
  songsPerRow: 5,
  jacketOpacity: 55,
  overlaySize: 78,
  defaultMode: 'Double',
  lastMode: null,
  lastLevel: null,
};

const STORAGE_KEY = 'shinsa.tier.settings.v1';

function clampOpacity(value: number): number {
  return Math.min(100, Math.max(10, Math.round(value)));
}

/** Web mirror: `tiers_overlay_size` clamps to 20-100 with a default of 78. */
function clampOverlaySize(value: unknown): number {
  const parsed = typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value)
    : DEFAULT_TIER_SETTINGS.overlaySize;
  return Math.min(100, Math.max(20, parsed));
}

function sanitize(raw: unknown): TierSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_TIER_SETTINGS;
  const r = raw as Record<string, unknown>;
  const songsPerRow = ([4, 5, 6] as const).includes(r.songsPerRow as 4)
    ? (r.songsPerRow as 4 | 5 | 6)
    : DEFAULT_TIER_SETTINGS.songsPerRow;
  const displayMode: TierDisplayMode = r.displayMode === 'score' ? 'score' : 'grade';
  const defaultMode: TierMode = r.defaultMode === 'Single' || r.defaultMode === 'CoOp'
    ? r.defaultMode
    : 'Double';
  const lastMode = r.lastMode === 'Single' || r.lastMode === 'Double' || r.lastMode === 'CoOp' ? r.lastMode : null;
  const lastLevel = typeof r.lastLevel === 'number' && Number.isFinite(r.lastLevel) ? r.lastLevel : null;
  // Migrate old `hideCoOp: true` (the historical default) to the new
  // `showCoOp` flag. Old saved blobs without `showCoOp` get the new default
  // (true = visible) since Co-op is now a first-class tier mode.
  const legacyHideCoOp = r.hideCoOp === true;
  const showCoOp = typeof r.showCoOp === 'boolean'
    ? r.showCoOp
    : (legacyHideCoOp ? false : DEFAULT_TIER_SETTINGS.showCoOp);
  return {
    displayMode,
    showUnplayed: r.showUnplayed !== false,
    showEmptyTiers: r.showEmptyTiers === true,
    showCoOp,
    songsPerRow,
    jacketOpacity: typeof r.jacketOpacity === 'number' ? clampOpacity(r.jacketOpacity) : DEFAULT_TIER_SETTINGS.jacketOpacity,
    overlaySize: clampOverlaySize(r.overlaySize),
    defaultMode,
    lastMode,
    lastLevel,
  };
}

/**
 * Load tier settings on mount, expose an updater that writes back to
 * storage automatically. Updates are debounced 300ms so flipping multiple
 * toggles in quick succession only writes once.
 */
export function useTierSettings() {
  const [settings, setSettings] = useState<TierSettings>(DEFAULT_TIER_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    prefs.get(STORAGE_KEY).then((value) => {
      if (!alive || !value) {
        setHydrated(true);
        return;
      }
      try {
        setSettings(sanitize(JSON.parse(value)));
      } catch {
        // Corrupt blob — fall back to defaults silently.
      } finally {
        setHydrated(true);
      }
    }).catch(() => {
      if (alive) setHydrated(true);
    });
    return () => { alive = false; };
  }, []);

  const update = (patch: Partial<TierSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => {
        prefs.set(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      }, 300);
      return next;
    });
  };

  return { settings, update, hydrated };
}
