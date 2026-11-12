import { Vector3 } from 'three';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LOBBY_IDS, LOBBY_SIZE } from '../shared/net';
import { Gate } from '../src/gate/Gate';
import { PhysicsWorld } from '../src/engine/physics';
import { fromGate, gateLayout, OPENING, PICTURE, PICTURE_STEP, REACH, STEP, toGate } from '../src/gate/layout';
import { PICTURES } from '../src/gate/pictures';
import { PLACES } from '../src/gate/places';
import { CONTENT, GATE, HALF } from '../src/lobbies/aviary/layout';
import { buildScenery } from '../src/lobbies/aviary/scenery';
import { CONTENT as TOWN, GATE as TOWN_GATE, HALF as TOWN_HALF } from '../src/lobbies/downhamMarket/layout';
import { buildScenery as buildTown } from '../src/lobbies/downhamMarket/scenery';
import { StaticBuilder } from '../src/lobbies/build';
import { lobbyRegistry } from '../src/lobbies/registry';
import { placeAt, stepMovement } from '../src/movement/step';
import type { MoveInput } from '../src/movement/types';
import { Player } from '../src/player/Player';
import { BEAK_OFFSET } from '../src/world/beak';
import type { GateDef, Vec3 } from '../src/world/types';
import { WorldState } from '../src/world/WorldState';
import { cfg, DT, HEAD_Y } from './harness';

// The rules of a gate, with a player moved by hand: no drawing, no physics.

/** Turned and off to one side, so nothing passes by luck of the axes. */
const DEF: GateDef = { position: [10, 2, -5], yaw: 0.7 };
const MID_Y = (OPENING.bottom + OPENING.top) / 2;

let gate: Gate;
let player: Player;
let picked: string[];

beforeEach(() => {
  gate = new Gate();
  picked = [];
  gate.onPicked = (placeId) => picked.push(placeId);
  gate.load(DEF, 'aviary');
  player = new Player('p', 'nova');
  headAt(0, MID_Y, 3);
});

/** Put the head at a point in the gate's own frame, with the hands by its sides. */
function headAt(x: number, y: number, z: number): void {
  player.head.position.set(...fromGate(DEF, x, y, z));
  player.hands.left.grip.position.set(...fromGate(DEF, x - 0.3, y - 0.3, z));
  player.hands.right.grip.position.set(...fromGate(DEF, x + 0.3, y - 0.3, z));
}

/** Move the head in a straight line, a frame at a time, and say where the gate sent the player, if anywhere. */
function fly(from: Vec3, to: Vec3): string | null {
  let went: string | null = null;
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    headAt(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t);
    went = gate.update(player) ?? went;
  }
  return went;
}

/** Put the beak on the middle of a picture. */
function peck(placeId: string): void {
  const picture = gate.layout!.pictures.find((p) => p.placeId === placeId)!;
  // The player looks straight ahead, so the beak is the head moved by its offset.
  player.head.position.set(...picture.position).sub(BEAK_OFFSET);
  player.hands.left.grip.position.set(0, 100, 0);
  player.hands.right.grip.position.set(0, 100, 0);
  gate.update(player);
}

const IN_FRONT: Vec3 = [0, MID_Y, 1];
const BEHIND: Vec3 = [0, MID_Y, OPENING.z - 0.5];

describe('the places on a board', () => {
  it('are all places the game and the server have', () => {
    for (const id of PLACES) {
      expect(lobbyRegistry[id], id).toBeDefined();
      expect(LOBBY_IDS, id).toContain(id);
    }
  });

  it('each have a picture', () => {
    for (const id of PLACES) expect(PICTURES[id], id).toBeTypeOf('function');
  });

  it('never include the place the board stands in', () => {
    for (const here of PLACES) {
      const ids = gateLayout(DEF, here).pictures.map((p) => p.placeId);
      expect(ids).not.toContain(here);
      expect(ids).toHaveLength(PLACES.length - 1);
    }
  });

  it('hang with a gap between them, so one touch cannot pick two', () => {
    expect(PICTURE_STEP).toBeGreaterThan(PICTURE);
  });

  it('are found again in the gate\'s own frame', () => {
    const local = toGate(DEF, new Vector3(...fromGate(DEF, 1.5, 2, -3)), new Vector3());
    expect(local.x).toBeCloseTo(1.5);
    expect(local.y).toBeCloseTo(2);
    expect(local.z).toBeCloseTo(-3);
  });
});

