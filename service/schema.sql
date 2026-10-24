-- Kestrel service database (Cloudflare D1). Apply with:
--   npx wrangler d1 execute kestrel --remote --file=schema.sql

-- Everyone who has linked Discord and opened Kestrel.
CREATE TABLE IF NOT EXISTS players (
  discord_id   TEXT PRIMARY KEY,
  username     TEXT NOT NULL,
  global_name  TEXT,
  avatar       TEXT,
  first_seen   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL,
  version      TEXT
);

-- Staff (the owner comes from the OWNER_DISCORD_ID setting, not this table).
CREATE TABLE IF NOT EXISTS staff (
  discord_id TEXT PRIMARY KEY,
  role       TEXT NOT NULL CHECK (role IN ('mod', 'admin')),
  added_by   TEXT NOT NULL,
  added_at   INTEGER NOT NULL
);

-- Bans from Kestrel. until NULL = permanent. A ban stays in history after it's lifted.
CREATE TABLE IF NOT EXISTS bans (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT NOT NULL,
  reason     TEXT NOT NULL,
  until      INTEGER,
  by         TEXT NOT NULL,
  at         INTEGER NOT NULL,
  lifted_by  TEXT,
  lifted_at  INTEGER
);
CREATE INDEX IF NOT EXISTS bans_player ON bans (discord_id);

-- Kestrel Plus. until NULL = forever.
CREATE TABLE IF NOT EXISTS plus (
  discord_id TEXT PRIMARY KEY,
  until      INTEGER,
  by         TEXT NOT NULL,
  at         INTEGER NOT NULL
);

-- Cosmetics given by staff (Alpine Dusk is free for every linked player and isn't stored).
CREATE TABLE IF NOT EXISTS cosmetics (
  discord_id TEXT NOT NULL,
  cosmetic   TEXT NOT NULL,
  by         TEXT NOT NULL,
  at         INTEGER NOT NULL,
  PRIMARY KEY (discord_id, cosmetic)
);

-- The cape each player wears.
CREATE TABLE IF NOT EXISTS equipped (
  discord_id TEXT PRIMARY KEY,
  cape       TEXT NOT NULL,
  at         INTEGER NOT NULL
);

-- Friends (one row per pair, a < b) and pending requests.
CREATE TABLE IF NOT EXISTS friends (
  a     TEXT NOT NULL,
  b     TEXT NOT NULL,
  since INTEGER NOT NULL,
  PRIMARY KEY (a, b)
);
CREATE TABLE IF NOT EXISTS friend_requests (
  from_id TEXT NOT NULL,
  to_id   TEXT NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id)
);

-- Minecraft account linking: a one-time server id for Mojang's join / hasJoined check.
CREATE TABLE IF NOT EXISTS mc_link (
  discord_id TEXT PRIMARY KEY,
  server_id  TEXT NOT NULL,
  expires    INTEGER NOT NULL
);

-- Every staff action. Never edited or deleted by the service.
CREATE TABLE IF NOT EXISTS log (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  at     INTEGER NOT NULL,
  actor  TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT
);

-- Short cache of checked Discord sign-ins (SHA-256 of the token, never the token itself).
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  expires    INTEGER NOT NULL
);
