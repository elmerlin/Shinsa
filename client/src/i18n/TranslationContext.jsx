import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useLocation } from 'react-router-dom';
import catalog from './translationCatalog.json';
import { getLocaleTranslations, saveLocaleTranslation } from '../utils/api';

const TranslationContext = createContext(null);

function normalizeLocale(value) {
  const locale = String(value || '').trim().toLowerCase();
  if (locale === 'kr') return 'ko';
  return locale === 'ko' ? 'ko' : 'en';
}

function interpolate(template, vars = {}) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, key) => {
    const value = vars[key];
    return value === undefined || value === null ? `{${key}}` : String(value);
  });
}

function buildCatalogMap() {
  return new Map(
    (Array.isArray(catalog) ? catalog : []).map((item) => [String(item.key || ''), item])
  );
}

function inferPageTag(pathname) {
  const path = String(pathname || '/').toLowerCase();
  if (path === '/login' || path.startsWith('/login/')) return 'login';
  if (path === '/register') return 'register';
  if (path === '/songs' || path.startsWith('/songs/')) return 'songs';
  if (path === '/leaderboards' || path.startsWith('/leaderboards/')) return 'leaderboards';
  if (path === '/duel' || path.startsWith('/duel/') || path.startsWith('/online-duel/')) return 'duel';
  return 'app';
}

export function TranslationProvider({ locale: localeProp, children }) {
  const location = useLocation();
  const locale = normalizeLocale(localeProp);
  const currentPageTag = useMemo(() => inferPageTag(location.pathname), [location.pathname]);
  const catalogMap = useMemo(() => buildCatalogMap(), []);
  const [translationState, setTranslationState] = useState({
    loading: locale === 'ko',
    permissions: { canEdit: false, canAccept: false },
    items: [],
    error: '',
  });
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (locale !== 'ko') {
      setTranslationState({
        loading: false,
        permissions: { canEdit: false, canAccept: false },
        items: [],
        error: '',
      });
      return undefined;
    }

    setTranslationState((current) => ({ ...current, loading: true, error: '' }));

    getLocaleTranslations('ko')
      .then((payload) => {
        if (cancelled) return;
        setTranslationState({
          loading: false,
          permissions: payload?.permissions || { canEdit: false, canAccept: false },
          items: Array.isArray(payload?.items) ? payload.items : [],
          error: '',
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setTranslationState({
          loading: false,
          permissions: { canEdit: false, canAccept: false },
          items: [],
          error: err.message || 'Failed to load translations',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [locale]);

  const itemMap = useMemo(() => {
    return new Map(
      translationState.items.map((item) => [String(item.key || ''), item])
    );
  }, [translationState.items]);

  const t = useCallback((key, vars = {}) => {
    const catalogItem = catalogMap.get(String(key || ''));
    if (!catalogItem) return interpolate(key, vars);
    if (locale === 'ko') {
      const runtimeItem = itemMap.get(String(key || ''));
      const koreanValue = runtimeItem?.current || catalogItem.korean || catalogItem.english || key;
      return interpolate(koreanValue, vars);
    }
    return interpolate(catalogItem.english || key, vars);
  }, [catalogMap, itemMap, locale]);

  const saveTranslation = useCallback(async (key, value, status = 'draft') => {
    const payload = await saveLocaleTranslation({
      locale: 'ko',
      key,
      value,
      status,
    });

    setTranslationState((current) => ({
      ...current,
      items: current.items.map((item) => {
        if (item.key !== key) return item;
        return {
          ...item,
          current: payload?.item?.current || value,
          status: payload?.item?.status || status,
          source: 'override',
          updatedAt: payload?.item?.updatedAt || item.updatedAt,
          updatedBy: payload?.item?.updatedBy || item.updatedBy,
        };
      }),
    }));

    return payload;
  }, []);

  const getLocaleHref = useCallback((targetLocale) => {
    const normalizedTarget = normalizeLocale(targetLocale);
    const path = location.pathname || '/';
    const search = location.search || '';
    const hash = location.hash || '';
    if (normalizedTarget === 'ko') {
      return `/kr${path === '/' ? '' : path}${search}${hash}`;
    }
    return `${path}${search}${hash}`;
  }, [location.hash, location.pathname, location.search]);

  const value = useMemo(() => ({
    locale,
    isKorean: locale === 'ko',
    currentPageTag,
    editorOpen,
    setEditorOpen,
    t,
    items: translationState.items,
    permissions: translationState.permissions,
    loading: translationState.loading,
    error: translationState.error,
    saveTranslation,
    getLocaleHref,
  }), [
    currentPageTag,
    editorOpen,
    getLocaleHref,
    locale,
    saveTranslation,
    t,
    translationState.error,
    translationState.items,
    translationState.loading,
    translationState.permissions,
  ]);

  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useI18n must be used within a TranslationProvider');
  }
  return context;
}
