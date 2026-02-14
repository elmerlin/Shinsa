import React, { useRef } from 'react';

// PIU-themed preset avatars as inline SVGs
const PRESET_AVATARS = [
  {
    id: 'piu-fire',
    label: 'Fire',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#1a0a2e" width="100" height="100" rx="12"/><path d="M50 15c0 0-25 30-25 50a25 25 0 0050 0c0-20-25-50-25-50z" fill="#ff4444" opacity="0.9"/><path d="M50 35c0 0-15 18-15 30a15 15 0 0030 0c0-12-15-30-15-30z" fill="#ff8800" opacity="0.9"/><path d="M50 50c0 0-8 10-8 17a8 8 0 0016 0c0-7-8-17-8-17z" fill="#ffcc00"/></svg>`,
  },
  {
    id: 'piu-lightning',
    label: 'Lightning',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#0a0a2e" width="100" height="100" rx="12"/><polygon points="55,10 30,50 45,50 38,90 70,45 53,45" fill="#ffcc00"/><polygon points="55,10 30,50 45,50 38,90 70,45 53,45" fill="#fff" opacity="0.3"/></svg>`,
  },
  {
    id: 'piu-star',
    label: 'Star',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#1a0a3e" width="100" height="100" rx="12"/><polygon points="50,15 58,38 83,38 63,52 70,77 50,62 30,77 37,52 17,38 42,38" fill="#e040fb"/><polygon points="50,25 55,40 70,40 58,49 63,65 50,55 37,65 42,49 30,40 45,40" fill="#fff" opacity="0.4"/></svg>`,
  },
  {
    id: 'piu-crown',
    label: 'Crown',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#2a1a0a" width="100" height="100" rx="12"/><path d="M20 65 L20 40 L35 55 L50 30 L65 55 L80 40 L80 65 Z" fill="#ffd700"/><rect x="20" y="65" width="60" height="12" rx="3" fill="#ffd700"/><circle cx="35" cy="40" r="4" fill="#ff4444"/><circle cx="50" cy="28" r="4" fill="#4488ff"/><circle cx="65" cy="40" r="4" fill="#44ff44"/></svg>`,
  },
  {
    id: 'piu-skull',
    label: 'Skull',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#1a0a0a" width="100" height="100" rx="12"/><ellipse cx="50" cy="45" rx="25" ry="28" fill="#e8e8e8"/><circle cx="40" cy="40" r="8" fill="#1a0a0a"/><circle cx="60" cy="40" r="8" fill="#1a0a0a"/><ellipse cx="50" cy="55" rx="4" ry="5" fill="#1a0a0a"/><rect x="38" y="68" width="5" height="8" rx="1" fill="#e8e8e8"/><rect x="47" y="68" width="5" height="8" rx="1" fill="#e8e8e8"/><rect x="56" y="68" width="5" height="8" rx="1" fill="#e8e8e8"/></svg>`,
  },
  {
    id: 'piu-dragon',
    label: 'Dragon',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#0a1a0a" width="100" height="100" rx="12"/><path d="M30 70 Q30 40 50 25 Q70 40 70 70 Z" fill="#22cc44" opacity="0.8"/><path d="M35 65 Q35 45 50 33 Q65 45 65 65 Z" fill="#33ee55" opacity="0.6"/><circle cx="42" cy="48" r="5" fill="#ffcc00"/><circle cx="42" cy="48" r="2.5" fill="#1a0a0a"/><circle cx="58" cy="48" r="5" fill="#ffcc00"/><circle cx="58" cy="48" r="2.5" fill="#1a0a0a"/><path d="M44 60 L50 65 L56 60" stroke="#1a0a0a" stroke-width="2" fill="none"/><path d="M25 35 L30 45 L35 38" fill="#22cc44"/><path d="M75 35 L70 45 L65 38" fill="#22cc44"/></svg>`,
  },
  {
    id: 'piu-music',
    label: 'Music',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#1a0a2e" width="100" height="100" rx="12"/><circle cx="35" cy="65" r="10" fill="#e040fb" opacity="0.8"/><circle cx="65" cy="58" r="10" fill="#40c4ff" opacity="0.8"/><rect x="43" y="25" width="4" height="40" fill="#e040fb" rx="2"/><rect x="73" y="18" width="4" height="40" fill="#40c4ff" rx="2"/><path d="M45 25 L77 18 L77 28 L45 35 Z" fill="#fff" opacity="0.6"/></svg>`,
  },
  {
    id: 'piu-dice',
    label: 'Dice',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#1a1a2e" width="100" height="100" rx="12"/><rect x="20" y="20" width="60" height="60" rx="10" fill="#ff4444" opacity="0.9"/><circle cx="35" cy="35" r="5" fill="#fff"/><circle cx="65" cy="35" r="5" fill="#fff"/><circle cx="50" cy="50" r="5" fill="#fff"/><circle cx="35" cy="65" r="5" fill="#fff"><circle cx="65" cy="65" r="5" fill="#fff"/></svg>`,
  },
  {
    id: 'piu-heart',
    label: 'Heart',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#2a0a1a" width="100" height="100" rx="12"/><path d="M50 80 C20 55 10 35 30 25 C40 20 50 30 50 30 C50 30 60 20 70 25 C90 35 80 55 50 80Z" fill="#ff1744"/><path d="M50 72 C28 52 22 38 35 30 C42 26 50 33 50 33 C50 33 58 26 65 30 C78 38 72 52 50 72Z" fill="#ff5252" opacity="0.5"/></svg>`,
  },
  {
    id: 'piu-shield',
    label: 'Shield',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#0a0a2e" width="100" height="100" rx="12"/><path d="M50 15 L80 30 L80 55 C80 70 65 82 50 88 C35 82 20 70 20 55 L20 30 Z" fill="#3366ff" opacity="0.8"/><path d="M50 22 L73 34 L73 55 C73 66 62 76 50 82 C38 76 27 66 27 55 L27 34 Z" fill="#1a1a4e"/><path d="M45 50 L50 58 L62 40" stroke="#ffcc00" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    id: 'piu-ninja',
    label: 'Ninja',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#0a0a0a" width="100" height="100" rx="12"/><circle cx="50" cy="50" r="25" fill="#333"/><rect x="20" y="42" width="60" height="16" rx="4" fill="#222"/><circle cx="40" cy="50" r="5" fill="#ff4444"/><circle cx="60" cy="50" r="5" fill="#ff4444"/><circle cx="40" cy="50" r="2" fill="#fff"/><circle cx="60" cy="50" r="2" fill="#fff"/></svg>`,
  },
  {
    id: 'piu-phoenix',
    label: 'Phoenix',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#1a0a00" width="100" height="100" rx="12"/><path d="M50 20 C30 30 25 50 35 65 L50 85 L65 65 C75 50 70 30 50 20Z" fill="#ff6600" opacity="0.9"/><path d="M50 30 C38 38 35 52 42 62 L50 75 L58 62 C65 52 62 38 50 30Z" fill="#ffaa00" opacity="0.8"/><path d="M50 42 C44 46 42 55 47 60 L50 66 L53 60 C58 55 56 46 50 42Z" fill="#ffdd44"/><circle cx="44" cy="42" r="3" fill="#fff"/><circle cx="56" cy="42" r="3" fill="#fff"/></svg>`,
  },
];

