import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getCountryFlag } from '../components/PlayerRegistration';
import { getShoeTopStats, getShoeUsersByModel } from '../utils/api';
import { getProfilePath } from '../utils/profile';

function shoeLabel(shoe) {
  return `${shoe?.make || ''} ${shoe?.model || ''}`.replace(/\s+/g, ' ').trim() || 'Unnamed Shoe';
}

function SummaryStatStrip({ summary }) {
  const items = [
    { label: 'Models', value: summary?.total_models || 0 },
    { label: 'Players', value: summary?.players_with_shoes || 0 },
    { label: 'Shoes', value: summary?.total_shoe_entries || 0 },
  ];
  return (
    <div className="card py-2.5 px-2 sm:px-3">
      <div className="grid grid-cols-3 divide-x divide-piu-border/40">
        {items.map((item) => (
          <div key={item.label} className="px-1.5 sm:px-3 py-1 text-center">
            <p className="text-[10px] uppercase tracking-wide text-gray-500 font-display">{item.label}</p>
            <p className="mt-0.5 text-lg sm:text-xl font-display font-bold text-gray-100">
              {(parseInt(item.value, 10) || 0).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ShoesPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [topPayload, setTopPayload] = useState({ summary: null, results: [] });
  const [selectedShoeId, setSelectedShoeId] = useState(null);
  const [selectedPayload, setSelectedPayload] = useState(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');

  const topShoes = useMemo(() => (
    Array.isArray(topPayload?.results) ? topPayload.results : []
  ), [topPayload]);
  const summary = topPayload?.summary || {};

  const loadUsersForShoe = async (shoeId) => {
    if (!Number.isInteger(parseInt(shoeId, 10))) return;
    setSelectedShoeId(parseInt(shoeId, 10));
    setUsersError('');
    setUsersLoading(true);
    try {
      const payload = await getShoeUsersByModel(shoeId);
      setSelectedPayload(payload || null);
    } catch (err) {
      setUsersError(err.message || 'Failed to load users for this shoe.');
      setSelectedPayload(null);
    } finally {
      setUsersLoading(false);
    }
  };

  const loadTopShoes = async () => {
    if (!user?.id) return;
    setLoading(true);
    setError('');
    try {
      const payload = await getShoeTopStats(30);
      const nextResults = Array.isArray(payload?.results) ? payload.results : [];
      setTopPayload({
        summary: payload?.summary || { total_models: 0, players_with_shoes: 0, total_shoe_entries: 0 },
        results: nextResults,
      });
      if (nextResults.length === 0) {
        setSelectedShoeId(null);
        setSelectedPayload(null);
        setUsersError('');
      } else {
        const stillExists = nextResults.some((item) => parseInt(item.id, 10) === parseInt(selectedShoeId, 10));
        const target = stillExists
          ? parseInt(selectedShoeId, 10)
          : parseInt(nextResults[0].id, 10);
        if (Number.isInteger(target) && target > 0) {
          await loadUsersForShoe(target);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to load shoe stats.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTopShoes();
  }, [user?.id]);

  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="card text-center">
          <p className="text-sm text-gray-300">Log in to view community shoe stats.</p>
          <Link to="/login" className="btn-primary inline-flex mt-3">Go to Login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-6 space-y-4">
      <div className="card">
        <div>
          <h1 className="font-display text-2xl font-bold">Shoes</h1>
          <p className="text-sm text-gray-400 mt-1">Top shoe models by how many players use them.</p>
        </div>
      </div>

      {error && (
        <div className="card border-red-500/40 bg-red-500/10 text-red-200 text-sm">{error}</div>
      )}

      <SummaryStatStrip summary={summary} />

      <div className="grid grid-cols-1 lg:grid-cols-[1.65fr,1fr] gap-4">
        <section className="card">
          <h2 className="font-display text-lg font-bold mb-3">Top Shoes</h2>
          {loading && topShoes.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">Loading top shoes...</p>
          ) : topShoes.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No shoe data yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {topShoes.map((shoe) => {
                const isSelected = parseInt(selectedShoeId, 10) === parseInt(shoe.id, 10);
                return (
                  <button
                    key={`${shoe.id}-${shoe.make}-${shoe.model}`}
                    type="button"
                    onClick={() => loadUsersForShoe(parseInt(shoe.id, 10))}
                    className={`text-left rounded-xl border p-3 transition-colors bg-piu-dark/35 hover:bg-piu-dark/55 ${
                      isSelected ? 'border-emerald-400/70 bg-emerald-500/10' : 'border-piu-border/50'
                    }`}
                  >
                    <div className="w-full h-24 rounded-lg bg-piu-dark/60 border border-piu-border/40 overflow-hidden flex items-center justify-center">
                      {shoe.image_data ? (
                        <img
                          src={shoe.image_data}
                          alt={shoeLabel(shoe)}
                          className="w-full h-full object-contain p-1"
                        />
                      ) : (
                        <span className="text-xs text-gray-500">No image</span>
                      )}
                    </div>
                    <p className="mt-2 font-display font-bold text-sm truncate">{shoeLabel(shoe)}</p>
                    <p className="text-xs text-gray-400">
                      {(parseInt(shoe.player_count, 10) || 0).toLocaleString()} players
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {(parseInt(shoe.shoe_entries, 10) || 0).toLocaleString()} total entries
                    </p>
                    {(parseInt(shoe.colorway_count, 10) || 0) > 0 ? (
                      <p className="text-[10px] text-gray-500">
                        {(parseInt(shoe.colorway_count, 10) || 0).toLocaleString()} colorway{(parseInt(shoe.colorway_count, 10) || 0) === 1 ? '' : 's'}
                      </p>
                    ) : null}
                    {String(shoe.display_colorway || '').trim() ? (
                      <p className="text-[10px] text-cyan-300 truncate">
                        Display: {shoe.display_colorway}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="card">
          <h2 className="font-display text-lg font-bold mb-1">Who Uses It</h2>
          {selectedPayload?.shoe ? (
            <p className="text-xs text-gray-400 mb-3">
              {shoeLabel(selectedPayload.shoe)} • {(parseInt(selectedPayload?.shoe?.player_count, 10) || 0).toLocaleString()} players
            </p>
          ) : (
            <p className="text-xs text-gray-500 mb-3">Select a shoe to view players.</p>
          )}

          {usersError && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200 mb-3">
              {usersError}
            </div>
          )}

          {usersLoading ? (
            <p className="text-sm text-gray-500 py-4">Loading players...</p>
          ) : Array.isArray(selectedPayload?.users) && selectedPayload.users.length > 0 ? (
            <div className="space-y-2">
              {selectedPayload.users.map((player) => {
                const profilePath = getProfilePath(player.id, player.username);
                const flag = getCountryFlag(player.nationality);
                return (
                  <Link
                    key={`${player.id}-${player.username}`}
                    to={profilePath}
                    className="flex items-center gap-2 rounded-lg border border-piu-border/45 bg-piu-dark/35 hover:bg-piu-dark/55 transition-colors p-2"
                  >
                    {player.avatar ? (
                      <img src={getAvatarUrl(player.avatar)} alt="" className="w-8 h-8 rounded-full object-cover border border-piu-border" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-xs">
                        {(player.username || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-display font-bold truncate">
                        {flag ? <span className="mr-1">{flag}</span> : null}
                        {player.username}
                      </p>
                      {player.skill_title ? (
                        <p className="text-[10px] text-gray-500 truncate">{player.skill_title}</p>
                      ) : null}
                      {Array.isArray(player.colorways) && player.colorways.length > 0 ? (
                        <p className="text-[10px] text-gray-500 truncate">{player.colorways.join(', ')}</p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      {player.is_current_pair ? (
                        <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-display font-bold bg-emerald-500/20 text-emerald-200 border border-emerald-400/35">
                          Current
                        </span>
                      ) : player.has_active_pair ? (
                        <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-display font-bold bg-cyan-500/20 text-cyan-200 border border-cyan-400/35">
                          Active
                        </span>
                      ) : (
                        <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-display font-bold bg-gray-500/20 text-gray-300 border border-gray-400/30">
                          Retired
                        </span>
                      )}
                      <p className="text-[10px] text-gray-500 mt-0.5">{parseInt(player.matching_shoe_count, 10) || 0} pair(s)</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500 py-4">No players found for this shoe.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
