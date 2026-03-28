import React from 'react';

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

export function Card({ className = '', ...props }) {
  return (
    <div
      className={cx(
        'rounded-xl border border-white/10 bg-zinc-950/70 shadow-[0_24px_70px_rgba(0,0,0,0.35)] backdrop-blur-sm',
        className
      )}
      {...props}
    />
  );
}

export function CardContent({ className = '', ...props }) {
  return <div className={cx('p-5 sm:p-6', className)} {...props} />;
}
