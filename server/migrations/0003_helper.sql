-- The helper parrot: what was said to it and what it answered, as text, for
-- the owner to read. A row is removed after 7 days. No sound is ever kept.

CREATE TABLE helper_talk (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  lobby_id TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  -- The player's nickname when it was said.
  nickname TEXT NOT NULL,
  heard TEXT NOT NULL,
  said TEXT NOT NULL,
  -- Why the owner should look at this one; null for ordinary talk.
  flagged TEXT
);
CREATE INDEX helper_talk_at ON helper_talk (at);

-- The owner's switches, by name. A switch that was never touched has no row.
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
