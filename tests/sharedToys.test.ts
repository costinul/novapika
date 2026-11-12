import { Vector3 } from 'three';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { movementConfig } from '../src/config/movement';
import { PhysicsWorld } from '../src/engine/physics';
import { Multiplayer } from '../src/net/Multiplayer';
import { Player } from '../src/player/Player';
import { ActionLayer } from '../src/world/actions';
import type { Action } from '../src/world/actions';
import type { LobbyContent } from '../src/world/types';
import { WorldState } from '../src/world/WorldState';
import type { Toy } from '../src/world/WorldState';
import { fakeLobby, settle } from './fakeLobby';
import type { FakeLobby } from './fakeLobby';

// Toys, bells and a lobby parrot shared by the games of several players:
// each game with its own world and its own toy physics, joined through the
// real lobby rules with no network in between.

const DT = 1 / 120;

const CONTENT: LobbyContent = {
  toyTypes: {
    block: { shape: 'box', size: 0.12, color: 0xffffff, density: 300, bounce: 0.2 },
    ball: { shape: 'ball', size: 0.14, color: 0xffffff, density: 200, bounce: 0.5 },
  },
  toys: [
    { id: 'block-1', type: 'block', position: [0, 0.06, -1] },
    { id: 'block-2', type: 'block', position: [2, 0.06, -1] },
    { id: 'ball-1', type: 'ball', position: [-2, 0.07, -1] },
  ],
  targets: [{ id: 'toy-box', kind: 'toyBox', position: [5, 0, 0], size: [1, 0.35, 0.8], color: 0 }],
  peckables: [
    { id: 'bell-a', kind: 'bell', position: [0, 2, 3], radius: 0.12, stringLength: 0.3 },
    { id: 'bell-b', kind: 'bell', position: [3, 2, 3], radius: 0.12, stringLength: 0.3 },
  ],
  rings: [],
  water: [],
};

interface Game {
  name: string;
  physics: PhysicsWorld;
  world: WorldState;
  actions: ActionLayer;
  local: Player;
  /** One of the lobby's own parrots, as this game has it. */
  parrot: Player;
  net: Multiplayer;
  /** Every action applied in this game; those another game made happen are marked. */
  seen: { action: Action; remote: boolean }[];
}

let worlds: PhysicsWorld[];
beforeAll(async () => {
  worlds = [await PhysicsWorld.create(), await PhysicsWorld.create(), await PhysicsWorld.create()];
});

let lobby: FakeLobby;
let time: number;
let games: Game[];
let alex: Game;
let sam: Game;

function game(index: number, name: string): Game {
  const physics = worlds[index];
  physics.clear();
  physics.addStaticBox([0, -0.5, 0], [50, 0.5, 50]);
  const world = new WorldState(physics);
  const local = new Player('local', 'nova');
  const parrot = new Player('flock-a', 'budgie');
  parrot.human = false;
  world.players.set(local.id, local);
  world.players.set(parrot.id, parrot);
  world.load(CONTENT);
  const actions = new ActionLayer(world);
  const seen: Game['seen'] = [];
  actions.onApplied((action, remote) => seen.push({ action, remote }));
  // Parked well away from everything, each in their own place.
  local.input.head.position.set(0, 1.5, 0);
  local.position.set(-20 - index * 2, 5, -20);
  parrot.position.set(-20, 9, -30);
  const net = new Multiplayer({
    world,
    actions,
    feathers: null,
    local,
    connect: lobby.as(`id-${name}`, name),
    about: () => ({ characterId: local.characterId, followerPetId: null }),
    flock: () => [parrot],
    onRefused: () => {},
    now: () => time,
  });
  const made = { name, physics, world, actions, local, parrot, net, seen };
  games.push(made);
  return made;
}

/** Every game runs for `seconds`: toy physics 120 times a second, frames 60. */
function play(seconds: number): void {
  for (let step = 0; step < Math.round(seconds / DT); step++) {
    time += DT;
    for (const g of games) {
      g.physics.step(DT);
      g.world.step(DT, g.actions);
      if (step % 2 === 1) continue;
      g.local.updateWorldPoses();
      // Only the host runs the lobby's own parrot; everyone else is told where it is.
      g.parrot.simulatedHere = g.net.isHost;
      if (g.net.isHost) g.parrot.updateWorldPoses();
      g.net.frame(2 * DT);
      g.world.updateInteractions(g.actions, 2 * DT);
    }
  }
}

