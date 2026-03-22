import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext();
export function useToast() { return useContext(ToastContext); }

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const removeToast = useCallback((id) => {
    clearTimeout(timersRef.current[id]);
    delete timersRef.current[id];
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type, entering: true }]);
    // Remove entering flag after animation
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, entering: false } : t));
    }, 50);
    if (duration > 0) {
      timersRef.current[id] = setTimeout(() => removeToast(id), duration);
    }
    return id;
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

// Toast type styles using Shinsa design tokens
const TYPE_STYLES = {
  success: 'border-piu-green/50 bg-piu-green/8',
  error: 'border-piu-accent/50 bg-piu-accent/8',
  info: 'border-piu-blue/50 bg-piu-blue/8',
  warning: 'border-piu-gold/50 bg-piu-gold/8',
};

const TYPE_ICONS = {
  success: '\u2714',
  error: '\u2718',
  info: '\u2139\uFE0F',
  warning: '\u26A0\uFE0F',
};

const TYPE_TEXT = {
  success: 'text-piu-green',
  error: 'text-piu-accent',
  info: 'text-piu-blue',
  warning: 'text-piu-gold',
};

function ToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 max-w-sm w-full pointer-events-none sm:bottom-6 sm:right-6">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-piu-card/95 backdrop-blur-sm px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-300 ${TYPE_STYLES[toast.type] || TYPE_STYLES.info} ${toast.entering ? 'translate-y-2 opacity-0' : 'translate-y-0 opacity-100'}`}
        >
          <span className={`text-sm shrink-0 mt-0.5 ${TYPE_TEXT[toast.type] || TYPE_TEXT.info}`}>
            {TYPE_ICONS[toast.type] || TYPE_ICONS.info}
          </span>
          <p className="text-sm text-gray-200 flex-1 min-w-0">{toast.message}</p>
          <button
            onClick={() => onDismiss(toast.id)}
            className="text-gray-500 hover:text-white transition-colors text-xs shrink-0 mt-0.5"
          >
            {'\u2715'}
          </button>
        </div>
      ))}
    </div>
  );
}