describe('picking a place', () => {
  it('happens when the beak touches its picture', () => {
    peck('downham-market');
    expect(gate.picked).toBe('downham-market');
    expect(picked).toEqual(['downham-market']);
  });

  it('happens when a hand touches its picture', () => {
    const picture = gate.layout!.pictures[0];
    player.hands.right.grip.position.set(...picture.position);
    gate.update(player);
    expect(gate.picked).toBe(picture.placeId);
  });

  it('is said once, however long the touch lasts', () => {
    peck('downham-market');
    peck('downham-market');
    expect(picked).toEqual(['downham-market']);
  });

  it("happens from as far off as a standing parrot's body keeps its beak", () => {
    const [x, y, z] = gate.layout!.pictures[0].local;
    headAt(x, y, z + REACH - 0.02);
    player.head.position.sub(BEAK_OFFSET);
    gate.update(player);
    expect(gate.picked).toBe('downham-market');
  });

  it('does not happen away from the pictures', () => {
    gate.update(player);
    // Beside the picture, past its edge.
    const [x, y, z] = gate.layout!.pictures[0].local;
    headAt(x + PICTURE / 2 + 0.05, y, z + 0.1);
    player.head.position.sub(BEAK_OFFSET);
    gate.update(player);
    // And in front of it, out of reach.
    headAt(x, y, z + REACH + 0.05);
    player.head.position.sub(BEAK_OFFSET);
    gate.update(player);
    expect(gate.picked).toBeNull();
    expect(picked).toEqual([]);
  });

  it('is forgotten when a place loads', () => {
    peck('downham-market');
    gate.load(DEF, 'aviary');
    expect(gate.picked).toBeNull();
  });
});

describe('a full place', () => {
  let refused: string[];
  beforeEach(() => {
    refused = [];
    gate.onRefused = (placeId) => refused.push(placeId);
  });

  it('cannot be picked, and says no once for each touch', () => {
    gate.counts = { 'downham-market': LOBBY_SIZE };
    peck('downham-market');
    peck('downham-market');
    expect(gate.picked).toBeNull();
    expect(refused).toEqual(['downham-market']);
    // The beak comes away, and touches again.
    headAt(0, MID_Y, 3);
    gate.update(player);
    peck('downham-market');
    expect(refused).toEqual(['downham-market', 'downham-market']);
    expect(picked).toEqual([]);
  });

  it('can be picked while there is room, and while nobody knows how many are there', () => {
    gate.counts = { 'downham-market': LOBBY_SIZE - 1 };
    peck('downham-market');
    expect(gate.picked).toBe('downham-market');
    gate.load(DEF, 'aviary');
    expect(gate.counts).toBeNull();
    peck('downham-market');
    expect(gate.picked).toBe('downham-market');
    expect(refused).toEqual([]);
  });

  it('stays picked if it fills afterwards', () => {
    peck('downham-market');
    gate.counts = { 'downham-market': LOBBY_SIZE };
    expect(fly(IN_FRONT, BEHIND)).toBe('downham-market');
  });
});

describe('asking how many are in each place', () => {
  it('is worth it only near the gate, where the board can be seen', () => {
    peck('downham-market');
    expect(gate.near(player)).toBe(true);
    headAt(...IN_FRONT);
    expect(gate.near(player)).toBe(true);
    headAt(0, MID_Y, 40);
    expect(gate.near(player)).toBe(false);
    gate.load(undefined, 'pet-show');
    expect(gate.near(player)).toBe(false);
  });
});

describe('flying through the doorway', () => {
  it('leads to the place that was picked', () => {
    peck('downham-market');
    expect(fly(IN_FRONT, BEHIND)).toBe('downham-market');
  });

  it('leads nowhere with nothing picked', () => {
    expect(fly(IN_FRONT, BEHIND)).toBeNull();
  });

  it('leads nowhere beside the opening, or above it', () => {
    peck('downham-market');
    const beside = OPENING.halfWidth + 0.3;
    expect(fly([beside, MID_Y, 1], [beside, MID_Y, OPENING.z - 0.5])).toBeNull();
    expect(fly([0, OPENING.top + 0.5, 1], [0, OPENING.top + 0.5, OPENING.z - 0.5])).toBeNull();
  });

  it('leads nowhere from behind', () => {
    peck('downham-market');
    headAt(...BEHIND);
    gate.update(player);
    expect(fly(BEHIND, IN_FRONT)).toBeNull();
  });

  it('is not set off by the player being put somewhere', () => {
    fly(BEHIND, IN_FRONT);
    // Loading a place forgets where the head was, so a first frame behind the doorway is no crossing.
    gate.load(DEF, 'aviary');
    gate.picked = 'downham-market';
    headAt(...BEHIND);
    expect(gate.update(player)).toBeNull();
  });

  it('does nothing in a place with no gate', () => {
    gate.load(undefined, 'pet-show');
    expect(gate.layout).toBeNull();
    expect(fly(IN_FRONT, BEHIND)).toBeNull();
  });
});

// The gates as they stand in the places, against the real colliders.

const BODY = cfg.bodyRadius.value;
const GATES = [
  // The Aviary has a perch in front of its doorway, to be flown over.
  { name: 'the Aviary', id: 'aviary', def: GATE, content: CONTENT, half: HALF, build: buildScenery, lowest: 1.5 },
  {
    name: 'Downham Market',
    id: 'downham-market',
    def: TOWN_GATE,
    content: TOWN,
    half: TOWN_HALF,
    build: buildTown,
    lowest: OPENING.bottom + BODY + 0.05,
  },
];

