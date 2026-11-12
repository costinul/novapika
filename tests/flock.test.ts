import { Vector3 } from 'three';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { character } from '../src/characters/roster';
import { PhysicsWorld } from '../src/engine/physics';
import { Flock } from '../src/flock/Flock';
import { Pilot } from '../src/flock/Pilot';
import { CONTENT, HALF, HEIGHT } from '../src/lobbies/aviary/layout';
import { buildScenery } from '../src/lobbies/aviary/scenery';
import { StaticBuilder } from '../src/lobbies/build';
import { newMoveInput, toMoveInput } from '../src/movement/input';
import { placeAt, stepMovement } from '../src/movement/step';
import { Player } from '../src/player/Player';
import { ActionLayer } from '../src/world/actions';
import type { Action } from '../src/world/actions';
import { WorldState } from '../src/world/WorldState';
import { flockConfig as cfg } from '../src/flock/config';

// The lobby's own parrots, flying about the real Aviary by the same movement
// rules as a player. The flock is simulated at 60 steps a second, as in the game.

const DT = 1 / 60;
const flockDef = CONTENT.flock!;

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = await PhysicsWorld.create();
});

function buildAviary(): void {
  physics.clear();
  buildScenery(new StaticBuilder(physics));
}

describe('pilot', () => {
  it('flies between perches and lands on them, using only the wing rules', () => {
    buildAviary();
    physics.step(DT);
    const spots = flockDef.spots.map((p) => new Vector3(...p));
    const player = new Player('npc', 'budgie');
    player.human = false;
    player.flapCost = 0.4;
    const pilot = new Pilot();
    const move = newMoveInput();
    let seed = 7;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const step = (): void => {
      toMoveInput(player.input, move);
      stepMovement(player, move, physics, cfg, DT);
    };

    let from = spots[spots.length - 1];
    pilot.rest(player, DT);
    toMoveInput(player.input, move);
    placeAt(player, move, cfg, from);

    let trips = 0;
    let landed = 0;
    const times: number[] = [];
    let flapped = false;
    let glided = false;
    for (let i = 0; i < 40; i++) {
      const to = spots[Math.floor(random() * spots.length)];
      if (to === from) continue;
      trips++;
      for (let k = 0; k < 180; k++) {
        pilot.rest(player, DT);
        step();
      }
      pilot.begin();
      let t = 0;
      for (; t < 45 && !pilot.landed; t += DT) {
        pilot.flyTo(player, to, DT);
        step();
        flapped ||= player.wings.flapping;
        glided ||= player.movementState === 'gliding';
      }
      if (pilot.landed) {
        landed++;
        times.push(t);
        expect(player.grounded).toBe(true);
        expect(player.position.distanceTo(to)).toBeLessThan(1.3);
      } else {
        pilot.rest(player, DT);
        toMoveInput(player.input, move);
        placeAt(player, move, cfg, to);
      }
      from = to;
    }

    // It really does fly the way a player does.
    expect(flapped).toBe(true);
    expect(glided).toBe(true);
    expect(landed / trips).toBeGreaterThan(0.85);
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length / 2)]).toBeLessThan(20);
  });
});

