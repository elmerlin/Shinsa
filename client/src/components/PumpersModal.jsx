import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAvatarUrl } from './AvatarPicker';
import { getProfilePath } from '../utils/profile';

export default function PumpersModal({ open, onClose, title = 'Pumped by', loadPumpers, reloadKey = 0 }) {
  const [pumpers, setPumpers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const loadPumpersRef = useRef(loadPumpers);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    loadPumpersRef.current = loadPumpers;
  }, [loadPumpers]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCloseRef.current?.();
    };
    document.addEventListener('keydown', onKeyDown);

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const rows = await (loadPumpersRef.current ? loadPumpersRef.current() : Promise.resolve([]));
        if (!cancelled) setPumpers(Array.isArray(rows) ? rows : []);
      } catch (err) {
        if (!cancelled) {
          setPumpers([]);
          setError(err?.message || 'Failed to load pumpers');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, reloadKey]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4"
      onClick={() => onClose?.()}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-piu-border bg-piu-card shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-piu-border/50">
          <h3 className="font-display font-bold text-sm text-gray-100">{title}</h3>
          <button
            type="button"
            className="text-gray-500 hover:text-white text-lg leading-none"
            onClick={() => onClose?.()}
            aria-label="Close"
          >
            x
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-3 py-2">
          {loading ? (
            <p className="text-xs text-gray-500 py-4 text-center">Loading...</p>
          ) : error ? (
            <p className="text-xs text-red-400 py-4 text-center">{error}</p>
          ) : pumpers.length === 0 ? (
            <p className="text-xs text-gray-500 py-4 text-center">No pumps yet.</p>
          ) : (
            <div className="space-y-1">
              {pumpers.map((pumper) => (
                <Link
                  key={pumper.id}
                  to={getProfilePath(pumper.id, pumper.username)}
                  onClick={() => onClose?.()}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-piu-dark/60 transition-colors"
                >
                  {pumper.avatar ? (
                    <img
                      src={getAvatarUrl(pumper.avatar)}
                      alt=""
                      className="w-7 h-7 rounded-full object-cover border border-piu-border"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center text-[10px] font-display font-bold">
                      {(pumper.username || '?')[0]?.toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs font-display font-bold text-gray-100">
                    {pumper.username}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
