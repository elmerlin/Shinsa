import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getSongLibrary,
  getUserLists,
  createList,
  deleteList,
  addListItem,
  removeListItem,
  updateListItemTarget,
  renameList,
  cloneList,
  reorderListItems,
  bulkAddListItems,
} from '../utils/api';

const LEGACY_LISTS_STORAGE_KEY = 'shinsa_lists';
const LEGACY_LISTS_MIGRATION_KEY = 'shinsa_lists_migrated_to_server_v1';

// ─── Grade thresholds (ascending) ─────────────────────────────────
const GRADE_THRESHOLDS = [
  { min: 0,      grade: 'F',    color: 'text-gray-600' },
  { min: 450000, grade: 'D',    color: 'text-gray-600' },
  { min: 550000, grade: 'C',    color: 'text-gray-500' },
  { min: 650000, grade: 'B',    color: 'text-gray-500' },
  { min: 750000, grade: 'A',    color: 'text-amber-700' },
  { min: 825000, grade: 'A+',   color: 'text-amber-700' },
  { min: 900000, grade: 'AA',   color: 'text-piu-bronze' },
  { min: 925000, grade: 'AA+',  color: 'text-piu-bronze' },
  { min: 950000, grade: 'AAA',  color: 'text-gray-300' },
  { min: 960000, grade: 'AAA+', color: 'text-piu-silver' },
  { min: 970000, grade: 'S',    color: 'text-amber-500' },
  { min: 975000, grade: 'S+',   color: 'text-amber-400' },
  { min: 980000, grade: 'SS',   color: 'text-yellow-400' },
  { min: 985000, grade: 'SS+',  color: 'text-piu-gold' },
  { min: 990000, grade: 'SSS',  color: 'text-sky-400' },
  { min: 995000, grade: 'SSS+', color: 'text-sky-300' },
];

function gradeFromScore(score) {
  const s = parseInt(score, 10) || 0;
  for (let i = GRADE_THRESHOLDS.length - 1; i >= 0; i--) {
    if (s >= GRADE_THRESHOLDS[i].min) return GRADE_THRESHOLDS[i];
  }
  return GRADE_THRESHOLDS[0];
}

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function loadLegacyLists() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LEGACY_LISTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function normalizeLegacyItem(rawItem) {
  const chartId = String(rawItem?.chartId || '').trim();
  const songTitle = String(rawItem?.songTitle || '').trim();
  const mode = String(rawItem?.mode || '').trim();
  const level = parseInt(rawItem?.level, 10) || 0;
  if (!chartId || !songTitle || !mode || !level) return null;

  return {
    chartId,
    songTitle,
    artist: String(rawItem?.artist || ''),
    mode,
    level,
    jacketUrl: String(rawItem?.jacketUrl || ''),
    originalScore: parseInt(rawItem?.originalScore, 10) || 0,
    originalGrade: String(rawItem?.originalGrade || ''),
    hadPass: !!rawItem?.hadPass,
    target: String(rawItem?.target || 'PASS') || 'PASS',
    addedAt: parseInt(rawItem?.addedAt, 10) || Date.now(),
  };
}

async function migrateLegacyListsToServer(existingServerLists = []) {
  if (typeof window === 'undefined') return { importedLists: 0, importedItems: 0 };
  if (window.localStorage.getItem(LEGACY_LISTS_MIGRATION_KEY)) {
    return { importedLists: 0, importedItems: 0 };
  }

  const legacyLists = loadLegacyLists();
  if (legacyLists.length === 0) return { importedLists: 0, importedItems: 0 };

  const existingNames = new Set(
    (Array.isArray(existingServerLists) ? existingServerLists : [])
      .map((list) => String(list?.name || '').trim().toLowerCase())
      .filter(Boolean),
  );

  let importedLists = 0;
  let importedItems = 0;

  for (const rawList of legacyLists) {
    const name = String(rawList?.name || '').trim();
    if (!name) continue;
    if (existingNames.has(name.toLowerCase())) continue;
    const created = await createList(name);
    importedLists++;
    existingNames.add(name.toLowerCase());

    const items = Array.isArray(rawList?.items) ? rawList.items : [];
    for (const rawItem of items) {
      const itemData = normalizeLegacyItem(rawItem);
      if (!itemData) continue;
      try {
        await addListItem(created.id, itemData);
        importedItems++;
      } catch {
        // Ignore invalid/duplicate items but continue importing.
      }
    }
  }

  window.localStorage.setItem(LEGACY_LISTS_MIGRATION_KEY, String(Date.now()));
  return { importedLists, importedItems };
}

// ─── Compute live stats for a list given current library data ──────
function computeListStats(list, libraryMap) {
  const items = list.items || [];
  if (items.length === 0) return { songCount: 0, completed: 0, pct: 0, avgLevel: 0, avgTargetScore: 0, totalAttempts: 0 };

  let completed = 0;
  let totalLevel = 0;
  let totalTargetScore = 0;
  let totalAttempts = 0;

  for (const item of items) {
    totalLevel += item.level || 0;
    totalAttempts += item.attempts || 0;
    const targetScore = getTargetMinScore(item.target);
    totalTargetScore += targetScore;

    const live = libraryMap[item.chartId];
    if (live) {
      const liveScore = parseInt(live.best_score, 10) || 0;
      if (item.target === 'PASS') {
        if (live.is_pass) completed++;
      } else if (liveScore >= targetScore) {
        completed++;
      }
    }
  }

  return {
    songCount: items.length,
    completed,
    pct: items.length > 0 ? Math.round((completed / items.length) * 100) : 0,
    avgLevel: items.length > 0 ? Math.round(totalLevel / items.length) : 0,
    avgTargetScore: items.length > 0 ? Math.round(totalTargetScore / items.length) : 0,
    totalAttempts,
  };
}

