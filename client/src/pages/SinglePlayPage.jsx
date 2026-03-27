import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getPlay } from '../utils/api';
import ScoreSnapshotModal from '../components/ScoreSnapshotModal';
import { getAvatarUrl } from '../components/AvatarPicker';

export default function SinglePlayPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const focusCommentId = searchParams.get('comment') || '';
  const [play, setPlay] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    getPlay(id)
      .then((data) => {
        setPlay(data);
      })
      .catch((err) => {
        setError(err?.message || 'Play not found');
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-gray-500 font-display">Loading...</p>
      </div>
    );
  }

  if (error || !play) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-red-400 font-display">{error || 'Play not found'}</p>
      </div>
    );
  }

  const avatarUrl = play.avatar ? getAvatarUrl(play.avatar) : '';

  return (
    <ScoreSnapshotModal
      open
      score={play}
      jacketUrl={play.background_url || ''}
      avatarUrl={avatarUrl}
      skillTitle={play.skill_title || ''}
      playId={play.id || parseInt(id, 10)}
      focusCommentId={focusCommentId ? parseInt(focusCommentId, 10) : null}
      onClose={() => {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.location.href = '/';
        }
      }}
    />
  );
}
