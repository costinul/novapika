import type { Dna } from '../shared/dna';
import type { PetRow, PetStage, PlayerRow, RequestRow, Store, TalkRow } from './store';

// The Store, kept in a Cloudflare D1 database. The tables are made by the
// files in server/migrations.

interface PlayerRecord {
  id: string;
  nickname: string;
  code_hash: string;
  follower_id: string | null;
  created_at: number;
}

interface PetRecord {
  id: string;
  owner_id: string;
  dna: string;
  parent_a: string | null;
  parent_b: string | null;
  stage: string;
  seeds: number;
  created_at: number;
  freed_at: number | null;
}

const toPlayer = (r: PlayerRecord): PlayerRow => ({
  id: r.id,
  nickname: r.nickname,
  codeHash: r.code_hash,
  followerId: r.follower_id,
  createdAt: r.created_at,
});

const toPet = (r: PetRecord): PetRow => ({
  id: r.id,
  ownerId: r.owner_id,
  dna: JSON.parse(r.dna) as Dna,
  parentA: r.parent_a,
  parentB: r.parent_b,
  stage: r.stage as PetStage,
  seeds: r.seeds,
  createdAt: r.created_at,
  freedAt: r.freed_at,
});

interface RequestRecord {
  id: string;
  asker_id: string;
  asker_pet_id: string;
  owner_id: string;
  asked_pet_id: string;
  created_at: number;
}

const toRequest = (r: RequestRecord): RequestRow => ({
  id: r.id,
  askerId: r.asker_id,
  askerPetId: r.asker_pet_id,
  ownerId: r.owner_id,
  askedPetId: r.asked_pet_id,
  createdAt: r.created_at,
});

interface TalkRecord {
  id: string;
  at: number;
  lobby_id: string;
  player_id: string;
  nickname: string;
  heard: string;
  said: string;
  flagged: string | null;
}

const toTalk = (r: TalkRecord): TalkRow => ({
  id: r.id,
  at: r.at,
  lobbyId: r.lobby_id,
  playerId: r.player_id,
  nickname: r.nickname,
  heard: r.heard,
  said: r.said,
  flagged: r.flagged,
});

