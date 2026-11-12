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

/** One player asking another for the DNA of one of their pets. It lasts until it is answered or dropped. */
export interface RequestRow {
  id: string;
  /** Who asks, and the pet of theirs that would be the other parent. */
  askerId: string;
  askerPetId: string;
  /** Who is asked, and for which of their pets. */
  ownerId: string;
  askedPetId: string;
  createdAt: number;
}

export interface Store {
  addPlayer(player: PlayerRow): Promise<void>;
  players(): Promise<PlayerRow[]>;
  player(id: string): Promise<PlayerRow | null>;
  playerByCodeHash(codeHash: string): Promise<PlayerRow | null>;
  /** Give a player a new code, and sign out every headset that used the old one. */
  replaceCode(playerId: string, codeHash: string): Promise<void>;
  setFollower(playerId: string, petId: string | null): Promise<void>;
  /** Remove a player for good, with their sign-ins, their pets and eggs, and every request to or from them. */
  removePlayer(playerId: string): Promise<void>;

  addSession(tokenHash: string, playerId: string, createdAt: number): Promise<void>;
  playerBySession(tokenHash: string): Promise<PlayerRow | null>;

  addPet(pet: PetRow): Promise<void>;
  pet(id: string): Promise<PetRow | null>;
  petsOf(ownerId: string): Promise<PetRow[]>;
  allPets(): Promise<PetRow[]>;
  /** Change an egg into a hatched pet, a pet into a freed one, and so on. */
  updatePet(id: string, changes: Partial<Pick<PetRow, 'stage' | 'seeds' | 'freedAt'>>): Promise<void>;
  removePet(id: string): Promise<void>;
  /** Remove for good the pets that were set free before this time. */
  removeFreedBefore(time: number): Promise<void>;

  addRequest(request: RequestRow): Promise<void>;
  request(id: string): Promise<RequestRow | null>;
  /** Requests a player has made, and requests made of them, oldest first. */
  requestsBy(askerId: string): Promise<RequestRow[]>;
  requestsOf(ownerId: string): Promise<RequestRow[]>;
  removeRequest(id: string): Promise<void>;
  /** Drop every request that names this pet, on either side. */
  removeRequestsNaming(petId: string): Promise<void>;
}
