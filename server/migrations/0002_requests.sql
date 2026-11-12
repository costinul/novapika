-- One player asking another for the DNA of one of their pets.
-- A row lasts until the request is answered or dropped.

CREATE TABLE requests (
  id TEXT PRIMARY KEY,
  -- Who asks, and the pet of theirs that would be the other parent.
  asker_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  asker_pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  -- Who is asked, and for which of their pets.
  owner_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  asked_pet_id TEXT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE INDEX requests_asker ON requests (asker_id);
CREATE INDEX requests_owner ON requests (owner_id);
