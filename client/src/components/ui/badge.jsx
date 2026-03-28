import React from 'react';

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

const VARIANT_CLASSES = {
  default: 'border-white/10 bg-white/6 text-zinc-200',
  secondary: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200',
  success: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
  warning: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
  danger: 'border-rose-400/25 bg-rose-400/10 text-rose-200',
};

export function Badge({ className = '', variant = 'default', ...props }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-[0.16em]',
        VARIANT_CLASSES[variant] || VARIANT_CLASSES.default,
        className
      )}
      {...props}
    />
  );
}
