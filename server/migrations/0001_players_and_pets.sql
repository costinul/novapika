-- Players, their sign-ins and their pets.
-- Times are milliseconds since 1970. Ids are random UUIDs.

CREATE TABLE players (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  -- SHA-256 of the 6-digit sign-in code. The code itself is never stored.
  code_hash TEXT NOT NULL UNIQUE,
  -- The pet that follows the player, if any.
  follower_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  -- SHA-256 of the token a signed-in headset holds.
  token_hash TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_player ON sessions (player_id);

CREATE TABLE pets (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  -- The pet's DNA as JSON, in the shape of shared/dna.ts.
  dna TEXT NOT NULL,
  -- The two pets it was bred from; null for a pet the owner gave.
  parent_a TEXT,
  parent_b TEXT,
  -- 'egg', 'hatched' or 'freed'.
  stage TEXT NOT NULL,
  -- Seeds an egg has been fed.
  seeds INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  freed_at INTEGER
);
CREATE INDEX pets_owner ON pets (owner_id);
