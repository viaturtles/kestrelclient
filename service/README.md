# Kestrel service

Kestrel's online service: staff tools, Kestrel bans, Kestrel Plus and cosmetics given by staff.
It runs on Cloudflare Workers (free plan) with a D1 database.

Players are identified by their linked Discord account: the launcher sends the Discord access token,
the service asks Discord who it belongs to, and only stores a hash of it for 10 minutes.
Staff rights are checked here on every request; the launcher only decides what to show.

## Set up (once)

```bash
cd service
npm install
npx wrangler login
npx wrangler d1 create kestrel
```

1. Copy the `database_id` it prints into `wrangler.toml`.
2. Put your Discord user ID in `OWNER_DISCORD_ID` in `wrangler.toml` (Discord → Settings → Advanced → Developer Mode on, then right-click yourself → Copy User ID).
3. Create the tables and deploy:

```bash
npx wrangler d1 execute kestrel --remote --file=schema.sql
npx wrangler deploy
```

4. Copy the `https://kestrel-service.<name>.workers.dev` address it prints into `SERVICE_URL` in
   `Kestrel Client - Minecraft/src-tauri/src/config.rs`, then rebuild the launcher.

## Capes

- Cape textures live in `public/capes/` and are served at `https://<service>/capes/<id>.png` (with CORS, see `public/_headers`).
- Make one from artwork (any portrait image): `powershell -File tools\make-cape.ps1 -In art\name.png -Out public\capes\name.png`
  (16× vanilla, 1024×512). Animated: pass several `-In` frames, then set `frames` and `fps` for it in `CAPES` in `src/index.ts`.
- Add it to `CAPES` in `src/index.ts`, then `npx wrangler deploy`. Staff give capes from the launcher's Staff tab;
  players wear them from Cosmetics, and Kestrel Core draws the worn cape in game.

## Roles

| Role | Can |
|---|---|
| Owner (`OWNER_DISCORD_ID`) | Everything, add admins |
| Admin | Players, bans, Plus, cosmetics, add/remove moderators |
| Moderator | View players, ban/unban non-staff |

Every staff action is written to the log (Staff → Log).

## API (all need `Authorization: Bearer <Discord access token>`)

- `GET /v1/me` → role, active ban, Plus, cosmetics
- `GET /v1/staff/players?q=` · `GET /v1/staff/players/:id`
- `POST|DELETE /v1/staff/players/:id/ban` (`{ reason, days|null }`)
- `POST|DELETE /v1/staff/players/:id/plus` (`{ days|null }`)
- `POST|DELETE /v1/staff/players/:id/cosmetics/:cosmetic`
- `GET|POST /v1/staff/members` · `DELETE /v1/staff/members/:id`
- `GET /v1/staff/log` · `GET /v1/staff/catalog`