function getTargetMinScore(target) {
  if (!target || target === 'PASS') return 0;
  const entry = GRADE_THRESHOLDS.find(g => g.grade === target);
  return entry?.min || 0;
}

function isItemComplete(item, libraryMap) {
  const live = libraryMap[item.chartId];
  if (!live) return false;
  const liveScore = parseInt(live.best_score, 10) || 0;
  if (item.target === 'PASS') return !!live.is_pass;
  return liveScore >= getTargetMinScore(item.target);
}

function getProgressToTarget(item, libraryMap) {
  const live = libraryMap[item.chartId];
  const liveScore = live ? (parseInt(live.best_score, 10) || 0) : (parseInt(item.originalScore, 10) || 0);
  if (item.target === 'PASS') return live?.is_pass ? 1 : 0;
  const targetMin = getTargetMinScore(item.target);
  if (targetMin <= 0) return 0;
  return Math.min(1, liveScore / targetMin);
}

// Returns the grade options available above the user's current grade
function getTargetOptions(currentScore, hasPass) {
  const options = [];

  if (!hasPass) {
    options.push({ value: 'PASS', label: 'Pass' });
    return options;
  }

  options.push({ value: 'PASS', label: 'Pass' });

  const s = parseInt(currentScore, 10) || 0;
  const currentGrade = gradeFromScore(s);
  const currentIdx = GRADE_THRESHOLDS.indexOf(currentGrade);

  for (let i = currentIdx + 1; i < GRADE_THRESHOLDS.length; i++) {
    const g = GRADE_THRESHOLDS[i];
    options.push({ value: g.grade, label: `${g.grade} (${formatNumber(g.min)}+)` });
  }

  return options;
}

// Sort options
const SORT_OPTIONS = [
  { value: 'custom', label: 'Custom order' },
  { value: 'incomplete', label: 'Incomplete first' },
  { value: 'closest', label: 'Closest to target' },
  { value: 'level-asc', label: 'Level (low to high)' },
  { value: 'level-desc', label: 'Level (high to low)' },
  { value: 'attempts-desc', label: 'Most attempts' },
];

function sortItems(items, sortBy, libraryMap) {
  if (sortBy === 'custom') return items;
  const sorted = [...items];
  switch (sortBy) {
    case 'incomplete':
      sorted.sort((a, b) => {
        const ac = isItemComplete(a, libraryMap) ? 1 : 0;
        const bc = isItemComplete(b, libraryMap) ? 1 : 0;
        return ac - bc;
      });
      break;
    case 'closest':
      sorted.sort((a, b) => {
        const ac = isItemComplete(a, libraryMap);
        const bc = isItemComplete(b, libraryMap);
        if (ac !== bc) return ac ? 1 : -1;
        return getProgressToTarget(b, libraryMap) - getProgressToTarget(a, libraryMap);
      });
      break;
    case 'level-asc':
      sorted.sort((a, b) => (a.level || 0) - (b.level || 0));
      break;
    case 'level-desc':
      sorted.sort((a, b) => (b.level || 0) - (a.level || 0));
      break;
    case 'attempts-desc':
      sorted.sort((a, b) => (b.attempts || 0) - (a.attempts || 0));
      break;
    default:
      break;
  }
  return sorted;
}

// Suggest next tier of targets for a completed list
function suggestNextTargets(items, libraryMap) {
  const suggestions = [];
  for (const item of items) {
    if (!isItemComplete(item, libraryMap)) continue;
    const live = libraryMap[item.chartId];
    if (!live) continue;
    const liveScore = parseInt(live.best_score, 10) || 0;
    const livePass = !!live.is_pass;
    if (item.target === 'PASS' && livePass) {
      // Suggest first grade above current score
      const currentGrade = gradeFromScore(liveScore);
      const currentIdx = GRADE_THRESHOLDS.indexOf(currentGrade);
      if (currentIdx >= 0 && currentIdx < GRADE_THRESHOLDS.length - 1) {
        suggestions.push({ itemId: item.id, target: GRADE_THRESHOLDS[currentIdx + 1].grade });
      }
    } else {
      // Suggest next grade up
      const currentTarget = GRADE_THRESHOLDS.find(g => g.grade === item.target);
      if (currentTarget) {
        const idx = GRADE_THRESHOLDS.indexOf(currentTarget);
        if (idx >= 0 && idx < GRADE_THRESHOLDS.length - 1) {
          suggestions.push({ itemId: item.id, target: GRADE_THRESHOLDS[idx + 1].grade });
        }
      }
    }
  }
  return suggestions;
}

