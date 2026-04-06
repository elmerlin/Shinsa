import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/TranslationContext';

function TranslationRow({ item, canEdit, canAccept, t }) {
  const [value, setValue] = useState(item.current || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { saveTranslation } = useI18n();

  useEffect(() => {
    setValue(item.current || '');
  }, [item.current]);

  const unchanged = value.trim() === String(item.current || '').trim();

  async function handleSave(status) {
    setBusy(true);
    setError('');
    try {
      await saveTranslation(item.key, value, status);
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-piu-border/50 bg-piu-card/60 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-piu-border/60 px-2 py-1 text-[10px] font-mono text-gray-400">
          {item.key}
        </span>
        <span className="rounded-full border border-piu-border/40 px-2 py-1 text-[10px] font-display text-gray-300">
          {item.category || 'general'}
        </span>
        <span className="rounded-full border border-piu-border/40 px-2 py-1 text-[10px] font-display text-gray-300">
          {item.status === 'accepted' ? t('app.editor.accepted') : item.status === 'draft' ? t('app.editor.draft') : t('app.editor.seeded')}
        </span>
        {item.keepEnglish && (
          <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-display text-cyan-200">
            {t('app.editor.kept_english')}
          </span>
        )}
      </div>

      <div>
        <p className="text-[11px] font-display uppercase tracking-[0.2em] text-gray-500">
          {t('app.editor.english_source')}
        </p>
        <p className="mt-1 rounded-xl border border-piu-border/30 bg-black/20 px-3 py-2 text-sm text-gray-200">
          {item.english}
        </p>
      </div>

      <div>
        <p className="text-[11px] font-display uppercase tracking-[0.2em] text-gray-500">
          {t('app.editor.current_translation')}
        </p>
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={!canEdit || busy}
          className="mt-1 min-h-[86px] w-full rounded-xl border border-piu-border/50 bg-[#08111f] px-3 py-2 text-sm text-white focus:outline-none focus:border-piu-accent/50 disabled:opacity-70"
        />
      </div>

      {(item.updatedBy || item.updatedAt) && (
        <p className="text-[11px] text-gray-500">
          {item.updatedBy ? `${item.updatedBy}` : ''}
          {item.updatedBy && item.updatedAt ? ' • ' : ''}
          {item.updatedAt || ''}
        </p>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canEdit || busy || !value.trim() || unchanged}
          onClick={() => handleSave('draft')}
          className="rounded-xl border border-piu-border/50 bg-piu-dark/60 px-3 py-2 text-sm font-display text-white disabled:opacity-50"
        >
          {busy ? t('app.editor.saving') : t('app.editor.save')}
        </button>
        <button
          type="button"
          disabled={!canAccept || busy || !value.trim()}
          onClick={() => handleSave('accepted')}
          className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm font-display text-emerald-100 disabled:opacity-50"
        >
          {busy ? t('app.editor.saving') : t('app.editor.accept')}
        </button>
      </div>
    </div>
  );
}

export default function TranslationEditorDrawer() {
  const {
    isTranslated,
    editorOpen,
    setEditorOpen,
    currentPageTag,
    items,
    permissions,
    loading,
    error,
    t,
  } = useI18n();
  const [filterMode, setFilterMode] = useState('current');
  const [query, setQuery] = useState('');

  const visibleItems = useMemo(() => {
    const search = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      const pages = Array.isArray(item.pages) ? item.pages : [];
      const onCurrentPage = pages.includes('app') || pages.includes(currentPageTag);
      if (filterMode === 'current' && !onCurrentPage) return false;
      if (!search) return true;
      const haystack = [
        item.key,
        item.english,
        item.current,
        item.proposed,
        item.category,
        ...(pages || []),
      ].join(' ').toLowerCase();
      return haystack.includes(search);
    });

    return filtered.sort((a, b) => {
      const pageA = (Array.isArray(a.pages) ? a.pages[0] : '') || '';
      const pageB = (Array.isArray(b.pages) ? b.pages[0] : '') || '';
      if (pageA !== pageB) return pageA.localeCompare(pageB);
      return String(a.key || '').localeCompare(String(b.key || ''));
    });
  }, [currentPageTag, filterMode, items, query]);

  if (!isTranslated) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setEditorOpen(true)}
        className="fixed bottom-4 right-4 z-[120] rounded-full border border-piu-accent/40 bg-[#071425] px-4 py-2 text-sm font-display text-piu-accent shadow-2xl"
      >
        {t('app.editor.open')}
      </button>

      {editorOpen && (
        <div className="fixed inset-0 z-[130]">
          <button
            type="button"
            className="absolute inset-0 bg-black/65"
            aria-label={t('app.popup.close')}
            onClick={() => setEditorOpen(false)}
          />
          <aside className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto border-l border-piu-border bg-[#071120] shadow-2xl">
            <div className="sticky top-0 z-10 border-b border-piu-border/60 bg-[#071120]/95 px-4 py-4 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-display font-bold text-white">{t('app.editor.title')}</h2>
                  <p className="mt-1 text-sm text-gray-400">{t('app.editor.subtitle')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditorOpen(false)}
                  className="rounded-xl border border-piu-border/50 px-3 py-2 text-sm text-gray-300"
                >
                  {t('app.popup.close')}
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setFilterMode('current')}
                  className={`rounded-full px-3 py-1.5 text-sm ${filterMode === 'current' ? 'bg-piu-accent text-piu-dark' : 'border border-piu-border/50 text-gray-300'}`}
                >
                  {t('app.editor.current_page')}
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className={`rounded-full px-3 py-1.5 text-sm ${filterMode === 'all' ? 'bg-piu-accent text-piu-dark' : 'border border-piu-border/50 text-gray-300'}`}
                >
                  {t('app.editor.all_pages')}
                </button>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('app.editor.search_placeholder')}
                  className="min-w-[220px] flex-1 rounded-xl border border-piu-border/50 bg-[#08111f] px-3 py-2 text-sm text-white focus:outline-none focus:border-piu-accent/50"
                />
              </div>
            </div>

            <div className="space-y-4 p-4">
              {!permissions.canEdit && (
                <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  {t('app.editor.login_required')}
                </div>
              )}
              {permissions.canEdit && !permissions.canAccept && (
                <div className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                  {t('app.editor.accept_requires_admin')}
                </div>
              )}
              {loading && (
                <div className="rounded-2xl border border-piu-border/50 bg-piu-card/50 px-4 py-3 text-sm text-gray-300">
                  {t('app.editor.saving')}
                </div>
              )}
              {error && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}
              {!loading && visibleItems.length === 0 && (
                <div className="rounded-2xl border border-piu-border/50 bg-piu-card/50 px-4 py-3 text-sm text-gray-300">
                  {t('app.editor.no_results')}
                </div>
              )}
              {visibleItems.map((item) => (
                <TranslationRow
                  key={item.key}
                  item={item}
                  canEdit={permissions.canEdit}
                  canAccept={permissions.canAccept}
                  t={t}
                />
              ))}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