/** Put a game's player with its head at a point. */
function headAt(g: Game, x: number, y: number, z: number): void {
  g.local.position.set(x, y - 1.5, z);
  g.local.velocity.set(0, 0, 0);
  g.local.updateWorldPoses();
}

/** Put a game's player where its beak can reach a toy, without touching anything else. */
function goTo(g: Game, toyId: string): void {
  const { position } = g.world.toys.get(toyId)!;
  headAt(g, position.x, position.y + 0.25, position.z + 0.1);
}

const toy = (g: Game, id: string): Toy => g.world.toys.get(id)!;
const apart = (id: string, a: Game = alex, b: Game = sam): number => toy(a, id).position.distanceTo(toy(b, id).position);

beforeEach(async () => {
  lobby = fakeLobby();
  time = 100;
  games = [];
  alex = game(0, 'Alex');
  sam = game(1, 'Sam');
  alex.net.join('test');
  await settle();
  sam.net.join('test');
  await settle();
  // Long enough for each to have seen the other move.
  play(0.5);
});

describe('carrying a toy', () => {
  it('shows it in the same parrot\'s beak in every game', () => {
    goTo(alex, 'block-1');
    expect(alex.actions.dispatch({ type: 'pickUp', playerId: 'local', toyId: 'block-1' })).toBe(true);
    // The other game knows the player by the name the lobby gives them.
    expect(toy(sam, 'block-1').holderId).toBe('id-Alex');
    expect(sam.world.players.get('id-Alex')!.carriedItemId).toBe('block-1');
    expect(sam.seen.at(-1)).toEqual({ action: { type: 'pickUp', playerId: 'id-Alex', toyId: 'block-1' }, remote: true });

    headAt(alex, 6, 8, -4);
    play(0.6);
    expect(toy(alex, 'block-1').position.y).toBeGreaterThan(7);
    expect(apart('block-1')).toBeLessThan(0.02);
  });

  it('gives a toy two players bite at the same moment to one of them, in every game', () => {
    goTo(alex, 'block-1');
    goTo(sam, 'block-1');
    play(0.3);
    // Neither has heard of the other's bite yet.
    lobby.hold();
    expect(alex.actions.dispatch({ type: 'pickUp', playerId: 'local', toyId: 'block-1' })).toBe(true);
    expect(sam.actions.dispatch({ type: 'pickUp', playerId: 'local', toyId: 'block-1' })).toBe(true);
    expect(alex.local.carriedItemId).toBe('block-1');
    expect(sam.local.carriedItemId).toBe('block-1');
    lobby.release();

    expect(toy(alex, 'block-1').holderId).toBe('local');
    expect(toy(sam, 'block-1').holderId).toBe('id-Alex');
    expect(alex.local.carriedItemId).toBe('block-1');
    expect(sam.local.carriedItemId).toBeNull();
    expect(alex.world.players.get('id-Sam')!.carriedItemId).toBeNull();
    // The one who lost can bite something else.
    goTo(sam, 'block-2');
    expect(sam.actions.dispatch({ type: 'pickUp', playerId: 'local', toyId: 'block-2' })).toBe(true);
    expect(toy(alex, 'block-2').holderId).toBe('id-Sam');
  });

  it('lets one player take a toy out of another\'s beak', () => {
    goTo(alex, 'ball-1');
    alex.actions.dispatch({ type: 'pickUp', playerId: 'local', toyId: 'ball-1' });
    expect(sam.actions.dispatch({ type: 'take', playerId: 'local', toyId: 'ball-1' })).toBe(true);
    expect(toy(alex, 'ball-1').holderId).toBe('id-Sam');
    expect(alex.local.carriedItemId).toBeNull();
    expect(toy(sam, 'ball-1').holderId).toBe('local');
    expect(alex.actions.dispatch({ type: 'drop', playerId: 'local' })).toBe(false);
  });

  it('shows what the lobby\'s own parrot carries, which only the host\'s game decides', () => {
    expect(alex.net.isHost).toBe(true);
    play(0.2);
    expect(alex.actions.dispatch({ type: 'pickUp', playerId: 'flock-a', toyId: 'ball-1' })).toBe(true);
    expect(toy(sam, 'ball-1').holderId).toBe('flock-a');
    expect(sam.parrot.carriedItemId).toBe('ball-1');
    play(0.3);
    expect(apart('ball-1')).toBeLessThan(0.02);
    expect(toy(sam, 'ball-1').position.y).toBeGreaterThan(8);

    // A game that is not the host may think its copy of the parrot did something: nobody else hears of it.
    sam.actions.dispatch({ type: 'drop', playerId: 'flock-a' });
    expect(toy(alex, 'ball-1').holderId).toBe('flock-a');
  });
});

