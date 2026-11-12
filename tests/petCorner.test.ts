import { Vector3 } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PetView, PlayerView } from '../shared/api';
import { founders } from '../shared/founders';
import { CHARACTER_PERCHES, NEST_RADIUS, NEST_Y, PET_CORNER, SPAWN } from '../src/lobbies/aviary/layout';
import { PET_TOUCH, PetCorner } from '../src/pets/PetCorner';

const pet = (id: string, stage: PetView['stage'] = 'hatched'): PetView => ({ id, dna: founders.pip.dna, stage });
const player = (pets: PetView[], followerId: string | null = null): PlayerView => ({
  id: 'p1',
  nickname: 'Alex',
  followerId,
  pets,
});
/** The middle of the pet on a perch, where a beak or hand touches it. */
const middle = (slot: number): Vector3 => new Vector3(...PET_CORNER.perches[slot].position).add(new Vector3(0, 0.15, 0));
const far = new Vector3(0, 100, 0);

let corner: PetCorner;
beforeEach(() => {
  corner = new PetCorner(PET_CORNER);
});

describe('the pet rail in the nest', () => {
  it('has six perches inside the nest, at a height a parrot can reach', () => {
    expect(PET_CORNER.perches).toHaveLength(6);
    for (const { position: [x, y, z] } of PET_CORNER.perches) {
      expect(Math.hypot(x, z)).toBeLessThan(NEST_RADIUS);
      expect(y - NEST_Y).toBeGreaterThan(0.3);
      expect(y - NEST_Y).toBeLessThan(0.7);
    }
  });

  it('spaces the pets so that one touch reaches only one', () => {
    const points = PET_CORNER.perches.map((p) => new Vector3(...p.position));
    for (let i = 1; i < points.length; i++) {
      expect(points[i].distanceTo(points[i - 1])).toBeGreaterThan(2 * PET_TOUCH + 0.05);
    }
  });

  it('keeps well clear of the character perches and the spawn point', () => {
    for (const { position } of PET_CORNER.perches) {
      const at = new Vector3(...position);
      for (const perch of CHARACTER_PERCHES) expect(at.distanceTo(new Vector3(...perch.position))).toBeGreaterThan(2);
      expect(at.distanceTo(new Vector3(...SPAWN))).toBeGreaterThan(2);
    }
  });

  it('runs left to right as seen from the middle of the nest, each pet facing in', () => {
    PET_CORNER.perches.forEach(({ position: [x, , z], yaw }, i) => {
      // A model faces -Z before it is turned; turned by yaw it should face the middle.
      const facing = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      expect(facing.dot(new Vector3(-x, 0, -z).normalize())).toBeCloseTo(1, 5);
      if (i === 0) return;
      const [px, , pz] = PET_CORNER.perches[i - 1].position;
      // Looking out from the middle with +Y up, right is (-z, x) of the way looked.
      const right = new Vector3(-pz, 0, px).normalize();
      expect(new Vector3(x - px, 0, z - pz).dot(right)).toBeGreaterThan(0);
    });
  });
});

