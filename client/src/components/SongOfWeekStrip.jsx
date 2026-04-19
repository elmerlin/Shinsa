import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getSongOfWeekFeed, getJacketMap } from '../utils/api';
import PiuChartJacket, { resolveChartJacketUrl } from './PiuChartJacket';
import { getAvatarUrl } from './AvatarPicker';
import { getProfilePath } from '../utils/profile';

function modeShort(mode) {
  if (mode === 'Single') return 'S';
  if (mode === 'Double') return 'D';
  if (mode === 'CoOp') return 'C';
  return '';
}

export default function SongOfWeekStrip() {
  const { user } = useAuth();
  const [picks, setPicks] = useState(null);
  const [jacketLookup, setJacketLookup] = useState({});

  useEffect(() => {
    let cancelled = false;
    const primaryScope = user ? 'following' : 'global';
    getSongOfWeekFeed(primaryScope)
      .then(async (rows) => {
        if (cancelled) return;
        let list = Array.isArray(rows) ? rows : [];
        if (list.length === 0 && user) {
          const fallback = await getSongOfWeekFeed('global').catch(() => []);
          list = Array.isArray(fallback) ? fallback : [];
        }
        if (!cancelled) setPicks(list);
      })
      .catch(() => {
        if (!cancelled) setPicks([]);
      });
    getJacketMap().then((m) => { if (!cancelled) setJacketLookup(m || {}); }).catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  if (picks === null || picks.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="mb-2.5 flex items-center gap-2">
        <h2 className="font-display text-sm font-bold tracking-wider text-piu-accent">SONG OF THE WEEK</h2>
        <div className="h-px flex-1 bg-gradient-to-r from-piu-accent/30 to-transparent" />
        <Link to="/song-of-the-week" className="text-[11px] font-display text-gray-400 hover:text-piu-accent whitespace-nowrap">
          See all &rarr;
        </Link>
      </div>

      <div className="-mx-2 px-2 overflow-x-auto touch-pan-x [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex gap-2 pb-1">
          {picks.map((pick) => {
            const jacketUrl = resolveChartJacketUrl({
              title: pick.song_title_snapshot,
              mode: pick.mode,
              level: pick.level,
              jacketLookup,
              jacketUrl: pick.jacket_url_snapshot,
            });
            const avatarUrl = pick.avatar ? getAvatarUrl(pick.avatar) : '';
            return (
              <Link
                key={pick.id}
                to={`/song-of-the-week/${pick.id}`}
                className="group flex items-center gap-2 shrink-0 w-[220px] rounded-lg border border-piu-border/50 bg-piu-card p-2 hover:border-piu-accent/50 transition-colors"
              >
                <PiuChartJacket
                  title={pick.song_title_snapshot}
                  mode={pick.mode}
                  level={pick.level}
                  jacketUrl={jacketUrl}
                  size="wide"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 min-w-0">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" />
                    ) : null}
                    <span className="text-[10px] font-display font-bold text-gray-300 truncate group-hover:text-white">
                      {pick.username}
                    </span>
                  </div>
                  <p className="text-xs font-display font-bold text-white truncate mt-0.5">
                    {pick.song_title_snapshot}
                  </p>
                  <p className="text-[10px] text-gray-500 truncate">
                    {modeShort(pick.mode)}{pick.level}
                    {typeof pick.comment_count === 'number' && pick.comment_count > 0
                      ? ` · ${pick.comment_count} comment${pick.comment_count === 1 ? '' : 's'}`
                      : ''}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
