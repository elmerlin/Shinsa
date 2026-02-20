const express = require('express');
const OpenAI = require('openai');
const Database = require('better-sqlite3');
const { requireAuth } = require('./auth');
const { DB_PATH } = require('../db/schema');

const router = express.Router();

// Rate limiting: 30 requests/hour per user
const rateLimits = new Map();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(userId) {
  const now = Date.now();
  const entry = rateLimits.get(userId);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimits.set(userId, { windowStart: now, count: 1 });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// Database schema for the system prompt (excluding sensitive tables)
const DB_SCHEMA = `
-- Users of the platform
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  pumbility INT DEFAULT 0,          -- player skill rating (higher = better)
  skill_title TEXT DEFAULT '',       -- e.g. 'Intermediate', 'Advanced'
  skill_level INT DEFAULT 1,
  gender TEXT DEFAULT '',
  nationality TEXT DEFAULT '',
  location_country TEXT DEFAULT '',
  location_city TEXT DEFAULT '',
  created_at TEXT
);

-- Song catalog: each row is a specific chart (song + mode + level combination)
CREATE TABLE songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,               -- song name
  artist TEXT NOT NULL,
  jacket_url TEXT DEFAULT '',        -- album art
  mode TEXT NOT NULL,                -- 'Single', 'Double', or 'CoOp'
  level INT NOT NULL,                -- difficulty level (1-28 typically)
  bpm TEXT DEFAULT '',
  song_key TEXT DEFAULT '',
  flags TEXT DEFAULT ''              -- comma-separated flags like 'cut:2', 'remix'
);

-- Difficulty tier rankings for charts
CREATE TABLE chart_tiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tier_list_type TEXT NOT NULL DEFAULT 'Pass',  -- type of tier list (e.g. 'Pass')
  mode TEXT NOT NULL,
  level INT NOT NULL,
  tier_name TEXT NOT NULL,           -- e.g. 'Low', 'Mid', 'High', 'Overrated'
  tier_rank INT NOT NULL DEFAULT 0,  -- numeric rank (lower = easier within the level)
  chart_id INTEGER NOT NULL,         -- FK to songs.id
  FOREIGN KEY (chart_id) REFERENCES songs(id)
);

-- Technical skills tagged on charts
CREATE TABLE chart_skills (
  chart_id INTEGER NOT NULL,         -- FK to songs.id
  skill_slug TEXT NOT NULL,          -- e.g. 'jump', 'drill', 'run', 'twist', 'bracket'
  skill_name TEXT NOT NULL,
  PRIMARY KEY (chart_id, skill_slug),
  FOREIGN KEY (chart_id) REFERENCES songs(id)
);

-- User's best score per chart (song_title + mode + level)
CREATE TABLE user_best_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,             -- FK to users.id
  song_title TEXT NOT NULL,
  mode TEXT NOT NULL,                -- 'Single', 'Double', 'CoOp'
  level INTEGER NOT NULL,
  score INTEGER NOT NULL,            -- 0-1000000
  grade TEXT DEFAULT '',             -- e.g. 'SSS', 'SS', 'S', 'A', 'B', 'C', 'D', 'F'
  plate TEXT DEFAULT '',             -- e.g. 'RG' (rough game), 'FG' (fair game), 'EG' (extreme game), 'SG', 'MG', 'TG', 'PG' (perfect game), 'UG' (ultimate game)
  background_url TEXT DEFAULT '',
  UNIQUE(user_id, song_title, mode, level),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Top 50 scores contributing to pumbility rating
CREATE TABLE user_pumbility_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  song_title TEXT NOT NULL,
  mode TEXT NOT NULL,
  level INTEGER NOT NULL,
  score INTEGER NOT NULL,
  grade TEXT DEFAULT '',
  background_url TEXT DEFAULT '',
  date_played TEXT DEFAULT '',
  rank_order INTEGER DEFAULT 0,      -- 1 = highest contributing score
  UNIQUE(user_id, song_title, mode, level),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Play history with full judgment breakdown
CREATE TABLE user_recently_played (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  song_title TEXT NOT NULL,
  mode TEXT NOT NULL,
  level INTEGER NOT NULL,
  score INTEGER NOT NULL,
  grade TEXT DEFAULT '',
  plate TEXT DEFAULT '',
  machine_name TEXT DEFAULT '',
  background_url TEXT DEFAULT '',
  date_played TEXT DEFAULT '',
  perfect INTEGER,
  great INTEGER,
  good INTEGER,
  bad INTEGER,
  miss INTEGER,
  max_combo INTEGER DEFAULT 0,
  kcal REAL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Score improvements / personal records
CREATE TABLE user_upscores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  upscores_json TEXT NOT NULL DEFAULT '[]',  -- JSON array with old_score, new_score, old_grade, new_grade, song_title, mode, level, etc.
  created_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- First-time song clears
CREATE TABLE user_new_clears (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  song_title TEXT NOT NULL,
  mode TEXT NOT NULL,
  level INTEGER NOT NULL,
  score INTEGER NOT NULL,
  grade TEXT DEFAULT '',
  plate TEXT DEFAULT '',
  background_url TEXT DEFAULT '',
  clears_json TEXT DEFAULT '',       -- JSON array of grouped clears
  created_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Social follows
CREATE TABLE user_follows (
  follower_id TEXT NOT NULL,
  following_id TEXT NOT NULL,
  created_at TEXT,
  PRIMARY KEY (follower_id, following_id),
  FOREIGN KEY (follower_id) REFERENCES users(id),
  FOREIGN KEY (following_id) REFERENCES users(id)
);

-- User posts (social feed)
CREATE TABLE user_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  youtube_url TEXT DEFAULT '',
  created_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Communities
CREATE TABLE communities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT DEFAULT '',
  owner_id TEXT NOT NULL,
  created_at TEXT
);

CREATE TABLE community_members (
  community_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  joined_at TEXT,
  PRIMARY KEY (community_id, user_id)
);

-- World Max arcade machines
CREATE TABLE world_max_machines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country TEXT NOT NULL DEFAULT '',
  country_code TEXT DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  venue_name TEXT DEFAULT '',
  address TEXT DEFAULT '',
  game_name TEXT NOT NULL DEFAULT '',
  machine_name TEXT NOT NULL DEFAULT '',
  latitude REAL,
  longitude REAL,
  created_at TEXT
);
`.trim();

const SYSTEM_PROMPT_TEMPLATE = `You are Shinsa Bot, a helpful assistant for Pump It Up players on the Shinsa platform.
You have access to the Shinsa database to answer questions about songs, scores, players, and statistics.

## Database Schema
${DB_SCHEMA}

## Domain Knowledge (Pump It Up)
- **Modes**: Single (one player, 5 panels), Double (one player, 10 panels), CoOp (multiple players)
- **Levels**: Difficulty ratings, typically 1-28. Higher = harder.
- **Grades** (best to worst): SSS, SS, S, A+, A, B+, B, C+, C, D+, D, F
- **Plates** (best to worst): UG (Ultimate Game), PG (Perfect Game), TG (Total Game), MG (Marvelous Game), SG (Super Game), EG (Extreme Game), FG (Fair Game), RG (Rough Game)
- **Score**: 0 to 1,000,000. Higher = better.
- **Pumbility**: A skill rating derived from the player's top 50 scores. Higher = better.
- **Judgments**: Perfect > Great > Good > Bad > Miss
- A "pass" or "clear" means the player completed the song (grade is not F, or score > 0 in best_scores)
- **Tier lists**: Charts are ranked within their level by difficulty. Lower tier_rank = easier within the same level.

## Current User
The user talking to you is: **{{USERNAME}}** (user ID: {{USER_ID}})
When they say "me", "my", "I", etc., they mean this user.

## Important Rules
1. ONLY generate SELECT queries. Never attempt to modify data.
2. Always use LIMIT (default 50, max 100) to avoid returning too much data.
3. When comparing scores between users, use the user_best_scores table.
4. When looking up a user by name, use a case-insensitive LIKE match on the username field.
5. To find if a user "passed" or "cleared" a chart, check user_best_scores where score > 0 and grade != 'F'.
6. To get song info for a chart in user_best_scores, JOIN with songs ON songs.title = user_best_scores.song_title AND songs.mode = user_best_scores.mode AND songs.level = user_best_scores.level.
7. Format results in a readable way using markdown tables when appropriate.
8. If a query returns no results, say so clearly.
9. If you're unsure about a query, explain your reasoning.
10. Be concise but informative in your responses.`;

function buildSystemPrompt(user) {
  return SYSTEM_PROMPT_TEMPLATE
    .replace('{{USERNAME}}', user.username || 'Unknown')
    .replace('{{USER_ID}}', user.id || '');
}

// Validate that a SQL query is a safe SELECT statement
function validateQuery(sql) {
  const trimmed = sql.trim();
  if (!/^SELECT\b/i.test(trimmed)) {
    return { valid: false, error: 'Only SELECT queries are allowed.' };
  }
  const blocked = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX)\b/i;
  if (blocked.test(trimmed)) {
    return { valid: false, error: 'Query contains disallowed keywords.' };
  }
  return { valid: true };
}

