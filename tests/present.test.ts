import { Vector3 } from 'three';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Present } from '../shared/net';
import { PhysicsWorld } from '../src/engine/physics';
import { Multiplayer } from '../src/net/Multiplayer';
import { Player } from '../src/player/Player';
import { FALL_FROM, FALL_SPEED, FallingPresent, TOUCH_WITHIN } from '../src/present/FallingPresent';
import { ActionLayer } from '../src/world/actions';
import { WorldState } from '../src/world/WorldState';
import { fakeLobby, settle } from './fakeLobby';
import type { FakeLobby } from './fakeLobby';

// A present let go from the sky: how it comes down and what a touch does, and
// then two games in one lobby, joined through the real lobby rules.

const LANDING = new Vector3(4, 0, -6);
const FAR = [new Vector3(50, 0, 50)];
const frames = (present: FallingPresent, seconds: number, points = FAR): (string | null)[] => {
  const asked: (string | null)[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) asked.push(present.frame(1 / 60, points));
  return asked.filter((id) => id !== null);
};

describe('a falling present', () => {
  let present: FallingPresent;
  beforeEach(() => {
    present = new FallingPresent();
  });

  it('is not there until one is let go', () => {
    expect(present.id).toBeNull();
    expect(present.object.visible).toBe(false);
    expect(present.frame(1, [present.position.clone()])).toBeNull();
  });

  it('starts high over its landing place and comes down slowly to rest on it', () => {
    present.show({ id: 'gift-1', age: 0 }, LANDING);
    expect(present.object.visible).toBe(true);
    expect(present.position.y).toBeGreaterThan(LANDING.y + FALL_FROM);
    expect(present.landed).toBe(false);

    frames(present, 5);
    expect(present.position.y).toBeCloseTo(LANDING.y + FALL_FROM - 5 * FALL_SPEED + 0.2, 0);
    // It drifts a little on the way, never far from over its place.
    expect(Math.hypot(present.position.x - LANDING.x, present.position.z - LANDING.z)).toBeLessThan(1.1);

    frames(present, FALL_FROM / FALL_SPEED);
    expect(present.landed).toBe(true);
    expect(present.position.x).toBeCloseTo(LANDING.x, 5);
    expect(present.position.z).toBeCloseTo(LANDING.z, 5);
    // The box sits on the ground, bobbing a little.
    expect(present.position.y).toBeGreaterThan(LANDING.y + 0.2);
    expect(present.position.y).toBeLessThan(LANDING.y + 0.4);
  });

  it('is already down for a player who comes in long after it was let go', () => {
    present.show({ id: 'gift-1', age: 10 * 60_000 }, LANDING);
    expect(present.landed).toBe(true);
    expect(present.position.distanceTo(LANDING)).toBeLessThan(0.4);
  });

  it('asks for the pet when a hand or the beak touches it, in the air or on the ground', () => {
    present.show({ id: 'gift-1', age: 0 }, LANDING);
    const near = (): Vector3[] => [new Vector3(50, 0, 50), present.position.clone().add(new Vector3(TOUCH_WITHIN * 0.9, 0, 0))];
    const outside = (): Vector3[] => [present.position.clone().add(new Vector3(TOUCH_WITHIN * 1.5, 0, 0))];
    expect(present.frame(1 / 60, outside())).toBeNull();
    expect(present.frame(1 / 60, near())).toBe('gift-1');
    // While the touch lasts it asks again only every second or so.
    let asked = 0;
    for (let t = 0; t < 3; t += 1 / 60) if (present.frame(1 / 60, near())) asked++;
    expect(asked).toBeGreaterThanOrEqual(2);
    expect(asked).toBeLessThanOrEqual(3);
  });

  it('does not ask again for a moment after the lobby has said no', () => {
    present.show({ id: 'gift-1', age: 60_000 }, LANDING);
    const touch = (): Vector3[] => [present.position.clone()];
    expect(present.frame(1 / 60, touch())).toBe('gift-1');
    present.refused();
    let asked = 0;
    for (let t = 0; t < 2.5; t += 1 / 60) if (present.frame(1 / 60, touch())) asked++;
    expect(asked).toBe(0);
    for (let t = 0; t < 1; t += 1 / 60) if (present.frame(1 / 60, touch())) asked++;
    expect(asked).toBe(1);
  });

  it('is gone once it has been opened', () => {
    present.show({ id: 'gift-1', age: 0 }, LANDING);
    present.show(null);
    expect(present.id).toBeNull();
    expect(present.object.visible).toBe(false);
    expect(frames(present, 1, [present.position.clone()])).toEqual([]);
  });
});

