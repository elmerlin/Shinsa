# Pump Shinsa

Pump Shinsa is a full-stack Pump It Up community platform for running tournaments and duels, sharing score progress, and organizing player communities.

It combines:
- competitive tools (round-robin tournaments, gauntlet finals, offline/online duels)
- social features (posts, follows, comments, reactions, activity feed)
- PIUGame sync (pumbility, best scores, recently played)
- notifications (in-app, SSE real-time stream, optional web push)
- PWA support (installable app + offline fallback)

## High-Level Feature Breakdown

### 1. Tournament Management
- Create/manage tournaments with metadata and custom round difficulty ranges.
- Generate full round-robin matches per round.
- Match flow: draw songs -> veto phase -> submit result.
- Optional gauntlet phase after round robin:
  - seeded from standings
  - escalating difficulty
  - winner advances to next match
- Standings with wins/losses/points and Buchholz tie-break.

### 2. Duel Systems
- **Offline duels**:
  - create duel cards manually
  - draw random songs by level/mode
  - submit scores and auto-resolve duel winner
- **Online duels**:
  - invitation-based player matching
  - turn-based draw/accept/decline flow
  - live room polling for state + chat
  - spectator/player “pump” reactions
  - end-duel handshake where both players must request end

### 3. Social Layer
- User registration/login/profile editing.
- Follow/unfollow users.
- Post feed with:
  - text + image uploads (compressed server-side)
  - optional YouTube links
  - threaded comments/replies
  - post/comment reaction (“pump”) toggles
- Score activity content:
  - upscore posts (improved scores)
  - new clear posts (first clears)
  - comments/replies/reactions per item type
- Public recent activity aggregation on dashboard.

### 4. Communities
- Create communities with custom slug, avatar/banner, badges.
- Open or invite-only membership model.
- Owner/moderator role controls.
- Join requests workflow for private communities.
- Member tags and tag assignment.
- Community-specific posts/comments/reactions.
- Mention suggestions and mention notifications.

### 5. PIUGame Integration
- Store encrypted PIUGame credentials.
- Sync endpoints:
  - pumbility scores
  - full best scores import (background task + progress)
  - recently played import
- Creates social activity entries from score improvements/new clears.

### 6. Notifications and Real-Time
- Notification records persisted in SQLite.
- SSE stream endpoint for near real-time notification delivery.
- Optional Web Push (VAPID-based) for browser push notifications.
- Invitation and interaction notifications integrated across features.

### 7. PWA/Offline
- Web app manifest + icons.
- Service worker caching strategy:
  - precache app shell assets
  - runtime cache for pages/assets
  - offline fallback page (`/offline.html`)

## Tech Stack

### Frontend
- React 18
- React Router 6
- Vite 6
- Tailwind CSS
- Recharts (analytics charts)

### Backend
- Node.js + Express
- better-sqlite3 (SQLite)
- JWT auth (`jsonwebtoken`)
- Password hashing (`bcryptjs`)
- File uploads (`multer`) + image processing (`sharp`)

### Integrations
- PIUGame scraping: `axios`, `cheerio`, `tough-cookie`
- Browser push: `web-push`
- Optional OCR parser pipeline: Python + OpenCV + RapidOCR

### Process/Deployment
- PM2 config included (`ecosystem.config.js`)

## Repository Structure

```text
.
├── client/                 # React + Vite frontend
│   ├── src/
│   └── public/
├── server/                 # Express API + DB schema/routes/libs
│   ├── db/
│   ├── routes/
│   ├── lib/
│   └── piu_score_parser.py
├── pump-phoenix.json       # Song/chart data source for bootstrap/seed
├── ecosystem.config.js     # PM2 process config
└── package.json            # Root scripts (server + client orchestration)
```

## Prerequisites

- Node.js `18+` (20 LTS recommended)
- npm `9+`
- Python `3.10+` (optional, only needed for OCR endpoint)
- pip (optional, for OCR dependencies)

## Local Development Setup

1. Install root dependencies:

```bash
npm install
```

2. Install frontend dependencies:

```bash
cd client
npm install
cd ..
```

3. (Optional) Install OCR Python dependencies (only if you will use `/api/parser/score`):

```bash
python3 -m pip install -r server/requirements.txt
```

4. Start full dev stack (API + Vite dev server):

```bash
npm run dev
```

5. Open:
- frontend: `http://localhost:5173`
- API: `http://localhost:3001`

In development, Vite proxies `/api` and `/uploads` to port `3001`.

## Environment Variables

This project does not currently load `.env` automatically with `dotenv`; set env vars in your shell, PM2 config, or process manager. The included `ecosystem.config.js` can also load a shell-style env file from `SHINSA_ENV_FILE`, `/etc/shinsa/shinsa.env`, `.env.production.local`, or `.env.local`.

