import React from 'react';

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

export function Card({ className = '', ...props }) {
  return (
    <div
      className={cx(
        'rounded-xl border border-white/10 bg-zinc-950/78 shadow-[0_12px_30px_rgba(0,0,0,0.22)]',
        className
      )}
      {...props}
    />
  );
}

export function CardContent({ className = '', ...props }) {
  return <div className={cx('p-5 sm:p-6', className)} {...props} />;
}
