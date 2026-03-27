import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getUserLists, createList, addListItem, saveChartFeedback } from '../../utils/api';
import { useToast } from '../../contexts/ToastContext';

// ---------------------------------------------------------------------------
// Grade helpers (matching SongChartPage pattern)
// ---------------------------------------------------------------------------
const GRADE_THRESHOLDS = [
  { min: 0, grade: 'F' }, { min: 450000, grade: 'D' }, { min: 550000, grade: 'C' },
  { min: 650000, grade: 'B' }, { min: 750000, grade: 'A' }, { min: 825000, grade: 'A+' },
  { min: 900000, grade: 'AA' }, { min: 925000, grade: 'AA+' }, { min: 950000, grade: 'AAA' },
  { min: 960000, grade: 'AAA+' }, { min: 970000, grade: 'S' }, { min: 975000, grade: 'S+' },
  { min: 980000, grade: 'SS' }, { min: 985000, grade: 'SS+' }, { min: 990000, grade: 'SSS' },
  { min: 995000, grade: 'SSS+' },
];

function gradeFromScore(score) {
  const s = parseInt(score, 10) || 0;
  for (let i = GRADE_THRESHOLDS.length - 1; i >= 0; i--) {
    if (s >= GRADE_THRESHOLDS[i].min) return GRADE_THRESHOLDS[i].grade;
  }
  return 'F';
}

function nextGradeUp(grade) {
  const idx = GRADE_THRESHOLDS.findIndex((g) => g.grade === grade);
  if (idx >= 0 && idx < GRADE_THRESHOLDS.length - 1) return GRADE_THRESHOLDS[idx + 1].grade;
  return grade || 'PASS';
}

/**
 * Build the full addListItem payload from either title or pumbility rec shape.
 */
