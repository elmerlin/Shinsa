import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getSongLibrary,
  getUserLists,
  createList,
  deleteList,
  addListItem,
  removeListItem,
  updateListItemTarget,
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

// Returns the grade options available above the user's current grade
function getTargetOptions(currentScore, hasPass) {
  const options = [];

  // Always offer Pass if not cleared
  if (!hasPass) {
    options.push({ value: 'PASS', label: 'Pass' });
    return options;
  }

  // If has a pass, offer Pass (already met) plus all grades above current
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

// ─── Main Component ────────────────────────────────────────────────
export default function ListsPage() {
  const { user } = useAuth();

  const [lists, setLists] = useState([]);
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedListId, setExpandedListId] = useState(null);
  const [newListName, setNewListName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [migrationNotice, setMigrationNotice] = useState('');

  // Load song library + server-backed lists in parallel
  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [libraryData, listsData] = await Promise.all([
          getSongLibrary({ user_id: user.id }),
          getUserLists(),
        ]);
        if (cancelled) return;
        setMigrationNotice('');
        setLibrary(Array.isArray(libraryData?.songs) ? libraryData.songs : []);
        const serverLists = Array.isArray(listsData?.lists) ? listsData.lists : [];
        setLists(serverLists);

        // One-time migration path for pre-server localStorage lists.
        const migration = await migrateLegacyListsToServer(serverLists);
        if (cancelled) return;
        if (migration.importedLists > 0) {
          const refreshed = await getUserLists();
          if (cancelled) return;
          setLists(Array.isArray(refreshed?.lists) ? refreshed.lists : []);
          setMigrationNotice(`Imported ${migration.importedLists} list${migration.importedLists === 1 ? '' : 's'} from browser storage (${migration.importedItems} item${migration.importedItems === 1 ? '' : 's'}).`);
        }
      } catch {
        if (cancelled) return;
        setLibrary([]);
        setLists([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user?.id]);

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
        return { ...l, items: [...(l.items || []), { ...itemData, id: result.id, attempts: 0 }] };
      }));
    } catch { /* ignore */ }
  };

  const handleRemoveChart = async (listId, itemId) => {
    try {
      await removeListItem(listId, itemId);
      setLists(prev => prev.map(l => {
        if (l.id !== listId) return l;
        return { ...l, items: l.items.filter(i => i.id !== itemId) };
      }));
    } catch { /* ignore */ }
  };

  const handleSetTarget = async (listId, itemId, target) => {
    // Optimistic update
    setLists(prev => prev.map(l => {
      if (l.id !== listId) return l;
      return { ...l, items: l.items.map(i => i.id === itemId ? { ...i, target } : i) };
    }));
    try {
      await updateListItemTarget(listId, itemId, target);
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
                  onAddChart={handleAddChart}
                  onRemoveChart={handleRemoveChart}
                  onSetTarget={handleSetTarget}
                  onDelete={() => handleDeleteList(list.id)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── List Detail (Expanded View) ───────────────────────────────────
function ListDetail({ list, library, libraryMap, onAddChart, onRemoveChart, onSetTarget, onDelete }) {
  const [search, setSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchWrapRef = useRef(null);

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

  return (
    <div className="border-t border-piu-border/40 px-4 py-3 space-y-3">
      {/* Search to add songs */}
      <div>
        <h4 className="text-xs font-display font-bold text-piu-accent mb-2">ADD SONGS</h4>
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
                        return (
                          <button
                            key={chart.chart_id}
                            type="button"
                            onClick={() => {
                              if (!alreadyAdded) {
                                onAddChart(list.id, chart, song);
                                setSearch('');
                                setShowSuggestions(false);
                              }
                            }}
                            disabled={alreadyAdded}
                            className={`inline-flex items-center justify-center min-w-[38px] h-[38px] text-xs rounded-full border font-display font-black shadow-sm transition-all ${
                              alreadyAdded
                                ? 'opacity-30 cursor-not-allowed bg-gray-700 border-gray-600 text-gray-400'
                                : isSingle
                                  ? 'bg-gradient-to-b from-red-500 to-red-700 border-red-300/50 text-white hover:brightness-110'
                                  : 'bg-gradient-to-b from-green-500 to-emerald-700 border-green-300/50 text-white hover:brightness-110'
                            }`}
                            title={alreadyAdded ? 'Already in list' : `Add ${isSingle ? 'S' : 'D'}${chart.level}`}
                          >
                            {chart.level}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {showSuggestions && search.trim() && filteredSongs.length === 0 && (
            <div className="absolute z-20 top-full mt-1 w-full rounded-lg border border-piu-border bg-[#0b1324] shadow-xl p-3">
              <p className="text-sm text-gray-500 text-center">No songs found</p>
            </div>
          )}
        </div>
      </div>

      {/* Current songs in list */}
      <div>
        <h4 className="text-xs font-display font-bold text-piu-accent mb-2">
          SONGS IN LIST ({list.items.length})
        </h4>
        {list.items.length === 0 ? (
          <p className="text-sm text-gray-500 py-3 text-center">No songs added yet. Use the search above to add songs.</p>
        ) : (
          <div className="space-y-2">
            {list.items.map(item => (
              <ListItemRow
                key={item.id}
                item={item}
                liveData={libraryMap[item.chartId]}
                listId={list.id}
                onSetTarget={onSetTarget}
                onRemove={onRemoveChart}
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
function ListItemRow({ item, liveData, listId, onSetTarget, onRemove }) {
  const liveScore = liveData ? (parseInt(liveData.best_score, 10) || 0) : (parseInt(item.originalScore, 10) || 0);
  const livePass = liveData ? !!liveData.is_pass : item.hadPass;
  const liveGrade = gradeFromScore(liveScore);

  const targetMinScore = getTargetMinScore(item.target);
  const isComplete = item.target === 'PASS'
    ? livePass
    : liveScore >= targetMinScore;

  const isSingle = item.mode === 'Single';
  const targetOptions = getTargetOptions(liveScore, livePass);

  return (
    <div className={`rounded-lg border px-3 py-2 flex items-center gap-2 sm:gap-3 ${
      isComplete
        ? 'border-emerald-500/40 bg-emerald-900/15'
        : 'border-piu-border/50 bg-piu-dark/40'
    }`}>
      {/* Level badge */}
      <span className={`inline-flex items-center justify-center min-w-[34px] h-[34px] text-xs rounded-full border font-display font-black shrink-0 ${
        isSingle
          ? 'bg-gradient-to-b from-red-500 to-red-700 border-red-300/50'
          : 'bg-gradient-to-b from-green-500 to-emerald-700 border-green-300/50'
      } text-white`}>
        {item.level}
      </span>

      {/* Song info + score + attempts */}
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
