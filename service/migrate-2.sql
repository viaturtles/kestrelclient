ALTER TABLE players ADD COLUMN mc_uuid TEXT;
ALTER TABLE players ADD COLUMN mc_name TEXT;
ALTER TABLE players ADD COLUMN presence TEXT;
ALTER TABLE players ADD COLUMN presence_at INTEGER;
CREATE INDEX IF NOT EXISTS players_mc ON players (mc_uuid);