describe('a present in a lobby with two players', () => {
  let physics: PhysicsWorld;
  let lobby: FakeLobby;
  /** Who the lobby gave which pet. */
  let given: string[];
  beforeAll(async () => {
    physics = await PhysicsWorld.create();
  });

  interface Game {
    net: Multiplayer;
    shown: (Present | null)[];
    opened: [string, boolean][];
    shut: string[];
  }

  function game(id: string, nickname: string): Game {
    const world = new WorldState(physics);
    const local = new Player('local', 'nova');
    world.players.set(local.id, local);
    const g: Game = { net: null!, shown: [], opened: [], shut: [] };
    g.net = new Multiplayer({
      world,
      actions: new ActionLayer(world),
      feathers: null,
      local,
      connect: lobby.as(id, nickname),
      about: () => ({ characterId: local.characterId, followerPetId: null }),
      onRefused: () => {},
      present: {
        show: (present) => void g.shown.push(present),
        opened: (presentId, mine) => void g.opened.push([presentId, mine]),
        shut: (presentId) => void g.shut.push(presentId),
      },
    });
    return g;
  }

  beforeEach(() => {
    given = [];
    lobby = fakeLobby();
    lobby.give = async (member, gift) => {
      if (member.nickname === 'Full') return false;
      given.push(`${member.nickname}:${gift.founderId}`);
      return true;
    };
  });

  it('is shown to both, and goes to the one who touches it first', async () => {
    const alex = game('id-alex', 'Alex');
    const sam = game('id-sam', 'Sam');
    alex.net.join('london');
    sam.net.join('london');
    await settle();
    // Coming in clears whatever was shown before.
    expect(alex.shown.at(-1)).toBeNull();

    lobby.rules.drop({ id: 'gift-1', founderId: 'sunny', droppedAt: 0 });
    expect(alex.shown.at(-1)).toEqual({ id: 'gift-1', age: 0 });
    expect(sam.shown.at(-1)).toEqual({ id: 'gift-1', age: 0 });

    sam.net.sendOpen('gift-1');
    alex.net.sendOpen('gift-1');
    await settle();
    expect(given).toEqual(['Sam:sunny']);
    expect(sam.opened).toEqual([['gift-1', true]]);
    expect(alex.opened).toEqual([['gift-1', false]]);
    expect(alex.shut).toEqual([]);
  });

  it('tells only the player who has no room that it stays shut', async () => {
    const full = game('id-full', 'Full');
    const sam = game('id-sam', 'Sam');
    full.net.join('london');
    sam.net.join('london');
    await settle();
    lobby.rules.drop({ id: 'gift-1', founderId: 'sunny', droppedAt: 0 });
    full.net.sendOpen('gift-1');
    await settle();
    expect(full.shut).toEqual(['gift-1']);
    expect(sam.shut).toEqual([]);
    expect(given).toEqual([]);
  });

  it('is shown to a player who comes in while it waits, and put away when they leave', async () => {
    lobby.rules.drop({ id: 'gift-1', founderId: 'sunny', droppedAt: 0 });
    const alex = game('id-alex', 'Alex');
    alex.net.join('london');
    await settle();
    expect(alex.shown.at(-1)).toMatchObject({ id: 'gift-1' });
    alex.net.leave();
    expect(alex.shown.at(-1)).toBeNull();
  });
});
