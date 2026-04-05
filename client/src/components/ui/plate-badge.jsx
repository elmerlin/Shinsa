import React from 'react';
import { getPlateName, normalizePlateCode } from '../../utils/plates';

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

const SIZE_CLASSES = {
  xs: {
    root: 'plate-chip--xs',
    code: 'plate-chip__code--xs',
  },
  sm: {
    root: 'plate-chip--sm',
    code: 'plate-chip__code--sm',
  },
  md: {
    root: 'plate-chip--md',
    code: 'plate-chip__code--md',
  },
  lg: {
    root: 'plate-chip--lg',
    code: 'plate-chip__code--lg',
  },
};

export function PlateBadge({
  plate = '',
  size = 'sm',
  showName = false,
  className = '',
  codeClassName = '',
  nameClassName = '',
  title,
}) {
  const plateCode = normalizePlateCode(plate);
  if (!plateCode) return null;

  const sizeKey = SIZE_CLASSES[size] ? size : 'sm';
  const plateName = getPlateName(plateCode);
  const themeKey = /^[A-Z]{2}$/.test(plateCode) ? plateCode.toLowerCase() : 'default';

  return (
    <span
      className={cx(
        'plate-chip',
        SIZE_CLASSES[sizeKey].root,
        `plate-chip--${themeKey}`,
        showName && 'plate-chip--with-name',
        className
      )}
      title={title || plateName}
      aria-label={plateName}
    >
      <span className={cx('plate-chip__code', SIZE_CLASSES[sizeKey].code, codeClassName)}>
        {plateCode}
      </span>
      {showName ? (
        <span className={cx('plate-chip__name', nameClassName)}>
          {plateName}
        </span>
      ) : null}
    </span>
  );
}

export default PlateBadge;
