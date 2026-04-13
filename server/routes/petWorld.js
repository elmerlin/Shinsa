const express = require('express');
const { getDb } = require('../db/schema');
const { requireAuth } = require('./auth');
const {
  RESOURCE_KEYS,
  getAllBuildingDefs,
  getBuildingDef,
  getBuildCost,
  getUpgradeCost,
  getTierUnlockPopulation,
  getTotalInvestedCost,
  getWorkerCapacity,
  getMaxLevel,
  getBuildingProduction,
} = require('../lib/petWorld/buildings');
const { BIOMES, DEFAULT_STARTER_HOUSE, getBiomeDef, createStarterGrid } = require('../lib/petWorld/biomes');
const {
  parseGridData,
  serializeGridData,
  canPlace,
  sanitizeGrid,
  setBuildingOccupancy,
  clearBuildingOccupancy,
  expandGrid,
  isObstacleTile,
} = require('../lib/petWorld/grid');
const {
  GLOBAL_POP_CAP,
  getPhaseCap,
  parseSqliteDate,
  toSqliteDate,
  simulateWorld,
  getDerivedState,
  roundResource,
  clamp,
} = require('../lib/petWorld/economy');

const { createUserNotification } = require('../lib/notifications');
const { getActiveEvents, getSeasonalBonuses, getEventCountdown, pickEncounterType, pickSeasonalEncounterType, ENCOUNTER_TYPES } = require('../lib/petWorld/events');
const { getVillagePresence } = require('../lib/petWorld/ws');

const router = express.Router();

// In-memory co-presence tracking for village visits (HTTP heartbeat fallback)
// Map<hostUserId, Map<visitorUserId, { username, since }>>
const presenceMap = new Map();
const PRESENCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function registerPresence(hostId, visitorId, username) {
  if (!hostId || !visitorId || hostId === visitorId) return;
  if (!presenceMap.has(hostId)) presenceMap.set(hostId, new Map());
  presenceMap.get(hostId).set(visitorId, { username, since: Date.now() });
}

function getPresence(hostId) {
  // Merge HTTP heartbeat presence with WebSocket presence
  const wsPresence = getVillagePresence(hostId);
  const wsUserIds = new Set(wsPresence.map((v) => v.user_id));

  // Add HTTP-heartbeat visitors that are NOT already tracked via WS
  const httpVisitors = presenceMap.get(hostId);
  const merged = [...wsPresence];
  if (httpVisitors) {
    const now = Date.now();
    for (const [userId, data] of httpVisitors.entries()) {
      if (now - data.since > PRESENCE_TTL_MS) {
        httpVisitors.delete(userId);
      } else if (!wsUserIds.has(userId)) {
        merged.push({ user_id: userId, username: data.username, since: data.since });
      }
    }
    if (httpVisitors.size === 0) presenceMap.delete(hostId);
  }
  return merged;
}

const STARTING_RESOURCES = {
  food: 20,
  wood: 10,
  stone: 5,
  cloth: 0,
  gold: 0,
};

const OBSTACLE_CLEAR_RULES = {
  tree: { combos: 5, yield: { wood: 3 } },
  rock: { combos: 8, yield: { stone: 3 } },
  bush: { combos: 3, yield: { cloth: 1 } },
};

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ensureUserPetEconomyTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_pets (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      character TEXT NOT NULL DEFAULT 'dojocat',
      combo_balance INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  const columns = db.prepare("PRAGMA table_info(user_pets)").all().map((row) => row.name);
  const addCol = (name, def) => {
    if (!columns.includes(name)) db.exec(`ALTER TABLE user_pets ADD COLUMN ${name} ${def}`);
  };
  addCol('combo_balance', "INTEGER NOT NULL DEFAULT 0");
  addCol('updated_at', "TEXT DEFAULT (datetime('now'))");
  addCol('created_at', "TEXT DEFAULT (datetime('now'))");
  addCol('character', "TEXT NOT NULL DEFAULT 'dojocat'");
}