export function d1Store(db: D1Database): Store {
  const onePlayer = async (where: string, value: string): Promise<PlayerRow | null> => {
    const record = await db.prepare(`SELECT * FROM players WHERE ${where} = ?`).bind(value).first<PlayerRecord>();
    return record ? toPlayer(record) : null;
  };
  const requests = async (where: 'asker_id' | 'owner_id', value: string): Promise<RequestRow[]> => {
    const { results } = await db
      .prepare(`SELECT * FROM requests WHERE ${where} = ? ORDER BY created_at`)
      .bind(value)
      .all<RequestRecord>();
    return results.map(toRequest);
  };

  return {
    async addPlayer(p) {
      await db
        .prepare('INSERT INTO players (id, nickname, code_hash, follower_id, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(p.id, p.nickname, p.codeHash, p.followerId, p.createdAt)
        .run();
    },
    async players() {
      const { results } = await db.prepare('SELECT * FROM players ORDER BY created_at').all<PlayerRecord>();
      return results.map(toPlayer);
    },
    player: (id) => onePlayer('id', id),
    playerByCodeHash: (codeHash) => onePlayer('code_hash', codeHash),
    async replaceCode(playerId, codeHash) {
      await db.batch([
        db.prepare('UPDATE players SET code_hash = ? WHERE id = ?').bind(codeHash, playerId),
        db.prepare('DELETE FROM sessions WHERE player_id = ?').bind(playerId),
      ]);
    },
    async setFollower(playerId, petId) {
      await db.prepare('UPDATE players SET follower_id = ? WHERE id = ?').bind(petId, playerId).run();
    },
    async removePlayer(playerId) {
      // All together or not at all. A request that names one of their pets is
      // always to or from them, so the first line takes those too.
      await db.batch([
        db.prepare('DELETE FROM requests WHERE asker_id = ? OR owner_id = ?').bind(playerId, playerId),
        db.prepare('DELETE FROM sessions WHERE player_id = ?').bind(playerId),
        db.prepare('DELETE FROM helper_talk WHERE player_id = ?').bind(playerId),
        db.prepare('DELETE FROM pets WHERE owner_id = ?').bind(playerId),
        db.prepare('DELETE FROM players WHERE id = ?').bind(playerId),
      ]);
    },

    async addSession(tokenHash, playerId, createdAt) {
      await db
        .prepare('INSERT INTO sessions (token_hash, player_id, created_at) VALUES (?, ?, ?)')
        .bind(tokenHash, playerId, createdAt)
        .run();
    },
    async playerBySession(tokenHash) {
      const record = await db
        .prepare('SELECT players.* FROM players JOIN sessions ON sessions.player_id = players.id WHERE token_hash = ?')
        .bind(tokenHash)
        .first<PlayerRecord>();
      return record ? toPlayer(record) : null;
    },

    async addPet(p) {
      await db
        .prepare(
          'INSERT INTO pets (id, owner_id, dna, parent_a, parent_b, stage, seeds, created_at, freed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(p.id, p.ownerId, JSON.stringify(p.dna), p.parentA, p.parentB, p.stage, p.seeds, p.createdAt, p.freedAt)
        .run();
    },
    async pet(id) {
      const record = await db.prepare('SELECT * FROM pets WHERE id = ?').bind(id).first<PetRecord>();
      return record ? toPet(record) : null;
    },
    async petsOf(ownerId) {
      const { results } = await db
        .prepare('SELECT * FROM pets WHERE owner_id = ? ORDER BY created_at')
        .bind(ownerId)
        .all<PetRecord>();
      return results.map(toPet);
    },
    async allPets() {
      const { results } = await db.prepare('SELECT * FROM pets ORDER BY created_at').all<PetRecord>();
      return results.map(toPet);
    },
    async updatePet(id, changes) {
      // Only these three columns ever change; each is set only if it was given.
      const sets: string[] = [];
      const values: (string | number | null)[] = [];
      if (changes.stage !== undefined) sets.push('stage = ?'), values.push(changes.stage);
      if (changes.seeds !== undefined) sets.push('seeds = ?'), values.push(changes.seeds);
      if (changes.freedAt !== undefined) sets.push('freed_at = ?'), values.push(changes.freedAt);
      if (sets.length === 0) return;
      await db
        .prepare(`UPDATE pets SET ${sets.join(', ')} WHERE id = ?`)
        .bind(...values, id)
        .run();
    },
    async removePet(id) {
      await db.prepare('DELETE FROM pets WHERE id = ?').bind(id).run();
    },
    async removeFreedBefore(time) {
      await db.prepare("DELETE FROM pets WHERE stage = 'freed' AND freed_at < ?").bind(time).run();
    },

    async addRequest(r) {
      await db
        .prepare(
          'INSERT INTO requests (id, asker_id, asker_pet_id, owner_id, asked_pet_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(r.id, r.askerId, r.askerPetId, r.ownerId, r.askedPetId, r.createdAt)
        .run();
    },
    async request(id) {
      const record = await db.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first<RequestRecord>();
      return record ? toRequest(record) : null;
    },
    requestsBy: (askerId) => requests('asker_id', askerId),
    requestsOf: (ownerId) => requests('owner_id', ownerId),
    async removeRequest(id) {
      await db.prepare('DELETE FROM requests WHERE id = ?').bind(id).run();
    },
    async removeRequestsNaming(petId) {
      await db.prepare('DELETE FROM requests WHERE asker_pet_id = ? OR asked_pet_id = ?').bind(petId, petId).run();
    },

    async addTalk(t) {
      await db
        .prepare(
          'INSERT INTO helper_talk (id, at, lobby_id, player_id, nickname, heard, said, flagged) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(t.id, t.at, t.lobbyId, t.playerId, t.nickname, t.heard, t.said, t.flagged)
        .run();
    },
    async talk(limit) {
      const { results } = await db.prepare('SELECT * FROM helper_talk ORDER BY at DESC LIMIT ?').bind(limit).all<TalkRecord>();
      return results.map(toTalk);
    },
    async removeTalkBefore(time) {
      await db.prepare('DELETE FROM helper_talk WHERE at < ?').bind(time).run();
    },

    async setting(key) {
      return (await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>())?.value ?? null;
    },
    async setSetting(key, value) {
      await db
        .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
        .bind(key, value)
        .run();
    },
  };
}
