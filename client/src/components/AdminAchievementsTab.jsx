import React, { useEffect, useState, useMemo } from 'react';
import {
  getAdminAchievements,
  createAdminAchievementSeries,
  updateAdminAchievementSeries,
  deleteAdminAchievementSeries,
  createAdminAchievementTier,
  updateAdminAchievementTier,
  deleteAdminAchievementTier,
  evaluateAchievements,
} from '../utils/api';

export default function AdminAchievementsTab() {
  const [seriesList, setSeriesList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Series form
  const [seriesForm, setSeriesForm] = useState({ key: '', name: '', description: '' });
  const [editingSeriesId, setEditingSeriesId] = useState('');
  const [seriesSaving, setSeriesSaving] = useState(false);

  // Selected series
  const [selectedSeriesId, setSelectedSeriesId] = useState('');

  // Tier form
  const [tierForm, setTierForm] = useState({ name: '', description: '', threshold: '', imageFile: null });
  const [editingTierId, setEditingTierId] = useState('');
  const [tierSaving, setTierSaving] = useState(false);
  const [tierImageInputKey, setTierImageInputKey] = useState(0);
  const [tierError, setTierError] = useState('');
  const [tierMessage, setTierMessage] = useState('');

  // Evaluate
  const [evaluating, setEvaluating] = useState(false);
  const [evalMessage, setEvalMessage] = useState('');

  const selectedSeries = useMemo(
    () => seriesList.find((s) => s.id === selectedSeriesId) || null,
    [seriesList, selectedSeriesId]
  );

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await getAdminAchievements();
      const next = Array.isArray(payload?.series) ? payload.series : [];
      setSeriesList(next);
      if (!next.length) {
        setSelectedSeriesId('');
      } else if (!next.some((s) => s.id === selectedSeriesId)) {
        setSelectedSeriesId(next[0].id);
      }
    } catch (err) {
      setError(err?.message || 'Failed to load achievements');
      setSeriesList([]);
      setSelectedSeriesId('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  // Series handlers
  const resetSeriesForm = () => {
    setSeriesForm({ key: '', name: '', description: '' });
    setEditingSeriesId('');
  };

  const handleSaveSeries = async (e) => {
    e.preventDefault();
    setSeriesSaving(true);
    setError('');
    setMessage('');
    try {
      if (editingSeriesId) {
        await updateAdminAchievementSeries(editingSeriesId, {
          name: seriesForm.name,
          description: seriesForm.description,
        });
        setMessage('Series updated.');
      } else {
        await createAdminAchievementSeries({
          key: seriesForm.key,
          name: seriesForm.name,
          description: seriesForm.description,
        });
        setMessage('Series created.');
      }
      resetSeriesForm();
      await loadAll();
    } catch (err) {
      setError(err?.message || 'Failed to save series');
    } finally {
      setSeriesSaving(false);
    }
  };

  const handleEditSeries = (series) => {
    setEditingSeriesId(series.id);
    setSeriesForm({ key: series.key, name: series.name, description: series.description || '' });
  };

  const handleDeleteSeries = async (series) => {
    if (!confirm(`Delete achievement series "${series.name}"? All tiers and awards will be removed.`)) return;
    setSeriesSaving(true);
    setError('');
    try {
      await deleteAdminAchievementSeries(series.id);
      setMessage('Series deleted.');
      if (selectedSeriesId === series.id) setSelectedSeriesId('');
      await loadAll();
    } catch (err) {
      setError(err?.message || 'Failed to delete series');
    } finally {
      setSeriesSaving(false);
    }
  };

  // Tier handlers
  const resetTierForm = () => {
    setTierForm({ name: '', description: '', threshold: '', imageFile: null });
    setEditingTierId('');
    setTierImageInputKey((k) => k + 1);
  };

  const handleSaveTier = async (e) => {
    e.preventDefault();
    if (!selectedSeriesId) return;
    setTierSaving(true);
    setTierError('');
    setTierMessage('');
    try {
      if (editingTierId) {
        await updateAdminAchievementTier(selectedSeriesId, editingTierId, {
          name: tierForm.name,
          description: tierForm.description,
          threshold: tierForm.threshold,
          imageFile: tierForm.imageFile,
        });
        setTierMessage('Tier updated.');
      } else {
        await createAdminAchievementTier(selectedSeriesId, {
          name: tierForm.name,
          description: tierForm.description,
          threshold: tierForm.threshold,
          imageFile: tierForm.imageFile,
        });
        setTierMessage('Tier created.');
      }
      resetTierForm();
      await loadAll();
    } catch (err) {
      setTierError(err?.message || 'Failed to save tier');
    } finally {
      setTierSaving(false);
    }
  };

  const handleEditTier = (tier) => {
    setEditingTierId(tier.id);
    setTierForm({
      name: tier.name,
      description: tier.description || '',
      threshold: String(tier.threshold),
      imageFile: null,
    });
    setTierImageInputKey((k) => k + 1);
  };

  const handleDeleteTier = async (tier) => {
    if (!confirm(`Delete tier "${tier.name}"? All awards for this tier will be removed.`)) return;
    setTierSaving(true);
    setTierError('');
    try {
      await deleteAdminAchievementTier(selectedSeriesId, tier.id);
      setTierMessage('Tier deleted.');
      await loadAll();
    } catch (err) {
      setTierError(err?.message || 'Failed to delete tier');
    } finally {
      setTierSaving(false);
    }
  };

  const handleEvaluate = async () => {
    if (!selectedSeries) return;
    setEvaluating(true);
    setEvalMessage('');
    try {
      const result = await evaluateAchievements(selectedSeries.key);
      setEvalMessage(`Evaluation complete. ${result.awarded || 0} new award(s) granted.`);
      await loadAll();
    } catch (err) {
      setEvalMessage(err?.message || 'Failed to evaluate');
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Series form */}
      <div className="card space-y-3">
        <form onSubmit={handleSaveSeries} className="space-y-3">
          <h4 className="font-display font-bold text-gray-200">
            {editingSeriesId ? 'Edit Achievement Series' : 'Create Achievement Series'}
          </h4>
          <p className="text-[11px] text-gray-500">
            A series is a category of achievement (e.g. "Pumps Received"). Each series contains tiers with thresholds and badges.
          </p>
          {!editingSeriesId && (
            <input
              type="text"
              className="input-field"
              placeholder="Unique key (e.g. pumps_received)"
              value={seriesForm.key}
              onChange={(e) => setSeriesForm((prev) => ({ ...prev, key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') }))}
              maxLength={64}
              required
            />
          )}
          <input
            type="text"
            className="input-field"
            placeholder="Display name (e.g. Pumps Received)"
            value={seriesForm.name}
            onChange={(e) => setSeriesForm((prev) => ({ ...prev, name: e.target.value }))}
            maxLength={80}
            required
          />
          <input
            type="text"
            className="input-field"
            placeholder="Description (optional)"
            value={seriesForm.description}
            onChange={(e) => setSeriesForm((prev) => ({ ...prev, description: e.target.value }))}
            maxLength={300}
          />
          <div className="flex items-center gap-2">
            <button type="submit" className="btn-primary text-sm" disabled={seriesSaving}>
              {seriesSaving ? 'Saving...' : editingSeriesId ? 'Save Series' : 'Create Series'}
            </button>
            {editingSeriesId && (
              <button type="button" className="btn-secondary text-sm" onClick={resetSeriesForm}>
                Cancel
              </button>
            )}
          </div>
        </form>

        {error && <p className="text-xs text-red-400">{error}</p>}
        {message && <p className="text-xs text-piu-green">{message}</p>}
      </div>

      {/* Series list / selector */}
      {loading ? (
        <p className="text-xs text-gray-500 py-2">Loading achievements...</p>
      ) : seriesList.length === 0 ? (
        <p className="text-xs text-gray-500 py-2">No achievement series created yet.</p>
      ) : (
        <div className="card space-y-3">
          <h4 className="font-display font-bold text-gray-200">Achievement Series</h4>
          <div className="space-y-2">
            {seriesList.map((series) => (
              <div
                key={series.id}
                className={`rounded-xl border px-3 py-2 cursor-pointer transition-colors ${
                  selectedSeriesId === series.id
                    ? 'border-piu-accent/60 bg-piu-accent/10'
                    : 'border-piu-border/50 bg-piu-dark/35 hover:border-piu-border'
                }`}
                onClick={() => setSelectedSeriesId(series.id)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-display font-bold truncate">{series.name}</p>
                    <p className="text-[10px] text-gray-500 truncate">
                      Key: <span className="font-mono">{series.key}</span> &bull; {(series.tiers || []).length} tier(s)
                    </p>
                    {series.description && <p className="text-[11px] text-gray-500 truncate mt-0.5">{series.description}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      className="px-2 py-1 rounded text-[11px] font-display font-bold text-gray-300 border border-piu-border/60 bg-piu-dark hover:text-white"
                      onClick={(e) => { e.stopPropagation(); handleEditSeries(series); }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="px-2 py-1 rounded text-[11px] font-display font-bold text-red-300 border border-red-500/40 bg-red-500/10 hover:text-red-200"
                      onClick={(e) => { e.stopPropagation(); handleDeleteSeries(series); }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected series — tiers */}
      {selectedSeries && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-display font-bold text-gray-200">
              Tiers for "{selectedSeries.name}"
            </h4>
            <button
              type="button"
              className="px-3 py-1.5 rounded text-xs font-display font-bold text-piu-accent border border-piu-accent/40 bg-piu-accent/10 hover:bg-piu-accent/20 transition-colors"
              onClick={handleEvaluate}
              disabled={evaluating}
            >
              {evaluating ? 'Evaluating...' : 'Evaluate & Award'}
            </button>
          </div>
          {evalMessage && <p className="text-xs text-piu-green">{evalMessage}</p>}
          <p className="text-[11px] text-gray-500">
            Each tier defines a threshold (e.g. 10 pumps) and a badge. Users who meet the threshold earn the badge.
          </p>

          {/* Tier form */}
          <form onSubmit={handleSaveTier} className="space-y-3 rounded-xl border border-piu-border/40 bg-piu-dark/25 p-3">
            <h5 className="font-display font-bold text-sm text-gray-200">
              {editingTierId ? 'Edit Tier' : 'Add Tier'}
            </h5>
            <input
              type="text"
              className="input-field"
              placeholder="Tier name (e.g. Pump Starter)"
              value={tierForm.name}
              onChange={(e) => setTierForm((prev) => ({ ...prev, name: e.target.value }))}
              maxLength={64}
              required
            />
            <input
              type="text"
              className="input-field"
              placeholder="Description shown when badge is clicked"
              value={tierForm.description}
              onChange={(e) => setTierForm((prev) => ({ ...prev, description: e.target.value }))}
              maxLength={200}
            />
            <input
              type="number"
              className="input-field"
              placeholder="Threshold (e.g. 10)"
              value={tierForm.threshold}
              onChange={(e) => setTierForm((prev) => ({ ...prev, threshold: e.target.value }))}
              min={1}
              required
            />
            <input
              key={tierImageInputKey}
              type="file"
              accept="image/*"
              className="text-xs text-gray-400 file:mr-3 file:px-3 file:py-1 file:rounded-lg file:border file:border-piu-border file:bg-piu-dark file:text-gray-300 file:cursor-pointer"
              onChange={(e) => setTierForm((prev) => ({ ...prev, imageFile: e.target.files?.[0] || null }))}
              required={!editingTierId}
            />
            <div className="flex items-center gap-2">
              <button type="submit" className="btn-primary text-sm" disabled={tierSaving}>
                {tierSaving ? 'Saving...' : editingTierId ? 'Save Tier' : 'Create Tier'}
              </button>
              {editingTierId && (
                <button type="button" className="btn-secondary text-sm" onClick={resetTierForm}>
                  Cancel
                </button>
              )}
            </div>
          </form>

          {tierError && <p className="text-xs text-red-400">{tierError}</p>}
          {tierMessage && <p className="text-xs text-piu-green">{tierMessage}</p>}

          {/* Tier list */}
          {(selectedSeries.tiers || []).length === 0 ? (
            <p className="text-xs text-gray-500 py-2">No tiers created for this series yet.</p>
          ) : (
            <div className="space-y-2">
              {(selectedSeries.tiers || []).map((tier) => (
                <div key={tier.id} className="rounded-xl border border-piu-border/50 bg-piu-dark/35 px-3 py-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg border border-piu-border/50 bg-piu-dark/60 overflow-hidden flex items-center justify-center shrink-0">
                      {tier.image ? (
                        <img src={tier.image} alt={tier.name} className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-[9px] text-gray-500">No image</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-display font-bold truncate">{tier.name}</p>
                      {tier.description && <p className="text-[11px] text-gray-500 truncate">{tier.description}</p>}
                      <p className="text-[10px] text-gray-500">
                        Threshold: <span className="font-mono text-piu-accent">{tier.threshold}</span> &bull; {tier.award_count || 0} user(s) awarded
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="px-2 py-1 rounded text-[11px] font-display font-bold text-gray-300 border border-piu-border/60 bg-piu-dark hover:text-white"
                      onClick={() => handleEditTier(tier)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="px-2 py-1 rounded text-[11px] font-display font-bold text-red-300 border border-red-500/40 bg-red-500/10 hover:text-red-200"
                      onClick={() => handleDeleteTier(tier)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
