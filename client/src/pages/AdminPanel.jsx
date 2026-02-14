import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAvatarUrl } from '../components/AvatarPicker';
import {
  getTournaments, getArchivedTournaments, archiveTournament, deleteTournament,
  getNotices, createNotice, updateNotice, deleteNotice,
} from '../utils/api';

const PHASE_LABELS = {
  SETUP: 'Setup',
  ROUND_ROBIN: 'Round Robin',
  COMPLETED: 'Completed',
};

export default function AdminPanel() {
  const [tab, setTab] = useState('tournaments');
  const [tournaments, setTournaments] = useState([]);
  const [archived, setArchived] = useState([]);
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(false);

  // Notice form
  const [noticeForm, setNoticeForm] = useState({ title: '', content: '', pinned: false });
  const [editingNotice, setEditingNotice] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = () => {
    getTournaments().then(setTournaments).catch(() => {});
    getArchivedTournaments().then(setArchived).catch(() => {});
    getNotices().then(setNotices).catch(() => {});
  };

  const handleArchive = async (id) => {
    await archiveTournament(id, true);
    await loadAll();
  };

  const handleUnarchive = async (id) => {
    await archiveTournament(id, false);
    await loadAll();
  };

  const handleDeleteTournament = async (id) => {
    if (!confirm('Permanently delete this tournament? This cannot be undone.')) return;
    await deleteTournament(id);
    await loadAll();
  };

  const handleNoticeSubmit = async (e) => {
    e.preventDefault();
    if (!noticeForm.title.trim() || !noticeForm.content.trim()) return;
    setSaving(true);
    try {
      if (editingNotice) {
        await updateNotice(editingNotice.id, noticeForm);
      } else {
        await createNotice(noticeForm);
      }
      setNoticeForm({ title: '', content: '', pinned: false });
      setEditingNotice(null);
      await loadAll();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEditNotice = (notice) => {
    setEditingNotice(notice);
    setNoticeForm({ title: notice.title, content: notice.content, pinned: !!notice.pinned });
  };

  const handleDeleteNotice = async (id) => {
    if (!confirm('Delete this notice?')) return;
    await deleteNotice(id);
    await loadAll();
  };

  const handleTogglePin = async (notice) => {
    await updateNotice(notice.id, { pinned: !notice.pinned });
    await loadAll();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-display font-bold tracking-wider">ADMIN PANEL</h1>
        <Link to="/" className="text-sm text-gray-400 hover:text-white transition-colors font-display">
          Back to site
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {['tournaments', 'archived', 'notices'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg font-display text-sm font-bold transition-colors ${
              tab === t ? 'bg-piu-accent text-white' : 'bg-piu-card text-gray-400 hover:text-white'
            }`}
          >
            {t === 'tournaments' ? `Active (${tournaments.length})` :
             t === 'archived' ? `Archived (${archived.length})` :
             `Notices (${notices.length})`}
          </button>
        ))}
      </div>

      {/* Active Tournaments Tab */}
      {tab === 'tournaments' && (
        <div className="space-y-3">
          {tournaments.length === 0 ? (
            <p className="text-gray-500 text-center py-10">No active tournaments</p>
          ) : tournaments.map(t => (
            <div key={t.id} className="card flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                {t.avatar ? (
                  <img src={getAvatarUrl(t.avatar)} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 bg-gradient-to-br from-piu-accent to-purple-700 rounded-lg flex items-center justify-center font-display font-bold shrink-0">
                    {t.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <Link to={`/tournament/${t.id}`} className="font-display font-bold truncate block hover:text-piu-accent transition-colors">
                    {t.name}
                  </Link>
                  <div className="flex gap-2 text-xs text-gray-500">
                    {t.location && <span>{t.location}</span>}
                    <span className={`badge text-[10px] ${
                      t.phase === 'COMPLETED' ? 'badge-completed' : t.phase === 'SETUP' ? 'badge-pending' : 'badge-active'
                    }`}>{PHASE_LABELS[t.phase] || t.phase}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleArchive(t.id)}
                className="text-xs font-display px-3 py-1.5 rounded bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors shrink-0"
              >
                Archive
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Archived Tournaments Tab */}
      {tab === 'archived' && (
        <div className="space-y-3">
          {archived.length === 0 ? (
            <p className="text-gray-500 text-center py-10">No archived tournaments</p>
          ) : archived.map(t => (
            <div key={t.id} className="card flex items-center justify-between opacity-70">
              <div className="flex items-center gap-3 min-w-0">
                {t.avatar ? (
                  <img src={getAvatarUrl(t.avatar)} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center font-display font-bold shrink-0">
                    {t.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <span className="font-display font-bold truncate block">{t.name}</span>
                  <div className="flex gap-2 text-xs text-gray-500">
                    {t.location && <span>{t.location}</span>}
                    {t.date && <span>{t.date}</span>}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleUnarchive(t.id)}
                  className="text-xs font-display px-3 py-1.5 rounded bg-piu-green/10 text-piu-green hover:bg-piu-green/20 transition-colors"
                >
                  Restore
                </button>
                <button
                  onClick={() => handleDeleteTournament(t.id)}
                  className="text-xs font-display px-3 py-1.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Notices Tab */}
      {tab === 'notices' && (
        <div className="space-y-6">
          {/* Notice Form */}
          <form onSubmit={handleNoticeSubmit} className="card space-y-3">
            <h3 className="font-display font-bold text-piu-accent">
              {editingNotice ? 'Edit Notice' : 'Post New Notice'}
            </h3>
            <input
              type="text"
              className="input-field"
              placeholder="Notice title"
              value={noticeForm.title}
              onChange={e => setNoticeForm(f => ({ ...f, title: e.target.value }))}
              required
            />
            <textarea
              className="input-field min-h-[100px] resize-y"
              placeholder="Notice content (supports plain text)"
              value={noticeForm.content}
              onChange={e => setNoticeForm(f => ({ ...f, content: e.target.value }))}
              required
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={noticeForm.pinned}
                  onChange={e => setNoticeForm(f => ({ ...f, pinned: e.target.checked }))}
                  className="rounded"
                />
                Pin to top
              </label>
              <div className="flex gap-2">
                {editingNotice && (
                  <button
                    type="button"
                    onClick={() => { setEditingNotice(null); setNoticeForm({ title: '', content: '', pinned: false }); }}
                    className="btn-secondary text-sm"
                  >
                    Cancel
                  </button>
                )}
                <button type="submit" className="btn-primary text-sm" disabled={saving}>
                  {saving ? 'Saving...' : editingNotice ? 'Update' : 'Post Notice'}
                </button>
              </div>
            </div>
          </form>

          {/* Existing Notices */}
          <div className="space-y-3">
            {notices.length === 0 ? (
              <p className="text-gray-500 text-center py-10">No notices posted</p>
            ) : notices.map(n => (
              <div key={n.id} className={`card ${n.pinned ? 'border-piu-accent/30' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {n.pinned ? <span className="text-xs text-piu-accent font-display">PINNED</span> : null}
                      <h4 className="font-display font-bold truncate">{n.title}</h4>
                    </div>
                    <p className="text-sm text-gray-400 mt-1 line-clamp-2 whitespace-pre-wrap">{n.content}</p>
                    <p className="text-xs text-gray-600 mt-2">{new Date(n.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handleTogglePin(n)}
                      className={`text-xs px-2 py-1 rounded transition-colors ${
                        n.pinned ? 'text-piu-accent bg-piu-accent/10' : 'text-gray-500 hover:text-piu-accent'
                      }`}
                      title={n.pinned ? 'Unpin' : 'Pin'}
                    >
                      {n.pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                      onClick={() => handleEditNotice(n)}
                      className="text-xs px-2 py-1 rounded text-gray-500 hover:text-white transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteNotice(n.id)}
                      className="text-xs px-2 py-1 rounded text-gray-500 hover:text-red-400 transition-colors"
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
    </div>
  );
}
