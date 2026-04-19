import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  getSongOfWeekItem,
  getSongOfWeekComments,
  addSongOfWeekComment,
  deleteSongOfWeekComment,
  getJacketMap,
  getChartKeyMap,
} from '../utils/api';
import ItemCommentSection from '../components/ItemCommentSection';
import PiuChartJacket, { resolveChartJacketUrl } from '../components/PiuChartJacket';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getProfilePath } from '../utils/profile';
import { renderFormattedText } from '../utils/formatText';
import SongOfWeekComposerModal from '../components/SongOfWeekComposerModal';
import { parseGrade } from '../utils/grades';

function modeShort(mode) {
  if (mode === 'Single') return 'S';
  if (mode === 'Double') return 'D';
  if (mode === 'CoOp') return 'C';
  return mode || '';
}

function formatDate(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts.endsWith('Z') ? ts : `${ts}Z`);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function SongOfWeekDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const focusCommentId = new URLSearchParams(location.search).get('comment');
  const [pick, setPick] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [jacketLookup, setJacketLookup] = useState({});
  const [chartKeyMap, setChartKeyMap] = useState({});
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getSongOfWeekItem(id)
      .then((data) => {
        if (!cancelled) setPick(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Not found');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    getJacketMap().then(setJacketLookup).catch(() => {});
    getChartKeyMap().then(setChartKeyMap).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  const jacketUrl = useMemo(() => {
    if (!pick) return '';
    return resolveChartJacketUrl({
      title: pick.song_title_snapshot,
      mode: pick.mode,
      level: pick.level,
      jacketLookup,
      jacketUrl: pick.jacket_url_snapshot,
    });
  }, [pick, jacketLookup]);

  if (loading) {
    return <div className="max-w-2xl mx-auto px-4 py-12 text-center text-gray-500">Loading...</div>;
  }
  if (error || !pick) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-gray-500">
        {error || 'Song of the Week pick not found'}
      </div>
    );
  }

  const normalizedTitle = String(pick.song_title_snapshot || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const exactKey = `${normalizedTitle}|${pick.mode}|${pick.level}`;
  const chartKeyId = chartKeyMap?.[exactKey] || chartKeyMap?.[normalizedTitle];
  const chartLink = chartKeyId
    ? `/songs/chart/${chartKeyId}`
    : pick.chart_id
      ? `/songs/chart/${pick.chart_id}`
      : `/songs?q=${encodeURIComponent(pick.song_title_snapshot || '')}`;

  const isOwner = user && user.id === pick.user_id;
  const avatarUrl = pick.avatar ? getAvatarUrl(pick.avatar) : '';
  const play = pick.linked_play;
  const playScore = play ? parseInt(play.score, 10) || 0 : 0;
  const playGrade = play ? parseGrade(play.grade || '').display : '';

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link
        to="/song-of-the-week"
        className="text-xs text-gray-500 hover:text-piu-accent font-display mb-4 inline-block"
      >
        &larr; Back to Song of the Week
      </Link>

      <div className="card">
        <div className="flex items-center gap-3 mb-3">
          {avatarUrl ? (
            <Link to={getProfilePath(pick.user_id, pick.username)}>
              <img
                src={avatarUrl}
                alt=""
                className="w-10 h-10 rounded-full border-2 border-piu-border object-cover"
              />
            </Link>
          ) : null}
          <div className="flex-1 min-w-0">
            <Link
              to={getProfilePath(pick.user_id, pick.username)}
              className="font-display font-bold text-white hover:text-piu-accent"
            >
              {pick.username}
            </Link>
            <p className="text-[10px] text-gray-500">
              Song of the Week &middot; {formatDate(pick.updated_at || pick.created_at)}
            </p>
          </div>
          {isOwner && (
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="text-[11px] text-piu-accent hover:text-piu-accent/80 font-display font-bold"
            >
              Edit pick
            </button>
          )}
        </div>

        <div className="flex gap-3">
          <Link to={chartLink} className="group shrink-0">
            <PiuChartJacket
              title={pick.song_title_snapshot}
              mode={pick.mode}
              level={pick.level}
              jacketUrl={jacketUrl}
              size="wide"
              imageClassName="group-hover:scale-[1.04]"
            />
          </Link>
          <div className="flex-1 min-w-0">
            <Link to={chartLink} className="block hover:opacity-90">
              <p className="text-base font-display font-bold text-white truncate">
                {pick.song_title_snapshot}
              </p>
              {pick.artist_snapshot && (
                <p className="text-xs text-gray-400 truncate">{pick.artist_snapshot}</p>
              )}
            </Link>
            <p className="text-[11px] text-gray-500 mt-1">
              {modeShort(pick.mode)}
              {pick.level || ''} &middot;{' '}
              <Link to={chartLink} className="hover:text-piu-accent">
                Open chart page
              </Link>
            </p>
          </div>
        </div>

        {pick.caption && (
          <p className="text-sm text-gray-200 mt-3 break-words">
            {renderFormattedText(pick.caption)}
          </p>
        )}

        {play && (
          <div className="mt-3 rounded-lg border border-sky-500/20 bg-sky-500/5 p-2 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-[0.12em] text-sky-300 font-display font-bold">
                Linked recent play
              </p>
              <p className="text-xs text-gray-200 truncate">
                {play.song_title} &middot; {modeShort(play.mode)}
                {play.level || ''}
                {play.plate ? ` · ${play.plate}` : ''}
              </p>
            </div>
            <div className="text-right shrink-0">
              {playGrade && (
                <p className="text-xs font-display font-bold text-piu-gold">{playGrade}</p>
              )}
              <p className="font-mono text-xs font-bold text-gray-300">
                {playScore.toLocaleString()}
              </p>
              {play.id && (
                <Link
                  to={`/play/${play.id}`}
                  className="text-[9px] text-sky-300 hover:text-sky-200 font-display"
                >
                  View play &rarr;
                </Link>
              )}
            </div>
          </div>
        )}

        <div className="border-t border-piu-border/20 pt-2 mt-4">
          <ItemCommentSection
            itemId={pick.id}
            commentCount={pick.comment_count || 0}
            commentType="song_of_week"
            getCommentsFn={getSongOfWeekComments}
            addCommentFn={addSongOfWeekComment}
            deleteCommentFn={deleteSongOfWeekComment}
            focusCommentId={focusCommentId}
            ownerId={pick.user_id}
          />
        </div>
      </div>

      <SongOfWeekComposerModal
        open={composerOpen}
        existingPick={pick}
        onClose={() => setComposerOpen(false)}
        onSaved={(saved) => setPick(saved)}
      />
    </div>
  );
}
