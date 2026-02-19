import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from '../components/AvatarPicker';
import { COUNTRIES, getCountryFlag } from '../components/PlayerRegistration';
import {
  addWorldMaxMachine,
  getWorldMaxCitySuggestions,
  getWorldMaxMeta,
  getWorldMaxPins,
  saveWorldMaxLocation,
} from '../utils/api';
import { getProfilePath } from '../utils/profile';
import {
  MAP_WIDTH,
  MAP_HEIGHT,
  BIOME_COLORS,
  COUNTRY_PATHS,
  LANDMARKS,
} from '../utils/worldMapPaths';

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

function pointToViewport(point, viewState) {
  if (!viewState) return point;
  return {
    x: point.x * viewState.zoom + viewState.panX,
    y: point.y * viewState.zoom + viewState.panY,
  };
}

function hasValidCoords(lat, lng) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

function countryMatchesFilter(value, filterValue) {
  if (!filterValue) return true;
  return normalizeSuggestText(value) === normalizeSuggestText(filterValue);
}

function MarioUserPin({ user, viewState }) {
  const point = pointToViewport(latLngToPoint(user.location_lat, user.location_lng), viewState);
  const profilePath = getProfilePath(user.id, user.username);

  return (
    <Link
      to={profilePath}
      title={`${user.username} - ${user.location_city}, ${user.location_country}`}
      className="absolute -translate-x-1/2 -translate-y-full group pointer-events-auto"
      style={{ left: `${point.x}px`, top: `${point.y}px` }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
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

function MachinePin({ machine, viewState, onOpen }) {
  const point = pointToViewport(latLngToPoint(machine.latitude, machine.longitude), viewState);
  const label = machine.venue_name
    ? `${machine.venue_name} - ${machine.city}, ${machine.country}`
    : `${machine.city}, ${machine.country}`;

  return (
    <button
      type="button"
      title={label}
      onClick={onOpen}
      className="absolute -translate-x-1/2 -translate-y-full group pointer-events-auto"
      style={{ left: `${point.x}px`, top: `${point.y}px` }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
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
    <svg
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      className="absolute inset-0 w-full h-full"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="wm-ocean-grad" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#2088d4" />
          <stop offset="100%" stopColor="#14387d" />
        </radialGradient>
        <filter id="wm-land-shadow" x="-2%" y="-2%" width="104%" height="108%">
          <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="rgba(0,0,0,0.25)" />
        </filter>
      </defs>

      <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#wm-ocean-grad)" />

      <g filter="url(#wm-land-shadow)">
        {COUNTRY_PATHS.map((country) => {
          const colors = BIOME_COLORS[country.biome] || BIOME_COLORS.grassland;
          return (
            <path
              key={country.id}
              d={country.d}
              fill={colors.fill}
              stroke={colors.stroke}
              strokeWidth="1"
              strokeLinejoin="round"
            />
          );
        })}
      </g>

      <g opacity="0.08">
        <line x1="0" y1={MAP_HEIGHT / 2} x2={MAP_WIDTH} y2={MAP_HEIGHT / 2} stroke="white" strokeWidth="1.5" strokeDasharray="12,8" />
        <line x1="0" y1={MAP_HEIGHT * 0.259} x2={MAP_WIDTH} y2={MAP_HEIGHT * 0.259} stroke="white" strokeWidth="0.8" strokeDasharray="8,12" />
        <line x1="0" y1={MAP_HEIGHT * 0.741} x2={MAP_WIDTH} y2={MAP_HEIGHT * 0.741} stroke="white" strokeWidth="0.8" strokeDasharray="8,12" />
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

function normalizeSuggestText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function uniqueTextValues(values) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    const text = String(value || '').trim();
    if (!text) continue;
    const key = normalizeSuggestText(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function WorldMaxModal({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/65 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-piu-border bg-piu-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-piu-border bg-piu-card/95 backdrop-blur">
          <h3 className="text-sm sm:text-base font-display font-bold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-piu-border text-gray-300 hover:text-white hover:border-piu-accent/60"
            aria-label="Close modal"
          >
            x
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
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
  const [listTab, setListTab] = useState('machines');
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showMachineModal, setShowMachineModal] = useState(false);
  const [showPlayers, setShowPlayers] = useState(true);
  const [showMachines, setShowMachines] = useState(true);
  const [showCities, setShowCities] = useState(true);
  const [playerCountryFilter, setPlayerCountryFilter] = useState('');
  const [machineCountryFilter, setMachineCountryFilter] = useState('');

  const [locationCitySuggestions, setLocationCitySuggestions] = useState([]);
  const [machineCitySuggestions, setMachineCitySuggestions] = useState([]);
  const locationSuggestSeqRef = useRef(0);
  const machineSuggestSeqRef = useRef(0);

  const viewportRef = useRef(null);
  const dragStateRef = useRef(null);
  const [viewState, setViewState] = useState(null);

  const computeFitView = useCallback(() => {
    if (!viewportRef.current) return { zoom: 0.5, panX: 0, panY: 0 };
    const rect = viewportRef.current.getBoundingClientRect();
    const pad = 20;
    const zoom = Math.min((rect.width - pad * 2) / MAP_WIDTH, (rect.height - pad * 2) / MAP_HEIGHT);
    const panX = (rect.width - MAP_WIDTH * zoom) / 2;
    const panY = (rect.height - MAP_HEIGHT * zoom) / 2;
    return { zoom, panX, panY };
  }, []);

  const gamesByCode = useMemo(() => mapByCode(meta.game_options), [meta.game_options]);
  const machinesByCode = useMemo(() => mapByCode(meta.machine_options), [meta.machine_options]);
  const countryNames = useMemo(() => uniqueTextValues(COUNTRIES.map((country) => country?.name)), []);

  const availableMachineCodes = useMemo(() => {
    const allowed = meta.machine_options_by_game?.[machineForm.game_code] || [];
    return Array.isArray(allowed) ? allowed : [];
  }, [meta.machine_options_by_game, machineForm.game_code]);

  const selectedGameOption = gamesByCode[machineForm.game_code] || null;
  const selectedMachineOption = machinesByCode[machineForm.machine_code] || null;

  const localCityPairs = useMemo(() => {
    const pairs = [];
    for (const row of pins.users || []) {
      const city = String(row.location_city || '').trim();
      const country = String(row.location_country || '').trim();
      if (!city) continue;
      pairs.push({ city, country });
    }
    for (const row of pins.machines || []) {
      const city = String(row.city || '').trim();
      const country = String(row.country || '').trim();
      if (!city) continue;
      pairs.push({ city, country });
    }
    const seen = new Set();
    const out = [];
    for (const pair of pairs) {
      const key = `${normalizeSuggestText(pair.city)}|${normalizeSuggestText(pair.country)}`;
      if (!pair.city || seen.has(key)) continue;
      seen.add(key);
      out.push(pair);
    }
    return out;
  }, [pins.users, pins.machines]);

  const locationCityOptions = useMemo(() => {
    const queryKey = normalizeSuggestText(locationForm.city);
    const countryKey = normalizeSuggestText(locationForm.country);
    const local = localCityPairs
      .filter((pair) => {
        if (!queryKey) return false;
        const cityKey = normalizeSuggestText(pair.city);
        const pairCountryKey = normalizeSuggestText(pair.country);
        if (!cityKey.includes(queryKey)) return false;
        if (!countryKey) return true;
        return pairCountryKey.includes(countryKey);
      })
      .map((pair) => pair.city);
    const remote = (locationCitySuggestions || []).map((item) => item.city);
    return uniqueTextValues([...remote, ...local]).slice(0, 12);
  }, [locationCitySuggestions, localCityPairs, locationForm.city, locationForm.country]);

  const machineCityOptions = useMemo(() => {
    const queryKey = normalizeSuggestText(machineForm.city);
    const countryKey = normalizeSuggestText(machineForm.country);
    const local = localCityPairs
      .filter((pair) => {
        if (!queryKey) return false;
        const cityKey = normalizeSuggestText(pair.city);
        const pairCountryKey = normalizeSuggestText(pair.country);
        if (!cityKey.includes(queryKey)) return false;
        if (!countryKey) return true;
        return pairCountryKey.includes(countryKey);
      })
      .map((pair) => pair.city);
    const remote = (machineCitySuggestions || []).map((item) => item.city);
    return uniqueTextValues([...remote, ...local]).slice(0, 12);
  }, [machineCitySuggestions, localCityPairs, machineForm.city, machineForm.country]);

  const playerCountryOptions = useMemo(
    () => uniqueTextValues((pins.users || []).map((row) => row?.location_country)).sort((a, b) => a.localeCompare(b)),
    [pins.users]
  );
  const machineCountryOptions = useMemo(
    () => uniqueTextValues((pins.machines || []).map((row) => row?.country)).sort((a, b) => a.localeCompare(b)),
    [pins.machines]
  );

  const filteredUsers = useMemo(
    () => (pins.users || []).filter((row) => (
      hasValidCoords(row.location_lat, row.location_lng)
      && countryMatchesFilter(row.location_country, playerCountryFilter)
    )),
    [pins.users, playerCountryFilter]
  );

  const filteredMachines = useMemo(
    () => (pins.machines || []).filter((row) => (
      hasValidCoords(row.latitude, row.longitude)
      && countryMatchesFilter(row.country, machineCountryFilter)
    )),
    [pins.machines, machineCountryFilter]
  );

  const visibleLandmarks = useMemo(() => {
    if (!showCities) return [];

    const playerCountryKey = normalizeSuggestText(playerCountryFilter);
    const machineCountryKey = normalizeSuggestText(machineCountryFilter);
    const userCountries = new Set(filteredUsers.map((row) => normalizeSuggestText(row.location_country)));
    const machineCountries = new Set(filteredMachines.map((row) => normalizeSuggestText(row.country)));

    if (!showPlayers && !showMachines) return LANDMARKS;
    if (showPlayers && !playerCountryKey && showMachines && !machineCountryKey) return LANDMARKS;

    return LANDMARKS.filter((landmark) => {
      const landmarkCountry = normalizeSuggestText(landmark.country);
      const inPlayerScope = showPlayers
        && (playerCountryKey ? landmarkCountry === playerCountryKey : userCountries.has(landmarkCountry));
      const inMachineScope = showMachines
        && (machineCountryKey ? landmarkCountry === machineCountryKey : machineCountries.has(landmarkCountry));
      return inPlayerScope || inMachineScope;
    });
  }, [
    showCities,
    showPlayers,
    showMachines,
    playerCountryFilter,
    machineCountryFilter,
    filteredUsers,
    filteredMachines,
  ]);

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

  useEffect(() => {
    const q = String(locationForm.city || '').trim();
    if (q.length < 2) {
      setLocationCitySuggestions([]);
      return undefined;
    }
    const seq = ++locationSuggestSeqRef.current;
    const timer = setTimeout(async () => {
      try {
        const data = await getWorldMaxCitySuggestions(q, locationForm.country);
        if (seq !== locationSuggestSeqRef.current) return;
        setLocationCitySuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
      } catch {
        if (seq === locationSuggestSeqRef.current) setLocationCitySuggestions([]);
      }
    }, 260);
    return () => clearTimeout(timer);
  }, [locationForm.city, locationForm.country]);

  useEffect(() => {
    const q = String(machineForm.city || '').trim();
    if (q.length < 2) {
      setMachineCitySuggestions([]);
      return undefined;
    }
    const seq = ++machineSuggestSeqRef.current;
    const timer = setTimeout(async () => {
      try {
        const data = await getWorldMaxCitySuggestions(q, machineForm.country);
        if (seq !== machineSuggestSeqRef.current) return;
        setMachineCitySuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
      } catch {
        if (seq === machineSuggestSeqRef.current) setMachineCitySuggestions([]);
      }
    }, 260);
    return () => clearTimeout(timer);
  }, [machineForm.city, machineForm.country]);

  // Compute initial fit-to-viewport view on mount
  useEffect(() => {
    if (viewState !== null) return;
    // Use a short timeout to ensure the viewport ref is measured
    const timer = setTimeout(() => {
      setViewState(computeFitView());
    }, 0);
    return () => clearTimeout(timer);
  }, [viewState, computeFitView]);

  const handleWheel = (e) => {
    e.preventDefault();
    if (!viewportRef.current || !viewState) return;

    const rect = viewportRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const direction = e.deltaY < 0 ? 1 : -1;

    setViewState((prev) => {
      if (!prev) return prev;
      const nextZoom = clamp(prev.zoom + direction * 0.12, 0.28, 3.5);
      const worldX = (mouseX - prev.panX) / prev.zoom;
      const worldY = (mouseY - prev.panY) / prev.zoom;
      const nextPanX = mouseX - worldX * nextZoom;
      const nextPanY = mouseY - worldY * nextZoom;
      return { zoom: nextZoom, panX: nextPanX, panY: nextPanY };
    });
  };

  const beginDrag = (clientX, clientY) => {
    if (!viewState) return;
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
      setShowLocationModal(false);
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
      setShowMachineModal(false);
      if (created?.machine?.id) {
        navigate(`/world-max/machine/${created.machine.id}`);
      }
    } catch (err) {
      setMachineMessage(err.message || 'Failed to add machine');
    } finally {
      setAddingMachine(false);
    }
  };

  const activeViewState = viewState || { zoom: 0.5, panX: 0, panY: 0 };
  const usersCount = showPlayers ? filteredUsers.length : 0;
  const machinesCount = showMachines ? filteredMachines.length : 0;

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
              <h2 className="text-sm sm:text-base font-display font-bold text-white">World Map</h2>
              <p className="text-[11px] sm:text-xs text-gray-400">Drag to move. Use wheel or controls to zoom. Click machine pins for details.</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setViewState((prev) => (prev ? { ...prev, zoom: clamp(prev.zoom - 0.16, 0.28, 3.5) } : prev))}
                className="w-8 h-8 rounded-lg bg-piu-dark border border-piu-border text-sm font-bold hover:border-piu-accent/60"
                aria-label="Zoom out"
              >
                -
              </button>
              <button
                type="button"
                onClick={() => setViewState((prev) => (prev ? { ...prev, zoom: clamp(prev.zoom + 0.16, 0.28, 3.5) } : prev))}
                className="w-8 h-8 rounded-lg bg-piu-dark border border-piu-border text-sm font-bold hover:border-piu-accent/60"
                aria-label="Zoom in"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => setViewState(computeFitView())}
                className="px-2.5 h-8 rounded-lg bg-piu-dark border border-piu-border text-[11px] font-display font-bold hover:border-piu-accent/60"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="px-3 sm:px-4 py-2.5 border-b border-piu-border/60 bg-piu-dark/25 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPlayers((prev) => !prev)}
              className={`px-2.5 h-8 rounded-lg border text-[11px] font-display font-bold transition-colors ${
                showPlayers ? 'border-blue-300/60 bg-blue-500/25 text-blue-100' : 'border-piu-border bg-piu-dark text-gray-400'
              }`}
            >
              Players
            </button>
            <button
              type="button"
              onClick={() => setShowMachines((prev) => !prev)}
              className={`px-2.5 h-8 rounded-lg border text-[11px] font-display font-bold transition-colors ${
                showMachines ? 'border-emerald-300/60 bg-emerald-500/25 text-emerald-100' : 'border-piu-border bg-piu-dark text-gray-400'
              }`}
            >
              Machines
            </button>
            <button
              type="button"
              onClick={() => setShowCities((prev) => !prev)}
              className={`px-2.5 h-8 rounded-lg border text-[11px] font-display font-bold transition-colors ${
                showCities ? 'border-amber-300/60 bg-amber-500/25 text-amber-100' : 'border-piu-border bg-piu-dark text-gray-400'
              }`}
            >
              Cities
            </button>

            <label className="text-[11px] text-gray-400 ml-1">Players in</label>
            <select
              className="h-8 rounded-lg bg-piu-dark border border-piu-border text-white text-[11px] px-2 min-w-[140px]"
              value={playerCountryFilter}
              onChange={(e) => setPlayerCountryFilter(e.target.value)}
            >
              <option value="">All countries</option>
              {playerCountryOptions.map((country) => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>

            <label className="text-[11px] text-gray-400 ml-1">Machines in</label>
            <select
              className="h-8 rounded-lg bg-piu-dark border border-piu-border text-white text-[11px] px-2 min-w-[140px]"
              value={machineCountryFilter}
              onChange={(e) => setMachineCountryFilter(e.target.value)}
            >
              <option value="">All countries</option>
              {machineCountryOptions.map((country) => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>
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
              className="absolute left-0 top-0 pointer-events-none"
              style={{
                width: `${MAP_WIDTH}px`,
                height: `${MAP_HEIGHT}px`,
                transform: `translate(${activeViewState.panX}px, ${activeViewState.panY}px) scale(${activeViewState.zoom})`,
                transformOrigin: '0 0',
              }}
            >
              <MapBackdrop />
            </div>

            <div className="absolute inset-0 pointer-events-none">
              {visibleLandmarks.map((landmark) => {
                const point = pointToViewport(latLngToPoint(landmark.lat, landmark.lng), activeViewState);
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

              {showPlayers && filteredUsers.map((u) => (
                <MarioUserPin key={`u-${u.id}`} user={u} viewState={activeViewState} />
              ))}

              {showMachines && filteredMachines.map((m) => (
                <MachinePin
                  key={`m-${m.id}`}
                  machine={m}
                  viewState={activeViewState}
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
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-display font-bold text-piu-accent">Pin Actions</h3>
              {!user && <Link to="/login" className="text-[11px] text-gray-400 hover:text-white">Login</Link>}
            </div>
            <p className="text-[11px] text-gray-400">
              Add yourself or a machine without taking up permanent screen space.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setLocationMessage('');
                  setShowLocationModal(true);
                }}
                className="btn-primary w-full text-sm py-2"
              >
                Add My Pin
              </button>
              <button
                type="button"
                onClick={() => {
                  setMachineMessage('');
                  setShowMachineModal(true);
                }}
                className="btn-secondary w-full text-sm py-2"
              >
                Add Machine Pin
              </button>
            </div>
            {locationMessage && (
              <p className={`text-xs ${locationMessage.toLowerCase().includes('failed') ? 'text-red-300' : 'text-emerald-300'}`}>
                {locationMessage}
              </p>
            )}
            {machineMessage && (
              <p className={`text-xs ${machineMessage.toLowerCase().includes('failed') ? 'text-red-300' : 'text-emerald-300'}`}>
                {machineMessage}
              </p>
            )}
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="flex items-center border-b border-piu-border/50">
              <button
                type="button"
                onClick={() => setListTab('machines')}
                className={`flex-1 px-3 py-2 text-xs font-display font-bold transition-colors ${
                  listTab === 'machines' ? 'bg-piu-accent/20 text-piu-accent' : 'text-gray-400 hover:text-white'
                }`}
              >
                Newest Machine Pins
              </button>
              <button
                type="button"
                onClick={() => setListTab('players')}
                className={`flex-1 px-3 py-2 text-xs font-display font-bold transition-colors ${
                  listTab === 'players' ? 'bg-piu-accent/20 text-piu-accent' : 'text-gray-400 hover:text-white'
                }`}
              >
                Recently Pinned Players
              </button>
            </div>
            <div className="p-3">
              {loading ? (
                <p className="text-xs text-gray-500">Loading map data...</p>
              ) : listTab === 'machines' ? (
                filteredMachines.length === 0 ? (
                  <p className="text-xs text-gray-500">
                    {machineCountryFilter ? `No machine pins found for ${machineCountryFilter}.` : 'No machine locations yet.'}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
                    {filteredMachines.slice(0, 28).map((machine) => (
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
                )
              ) : filteredUsers.length === 0 ? (
                <p className="text-xs text-gray-500">
                  {playerCountryFilter ? `No player pins found for ${playerCountryFilter}.` : 'No player pins yet.'}
                </p>
              ) : (
                <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
                  {filteredUsers.slice(0, 28).map((player) => (
                    <Link
                      key={player.id}
                      to={getProfilePath(player.id, player.username)}
                      className="flex items-center gap-2.5 rounded-lg border border-piu-border/40 bg-piu-dark/40 p-2 transition-colors hover:border-piu-accent/55"
                    >
                      {player.avatar ? (
                        <img src={getAvatarUrl(player.avatar)} alt={player.username} className="w-8 h-8 rounded-full object-cover border border-piu-border" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-piu-card border border-piu-border flex items-center justify-center text-xs font-display font-bold">
                          {(player.username || '?')[0].toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-display font-bold text-white truncate">@{player.username}</p>
                        <p className="text-[11px] text-gray-400 truncate">
                          {player.location_country_code && (
                            <span className="mr-1 align-middle">{getCountryFlag(player.location_country_code, 'inline-block h-3.5 align-middle')}</span>
                          )}
                          {player.location_city}, {player.location_country}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      <datalist id="worldmax-country-list">
        {countryNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id="worldmax-location-city-list">
        {locationCityOptions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id="worldmax-machine-city-list">
        {machineCityOptions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <WorldMaxModal open={showLocationModal} title="Add My Pin" onClose={() => setShowLocationModal(false)}>
        <form onSubmit={handleLocationSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Country</label>
            <input
              type="text"
              list="worldmax-country-list"
              className="input-field"
              placeholder="Japan"
              value={locationForm.country}
              onChange={(e) => setLocationForm((prev) => ({ ...prev, country: e.target.value }))}
              required
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">City / Town</label>
            <input
              type="text"
              list="worldmax-location-city-list"
              className="input-field"
              placeholder="Tokyo"
              value={locationForm.city}
              onChange={(e) => {
                const cityValue = e.target.value;
                const matched = (locationCitySuggestions || []).find(
                  (item) => normalizeSuggestText(item.city) === normalizeSuggestText(cityValue)
                );
                setLocationForm((prev) => ({
                  ...prev,
                  city: cityValue,
                  country: prev.country || matched?.country || prev.country,
                }));
              }}
              required
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
      </WorldMaxModal>

      <WorldMaxModal open={showMachineModal} title="Add Machine Pin" onClose={() => setShowMachineModal(false)}>
        <form onSubmit={handleMachineSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Country</label>
              <input
                type="text"
                list="worldmax-country-list"
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
                list="worldmax-machine-city-list"
                className="input-field"
                placeholder="Seoul"
                value={machineForm.city}
                onChange={(e) => {
                  const cityValue = e.target.value;
                  const matched = (machineCitySuggestions || []).find(
                    (item) => normalizeSuggestText(item.city) === normalizeSuggestText(cityValue)
                  );
                  setMachineForm((prev) => ({
                    ...prev,
                    city: cityValue,
                    country: prev.country || matched?.country || prev.country,
                  }));
                }}
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
      </WorldMaxModal>
    </div>
  );
}
