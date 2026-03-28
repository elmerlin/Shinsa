import React, { useState, useRef } from 'react';
import { updatePlayer } from '../../utils/api';
import { getAvatarUrl } from '../AvatarPicker';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';

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
      <Card className="border-white/8 bg-zinc-950/60">
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Seeding Order</Badge>
                <Badge variant="default">Drag to reorder</Badge>
              </div>
              <p className="mt-2 text-sm text-zinc-400">
                Seed order controls bracket placement. Auto-seed uses current pumbility, but you can drag players into any order before saving.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
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

          <div className="overflow-hidden rounded-[1rem] border border-white/8 bg-black/20">
            {seeds.map((player, idx) => (
              <div
                key={player.id}
                draggable="true"
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                onDragLeave={() => { if (overIdx === idx) setOverIdx(null); }}
                className={`flex items-center gap-3 px-3 py-3 transition-all cursor-grab active:cursor-grabbing select-none
                  ${dragIdx === idx ? 'opacity-50' : ''}
                  ${overIdx === idx && dragIdx !== null && dragIdx !== idx
                    ? (dragIdx < idx ? 'border-b-2 border-b-piu-accent' : 'border-t-2 border-t-piu-accent')
                    : 'border-b border-b-piu-border/30 last:border-b-0'}
                `}
              >
                <span className="w-5 shrink-0 text-center text-lg leading-none text-gray-600" aria-label="Drag to reorder">
                  &#10495;
                </span>

                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/5 font-mono text-xs text-zinc-400">
                  {idx + 1}
                </span>

                {player.avatar ? (
                  <img
                    src={getAvatarUrl(player.avatar)}
                    alt=""
                    className="h-9 w-9 rounded-full object-cover shrink-0 ring-1 ring-white/10"
                    draggable={false}
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-piu-accent to-purple-700 font-display text-[10px] font-bold text-white shrink-0 ring-1 ring-white/10">
                    {player.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                )}

                <span className="min-w-0 flex-1 truncate font-display text-sm font-bold text-white">
                  {player.name}
                </span>

                {player.pumbility > 0 && (
                  <span className="shrink-0 text-xs font-mono font-bold text-piu-gold">
                    {player.pumbility.toLocaleString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