| Variable | Default | Required in Prod | Purpose |
|---|---|---:|---|
| `PORT` | `3001` | No | Express server port |
| `DB_PATH` | `server/db/shinsa.db` | Yes (recommended) | SQLite file path |
| `NODE_ENV` | unset | Yes | Runtime mode |
| `JWT_SECRET` | hardcoded fallback | **Yes** | JWT signing secret |
| `PIU_ENCRYPT_KEY` | hardcoded fallback | **Yes** | Encrypt/decrypt PIUGame credentials |
| `APP_URL` | `http://localhost:5173` | **Yes** | Public app origin used for OAuth callback redirects |
| `YOUTUBE_CLIENT_ID` | empty | If YouTube sync used | Google OAuth client ID for YouTube linking |
| `YOUTUBE_CLIENT_SECRET` | empty | If YouTube sync used | Google OAuth client secret for YouTube linking |
| `YOUTUBE_REDIRECT_URI` | `${APP_URL}/api/youtube/oauth/callback` | If YouTube sync used | Must match the Google OAuth redirect URI exactly |
| `YOUTUBE_OAUTH_SCOPES` | `https://www.googleapis.com/auth/youtube.force-ssl` | No | Space/comma separated scopes to request from Google |
| `YOUTUBE_OAUTH_STATE_SECRET` | `JWT_SECRET` fallback | Yes (recommended) | Signs the temporary OAuth state payload |
| `YOUTUBE_ENCRYPT_KEY` | `PIU_ENCRYPT_KEY` fallback | Yes (recommended) | Encrypts stored YouTube access/refresh tokens |
| `SQUARE_ACCESS_TOKEN` | empty | If venue payments used | Square API access token |
| `SQUARE_LOCATION_ID` | empty | If venue payments used | Square location ID used for hosted checkout links |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | empty | If venue payments used | Verifies incoming Square webhooks |
| `SQUARE_ENVIRONMENT` | `sandbox` | If venue payments used | `sandbox` or `production` |
| `SQUARE_WEBHOOK_URL` | empty | If venue payments used | Full public webhook URL passed into Square signature verification |
| `VAPID_SUBJECT` | `mailto:support@pumpshinsa.com` | If push used | Web push VAPID subject |
| `VAPID_PUBLIC_KEY` | empty | If push used | Web push public key |
| `VAPID_PRIVATE_KEY` | empty | If push used | Web push private key |
| `APNS_KEY_ID` | empty | If iOS push used | Apple Push Notifications auth key ID |
| `APNS_TEAM_ID` | empty | If iOS push used | Apple developer team ID |
| `APNS_BUNDLE_ID` | `com.elmerlin.shinsa` | If iOS push used | iOS app bundle identifier |
| `APNS_PRIVATE_KEY` | empty | If iOS push used | `.p8` key contents; use `\n` for escaped newlines |
| `APNS_PRIVATE_KEY_PATH` | empty | If iOS push used | Alternative path to the `.p8` key |
| `APNS_PRODUCTION` | `false` | If iOS push used | Use Apple production APNs endpoint for tokens with no stored environment |

Generate VAPID keys (if enabling push):

```bash
npx web-push generate-vapid-keys
```

## Database and Song Data

- DB schema and migrations run automatically at server startup (`initializeDb`).
- If `songs` table is empty, charts are auto-bootstrapped from `pump-phoenix.json`.
- You can force a clean reseed with:

```bash
npm run seed
```

Note: `npm run seed` deletes and recreates the DB file.

## Available Scripts

### Root (`package.json`)
- `npm run dev` - run API + frontend together
- `npm run server` - run API only
- `npm run client` - run Vite dev server only
- `npm run build` - build frontend into `client/dist`
- `npm run start` - start API server (serves built frontend)
- `npm run seed` - reset DB and seed songs

### Frontend (`client/package.json`)
- `npm run dev`
- `npm run build`
- `npm run preview`

## Production Build and Deployment

## 1) Install dependencies

```bash
npm install
cd client && npm install && cd ..
```

## 2) Build frontend assets

