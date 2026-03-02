import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getAvatarUrl } from '../components/AvatarPicker';
import MarkdownContent from '../components/MarkdownContent';
import AdminGroupsTab from '../components/AdminGroupsTab';
import AdminAchievementsTab from '../components/AdminAchievementsTab';
import { useAuth } from '../contexts/AuthContext';
import {
  getTournaments, getArchivedTournaments, archiveTournament, deleteTournament,
  getNotices, createNotice, updateNotice, deleteNotice,
  getChangelogEntries, createChangelogEntry, updateChangelogEntry, deleteChangelogEntry,
  getFunSettings, updateFunSettings,
  getAdminShoeCatalog, createAdminShoeCatalogEntry, updateAdminShoeCatalogEntry, deleteAdminShoeCatalogEntry, setAdminShoeCatalogDisplay,
  searchUsers, getAdminFeatures, getAdminFeatureUsers, grantAdminFeatureUser, revokeAdminFeatureUser,
} from '../utils/api';

const PHASE_LABELS = {
  SETUP: 'Setup',
  ROUND_ROBIN: 'Round Robin',
  COMPLETED: 'Completed',
};

function formatShoeLabel(shoe) {
  return `${shoe?.make || ''} ${shoe?.model || ''}`.replace(/\s+/g, ' ').trim() || 'Unnamed Shoe';
}

