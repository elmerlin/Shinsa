import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  getSongOfWeekFeed,
  getMySongOfWeek,
  getJacketMap,
  getChartKeyMap,
} from '../utils/api';
import SongOfWeekCard from '../components/SongOfWeekCard';
import SongOfWeekComposerModal from '../components/SongOfWeekComposerModal';

const SCOPE_OPTIONS = [
  { value: 'following', label: 'Following' },
  { value: 'global', label: 'Everyone' },
  { value: 'me', label: 'Me' },
];

export default function SongOfWeekPage() {
  const { user } = useAuth();
  const [scope, setScope] = useState(user ? 'following' : 'global');
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [jacketLookup, setJacketLookup] = useState({});
  const [chartKeyMap, setChartKeyMap] = useState({});
  const [myPick, setMyPick] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    getJacketMap().then(setJacketLookup).catch(() => {});
    getChartKeyMap().then(setChartKeyMap).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSongOfWeekFeed(scope)
      .then((rows) => {
        if (cancelled) return;
        setPicks(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setPicks([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  useEffect(() => {
    if (!user) {
      setMyPick(null);
      return;
    }
    getMySongOfWeek().then(setMyPick).catch(() => setMyPick(null));
  }, [user]);

  const scopedOptions = useMemo(() => {
    if (user) return SCOPE_OPTIONS;
    return SCOPE_OPTIONS.filter((o) => o.value === 'global');
  }, [user]);

  const handleSaved = (saved) => {
    setMyPick(saved);
    if (scope === 'me' || scope === 'following' || scope === 'global') {
      getSongOfWeekFeed(scope).then((rows) => setPicks(rows || [])).catch(() => {});
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.14em] text-piu-accent font-display font-bold">
            Weekly spotlight
          </p>
          <h1 className="text-xl font-display font-bold text-white">Song of the Week</h1>
          <p className="text-[11px] text-gray-500 mt-1">
            See what charts people are featuring on their profiles this week.
          </p>
        </div>
        {user && (
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="btn-primary text-xs"
          >
            {myPick ? 'Edit my pick' : 'Set my pick'}
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {scopedOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setScope(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-display font-bold transition-colors ${
              scope === opt.value
                ? 'bg-piu-accent text-white'
                : 'bg-piu-card text-gray-400 hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center text-sm text-gray-500 py-10">Loading...</p>
      ) : picks.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-sm text-gray-400">
            {scope === 'following'
              ? 'No picks yet from people you follow this week.'
              : scope === 'me'
                ? 'You haven\u2019t set a Song of the Week yet.'
                : 'No picks yet this week. Be the first!'}
          </p>
          {user && (
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="btn-secondary text-xs mt-3"
            >
              {myPick ? 'Edit my pick' : 'Set my pick'}
            </button>
          )}
          {scope === 'following' && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setScope('global')}
                className="text-[11px] text-piu-accent hover:text-piu-accent/80 font-display font-bold"
              >
                Browse everyone &rarr;
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {picks.map((pick) => (
            <SongOfWeekCard
              key={pick.id}
              pick={pick}
              jacketLookup={jacketLookup}
              chartKeyMap={chartKeyMap}
            />
          ))}
        </div>
      )}

      <SongOfWeekComposerModal
        open={composerOpen}
        existingPick={myPick}
        onClose={() => setComposerOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}
