import type { Dna } from '../shared/dna';
import type { PetRow, PetStage, PlayerRow, Store } from './store';

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

export function d1Store(db: D1Database): Store {
  const onePlayer = async (where: string, value: string): Promise<PlayerRow | null> => {
    const record = await db.prepare(`SELECT * FROM players WHERE ${where} = ?`).bind(value).first<PlayerRecord>();
    return record ? toPlayer(record) : null;
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
    async removePet(id) {
      await db.prepare('DELETE FROM pets WHERE id = ?').bind(id).run();
    },
  };
}
