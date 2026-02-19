import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from '../components/AvatarPicker';
import { COUNTRIES, getCountryFlag } from '../components/PlayerRegistration';
import {
  addWorldMaxMachine,
  getWorldMaxMeta,
  getWorldMaxPins,
  saveWorldMaxLocation,
} from '../utils/api';

const MAP_WIDTH = 2200;
const MAP_HEIGHT = 1240;

const LANDMARKS = [
  { id: 'nyc', name: 'New York', icon: '🗽', lat: 40.7128, lng: -74.006 },
  { id: 'toronto', name: 'Toronto', icon: '🏙️', lat: 43.6532, lng: -79.3832 },
  { id: 'mexico-city', name: 'Mexico City', icon: '🦅', lat: 19.4326, lng: -99.1332 },
  { id: 'rio', name: 'Rio', icon: '⛪', lat: -22.9068, lng: -43.1729 },
  { id: 'london', name: 'London', icon: '🕰️', lat: 51.5072, lng: -0.1276 },
  { id: 'paris', name: 'Paris', icon: '🗼', lat: 48.8566, lng: 2.3522 },
  { id: 'rome', name: 'Rome', icon: '🏛️', lat: 41.9028, lng: 12.4964 },
  { id: 'cairo', name: 'Cairo', icon: '🔺', lat: 30.0444, lng: 31.2357 },
  { id: 'seoul', name: 'Seoul', icon: '🎆', lat: 37.5665, lng: 126.978 },
  { id: 'tokyo', name: 'Tokyo', icon: '🗺️', lat: 35.6762, lng: 139.6503 },
  { id: 'beijing', name: 'Beijing', icon: '🏯', lat: 39.9042, lng: 116.4074 },
  { id: 'sydney', name: 'Sydney', icon: '🎭', lat: -33.8688, lng: 151.2093 },
];

const COUNTRY_LOOKUP = (() => {
  const map = new Map();
  for (const country of COUNTRIES) {
    if (!country?.code) continue;
    const normalizedName = normalizeCountryString(country.name);
    if (normalizedName) map.set(normalizedName, country.code);
    map.set(String(country.code).toLowerCase(), country.code);
  }
  return map;
})();