```bash
NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

## 3) Prepare persistent DB path

Example:

```bash
sudo mkdir -p /var/data/shinsa
sudo chown -R "$USER" /var/data/shinsa
```

## 4) Export production env

```bash
export NODE_OPTIONS=--max-old-space-size=4096
export NODE_ENV=production
export PORT=3001
export DB_PATH=/var/data/shinsa/shinsa.db
export APP_URL='https://pumpshinsa.com'
export JWT_SECRET='replace-with-strong-secret'
export PIU_ENCRYPT_KEY='replace-with-strong-secret'
export YOUTUBE_CLIENT_ID='replace-with-google-client-id'
export YOUTUBE_CLIENT_SECRET='replace-with-google-client-secret'
# Optional overrides:
# export YOUTUBE_REDIRECT_URI='https://pumpshinsa.com/api/youtube/oauth/callback'
# export YOUTUBE_OAUTH_SCOPES='https://www.googleapis.com/auth/youtube.force-ssl'
# export YOUTUBE_OAUTH_STATE_SECRET='replace-with-strong-secret'
# export YOUTUBE_ENCRYPT_KEY='replace-with-strong-secret'
# Optional push:
# export VAPID_SUBJECT='mailto:you@example.com'
# export VAPID_PUBLIC_KEY='...'
# export VAPID_PRIVATE_KEY='...'
# export APNS_KEY_ID='...'
# export APNS_TEAM_ID='...'
# export APNS_PRIVATE_KEY_PATH='/var/secrets/AuthKey_XXXXXXXXXX.p8'
# export APNS_PRODUCTION='true'
```

For PM2 deployments, prefer storing these in an env file outside the repo so future pulls do not wipe production secrets. Example:

```bash
sudo mkdir -p /etc/shinsa
sudo tee /etc/shinsa/shinsa.env >/dev/null <<'EOF'
NODE_OPTIONS=--max-old-space-size=4096
NODE_ENV=production
PORT=3001
DB_PATH=/var/data/shinsa/shinsa.db
APP_URL=https://pumpshinsa.com
JWT_SECRET=replace-with-strong-secret
PIU_ENCRYPT_KEY=replace-with-strong-secret
YOUTUBE_CLIENT_ID=replace-with-google-client-id
YOUTUBE_CLIENT_SECRET=replace-with-google-client-secret
YOUTUBE_REDIRECT_URI=https://pumpshinsa.com/api/youtube/oauth/callback
YOUTUBE_OAUTH_STATE_SECRET=replace-with-strong-secret
YOUTUBE_ENCRYPT_KEY=replace-with-strong-secret
SQUARE_ACCESS_TOKEN=replace-with-square-access-token
SQUARE_LOCATION_ID=replace-with-square-location-id
SQUARE_WEBHOOK_SIGNATURE_KEY=replace-with-square-webhook-signature-key
SQUARE_ENVIRONMENT=production
SQUARE_WEBHOOK_URL=https://pumpshinsa.com/api/venue-access/webhook
EOF
sudo chmod 600 /etc/shinsa/shinsa.env
```

## 5) Start app

```bash
npm run start
```

The Express server serves both API and built frontend (`client/dist`).

### PM2 (included config)

`ecosystem.config.js` already defines an app named `shinsa` and automatically reads `/etc/shinsa/shinsa.env` when present.

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 status
```

## Deployment Notes

- Put the app behind a reverse proxy (Nginx/Caddy) for TLS.
- Example Nginx config with gzip+brotli: `deploy/nginx/shinsa.conf.example`.
- Web Push requires HTTPS in real browsers (except localhost).
- Google OAuth for YouTube linking also requires HTTPS in production, a verified domain, and a redirect URI that exactly matches `APP_URL` + `/api/youtube/oauth/callback` unless `YOUTUBE_REDIRECT_URI` is overridden.
- Ensure outbound network access for PIUGame scraping endpoints.
- Persist and back up your SQLite database file.

## API Module Overview

Main API groups:
- `/api/tournaments`, `/api/players`, `/api/matches`
- `/api/duels`, `/api/online-duels`
- `/api/auth`, `/api/social`, `/api/communities`
- `/api/piugame`
- `/api/notices`, `/api/songs`, `/api/dashboard`
- `/api/parser/score` (OCR score parsing endpoint)

## Troubleshooting

### Frontend shows 404 in production
Run `npm run build` first. Server expects `client/dist`.

### Parser endpoint fails
Install Python deps:

```bash
python3 -m pip install -r server/requirements.txt
```

### Push notifications not working
- Ensure VAPID keys are set.
- Ensure site is served over HTTPS.
- Ensure browser permission is granted.
- For native iOS push, ensure the app has the Push Notifications capability and APNS env vars are set on the server.

### DB permission/path errors
Set `DB_PATH` to a writable directory and ensure parent directory exists.

### Song draws fail or return empty pools
Confirm song data exists (`pump-phoenix.json`) and run `npm run seed` if needed.

## Security Checklist for Production

- Replace fallback `JWT_SECRET`.
- Replace fallback `PIU_ENCRYPT_KEY`.
- Store secrets in your process manager/secret store, not in source.
- Use HTTPS and secure reverse proxy settings.
- Back up SQLite regularly.

## License

No license file is currently included in this repository.
