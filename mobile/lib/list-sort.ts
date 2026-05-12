import { prefs } from '@/lib/storage';
import type { UserListItem } from '@shared/api';

/**
 * Sort presets for items inside a single user list. Mirrors the dropdown
 * the web `ListsPage` exposes — keep the option set in sync if either side
 * changes so a user's saved preference picks up the same behaviour.
 */
export type ListItemSortKey =
  | 'custom'           // honour the saved sort_order from the server
  | 'incomplete'       // unfinished targets bubble to the top
  | 'closest'          // items closest to passing target by score
  | 'level_asc'
  | 'level_desc'
  | 'attempts_desc';   // most-attempted first

export const LIST_SORT_OPTIONS: { value: ListItemSortKey; label: string }[] = [
  { value: 'custom', label: 'Custom' },
  { value: 'incomplete', label: 'Incomplete first' },
  { value: 'closest', label: 'Closest to target' },
  { value: 'level_asc', label: 'Level ↑' },
  { value: 'level_desc', label: 'Level ↓' },
  { value: 'attempts_desc', label: 'Most attempts' },
];

const STORAGE_KEY = 'shinsa.list.sort.v1';

function isComplete(item: UserListItem): boolean {
  return item.passesSinceAdded > 0 || (item.hadPass && item.attempts === 0);
}

/**
 * Approximate "distance to target" — lower is closer. We use score gap to a
 * round target tier. Untracked targets land in the middle so they don't
 * dominate either end of the sort.
 */
function distanceToTarget(item: UserListItem): number {
  const target = String(item.target || 'PASS').toUpperCase();
  const score = item.originalScore || 0;
  const targetMin: Record<string, number> = {
    PASS: 0,
    A: 750000,
    AA: 900000,
    AAA: 950000,
    'S': 970000,
    'S+': 975000,
    'SS': 980000,
    'SS+': 985000,
    'SSS': 990000,
    'SSS+': 995000,
  };
  const min = targetMin[target] ?? 0;
  if (score >= min) return 0;
  return min - score;
}

export function sortListItems(items: UserListItem[], sort: ListItemSortKey): UserListItem[] {
  const out = [...items];
  switch (sort) {
    case 'incomplete':
      out.sort((a, b) => Number(isComplete(a)) - Number(isComplete(b)));
      break;
    case 'closest':
      // Incomplete-but-close first, then everything else.
      out.sort((a, b) => {
        const ac = isComplete(a), bc = isComplete(b);
        if (ac !== bc) return Number(ac) - Number(bc);
        return distanceToTarget(a) - distanceToTarget(b);
      });
      break;
    case 'level_asc':
      out.sort((a, b) => (a.level || 0) - (b.level || 0));
      break;
    case 'level_desc':
      out.sort((a, b) => (b.level || 0) - (a.level || 0));
      break;
    case 'attempts_desc':
      out.sort((a, b) => (b.attempts || 0) - (a.attempts || 0));
      break;
    case 'custom':
    default:
      out.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      break;
  }
  return out;
}

const VALID_KEYS = new Set<ListItemSortKey>(['custom', 'incomplete', 'closest', 'level_asc', 'level_desc', 'attempts_desc']);

export async function loadSortPref(): Promise<ListItemSortKey> {
  try {
    const raw = await prefs.get(STORAGE_KEY);
    if (raw && VALID_KEYS.has(raw as ListItemSortKey)) return raw as ListItemSortKey;
  } catch {
    // ignore — fall through to default
  }
  return 'custom';
}

export async function saveSortPref(value: ListItemSortKey): Promise<void> {
  await prefs.set(STORAGE_KEY, value).catch(() => {});
}
