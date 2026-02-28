import React, { useEffect, useState } from 'react';
import { getChangelogEntries } from '../utils/api';

export default function ChangeLogPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getChangelogEntries()
      .then((result) => {
        if (cancelled) return;
        setEntries(Array.isArray(result) ? result : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setEntries([]);
        setError(err?.message || 'Failed to load changelog');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-wide">CHANGE LOG</h1>
        <p className="text-xs text-gray-500 mt-1">Recent updates and fixes</p>
      </div>

      {loading && (
        <div className="card">
          <p className="text-sm text-gray-500 text-center py-6">Loading changelog...</p>
        </div>
      )}

      {!loading && error && (
        <div className="card">
          <p className="text-sm text-red-400 text-center py-6">{error}</p>
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div className="card">
          <p className="text-sm text-gray-500 text-center py-6">No changelog entries yet.</p>
        </div>
      )}

      {!loading && !error && entries.length > 0 && (
        <div className="space-y-3">
          {entries.map((entry) => {
            const createdLabel = entry?.created_at
              ? new Date(entry.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
              : '';
            return (
              <div key={entry.id} className={`card ${entry.pinned ? 'border-piu-accent/40' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">{createdLabel}</p>
                  {entry.pinned ? (
                    <span className="text-[10px] font-display font-bold text-piu-accent">PINNED</span>
                  ) : null}
                </div>
                <h2 className="text-sm sm:text-base font-display font-bold text-gray-100 mt-1">{entry.title}</h2>
                <p className="text-xs sm:text-sm text-gray-400 mt-1 leading-relaxed whitespace-pre-wrap">{entry.content}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