// ─── Main Component ────────────────────────────────────────────────
export default function ListsPage() {
  const { user } = useAuth();

  const [lists, setLists] = useState([]);
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedListId, setExpandedListId] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('lists_expanded_id')); } catch { return null; }
  });
  const [newListName, setNewListName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [undoState, setUndoState] = useState(null); // { listId, item, timerId }
  const [migrationNotice, setMigrationNotice] = useState('');

  // Persist expanded list id
  useEffect(() => {
    if (expandedListId != null) {
      sessionStorage.setItem('lists_expanded_id', JSON.stringify(expandedListId));
    } else {
      sessionStorage.removeItem('lists_expanded_id');
    }
  }, [expandedListId]);

  // Load song library + server-backed lists in parallel
  const loadData = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const [libraryData, listsData] = await Promise.all([
        getSongLibrary({ user_id: user.id }),
        getUserLists(),
      ]);
      setMigrationNotice('');
      setLibrary(Array.isArray(libraryData?.songs) ? libraryData.songs : []);
      const serverLists = Array.isArray(listsData?.lists) ? listsData.lists : [];
      setLists(serverLists);

      // One-time migration path for pre-server localStorage lists.
      const migration = await migrateLegacyListsToServer(serverLists);
      if (migration.importedLists > 0) {
        const refreshed = await getUserLists();
        setLists(Array.isArray(refreshed?.lists) ? refreshed.lists : []);
        setMigrationNotice(`Imported ${migration.importedLists} list${migration.importedLists === 1 ? '' : 's'} from browser storage (${migration.importedItems} item${migration.importedItems === 1 ? '' : 's'}).`);
      }
    } catch {
      setLibrary([]);
      setLists([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Build a map: chartId -> { score, is_pass, grade, ... }
  const libraryMap = useMemo(() => {
    const map = {};
    for (const song of library) {
      for (const chart of (song.charts || [])) {
        map[chart.chart_id] = {
          ...chart,
          songTitle: song.title,
          artist: song.artist,
          jacketUrl: song.jacket_url,
        };
      }
    }
    return map;
  }, [library]);

  const handleCreateList = async () => {
    const name = newListName.trim();
    if (!name) return;
    try {
      const newList = await createList(name);
      setLists(prev => [...prev, { ...newList, items: newList.items || [] }]);
      setNewListName('');
      setShowCreateForm(false);
      setExpandedListId(newList.id);
    } catch { /* ignore */ }
  };

  const handleDeleteList = async (listId) => {
    if (!confirm('Delete this list? This cannot be undone.')) return;
    try {
      await deleteList(listId);
      setLists(prev => prev.filter(l => l.id !== listId));
      if (expandedListId === listId) setExpandedListId(null);
    } catch { /* ignore */ }
  };

  const handleRenameList = async (listId, name) => {
    try {
      await renameList(listId, name);
      setLists(prev => prev.map(l => l.id === listId ? { ...l, name } : l));
    } catch { /* ignore */ }
  };

  const handleCloneList = async (listId) => {
    try {
      const result = await cloneList(listId);
      // Refetch to get items with attempt counts
      const listsData = await getUserLists();
      setLists(Array.isArray(listsData?.lists) ? listsData.lists : []);
      setExpandedListId(result.id);
    } catch { /* ignore */ }
  };

  const handleAddChart = async (listId, chart, song) => {
    const list = lists.find(l => l.id === listId);
    if (!list) return;
    if ((list.items || []).some(i => i.chartId === chart.chart_id)) return;

    const currentScore = parseInt(chart.best_score, 10) || 0;
    const currentGrade = gradeFromScore(currentScore).grade;
    const hasPass = !!chart.is_pass;

    let defaultTarget = 'PASS';
    if (hasPass && currentScore > 0) {
      const currentIdx = GRADE_THRESHOLDS.findIndex(g => g.grade === currentGrade);
      if (currentIdx >= 0 && currentIdx < GRADE_THRESHOLDS.length - 1) {
        defaultTarget = GRADE_THRESHOLDS[currentIdx + 1].grade;
      } else if (currentIdx === GRADE_THRESHOLDS.length - 1) {
        defaultTarget = currentGrade;
      }
    }

    const itemData = {
      chartId: chart.chart_id,
      songTitle: song.title,
      artist: song.artist || '',
      mode: chart.mode,
      level: chart.level,
      jacketUrl: song.jacket_url || '',
      originalScore: currentScore,
      originalGrade: currentGrade,
      hadPass: hasPass,
      target: defaultTarget,
      addedAt: Date.now(),
    };

    try {
      const result = await addListItem(listId, itemData);
      setLists(prev => prev.map(l => {
        if (l.id !== listId) return l;
        return { ...l, items: [...(l.items || []), { ...itemData, id: result.id, sortOrder: result.sortOrder || 0, attempts: 0 }] };
      }));
    } catch { /* ignore */ }
  };

  const handleBulkAdd = async (listId, chartsAndSongs) => {
    const list = lists.find(l => l.id === listId);
    if (!list) return;
    const existingIds = new Set((list.items || []).map(i => i.chartId));

    const itemsToAdd = chartsAndSongs
      .filter(({ chart }) => !existingIds.has(chart.chart_id))
      .map(({ chart, song }) => {
        const currentScore = parseInt(chart.best_score, 10) || 0;
        const currentGrade = gradeFromScore(currentScore).grade;
        const hasPass = !!chart.is_pass;
        let defaultTarget = 'PASS';
        if (hasPass && currentScore > 0) {
          const currentIdx = GRADE_THRESHOLDS.findIndex(g => g.grade === currentGrade);
          if (currentIdx >= 0 && currentIdx < GRADE_THRESHOLDS.length - 1) {
            defaultTarget = GRADE_THRESHOLDS[currentIdx + 1].grade;
          } else if (currentIdx === GRADE_THRESHOLDS.length - 1) {
            defaultTarget = currentGrade;
          }
        }
        return {
          chartId: chart.chart_id,
          songTitle: song.title,
          artist: song.artist || '',
          mode: chart.mode,
          level: chart.level,
          jacketUrl: song.jacket_url || '',
          originalScore: currentScore,
          originalGrade: currentGrade,
          hadPass: hasPass,
          target: defaultTarget,
          addedAt: Date.now(),
        };
      });

    if (itemsToAdd.length === 0) return;

    try {
      const result = await bulkAddListItems(listId, itemsToAdd);
      const addedMap = new Map((result.added || []).map(a => [a.chartId, a.id]));
      const newItems = itemsToAdd
        .filter(item => addedMap.has(item.chartId))
        .map(item => ({ ...item, id: addedMap.get(item.chartId), attempts: 0 }));
      setLists(prev => prev.map(l => {
        if (l.id !== listId) return l;
        return { ...l, items: [...(l.items || []), ...newItems] };
      }));
    } catch { /* ignore */ }
  };

  const handleRemoveChart = async (listId, itemId) => {
    // Find the item for undo
    const list = lists.find(l => l.id === listId);
    const removedItem = list?.items?.find(i => i.id === itemId);

    // Optimistic remove
    setLists(prev => prev.map(l => {
      if (l.id !== listId) return l;
      return { ...l, items: l.items.filter(i => i.id !== itemId) };
    }));

    // Clear any existing undo timer
    if (undoState?.timerId) clearTimeout(undoState.timerId);

    // Set undo state with a timer that actually deletes after 5 seconds
    const timerId = setTimeout(async () => {
      try {
        await removeListItem(listId, itemId);
      } catch { /* ignore */ }
      setUndoState(prev => prev?.item?.id === itemId ? null : prev);
    }, 5000);

    setUndoState({ listId, item: removedItem, timerId });
  };

  const handleUndoRemove = () => {
    if (!undoState) return;
    const { listId, item, timerId } = undoState;
    clearTimeout(timerId);
    // Restore item
    setLists(prev => prev.map(l => {
      if (l.id !== listId) return l;
      return { ...l, items: [...(l.items || []), item] };
    }));
    setUndoState(null);
  };

  const handleSetTarget = async (listId, itemId, target) => {
    setLists(prev => prev.map(l => {
      if (l.id !== listId) return l;
      return { ...l, items: l.items.map(i => i.id === itemId ? { ...i, target } : i) };
    }));
    try {
      await updateListItemTarget(listId, itemId, target);
    } catch { /* ignore */ }
  };

  const handleBumpAllTargets = async (listId, suggestions) => {
    // Optimistic update
    setLists(prev => prev.map(l => {
      if (l.id !== listId) return l;
      const sugMap = new Map(suggestions.map(s => [s.itemId, s.target]));
      return { ...l, items: l.items.map(i => sugMap.has(i.id) ? { ...i, target: sugMap.get(i.id) } : i) };
    }));
    // Fire updates
    for (const s of suggestions) {
      try { await updateListItemTarget(listId, s.itemId, s.target); } catch { /* ignore */ }
    }
  };

  const handleReorder = async (listId, newItemIds) => {
    // Optimistic reorder
    setLists(prev => prev.map(l => {
      if (l.id !== listId) return l;
      const itemMap = new Map(l.items.map(i => [i.id, i]));
      const reordered = newItemIds.map(id => itemMap.get(id)).filter(Boolean);
      return { ...l, items: reordered };
    }));
    try {
      await reorderListItems(listId, newItemIds);
    } catch { /* ignore */ }
  };

  const handleRefreshLists = async () => {
    try {
      const listsData = await getUserLists();
      setLists(Array.isArray(listsData?.lists) ? listsData.lists : []);
    } catch { /* ignore */ }
  };

  if (!user) {
    return <div className="max-w-6xl mx-auto px-4 py-10 text-center text-gray-500">Sign in to use Lists</div>;
  }

  if (loading) {
    return <div className="max-w-6xl mx-auto px-4 py-10 text-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-wide">LISTS</h1>
          <p className="text-xs text-gray-500">Create song lists with targets to track your progress</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefreshLists}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-piu-border/60 text-gray-400 hover:text-white hover:border-violet-400/50 transition-all"
            title="Refresh attempt counts"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-violet-500 to-purple-700 border border-violet-200/30 text-white font-display font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-violet-900/30 hover:brightness-110 transition-all whitespace-nowrap"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New List
          </button>
        </div>
      </div>

      {/* Create List Form */}
      {showCreateForm && (
        <div className="card border-violet-500/40">
          <h3 className="font-display font-bold text-sm mb-2">CREATE NEW LIST</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={newListName}
              onChange={e => setNewListName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateList()}
              placeholder="List name..."
              className="input-field flex-1"
              autoFocus
            />
            <button
              type="button"
              onClick={handleCreateList}
              disabled={!newListName.trim()}
              className="btn-primary px-4 text-sm disabled:opacity-40"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => { setShowCreateForm(false); setNewListName(''); }}
              className="text-gray-500 hover:text-white transition-colors px-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {migrationNotice && (
        <div className="rounded-xl border border-emerald-500/35 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-100">
          {migrationNotice}
        </div>
      )}

      {/* Undo Toast */}
      {undoState && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-piu-card border border-piu-border px-4 py-2.5 shadow-xl flex items-center gap-3 animate-fade-in">
          <span className="text-sm text-gray-200">Removed "{undoState.item?.songTitle}"</span>
          <button
            type="button"
            onClick={handleUndoRemove}
            className="text-sm font-display font-bold text-violet-400 hover:text-violet-300 transition-colors"
          >
            Undo
          </button>
        </div>
      )}

      {/* List Cards */}
      {lists.length === 0 && !showCreateForm && (
        <div className="text-center py-12">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 mx-auto text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <p className="text-gray-400">No lists yet</p>
          <p className="text-gray-600 mt-1 text-sm">Create your first list to start tracking targets</p>
        </div>
      )}

      <div className="space-y-3">
        {lists.map(list => {
          const stats = computeListStats(list, libraryMap);
          const isExpanded = expandedListId === list.id;

          return (
            <div key={list.id} className="rounded-xl border border-piu-border/60 bg-piu-card/70 overflow-hidden">
              {/* Card Header */}
              <button
                type="button"
                onClick={() => setExpandedListId(isExpanded ? null : list.id)}
                className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-piu-dark/30 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="font-display font-bold text-base truncate">{list.name}</h3>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                    <span className="text-[11px] text-gray-400">
                      <span className="text-white font-bold">{stats.songCount}</span> song{stats.songCount !== 1 ? 's' : ''}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      <span className={stats.pct === 100 ? 'text-emerald-400 font-bold' : 'text-white font-bold'}>{stats.pct}%</span> complete
                    </span>
                    {stats.songCount > 0 && (
                      <>
                        <span className="text-[11px] text-gray-400">
                          Avg Lv.<span className="text-white font-bold ml-0.5">{stats.avgLevel}</span>
                        </span>
                        {stats.avgTargetScore > 0 && (
                          <span className="text-[11px] text-gray-400">
                            Avg target <span className="text-white font-bold">{formatNumber(stats.avgTargetScore)}</span>
                          </span>
                        )}
                        {stats.totalAttempts > 0 && (
                          <span className="text-[11px] text-gray-400">
                            <span className="text-white font-bold">{stats.totalAttempts}</span> play{stats.totalAttempts !== 1 ? 's' : ''}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {/* Progress ring */}
                <div className="shrink-0 flex items-center gap-2">
                  {stats.songCount > 0 && (
                    <div className="relative w-10 h-10">
                      <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="3" />
                        <circle
                          cx="18" cy="18" r="15.5" fill="none"
                          stroke={stats.pct === 100 ? '#34d399' : '#8b5cf6'}
                          strokeWidth="3"
                          strokeDasharray={`${stats.pct * 0.975} 100`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-display font-bold">
                        {stats.pct}%
                      </span>
                    </div>
                  )}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded Detail */}
              {isExpanded && (
                <ListDetail
                  list={list}
                  library={library}
                  libraryMap={libraryMap}
                  stats={stats}
                  onAddChart={handleAddChart}
                  onBulkAdd={handleBulkAdd}
                  onRemoveChart={handleRemoveChart}
                  onSetTarget={handleSetTarget}
                  onDelete={() => handleDeleteList(list.id)}
                  onRename={(name) => handleRenameList(list.id, name)}
                  onClone={() => handleCloneList(list.id)}
                  onReorder={(ids) => handleReorder(list.id, ids)}
                  onBumpAllTargets={(suggestions) => handleBumpAllTargets(list.id, suggestions)}
                  onExport={() => exportList(list, libraryMap)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Export list as text to clipboard ──────────────────────────────
function exportList(list, libraryMap) {
  const stats = computeListStats(list, libraryMap);
  const lines = [`${list.name}`, `${stats.songCount} songs | ${stats.pct}% complete | ${stats.totalAttempts} plays`, ''];

  for (const item of (list.items || [])) {
    const live = libraryMap[item.chartId];
    const liveScore = live ? (parseInt(live.best_score, 10) || 0) : (parseInt(item.originalScore, 10) || 0);
    const complete = isItemComplete(item, libraryMap);
    const prefix = item.mode === 'Single' ? 'S' : 'D';
    const status = complete ? '[x]' : '[ ]';
    const scorePart = liveScore > 0 ? ` ${formatNumber(liveScore)}` : '';
    const targetPart = item.target === 'PASS' ? 'Pass' : item.target;
    lines.push(`${status} ${prefix}${item.level} ${item.songTitle}${scorePart} (target: ${targetPart})`);
  }

  const text = lines.join('\n');
  navigator.clipboard.writeText(text).catch(() => {});
}

// ─── List Detail (Expanded View) ───────────────────────────────────
function ListDetail({ list, library, libraryMap, stats, onAddChart, onBulkAdd, onRemoveChart, onSetTarget, onDelete, onRename, onClone, onReorder, onBumpAllTargets, onExport }) {
  const [search, setSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState(new Map()); // chartId -> { chart, song }
  const [sortBy, setSortBy] = useState('custom');
  const [filterText, setFilterText] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(list.name);
  const [dragItemId, setDragItemId] = useState(null);
  const [dragOverItemId, setDragOverItemId] = useState(null);
  const [showExportToast, setShowExportToast] = useState(false);
  const searchWrapRef = useRef(null);
  const renameInputRef = useRef(null);

  useEffect(() => {
    function handleDocClick(event) {
      if (!searchWrapRef.current) return;
      if (!searchWrapRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, []);

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  const filteredSongs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return library
      .map(song => {
        const songMatches = `${song.title} ${song.artist}`.toLowerCase().includes(q);
        const charts = (song.charts || []).filter(chart => {
          if (songMatches) return true;
          return `${chart.mode} ${chart.level}`.toLowerCase().includes(q);
        });
        if (!songMatches && charts.length === 0) return null;
        return { ...song, charts };
      })
      .filter(Boolean)
      .slice(0, 20);
  }, [library, search]);

  const existingChartIds = useMemo(() => {
    return new Set((list.items || []).map(i => i.chartId));
  }, [list.items]);

  // Apply sort + filter to items
  const displayedItems = useMemo(() => {
    let items = sortItems(list.items || [], sortBy, libraryMap);
    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      items = items.filter(item =>
        item.songTitle.toLowerCase().includes(q) ||
        `${item.mode} ${item.level}`.toLowerCase().includes(q)
      );
    }
    return items;
  }, [list.items, sortBy, filterText, libraryMap]);

  const suggestions = useMemo(() => suggestNextTargets(list.items || [], libraryMap), [list.items, libraryMap]);

  const handleSubmitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== list.name) {
      onRename(trimmed);
    }
    setIsRenaming(false);
  };

  const handleBulkToggle = (chart, song) => {
    setBulkSelected(prev => {
      const next = new Map(prev);
      if (next.has(chart.chart_id)) {
        next.delete(chart.chart_id);
      } else {
        next.set(chart.chart_id, { chart, song });
      }
      return next;
    });
  };

  const handleBulkSubmit = () => {
    if (bulkSelected.size === 0) return;
    onBulkAdd(list.id, Array.from(bulkSelected.values()));
    setBulkSelected(new Map());
    setBulkMode(false);
    setSearch('');
    setShowSuggestions(false);
  };

  // Drag and drop handlers
  const handleDragStart = (itemId) => {
    if (sortBy !== 'custom') return;
    setDragItemId(itemId);
  };

  const handleDragOver = (e, itemId) => {
    e.preventDefault();
    if (dragItemId == null || itemId === dragItemId) return;
    setDragOverItemId(itemId);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (dragItemId == null || dragOverItemId == null || dragItemId === dragOverItemId) {
      setDragItemId(null);
      setDragOverItemId(null);
      return;
    }
    const items = list.items || [];
    const ids = items.map(i => i.id);
    const fromIdx = ids.indexOf(dragItemId);
    const toIdx = ids.indexOf(dragOverItemId);
    if (fromIdx < 0 || toIdx < 0) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, dragItemId);
    onReorder(ids);
    setDragItemId(null);
    setDragOverItemId(null);
  };

  const handleDragEnd = () => {
    setDragItemId(null);
    setDragOverItemId(null);
  };

  const handleExport = () => {
    onExport();
    setShowExportToast(true);
    setTimeout(() => setShowExportToast(false), 2000);
  };

  return (
    <div className="border-t border-piu-border/40 px-4 py-3 space-y-3">
      {/* List actions bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {isRenaming ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmitRename(); if (e.key === 'Escape') setIsRenaming(false); }}
              onBlur={handleSubmitRename}
              className="input-field flex-1 text-sm py-1"
            />
          </div>
        ) : (
          <>
            <button onClick={() => { setRenameValue(list.name); setIsRenaming(true); }} className="text-[11px] text-gray-500 hover:text-white transition-colors" title="Rename list">
              Rename
            </button>
            <span className="text-gray-700">|</span>
            <button onClick={() => onClone()} className="text-[11px] text-gray-500 hover:text-white transition-colors" title="Duplicate list">
              Duplicate
            </button>
            <span className="text-gray-700">|</span>
            <button onClick={handleExport} className="text-[11px] text-gray-500 hover:text-white transition-colors" title="Copy list summary to clipboard">
              Export
            </button>
            {suggestions.length > 0 && (
              <>
                <span className="text-gray-700">|</span>
                <button
                  onClick={() => onBumpAllTargets(suggestions)}
                  className="text-[11px] text-violet-400 hover:text-violet-300 transition-colors"
                  title="Bump completed items to next grade target"
                >
                  Bump targets ({suggestions.length})
                </button>
              </>
            )}
          </>
        )}
      </div>

      {showExportToast && (
        <div className="rounded-lg bg-violet-600/90 text-white text-xs font-display px-3 py-1.5 inline-block">
          Copied to clipboard
        </div>
      )}

      {/* Search to add songs */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-display font-bold text-piu-accent">ADD SONGS</h4>
          <button
            type="button"
            onClick={() => { setBulkMode(!bulkMode); setBulkSelected(new Map()); }}
            className={`text-[11px] font-display transition-colors ${bulkMode ? 'text-violet-400' : 'text-gray-500 hover:text-white'}`}
          >
            {bulkMode ? 'Cancel bulk' : 'Bulk add'}
          </button>
        </div>
        <div ref={searchWrapRef} className="relative">
          <input
            value={search}
            onFocus={() => setShowSuggestions(true)}
            onChange={e => { setSearch(e.target.value); setShowSuggestions(true); }}
            placeholder="Search songs to add..."
            className="input-field w-full"
          />
          {showSuggestions && search.trim() && filteredSongs.length > 0 && (
            <div className="absolute z-20 top-full mt-1 w-full rounded-lg border border-piu-border bg-[#0b1324] shadow-xl overflow-hidden max-h-80 overflow-y-auto">
              {filteredSongs.map(song => (
                <div key={song.song_group_key} className="border-b border-piu-border/20 last:border-0">
                  <div className="px-3 py-2">
                    <p className="text-sm font-display font-bold truncate">{song.title}</p>
                    <p className="text-[11px] text-gray-500 truncate">{song.artist || 'Unknown artist'}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {song.charts.map(chart => {
                        const isSingle = chart.mode === 'Single';
                        const alreadyAdded = existingChartIds.has(chart.chart_id);
                        const isSelected = bulkSelected.has(chart.chart_id);
                        return (
                          <button
                            key={chart.chart_id}
                            type="button"
                            onClick={() => {
                              if (alreadyAdded) return;
                              if (bulkMode) {
                                handleBulkToggle(chart, song);
                              } else {
                                onAddChart(list.id, chart, song);
                                setSearch('');
                                setShowSuggestions(false);
                              }
                            }}
                            disabled={alreadyAdded}
                            className={`inline-flex items-center justify-center min-w-[38px] h-[38px] text-xs rounded-full border font-display font-black shadow-sm transition-all ${
                              alreadyAdded
                                ? 'opacity-30 cursor-not-allowed bg-gray-700 border-gray-600 text-gray-400'
                                : isSelected
                                  ? 'ring-2 ring-violet-400 bg-violet-600 border-violet-300/50 text-white'
                                  : isSingle
                                    ? 'bg-gradient-to-b from-red-500 to-red-700 border-red-300/50 text-white hover:brightness-110'
                                    : 'bg-gradient-to-b from-green-500 to-emerald-700 border-green-300/50 text-white hover:brightness-110'
                            }`}
                            title={alreadyAdded ? 'Already in list' : bulkMode ? (isSelected ? 'Deselect' : 'Select') : `Add ${isSingle ? 'S' : 'D'}${chart.level}`}
                          >
                            {chart.level}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
              {bulkMode && bulkSelected.size > 0 && (
                <div className="sticky bottom-0 bg-[#0b1324] border-t border-piu-border/40 px-3 py-2 flex items-center justify-between">
                  <span className="text-xs text-gray-400">{bulkSelected.size} selected</span>
                  <button
                    type="button"
                    onClick={handleBulkSubmit}
                    className="text-xs font-display font-bold text-violet-400 hover:text-violet-300"
                  >
                    Add all
                  </button>
                </div>
              )}
            </div>
          )}
          {showSuggestions && search.trim() && filteredSongs.length === 0 && (
            <div className="absolute z-20 top-full mt-1 w-full rounded-lg border border-piu-border bg-[#0b1324] shadow-xl p-3">
              <p className="text-sm text-gray-500 text-center">No songs found</p>
            </div>
          )}
        </div>
      </div>

      {/* Songs in list header with sort + filter */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <h4 className="text-xs font-display font-bold text-piu-accent">
            SONGS IN LIST ({list.items.length})
          </h4>
          <div className="flex items-center gap-2">
            {list.items.length > 3 && (
              <input
                value={filterText}
                onChange={e => setFilterText(e.target.value)}
                placeholder="Filter..."
                className="bg-piu-dark border border-piu-border rounded-lg text-[11px] py-1 px-2 text-gray-200 focus:outline-none focus:border-violet-400/50 w-28"
              />
            )}
            {list.items.length > 1 && (
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="bg-piu-dark border border-piu-border rounded-lg text-[11px] py-1 px-1.5 text-gray-200 focus:outline-none focus:border-violet-400/50"
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {list.items.length === 0 ? (
          <p className="text-sm text-gray-500 py-3 text-center">No songs added yet. Use the search above to add songs.</p>
        ) : displayedItems.length === 0 ? (
          <p className="text-sm text-gray-500 py-3 text-center">No songs match "{filterText}"</p>
        ) : (
          <div className="space-y-2" onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
            {displayedItems.map(item => (
              <ListItemRow
                key={item.id}
                item={item}
                liveData={libraryMap[item.chartId]}
                listId={list.id}
                onSetTarget={onSetTarget}
                onRemove={onRemoveChart}
                isDragging={dragItemId === item.id}
                isDragOver={dragOverItemId === item.id}
                canDrag={sortBy === 'custom'}
                onDragStart={() => handleDragStart(item.id)}
                onDragOver={e => handleDragOver(e, item.id)}
                onDragEnd={handleDragEnd}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete list */}
      <div className="pt-2 border-t border-piu-border/30 flex justify-end">
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-red-400 hover:text-red-300 transition-colors font-display"
        >
          Delete List
        </button>
      </div>
    </div>
  );
}

// ─── Individual List Item Row ──────────────────────────────────────
function ListItemRow({ item, liveData, listId, onSetTarget, onRemove, isDragging, isDragOver, canDrag, onDragStart, onDragOver, onDragEnd }) {
  const liveScore = liveData ? (parseInt(liveData.best_score, 10) || 0) : (parseInt(item.originalScore, 10) || 0);
  const livePass = liveData ? !!liveData.is_pass : item.hadPass;
  const liveGrade = gradeFromScore(liveScore);

  const targetMinScore = getTargetMinScore(item.target);
  const isComplete = item.target === 'PASS'
    ? livePass
    : liveScore >= targetMinScore;

  // Progress toward target — shown as % within the range from current grade floor to target
  const progressPct = useMemo(() => {
    if (item.target === 'PASS') return isComplete ? 100 : 0;
    if (targetMinScore <= 0) return 0;
    // Use the player's current grade threshold as the floor
    const currentGradeMin = gradeFromScore(liveScore).min;
    const floorScore = Math.min(currentGradeMin, targetMinScore);
    const range = targetMinScore - floorScore;
    if (range <= 0) return liveScore >= targetMinScore ? 100 : 0;
    const progress = liveScore - floorScore;
    return Math.max(0, Math.min(100, Math.round((progress / range) * 100)));
  }, [item.target, targetMinScore, liveScore, isComplete]);

  const isSingle = item.mode === 'Single';
  const targetOptions = getTargetOptions(liveScore, livePass);

  const jacketUrl = liveData?.jacketUrl || item.jacketUrl;

  return (
    <div
      draggable={canDrag}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={`rounded-lg border px-3 py-2 flex items-center gap-2 sm:gap-3 transition-all ${
        isDragging ? 'opacity-40' : ''
      } ${isDragOver ? 'border-violet-400/70 bg-violet-900/20' : ''} ${
        isComplete
          ? 'border-emerald-500/40 bg-emerald-900/15'
          : 'border-piu-border/50 bg-piu-dark/40'
      }`}
    >
      {/* Drag handle */}
      {canDrag && (
        <span className="text-gray-600 cursor-grab active:cursor-grabbing shrink-0 select-none" title="Drag to reorder">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
          </svg>
        </span>
      )}

      {/* Jacket thumbnail + Level badge overlay */}
      <div className="relative shrink-0 w-[42px] h-[42px]">
        {jacketUrl ? (
          <img
            src={jacketUrl}
            alt=""
            className="w-full h-full rounded-lg object-cover border border-piu-border/40"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full rounded-lg bg-piu-dark border border-piu-border/40" />
        )}
        <span className={`absolute -bottom-1 -right-1 inline-flex items-center justify-center min-w-[22px] h-[22px] text-[10px] rounded-full border font-display font-black ${
          isSingle
            ? 'bg-gradient-to-b from-red-500 to-red-700 border-red-300/50'
            : 'bg-gradient-to-b from-green-500 to-emerald-700 border-green-300/50'
        } text-white`}>
          {item.level}
        </span>
      </div>

      {/* Song info + score + attempts + progress bar */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-display font-bold truncate leading-tight">{item.songTitle}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {livePass ? (
            <>
              <span className="text-xs font-mono text-white">{formatNumber(liveScore)}</span>
              <span className={`text-xs font-display font-bold ${liveGrade.color}`}>{liveGrade.grade}</span>
            </>
          ) : (
            <span className="text-[11px] text-gray-500 italic">Not cleared</span>
          )}
          {item.originalScore > 0 && liveScore > item.originalScore && (
            <span className="text-[10px] text-emerald-400">+{formatNumber(liveScore - item.originalScore)}</span>
          )}
          {item.attempts != null && (
            <span className="text-[10px] text-gray-500" title="Attempts since added to list">
              {item.attempts} attempt{item.attempts !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {/* Progress bar toward target */}
        {!isComplete && item.target !== 'PASS' && targetMinScore > 0 && (
          <div className="mt-1.5 h-1 rounded-full bg-gray-700/60 overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-500/70 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
      </div>

      {/* Completion indicator */}
      {isComplete && (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}

      {/* Target selector */}
      <div className="shrink-0">
        <select
          value={item.target}
          onChange={e => onSetTarget(listId, item.id, e.target.value)}
          className="bg-piu-dark border border-piu-border rounded-lg text-xs py-1 px-1.5 text-gray-200 focus:outline-none focus:border-violet-400/50 max-w-[110px]"
        >
          {targetOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Remove button */}
      <button
        type="button"
        onClick={() => onRemove(listId, item.id)}
        className="text-gray-600 hover:text-red-400 transition-colors shrink-0 p-0.5"
        title="Remove from list"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