function buildListItemPayload(rec) {
  const isPumbility = rec.current_score != null;
  if (isPumbility) {
    // Pumbility recs are already-passed charts being improved
    return {
      chartId: rec.chart_id,
      songTitle: rec.song_title,
      artist: rec.artist || '',
      mode: rec.mode,
      level: rec.level,
      jacketUrl: rec.jacket_url || '',
      originalScore: rec.current_score || 0,
      originalGrade: rec.current_grade || '',
      hadPass: true,
      target: rec.next_grade || nextGradeUp(rec.current_grade),
      addedAt: Date.now(),
    };
  }
  // Title recs are always unpassed
  return {
    chartId: rec.chart_id,
    songTitle: rec.song_title,
    artist: rec.artist || '',
    mode: rec.mode,
    level: rec.level,
    jacketUrl: rec.jacket_url || '',
    originalScore: rec.best_score || rec.fail_score || 0,
    originalGrade: rec.best_grade || (rec.best_score ? gradeFromScore(rec.best_score) : ''),
    hadPass: false,
    target: 'PASS',
    addedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Passability chips
// ---------------------------------------------------------------------------
const PASSABILITY_OPTIONS = [
  { value: 1, label: 'Ready now', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/30', activeColor: 'bg-emerald-500 text-white border-emerald-400' },
  { value: 2, label: 'Soon', color: 'bg-lime-500/20 text-lime-300 border-lime-500/50 hover:bg-lime-500/30', activeColor: 'bg-lime-500 text-white border-lime-400' },
  { value: 3, label: 'Stretch', color: 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30', activeColor: 'bg-amber-500 text-white border-amber-400' },
  { value: 4, label: 'Hard', color: 'bg-orange-500/20 text-orange-300 border-orange-500/50 hover:bg-orange-500/30', activeColor: 'bg-orange-500 text-white border-orange-400' },
  { value: 5, label: 'Not yet', color: 'bg-rose-500/20 text-rose-300 border-rose-500/50 hover:bg-rose-500/30', activeColor: 'bg-rose-500 text-white border-rose-400' },
];

// ---------------------------------------------------------------------------
// Track Sheet Component
// ---------------------------------------------------------------------------
export default function RecommendationTrackSheet({ rec, goal, open, onClose, onFeedbackSaved }) {
  const { addToast } = useToast();

  // List state
  const [lists, setLists] = useState([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [selectedListId, setSelectedListId] = useState(null);
  const [showInlineCreate, setShowInlineCreate] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [addedToList, setAddedToList] = useState(null); // list name after successful add

  // Feedback state
  const existingFeedback = rec?.player_feedback;
  const [rating, setRating] = useState(existingFeedback?.passability_rating || null);
  const [note, setNote] = useState(existingFeedback?.note || '');

  // Saving state
  const [saving, setSaving] = useState(false);

  const inputRef = useRef(null);

  // Reset state when rec changes
  useEffect(() => {
    if (!open) return;
    const fb = rec?.player_feedback;
    setRating(fb?.passability_rating || null);
    setNote(fb?.note || '');
    setSelectedListId(null);
    setAddedToList(null);
    setShowInlineCreate(false);
    setNewListName('');
  }, [open, rec?.chart_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lazy load lists
  useEffect(() => {
    if (!open) return;
    setListsLoading(true);
    getUserLists()
      .then((data) => setLists(data.lists || []))
      .catch(() => {})
      .finally(() => setListsLoading(false));
  }, [open]);

  // Escape key + body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !rec) return null;

  const chartId = rec.chart_id;
  const isAlreadyInList = (list) => (list.items || []).some((i) => i.chartId === chartId);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);

    try {
      // Step 1: create list inline if needed
      let targetListId = selectedListId;
      if (showInlineCreate && newListName.trim()) {
        try {
          const newList = await createList(newListName.trim());
          targetListId = newList.id;
          setLists((prev) => [...prev, { ...newList, items: newList.items || [] }]);
          setShowInlineCreate(false);
          setNewListName('');
        } catch {
          addToast('Failed to create list', 'error');
        }
      }

      // Step 2: parallel — list add + feedback save
      const promises = [];
      const labels = [];

      if (targetListId) {
        const list = lists.find((l) => l.id === targetListId);
        if (list && !isAlreadyInList(list)) {
          const payload = buildListItemPayload(rec);
          promises.push(
            addListItem(targetListId, payload)
              .then(() => { labels.push(`Added to "${list.name}"`); })
              .catch((err) => {
                if (err.message === 'Chart already in list') {
                  labels.push('Already in this list');
                } else {
                  throw err;
                }
              }),
          );
        } else if (list) {
          labels.push('Already in this list');
        }
      }

      const origRating = existingFeedback?.passability_rating || null;
      const origNote = existingFeedback?.note || '';
      const ratingChanged = rating !== origRating;
      const noteChanged = note !== origNote;

      let updatedFeedback = existingFeedback || null;
      if (ratingChanged || noteChanged) {
        promises.push(
          saveChartFeedback(chartId, { passability_rating: rating, note })
            .then((res) => {
              updatedFeedback = res.feedback;
              if (ratingChanged && noteChanged) labels.push('Saved your read and note');
              else if (ratingChanged) labels.push('Saved your read');
              else labels.push('Saved note');
            }),
        );
      }

      await Promise.allSettled(promises);

      for (const label of labels) {
        const type = label.startsWith('Failed') ? 'error' : 'success';
        addToast(label, type);
      }

      if (ratingChanged || noteChanged) {
        onFeedbackSaved(chartId, updatedFeedback);
      } else {
        onClose();
      }
    } catch {
      addToast('Something went wrong', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await saveChartFeedback(chartId, { passability_rating: null, note: '' });
      addToast('Cleared your read', 'success');
      onFeedbackSaved(chartId, res.feedback);
    } catch {
      addToast('Failed to clear', 'error');
    } finally {
      setSaving(false);
    }
  };

  const isSingle = String(rec.mode || '').toLowerCase().startsWith('s');
  const contextLabel = goal === 'pumbility' ? 'Recommended for Pumbility' : 'Recommended for Title Push';
  const jacketSrc = rec.jacket_url || rec.background_url || '';
  const hasSavedFeedback = existingFeedback?.passability_rating != null || (existingFeedback?.note || '').trim();

  const sheet = (
    <div className="fixed inset-0 z-[200]" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" />

      {/* Sheet content */}
      <div
        className="absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] max-h-[80vh] overflow-hidden rounded-2xl border border-piu-border bg-piu-card shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-piu-border/30">
            {jacketSrc ? (
              <img src={jacketSrc} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-piu-dark flex items-center justify-center flex-shrink-0">
                <span className="text-lg font-display font-black text-gray-700">{(rec.song_title || '?')[0]}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-display font-bold text-white truncate">{rec.song_title}</p>
              <p className="text-[10px] text-gray-400 font-display font-bold">
                {isSingle ? 'S' : 'D'}{rec.level}
                <span className="text-gray-600 ml-2">{contextLabel}</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-black/30 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Section 1: Add to List */}
          <div className="px-4 pt-3 pb-2">
            <p className="text-[10px] font-display font-bold text-gray-500 uppercase tracking-wider mb-2">Add to List</p>
            {listsLoading ? (
              <div className="flex items-center gap-2 py-2">
                <div className="w-3 h-3 border-2 border-piu-accent/30 border-t-piu-accent rounded-full animate-spin" />
                <span className="text-xs text-gray-500 font-body">Loading lists...</span>
              </div>
            ) : (
              <div className="space-y-1">
                {lists.map((list) => {
                  const alreadyIn = isAlreadyInList(list);
                  const isSelected = selectedListId === list.id;
                  return (
                    <button
                      key={list.id}
                      onClick={() => {
                        if (alreadyIn) return;
                        setSelectedListId(isSelected ? null : list.id);
                      }}
                      disabled={alreadyIn}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-colors ${
                        alreadyIn
                          ? 'opacity-50 cursor-not-allowed'
                          : isSelected
                            ? 'bg-violet-500/20 border border-violet-500/40'
                            : 'hover:bg-piu-dark/50 border border-transparent'
                      }`}
                    >
                      {alreadyIn ? (
                        <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : isSelected ? (
                        <div className="w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center flex-shrink-0">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-gray-600 flex-shrink-0" />
                      )}
                      <span className="text-xs font-display text-gray-200 truncate">{list.name}</span>
                      {alreadyIn && <span className="text-[9px] text-gray-500 font-body ml-auto">Already added</span>}
                    </button>
                  );
                })}

                {/* Inline create */}
                {showInlineCreate ? (
                  <div className="flex gap-1.5 mt-1">
                    <input
                      ref={inputRef}
                      type="text"
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newListName.trim()) handleSave();
                        if (e.key === 'Escape') { setShowInlineCreate(false); setNewListName(''); }
                      }}
                      placeholder="List name..."
                      className="bg-piu-dark border border-piu-border rounded-lg text-xs py-2 px-3 text-gray-200 focus:outline-none focus:border-violet-400/50 flex-1 min-w-0"
                      autoFocus
                    />
                    <button
                      onClick={() => { setShowInlineCreate(false); setNewListName(''); }}
                      className="text-xs text-gray-500 px-2"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowInlineCreate(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-piu-dark/50 transition-colors"
                  >
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="text-xs font-display text-gray-400">Create new list</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Your Read */}
          <div className="px-4 pt-3 pb-2">
            <p className="text-[10px] font-display font-bold text-gray-500 uppercase tracking-wider mb-1">Your Read</p>
            <p className="text-[10px] text-gray-600 font-body mb-2">How doable is this for you right now?</p>
            <div className="flex gap-1.5">
              {PASSABILITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setRating(rating === opt.value ? null : opt.value)}
                  className={`flex-1 py-2 px-1 rounded-lg border text-[10px] font-display font-bold transition-all active:scale-95 ${
                    rating === opt.value ? opt.activeColor : opt.color
                  }`}
                >
                  <div className="text-center">
                    <div className="text-sm leading-none">{opt.value}</div>
                    <div className="leading-tight mt-0.5">{opt.label}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: Private Note */}
          <div className="px-4 pt-3 pb-3">
            <p className="text-[10px] font-display font-bold text-gray-500 uppercase tracking-wider mb-1">Private Note</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note..."
              rows={3}
              maxLength={1000}
              className="w-full bg-piu-dark border border-piu-border rounded-lg text-xs py-2 px-3 text-gray-200 font-body placeholder-gray-600 focus:outline-none focus:border-violet-400/50 resize-none"
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-[9px] text-gray-600 font-body">Only you can see this note.</p>
              {existingFeedback?.note_updated_at && (
                <p className="text-[9px] text-gray-600 font-body">
                  Updated {new Date(existingFeedback.note_updated_at + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer — sticky */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-piu-border/30 bg-piu-card">
          {hasSavedFeedback && (
            <button
              onClick={handleClear}
              disabled={saving}
              className="px-4 py-2 rounded-lg border border-piu-border text-xs font-display font-bold text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
            >
              Clear
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-violet-500 to-purple-700 border border-violet-300/30 text-white font-display font-bold text-xs shadow-lg shadow-violet-900/30 hover:brightness-110 transition-all disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