export default function AdminPanel() {
  const { user } = useAuth();
  const [tab, setTab] = useState('tournaments');
  const [tournaments, setTournaments] = useState([]);
  const [archived, setArchived] = useState([]);
  const [notices, setNotices] = useState([]);
  const [changelogEntries, setChangelogEntries] = useState([]);
  const [funSettings, setFunSettings] = useState({ devit_start_platform_lag: 3, updated_at: '' });
  const [funLagInput, setFunLagInput] = useState('3');
  const [funLoading, setFunLoading] = useState(false);
  const [funSaving, setFunSaving] = useState(false);
  const [funError, setFunError] = useState('');
  const [funSuccess, setFunSuccess] = useState('');
  const [features, setFeatures] = useState([
    { key: 'optimise', label: 'Optimise' },
    { key: 'checkin', label: 'Check In' },
  ]);
  const [selectedFeature, setSelectedFeature] = useState('optimise');
  const [permissionUsers, setPermissionUsers] = useState([]);
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [permissionSaving, setPermissionSaving] = useState(false);
  const [permissionError, setPermissionError] = useState('');
  const [permissionMessage, setPermissionMessage] = useState('');
  const [permissionSearchQuery, setPermissionSearchQuery] = useState('');
  const [permissionSuggestions, setPermissionSuggestions] = useState([]);
  const [permissionSearchOpen, setPermissionSearchOpen] = useState(false);
  const permissionSearchRef = useRef(null);
  const [shoeCatalog, setShoeCatalog] = useState([]);
  const [shoeCatalogLoading, setShoeCatalogLoading] = useState(false);
  const [shoeCatalogSaving, setShoeCatalogSaving] = useState(false);
  const [shoeCatalogError, setShoeCatalogError] = useState('');
  const [shoeCatalogMessage, setShoeCatalogMessage] = useState('');
  const [shoeCatalogQuery, setShoeCatalogQuery] = useState('');
  const [shoeCatalogPage, setShoeCatalogPage] = useState(1);
  const [shoeCatalogTotalPages, setShoeCatalogTotalPages] = useState(0);
  const [shoeCatalogTotal, setShoeCatalogTotal] = useState(0);
  const [shoeCatalogRefreshKey, setShoeCatalogRefreshKey] = useState(0);
  const [shoeDeleteConfirmId, setShoeDeleteConfirmId] = useState(null);
  const [shoeEditingId, setShoeEditingId] = useState(null);
  const [shoePhotoInputKey, setShoePhotoInputKey] = useState(0);
  const [shoeForm, setShoeForm] = useState({
    make: '',
    model: '',
    colorway: '',
    photoFile: null,
  });

  // Notice form
  const [noticeForm, setNoticeForm] = useState({ title: '', content: '', pinned: false });
  const [editingNotice, setEditingNotice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [changelogForm, setChangelogForm] = useState({ title: '', content: '', pinned: false });
  const [editingChangelog, setEditingChangelog] = useState(null);
  const [changelogSaving, setChangelogSaving] = useState(false);
  const changelogContentRef = useRef(null);

  useEffect(() => {
    if (!user?.is_admin) return;
    loadAll();
  }, [user?.is_admin]);

  useEffect(() => {
    if (tab !== 'shoes') return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      setShoeCatalogLoading(true);
      setShoeCatalogError('');
      getAdminShoeCatalog({ q: shoeCatalogQuery.trim(), limit: 6, page: shoeCatalogPage })
        .then((payload) => {
          if (cancelled) return;
          setShoeCatalog(Array.isArray(payload?.results) ? payload.results : []);
          setShoeCatalogTotal(parseInt(payload?.total, 10) || 0);
          setShoeCatalogTotalPages(parseInt(payload?.total_pages, 10) || 0);
          setShoeDeleteConfirmId(null);
        })
        .catch((err) => {
          if (cancelled) return;
          setShoeCatalog([]);
          setShoeCatalogTotal(0);
          setShoeCatalogTotalPages(0);
          setShoeCatalogError(err?.message || 'Failed to load shoe catalog');
        })
        .finally(() => {
          if (!cancelled) setShoeCatalogLoading(false);
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tab, shoeCatalogQuery, shoeCatalogPage, shoeCatalogRefreshKey]);

  const permissionUserIdSet = useMemo(
    () => new Set((Array.isArray(permissionUsers) ? permissionUsers : []).map((entry) => entry.id)),
    [permissionUsers]
  );

  useEffect(() => {
    if (tab !== 'permissions') return undefined;
    let cancelled = false;
    setPermissionLoading(true);
    setPermissionError('');

    Promise.all([
      getAdminFeatures().catch(() => null),
      getAdminFeatureUsers(selectedFeature).catch((err) => ({ error: err })),
    ])
      .then(([featurePayload, permissionPayload]) => {
        if (cancelled) return;
        const nextFeatures = Array.isArray(featurePayload?.features) && featurePayload.features.length > 0
          ? featurePayload.features
          : [
            { key: 'optimise', label: 'Optimise' },
            { key: 'checkin', label: 'Check In' },
          ];
        setFeatures(nextFeatures);
        if (!nextFeatures.some((item) => item.key === selectedFeature)) {
          setSelectedFeature(nextFeatures[0].key);
        }

        if (permissionPayload?.error) {
          setPermissionUsers([]);
          setPermissionError(permissionPayload.error?.message || 'Failed to load permissions');
          return;
        }
        setPermissionUsers(Array.isArray(permissionPayload?.users) ? permissionPayload.users : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setPermissionUsers([]);
        setPermissionError(err?.message || 'Failed to load permissions');
      })
      .finally(() => {
        if (!cancelled) setPermissionLoading(false);
      });

    return () => { cancelled = true; };
  }, [tab, selectedFeature]);

  useEffect(() => {
    if (tab !== 'permissions') return undefined;
    const q = permissionSearchQuery.trim();
    if (q.length < 2) {
      setPermissionSuggestions([]);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const users = await searchUsers(q);
        if (cancelled) return;
        const list = Array.isArray(users) ? users : [];
        setPermissionSuggestions(list.filter((entry) => entry.id !== user?.id && !permissionUserIdSet.has(entry.id)));
      } catch (err) {
        if (cancelled) return;
        setPermissionSuggestions([]);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tab, permissionSearchQuery, permissionUserIdSet, user?.id]);

  useEffect(() => {
    function handleDocClick(event) {
      if (!permissionSearchRef.current) return;
      if (!permissionSearchRef.current.contains(event.target)) {
        setPermissionSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, []);

  const loadAll = () => {
    if (!user?.is_admin) return;
    getTournaments().then(setTournaments).catch(() => {});
    getArchivedTournaments().then(setArchived).catch(() => {});
    getNotices().then(setNotices).catch(() => {});
    getChangelogEntries().then(setChangelogEntries).catch(() => {});
    getAdminShoeCatalog({ limit: 1, page: 1 })
      .then((payload) => {
        setShoeCatalogTotal(parseInt(payload?.total, 10) || 0);
      })
      .catch(() => {});
    setFunLoading(true);
    getFunSettings()
      .then((payload) => {
        const lag = Number.parseInt(payload?.devit_start_platform_lag, 10);
        const normalizedLag = Number.isFinite(lag) && lag > 0 ? lag : 3;
        setFunSettings({
          devit_start_platform_lag: normalizedLag,
          updated_at: payload?.updated_at || '',
        });
        setFunLagInput(String(normalizedLag));
        setFunError('');
      })
      .catch((err) => {
        setFunError(err?.message || 'Failed to load fun settings');
      })
      .finally(() => setFunLoading(false));
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

  const handleChangelogSubmit = async (e) => {
    e.preventDefault();
    if (!changelogForm.title.trim() || !changelogForm.content.trim()) return;
    setChangelogSaving(true);
    try {
      if (editingChangelog) {
        await updateChangelogEntry(editingChangelog.id, changelogForm);
      } else {
        await createChangelogEntry(changelogForm);
      }
      setChangelogForm({ title: '', content: '', pinned: false });
      setEditingChangelog(null);
      await loadAll();
    } catch (err) {
      alert(err.message);
    } finally {
      setChangelogSaving(false);
    }
  };

  const handleEditChangelog = (entry) => {
    setEditingChangelog(entry);
    setChangelogForm({
      title: entry.title || '',
      content: entry.content || '',
      pinned: !!entry.pinned,
    });
  };

  const handleDeleteChangelog = async (id) => {
    if (!confirm('Delete this changelog entry?')) return;
    await deleteChangelogEntry(id);
    await loadAll();
  };

  const handleToggleChangelogPin = async (entry) => {
    await updateChangelogEntry(entry.id, { pinned: !entry.pinned });
    await loadAll();
  };

  const applyChangelogInlineFormat = (prefix, suffix = prefix, placeholder = 'text') => {
    const input = changelogContentRef.current;
    if (!input) return;

    const content = changelogForm.content || '';
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    const selected = content.slice(start, end);
    const useText = selected || placeholder;
    const replacement = `${prefix}${useText}${suffix}`;
    const updated = `${content.slice(0, start)}${replacement}${content.slice(end)}`;
    const selectStart = start + prefix.length;
    const selectEnd = selectStart + useText.length;

    setChangelogForm((prev) => ({ ...prev, content: updated }));
    window.requestAnimationFrame(() => {
      if (!changelogContentRef.current) return;
      changelogContentRef.current.focus();
      changelogContentRef.current.setSelectionRange(selectStart, selectEnd);
    });
  };

  const applyChangelogLineFormat = (mode) => {
    const input = changelogContentRef.current;
    if (!input) return;

    const content = changelogForm.content || '';
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    const blockStart = content.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const nextBreak = content.indexOf('\n', end);
    const blockEnd = nextBreak === -1 ? content.length : nextBreak;
    const selectedBlock = content.slice(blockStart, blockEnd);
    const lines = selectedBlock.split('\n');

    let transformed = lines;
    if (mode === 'bullet') {
      transformed = lines.map((line) => (line.trim() ? `- ${line.replace(/^\s*([-*]|\d+\.)\s+/, '')}` : line));
    } else if (mode === 'number') {
      transformed = lines.map((line, idx) => (line.trim() ? `${idx + 1}. ${line.replace(/^\s*([-*]|\d+\.)\s+/, '')}` : line));
    } else if (mode === 'heading') {
      transformed = lines.map((line) => (line.trim() ? `## ${line.replace(/^\s*#{1,3}\s+/, '')}` : line));
    } else if (mode === 'quote') {
      transformed = lines.map((line) => (line.trim() ? `> ${line.replace(/^\s*>\s?/, '')}` : line));
    }

    const replacement = transformed.join('\n');
    const updated = `${content.slice(0, blockStart)}${replacement}${content.slice(blockEnd)}`;

    setChangelogForm((prev) => ({ ...prev, content: updated }));
    window.requestAnimationFrame(() => {
      if (!changelogContentRef.current) return;
      changelogContentRef.current.focus();
      changelogContentRef.current.setSelectionRange(blockStart, blockStart + replacement.length);
    });
  };

  const resetShoeForm = () => {
    setShoeEditingId(null);
    setShoeForm({ make: '', model: '', colorway: '', photoFile: null });
    setShoePhotoInputKey((prev) => prev + 1);
  };

  const handleAddCatalogShoe = async (e) => {
    e.preventDefault();
    if (shoeCatalogSaving) return;
    const make = String(shoeForm.make || '').trim();
    const model = String(shoeForm.model || '').trim();
    const colorway = String(shoeForm.colorway || '').trim();
    if (!make || !model) {
      setShoeCatalogError('Make and model are required.');
      return;
    }

    setShoeCatalogSaving(true);
    setShoeCatalogError('');
    setShoeCatalogMessage('');
    try {
      if (shoeEditingId) {
        await updateAdminShoeCatalogEntry(shoeEditingId, {
          make,
          model,
          colorway,
          photoFile: shoeForm.photoFile || null,
        });
        setShoeCatalogMessage('Catalog entry updated.');
      } else {
        const result = await createAdminShoeCatalogEntry({
          make,
          model,
          colorway,
          photoFile: shoeForm.photoFile || null,
        });
        setShoeCatalogMessage(result?.updated ? 'Catalog entry updated.' : 'Catalog entry added.');
        setShoeCatalogPage(1);
      }
      resetShoeForm();
      setShoeCatalogRefreshKey((prev) => prev + 1);
    } catch (err) {
      setShoeCatalogError(err?.message || 'Failed to save shoe catalog entry');
    } finally {
      setShoeCatalogSaving(false);
    }
  };

  const handleEditCatalogShoe = (shoe) => {
    setShoeDeleteConfirmId(null);
    setShoeCatalogError('');
    setShoeCatalogMessage('');
    setShoeEditingId(shoe.id);
    setShoeForm({
      make: String(shoe.make || ''),
      model: String(shoe.model || ''),
      colorway: String(shoe.colorway || ''),
      photoFile: null,
    });
    setShoePhotoInputKey((prev) => prev + 1);
  };

  const handleDeleteCatalogShoe = async (catalogId) => {
    if (shoeCatalogSaving) return;
    setShoeCatalogSaving(true);
    setShoeCatalogError('');
    setShoeCatalogMessage('');
    try {
      await deleteAdminShoeCatalogEntry(catalogId);
      setShoeDeleteConfirmId(null);
      if (parseInt(shoeEditingId, 10) === parseInt(catalogId, 10)) {
        resetShoeForm();
      }
      setShoeCatalogMessage('Catalog entry deleted.');
      if (shoeCatalog.length === 1 && shoeCatalogPage > 1) {
        setShoeCatalogPage((prev) => Math.max(1, prev - 1));
      } else {
        setShoeCatalogRefreshKey((prev) => prev + 1);
      }
    } catch (err) {
      setShoeCatalogError(err?.message || 'Failed to delete catalog entry');
    } finally {
      setShoeCatalogSaving(false);
    }
  };

  const handleSetCatalogShoeDisplay = async (catalogId) => {
    if (shoeCatalogSaving) return;
    setShoeCatalogSaving(true);
    setShoeCatalogError('');
    setShoeCatalogMessage('');
    try {
      await setAdminShoeCatalogDisplay(catalogId);
      setShoeCatalogMessage('Top Shoes display colorway updated.');
      setShoeCatalogRefreshKey((prev) => prev + 1);
    } catch (err) {
      setShoeCatalogError(err?.message || 'Failed to update top shoes display colorway');
    } finally {
      setShoeCatalogSaving(false);
    }
  };

  const handleSaveFunSettings = async (e) => {
    e.preventDefault();
    const parsedLag = Number.parseInt(funLagInput, 10);
    if (!Number.isFinite(parsedLag) || parsedLag <= 0) {
      setFunError('Devit start threshold must be a positive integer');
      setFunSuccess('');
      return;
    }

    setFunSaving(true);
    try {
      const payload = await updateFunSettings({ devit_start_platform_lag: parsedLag });
      const lag = Number.parseInt(payload?.devit_start_platform_lag, 10);
      const normalizedLag = Number.isFinite(lag) && lag > 0 ? lag : 3;
      setFunSettings({
        devit_start_platform_lag: normalizedLag,
        updated_at: payload?.updated_at || '',
      });
      setFunLagInput(String(normalizedLag));
      setFunError('');
      setFunSuccess('Fun settings updated');
    } catch (err) {
      setFunError(err?.message || 'Failed to save fun settings');
      setFunSuccess('');
    } finally {
      setFunSaving(false);
    }
  };

  const reloadFeatureUsers = async () => {
    const payload = await getAdminFeatureUsers(selectedFeature);
    setPermissionUsers(Array.isArray(payload?.users) ? payload.users : []);
  };

  const handleGrantFeatureToUser = async (entry) => {
    if (!entry?.id || permissionSaving) return;
    setPermissionSaving(true);
    setPermissionError('');
    setPermissionMessage('');
    try {
      const result = await grantAdminFeatureUser(selectedFeature, entry.id);
      await reloadFeatureUsers();
      setPermissionSearchQuery('');
      setPermissionSuggestions([]);
      setPermissionSearchOpen(false);
      setPermissionMessage(result?.added
        ? `Granted ${selectedFeature} access to @${entry.username}.`
        : `@${entry.username} already has ${selectedFeature} access.`);
    } catch (err) {
      setPermissionError(err?.message || 'Failed to grant access');
    } finally {
      setPermissionSaving(false);
    }
  };

  const handleRevokeFeatureFromUser = async (entry) => {
    if (!entry?.id || permissionSaving) return;
    setPermissionSaving(true);
    setPermissionError('');
    setPermissionMessage('');
    try {
      await revokeAdminFeatureUser(selectedFeature, entry.id);
      await reloadFeatureUsers();
      setPermissionMessage(`Removed ${selectedFeature} access from @${entry.username}.`);
    } catch (err) {
      setPermissionError(err?.message || 'Failed to revoke access');
    } finally {
      setPermissionSaving(false);
    }
  };

  const selectedFeatureLabel = useMemo(() => {
    const found = features.find((item) => item.key === selectedFeature);
    return found?.label || selectedFeature;
  }, [features, selectedFeature]);

  if (!user) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="card text-center">
          <h1 className="text-2xl font-display font-bold">ADMIN PANEL</h1>
          <p className="text-sm text-gray-400 mt-2">Login required.</p>
          <Link to="/login" className="inline-flex mt-4 btn-primary">Login</Link>
        </div>
      </div>
    );
  }

  if (!user?.is_admin) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="card text-center">
          <h1 className="text-2xl font-display font-bold">ADMIN PANEL</h1>
          <p className="text-sm text-red-300 mt-2">Admin access required.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-wider">ADMIN PANEL</h1>
        <Link to="/" className="text-sm text-gray-400 hover:text-white transition-colors font-display">
          Back to site
        </Link>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 mb-6">
        {['tournaments', 'archived', 'notices', 'changelog', 'shoes', 'permissions', 'groups', 'achievements', 'fun'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`w-full sm:w-auto min-w-0 px-3 sm:px-4 py-2 rounded-lg font-display text-sm font-bold transition-colors ${
              tab === t ? 'bg-piu-accent text-white' : 'bg-piu-card text-gray-400 hover:text-white'
            }`}
          >
            <span className="block truncate">
              {t === 'tournaments' ? `Active (${tournaments.length})` :
               t === 'archived' ? `Archived (${archived.length})` :
               t === 'notices' ? `Notices (${notices.length})` :
               t === 'changelog' ? `Changelog (${changelogEntries.length})` :
               t === 'shoes' ? `Shoes (${shoeCatalogTotal})` :
               t === 'permissions' ? 'Permissions' :
               t === 'groups' ? 'Groups' :
               t === 'achievements' ? 'Achievements' :
               'Fun Settings'}
            </span>
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

      {/* Changelog Tab */}
      {tab === 'changelog' && (
        <div className="space-y-6">
          <form onSubmit={handleChangelogSubmit} className="card space-y-3">
            <h3 className="font-display font-bold text-piu-accent">
              {editingChangelog ? 'Edit Changelog Entry' : 'Post New Changelog Entry'}
            </h3>
            <input
              type="text"
              className="input-field"
              placeholder="Entry title"
              value={changelogForm.title}
              onChange={(e) => setChangelogForm((prev) => ({ ...prev, title: e.target.value }))}
              required
            />
            <textarea
              ref={changelogContentRef}
              className="input-field min-h-[100px] resize-y"
              placeholder="Entry details (supports Markdown styling)"
              value={changelogForm.content}
              onChange={(e) => setChangelogForm((prev) => ({ ...prev, content: e.target.value }))}
              required
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyChangelogInlineFormat('**', '**', 'bold text')}
                className="rounded border border-piu-border px-2 py-1 text-[11px] text-gray-300 hover:text-white hover:border-piu-accent/40 transition-colors"
              >
                Bold
              </button>
              <button
                type="button"
                onClick={() => applyChangelogInlineFormat('*', '*', 'italic text')}
                className="rounded border border-piu-border px-2 py-1 text-[11px] text-gray-300 hover:text-white hover:border-piu-accent/40 transition-colors"
              >
                Italic
              </button>
              <button
                type="button"
                onClick={() => applyChangelogInlineFormat('`', '`', 'code')}
                className="rounded border border-piu-border px-2 py-1 text-[11px] text-gray-300 hover:text-white hover:border-piu-accent/40 transition-colors"
              >
                Code
              </button>
              <button
                type="button"
                onClick={() => applyChangelogLineFormat('heading')}
                className="rounded border border-piu-border px-2 py-1 text-[11px] text-gray-300 hover:text-white hover:border-piu-accent/40 transition-colors"
              >
                Heading
              </button>
              <button
                type="button"
                onClick={() => applyChangelogLineFormat('bullet')}
                className="rounded border border-piu-border px-2 py-1 text-[11px] text-gray-300 hover:text-white hover:border-piu-accent/40 transition-colors"
              >
                Bullet list
              </button>
              <button
                type="button"
                onClick={() => applyChangelogLineFormat('number')}
                className="rounded border border-piu-border px-2 py-1 text-[11px] text-gray-300 hover:text-white hover:border-piu-accent/40 transition-colors"
              >
                Number list
              </button>
              <button
                type="button"
                onClick={() => applyChangelogLineFormat('quote')}
                className="rounded border border-piu-border px-2 py-1 text-[11px] text-gray-300 hover:text-white hover:border-piu-accent/40 transition-colors"
              >
                Quote
              </button>
              <button
                type="button"
                onClick={() => applyChangelogInlineFormat('[', '](https://example.com)', 'link text')}
                className="rounded border border-piu-border px-2 py-1 text-[11px] text-gray-300 hover:text-white hover:border-piu-accent/40 transition-colors"
              >
                Link
              </button>
            </div>
            <p className="text-[11px] text-gray-500">
              Markdown supported: <span className="font-mono">**bold**</span>, <span className="font-mono">*italic*</span>, lists, headings, links, quotes, and code.
            </p>
            <div className="rounded-lg border border-piu-border/40 bg-piu-dark/30 p-3">
              <p className="text-[11px] font-display font-bold text-gray-400 uppercase tracking-wide">Preview</p>
              {changelogForm.content.trim() ? (
                <MarkdownContent text={changelogForm.content} className="mt-2" compact />
              ) : (
                <p className="text-xs text-gray-500 mt-2">Formatting preview appears here.</p>
              )}
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={changelogForm.pinned}
                  onChange={(e) => setChangelogForm((prev) => ({ ...prev, pinned: e.target.checked }))}
                  className="rounded"
                />
                Pin to top
              </label>
              <div className="flex gap-2">
                {editingChangelog && (
                  <button
                    type="button"
                    onClick={() => { setEditingChangelog(null); setChangelogForm({ title: '', content: '', pinned: false }); }}
                    className="btn-secondary text-sm"
                  >
                    Cancel
                  </button>
                )}
                <button type="submit" className="btn-primary text-sm" disabled={changelogSaving}>
                  {changelogSaving ? 'Saving...' : editingChangelog ? 'Update Entry' : 'Post Entry'}
                </button>
              </div>
            </div>
          </form>

          <div className="space-y-3">
            {changelogEntries.length === 0 ? (
              <p className="text-gray-500 text-center py-10">No changelog entries posted</p>
            ) : changelogEntries.map((entry) => (
              <div key={entry.id} className={`card ${entry.pinned ? 'border-piu-accent/30' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {entry.pinned ? <span className="text-xs text-piu-accent font-display">PINNED</span> : null}
                      <h4 className="font-display font-bold truncate">{entry.title}</h4>
                    </div>
                    <div className="mt-1 max-h-20 overflow-hidden">
                      <MarkdownContent text={entry.content} compact />
                    </div>
                    <p className="text-xs text-gray-600 mt-2">
                      {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : ''}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleChangelogPin(entry)}
                      className={`text-xs px-2 py-1 rounded transition-colors ${
                        entry.pinned ? 'text-piu-accent bg-piu-accent/10' : 'text-gray-500 hover:text-piu-accent'
                      }`}
                      title={entry.pinned ? 'Unpin' : 'Pin'}
                    >
                      {entry.pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                      onClick={() => handleEditChangelog(entry)}
                      className="text-xs px-2 py-1 rounded text-gray-500 hover:text-white transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteChangelog(entry.id)}
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

      {/* Shoes Tab */}
      {tab === 'shoes' && (
        <div className="space-y-4">
          <form onSubmit={handleAddCatalogShoe} className="card space-y-3">
            <h3 className="font-display font-bold text-piu-accent">
              {shoeEditingId ? `Edit Catalog Entry #${shoeEditingId}` : 'Shoe Catalog'}
            </h3>
            <p className="text-xs text-gray-500">
              {shoeEditingId
                ? 'Update make, model, colorway, and optional photo for this catalog entry.'
                : 'Add make, model, and colorway options for player shoe matching.'}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="text-xs text-gray-400">Make</span>
                <input
                  type="text"
                  className="input-field mt-1"
                  maxLength={80}
                  value={shoeForm.make}
                  onChange={(e) => setShoeForm((prev) => ({ ...prev, make: e.target.value }))}
                  placeholder="Nike"
                  disabled={shoeCatalogSaving}
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-400">Model</span>
                <input
                  type="text"
                  className="input-field mt-1"
                  maxLength={80}
                  value={shoeForm.model}
                  onChange={(e) => setShoeForm((prev) => ({ ...prev, model: e.target.value }))}
                  placeholder="Free RN 2018"
                  disabled={shoeCatalogSaving}
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-400">Colorway</span>
                <input
                  type="text"
                  className="input-field mt-1"
                  maxLength={120}
                  value={shoeForm.colorway}
                  onChange={(e) => setShoeForm((prev) => ({ ...prev, colorway: e.target.value }))}
                  placeholder="Black / White"
                  disabled={shoeCatalogSaving}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[11px] text-gray-400">
                {shoeEditingId ? 'New photo (optional)' : 'Photo (optional)'}
              </span>
              <input
                key={shoePhotoInputKey}
                type="file"
                accept="image/*"
                onChange={(e) => setShoeForm((prev) => ({ ...prev, photoFile: e.target.files?.[0] || null }))}
                className="text-xs text-gray-400 file:mr-3 file:px-3 file:py-1 file:rounded-lg file:border file:border-piu-border file:bg-piu-dark file:text-gray-300 file:cursor-pointer"
                disabled={shoeCatalogSaving}
              />
              <button type="submit" className="btn-primary text-sm" disabled={shoeCatalogSaving}>
                {shoeCatalogSaving ? 'Saving...' : shoeEditingId ? 'Save Changes' : 'Add Catalog Shoe'}
              </button>
              {shoeEditingId && (
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={resetShoeForm}
                  disabled={shoeCatalogSaving}
                >
                  Cancel Edit
                </button>
              )}
            </div>

            {shoeCatalogError && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {shoeCatalogError}
              </div>
            )}
            {shoeCatalogMessage && (
              <div className="rounded-lg border border-piu-green/40 bg-piu-green/10 px-3 py-2 text-xs text-piu-green">
                {shoeCatalogMessage}
              </div>
            )}
          </form>

          <div className="card space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-display font-bold text-sm text-gray-300">Catalog Entries</h4>
              <button
                type="button"
                className="btn-secondary text-xs px-3 py-1.5"
                onClick={() => setShoeCatalogRefreshKey((prev) => prev + 1)}
                disabled={shoeCatalogLoading}
              >
                {shoeCatalogLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            <input
              type="text"
              className="input-field"
              value={shoeCatalogQuery}
              onChange={(e) => {
                setShoeCatalogQuery(e.target.value);
                setShoeCatalogPage(1);
              }}
              maxLength={120}
              placeholder="Search catalog by make, model, or colorway..."
              disabled={shoeCatalogSaving}
            />

            {shoeCatalogLoading && shoeCatalog.length === 0 ? (
              <p className="text-xs text-gray-500 py-3">Loading catalog...</p>
            ) : shoeCatalog.length === 0 ? (
              <p className="text-xs text-gray-500 py-3">No catalog shoes found.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {shoeCatalog.map((shoe) => {
                  const label = formatShoeLabel(shoe);
                  const colorway = String(shoe.colorway || '').trim();
                  const isModelDisplay = !!shoe.is_model_display;
                  const isDeleteConfirm = shoeDeleteConfirmId === shoe.id;
                  const isEditing = parseInt(shoeEditingId, 10) === parseInt(shoe.id, 10);
                  return (
                    <div
                      key={shoe.id}
                      className={`rounded-xl border p-3 space-y-2 ${
                        isEditing
                          ? 'border-piu-accent/70 bg-piu-accent/10'
                          : 'border-piu-border/50 bg-piu-dark/35'
                      }`}
                    >
                      <div className="w-full h-24 rounded-lg bg-piu-dark/60 border border-piu-border/40 overflow-hidden flex items-center justify-center">
                        {shoe.image_data ? (
                          <img src={shoe.image_data} alt={label} className="w-full h-full object-contain p-1" />
                        ) : (
                          <span className="text-[10px] text-gray-500">No image</span>
                        )}
                      </div>
                      <p className="font-display font-bold text-xs leading-tight">{label}</p>
                      {colorway ? (
                        <p className="text-[10px] text-gray-400 leading-tight">{colorway}</p>
                      ) : (
                        <p className="text-[10px] text-gray-500 leading-tight">No colorway</p>
                      )}
                      <p className="text-[10px] text-gray-600">
                        Updated {shoe.updated_at ? new Date(shoe.updated_at).toLocaleDateString() : '-'}
                      </p>

                      <div className="pt-1 border-t border-piu-border/30">
                        <button
                          type="button"
                          className={`w-full px-2 py-1 rounded text-[10px] font-display font-bold border disabled:opacity-60 ${
                            isModelDisplay
                              ? 'text-emerald-200 border-emerald-500/60 bg-emerald-500/20'
                              : 'text-cyan-200 border-cyan-500/60 bg-cyan-500/20 hover:bg-cyan-500/30'
                          }`}
                          onClick={() => handleSetCatalogShoeDisplay(shoe.id)}
                          disabled={shoeCatalogSaving}
                        >
                          {isModelDisplay ? 'Top Shoes Display' : 'Use for Top Shoes'}
                        </button>
                      </div>

                      <button
                        type="button"
                        className={`w-full px-2 py-1 rounded text-[10px] font-display font-bold border disabled:opacity-60 ${
                          isEditing
                            ? 'text-piu-accent border-piu-accent/60 bg-piu-accent/10'
                            : 'text-gray-200 border-piu-border/60 bg-piu-dark/80 hover:bg-piu-dark'
                        }`}
                        onClick={() => handleEditCatalogShoe(shoe)}
                        disabled={shoeCatalogSaving}
                      >
                        {isEditing ? 'Editing This Entry' : 'Edit Entry'}
                      </button>

                      {isDeleteConfirm ? (
                        <div className="space-y-1.5 pt-1 border-t border-red-500/30">
                          <button
                            type="button"
                            className="w-full px-2 py-1.5 rounded text-[10px] font-display font-bold text-red-200 border border-red-500/60 bg-red-500/20 hover:bg-red-500/30 disabled:opacity-60"
                            onClick={() => handleDeleteCatalogShoe(shoe.id)}
                            disabled={shoeCatalogSaving}
                          >
                            Confirm Delete
                          </button>
                          <button
                            type="button"
                            className="w-full px-2 py-1 rounded text-[10px] font-display font-bold text-gray-400 border border-piu-border bg-piu-dark hover:text-gray-200"
                            onClick={() => setShoeDeleteConfirmId(null)}
                            disabled={shoeCatalogSaving}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="w-full px-2 py-1 rounded text-[10px] font-display font-bold text-red-300 border border-red-500/40 bg-red-500/10 hover:text-red-200 disabled:opacity-60"
                          onClick={() => setShoeDeleteConfirmId(shoe.id)}
                          disabled={shoeCatalogSaving}
                        >
                          Delete...
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {shoeCatalogTotalPages > 1 && (
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="px-2 py-1 rounded border border-piu-border bg-piu-dark text-[10px] text-gray-300 disabled:opacity-50"
                  disabled={shoeCatalogLoading || shoeCatalogPage <= 1}
                  onClick={() => setShoeCatalogPage((prev) => Math.max(1, prev - 1))}
                >
                  Prev
                </button>
                <span className="text-[10px] text-gray-500">
                  Page {shoeCatalogPage} / {shoeCatalogTotalPages}
                </span>
                <button
                  type="button"
                  className="px-2 py-1 rounded border border-piu-border bg-piu-dark text-[10px] text-gray-300 disabled:opacity-50"
                  disabled={shoeCatalogLoading || shoeCatalogPage >= shoeCatalogTotalPages}
                  onClick={() => setShoeCatalogPage((prev) => Math.min(shoeCatalogTotalPages, prev + 1))}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Permissions Tab */}
      {tab === 'permissions' && (
        <div className="space-y-4">
          <div className="card space-y-3">
            <h3 className="font-display font-bold text-piu-accent">Feature Permissions</h3>
            <p className="text-xs text-gray-500">
              Grant invite-only feature access per user. Admin users automatically have all feature access.
            </p>
            <label className="block max-w-sm">
              <span className="text-xs text-gray-400">Feature</span>
              <select
                value={selectedFeature}
                onChange={(e) => {
                  setSelectedFeature(String(e.target.value || 'optimise'));
                  setPermissionSearchQuery('');
                  setPermissionSuggestions([]);
                  setPermissionSearchOpen(false);
                  setPermissionMessage('');
                  setPermissionError('');
                }}
                className="input-field mt-1"
              >
                {features.map((feature) => (
                  <option key={feature.key} value={feature.key}>{feature.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="card space-y-3">
            <h4 className="font-display font-bold text-sm text-gray-200">Grant {selectedFeatureLabel} Access</h4>
            <div ref={permissionSearchRef} className="relative">
              <input
                type="text"
                className="input-field"
                value={permissionSearchQuery}
                onFocus={() => setPermissionSearchOpen(true)}
                onChange={(e) => {
                  setPermissionSearchQuery(e.target.value);
                  setPermissionSearchOpen(true);
                }}
                placeholder="Search users to add..."
                disabled={permissionSaving}
              />
              {permissionSearchOpen && permissionSuggestions.length > 0 && (
                <div className="absolute z-20 top-full mt-1 w-full rounded-lg border border-piu-border bg-[#0b1324] shadow-xl overflow-hidden max-h-72 overflow-y-auto">
                  {permissionSuggestions.map((entry) => (
                    <div
                      key={entry.id}
                      className="px-3 py-2 border-b border-piu-border/20 last:border-0 flex items-center gap-2"
                    >
                      {entry.avatar ? (
                        <img src={getAvatarUrl(entry.avatar)} alt="" className="w-8 h-8 rounded-full object-cover border border-piu-border" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-xs">
                          {(entry.username || '?')[0].toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-display font-bold truncate">{entry.username}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleGrantFeatureToUser(entry)}
                        className="px-2 py-1 rounded text-[11px] font-display font-bold bg-piu-accent text-white disabled:opacity-50"
                        disabled={permissionSaving}
                      >
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {permissionError && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {permissionError}
              </div>
            )}
            {permissionMessage && (
              <div className="rounded-lg border border-piu-green/40 bg-piu-green/10 px-3 py-2 text-xs text-piu-green">
                {permissionMessage}
              </div>
            )}
          </div>

          <div className="card space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-display font-bold text-sm text-gray-200">
                Users With {selectedFeatureLabel} Access ({permissionUsers.length})
              </h4>
              <button
                type="button"
                className="btn-secondary text-xs px-3 py-1.5"
                onClick={() => {
                  setPermissionLoading(true);
                  setPermissionError('');
                  setPermissionMessage('');
                  reloadFeatureUsers()
                    .catch((err) => setPermissionError(err?.message || 'Failed to refresh permissions'))
                    .finally(() => setPermissionLoading(false));
                }}
                disabled={permissionLoading || permissionSaving}
              >
                {permissionLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {permissionLoading ? (
              <p className="text-xs text-gray-500 py-2">Loading permission list...</p>
            ) : permissionUsers.length === 0 ? (
              <p className="text-xs text-gray-500 py-2">No users currently granted this feature.</p>
            ) : (
              <div className="space-y-2">
                {permissionUsers.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-piu-border/50 bg-piu-dark/35 px-3 py-2 flex items-center gap-2"
                  >
                    {entry.avatar ? (
                      <img src={getAvatarUrl(entry.avatar)} alt="" className="w-8 h-8 rounded-full object-cover border border-piu-border" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-xs">
                        {(entry.username || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-display font-bold truncate">
                        {entry.username}
                        {entry.is_admin ? <span className="text-[10px] text-piu-accent ml-2">ADMIN</span> : null}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        Granted {entry.granted_at ? new Date(entry.granted_at).toLocaleString() : '-'}
                        {entry.granted_by_username ? ` by @${entry.granted_by_username}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="px-2 py-1 rounded text-[11px] font-display font-bold text-red-300 border border-red-500/40 bg-red-500/10 hover:text-red-200 disabled:opacity-50"
                      onClick={() => handleRevokeFeatureFromUser(entry)}
                      disabled={permissionSaving}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Groups Tab */}
      {tab === 'groups' && (
        <AdminGroupsTab />
      )}

      {/* Achievements Tab */}
      {tab === 'achievements' && (
        <AdminAchievementsTab />
      )}

      {/* Fun Settings Tab */}
      {tab === 'fun' && (
        <div className="space-y-4">
          <form onSubmit={handleSaveFunSettings} className="card space-y-3 max-w-xl">
            <h3 className="font-display font-bold text-piu-accent">Fun Game Settings</h3>
            <label className="block space-y-1">
              <span className="text-sm text-gray-300 font-display">Devit Start Threshold (Player Jumps)</span>
              <input
                type="number"
                min="1"
                step="1"
                className="input-field"
                value={funLagInput}
                onChange={(e) => setFunLagInput(e.target.value)}
              />
            </label>
            <p className="text-xs text-gray-500">
              Devit starts chasing after this many successful jumps.
            </p>
            {funLoading && <p className="text-xs text-gray-400">Loading settings...</p>}
            {funError && <p className="text-xs text-red-400">{funError}</p>}
            {funSuccess && <p className="text-xs text-piu-green">{funSuccess}</p>}
            {!funLoading && (
              <p className="text-xs text-gray-500">
                Current value: {funSettings.devit_start_platform_lag}
              </p>
            )}
            <button type="submit" className="btn-primary text-sm" disabled={funSaving || funLoading}>
              {funSaving ? 'Saving...' : 'Save Fun Settings'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
