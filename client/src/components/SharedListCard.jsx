import React, { useEffect, useState } from 'react';
import { getSharedListDetail, joinSharedList } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

function MemberProgressBar({ member }) {
  const pct = member.total > 0 ? Math.round((member.completed / member.total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-[10px] text-gray-300 w-16 truncate">{member.username}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-[10px] text-gray-500 tabular-nums w-10 text-right">
        {member.completed}/{member.total}
      </span>
    </div>
  );
}

export default function SharedListCard({ listShare, onOpenDetail }) {
  const { user } = useAuth();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  const sharedListId = listShare?.sharedListId;
  const listName = String(listShare?.listName || '').trim() || 'Shared List';
  const itemCount = parseInt(listShare?.itemCount || 0, 10);
  const ownerUsername = String(listShare?.ownerUsername || '').trim();

  useEffect(() => {
    if (!sharedListId) { setLoading(false); return; }
    let active = true;
    getSharedListDetail(sharedListId)
      .then(d => { if (active) setDetail(d); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sharedListId]);

  const isMember = detail?.isMember ?? false;
  const members = detail?.members || [];
  const visibleMembers = members.slice(0, 4);

  const handleJoin = async (e) => {
    e.stopPropagation();
    if (!sharedListId || joining) return;
    setJoining(true);
    try {
      await joinSharedList(sharedListId);
      const d = await getSharedListDetail(sharedListId);
      setDetail(d);
    } catch { /* ignore */ }
    setJoining(false);
  };

  return (
    <div
      className="relative isolate w-full overflow-hidden rounded-[1.4rem] border border-violet-400/20 bg-[linear-gradient(180deg,#12132a_0%,#0c0f22_100%)] shadow-[0_16px_34px_rgba(0,0,0,0.22)] cursor-pointer"
      onClick={() => onOpenDetail?.(sharedListId)}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.12),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.06),transparent_38%)]" />

      <div className="relative px-3.5 pt-3.5 pb-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-display font-bold uppercase tracking-[0.22em] text-violet-300/80">
              {ownerUsername ? `${ownerUsername}'s list` : 'Shared List'}
            </p>
            <p className="mt-1 text-[17px] font-display font-black leading-tight text-white sm:text-[19px]">{listName}</p>
          </div>
          <span className="shrink-0 rounded-full border border-violet-300/18 bg-violet-500/8 px-3 py-1.5 text-[10px] font-display font-black tracking-[0.12em] text-violet-50">
            {itemCount} song{itemCount !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Member progress */}
        {!loading && members.length > 0 && (
          <div className="mt-3 rounded-[1rem] border border-white/8 bg-piu-dark/45 p-2.5 space-y-1.5">
            <p className="text-[9px] font-display font-bold uppercase tracking-[0.18em] text-gray-400 mb-1">
              {members.length} member{members.length !== 1 ? 's' : ''}
            </p>
            {visibleMembers.map(m => (
              <MemberProgressBar key={m.userId} member={m} />
            ))}
            {members.length > 4 && (
              <p className="text-[9px] text-gray-500 text-center pt-0.5">
                +{members.length - 4} more
              </p>
            )}
          </div>
        )}

        {loading && (
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            <div className="h-3 w-3 animate-spin rounded-full border border-gray-600 border-t-violet-400" />
            Loading...
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex items-center gap-2">
          {!isMember && !loading && (
            <button
              type="button"
              onClick={handleJoin}
              disabled={joining}
              className="flex-1 rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-[11px] font-display font-bold text-cyan-100 transition-colors hover:border-cyan-300/35 hover:bg-cyan-500/18"
            >
              {joining ? 'Joining...' : 'Join list'}
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenDetail?.(sharedListId); }}
            className={`${isMember || loading ? 'flex-1' : 'flex-1'} rounded-xl border border-violet-300/20 bg-violet-500/8 px-3 py-2 text-[11px] font-display font-bold text-violet-100 transition-colors hover:border-violet-300/35 hover:bg-violet-500/16`}
          >
            View list
          </button>
        </div>
      </div>
    </div>
  );
}