function svgToDataUri(svgString) {
  return `data:image/svg+xml;base64,${btoa(svgString)}`;
}

export { PRESET_AVATARS, svgToDataUri };

export default function AvatarPicker({ value, onChange, shape = 'circle', size = 'md' }) {
  const fileInputRef = useRef(null);

  const isPreset = value && PRESET_AVATARS.some(a => svgToDataUri(a.svg) === value);
  const isUploaded = value && !isPreset;

  const sizeClasses = {
    sm: shape === 'circle' ? 'w-12 h-12' : 'w-14 h-14',
    md: shape === 'circle' ? 'w-16 h-16' : 'w-20 h-20',
    lg: shape === 'circle' ? 'w-20 h-20' : 'w-24 h-24',
  };

  const previewSize = sizeClasses[size] || sizeClasses.md;
  const roundClass = shape === 'circle' ? 'rounded-full' : 'rounded-lg';

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      onChange(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handlePresetSelect = (avatar) => {
    const dataUri = svgToDataUri(avatar.svg);
    if (value === dataUri) {
      onChange('');
    } else {
      onChange(dataUri);
    }
  };

  return (
    <div className="space-y-3">
      {/* Current preview + upload button */}
      <div className="flex items-center gap-4">
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`${previewSize} ${roundClass} cursor-pointer overflow-hidden border-2 border-dashed border-piu-border hover:border-piu-accent transition-colors flex items-center justify-center bg-piu-dark shrink-0`}
        >
          {value ? (
            <img src={value} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs text-gray-500 text-center leading-tight">Upload<br/>Image</span>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
        />
        <div className="flex-1">
          <p className="text-sm text-gray-400">Avatar</p>
          <p className="text-xs text-gray-600">Upload or choose a preset below</p>
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="text-xs text-red-400 hover:text-red-300 mt-1"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Preset avatar grid */}
      <div>
        <p className="text-xs text-gray-500 mb-2">Preset Avatars</p>
        <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
          {PRESET_AVATARS.map((avatar) => {
            const dataUri = svgToDataUri(avatar.svg);
            const isSelected = value === dataUri;
            return (
              <button
                key={avatar.id}
                type="button"
                onClick={() => handlePresetSelect(avatar)}
                className={`w-full aspect-square ${roundClass} overflow-hidden border-2 transition-all hover:scale-110 ${
                  isSelected
                    ? 'border-piu-accent shadow-lg shadow-piu-accent/30 scale-110'
                    : 'border-piu-border/50 hover:border-piu-accent/50'
                }`}
                title={avatar.label}
              >
                <img src={dataUri} alt={avatar.label} className="w-full h-full object-cover" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
