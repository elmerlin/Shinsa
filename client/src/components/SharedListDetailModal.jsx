import React, { useEffect, useMemo, useState } from 'react';
import { getSharedListDetail, joinSharedList, leaveSharedList } from '../utils/api';
import PiuChartJacket from './PiuChartJacket';

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

function MemberOverviewCard({ member, isSelected, onClick }) {
  const pct = member.total > 0 ? Math.round((member.completed / member.total) * 100) : 0;
  const isComplete = pct === 100;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all ${
        isSelected
          ? 'border-cyan-400/40 bg-cyan-500/12 ring-1 ring-cyan-400/20'
          : 'border-piu-border/50 bg-piu-dark/40 hover:border-piu-border/80 hover:bg-piu-dark/60'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-sm font-display font-bold text-white truncate">{member.username}</span>
        <span className={`text-[10px] font-display font-bold tabular-nums ${isComplete ? 'text-emerald-400' : 'text-gray-400'}`}>
          {pct}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            isComplete
              ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
              : 'bg-gradient-to-r from-cyan-500 to-violet-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-[10px] text-gray-500">
        {member.completed}/{member.total} cleared
      </p>
    </button>
  );
}

function SharedListItemRow({ item, memberResults, selectedMemberId }) {
  const selectedResult = selectedMemberId
    ? memberResults.find(r => r.userId === selectedMemberId)
    : null;

  // When a specific member is selected, show their result
  const itemResult = selectedResult?.items?.find(r => r.itemId === item.id);
  const hasPassed = itemResult ? itemResult.passesSinceAdded > 0 : false;
  const bestScore = itemResult?.bestScore || 0;
  const bestGrade = bestScore > 0 ? gradeFromScore(bestScore) : null;
  const attempts = itemResult?.attempts || 0;

  // When showing overview (no member selected), show how many members cleared
  const membersCleared = !selectedMemberId
    ? memberResults.filter(m => {
        const r = m.items?.find(i => i.itemId === item.id);
        return r && r.passesSinceAdded > 0;
      }).length
    : 0;
  const totalMembers = memberResults.length;

  const levelColor = parseInt(item.level, 10) >= 20 ? 'text-piu-accent' :
    parseInt(item.level, 10) >= 15 ? 'text-amber-400' :
    parseInt(item.level, 10) >= 10 ? 'text-cyan-400' : 'text-gray-300';

  return (
    <div className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors ${
      hasPassed ? 'border-emerald-400/18 bg-emerald-500/5' : 'border-piu-border/40 bg-piu-dark/30'
    }`}>
      <div className="shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-piu-dark/60">
        <PiuChartJacket songTitle={item.songTitle} mode={item.mode} level={item.level} size={40} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-display font-bold text-white truncate leading-tight">{item.songTitle}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-gray-400">{item.mode?.charAt(0)}</span>
          <span className={`text-[10px] font-bold ${levelColor}`}>Lv.{item.level}</span>
          <span className="text-[10px] text-gray-600">{item.target || 'PASS'}</span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        {selectedMemberId ? (
          hasPassed ? (
            <div>
              {bestGrade && (
                <span className={`text-sm font-display font-black ${bestGrade.color}`}>{bestGrade.grade}</span>
              )}
              <p className="text-[9px] text-gray-500">{attempts} attempt{attempts !== 1 ? 's' : ''}</p>
            </div>
          ) : (
            <span className="text-[10px] text-gray-600">
              {attempts > 0 ? `${attempts} attempt${attempts !== 1 ? 's' : ''}` : '—'}
            </span>
          )
        ) : (
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-12 rounded-full bg-white/8 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 transition-all duration-500"
                style={{ width: totalMembers > 0 ? `${(membersCleared / totalMembers) * 100}%` : '0%' }}
              />
            </div>
            <span className="text-[10px] text-gray-500 tabular-nums">{membersCleared}/{totalMembers}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SharedListDetailModal({ sharedListId, open, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!open || !sharedListId) return;
    setLoading(true);
    setSelectedMemberId(null);
    let active = true;
    getSharedListDetail(sharedListId)
      .then(d => { if (active) setDetail(d); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, sharedListId]);

  const handleJoin = async () => {
    setActionLoading(true);
    try {
      await joinSharedList(sharedListId);
      const d = await getSharedListDetail(sharedListId);
      setDetail(d);
    } catch { /* ignore */ }
    setActionLoading(false);
  };

  const handleLeave = async () => {
    setActionLoading(true);
    try {
      await leaveSharedList(sharedListId);
      const d = await getSharedListDetail(sharedListId);
      setDetail(d);
    } catch { /* ignore */ }
    setActionLoading(false);
  };

  const isMember = detail?.isMember ?? false;
  const items = detail?.items || [];
  const members = detail?.members || [];
  const owner = detail?.owner;
  const listName = detail?.name || 'Shared List';

  const overallPct = useMemo(() => {
    if (members.length === 0 || items.length === 0) return 0;
    const totalPossible = members.length * items.length;
    const totalCleared = members.reduce((s, m) => s + m.completed, 0);
    return totalPossible > 0 ? Math.round((totalCleared / totalPossible) * 100) : 0;
  }, [members, items]);

  const selectedMember = selectedMemberId
    ? members.find(m => m.userId === selectedMemberId)
    : null;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-sm px-0 sm:px-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[92vh] sm:max-h-[85vh] rounded-t-2xl sm:rounded-2xl border border-piu-border/70 bg-piu-card shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-piu-border/50 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-display font-bold uppercase tracking-[0.22em] text-violet-400">
                {owner?.username ? `${owner.username}'s shared list` : 'Shared List'}
              </p>
              <h2 className="mt-1 text-xl font-display font-black text-white truncate">{listName}</h2>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-[10px] text-gray-400">{items.length} song{items.length !== 1 ? 's' : ''}</span>
                <span className="text-[10px] text-gray-600">|</span>
                <span className="text-[10px] text-gray-400">{members.length} member{members.length !== 1 ? 's' : ''}</span>
                {overallPct > 0 && (
                  <>
                    <span className="text-[10px] text-gray-600">|</span>
                    <span className="text-[10px] text-cyan-400">{overallPct}% overall</span>
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg border border-piu-border/60 bg-piu-dark/70 px-3 py-1.5 text-xs font-display font-bold text-gray-300 transition-colors hover:text-white"
            >
              Close
            </button>
          </div>

          {/* Join / Leave */}
          {!loading && (
            <div className="mt-2.5 flex items-center gap-2">
              {!isMember ? (
                <button
                  type="button"
                  onClick={handleJoin}
                  disabled={actionLoading}
                  className="rounded-lg border border-cyan-400/25 bg-cyan-500/12 px-4 py-1.5 text-[11px] font-display font-bold text-cyan-100 transition-colors hover:border-cyan-400/40 hover:bg-cyan-500/20"
                >
                  {actionLoading ? 'Joining...' : 'Join this list'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleLeave}
                  disabled={actionLoading}
                  className="rounded-lg border border-gray-600/40 bg-piu-dark/50 px-3 py-1.5 text-[10px] font-display font-bold text-gray-500 transition-colors hover:text-red-400 hover:border-red-400/30"
                >
                  {actionLoading ? '...' : 'Leave list'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-violet-400" />
            </div>
          ) : (
            <>
              {/* Members overview */}
              {members.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[10px] font-display font-bold uppercase tracking-[0.18em] text-gray-400">Members</h3>
                    {selectedMemberId && (
                      <button
                        type="button"
                        onClick={() => setSelectedMemberId(null)}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors"
                      >
                        Show overview
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {members.map(m => (
                      <MemberOverviewCard
                        key={m.userId}
                        member={m}
                        isSelected={selectedMemberId === m.userId}
                        onClick={() => setSelectedMemberId(selectedMemberId === m.userId ? null : m.userId)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Items */}
              <div>
                <h3 className="text-[10px] font-display font-bold uppercase tracking-[0.18em] text-gray-400 mb-2">
                  {selectedMember ? `${selectedMember.username}'s progress` : 'Songs'}
                </h3>
                <div className="space-y-1.5">
                  {items.map(item => (
                    <SharedListItemRow
                      key={item.id}
                      item={item}
                      memberResults={members}
                      selectedMemberId={selectedMemberId}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
