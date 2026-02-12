import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getTournaments, deleteTournament } from '../utils/api';

const PHASE_LABELS = {
  SETUP: 'Setup',
  SWISS: 'Swiss Rounds',
  KOTH: 'King of the Hill',
  COMPLETED: 'Completed',
};

export default function Dashboard() {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    getTournaments()
      .then(setTournaments)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this tournament? This cannot be undone.')) return;
    await deleteTournament(id);
    setTournaments(t => t.filter(x => x.id !== id));
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-display font-bold tracking-wider">
            TOURNAMENTS
          </h1>
          <p className="text-gray-400 mt-1">Pump It Up Tournament Manager</p>
        </div>
        <Link to="/tournament/new" className="btn-primary text-lg">
          + New Tournament
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">Loading...</div>
      ) : tournaments.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-6xl mb-4 opacity-30">&#9733;</div>
          <p className="text-gray-400 text-lg">No tournaments yet</p>
          <p className="text-gray-600 mt-2">Create your first tournament to get started</p>
          <Link to="/tournament/new" className="btn-primary mt-6 inline-block">
            Create Tournament
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {tournaments.map(t => (
            <Link
              key={t.id}
              to={`/tournament/${t.id}`}
              className="card-hover flex items-center justify-between group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-piu-accent to-purple-700 rounded-lg flex items-center justify-center font-display text-xl font-bold shadow-md">
                  {t.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold group-hover:text-piu-accent transition-colors">
                    {t.name}
                  </h3>
                  <div className="flex gap-3 text-sm text-gray-400">
                    {t.location && <span>{t.location}</span>}
                    {t.date && <span>{t.date}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`badge ${
                  t.phase === 'SETUP' ? 'badge-pending' :
                  t.phase === 'COMPLETED' ? 'badge-completed' : 'badge-active'
                }`}>
                  {PHASE_LABELS[t.phase] || t.phase}
                </span>
                <button
                  onClick={(e) => handleDelete(e, t.id)}
                  className="text-gray-600 hover:text-red-500 transition-colors p-1"
                  title="Delete tournament"
                >
                  &#10005;
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