describe('letting go of a toy', () => {
  beforeEach(() => {
    goTo(alex, 'block-1');
    alex.actions.dispatch({ type: 'pickUp', playerId: 'local', toyId: 'block-1' });
    headAt(alex, 8, 3, 8);
    play(0.4);
  });

  it('falls in the game that let go, which tells the others where it is until it rests', () => {
    alex.actions.dispatch({ type: 'drop', playerId: 'local' });
    expect(toy(alex, 'block-1').sim).toBe('here');
    expect(toy(sam, 'block-1').sim).toBe('there');
    expect(toy(sam, 'block-1').holderId).toBeNull();

    play(0.35);
    // Part-way down, in both games.
    for (const g of [alex, sam]) {
      expect(toy(g, 'block-1').position.y, g.name).toBeLessThan(2.6);
      expect(toy(g, 'block-1').position.y, g.name).toBeGreaterThan(0.5);
    }
    expect(apart('block-1')).toBeLessThan(0.6);

    play(4);
    for (const g of [alex, sam]) {
      expect(toy(g, 'block-1').sim, g.name).toBe('rest');
      expect(g.physics.isAsleep(toy(g, 'block-1').body), g.name).toBe(true);
      expect(toy(g, 'block-1').position.y, g.name).toBeLessThan(0.1);
    }
    expect(apart('block-1')).toBeLessThan(0.001);
    expect(lobby.saved!.rest.map(([id]) => id)).toEqual(['block-1']);
  });

  it('counts as put away for everyone when it lands in the toy box', () => {
    headAt(alex, 5, 1.2, 0);
    play(0.4);
    alex.actions.dispatch({ type: 'drop', playerId: 'local' });
    play(3);
    expect(toy(alex, 'block-1').placedIn).toBe('toy-box');
    expect(toy(sam, 'block-1').placedIn).toBe('toy-box');
    expect(apart('block-1')).toBeLessThan(0.001);
    // Said once, by the game that was moving it.
    const places = (g: Game): boolean[] => g.seen.filter((s) => s.action.type === 'place').map((s) => s.remote);
    expect(places(alex)).toEqual([false]);
    expect(places(sam)).toEqual([true]);
  });

  it('knocks a toy that lay still, and both end up in the same place in every game', () => {
    // Fly low past the other block and let go, so that the one carried slides into it.
    const other = toy(alex, 'block-2').position;
    headAt(alex, other.x - 0.5, 0.09 + movementConfig.carryDown.value, other.z + movementConfig.carryForward.value);
    play(0.4);
    alex.local.velocity.set(4, 0, 0);
    alex.actions.dispatch({ type: 'drop', playerId: 'local' });
    alex.local.velocity.set(0, 0, 0);
    play(6);
    // The one underneath was moved, by the same game.
    expect(alex.seen.some((s) => s.action.type === 'claim' && s.action.toyId === 'block-2' && !s.remote)).toBe(true);
    expect(toy(alex, 'block-2').position.distanceTo(toy(alex, 'block-2').home)).toBeGreaterThan(0.02);
    for (const id of ['block-1', 'block-2']) {
      for (const g of [alex, sam]) expect(toy(g, id).sim, `${id} in ${g.name}`).toBe('rest');
      expect(apart(id), id).toBeLessThan(0.001);
    }
  });

  it('goes back to where it started, in every game, if it falls out of the lobby', () => {
    headAt(alex, 70, 3, 70);
    play(0.4);
    alex.actions.dispatch({ type: 'drop', playerId: 'local' });
    play(3);
    for (const g of [alex, sam]) {
      expect(toy(g, 'block-1').position.distanceTo(toy(g, 'block-1').home), g.name).toBeLessThan(0.001);
      expect(toy(g, 'block-1').sim, g.name).toBe('rest');
    }
  });
});