describe('who is on the perches', () => {
  it('shows nobody when signed out or with no connection', () => {
    expect(corner.pets).toEqual([]);
    expect(corner.slots()).toEqual([null, null, null, null, null, null]);
    corner.setAccount({ status: 'offline' });
    expect(corner.slots().every((slot) => slot === null)).toBe(true);
    expect(corner.pages).toBe(1);
  });

  it('shows hatched pets six to a page, in the order they were got', () => {
    const pets = Array.from({ length: 8 }, (_, i) => pet(`pet-${i}`));
    corner.setAccount({ status: 'in', player: player([...pets, pet('egg', 'egg')]) });
    expect(corner.pets).toHaveLength(8);
    expect(corner.pages).toBe(2);
    expect(corner.slots().map((p) => p?.id)).toEqual(['pet-0', 'pet-1', 'pet-2', 'pet-3', 'pet-4', 'pet-5']);
    corner.turn(1);
    expect(corner.slots().map((p) => p?.id ?? null)).toEqual(['pet-6', 'pet-7', null, null, null, null]);
    // Round to the first page again, and back the other way.
    corner.turn(1);
    expect(corner.page).toBe(0);
    corner.turn(-1);
    expect(corner.page).toBe(1);
  });

  it('leaves the perch of a pet that is away empty', () => {
    corner.setAccount({ status: 'in', player: player([pet('a'), pet('b'), pet('c')]) });
    corner.away.add('b');
    expect(corner.slots().map((p) => p?.id ?? null)).toEqual(['a', null, 'c', null, null, null]);
    expect(corner.perchOf('b')).toBe(1);
    expect(corner.perchOf('nobody')).toBe(-1);
  });

  it('gives a pet on a later page the perch it shows on', () => {
    corner.setAccount({ status: 'in', player: player(Array.from({ length: 9 }, (_, i) => pet(`pet-${i}`))) });
    expect(corner.perchOf('pet-7')).toBe(1);
  });

  it('goes back to a page that exists when pets are taken away', () => {
    corner.setAccount({ status: 'in', player: player(Array.from({ length: 8 }, (_, i) => pet(`pet-${i}`))) });
    corner.turn(1);
    corner.setAccount({ status: 'in', player: player([pet('pet-0')]) });
    expect(corner.page).toBe(0);
    corner.setAccount({ status: 'out' });
    expect(corner.page).toBe(0);
  });
});

describe('touching the pet corner', () => {
  beforeEach(() => {
    corner.setAccount({ status: 'in', player: player([pet('a'), pet('b'), pet('c')]) });
  });

  it('finds the pet a beak or hand has reached', () => {
    expect(corner.touched([far, far, far])).toBeNull();
    const touch = corner.touched([far, middle(1), far]);
    expect(touch).toEqual({ kind: 'pet', pet: pet('b'), slot: 1 });
    // Just outside the reach is not a touch.
    expect(corner.touched([middle(2).add(new Vector3(0, PET_TOUCH + 0.02, 0))])).toBeNull();
  });

  it('counts one touch once, until the hand has left and come back', () => {
    expect(corner.touched([middle(0)])).not.toBeNull();
    expect(corner.touched([middle(0)])).toBeNull();
    expect(corner.touched([middle(0)])).toBeNull();
    expect(corner.touched([far])).toBeNull();
    expect(corner.touched([middle(0)])).toEqual({ kind: 'pet', pet: pet('a'), slot: 0 });
  });

  it('cannot touch an empty perch or one whose pet is away', () => {
    expect(corner.touched([middle(4)])).toBeNull();
    corner.away.add('a');
    expect(corner.touched([middle(0)])).toBeNull();
  });

  it('has arrows to touch only when there is more than one page', () => {
    const next = new Vector3(...PET_CORNER.next.position);
    const previous = new Vector3(...PET_CORNER.previous.position);
    expect(corner.touched([next])).toBeNull();
    expect(corner.touched([far])).toBeNull();

    corner.setAccount({ status: 'in', player: player(Array.from({ length: 7 }, (_, i) => pet(`pet-${i}`))) });
    expect(corner.touched([next])).toEqual({ kind: 'page', turn: 1 });
    expect(corner.touched([next])).toBeNull();
    expect(corner.touched([previous])).toEqual({ kind: 'page', turn: -1 });
  });

  it('puts the arrows at the ends of the rail, out of reach of the pets', () => {
    for (const arrow of [PET_CORNER.previous, PET_CORNER.next]) {
      const at = new Vector3(...arrow.position);
      for (let slot = 0; slot < 6; slot++) expect(at.distanceTo(middle(slot))).toBeGreaterThan(2 * PET_TOUCH);
    }
    // The arrow for the page before is on the left, beyond the first pet.
    const first = new Vector3(...PET_CORNER.perches[0].position);
    const last = new Vector3(...PET_CORNER.perches[5].position);
    const previous = new Vector3(...PET_CORNER.previous.position);
    expect(previous.distanceTo(first)).toBeLessThan(previous.distanceTo(last));
  });
});
