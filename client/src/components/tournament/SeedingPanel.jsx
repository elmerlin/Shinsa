import React, { useState, useRef } from 'react';
import { updatePlayer } from '../../utils/api';
import { getAvatarUrl } from '../AvatarPicker';

export default function SeedingPanel({ players, tournamentId, onUpdate }) {
  const [seeds, setSeeds] = useState(() =>
    [...players].sort((a, b) => (a.seed_rank || 999) - (b.seed_rank || 999))
  );
  const [saving, setSaving] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const dragRef = useRef(null);

  const handleDragStart = (e, idx) => {
    setDragIdx(idx);
    dragRef.current = idx;
    e.dataTransfer.effectAllowed = 'move';
    // Required for Firefox
    e.dataTransfer.setData('text/plain', idx.toString());
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverIdx(idx);
  };

  const handleDragEnd = () => {
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      setSeeds(prev => {
        const next = [...prev];
        const [moved] = next.splice(dragIdx, 1);
        next.splice(overIdx, 0, moved);
        return next;
      });
    }
    setDragIdx(null);
    setOverIdx(null);
    dragRef.current = null;
  };

  const handleAutoSeed = () => {
    setSeeds(prev =>
      [...prev].sort((a, b) => (b.pumbility || 0) - (a.pumbility || 0))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all(
        seeds.map((player, idx) =>
          updatePlayer(player.id, { seed_rank: idx + 1 })
        )
      );
      onUpdate();
    } catch (err) {
      console.error('Failed to save seeds:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-bold text-sm text-piu-accent uppercase tracking-wider">
          Seeding Order
        </h3>
        <div className="flex gap-2">
          <button
            onClick={handleAutoSeed}
            className="btn-secondary text-xs"
          >
            Auto-seed by Pumbility
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary text-xs"
          >
            {saving ? 'Saving...' : 'Save Seeds'}
          </button>
        </div>
      </div>

      <div className="bg-piu-card border border-piu-border rounded-lg overflow-hidden">
        {seeds.map((player, idx) => (
          <div
            key={player.id}
            draggable="true"
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragEnd={handleDragEnd}
            onDragLeave={() => { if (overIdx === idx) setOverIdx(null); }}
            className={`flex items-center gap-3 px-3 py-2 transition-all cursor-grab active:cursor-grabbing select-none
              ${dragIdx === idx ? 'opacity-50' : ''}
              ${overIdx === idx && dragIdx !== null && dragIdx !== idx
                ? (dragIdx < idx ? 'border-b-2 border-b-piu-accent' : 'border-t-2 border-t-piu-accent')
                : 'border-b border-b-piu-border/30 last:border-b-0'}
            `}
          >
            {/* Drag handle */}
            <span className="text-gray-600 text-lg leading-none shrink-0 w-5 text-center" aria-label="Drag to reorder">
              &#10495;
            </span>

            {/* Seed number */}
            <span className="font-mono text-xs text-gray-500 w-5 text-right shrink-0">
              {idx + 1}
            </span>

            {/* Avatar */}
            {player.avatar ? (
              <img
                src={getAvatarUrl(player.avatar)}
                alt=""
                className="w-7 h-7 rounded-full object-cover shrink-0"
                draggable={false}
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-[10px] shrink-0">
                {player.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
              </div>
            )}

            {/* Player name */}
            <span className="font-display font-bold text-sm flex-1 min-w-0 truncate">
              {player.name}
            </span>

            {/* Pumbility */}
            {player.pumbility > 0 && (
              <span className="text-xs text-piu-gold font-mono font-bold shrink-0">
                {player.pumbility.toLocaleString()}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