describe('coming and going', () => {
  it('shows a newcomer the toys, bells and beaks as they are', async () => {
    goTo(alex, 'block-1');
    alex.actions.dispatch({ type: 'pickUp', playerId: 'local', toyId: 'block-1' });
    goTo(sam, 'block-2');
    sam.actions.dispatch({ type: 'pickUp', playerId: 'local', toyId: 'block-2' });
    headAt(sam, 5, 1.2, 0);
    play(0.4);
    sam.actions.dispatch({ type: 'drop', playerId: 'local' });
    headAt(alex, 0, 2.1, 3.1);
    play(5);
    expect(alex.world.bellsRung.has('bell-a')).toBe(true);
    expect(toy(sam, 'block-2').sim).toBe('rest');

    const kim = game(2, 'Kim');
    kim.net.join('test');
    await settle();
    expect(toy(kim, 'block-1').holderId).toBe('id-Alex');
    expect(toy(kim, 'block-2').placedIn).toBe('toy-box');
    expect(apart('block-2', kim, sam)).toBeLessThan(0.001);
    expect([...kim.world.bellsRung]).toEqual(['bell-a']);
    // Once the one carrying it has been seen, the toy is in their beak.
    play(1.5);
    expect(apart('block-2', kim, sam)).toBeLessThan(0.001);
    expect(kim.world.players.get('id-Alex')!.carriedItemId).toBe('block-1');
    expect(apart('block-1', kim, alex)).toBeLessThan(0.02);
  });

  it('puts back what a player carried when they leave', () => {
    goTo(sam, 'block-2');
    sam.actions.dispatch({ type: 'pickUp', playerId: 'local', toyId: 'block-2' });
    headAt(sam, 9, 6, 9);
    play(0.5);
    expect(toy(alex, 'block-2').position.y).toBeGreaterThan(5);
    sam.net.leave();
    expect(toy(alex, 'block-2').holderId).toBeNull();
    expect(toy(alex, 'block-2').position.distanceTo(toy(alex, 'block-2').home)).toBeLessThan(0.001);
    expect(alex.world.players.has('id-Sam')).toBe(false);
  });

  it('lets a player who leaves carry on alone, with every toy theirs to move again', () => {
    goTo(alex, 'block-1');
    alex.actions.dispatch({ type: 'pickUp', playerId: 'local', toyId: 'block-1' });
    headAt(alex, 8, 3, 8);
    play(0.4);
    alex.actions.dispatch({ type: 'drop', playerId: 'local' });
    play(0.2);
    expect(toy(sam, 'block-1').sim).toBe('there');

    sam.net.leave();
    expect(sam.world.sharedAs).toBeNull();
    const before = sam.seen.length;
    play(4);
    // It fell the rest of the way by this game's own physics, and nothing is passed on.
    expect(toy(sam, 'block-1').position.y).toBeLessThan(0.1);
    expect(sam.physics.isAsleep(toy(sam, 'block-1').body)).toBe(true);
    expect(sam.seen.slice(before).filter((s) => s.action.type === 'rest')).toEqual([]);
    goTo(sam, 'block-1');
    expect(sam.actions.dispatch({ type: 'pickUp', playerId: 'local', toyId: 'block-1' })).toBe(true);
    expect(toy(alex, 'block-1').holderId).toBeNull();
  });
});

describe('bells', () => {
  it('ring for everyone, and are all cleared for everyone when the last is rung', () => {
    headAt(alex, 0, 2.1, 3.1);
    play(0.3);
    expect([...alex.world.bellsRung]).toEqual(['bell-a']);
    expect([...sam.world.bellsRung]).toEqual(['bell-a']);
    expect(sam.seen.filter((s) => s.action.type === 'ring')).toEqual([
      { action: { type: 'ring', objectId: 'bell-a', playerId: 'id-Alex' }, remote: true },
    ]);

    headAt(sam, 3, 2.1, 3.1);
    play(0.3);
    expect(alex.world.bellsRung.size).toBe(0);
    expect(sam.world.bellsRung.size).toBe(0);
    // Each bell was rung once, and the cheer raised once, by the game of the one who rang the last.
    for (const g of [alex, sam]) {
      expect(g.seen.filter((s) => s.action.type === 'ring'), g.name).toHaveLength(2);
      expect(g.seen.filter((s) => s.action.type === 'celebrate'), g.name).toHaveLength(1);
    }
    expect(sam.seen.find((s) => s.action.type === 'celebrate')!.remote).toBe(false);
  });
});

describe('a stunt', () => {
  it('is cheered in every game', () => {
    alex.actions.dispatch({ type: 'stunt', playerId: 'local', name: 'loop' });
    expect(sam.world.players.get('id-Alex')!.excitement).toBe(1);
    expect(sam.seen.at(-1)).toEqual({ action: { type: 'stunt', playerId: 'id-Alex', name: 'loop' }, remote: true });
    // Nobody is told about their own again.
    expect(alex.seen.filter((s) => s.action.type === 'stunt')).toHaveLength(1);
    expect(new Vector3().copy(sam.world.players.get('id-Alex')!.position).distanceTo(alex.local.position)).toBeLessThan(0.01);
  });
});
