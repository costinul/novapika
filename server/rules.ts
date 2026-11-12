import { FREED_FOR_DAYS, PET_CAP, SEEDS_TO_HATCH, TALK_KEPT_DAYS } from '../shared/api';
import type { AdminPlayerView, EggView, FriendView, PetView, PlayerView, RequestView, TalkView } from '../shared/api';
import { breed, breedingOdds } from '../shared/breeding';
import { tierOf } from '../shared/dna';
import type { Dna } from '../shared/dna';
import { founders } from '../shared/founders';
import type { PetRow, PlayerRow, RequestRow, Store, TalkRow } from './store';

// The server's rules: who may do what, and what happens. Plain functions over
// a Store, with everything random or timed passed in, so they can be tested
// without a database or a network.

const CODE_DIGITS = 6;
const NICKNAME_MAX = 20;
const DAY = 24 * 60 * 60 * 1000;

export type RefusalReason =
  | 'bad-code'
  | 'bad-nickname'
  | 'no-such-player'
  | 'no-such-pet'
  | 'no-such-founder'
  | 'no-such-request'
  /** The player has as many pets as they can have. */
  | 'full'
  /** The player already has an egg, or is waiting for a friend's answer, which holds the egg's place. */
  | 'has-egg'
  | 'no-egg'
  /** A pet cannot be bred with itself. */
  | 'same-pet'
  /** A player's last pet cannot be set free. */
  | 'last-pet';

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