describe('flock', () => {
  let world: WorldState;
  let actions: ActionLayer;
  let flock: Flock;
  let human: Player;
  let applied: Action[];
  /** Closest any parrot came to the front of the player's face. */
  let closestInFront: number;

  beforeEach(() => {
    buildAviary();
    world = new WorldState(physics);
    human = new Player('local', 'nova');
    world.players.set(human.id, human);
    world.load(CONTENT);
    actions = new ActionLayer(world);
    applied = [];
    actions.onApplied((a) => applied.push(a));
    flock = new Flock(world, actions, physics, null, null, null);
    flock.load(flockDef);
    physics.step(DT);
    closestInFront = Infinity;
    standAt(8, 6);
  });

  /** Stand the player on the grass, facing -z. */
  function standAt(x: number, z: number): void {
    human.head.position.set(x, cfg.bodyHeight.value, z);
    human.hands.left.grip.position.set(x - 0.2, 0.3, z);
    human.hands.right.grip.position.set(x + 0.2, 0.3, z);
  }

  function run(seconds: number, until?: () => boolean): boolean {
    const toParrot = new Vector3();
    for (let t = 0; t < seconds; t += DT) {
      physics.step(DT);
      flock.step(DT);
      flock.frame(DT, 1);
      world.step(DT, actions);
      world.updateInteractions(actions, DT);
      for (const parrot of flock.players) {
        toParrot.copy(parrot.head.position).sub(human.head.position);
        const distance = toParrot.length();
        const inFront = -toParrot.z / Math.max(distance, 1e-6) > 0.6; // the player faces -z
        if (inFront) closestInFront = Math.min(closestInFront, distance);
      }
      if (until?.()) return true;
    }
    return false;
  }

  const byFlock = (a: Action): boolean => 'playerId' in a && a.playerId.startsWith('flock-');

  it('is six to eight parrots of mixed species, each an ordinary Player', () => {
    expect(flock.players.length).toBeGreaterThanOrEqual(6);
    expect(flock.players.length).toBeLessThanOrEqual(8);
    const species = new Set(flock.players.map((p) => character(p.characterId).species));
    expect(species.size).toBeGreaterThanOrEqual(3);
    for (const parrot of flock.players) {
      expect(parrot).toBeInstanceOf(Player);
      expect(parrot.human).toBe(false);
      expect(world.players.get(parrot.id)).toBe(parrot);
    }
  });

  it('lives in the lobby on its own: every parrot flies, perches and stays inside', () => {
    const start = flock.players.map((p) => p.position.clone());
    const farthest = flock.players.map(() => 0);
    const flew = flock.players.map(() => false);
    const perchedSteps = flock.players.map(() => 0);
    let steps = 0;
    let rescues = 0;

    run(240, () => {
      steps++;
      flock.players.forEach((parrot, i) => {
        farthest[i] = Math.max(farthest[i], parrot.position.distanceTo(start[i]));
        flew[i] ||= parrot.movementState === 'gliding' || parrot.movementState === 'flapping';
        if (parrot.grounded) perchedSteps[i]++;
        expect(Math.abs(parrot.position.x)).toBeLessThan(HALF);
        expect(Math.abs(parrot.position.z)).toBeLessThan(HALF);
        expect(parrot.position.y).toBeGreaterThan(-0.5);
        expect(parrot.position.y).toBeLessThan(HEIGHT);
      });
      rescues += flock.brains.filter((b) => b.rescue).length;
      return false;
    });

    flock.players.forEach((_, i) => {
      expect(flew[i], `parrot ${i} flew`).toBe(true);
      expect(farthest[i], `parrot ${i} went somewhere`).toBeGreaterThan(5);
      // They spend a good share of the time sitting, not only flying.
      expect(perchedSteps[i] / steps, `parrot ${i} perched`).toBeGreaterThan(0.2);
    });
    expect(rescues).toBeLessThanOrEqual(2);
  });

  it('stays where it is put, and touches nothing, while another game runs it', () => {
    flock.setSimulated(false);
    expect(flock.players.every((p) => !p.simulatedHere)).toBe(true);
    // The game that runs the flock says where each parrot is.
    flock.players.forEach((parrot, i) => parrot.position.set(i * 2, 12, 3));
    run(20);
    flock.players.forEach((parrot, i) => expect(parrot.position.toArray()).toEqual([i * 2, 12, 3]));
    expect(applied.filter(byFlock)).toEqual([]);
  });

  it('carries each parrot on from where it is when it starts to run the flock', () => {
    flock.setSimulated(false);
    // Left by the game that ran them: some on perches, one in mid-air.
    const left = flock.players.map((parrot, i) => {
      const spot = flock.spots[(i * 5 + 3) % flock.spots.length];
      parrot.position.copy(spot);
      if (i === 0) parrot.position.set(4, 14, -6);
      parrot.updateWorldPoses();
      return parrot.position.clone();
    });

    flock.setSimulated(true);
    expect(flock.players.every((p) => p.simulatedHere)).toBe(true);
    // Nobody is put back on their home perch.
    flock.players.forEach((parrot, i) => expect(parrot.position.distanceTo(left[i])).toBe(0));
    run(1);
    flock.players.forEach((parrot, i) => expect(parrot.position.distanceTo(left[i]), `parrot ${i}`).toBeLessThan(6));

    // They fly on from there, and come to rest on a perch or the ground.
    const landed = flock.players.map(() => false);
    run(60, () => {
      flock.players.forEach((parrot, i) => {
        landed[i] ||= parrot.grounded && parrot.position.distanceTo(left[i]) > 2;
        expect(Math.abs(parrot.position.x)).toBeLessThan(HALF);
        expect(Math.abs(parrot.position.z)).toBeLessThan(HALF);
        expect(parrot.position.y).toBeGreaterThan(-0.5);
      });
      return false;
    });
    expect(landed.filter(Boolean).length).toBeGreaterThanOrEqual(flock.players.length - 1);
  });

  it('keeps out of the front of the player\'s face', () => {
    run(240);
    expect(closestInFront).toBeGreaterThan(0.8);
  });

  it('comes to a seed held in the beak and takes it', () => {
    actions.dispatch({ type: 'pickUp', playerId: human.id, toyId: 'seed-1' });
    const came = run(120, () =>
      flock.players.some((p) => p.position.distanceTo(human.head.position) < 3),
    );
    expect(came).toBe(true);

    const taken = run(120, () => applied.some((a) => a.type === 'take'));
    expect(taken).toBe(true);
    expect(human.carriedItemId).toBeNull();
    const thief = flock.players.find((p) => p.carriedItemId === 'seed-1');
    expect(thief).toBeDefined();
    expect(world.toys.get('seed-1')!.holderId).toBe(thief!.id);

    // It flies the seed off and puts it down somewhere.
    const dropped = run(150, () => applied.some((a) => a.type === 'drop' && byFlock(a)));
    expect(dropped).toBe(true);
  });

  it('now and then picks up a loose toy and carries it somewhere else', () => {
    const picked = run(600, () => applied.some((a) => a.type === 'pickUp' && byFlock(a)));
    expect(picked).toBe(true);
    const pick = applied.find((a) => a.type === 'pickUp' && byFlock(a)) as Extract<Action, { type: 'pickUp' }>;
    const from = world.toys.get(pick.toyId)!.home.clone();

    const dropped = run(200, () => applied.some((a) => a.type === 'drop' && byFlock(a)));
    expect(dropped).toBe(true);
    run(5);
    expect(world.toys.get(pick.toyId)!.position.distanceTo(from)).toBeGreaterThan(3);
  });

  it('has a parrot or two that follow the player for a while', () => {
    const followers = flockDef.parrots.filter((p) => p.follows).map((p) => p.id);
    expect(followers.length).toBeGreaterThanOrEqual(1);
    expect(followers.length).toBeLessThanOrEqual(2);
    const visited = run(300, () =>
      flock.players.some(
        (p) => followers.includes(p.id) && p.grounded && p.position.distanceTo(human.head.position) < 4,
      ),
    );
    expect(visited).toBe(true);
  });
});

describe('taking from a beak', () => {
  it('moves a held toy from one parrot to another', () => {
    physics.clear();
    physics.addStaticBox([0, -0.5, 0], [50, 0.5, 50]);
    const world = new WorldState(physics);
    const a = new Player('a', 'nova');
    const b = new Player('b', 'budgie');
    world.players.set(a.id, a);
    world.players.set(b.id, b);
    world.load(CONTENT);
    const actions = new ActionLayer(world);

    // Nothing to take until someone holds it.
    expect(actions.dispatch({ type: 'take', playerId: b.id, toyId: 'seed-1' })).toBe(false);
    actions.dispatch({ type: 'pickUp', playerId: a.id, toyId: 'seed-1' });
    // You cannot take what you already hold.
    expect(actions.dispatch({ type: 'take', playerId: a.id, toyId: 'seed-1' })).toBe(false);

    expect(actions.dispatch({ type: 'take', playerId: b.id, toyId: 'seed-1' })).toBe(true);
    expect(a.carriedItemId).toBeNull();
    expect(b.carriedItemId).toBe('seed-1');
    expect(world.toys.get('seed-1')!.holderId).toBe('b');
  });
});
