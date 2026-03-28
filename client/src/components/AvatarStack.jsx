import React from 'react';
import { getAvatarUrl } from './AvatarPicker';

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

const SIZE_CLASSES = {
  sm: {
    avatar: 'h-8 w-8 text-[11px]',
    overlap: '-ml-2.5',
    label: 'text-[11px]',
  },
  md: {
    avatar: 'h-10 w-10 text-xs',
    overlap: '-ml-3',
    label: 'text-xs',
  },
};

function AvatarCircle({ item, sizeClass, isFirst = false }) {
  const initial = String(item?.name || '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <div
      title={item?.name || 'Participant'}
      className={cx(
        'relative rounded-full border border-zinc-950 bg-zinc-900 shadow-[0_8px_18px_rgba(0,0,0,0.28)] ring-1 ring-white/8 overflow-hidden',
        sizeClass.avatar,
        isFirst ? '' : sizeClass.overlap
      )}
    >
      {item?.avatar ? (
        <img
          src={getAvatarUrl(item.avatar)}
          alt={item?.name || 'Participant'}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-piu-accent/70 to-blue-500/70 font-display font-bold text-white">
          {initial}
        </div>
      )}
    </div>
  );
}

export default function AvatarStack({
  items = [],
  total = 0,
  size = 'sm',
  emptyLabel = 'No players yet',
  className = '',
}) {
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.sm;
  const visibleItems = Array.isArray(items) ? items.slice(0, 4) : [];
  const extraCount = Math.max(0, (Number(total) || 0) - visibleItems.length);

  return (
    <div className={cx('flex items-center gap-3', className)}>
      <div className="flex items-center">
        {visibleItems.length > 0 ? (
          <>
            {visibleItems.map((item, index) => (
              <AvatarCircle
                key={item?.id || `${item?.name || 'participant'}-${index}`}
                item={item}
                sizeClass={sizeClass}
                isFirst={index === 0}
              />
            ))}
            {extraCount > 0 && (
              <div
                className={cx(
                  'relative flex items-center justify-center rounded-full border border-zinc-950 bg-zinc-900 text-zinc-300 shadow-[0_8px_18px_rgba(0,0,0,0.28)] ring-1 ring-white/8',
                  sizeClass.avatar,
                  sizeClass.overlap
                )}
                title={`${extraCount} more`}
              >
                +{extraCount}
              </div>
            )}
          </>
        ) : (
          <>
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`placeholder-${index}`}
                className={cx(
                  'relative rounded-full border border-dashed border-white/10 bg-white/5',
                  sizeClass.avatar,
                  index === 0 ? '' : sizeClass.overlap
                )}
              />
            ))}
          </>
        )}
      </div>
      <div className={cx('font-medium text-zinc-400', sizeClass.label)}>
        {visibleItems.length > 0 ? `${total || visibleItems.length} participant${(Number(total) || visibleItems.length) === 1 ? '' : 's'}` : emptyLabel}
      </div>
    </div>
  );
}