function newPet(deps: Deps, ownerId: string, dna: Dna, parents: [string, string] | null = null): PetRow {
  return {
    id: deps.id(),
    ownerId,
    dna,
    parentA: parents?.[0] ?? null,
    parentB: parents?.[1] ?? null,
    stage: parents ? 'egg' : 'hatched',
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

const hatched = (pets: PetRow[]): PetRow[] => pets.filter((pet) => pet.stage === 'hatched');
const eggOf = (pets: PetRow[]): PetRow | undefined => pets.find((pet) => pet.stage === 'egg');
const petView = (pet: PetRow): PetView => ({ id: pet.id, dna: pet.dna });
const eggView = (egg: PetRow): EggView => ({
  id: egg.id,
  // The shell hints at the colours inside and at nothing else.
  shell: [egg.dna.colors.belly, egg.dna.colors.head],
  seeds: egg.seeds,
});

/** One of the player's own hatched pets, or a refusal. Somebody else's pet is as good as none. */
async function ownPet(store: Store, player: PlayerRow, petId: unknown): Promise<PetRow> {
  const pet = typeof petId === 'string' ? await store.pet(petId) : null;
  if (!pet || pet.ownerId !== player.id || pet.stage !== 'hatched') throw new Refusal('no-such-pet', 404);
  return pet;
}

/**
 * Turn the player down if they have no room for an egg. A request waiting for
 * a friend's answer holds the egg's place, so that a "yes" always has room.
 */
async function roomForEgg(store: Store, playerId: string): Promise<void> {
  const pets = await store.petsOf(playerId);
  const asking = (await store.requestsBy(playerId)).length;
  if (eggOf(pets) || asking > 0) throw new Refusal('has-egg', 409);
  if (hatched(pets).length >= PET_CAP) throw new Refusal('full', 409);
}

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

/**
 * The owner removes a player for good: their sign-ins, their pets and eggs,
 * and every request to or from them. Their friends keep their own pets, and
 * a friend who was waiting for this player's answer can ask somebody else.
 */
export async function removePlayer(store: Store, playerId: string): Promise<void> {
  if (!(await store.player(playerId))) throw new Refusal('no-such-player', 404);
  await store.removePlayer(playerId);
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

/** A request as one of its two players sees it; null if the other pet or player has gone. */
async function requestView(store: Store, request: RequestRow, asker: boolean): Promise<RequestView | null> {
  const [friend, theirPet] = await Promise.all([
    store.player(asker ? request.ownerId : request.askerId),
    store.pet(asker ? request.askedPetId : request.askerPetId),
  ]);
  if (!friend || !theirPet) return null;
  return {
    id: request.id,
    myPetId: asker ? request.askerPetId : request.askedPetId,
    friend: friend.nickname,
    theirPet: petView(theirPet),
  };
}

/** A player as they see themself. Read afresh, so it shows what a change has just done. */
export async function playerView(store: Store, playerId: string): Promise<PlayerView> {
  const [player, pets, by, of] = await Promise.all([
    store.player(playerId),
    store.petsOf(playerId),
    store.requestsBy(playerId),
    store.requestsOf(playerId),
  ]);
  if (!player) throw new Refusal('no-such-player', 404);
  const egg = eggOf(pets);
  const asking = by[0] ? await requestView(store, by[0], true) : null;
  const asked = await Promise.all(of.map((request) => requestView(store, request, false)));
  return {
    id: player.id,
    nickname: player.nickname,
    followerId: player.followerId,
    pets: hatched(pets).map(petView),
    egg: egg ? eggView(egg) : null,
    asking,
    asked: asked.filter((view) => view !== null),
  };
}

/** A player picks which of their own hatched pets follows them. */
export async function chooseFollower(store: Store, player: PlayerRow, petId: unknown): Promise<void> {
  const pet = await ownPet(store, player, petId);
  await store.setFollower(player.id, pet.id);
}

/** The other players, each with the pets whose DNA can be asked for. */
export async function friendsOf(store: Store, player: PlayerRow): Promise<FriendView[]> {
  const [players, pets] = await Promise.all([store.players(), store.allPets()]);
  return players
    .filter((other) => other.id !== player.id)
    .map((other) => ({
      id: other.id,
      nickname: other.nickname,
      pets: hatched(pets.filter((pet) => pet.ownerId === other.id)).map(petView),
    }));
}

/** Two of the player's own pets make an egg. Its DNA is fixed here and now. */
export async function breedOwn(store: Store, deps: Deps, player: PlayerRow, petA: unknown, petB: unknown): Promise<void> {
  const a = await ownPet(store, player, petA);
  const b = await ownPet(store, player, petB);
  if (a.id === b.id) throw new Refusal('same-pet');
  await roomForEgg(store, player.id);
  await store.addPet(newPet(deps, player.id, breed(a.dna, b.dna, deps.random), [a.id, b.id]));
}

/** Ask a friend for the DNA of one of their pets, to pair with one of the player's own. */
export async function askFor(
  store: Store,
  deps: Deps,
  player: PlayerRow,
  myPetId: unknown,
  theirPetId: unknown,
): Promise<void> {
  const mine = await ownPet(store, player, myPetId);
  const theirs = typeof theirPetId === 'string' ? await store.pet(theirPetId) : null;
  if (!theirs || theirs.stage !== 'hatched' || theirs.ownerId === player.id) throw new Refusal('no-such-pet', 404);
  await roomForEgg(store, player.id);
  await store.addRequest({
    id: deps.id(),
    askerId: player.id,
    askerPetId: mine.id,
    ownerId: theirs.ownerId,
    askedPetId: theirs.id,
    createdAt: deps.now(),
  });
}

/** Answer a friend's request. "Yes" lays the egg in the asker's nest; giving DNA costs nothing. */
export async function answer(store: Store, deps: Deps, player: PlayerRow, requestId: string, accept: unknown): Promise<void> {
  const request = await store.request(requestId);
  if (!request || request.ownerId !== player.id) throw new Refusal('no-such-request', 404);
  await store.removeRequest(request.id);
  if (accept !== true) return;
  const [theirs, mine] = await Promise.all([store.pet(request.askerPetId), store.pet(request.askedPetId)]);
  if (!theirs || !mine || theirs.stage !== 'hatched' || mine.stage !== 'hatched') throw new Refusal('no-such-pet', 404);
  await store.addPet(newPet(deps, request.askerId, breed(theirs.dna, mine.dna, deps.random), [theirs.id, mine.id]));
}

/** Take back a request the player made. */
export async function cancelRequest(store: Store, player: PlayerRow, requestId: string): Promise<void> {
  const request = await store.request(requestId);
  if (!request || request.askerId !== player.id) throw new Refusal('no-such-request', 404);
  await store.removeRequest(request.id);
}

/**
 * Feed the player's egg one seed. The last one hatches it. Gives the id of
 * the pet that hatched, or null. The game is trusted that a seed was dropped.
 */
export async function feedEgg(store: Store, player: PlayerRow): Promise<string | null> {
  const egg = eggOf(await store.petsOf(player.id));
  if (!egg) throw new Refusal('no-egg', 404);
  const seeds = egg.seeds + 1;
  if (seeds < SEEDS_TO_HATCH) {
    await store.updatePet(egg.id, { seeds });
    return null;
  }
  await store.updatePet(egg.id, { stage: 'hatched', seeds: 0 });
  return egg.id;
}

/** Set a pet free. It is kept for 30 days in case that was a mistake. */
export async function freePet(store: Store, deps: Deps, player: PlayerRow, petId: unknown): Promise<void> {
  const pet = await ownPet(store, player, petId);
  if (hatched(await store.petsOf(player.id)).length <= 1) throw new Refusal('last-pet', 409);
  await store.updatePet(pet.id, { stage: 'freed', freedAt: deps.now() });
  await store.removeRequestsNaming(pet.id);
  if (player.followerId === pet.id) await store.setFollower(player.id, null);
}

/** Every player with their pets, for the admin page. Forgets pets set free more than 30 days ago. */
export async function overview(store: Store, deps: Deps): Promise<AdminPlayerView[]> {
  await store.removeFreedBefore(deps.now() - FREED_FOR_DAYS * DAY);
  const [players, pets] = await Promise.all([store.players(), store.allPets()]);
  return Promise.all(
    players.map(async (player) => ({
      ...(await playerView(store, player.id)),
      freed: pets.filter((pet) => pet.ownerId === player.id && pet.stage === 'freed').map(petView),
    })),
  );
}

/** The owner gives a player one of the fixed pets. */
export async function givePet(store: Store, deps: Deps, playerId: string, founderId: unknown): Promise<PetView> {
  if (!(await store.player(playerId))) throw new Refusal('no-such-player', 404);
  const founder = typeof founderId === 'string' && Object.hasOwn(founders, founderId) ? founders[founderId] : null;
  if (!founder) throw new Refusal('no-such-founder', 404);
  await roomForPet(store, playerId);

  const pet = newPet(deps, playerId, structuredClone(founder.dna));
  await store.addPet(pet);
  return petView(pet);
}

/** Turn down a new hatched pet if the player is full. An egg, or the place held for one, counts. */
async function roomForPet(store: Store, playerId: string): Promise<void> {
  const pets = await store.petsOf(playerId);
  const held = eggOf(pets) || (await store.requestsBy(playerId)).length > 0 ? 1 : 0;
  if (hatched(pets).length + held >= PET_CAP) throw new Refusal('full', 409);
}

/** The owner removes a pet or an egg for good. */
export async function removePet(store: Store, petId: string): Promise<void> {
  const pet = await store.pet(petId);
  if (!pet) throw new Refusal('no-such-pet', 404);
  const owner = await store.player(pet.ownerId);
  if (owner?.followerId === petId) await store.setFollower(owner.id, null);
  await store.removeRequestsNaming(petId);
  await store.removePet(petId);
}

/** The owner brings back a pet that was set free. */
export async function restorePet(store: Store, petId: string): Promise<void> {
  const pet = await store.pet(petId);
  if (!pet || pet.stage !== 'freed') throw new Refusal('no-such-pet', 404);
  await roomForPet(store, pet.ownerId);
  await store.updatePet(pet.id, { stage: 'hatched', freedAt: null });
}

// --- The helper parrot ----------------------------------------------------------

/** The name of the owner's switch for the helper parrot. */
const HELPER_SWITCH = 'helper';
/** The most talk the admin page is shown at once. */
const TALK_SHOWN = 200;

/** Whether the owner has the helper parrot switched on. It is on until it is switched off. */
export async function helperOn(store: Store): Promise<boolean> {
  return (await store.setting(HELPER_SWITCH)) !== 'off';
}

export async function setHelperOn(store: Store, on: unknown): Promise<void> {
  await store.setSetting(HELPER_SWITCH, on === true ? 'on' : 'off');
}

/** Keep one thing said to the helper parrot and what it answered. */
export async function keepTalk(store: Store, deps: Pick<Deps, 'id'>, talk: Omit<TalkRow, 'id'>): Promise<void> {
  await store.addTalk({ ...talk, id: deps.id() });
}

/** Forget what was said to the helper parrot more than a week ago. */
export async function forgetOldTalk(store: Store, deps: Deps): Promise<void> {
  await store.removeTalkBefore(deps.now() - TALK_KEPT_DAYS * DAY);
}

/** What was said to the helper parrot this week, for the admin page: flagged talk first, each newest first. */
export async function talkView(store: Store, deps: Deps): Promise<TalkView[]> {
  await forgetOldTalk(store, deps);
  const talk = await store.talk(TALK_SHOWN);
  const view = ({ at, lobbyId, nickname, heard, said, flagged }: TalkRow): TalkView => ({ at, lobbyId, nickname, heard, said, flagged });
  return [...talk.filter((t) => t.flagged), ...talk.filter((t) => !t.flagged)].map(view);
}

/** A player's pets and egg in a few words, for the helper parrot to know who it is talking to. */
export async function aboutPlayer(store: Store, playerId: string): Promise<string> {
  const pets = await store.petsOf(playerId);
  const count = hatched(pets).length;
  const egg = eggOf(pets);
  const has = `${count} pet${count === 1 ? '' : 's'}`;
  return egg ? `They have ${has}, and an egg that has been fed ${egg.seeds} of ${SEEDS_TO_HATCH} times.` : `They have ${has} and no egg.`;
}