// Execute a read-only SQL query
function executeQuery(sql) {
  const readonlyDb = new Database(DB_PATH, { readonly: true });
  try {
    readonlyDb.pragma('busy_timeout = 5000');
    const rows = readonlyDb.prepare(sql).all();
    const limited = rows.slice(0, 100);
    return { rows: limited, rowCount: rows.length, truncated: rows.length > 100 };
  } finally {
    readonlyDb.close();
  }
}

const TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'execute_sql_query',
    description: 'Execute a read-only SQL SELECT query against the Shinsa database. Returns rows as JSON. Use this to answer questions about songs, scores, users, and statistics.',
    parameters: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'The SQL SELECT query to execute.',
        },
        explanation: {
          type: 'string',
          description: 'A brief explanation of what this query does and why you chose it.',
        },
      },
      required: ['sql'],
    },
  },
};

// POST /api/chatbot/ask — streaming SSE response
router.post('/ask', requireAuth, async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Chatbot is not configured. OPENAI_API_KEY is missing.' });
  }

  if (!checkRateLimit(req.user.id)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });
  }

  const { message, history } = req.body;
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  // Build conversation messages from history
  const messages = [
    { role: 'system', content: buildSystemPrompt(req.user) },
  ];
  if (Array.isArray(history)) {
    for (const h of history.slice(-20)) {
      if (h.role === 'user' || h.role === 'assistant') {
        messages.push({ role: h.role, content: h.content });
      }
    }
  }
  messages.push({ role: 'user', content: message.trim() });

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const client = new OpenAI({ apiKey });

  try {
    let currentMessages = [...messages];
    const maxToolRounds = 3;

    for (let round = 0; round < maxToolRounds; round++) {
      // Non-streaming call to check for tool use
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 2048,
        messages: currentMessages,
        tools: [TOOL_DEFINITION],
      });

      const choice = response.choices[0];
      const toolCalls = choice.message.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        // No tool use — re-call with streaming for the final response
        const stream = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          max_tokens: 2048,
          messages: currentMessages,
          tools: [TOOL_DEFINITION],
          stream: true,
        });

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          if (delta?.content) {
            res.write(`data: ${JSON.stringify({ type: 'text', content: delta.content })}\n\n`);
          }
        }

        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
        return;
      }

      // Process tool calls
      currentMessages.push(choice.message);

      for (const toolCall of toolCalls) {
        if (toolCall.function.name !== 'execute_sql_query') {
          currentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: 'Unknown tool.' }),
          });
          continue;
        }

        let args;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          currentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: 'Invalid tool arguments.' }),
          });
          continue;
        }

        const { sql, explanation } = args;

        // Send status to the client
        if (explanation) {
          res.write(`data: ${JSON.stringify({ type: 'status', content: explanation })}\n\n`);
        }
        res.write(`data: ${JSON.stringify({ type: 'query', content: sql })}\n\n`);

        // Validate and execute
        const validation = validateQuery(sql);
        let toolResult;
        if (!validation.valid) {
          toolResult = { error: validation.error };
        } else {
          try {
            toolResult = executeQuery(sql);
          } catch (err) {
            toolResult = { error: `Query failed: ${err.message}` };
          }
        }

        currentMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }

      // Send any text content from the assistant message
      if (choice.message.content) {
        res.write(`data: ${JSON.stringify({ type: 'text', content: choice.message.content })}\n\n`);
      }
    }

    // Final round — stream the response after tool use
    const finalStream = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 2048,
      messages: currentMessages,
      tools: [TOOL_DEFINITION],
      stream: true,
    });

    for await (const chunk of finalStream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        res.write(`data: ${JSON.stringify({ type: 'text', content: delta.content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Chatbot error:', err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', content: err.message || 'Something went wrong.' })}\n\n`);
    res.end();
  }
});

module.exports = router;