function ensurePetWorldTables(db) {
  ensureUserPetEconomyTable(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS pet_worlds (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      biome TEXT NOT NULL DEFAULT 'grasslands',
      grid_width INTEGER NOT NULL DEFAULT 12,
      grid_height INTEGER NOT NULL DEFAULT 12,
      grid_data TEXT NOT NULL DEFAULT '[]',
      expansions INTEGER NOT NULL DEFAULT 0,
      population INTEGER NOT NULL DEFAULT 2,
      happiness INTEGER NOT NULL DEFAULT 65,
      food REAL NOT NULL DEFAULT 20,
      wood REAL NOT NULL DEFAULT 10,
      stone REAL NOT NULL DEFAULT 5,
      cloth REAL NOT NULL DEFAULT 0,
      gold REAL NOT NULL DEFAULT 0,
      food_capacity INTEGER NOT NULL DEFAULT 100,
      wood_capacity INTEGER NOT NULL DEFAULT 100,
      stone_capacity INTEGER NOT NULL DEFAULT 50,
      cloth_capacity INTEGER NOT NULL DEFAULT 50,
      gold_capacity INTEGER NOT NULL DEFAULT 50,
      last_tick_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS pet_world_buildings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      building_type TEXT NOT NULL,
      grid_x INTEGER NOT NULL,
      grid_y INTEGER NOT NULL,
      width INTEGER NOT NULL DEFAULT 1,
      height INTEGER NOT NULL DEFAULT 1,
      level INTEGER NOT NULL DEFAULT 1,
      workers INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT 'building',
      is_starter INTEGER NOT NULL DEFAULT 0,
      build_complete_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_pwb_user ON pet_world_buildings(user_id)');
  db.exec(`
    CREATE TABLE IF NOT EXISTS pet_world_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id TEXT NOT NULL,
      to_user_id TEXT NOT NULL,
      offer_resource TEXT NOT NULL,
      offer_amount INTEGER NOT NULL,
      request_resource TEXT NOT NULL,
      request_amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_pwt_to ON pet_world_trades(to_user_id, status)');
  db.exec(`
    CREATE TABLE IF NOT EXISTS pet_world_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visitor_user_id TEXT NOT NULL,
      host_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_pwv_host ON pet_world_visits(host_user_id, created_at)');
  db.exec(`
    CREATE TABLE IF NOT EXISTS pet_world_encounters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      encounter_type TEXT NOT NULL DEFAULT 'wildlife',
      encounter_name TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      reward_resource TEXT,
      reward_amount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_pwe_user ON pet_world_encounters(user_id, status)');
  // Add variant column for cosmetic variety (flower colors, path styles)
  const buildingCols = db.prepare("PRAGMA table_info(pet_world_buildings)").all().map((r) => r.name);
  if (!buildingCols.includes('variant')) {
    db.exec("ALTER TABLE pet_world_buildings ADD COLUMN variant TEXT DEFAULT NULL");
  }
}

function ensureUserPetRow(db, userId) {
  db.prepare(`
    INSERT INTO user_pets (user_id, created_at, updated_at)
    VALUES (?, datetime('now'), datetime('now'))
    ON CONFLICT(user_id) DO NOTHING
  `).run(userId);
}

function getComboBalance(db, userId) {
  ensureUserPetRow(db, userId);
  const row = db.prepare('SELECT combo_balance FROM user_pets WHERE user_id = ?').get(userId);
  return safeNumber(row?.combo_balance, 0);
}

function spendCombos(db, userId, amount) {
  if (amount <= 0) return true;
  ensureUserPetRow(db, userId);
  const result = db.prepare(`
    UPDATE user_pets
    SET combo_balance = combo_balance - ?,
        updated_at = datetime('now')
    WHERE user_id = ?
      AND combo_balance >= ?
  `).run(amount, userId, amount);
  return result.changes > 0;
}

function addCombos(db, userId, amount) {
  if (amount <= 0) return;
  ensureUserPetRow(db, userId);
  db.prepare(`
    UPDATE user_pets
    SET combo_balance = combo_balance + ?,
        updated_at = datetime('now')
    WHERE user_id = ?
  `).run(amount, userId);
}

function loadWorld(db, userId) {
  return db.prepare('SELECT * FROM pet_worlds WHERE user_id = ?').get(userId);
}

function loadBuildings(db, userId) {
  return db.prepare('SELECT * FROM pet_world_buildings WHERE user_id = ? ORDER BY id ASC').all(userId);
}

function saveWorld(db, world) {
  db.prepare(`
    UPDATE pet_worlds
    SET biome = ?,
        grid_width = ?,
        grid_height = ?,
        grid_data = ?,
        expansions = ?,
        population = ?,
        happiness = ?,
        food = ?,
        wood = ?,
        stone = ?,
        cloth = ?,
        gold = ?,
        food_capacity = ?,
        wood_capacity = ?,
        stone_capacity = ?,
        cloth_capacity = ?,
        gold_capacity = ?,
        last_tick_at = ?
    WHERE user_id = ?
  `).run(
    world.biome,
    world.grid_width,
    world.grid_height,
    world.grid_data,
    world.expansions,
    world.population,
    world.happiness,
    roundResource(world.food),
    roundResource(world.wood),
    roundResource(world.stone),
    roundResource(world.cloth),
    roundResource(world.gold),
    world.food_capacity,
    world.wood_capacity,
    world.stone_capacity,
    world.cloth_capacity,
    world.gold_capacity,
    world.last_tick_at,
    world.user_id
  );
}

function saveBuildings(db, buildings) {
  const updateStmt = db.prepare(`
    UPDATE pet_world_buildings
    SET grid_x = ?,
        grid_y = ?,
        width = ?,
        height = ?,
        level = ?,
        workers = ?,
        state = ?,
        is_starter = ?,
        build_complete_at = ?
    WHERE id = ?
  `);
  for (const building of buildings) {
    updateStmt.run(
      building.grid_x,
      building.grid_y,
      building.width,
      building.height,
      building.level,
      building.workers,
      building.state,
      building.is_starter || 0,
      building.build_complete_at,
      building.id
    );
  }
}

function attachBiomeSpecialty(world) {
  const def = getBiomeDef(world.biome);
  return { ...world, biome_specialty: def.specialty };
}

function runCatchup(db, userId, now = new Date()) {
  const world = loadWorld(db, userId);
  if (!world) return null;
  const buildings = loadBuildings(db, userId);
  const comboBalance = getComboBalance(db, userId);
  const grid = parseGridData(world.grid_data);
  const gridFeatures = grid.features || [];
  const seasonal = getSeasonalBonuses(now);
  const simulation = simulateWorld(attachBiomeSpecialty(world), buildings, {
    now,
    phaseCap: getPhaseCap(safeNumber(world.expansions, 0)),
    comboBalance,
    gridFeatures,
    seasonalBonuses: seasonal.productionBonuses,
    seasonalHappinessBonus: seasonal.happinessBonus,
  });
  delete simulation.world.biome_specialty;
  delete simulation.world._seasonalBonuses;
  delete simulation.world._gridFeatures;
  simulation.world.grid_width = simulation.world.grid_width || parseGridData(simulation.world.grid_data).w;
  simulation.world.grid_height = simulation.world.grid_height || parseGridData(simulation.world.grid_data).h;
  saveWorld(db, simulation.world);
  saveBuildings(db, simulation.buildings);
  if (simulation.comboConsumed > 0) {
    spendCombos(db, userId, simulation.comboConsumed);
  }

  // Encounter spawning: if watchtower is built and steps ran, chance to spawn wildlife encounter
  if (simulation.stepsToRun > 0) {
    const hasWatchtower = simulation.buildings.some(
      (b) => b.building_type === 'watchtower' && b.state === 'built'
    );
    if (hasWatchtower) {
      const pending = db.prepare(
        "SELECT COUNT(*) AS count FROM pet_world_encounters WHERE user_id = ? AND status = 'pending'"
      ).get(userId);
      if ((pending?.count || 0) < 3) {
        // ~25% chance per catchup with watchtower, scaling with steps
        const spawnChance = Math.min(0.8, 0.25 * simulation.stepsToRun);
        if (Math.random() < spawnChance) {
          const encounter = pickSeasonalEncounterType(now);
          const rewardEntries = Object.entries(encounter.reward || {});
          const primaryResource = rewardEntries[0]?.[0] || 'food';
          const primaryAmount = rewardEntries[0]?.[1] || 0;
          const expiresAt = toSqliteDate(new Date(now.getTime() + 24 * 60 * 60 * 1000));
          db.prepare(`
            INSERT INTO pet_world_encounters (user_id, encounter_type, encounter_name, description, reward_resource, reward_amount, status, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
          `).run(userId, encounter.type, encounter.name, encounter.description, primaryResource, primaryAmount, expiresAt);
        }
      }
    }
  }

  return simulation;
}

function formatBuilding(building) {
  const def = getBuildingDef(building.building_type);
  const nextLevel = (safeNumber(building.level, 1) || 1) + 1;
  return {
    id: building.id,
    type: building.building_type,
    name: def?.name || building.building_type,
    tier: def?.tier || 1,
    description: def?.description || '',
    width: safeNumber(building.width, def?.width || 1),
    height: safeNumber(building.height, def?.height || 1),
    grid_x: safeNumber(building.grid_x, 0),
    grid_y: safeNumber(building.grid_y, 0),
    level: safeNumber(building.level, 1),
    workers: safeNumber(building.workers, 0),
    max_workers: getWorkerCapacity(building.building_type, safeNumber(building.level, 1)),
    state: building.state,
    is_starter: !!building.is_starter,
    build_complete_at: building.build_complete_at,
    production: def ? getBuildPreview(def, building.level) : null,
    variant: building.variant || null,
    can_upgrade: safeNumber(building.level, 1) < getMaxLevel(building.building_type),
    upgrade_cost: getUpgradeCost(building.building_type, nextLevel),
  };
}

function getBuildPreview(def, level = 1) {
  if (!def) return null;
  return {
    production: def.production ? getBuildingProduction(def.id, level) : null,
    housing: def.housing ? def.housing * safeNumber(level, 1) : 0,
    happiness: def.happiness ? def.happiness * safeNumber(level, 1) : 0,
    storageBonus: def.storageBonus ? def.storageBonus * safeNumber(level, 1) : 0,
  };
}

function countHousing(buildings, now = new Date()) {
  const nowMs = now.getTime();
  return buildings.reduce((sum, building) => {
    const def = getBuildingDef(building.building_type);
    if (!def?.housing) return sum;
    const isBuilt = building.state === 'built' || parseSqliteDate(building.build_complete_at).getTime() <= nowMs;
    if (!isBuilt) return sum;
    return sum + (def.housing * safeNumber(building.level, 1));
  }, 0);
}

function formatWorldBundle(db, world, buildings, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const derived = getDerivedState(attachBiomeSpecialty(world), buildings, now.getTime());
  const owner = db.prepare('SELECT id, username FROM users WHERE id = ?').get(world.user_id);
  const ownerPet = db.prepare('SELECT character FROM user_pets WHERE user_id = ?').get(world.user_id);
  const ownerPetCharacter = String(ownerPet?.character || 'dojocat').trim().toLowerCase() || 'dojocat';
  const visitCount = db.prepare('SELECT COUNT(*) AS count FROM pet_world_visits WHERE host_user_id = ?').get(world.user_id)?.count || 0;
  const viewerId = options.viewerId || null;
  return {
    world: {
      user_id: world.user_id,
      username: owner?.username || '',
      biome: world.biome,
      grid_width: safeNumber(world.grid_width, 12),
      grid_height: safeNumber(world.grid_height, 12),
      grid: (() => {
        const parsed = parseGridData(world.grid_data);
        const { grid: sanitized, changed } = sanitizeGrid(parsed);
        // Persist sanitized grid back so legacy worlds are fixed permanently
        if (changed) {
          try {
            db.prepare('UPDATE pet_worlds SET grid_data = ? WHERE user_id = ?')
              .run(serializeGridData(sanitized), world.user_id);
          } catch (_) { /* non-critical — will retry on next load */ }
        }
        return sanitized;
      })(),
      expansions: safeNumber(world.expansions, 0),
      population: safeNumber(world.population, 0),
      happiness: safeNumber(world.happiness, 0),
      housing_capacity: derived.housing,
      population_cap: getPhaseCap(safeNumber(world.expansions, 0)),
      assigned_workers: derived.assignedWorkers,
      available_workers: derived.availableWorkers,
      unassigned_pets: Math.max(0, safeNumber(world.population, 0) - derived.assignedWorkers),
      food: roundResource(world.food),
      wood: roundResource(world.wood),
      stone: roundResource(world.stone),
      cloth: roundResource(world.cloth),
      gold: roundResource(world.gold),
      food_capacity: safeNumber(world.food_capacity, 100),
      wood_capacity: safeNumber(world.wood_capacity, 100),
      stone_capacity: safeNumber(world.stone_capacity, 50),
      cloth_capacity: safeNumber(world.cloth_capacity, 50),
      gold_capacity: safeNumber(world.gold_capacity, 50),
      happiness_bonus: derived.happinessBonus,
      happiness_target: Math.min(100, 50 + derived.happinessBonus),
      combo_balance: viewerId === world.user_id ? getComboBalance(db, world.user_id) : null,
      last_tick_at: world.last_tick_at,
      created_at: world.created_at,
      visit_count: visitCount,
      hero_character: ownerPetCharacter,
      pet_character: ownerPetCharacter,
      has_market: buildings.some((building) => building.building_type === 'market' && building.state === 'built'),
      has_watchtower: buildings.some((building) => building.building_type === 'watchtower' && building.state === 'built'),
    },
    buildings: buildings.map(formatBuilding),
    building_catalog: getAllBuildingDefs(),
    active_events: getActiveEvents(now).map((evt) => ({ ...evt, daysLeft: getEventCountdown(evt, now) })),
    visitors_online: getPresence(world.user_id),
  };
}

function validateResources(world, materials = {}) {
  for (const [resourceKey, amount] of Object.entries(materials)) {
    if (safeNumber(world[resourceKey], 0) < amount) return false;
  }
  return true;
}

function deductResources(world, materials = {}) {
  for (const [resourceKey, amount] of Object.entries(materials)) {
    world[resourceKey] = roundResource(safeNumber(world[resourceKey], 0) - amount);
  }
}

function addResources(world, materials = {}) {
  for (const [resourceKey, amount] of Object.entries(materials)) {
    world[resourceKey] = roundResource(safeNumber(world[resourceKey], 0) + amount);
  }
}

function hasBuiltBuilding(buildings, type) {
  return buildings.some((building) => building.building_type === type && building.state === 'built');
}

function getWorldTradeSummary(db, userId) {
  const rows = db.prepare(`
    SELECT
      t.*,
      fu.username AS from_username,
      tu.username AS to_username
    FROM pet_world_trades t
    LEFT JOIN users fu ON fu.id = t.from_user_id
    LEFT JOIN users tu ON tu.id = t.to_user_id
    WHERE t.from_user_id = ? OR t.to_user_id = ?
    ORDER BY t.created_at DESC
    LIMIT 100
  `).all(userId, userId);
  return rows.map((row) => ({
    id: row.id,
    from_user_id: row.from_user_id,
    from_username: row.from_username || '',
    to_user_id: row.to_user_id,
    to_username: row.to_username || '',
    offer_resource: row.offer_resource,
    offer_amount: row.offer_amount,
    request_resource: row.request_resource,
    request_amount: row.request_amount,
    status: row.status,
    created_at: row.created_at,
  }));
}

function insertVisitLog(db, visitorId, hostId) {
  if (!visitorId || !hostId || visitorId === hostId) return;
  db.prepare(`
    INSERT INTO pet_world_visits (visitor_user_id, host_user_id, created_at)
    VALUES (?, ?, datetime('now'))
  `).run(visitorId, hostId);
}

function getTradeParticipantBundle(db, userId, now) {
  const simulation = runCatchup(db, userId, now);
  if (!simulation) return null;
  return {
    simulation,
    world: simulation.world,
    buildings: simulation.buildings,
  };
}

router.get('/buildings', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetWorldTables(db);
  res.json({ buildings: getAllBuildingDefs() });
});

router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetWorldTables(db);
  const txn = db.transaction(() => runCatchup(db, req.user.id, new Date()));
  const simulation = txn();
  if (!simulation) return res.json({ world: null, buildings: [], building_catalog: getAllBuildingDefs() });
  return res.json(formatWorldBundle(db, simulation.world, simulation.buildings, { viewerId: req.user.id }));
});

router.get('/visit/:userId', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetWorldTables(db);
  const hostId = req.params.userId;
  const world = loadWorld(db, hostId);
  if (!world) return res.status(404).json({ error: 'World not found' });
  const buildings = loadBuildings(db, hostId);
  insertVisitLog(db, req.user.id, hostId);
  const visitor = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  registerPresence(hostId, req.user.id, visitor?.username || '');
  return res.json(formatWorldBundle(db, world, buildings, { viewerId: req.user.id }));
});

router.get('/leaderboard', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetWorldTables(db);
  const rows = db.prepare(`
    SELECT pw.user_id, pw.biome, pw.population, pw.happiness, pw.expansions, pw.created_at,
           u.username
    FROM pet_worlds pw
    LEFT JOIN users u ON u.id = pw.user_id
    ORDER BY pw.population DESC, pw.happiness DESC, pw.created_at ASC
    LIMIT 100
  `).all();
  res.json({
    leaderboard: rows.map((row, index) => ({
      rank: index + 1,
      user_id: row.user_id,
      username: row.username || '',
      biome: row.biome,
      population: row.population,
      happiness: row.happiness,
      expansions: row.expansions,
      is_me: row.user_id === req.user.id,
    })),
  });
});

router.get('/trades', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetWorldTables(db);
  res.json({ trades: getWorldTradeSummary(db, req.user.id) });
});

router.post('/create', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetWorldTables(db);
  const biome = String(req.body?.biome || '').trim().toLowerCase();
  if (!BIOMES[biome]) return res.status(400).json({ error: 'Invalid biome' });
  const txn = db.transaction(() => {
    ensureUserPetRow(db, req.user.id);
    if (loadWorld(db, req.user.id)) throw new Error('World already exists');
    const grid = createStarterGrid(biome);
    db.prepare(`
      INSERT INTO pet_worlds (
        user_id, biome, grid_width, grid_height, grid_data, expansions, population, happiness,
        food, wood, stone, cloth, gold,
        food_capacity, wood_capacity, stone_capacity, cloth_capacity, gold_capacity,
        last_tick_at, created_at
      ) VALUES (?, ?, 12, 12, ?, 0, 2, 65, ?, ?, ?, ?, ?, 100, 100, 50, 50, 50, datetime('now'), datetime('now'))
    `).run(
      req.user.id,
      biome,
      serializeGridData(grid),
      STARTING_RESOURCES.food,
      STARTING_RESOURCES.wood,
      STARTING_RESOURCES.stone,
      STARTING_RESOURCES.cloth,
      STARTING_RESOURCES.gold
    );
    const starterId = db.prepare(`
      INSERT INTO pet_world_buildings (
        user_id, building_type, grid_x, grid_y, width, height, level, workers, state, is_starter, build_complete_at, created_at
      ) VALUES (?, 'house', ?, ?, ?, ?, 1, 0, 'built', 1, datetime('now'), datetime('now'))
    `).run(
      req.user.id,
      DEFAULT_STARTER_HOUSE.x,
      DEFAULT_STARTER_HOUSE.y,
      DEFAULT_STARTER_HOUSE.width,
      DEFAULT_STARTER_HOUSE.height
    ).lastInsertRowid;
    setBuildingOccupancy(grid, Number(starterId), DEFAULT_STARTER_HOUSE.x, DEFAULT_STARTER_HOUSE.y, DEFAULT_STARTER_HOUSE.width, DEFAULT_STARTER_HOUSE.height);
    db.prepare('UPDATE pet_worlds SET grid_data = ? WHERE user_id = ?').run(serializeGridData(grid), req.user.id);
    const world = loadWorld(db, req.user.id);
    const buildings = loadBuildings(db, req.user.id);
    return formatWorldBundle(db, world, buildings, { viewerId: req.user.id });
  });
  try {
    res.json(txn());
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not create world' });
  }
});

router.post('/build', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetWorldTables(db);
  const type = String(req.body?.type || '').trim();
  const x = safeNumber(req.body?.x, -1);
  const y = safeNumber(req.body?.y, -1);
  const variant = req.body?.variant ? String(req.body.variant).trim() : null;
  const def = getBuildingDef(type);
  if (!def) return res.status(400).json({ error: 'Unknown building type' });

  const txn = db.transaction(() => {
    const simulation = runCatchup(db, req.user.id, new Date());
    if (!simulation) throw new Error('Create a world first');
    const world = simulation.world;
    const buildings = simulation.buildings;
    const grid = parseGridData(world.grid_data);
    if (safeNumber(world.population, 0) < getTierUnlockPopulation(def.tier)) {
      throw new Error('Population is too low for that building tier');
    }
    const cost = getBuildCost(type);
    if (!validateResources(world, cost.materials)) throw new Error('Not enough resources');
    if (!canPlace(grid, x, y, def.width, def.height, { requiresAdjacentWater: !!def.requiresAdjacentWater })) {
      throw new Error('Cannot place building there');
    }
    if (!spendCombos(db, req.user.id, cost.combos)) throw new Error('Not enough combos');
    deductResources(world, cost.materials);
    const buildCompleteAt = toSqliteDate(Date.now() + ((def.buildMinutes || 0) * 60 * 1000));
    const state = (def.buildMinutes || 0) <= 0 ? 'built' : 'building';
    const insertResult = db.prepare(`
      INSERT INTO pet_world_buildings (
        user_id, building_type, grid_x, grid_y, width, height, level, workers, state, is_starter, build_complete_at, variant, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, 0, ?, ?, datetime('now'))
    `).run(req.user.id, type, x, y, def.width, def.height, state, buildCompleteAt, variant);
    const buildingId = Number(insertResult.lastInsertRowid);
    setBuildingOccupancy(grid, buildingId, x, y, def.width, def.height);
    world.grid_data = serializeGridData(grid);
    world.grid_width = grid.w;
    world.grid_height = grid.h;
    saveWorld(db, world);
    const building = db.prepare('SELECT * FROM pet_world_buildings WHERE id = ?').get(buildingId);
    return formatWorldBundle(db, world, [...buildings, building], { viewerId: req.user.id });
  });
  try {
    res.json(txn());
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not place building' });
  }
});

router.post('/demolish', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetWorldTables(db);
  const buildingId = safeNumber(req.body?.buildingId, 0);
  const txn = db.transaction(() => {
    const simulation = runCatchup(db, req.user.id, new Date());
    if (!simulation) throw new Error('Create a world first');
    const world = simulation.world;
    const buildings = simulation.buildings;
    const target = buildings.find((building) => building.id === buildingId);
    if (!target) throw new Error('Building not found');
    const grid = parseGridData(world.grid_data);
    clearBuildingOccupancy(grid, buildingId);
    world.grid_data = serializeGridData(grid);
    const totalCost = getTotalInvestedCost(target);
    if (!target.is_starter) {
      addCombos(db, req.user.id, Math.floor((totalCost.combos || 0) * 0.5));
      const materialRefund = Object.fromEntries(
        Object.entries(totalCost.materials || {}).map(([key, value]) => [key, Math.floor(value * 0.5)])
      );
      addResources(world, materialRefund);
    }
    db.prepare('DELETE FROM pet_world_buildings WHERE id = ? AND user_id = ?').run(buildingId, req.user.id);
    const remaining = buildings.filter((building) => building.id !== buildingId);
    const derived = getDerivedState(attachBiomeSpecialty(world), remaining, Date.now());
    world.food_capacity = derived.caps.food;
    world.wood_capacity = derived.caps.wood;
    world.stone_capacity = derived.caps.stone;
    world.cloth_capacity = derived.caps.cloth;
    world.gold_capacity = derived.caps.gold;
    RESOURCE_KEYS.forEach((key) => {
      world[key] = Math.min(world[key], derived.caps[key]);
    });
    saveWorld(db, world);
    return formatWorldBundle(db, world, remaining, { viewerId: req.user.id });
  });
  try {
    res.json(txn());
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not demolish building' });
  }
});

router.post('/upgrade', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetWorldTables(db);
  const buildingId = safeNumber(req.body?.buildingId, 0);
  const txn = db.transaction(() => {
    const simulation = runCatchup(db, req.user.id, new Date());
    if (!simulation) throw new Error('Create a world first');
    const world = simulation.world;
    const buildings = simulation.buildings;
    const target = buildings.find((building) => building.id === buildingId);
    if (!target) throw new Error('Building not found');
    if (target.state !== 'built') throw new Error('Finish construction first');
    const nextLevel = safeNumber(target.level, 1) + 1;
    const upgradeCost = getUpgradeCost(target.building_type, nextLevel);
    if (!upgradeCost) throw new Error('Building is already at max level');
    if (!validateResources(world, upgradeCost.materials)) {
      throw new Error('Not enough resources');
    }
    if (!spendCombos(db, req.user.id, upgradeCost.combos)) throw new Error('Not enough combos');
    deductResources(world, upgradeCost.materials);
    target.level = nextLevel;
    saveWorld(db, world);
    saveBuildings(db, buildings);
    return formatWorldBundle(db, world, buildings, { viewerId: req.user.id });
  });
  try {
    res.json(txn());
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not upgrade building' });
  }
});

router.post('/assign-worker', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetWorldTables(db);
  const buildingId = safeNumber(req.body?.buildingId, 0);
  const count = safeNumber(req.body?.count, 0);
  const txn = db.transaction(() => {
    const simulation = runCatchup(db, req.user.id, new Date());
    if (!simulation) throw new Error('Create a world first');
    const { world, buildings } = simulation;
    const target = buildings.find((building) => building.id === buildingId);
    if (!target) throw new Error('Building not found');
    if (target.state !== 'built') throw new Error('Building is not ready');
    const maxWorkers = getWorkerCapacity(target.building_type, safeNumber(target.level, 1));
    if (maxWorkers <= 0) throw new Error('This building cannot take workers');
    const requested = clamp(count, 0, maxWorkers);
    const totalAvailable = Math.max(0, safeNumber(world.population, 0) - 2);
    const otherWorkers = buildings.reduce((sum, building) => {
      if (building.id === buildingId) return sum;
      return sum + safeNumber(building.workers, 0);
    }, 0);
    if ((otherWorkers + requested) > totalAvailable) throw new Error('Not enough free workers');
    target.workers = requested;
    saveBuildings(db, buildings);
    return formatWorldBundle(db, world, buildings, { viewerId: req.user.id });
  });
  try {
    res.json(txn());
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not assign workers' });
  }
});

router.post('/expand', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetWorldTables(db);
  const direction = String(req.body?.direction || '').trim().toLowerCase();
  if (!['n', 's', 'e', 'w'].includes(direction)) return res.status(400).json({ error: 'Invalid direction' });
  const txn = db.transaction(() => {
    const simulation = runCatchup(db, req.user.id, new Date());
    if (!simulation) throw new Error('Create a world first');
    const world = simulation.world;
    const buildings = simulation.buildings;
    const expansionIndex = safeNumber(world.expansions, 0) + 1;
    const comboCostMap = { 1: 50, 2: 75, 3: 100, 4: 150, 5: 200, 6: 300 };
    const comboCost = comboCostMap[expansionIndex];
    if (!comboCost) throw new Error('Maximum planned expansions reached');
    const grid = parseGridData(world.grid_data);
    const { grid: expanded, shiftX, shiftY } = expandGrid(grid, world.biome, direction, expansionIndex);
    if (!spendCombos(db, req.user.id, comboCost)) throw new Error('Not enough combos');
    world.grid_data = serializeGridData(expanded);
    world.grid_width = expanded.w;
    world.grid_height = expanded.h;
    world.expansions = expansionIndex;
    if (shiftX || shiftY) {
      buildings.forEach((building) => {
        building.grid_x += shiftX;
        building.grid_y += shiftY;
      });
      saveBuildings(db, buildings);
    }
    saveWorld(db, world);
    return formatWorldBundle(db, world, buildings, { viewerId: req.user.id });
  });
  try {
    res.json(txn());
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not expand world' });
  }
});

router.post('/clear-tile', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetWorldTables(db);
  const x = safeNumber(req.body?.x, -1);
  const y = safeNumber(req.body?.y, -1);
  const txn = db.transaction(() => {
    const simulation = runCatchup(db, req.user.id, new Date());
    if (!simulation) throw new Error('Create a world first');
    const world = simulation.world;
    const grid = parseGridData(world.grid_data);
    const tile = grid.tiles[y]?.[x];
    if (!tile) throw new Error('Tile is out of bounds');
    if (tile.b != null) throw new Error('Remove the building first');
    const rule = OBSTACLE_CLEAR_RULES[tile.t];
    if (!rule) throw new Error('That tile cannot be cleared');
    if (!spendCombos(db, req.user.id, rule.combos)) throw new Error('Not enough combos');
    tile.t = getBiomeDef(world.biome).grounds[0];
    addResources(world, rule.yield);
    const derived = getDerivedState(attachBiomeSpecialty(world), simulation.buildings, Date.now());
    RESOURCE_KEYS.forEach((key) => {
      world[key] = Math.min(world[key], derived.caps[key]);
    });
    world.grid_data = serializeGridData(grid);
    saveWorld(db, world);
    return formatWorldBundle(db, world, simulation.buildings, { viewerId: req.user.id });
  });
  try {
    res.json(txn());
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not clear tile' });
  }
});

router.post('/trade/offer', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetWorldTables(db);
  const toUserId = String(req.body?.toUserId || '').trim();
  const offerResource = String(req.body?.offerResource || '').trim();
  const requestResource = String(req.body?.requestResource || '').trim();
  const offerAmount = Math.max(1, safeNumber(req.body?.offerAmount, 0));
  const requestAmount = Math.max(1, safeNumber(req.body?.requestAmount, 0));
  if (!RESOURCE_KEYS.includes(offerResource) || !RESOURCE_KEYS.includes(requestResource)) {
    return res.status(400).json({ error: 'Invalid trade resources' });
  }
  const txn = db.transaction(() => {
    const simulation = runCatchup(db, req.user.id, new Date());
    if (!simulation) throw new Error('Create a world first');
    if (!toUserId || toUserId === req.user.id) throw new Error('Choose another player');
    if (!hasBuiltBuilding(simulation.buildings, 'market')) throw new Error('Build a Market first');
    const targetWorld = loadWorld(db, toUserId);
    if (!targetWorld) throw new Error('Recipient has no world');
    if (safeNumber(simulation.world[offerResource], 0) < offerAmount) throw new Error('Not enough resources to offer');
    const result = db.prepare(`
      INSERT INTO pet_world_trades (
        from_user_id, to_user_id, offer_resource, offer_amount, request_resource, request_amount, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
    `).run(req.user.id, toUserId, offerResource, offerAmount, requestResource, requestAmount);
    const fromUser = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
    try {
      createUserNotification(db, toUserId, 'pet_world_trade',
        'New trade offer',
        `${fromUser?.username || 'Someone'} offered ${offerAmount} ${offerResource} for ${requestAmount} ${requestResource}`,
        `/pet/world/${req.user.id}`
      );
    } catch (_) { /* non-critical */ }
    return {
      trade: db.prepare('SELECT * FROM pet_world_trades WHERE id = ?').get(result.lastInsertRowid),
      trades: getWorldTradeSummary(db, req.user.id),
    };
  });
  try {
    res.json(txn());
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not create trade offer' });
  }
});

router.post('/trade/:id/accept', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetWorldTables(db);
  const tradeId = safeNumber(req.params.id, 0);
  const txn = db.transaction(() => {
    const trade = db.prepare('SELECT * FROM pet_world_trades WHERE id = ?').get(tradeId);
    if (!trade || trade.status !== 'pending') throw new Error('Trade is no longer available');
    if (trade.to_user_id !== req.user.id) throw new Error('This trade is not for you');
    const now = new Date();
    const recipientBundle = getTradeParticipantBundle(db, req.user.id, now);
    const senderBundle = getTradeParticipantBundle(db, trade.from_user_id, now);
    if (!recipientBundle || !senderBundle) throw new Error('Trade participant world missing');
    if (!hasBuiltBuilding(senderBundle.buildings, 'market') || !hasBuiltBuilding(recipientBundle.buildings, 'market')) {
      throw new Error('Both players need a Market to trade');
    }
    if (safeNumber(senderBundle.world[trade.offer_resource], 0) < safeNumber(trade.offer_amount, 0)) {
      throw new Error('Offerer no longer has enough resources');
    }
    if (safeNumber(recipientBundle.world[trade.request_resource], 0) < safeNumber(trade.request_amount, 0)) {
      throw new Error('You do not have enough resources');
    }

    senderBundle.world[trade.offer_resource] = roundResource(senderBundle.world[trade.offer_resource] - trade.offer_amount);
    recipientBundle.world[trade.offer_resource] = roundResource(recipientBundle.world[trade.offer_resource] + trade.offer_amount);
    recipientBundle.world[trade.request_resource] = roundResource(recipientBundle.world[trade.request_resource] - trade.request_amount);
    senderBundle.world[trade.request_resource] = roundResource(senderBundle.world[trade.request_resource] + trade.request_amount);
    const senderDerived = getDerivedState(attachBiomeSpecialty(senderBundle.world), senderBundle.buildings, now.getTime());
    const recipientDerived = getDerivedState(attachBiomeSpecialty(recipientBundle.world), recipientBundle.buildings, now.getTime());
    RESOURCE_KEYS.forEach((key) => {
      senderBundle.world[key] = Math.min(senderBundle.world[key], senderDerived.caps[key]);
      recipientBundle.world[key] = Math.min(recipientBundle.world[key], recipientDerived.caps[key]);
    });

    saveWorld(db, senderBundle.world);
    saveWorld(db, recipientBundle.world);
    db.prepare(`UPDATE pet_world_trades SET status = 'accepted' WHERE id = ?`).run(tradeId);
    const acceptUser = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
    try {
      createUserNotification(db, trade.from_user_id, 'pet_world_trade',
        'Trade accepted',
        `${acceptUser?.username || 'Someone'} accepted your trade: ${trade.offer_amount} ${trade.offer_resource} for ${trade.request_amount} ${trade.request_resource}`,
        `/pet/world`
      );
    } catch (_) { /* non-critical */ }
    return { trades: getWorldTradeSummary(db, req.user.id) };
  });
  try {
    res.json(txn());
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not accept trade' });
  }
});

router.post('/trade/:id/decline', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetWorldTables(db);
  const tradeId = safeNumber(req.params.id, 0);
  const trade = db.prepare('SELECT * FROM pet_world_trades WHERE id = ?').get(tradeId);
  if (!trade) return res.status(404).json({ error: 'Trade not found' });
  if (trade.to_user_id !== req.user.id && trade.from_user_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your trade' });
  }
  db.prepare(`UPDATE pet_world_trades SET status = 'declined' WHERE id = ?`).run(tradeId);
  res.json({ trades: getWorldTradeSummary(db, req.user.id) });
});

// ── Visitor Log ──────────────────────────────────────────────────────

router.get('/visitors', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetWorldTables(db);
  const limit = Math.min(50, safeNumber(req.query?.limit, 20));
  const rows = db.prepare(`
    SELECT v.visitor_user_id, v.created_at, u.username
    FROM pet_world_visits v
    LEFT JOIN users u ON u.id = v.visitor_user_id
    WHERE v.host_user_id = ?
    ORDER BY v.created_at DESC
    LIMIT ?
  `).all(req.user.id, limit);
  const totalCount = db.prepare(
    'SELECT COUNT(*) AS count FROM pet_world_visits WHERE host_user_id = ?'
  ).get(req.user.id)?.count || 0;
  const uniqueCount = db.prepare(
    'SELECT COUNT(DISTINCT visitor_user_id) AS count FROM pet_world_visits WHERE host_user_id = ?'
  ).get(req.user.id)?.count || 0;
  res.json({
    visitors: rows.map((row) => ({
      user_id: row.visitor_user_id,
      username: row.username || '',
      visited_at: row.created_at,
    })),
    total_visits: totalCount,
    unique_visitors: uniqueCount,
    online_now: getPresence(req.user.id),
  });
});

// ── Encounters (Wildlife / Hunting) ─────────────────────────────────

router.get('/encounters', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetWorldTables(db);
  // Expire old encounters
  db.prepare(
    "UPDATE pet_world_encounters SET status = 'expired' WHERE user_id = ? AND status = 'pending' AND expires_at < datetime('now')"
  ).run(req.user.id);
  const encounters = db.prepare(
    "SELECT * FROM pet_world_encounters WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC"
  ).all(req.user.id);
  const history = db.prepare(
    "SELECT * FROM pet_world_encounters WHERE user_id = ? AND status != 'pending' ORDER BY created_at DESC LIMIT 10"
  ).all(req.user.id);
  res.json({ encounters, history });
});

router.post('/encounters/:id/hunt', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetWorldTables(db);
  const encounterId = safeNumber(req.params.id, 0);
  const txn = db.transaction(() => {
    const encounter = db.prepare(
      "SELECT * FROM pet_world_encounters WHERE id = ? AND user_id = ? AND status = 'pending'"
    ).get(encounterId, req.user.id);
    if (!encounter) throw new Error('Encounter not found or already resolved');
    const simulation = runCatchup(db, req.user.id, new Date());
    if (!simulation) throw new Error('No world found');
    const hasWatchtower = simulation.buildings.some(
      (b) => b.building_type === 'watchtower' && b.state === 'built'
    );
    if (!hasWatchtower) throw new Error('You need a Watchtower to hunt');
    const watchtowerLevel = Math.max(
      ...simulation.buildings
        .filter((b) => b.building_type === 'watchtower' && b.state === 'built')
        .map((b) => safeNumber(b.level, 1))
    );
    // Success chance: 60% base + 15% per watchtower level, scaled by timing bonus (0.1..1.0)
    const rawTimingBonus = safeNumber(req.body?.timing_bonus, 1);
    const timingBonus = Math.max(0.1, Math.min(1, rawTimingBonus));
    const baseChance = Math.min(0.95, 0.6 + (watchtowerLevel - 1) * 0.15);
    const successChance = baseChance * timingBonus;
    const success = Math.random() < successChance;
    const encounterDef = ENCOUNTER_TYPES.find((e) => e.type === encounter.encounter_type) || ENCOUNTER_TYPES[0];
    const rewards = {};
    if (success) {
      for (const [resource, amount] of Object.entries(encounterDef.reward || {})) {
        const bonus = Math.round(amount * (1 + (watchtowerLevel - 1) * 0.25));
        rewards[resource] = bonus;
        simulation.world[resource] = roundResource(
          safeNumber(simulation.world[resource], 0) + bonus
        );
      }
    } else {
      // Partial reward on failure
      const primaryResource = Object.keys(encounterDef.reward || {})[0];
      if (primaryResource) {
        const partial = Math.max(1, Math.floor((encounterDef.reward[primaryResource] || 0) * 0.3));
        rewards[primaryResource] = partial;
        simulation.world[primaryResource] = roundResource(
          safeNumber(simulation.world[primaryResource], 0) + partial
        );
      }
    }
    saveWorld(db, simulation.world);
    db.prepare(
      "UPDATE pet_world_encounters SET status = ? WHERE id = ?"
    ).run(success ? 'hunted' : 'escaped', encounterId);
    return {
      success,
      rewards,
      encounter: db.prepare('SELECT * FROM pet_world_encounters WHERE id = ?').get(encounterId),
      bundle: formatWorldBundle(db, simulation.world, simulation.buildings, { viewerId: req.user.id }),
    };
  });
  try {
    res.json(txn());
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not resolve encounter' });
  }
});

router.post('/encounters/:id/dismiss', requireAuth, (req, res) => {
  const db = getDb();
  ensurePetWorldTables(db);
  const encounterId = safeNumber(req.params.id, 0);
  const encounter = db.prepare(
    "SELECT * FROM pet_world_encounters WHERE id = ? AND user_id = ? AND status = 'pending'"
  ).get(encounterId, req.user.id);
  if (!encounter) return res.status(404).json({ error: 'Encounter not found' });
  db.prepare("UPDATE pet_world_encounters SET status = 'dismissed' WHERE id = ?").run(encounterId);
  res.json({ ok: true });
});

// ── Seasonal Events ─────────────────────────────────────────────────

router.get('/events', requireAuth, (req, res) => {
  const now = new Date();
  const events = getActiveEvents(now).map((evt) => ({
    ...evt,
    daysLeft: getEventCountdown(evt, now),
  }));
  res.json({ events });
});

// ── Presence heartbeat ──────────────────────────────────────────────

router.post('/presence/:userId', requireAuth, (req, res) => {
  const hostId = req.params.userId;
  const visitor = { id: req.user.id, username: req.user.username || '' };
  registerPresence(hostId, visitor.id, visitor.username);
  res.json({ online: getPresence(hostId) });
});

module.exports = router;
