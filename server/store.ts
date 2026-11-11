import type { Dna } from '../shared/dna';

// What the server keeps, and the few things it does with it. The rules in
// rules.ts use only this, so they can be tested without a database.

export interface PlayerRow {
  id: string;
  nickname: string;
  /** SHA-256 of the sign-in code. The code itself is never kept. */
  codeHash: string;
  /** The pet that follows the player, if any. */
  followerId: string | null;
  createdAt: number;
}

export type PetStage = 'egg' | 'hatched' | 'freed';

export interface PetRow {
  id: string;
  ownerId: string;
  dna: Dna;
  /** The two pets it was bred from; null for a pet the owner gave. */
  parentA: string | null;
  parentB: string | null;
  stage: PetStage;
  /** Seeds an egg has been fed. */
  seeds: number;
  createdAt: number;
  freedAt: number | null;
}

export interface Store {
  addPlayer(player: PlayerRow): Promise<void>;
  players(): Promise<PlayerRow[]>;
  player(id: string): Promise<PlayerRow | null>;
  playerByCodeHash(codeHash: string): Promise<PlayerRow | null>;
  /** Give a player a new code, and sign out every headset that used the old one. */
  replaceCode(playerId: string, codeHash: string): Promise<void>;
  setFollower(playerId: string, petId: string | null): Promise<void>;

  addSession(tokenHash: string, playerId: string, createdAt: number): Promise<void>;
  playerBySession(tokenHash: string): Promise<PlayerRow | null>;

  addPet(pet: PetRow): Promise<void>;
  pet(id: string): Promise<PetRow | null>;
  petsOf(ownerId: string): Promise<PetRow[]>;
  allPets(): Promise<PetRow[]>;
  removePet(id: string): Promise<void>;
}
