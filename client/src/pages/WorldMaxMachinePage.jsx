import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from '../components/AvatarPicker';
import {
  addWorldMaxMachinePhoto,
  addWorldMaxMachineReview,
  getWorldMaxMachine,
  getWorldMaxMeta,
} from '../utils/api';

function formatDate(dateStr) {
  const d = new Date(String(dateStr || '').replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return 'Unknown date';
  return d.toLocaleString();
}

function mapByCode(items) {
  const map = {};
  for (const item of items || []) {
    map[item.code] = item;
  }
  return map;
}

export default function WorldMaxMachinePage() {
  const { id } = useParams();
  const { user } = useAuth();

  const [meta, setMeta] = useState({ game_options: [], machine_options: [] });
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [reviewForm, setReviewForm] = useState({ rating: 4, comment: '' });
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const [photoFile, setPhotoFile] = useState(null);
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoSubmitting, setPhotoSubmitting] = useState(false);

  const gamesByCode = useMemo(() => mapByCode(meta.game_options), [meta.game_options]);
  const machinesByCode = useMemo(() => mapByCode(meta.machine_options), [meta.machine_options]);

  const loadDetail = async () => {
    setLoading(true);
    setError('');
    try {
      const [metaData, machineData] = await Promise.all([
        getWorldMaxMeta(),
        getWorldMaxMachine(id),
      ]);
      setMeta(metaData || { game_options: [], machine_options: [] });
      setDetail(machineData);
    } catch (err) {
      setError(err.message || 'Failed to load machine location.');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [id]);

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;

    setReviewSubmitting(true);
    try {
      await addWorldMaxMachineReview(id, reviewForm);
      setReviewForm({ rating: 4, comment: '' });
      await loadDetail();
    } catch {
      // keep state
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handlePhotoSubmit = async (e) => {
    e.preventDefault();
    if (!user || !photoFile) return;

    setPhotoSubmitting(true);
    try {
      await addWorldMaxMachinePhoto(id, photoFile, photoCaption);
      setPhotoFile(null);
      setPhotoCaption('');
      const input = document.getElementById('machine-photo-detail-input');
      if (input) input.value = '';
      await loadDetail();
    } catch {
      // keep state
    } finally {
      setPhotoSubmitting(false);
    }
  };

  if (loading) {
    return <div className="max-w-5xl mx-auto px-4 py-12 text-center text-gray-500">Loading machine location...</div>;
  }

  if (error || !detail?.machine) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="card border-red-500/40 text-red-200 bg-red-900/20">
          {error || 'Machine location not found.'}
        </div>
        <div className="mt-4">
          <Link to="/world-max" className="text-sm text-piu-accent hover:underline">Back to World Max</Link>
        </div>
      </div>
    );
  }

  const machine = detail.machine;
  const gameOption = gamesByCode[machine.game_code] || null;
  const machineOption = machinesByCode[machine.machine_code] || null;

  const gameImage = machine.game_image_url || gameOption?.image_url || '';
  const machineImage = machine.machine_image_url || machineOption?.image_url || '';

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-wide">MACHINE LOCATION</h1>
        <Link to="/world-max" className="text-sm text-piu-accent hover:underline font-display">Back to World Max</Link>
      </div>

      <section className="card">
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
          <div className="space-y-2">
            <h2 className="text-xl font-display font-bold text-white">
              {machine.venue_name || `${machine.city}, ${machine.country}`}
            </h2>
            <p className="text-sm text-gray-300">{machine.city}, {machine.country}</p>
            <p className="text-sm text-gray-400">{machine.address}</p>
            <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-xs font-display font-bold">
              Price per credit: {machine.price_per_credit}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="rounded-lg border border-piu-border/50 bg-piu-dark/40 p-2">
                <p className="text-[10px] text-gray-500 mb-1">Game</p>
                {gameImage ? (
                  <img src={gameImage} alt={machine.game_name} className="w-full h-24 object-cover rounded-md border border-piu-border/40" />
                ) : (
                  <div className="w-full h-24 rounded-md bg-piu-dark border border-piu-border/40" />
                )}
                <p className="text-xs text-gray-300 mt-1 truncate">{machine.game_name}</p>
              </div>

              <div className="rounded-lg border border-piu-border/50 bg-piu-dark/40 p-2">
                <p className="text-[10px] text-gray-500 mb-1">Machine</p>
                {machineImage ? (
                  <img src={machineImage} alt={machine.machine_name} className="w-full h-24 object-cover rounded-md border border-piu-border/40" />
                ) : (
                  <div className="w-full h-24 rounded-md bg-piu-dark border border-piu-border/40" />
                )}
                <p className="text-xs text-gray-300 mt-1 truncate">{machine.machine_name}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-piu-border/60 bg-piu-dark/40 p-3 space-y-2">
            <p className="text-xs text-gray-500">Community stats</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-piu-card/70 p-2 border border-piu-border/50">
                <p className="text-[11px] text-gray-500">Reviews</p>
                <p className="text-lg font-display font-bold text-white">{machine.review_count}</p>
              </div>
              <div className="rounded-lg bg-piu-card/70 p-2 border border-piu-border/50">
                <p className="text-[11px] text-gray-500">Photos</p>
                <p className="text-lg font-display font-bold text-white">{machine.photo_count}</p>
              </div>
              <div className="rounded-lg bg-piu-card/70 p-2 border border-piu-border/50">
                <p className="text-[11px] text-gray-500">Avg</p>
                <p className="text-lg font-display font-bold text-amber-300">{Number(machine.avg_rating || 0).toFixed(1)}</p>
              </div>
            </div>
            <p className="text-[11px] text-gray-500">Added by {machine.added_by_username || 'Unknown'} on {formatDate(machine.created_at)}</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4">
        <section className="card space-y-3">
          <h3 className="text-sm font-display font-bold text-piu-accent">Reviews</h3>

          {user ? (
            <form onSubmit={handleReviewSubmit} className="space-y-2 border border-piu-border/40 rounded-lg p-3 bg-piu-dark/40">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">Rating</label>
                <select
                  className="input-field max-w-[120px]"
                  value={reviewForm.rating}
                  onChange={(e) => setReviewForm((prev) => ({ ...prev, rating: parseInt(e.target.value, 10) || 0 }))}
                >
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n === 0 ? 'No score' : `${n} / 5`}</option>
                  ))}
                </select>
              </div>
              <textarea
                className="input-field resize-none"
                rows="3"
                placeholder="How is this machine?"
                value={reviewForm.comment}
                onChange={(e) => setReviewForm((prev) => ({ ...prev, comment: e.target.value }))}
                required
              />
              <button type="submit" disabled={reviewSubmitting} className="btn-primary w-full text-sm py-2">
                {reviewSubmitting ? 'Posting review...' : 'Post Review'}
              </button>
            </form>
          ) : (
            <p className="text-xs text-gray-500">Log in to post a review.</p>
          )}

          {detail.reviews?.length > 0 ? (
            <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
              {detail.reviews.map((review) => (
                <div key={review.id} className="rounded-lg border border-piu-border/40 bg-piu-dark/50 p-2.5">
                  <div className="flex items-center gap-2">
                    {review.avatar ? (
                      <img src={getAvatarUrl(review.avatar)} alt={review.username} className="w-7 h-7 rounded-full object-cover border border-piu-border" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-piu-card border border-piu-border flex items-center justify-center text-[10px] font-display font-bold">
                        {(review.username || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-display font-bold text-white truncate">{review.username}</p>
                      <p className="text-[10px] text-gray-500">{formatDate(review.created_at)}</p>
                    </div>
                    <span className="text-xs text-amber-300 font-display font-bold">{review.rating > 0 ? `⭐ ${review.rating}/5` : 'No score'}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-300 whitespace-pre-wrap break-words">{review.comment}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500">No reviews yet.</p>
          )}
        </section>

        <section className="card space-y-3">
          <h3 className="text-sm font-display font-bold text-piu-accent">Photos</h3>

          {user ? (
            <form onSubmit={handlePhotoSubmit} className="space-y-2 border border-piu-border/40 rounded-lg p-3 bg-piu-dark/40">
              <input
                id="machine-photo-detail-input"
                type="file"
                accept="image/*"
                className="block w-full text-xs text-gray-300"
                onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
              />
              <input
                type="text"
                className="input-field"
                placeholder="Optional caption"
                value={photoCaption}
                onChange={(e) => setPhotoCaption(e.target.value)}
              />
              <button type="submit" disabled={photoSubmitting || !photoFile} className="btn-secondary w-full text-sm py-2">
                {photoSubmitting ? 'Uploading...' : 'Upload Photo'}
              </button>
            </form>
          ) : (
            <p className="text-xs text-gray-500">Log in to upload photos.</p>
          )}

          {detail.photos?.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[540px] overflow-y-auto pr-1">
              {detail.photos.map((photo) => (
                <figure key={photo.id} className="rounded-lg overflow-hidden border border-piu-border/40 bg-piu-dark/60">
                  <img src={photo.image_data} alt={photo.caption || 'Machine photo'} className="w-full h-40 object-cover" />
                  <figcaption className="px-2 py-1.5 text-[10px] text-gray-300 space-y-0.5">
                    <p className="font-display font-bold text-gray-200 truncate">{photo.username}</p>
                    {photo.caption && <p className="break-words">{photo.caption}</p>}
                    <p className="text-gray-500">{formatDate(photo.created_at)}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500">No photos yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