describe.each(GATES)('the gate of $name', ({ id, def, content, half, build, lowest }) => {
  let physics: PhysicsWorld;
  const layout = gateLayout(def, id);
  const body = BODY;
  const at = (x: number, y: number, z: number): Vector3 => new Vector3(...fromGate(def, x, y, z));
  const clearance = (p: Vector3, reach: number): number => physics.nearestSurface(p, reach)?.distance ?? Infinity;

  beforeAll(async () => {
    physics = await PhysicsWorld.create();
    build(new StaticBuilder(physics));
    new WorldState(physics).load(content);
    physics.step(DT);
  });

  it('is part of the place, and inside its walls', () => {
    expect(content.gate).toBe(def);
    expect(layout.pictures.length).toBe(PLACES.length - 1);
    for (const { position } of layout.pictures) {
      expect(Math.abs(position[0])).toBeLessThan(half);
      expect(Math.abs(position[2])).toBeLessThan(half);
    }
  });

  it('is flown into heading away from the nest in the Aviary, and the other way everywhere else', () => {
    expect(Math.cos(def.yaw)).toBeCloseTo(id === 'aviary' ? 1 : -1);
  });

  it('seats each arriving player standing on the step, in front of the doorway, in a place of their own', () => {
    expect(layout.arrivals).toHaveLength(LOBBY_SIZE);
    for (const [i, arrival] of layout.arrivals.entries()) {
      const arriving = new Player('p', 'nova');
      const input: MoveInput = {
        head: new Vector3(0, HEAD_Y, 0),
        headForward: new Vector3(0, 0, -1),
        hands: {
          left: { position: new Vector3(-0.1, HEAD_Y - 0.25, -0.1), gripPressed: false },
          right: { position: new Vector3(0.1, HEAD_Y - 0.25, -0.1), gripPressed: false },
        },
      };
      placeAt(arriving, input, cfg, new Vector3(...arrival));
      for (let t = 0; t < 1; t += DT) stepMovement(arriving, input, physics, cfg, DT);
      expect(arriving.movementState, `place ${i}`).toBe('standing');
      expect(arriving.position.y + HEAD_Y - cfg.bodyHeight.value, `place ${i}`).toBeCloseTo(def.position[1] + STEP[1], 1);
      const stood = arriving.position.clone().add(input.head);
      expect(Math.hypot(stood.x - arrival[0], stood.z - arrival[2]), `place ${i}`).toBeLessThan(0.05);
      // In front of the sheet, and nowhere near a picture.
      const head = toGate(def, stood, new Vector3());
      expect(head.z, `place ${i}`).toBeGreaterThan(OPENING.z + 0.5);
      for (const { local } of layout.pictures) {
        expect(Math.hypot(head.x - local[0], head.z - local[2]), `place ${i}`).toBeGreaterThan(1);
      }
      // And not inside anybody else.
      for (const other of layout.arrivals.slice(i + 1)) {
        expect(new Vector3(...other).distanceTo(new Vector3(...arrival)), `place ${i}`).toBeGreaterThan(0.4);
      }
    }
  });

  it('leaves the way through the doorway clear', () => {
    const from = 1.4;
    const inward = at(0, 0, -1).sub(at(0, 0, 0));
    const side = OPENING.halfWidth - body - 0.05;
    for (const x of [-side, 0, side]) {
      for (const y of [lowest, MID_Y, OPENING.top - body - 0.05]) {
        const hit = physics.castSphere(at(x, y, from), inward, 5, body);
        // The body gets far enough for the head, in the middle of it, to be through the sheet.
        expect(hit?.distance ?? Infinity, `${x}, ${y}`).toBeGreaterThan(from - OPENING.z + 0.1);
      }
    }
  });

  it('has a wall behind the doorway, so nobody flies out through it', () => {
    const inward = at(0, 0, -1).sub(at(0, 0, 0));
    expect(physics.castSphere(at(0, MID_Y, 1), inward, 5, body)).not.toBeNull();
  });

  it('hangs every picture clear of anything solid, with room for a parrot to stand at it', () => {
    const stand = body + 0.01;
    // Standing that close, the beak is in reach.
    expect(stand + BEAK_OFFSET.z).toBeLessThan(REACH);
    for (const { placeId, local } of layout.pictures) {
      expect(clearance(at(local[0], local[1], local[2] + 0.02), 0.02), placeId).toBeGreaterThan(0);
      expect(clearance(at(local[0], stand, local[2] + stand), body), placeId).toBeGreaterThanOrEqual(body - 0.001);
    }
  });
});

describe("the test room's gate", () => {
  it('stands inside the room, is flown into as the others are, and shows every place', async () => {
    const testRoom = await lobbyRegistry['test-room']();
    const def = testRoom.content!.gate!;
    expect(Math.cos(def.yaw)).toBeCloseTo(-1);
    const layout = gateLayout(def, 'test-room');
    const corners = [fromGate(def, -STEP[0] / 2, 0, -STEP[2] / 2), fromGate(def, STEP[0] / 2, 0, STEP[2] / 2)];
    for (const [x, , z] of [...corners, ...layout.arrivals, ...layout.pictures.map((p) => p.position)]) {
      expect(Math.abs(x)).toBeLessThan(12);
      expect(Math.abs(z)).toBeLessThan(12);
    }
    expect(layout.pictures.map((p) => p.placeId)).toEqual([...PLACES]);
  });
});