function normalizeCountryString(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function resolveCountryCode(input) {
  const normalized = normalizeCountryString(input);
  return COUNTRY_LOOKUP.get(normalized) || '';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function latLngToPoint(lat, lng) {
  const x = ((Number(lng) + 180) / 360) * MAP_WIDTH;
  const y = ((90 - Number(lat)) / 180) * MAP_HEIGHT;
  return { x, y };
}

function MarioUserPin({ user }) {
  const point = latLngToPoint(user.location_lat, user.location_lng);
  const profilePath = user.username ? `/${encodeURIComponent(user.username)}` : `/profile/${user.id}`;

  return (
    <Link
      to={profilePath}
      title={`${user.username} - ${user.location_city}, ${user.location_country}`}
      className="absolute -translate-x-1/2 -translate-y-full group"
      style={{ left: `${point.x}px`, top: `${point.y}px` }}
    >
      <div className="flex flex-col items-center">
        <div className="mb-1 px-2 py-0.5 rounded-full bg-black/70 border border-white/20 text-[10px] text-white font-display shadow-lg whitespace-nowrap">
          {user.username}
        </div>
        <div className="relative w-11 h-11 rounded-full border-4 border-white bg-gradient-to-b from-red-400 via-red-500 to-red-700 shadow-[0_6px_14px_rgba(0,0,0,0.45)] transition-all group-hover:scale-105">
          <div className="absolute inset-[3px] rounded-full overflow-hidden bg-piu-card flex items-center justify-center">
            {user.avatar ? (
              <img src={getAvatarUrl(user.avatar)} alt={user.username} className="w-full h-full object-cover" />
            ) : (
              <span className="font-display font-bold text-xs text-white">{(user.username || '?')[0]?.toUpperCase()}</span>
            )}
          </div>
        </div>
        <div className="-mt-1 w-0 h-0 border-l-[8px] border-r-[8px] border-t-[13px] border-l-transparent border-r-transparent border-t-red-600" />
      </div>
    </Link>
  );
}

function MachinePin({ machine, onOpen }) {
  const point = latLngToPoint(machine.latitude, machine.longitude);
  const label = machine.venue_name
    ? `${machine.venue_name} - ${machine.city}, ${machine.country}`
    : `${machine.city}, ${machine.country}`;

  return (
    <button
      type="button"
      title={label}
      onClick={onOpen}
      className="absolute -translate-x-1/2 -translate-y-full group"
      style={{ left: `${point.x}px`, top: `${point.y}px` }}
    >
      <div className="flex flex-col items-center">
        <div className="mb-1 px-2 py-0.5 rounded-full bg-amber-500/90 border border-yellow-100/70 text-[10px] text-black font-display shadow-lg whitespace-nowrap max-w-[180px] truncate">
          {machine.venue_name || machine.city}
        </div>
        <div className="relative w-12 h-12 rounded-lg border-2 border-yellow-100 bg-gradient-to-b from-amber-100 via-amber-300 to-amber-500 shadow-[0_6px_14px_rgba(0,0,0,0.35)] overflow-hidden transition-all group-hover:scale-105">
          {machine.machine_image_url ? (
            <img src={machine.machine_image_url} alt={machine.machine_name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-lg">🕹️</div>
          )}
        </div>
        <div className="-mt-1 w-0 h-0 border-l-[7px] border-r-[7px] border-t-[11px] border-l-transparent border-r-transparent border-t-amber-500" />
      </div>
    </button>
  );
}

function MapBackdrop() {
  return (
    <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className="absolute inset-0 w-full h-full" aria-hidden="true">
      <defs>
        <linearGradient id="wm-ocean" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#56c7f7" />
          <stop offset="45%" stopColor="#2d8be6" />
          <stop offset="100%" stopColor="#1650b9" />
        </linearGradient>
        <linearGradient id="wm-land" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8ef24e" />
          <stop offset="55%" stopColor="#49bf2f" />
          <stop offset="100%" stopColor="#2a8f26" />
        </linearGradient>
        <pattern id="wm-water-tiles" width="44" height="44" patternUnits="userSpaceOnUse">
          <path d="M0 22C8 18 14 18 22 22C30 26 36 26 44 22" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="2" />
        </pattern>
        <filter id="wm-island-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="rgba(0,0,0,0.3)" />
        </filter>
      </defs>

      <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#wm-ocean)" />
      <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#wm-water-tiles)" opacity="0.55" />

      <g filter="url(#wm-island-shadow)">
        <path d="M180 350C260 280 420 250 510 300C600 350 610 470 540 540C480 600 360 620 250 580C150 545 90 450 180 350Z" fill="url(#wm-land)" stroke="#1f6f23" strokeWidth="8" />
        <path d="M560 640C720 560 920 540 1100 580C1260 620 1320 760 1240 860C1140 980 900 1020 700 960C540 910 420 760 560 640Z" fill="url(#wm-land)" stroke="#1f6f23" strokeWidth="8" />
        <path d="M920 280C1040 170 1240 160 1360 230C1480 300 1490 450 1400 520C1320 575 1160 585 1030 540C920 500 830 390 920 280Z" fill="url(#wm-land)" stroke="#1f6f23" strokeWidth="8" />
        <path d="M1450 620C1580 540 1780 550 1890 620C1980 680 2010 800 1940 890C1860 990 1680 1030 1530 980C1370 925 1320 720 1450 620Z" fill="url(#wm-land)" stroke="#1f6f23" strokeWidth="8" />
        <path d="M1620 290C1710 230 1840 240 1920 300C1990 360 1990 470 1930 540C1870 610 1750 620 1660 560C1570 500 1540 360 1620 290Z" fill="url(#wm-land)" stroke="#1f6f23" strokeWidth="8" />
      </g>

      <g stroke="#ffe47a" strokeWidth="5" strokeDasharray="10 12" fill="none" opacity="0.9">
        <path d="M420 430L760 700L1120 430L1540 760L1830 450" />
      </g>
      <g fill="#ffd54a" opacity="0.95">
        <circle cx="420" cy="430" r="9" />
        <circle cx="760" cy="700" r="9" />
        <circle cx="1120" cy="430" r="9" />
        <circle cx="1540" cy="760" r="9" />
        <circle cx="1830" cy="450" r="9" />
      </g>
    </svg>
  );
}

function mapByCode(items) {
  const map = {};
  for (const item of items || []) {
    map[item.code] = item;
  }
  return map;
}

export default function WorldMaxPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [meta, setMeta] = useState({ game_options: [], machine_options: [], machine_options_by_game: {} });
  const [pins, setPins] = useState({ users: [], machines: [], me: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [locationForm, setLocationForm] = useState({ country: '', city: '' });
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');

  const [machineForm, setMachineForm] = useState({
    country: '',
    city: '',
    venue_name: '',
    address: '',
    price_per_credit: '',
    game_code: 'phoenix',
    machine_code: 'lx',
  });
  const [addingMachine, setAddingMachine] = useState(false);
  const [machineMessage, setMachineMessage] = useState('');

  const viewportRef = useRef(null);
  const dragStateRef = useRef(null);
  const [viewState, setViewState] = useState({ zoom: 1, panX: -480, panY: -110 });

  const gamesByCode = useMemo(() => mapByCode(meta.game_options), [meta.game_options]);
  const machinesByCode = useMemo(() => mapByCode(meta.machine_options), [meta.machine_options]);

  const availableMachineCodes = useMemo(() => {
    const allowed = meta.machine_options_by_game?.[machineForm.game_code] || [];
    return Array.isArray(allowed) ? allowed : [];
  }, [meta.machine_options_by_game, machineForm.game_code]);

  const selectedGameOption = gamesByCode[machineForm.game_code] || null;
  const selectedMachineOption = machinesByCode[machineForm.machine_code] || null;

  useEffect(() => {
    if (!availableMachineCodes.includes(machineForm.machine_code) && availableMachineCodes.length > 0) {
      setMachineForm((prev) => ({ ...prev, machine_code: availableMachineCodes[0] }));
    }
  }, [availableMachineCodes, machineForm.machine_code]);

  useEffect(() => {
    setLocationForm({
      country: user?.location_country || '',
      city: user?.location_city || '',
    });

    setMachineForm((prev) => ({
      ...prev,
      country: prev.country || user?.location_country || '',
      city: prev.city || user?.location_city || '',
    }));
  }, [user]);

  const loadWorldData = async () => {
    setLoading(true);
    setError('');
    try {
      const [metaData, pinsData] = await Promise.all([getWorldMaxMeta(), getWorldMaxPins()]);
      setMeta(metaData || { game_options: [], machine_options: [], machine_options_by_game: {} });
      setPins(pinsData || { users: [], machines: [], me: null });
    } catch (err) {
      setError(err.message || 'Failed to load World Max data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorldData();
  }, []);

  const handleWheel = (e) => {
    e.preventDefault();
    if (!viewportRef.current) return;

    const rect = viewportRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const direction = e.deltaY < 0 ? 1 : -1;

    setViewState((prev) => {
      const nextZoom = clamp(prev.zoom + direction * 0.12, 0.65, 2.9);
      const worldX = (mouseX - prev.panX) / prev.zoom;
      const worldY = (mouseY - prev.panY) / prev.zoom;
      const nextPanX = mouseX - worldX * nextZoom;
      const nextPanY = mouseY - worldY * nextZoom;
      return { zoom: nextZoom, panX: nextPanX, panY: nextPanY };
    });
  };

  const beginDrag = (clientX, clientY) => {
    dragStateRef.current = {
      clientX,
      clientY,
      panX: viewState.panX,
      panY: viewState.panY,
    };
  };

  const moveDrag = (clientX, clientY) => {
    const drag = dragStateRef.current;
    if (!drag) return;

    const dx = clientX - drag.clientX;
    const dy = clientY - drag.clientY;
    setViewState((prev) => ({ ...prev, panX: drag.panX + dx, panY: drag.panY + dy }));
  };

  const endDrag = () => {
    dragStateRef.current = null;
  };

  const handleLocationSubmit = async (e) => {
    e.preventDefault();
    setLocationMessage('');

    if (!user) {
      setLocationMessage('Please log in to pin yourself on World Max.');
      return;
    }

    setSavingLocation(true);
    try {
      const countryCode = resolveCountryCode(locationForm.country);
      await saveWorldMaxLocation({
        country: locationForm.country,
        city: locationForm.city,
        country_code: countryCode,
      });
      await refreshUser();
      const updated = await getWorldMaxPins();
      setPins(updated);
      setLocationMessage('Location saved and your pin is now on the map.');
    } catch (err) {
      setLocationMessage(err.message || 'Failed to save location');
    } finally {
      setSavingLocation(false);
    }
  };

  const handleMachineSubmit = async (e) => {
    e.preventDefault();
    setMachineMessage('');

    if (!user) {
      setMachineMessage('Please log in to add a machine location.');
      return;
    }

    setAddingMachine(true);
    try {
      const countryCode = resolveCountryCode(machineForm.country);
      const created = await addWorldMaxMachine({
        ...machineForm,
        country_code: countryCode,
      });

      const refreshed = await getWorldMaxPins();
      setPins(refreshed);
      setMachineMessage('Machine location added.');
      setMachineForm((prev) => ({ ...prev, venue_name: '', address: '', price_per_credit: '' }));
      if (created?.machine?.id) {
        navigate(`/world-max/machine/${created.machine.id}`);
      }
    } catch (err) {
      setMachineMessage(err.message || 'Failed to add machine');
    } finally {
      setAddingMachine(false);
    }
  };

  const usersCount = pins.users.length;
  const machinesCount = pins.machines.length;

  return (
    <div className="max-w-[1400px] mx-auto px-3 sm:px-4 py-6 sm:py-8 space-y-4 sm:space-y-6">
      <section className="rounded-2xl border border-piu-border bg-gradient-to-br from-[#10214d] via-[#0d1f46] to-[#1c3a7a] p-4 sm:p-6 shadow-[0_14px_40px_rgba(0,0,0,0.35)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-wide">WORLD MAX</h1>
            <p className="text-xs sm:text-sm text-blue-100/80 max-w-xl mt-1">
              Pin your town, discover Pump communities worldwide, and track machines with exact location and pricing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-display">
            <span className="px-3 py-1 rounded-full bg-blue-500/20 border border-blue-200/20 text-blue-100">{usersCount} player pin{usersCount === 1 ? '' : 's'}</span>
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-200/20 text-emerald-100">{machinesCount} machine pin{machinesCount === 1 ? '' : 's'}</span>
          </div>
        </div>
      </section>

      {error && (
        <div className="card border-red-500/40 text-red-200 bg-red-900/20">
          Failed to load World Max: {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[2.2fr_1fr] gap-4 sm:gap-5">
        <section className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-piu-border/60 bg-piu-card/60">
            <div>
              <h2 className="text-sm sm:text-base font-display font-bold text-white">Mario-Style World Map</h2>
              <p className="text-[11px] sm:text-xs text-gray-400">Drag to move. Use wheel or controls to zoom. Click machine pins for details.</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setViewState((prev) => ({ ...prev, zoom: clamp(prev.zoom - 0.16, 0.65, 2.9) }))}
                className="w-8 h-8 rounded-lg bg-piu-dark border border-piu-border text-sm font-bold hover:border-piu-accent/60"
                aria-label="Zoom out"
              >
                -
              </button>
              <button
                type="button"
                onClick={() => setViewState((prev) => ({ ...prev, zoom: clamp(prev.zoom + 0.16, 0.65, 2.9) }))}
                className="w-8 h-8 rounded-lg bg-piu-dark border border-piu-border text-sm font-bold hover:border-piu-accent/60"
                aria-label="Zoom in"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => setViewState({ zoom: 1, panX: -480, panY: -110 })}
                className="px-2.5 h-8 rounded-lg bg-piu-dark border border-piu-border text-[11px] font-display font-bold hover:border-piu-accent/60"
              >
                Reset
              </button>
            </div>
          </div>

          <div
            ref={viewportRef}
            onWheel={handleWheel}
            onMouseDown={(e) => beginDrag(e.clientX, e.clientY)}
            onMouseMove={(e) => moveDrag(e.clientX, e.clientY)}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            onTouchStart={(e) => {
              const touch = e.touches?.[0];
              if (touch) beginDrag(touch.clientX, touch.clientY);
            }}
            onTouchMove={(e) => {
              const touch = e.touches?.[0];
              if (touch) moveDrag(touch.clientX, touch.clientY);
            }}
            onTouchEnd={endDrag}
            className="relative h-[58vh] min-h-[420px] max-h-[760px] overflow-hidden cursor-grab active:cursor-grabbing bg-[#14387d]"
          >
            <div
              className="absolute left-0 top-0"
              style={{
                width: `${MAP_WIDTH}px`,
                height: `${MAP_HEIGHT}px`,
                transform: `translate(${viewState.panX}px, ${viewState.panY}px) scale(${viewState.zoom})`,
                transformOrigin: '0 0',
              }}
            >
              <MapBackdrop />

              {LANDMARKS.map((landmark) => {
                const point = latLngToPoint(landmark.lat, landmark.lng);
                return (
                  <div
                    key={landmark.id}
                    className="absolute -translate-x-1/2 -translate-y-full pointer-events-none"
                    style={{ left: `${point.x}px`, top: `${point.y}px` }}
                  >
                    <div className="px-2 py-1 rounded-md bg-black/45 border border-white/20 text-[10px] text-white whitespace-nowrap shadow">
                      <span className="mr-1">{landmark.icon}</span>
                      <span className="font-display font-bold">{landmark.name}</span>
                    </div>
                  </div>
                );
              })}

              {pins.users
                .filter((u) => Number.isFinite(Number(u.location_lat)) && Number.isFinite(Number(u.location_lng)))
                .map((u) => (
                  <MarioUserPin key={`u-${u.id}`} user={u} />
                ))}

              {pins.machines
                .filter((m) => Number.isFinite(Number(m.latitude)) && Number.isFinite(Number(m.longitude)))
                .map((m) => (
                  <MachinePin
                    key={`m-${m.id}`}
                    machine={m}
                    onOpen={() => navigate(`/world-max/machine/${m.id}`)}
                  />
                ))}
            </div>
          </div>

          <div className="px-3 sm:px-4 py-2.5 border-t border-piu-border/60 bg-piu-card/60 flex flex-wrap gap-3 text-[11px] text-gray-300">
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 border border-white/70" /> Player pin</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400 border border-yellow-100/80" /> Machine image pin</span>
            <span className="inline-flex items-center gap-1"><span>🗽</span> Landmark node</span>
          </div>
        </section>

        <aside className="space-y-4">
          <form onSubmit={handleLocationSubmit} className="card space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-display font-bold text-piu-accent">Pin Yourself</h3>
              {!user && <Link to="/login" className="text-[11px] text-gray-400 hover:text-white">Login</Link>}
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Country</label>
              <input
                type="text"
                className="input-field"
                placeholder="Japan"
                value={locationForm.country}
                onChange={(e) => setLocationForm((prev) => ({ ...prev, country: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">City / Town</label>
              <input
                type="text"
                className="input-field"
                placeholder="Tokyo"
                value={locationForm.city}
                onChange={(e) => setLocationForm((prev) => ({ ...prev, city: e.target.value }))}
              />
            </div>

            <button type="submit" disabled={savingLocation} className="btn-primary w-full text-sm py-2">
              {savingLocation ? 'Saving...' : 'Add My Pin'}
            </button>

            {locationMessage && (
              <p className={`text-xs ${locationMessage.toLowerCase().includes('failed') ? 'text-red-300' : 'text-emerald-300'}`}>
                {locationMessage}
              </p>
            )}
          </form>

          <form onSubmit={handleMachineSubmit} className="card space-y-3">
            <h3 className="text-sm font-display font-bold text-piu-accent">Add Machine Location</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Country</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="South Korea"
                  value={machineForm.country}
                  onChange={(e) => setMachineForm((prev) => ({ ...prev, country: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">City / Town</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Seoul"
                  value={machineForm.city}
                  onChange={(e) => setMachineForm((prev) => ({ ...prev, city: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Address</label>
              <input
                type="text"
                className="input-field"
                placeholder="123 Arcade Street"
                value={machineForm.address}
                onChange={(e) => setMachineForm((prev) => ({ ...prev, address: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Price Per Credit</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. $1.00 / 2 credits"
                value={machineForm.price_per_credit}
                onChange={(e) => setMachineForm((prev) => ({ ...prev, price_per_credit: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Venue (optional)</label>
              <input
                type="text"
                className="input-field"
                placeholder="Arcade name"
                value={machineForm.venue_name}
                onChange={(e) => setMachineForm((prev) => ({ ...prev, venue_name: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Game</label>
                <select
                  className="input-field"
                  value={machineForm.game_code}
                  onChange={(e) => setMachineForm((prev) => ({ ...prev, game_code: e.target.value }))}
                >
                  {meta.game_options.map((game) => (
                    <option key={game.code} value={game.code}>{game.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Machine</label>
                <select
                  className="input-field"
                  value={machineForm.machine_code}
                  onChange={(e) => setMachineForm((prev) => ({ ...prev, machine_code: e.target.value }))}
                >
                  {meta.machine_options
                    .filter((machine) => availableMachineCodes.includes(machine.code))
                    .map((machine) => (
                      <option key={machine.code} value={machine.code}>{machine.name}</option>
                    ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-piu-border/50 p-2 bg-piu-dark/40">
                <p className="text-[10px] text-gray-500 mb-1">Game Art</p>
                {selectedGameOption?.image_url ? (
                  <img src={selectedGameOption.image_url} alt={selectedGameOption.name} className="w-full h-20 object-cover rounded-md border border-piu-border/40" />
                ) : (
                  <div className="w-full h-20 rounded-md bg-piu-dark border border-piu-border/40" />
                )}
              </div>
              <div className="rounded-lg border border-piu-border/50 p-2 bg-piu-dark/40">
                <p className="text-[10px] text-gray-500 mb-1">Machine Art</p>
                {selectedMachineOption?.image_url ? (
                  <img src={selectedMachineOption.image_url} alt={selectedMachineOption.name} className="w-full h-20 object-cover rounded-md border border-piu-border/40" />
                ) : (
                  <div className="w-full h-20 rounded-md bg-piu-dark border border-piu-border/40" />
                )}
              </div>
            </div>

            <button type="submit" disabled={addingMachine} className="btn-primary w-full text-sm py-2">
              {addingMachine ? 'Adding machine...' : 'Add Machine Pin'}
            </button>

            {machineMessage && (
              <p className={`text-xs ${machineMessage.toLowerCase().includes('failed') ? 'text-red-300' : 'text-emerald-300'}`}>
                {machineMessage}
              </p>
            )}
          </form>

          <div className="card">
            <h3 className="text-sm font-display font-bold text-piu-accent mb-2">Newest Machine Pins</h3>
            {loading ? (
              <p className="text-xs text-gray-500">Loading map data...</p>
            ) : pins.machines.length === 0 ? (
              <p className="text-xs text-gray-500">No machine locations yet.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {pins.machines.slice(0, 24).map((machine) => (
                  <button
                    key={machine.id}
                    type="button"
                    onClick={() => navigate(`/world-max/machine/${machine.id}`)}
                    className="w-full text-left rounded-lg border border-piu-border/50 bg-piu-dark/40 p-2.5 transition-colors hover:border-piu-accent/60"
                  >
                    <div className="flex items-center gap-2.5">
                      {machine.machine_image_url ? (
                        <img src={machine.machine_image_url} alt={machine.machine_name} className="w-10 h-10 rounded-md object-cover border border-piu-border/50" />
                      ) : (
                        <div className="w-10 h-10 rounded-md bg-piu-card border border-piu-border/50" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-display font-bold text-white truncate">{machine.venue_name || `${machine.city}, ${machine.country}`}</p>
                        <p className="text-[11px] text-gray-400 truncate">{machine.address || `${machine.city}, ${machine.country}`}</p>
                        <p className="text-[10px] text-gray-500 truncate">{machine.price_per_credit || 'No price listed'}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="text-sm font-display font-bold text-piu-accent mb-2">Recently Pinned Players</h3>
            {pins.users.length === 0 ? (
              <p className="text-xs text-gray-500">No player pins yet.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {pins.users.slice(0, 20).map((player) => (
                  <div key={player.id} className="flex items-center gap-2.5 rounded-lg border border-piu-border/40 bg-piu-dark/40 p-2">
                    {player.avatar ? (
                      <img src={getAvatarUrl(player.avatar)} alt={player.username} className="w-8 h-8 rounded-full object-cover border border-piu-border" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-piu-card border border-piu-border flex items-center justify-center text-xs font-display font-bold">
                        {(player.username || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-display font-bold text-white truncate">{player.username}</p>
                      <p className="text-[11px] text-gray-400 truncate">
                        {player.location_country_code && (
                          <span className="mr-1 align-middle">{getCountryFlag(player.location_country_code, 'inline-block h-3.5 align-middle')}</span>
                        )}
                        {player.location_city}, {player.location_country}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
