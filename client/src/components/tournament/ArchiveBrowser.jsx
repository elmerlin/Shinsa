import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getArchivedTournaments, archiveTournament } from '../../utils/api';

export default function ArchiveBrowser() {
  const [archived, setArchived] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [unarchiving, setUnarchiving] = useState(null);

  useEffect(() => {
    getArchivedTournaments()
      .then(setArchived)
      .catch(() => setArchived([]))
      .finally(() => setLoading(false));
  }, []);

  const handleUnarchive = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    setUnarchiving(id);
    try {
      await archiveTournament(id, false);
      setArchived(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error('Failed to unarchive:', err);
    } finally {
      setUnarchiving(null);
    }
  };

  const filtered = search.trim()
    ? archived.filter(t =>
        (t.name || '').toLowerCase().includes(search.trim().toLowerCase())
      )
    : archived;

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">Loading archived tournaments...</div>
    );
  }

  return (
    <div>
      {archived.length > 0 && (
        <div className="mb-4">
          <input
            type="text"
            className="input-field text-sm"
            placeholder="Search archived tournaments..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-10 text-gray-500">
          <p>{archived.length === 0 ? 'No archived tournaments yet' : 'No matches found'}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(t => (
            <Link
              key={t.id}
              to={`/tournament/${t.id}`}
              className="card-hover flex items-center justify-between group"
            >
              <div>
                <h3 className="font-display font-bold group-hover:text-piu-accent transition-colors">
                  {t.name}
                </h3>
                <div className="flex gap-3 text-xs text-gray-500">
                  {t.location && <span>{t.location}</span>}
                  {t.date && <span>{t.date}</span>}
                  {t.player_count != null && <span>{t.player_count} players</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="badge badge-completed text-[10px]">
                  {t.phase || 'COMPLETED'}
                </span>
                <button
                  onClick={(e) => handleUnarchive(e, t.id)}
                  disabled={unarchiving === t.id}
                  className="text-xs text-gray-500 hover:text-piu-accent transition-colors font-display font-bold px-2 py-1 rounded hover:bg-piu-accent/10"
                >
                  {unarchiving === t.id ? '...' : 'Unarchive'}
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
