import { PET_CAP } from '../shared/api';
import type { PetView, PlayerView } from '../shared/api';
import { breed, breedingOdds } from '../shared/breeding';
import { tierOf } from '../shared/dna';
import type { Dna } from '../shared/dna';
import { founders } from '../shared/founders';
import type { PetRow, PlayerRow, Store } from './store';

// The server's rules: who may do what, and what happens. Plain functions over
// a Store, with everything random or timed passed in, so they can be tested
// without a database or a network.

const CODE_DIGITS = 6;
const NICKNAME_MAX = 20;

export type RefusalReason =
  | 'bad-code'
  | 'bad-nickname'
  | 'no-such-player'
  | 'no-such-pet'
  | 'no-such-founder'
  | 'full';

/** A request the rules turn down. The reason is sent back to the caller. */
export class Refusal extends Error {
  constructor(
    readonly reason: RefusalReason,
    readonly status = 400,
  ) {
    super(reason);
  }
}

/** What the rules need from outside. Tests pass fixed values. */
export interface Deps {
  now(): number;
  /** A number from 0 up to 1, from a source nobody can predict. */
  random(): number;
  id(): string;
  /** A long random secret for a signed-in headset to hold. */
  token(): string;
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A sign-in code that no other player has. */
async function freshCode(store: Store, deps: Deps): Promise<{ code: string; codeHash: string }> {
  for (;;) {
    let code = '';
    for (let i = 0; i < CODE_DIGITS; i++) code += Math.floor(deps.random() * 10);
    const codeHash = await sha256(code);
    if (!(await store.playerByCodeHash(codeHash))) return { code, codeHash };
  }
}

function newPet(deps: Deps, ownerId: string, dna: Dna): PetRow {
  return {
    id: deps.id(),
    ownerId,
    dna,
    parentA: null,
    parentB: null,
    stage: 'hatched',
    seeds: 0,
    createdAt: deps.now(),
    freedAt: null,
  };
}

/** A new player's first pet: a common one, mixed from two of the common fixed pets. */
function starterDna(deps: Deps): Dna {
  const commons = Object.values(founders).filter((founder) => tierOf(founder.dna) === 'common');
  const pick = (): Dna => commons[Math.floor(deps.random() * commons.length)].dna;
  return breed(pick(), pick(), deps.random, { ...breedingOdds, specialFromNeither: 0 });
}

const kept = (pets: PetRow[]): PetRow[] => pets.filter((pet) => pet.stage !== 'freed');
const petView = (pet: PetRow): PetView => ({ id: pet.id, dna: pet.dna, stage: pet.stage === 'egg' ? 'egg' : 'hatched' });

/** The owner adds a player. The code is given back once and never again. */
export async function createPlayer(
  store: Store,
  deps: Deps,
  nickname: unknown,
): Promise<{ player: PlayerRow; code: string }> {
  const name = typeof nickname === 'string' ? nickname.trim() : '';
  if (name.length < 1 || name.length > NICKNAME_MAX) throw new Refusal('bad-nickname');

  const { code, codeHash } = await freshCode(store, deps);
  const pet = newPet(deps, deps.id(), starterDna(deps));
  // The first pet follows its new owner from the start.
  const player: PlayerRow = { id: pet.ownerId, nickname: name, codeHash, followerId: pet.id, createdAt: deps.now() };
  await store.addPlayer(player);
  await store.addPet(pet);
  return { player, code };
}

/** A new code for a player. Every headset signed in with the old one is signed out. */
export async function resetCode(store: Store, deps: Deps, playerId: string): Promise<{ code: string }> {
  if (!(await store.player(playerId))) throw new Refusal('no-such-player', 404);
  const { code, codeHash } = await freshCode(store, deps);
  await store.replaceCode(playerId, codeHash);
  return { code };
}

/** Swap a sign-in code for a token the headset keeps. */
export async function login(store: Store, deps: Deps, code: unknown): Promise<{ token: string; player: PlayerRow }> {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new Refusal('bad-code', 401);
  const player = await store.playerByCodeHash(await sha256(code));
  if (!player) throw new Refusal('bad-code', 401);
  const token = deps.token();
  await store.addSession(await sha256(token), player.id, deps.now());
  return { token, player };
}

/** The player a token belongs to, or null if it is not a current one. */
export async function playerForToken(store: Store, token: string | null): Promise<PlayerRow | null> {
  return token ? store.playerBySession(await sha256(token)) : null;
}

export async function playerView(store: Store, player: PlayerRow): Promise<PlayerView> {
  const pets = kept(await store.petsOf(player.id));
  return { id: player.id, nickname: player.nickname, followerId: player.followerId, pets: pets.map(petView) };
}

/** A player picks which of their own hatched pets follows them. */
export async function chooseFollower(store: Store, player: PlayerRow, petId: unknown): Promise<PlayerRow> {
  const pet = typeof petId === 'string' ? await store.pet(petId) : null;
  // Somebody else's pet is as good as no pet: the answer does not say which.
  if (!pet || pet.ownerId !== player.id || pet.stage !== 'hatched') throw new Refusal('no-such-pet', 404);
  await store.setFollower(player.id, pet.id);
  return { ...player, followerId: pet.id };
}

/** Every player with their pets, for the admin page. */
export async function overview(store: Store): Promise<PlayerView[]> {
  const [players, pets] = await Promise.all([store.players(), store.allPets()]);
  return players.map((player) => ({
    id: player.id,
    nickname: player.nickname,
    followerId: player.followerId,
    pets: kept(pets.filter((pet) => pet.ownerId === player.id)).map(petView),
  }));
}

/** The owner gives a player one of the fixed pets. */
export async function givePet(store: Store, deps: Deps, playerId: string, founderId: unknown): Promise<PetView> {
  if (!(await store.player(playerId))) throw new Refusal('no-such-player', 404);
  const founder = typeof founderId === 'string' && Object.hasOwn(founders, founderId) ? founders[founderId] : null;
  if (!founder) throw new Refusal('no-such-founder', 404);
  if (kept(await store.petsOf(playerId)).length >= PET_CAP) throw new Refusal('full', 409);

  const pet = newPet(deps, playerId, structuredClone(founder.dna));
  await store.addPet(pet);
  return petView(pet);
}

/** The owner removes a pet for good. */
export async function removePet(store: Store, petId: string): Promise<void> {
  const pet = await store.pet(petId);
  if (!pet) throw new Refusal('no-such-pet', 404);
  const owner = await store.player(pet.ownerId);
  if (owner?.followerId === petId) await store.setFollower(owner.id, null);
  await store.removePet(petId);
}
