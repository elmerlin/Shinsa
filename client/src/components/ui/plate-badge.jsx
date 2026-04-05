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

const BLUE_PLATE_THEME = {
  '--plate-fill-top': '#fbfeff',
  '--plate-fill-mid': '#86e8ff',
  '--plate-fill-bottom': '#2089ff',
  '--plate-stroke': 'rgba(229, 247, 255, 0.96)',
  '--plate-glow': 'rgba(56, 189, 248, 0.36)',
  '--plate-border': 'rgba(118, 205, 255, 0.28)',
  '--plate-edge-glow': 'rgba(56, 189, 248, 0.18)',
  '--plate-panel-top': 'rgba(36, 46, 63, 0.98)',
  '--plate-panel-bottom': 'rgba(18, 24, 37, 0.98)',
  '--plate-top-glint': 'rgba(147, 231, 255, 0.18)',
  '--plate-reflection': 'rgba(198, 246, 255, 0.18)',
  '--plate-sweep': 'rgba(185, 240, 255, 0.28)',
};

const GOLD_PLATE_THEME = {
  '--plate-fill-top': '#fff8d8',
  '--plate-fill-mid': '#ffd84b',
  '--plate-fill-bottom': '#ffb300',
  '--plate-stroke': 'rgba(255, 246, 186, 0.96)',
  '--plate-glow': 'rgba(250, 204, 21, 0.36)',
  '--plate-border': 'rgba(250, 204, 21, 0.28)',
  '--plate-edge-glow': 'rgba(245, 158, 11, 0.18)',
  '--plate-panel-top': 'rgba(49, 42, 25, 0.98)',
  '--plate-panel-bottom': 'rgba(27, 22, 12, 0.98)',
  '--plate-top-glint': 'rgba(255, 235, 124, 0.16)',
  '--plate-reflection': 'rgba(255, 242, 191, 0.16)',
  '--plate-sweep': 'rgba(255, 235, 124, 0.26)',
};

const SILVER_PLATE_THEME = {
  '--plate-fill-top': '#fffefb',
  '--plate-fill-mid': '#ece8e1',
  '--plate-fill-bottom': '#a9a39c',
  '--plate-stroke': 'rgba(255, 248, 240, 0.95)',
  '--plate-glow': 'rgba(226, 232, 240, 0.32)',
  '--plate-border': 'rgba(226, 232, 240, 0.24)',
  '--plate-edge-glow': 'rgba(203, 213, 225, 0.16)',
  '--plate-panel-top': 'rgba(44, 46, 52, 0.98)',
  '--plate-panel-bottom': 'rgba(23, 26, 33, 0.98)',
  '--plate-top-glint': 'rgba(255, 255, 255, 0.16)',
  '--plate-reflection': 'rgba(255, 250, 242, 0.17)',
  '--plate-sweep': 'rgba(255, 255, 255, 0.24)',
};

const ORANGE_PLATE_THEME = {
  '--plate-fill-top': '#ffe1a8',
  '--plate-fill-mid': '#ffab39',
  '--plate-fill-bottom': '#ca5f09',
  '--plate-stroke': 'rgba(255, 223, 168, 0.96)',
  '--plate-glow': 'rgba(251, 146, 60, 0.36)',
  '--plate-border': 'rgba(251, 146, 60, 0.28)',
  '--plate-edge-glow': 'rgba(249, 115, 22, 0.18)',
  '--plate-panel-top': 'rgba(51, 38, 24, 0.98)',
  '--plate-panel-bottom': 'rgba(28, 18, 10, 0.98)',
  '--plate-top-glint': 'rgba(255, 207, 129, 0.16)',
  '--plate-reflection': 'rgba(255, 228, 180, 0.17)',
  '--plate-sweep': 'rgba(255, 199, 111, 0.24)',
};

const DEFAULT_PLATE_THEME = {
  '--plate-fill-top': '#f7fbff',
  '--plate-fill-mid': '#d7e4f4',
  '--plate-fill-bottom': '#9ba9c0',
  '--plate-stroke': 'rgba(255, 255, 255, 0.9)',
  '--plate-glow': 'rgba(226, 232, 240, 0.24)',
  '--plate-border': 'rgba(255, 255, 255, 0.12)',
  '--plate-edge-glow': 'rgba(226, 232, 240, 0.12)',
  '--plate-panel-top': 'rgba(42, 50, 63, 0.98)',
  '--plate-panel-bottom': 'rgba(23, 29, 40, 0.98)',
  '--plate-top-glint': 'rgba(255, 255, 255, 0.08)',
  '--plate-reflection': 'rgba(255, 255, 255, 0.12)',
  '--plate-sweep': 'rgba(255, 255, 255, 0.2)',
};

const THEME_BY_PLATE = {
  PG: BLUE_PLATE_THEME,
  UG: BLUE_PLATE_THEME,
  EG: GOLD_PLATE_THEME,
  SG: GOLD_PLATE_THEME,
  MG: SILVER_PLATE_THEME,
  TG: SILVER_PLATE_THEME,
  FG: ORANGE_PLATE_THEME,
  RG: ORANGE_PLATE_THEME,
};

export function PlateBadge({
  plate = '',
  size = 'sm',
  showName = false,
  className = '',
  codeClassName = '',
  nameClassName = '',
  title,
  style,
}) {
  const plateCode = normalizePlateCode(plate);
  if (!plateCode) return null;

  const sizeKey = SIZE_CLASSES[size] ? size : 'sm';
  const plateName = getPlateName(plateCode);
  const themeKey = /^[A-Z]{2}$/.test(plateCode) ? plateCode.toLowerCase() : 'default';
  const themeStyle = THEME_BY_PLATE[plateCode] || DEFAULT_PLATE_THEME;

  return (
    <span
      className={cx(
        'plate-chip',
        SIZE_CLASSES[sizeKey].root,
        `plate-chip--${themeKey}`,
        showName && 'plate-chip--with-name',
        className
      )}
      style={{ ...themeStyle, ...style }}
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
