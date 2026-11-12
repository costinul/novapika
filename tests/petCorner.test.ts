import { Vector3 } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { PET_CAP } from '../shared/api';
import type { EggView, FriendView, PetView, PlayerView, RequestView } from '../shared/api';
import { founders } from '../shared/founders';
import { CHARACTER_PERCHES, CONTENT, HOW_TO, NEST_RADIUS, NEST_Y, PET_CORNER, SPAWN } from '../src/lobbies/aviary/layout';
import { PET_TOUCH, PetCorner, SMALL_TOUCH } from '../src/pets/PetCorner';
import type { Stand } from '../src/world/types';

const pet = (id: string): PetView => ({ id, dna: founders.pip.dna });
const pets = (count: number, prefix = 'pet'): PetView[] => Array.from({ length: count }, (_, i) => pet(`${prefix}-${i}`));
const player = (own: PetView[], more: Partial<PlayerView> = {}): { status: 'in'; player: PlayerView } => ({
  status: 'in',
  player: { id: 'p1', nickname: 'Alex', followerId: null, pets: own, egg: null, asking: null, asked: [], ...more },
});
const egg: EggView = { id: 'egg', shell: [0xffffff, 0x333333], seeds: 0 };
const request = (myPetId: string, theirPet: PetView, friend = 'Sam'): RequestView => ({
  id: `r-${myPetId}-${theirPet.id}`,
  myPetId,
  friend,
  theirPet,
});
const friend = (nickname: string, own: PetView[]): FriendView => ({ id: nickname, nickname, pets: own });

const at = (stand: Stand, lift = 0): Vector3 => new Vector3(...stand.position).add(new Vector3(0, lift, 0));
/** The middle of the pet on a perch, where a beak or hand touches it. */
const middle = (slot: number): Vector3 => at(PET_CORNER.perches[slot], 0.15);
const heartAt = (index: number): Vector3 => at(PET_CORNER.hearts[index], 0.15);
const far = new Vector3(0, 100, 0);

let corner: PetCorner;
beforeEach(() => {
  corner = new PetCorner(PET_CORNER);
});

describe('the pet corner in the nest', () => {
  it('has six perches on the rail, inside the nest, at a height a parrot can reach', () => {
    expect(PET_CORNER.perches).toHaveLength(6);
    for (const { position: [x, y, z] } of PET_CORNER.perches) {
      expect(Math.hypot(x, z)).toBeLessThan(NEST_RADIUS);
      expect(y - NEST_Y).toBeGreaterThan(0.3);
      expect(y - NEST_Y).toBeLessThan(0.7);
    }
  });

  it('spaces the pets so that one touch reaches only one', () => {
    const points = PET_CORNER.perches.map((p) => at(p));
    for (let i = 1; i < points.length; i++) {
      expect(points[i].distanceTo(points[i - 1])).toBeGreaterThan(2 * PET_TOUCH + 0.05);
    }
    const places = PET_CORNER.board.places.map((p) => at(p));
    for (let i = 0; i < places.length; i++) {
      for (let k = i + 1; k < places.length; k++) {
        expect(places[i].distanceTo(places[k])).toBeGreaterThan(2 * SMALL_TOUCH + 0.02);
      }
    }
  });

  it('runs the rail left to right as seen from the middle of the nest, each pet facing in', () => {
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

  it('puts every station inside the nest and facing its middle', () => {
    const { hearts, board, mail, goodbye } = PET_CORNER;
    const stands = [...hearts, ...board.places, board.previous, board.next, mail.yes, mail.no, goodbye.perch, ...goodbye.pads];
    for (const { position: [x, y, z], yaw } of stands) {
      expect(Math.hypot(x, z)).toBeLessThan(NEST_RADIUS + 0.05);
      expect(y).toBeGreaterThan(NEST_Y);
      expect(y - NEST_Y).toBeLessThan(1.3);
      const facing = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      expect(facing.dot(new Vector3(-x, 0, -z).normalize())).toBeGreaterThan(0.9);
    }
  });

  it('keeps everything that is touched well apart, and clear of the perches for choosing a parrot', () => {
    const { perches, previous, next, hearts, board, mail, goodbye } = PET_CORNER;
    // One point for each thing a hand might reach for, with how far it reaches.
    const things: [string, Vector3, number][] = [
      ...perches.map((p, i): [string, Vector3, number] => [`pet ${i}`, at(p, 0.15), PET_TOUCH]),
      ['rail before', at(previous), PET_TOUCH],
      ['rail after', at(next), PET_TOUCH],
      ...hearts.map((p, i): [string, Vector3, number] => [`heart ${i}`, at(p, 0.15), PET_TOUCH]),
      ...board.places.map((p, i): [string, Vector3, number] => [`friend ${i}`, at(p, 0.1), SMALL_TOUCH]),
      ['friends before', at(board.previous), SMALL_TOUCH],
      ['friends after', at(board.next), SMALL_TOUCH],
      ['yes', at(mail.yes), SMALL_TOUCH],
      ['no', at(mail.no), SMALL_TOUCH],
      ['goodbye', at(goodbye.perch, 0.15), PET_TOUCH],
      ...goodbye.pads.map((p, i): [string, Vector3, number] => [`pad ${i}`, at(p), SMALL_TOUCH]),
      ...CHARACTER_PERCHES.map((p): [string, Vector3, number] => [p.id, at(p, 0.25), 0.26]),
    ];
    for (let i = 0; i < things.length; i++) {
      for (let k = i + 1; k < things.length; k++) {
        const [a, pa, ra] = things[i];
        const [b, pb, rb] = things[k];
        // No point in space touches two things at once.
        expect(pa.distanceTo(pb), `${a} and ${b}`).toBeGreaterThan(ra + rb);
      }
    }
  });

  it('stands the goodbye perch apart: nothing else to touch within a parrot\'s reach of it', () => {
    const perch = at(PET_CORNER.goodbye.perch);
    const others = [...PET_CORNER.perches, ...PET_CORNER.hearts, ...PET_CORNER.board.places, ...CHARACTER_PERCHES];
    for (const other of others) expect(perch.distanceTo(at(other))).toBeGreaterThan(1);
    expect(perch.distanceTo(new Vector3(...SPAWN))).toBeGreaterThan(2.5);
    // The two pads are far enough apart to need a hand each.
    const [left, right] = PET_CORNER.goodbye.pads.map((pad) => at(pad));
    expect(left.distanceTo(right)).toBeGreaterThan(0.6);
    expect(left.distanceTo(right)).toBeLessThan(1);
    // And it does not stand in front of the picture board of the moves.
    expect(perch.distanceTo(new Vector3(...HOW_TO.position))).toBeGreaterThan(0.9);
  });

  it('has an egg cup that takes seeds and millet, between the heart perches', () => {
    const cup = CONTENT.targets.find((target) => target.id === PET_CORNER.eggCup.targetId)!;
    expect(cup.kind).toBe('eggCup');
    expect([...cup.accepts!].sort()).toEqual(['millet', 'seed']);
    expect(cup.position).toEqual(PET_CORNER.eggCup.position);
    const [a, b] = PET_CORNER.hearts.map((heart) => at(heart));
    const between = a.clone().add(b).multiplyScalar(0.5);
    expect(new Vector3(...cup.position).setY(between.y).distanceTo(between)).toBeLessThan(0.4);
  });
});

describe('who is on the rail', () => {
  it('shows nobody when signed out or with no connection', () => {
    expect(corner.pets).toEqual([]);
    expect(corner.slots()).toEqual([null, null, null, null, null, null]);
    corner.setAccount({ status: 'offline' });
    expect(corner.slots().every((slot) => slot === null)).toBe(true);
    expect(corner.pages).toBe(1);
    expect(corner.touched([middle(0), heartAt(0)])).toBeNull();
  });

  it('shows pets six to a page, in the order they were got', () => {
    corner.setAccount(player(pets(8)));
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

  it('leaves the perch of a pet that is out flying, or sitting elsewhere, empty', () => {
    corner.setAccount(player([pet('a'), pet('b'), pet('c'), pet('d')]));
    corner.away.add('b');
    corner.placed.hearts[1] = 'c';
    corner.placed.goodbye = 'd';
    expect(corner.slots().map((p) => p?.id ?? null)).toEqual(['a', null, null, null, null, null]);
    expect(corner.perchOf('b')).toBe(1);
    expect(corner.perchOf('nobody')).toBe(-1);
  });

  it('gives a pet on a later page the perch it shows on', () => {
    corner.setAccount(player(pets(9)));
    expect(corner.perchOf('pet-7')).toBe(1);
  });

  it('goes back to a page that exists when pets are taken away', () => {
    corner.setAccount(player(pets(8)));
    corner.turn(1);
    corner.setAccount(player(pets(1)));
    expect(corner.page).toBe(0);
    corner.setAccount({ status: 'out' });
    expect(corner.page).toBe(0);
  });
});

describe('touching the rail', () => {
  beforeEach(() => {
    corner.setAccount(player([pet('a'), pet('b'), pet('c')]));
  });

  it('finds the pet a beak or hand has reached', () => {
    expect(corner.touched([far, far, far])).toBeNull();
    expect(corner.touched([far, middle(1), far])).toEqual({ kind: 'pet', pet: pet('b'), slot: 1 });
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
    const next = at(PET_CORNER.next);
    const previous = at(PET_CORNER.previous);
    expect(corner.touched([next])).toBeNull();
    expect(corner.touched([far])).toBeNull();

    corner.setAccount(player(pets(7)));
    expect(corner.touched([next])).toEqual({ kind: 'page', turn: 1 });
    expect(corner.touched([next])).toBeNull();
    expect(corner.touched([previous])).toEqual({ kind: 'page', turn: -1 });
  });
});

describe('the heart perches', () => {
  beforeEach(() => {
    corner.setAccount(player([pet('a'), pet('b'), pet('c')]));
  });

  it('can each be touched, empty or not', () => {
    expect(corner.touched([heartAt(0)])).toEqual({ kind: 'heart', index: 0 });
    expect(corner.touched([heartAt(1)])).toEqual({ kind: 'heart', index: 1 });
    expect(corner.touched([heartAt(1)])).toBeNull();
  });

  it('show the pets the player has put there', () => {
    expect(corner.heartSlots()).toEqual([{ kind: 'empty' }, { kind: 'empty' }]);
    corner.placed.hearts[1] = 'b';
    expect(corner.heartSlots()).toEqual([{ kind: 'empty' }, { kind: 'mine', pet: pet('b') }]);
  });

  it('show a friend\'s pet that has been asked for on the free perch, beside the pet it is for', () => {
    const theirs = pet('theirs');
    corner.placed.hearts[1] = 'b';
    corner.setAccount(player([pet('a'), pet('b'), pet('c')], { asking: request('b', theirs) }));
    expect(corner.heartSlots()).toEqual([
      { kind: 'theirs', pet: theirs },
      { kind: 'mine', pet: pet('b') },
    ]);
  });

  it('put the pet a request was made with back on a perch when the game starts again', () => {
    const theirs = pet('theirs');
    // Nothing is on the perches: the game has just started. The server still has the request.
    corner.setAccount(player([pet('a'), pet('b'), pet('c')], { asking: request('c', theirs) }));
    expect(corner.placed.hearts).toEqual(['c', null]);
    expect(corner.heartSlots()[1]).toEqual({ kind: 'theirs', pet: theirs });
    expect(corner.slots().map((p) => p?.id ?? null).slice(0, 3)).toEqual(['a', 'b', null]);
  });

  it('send both parents home once the egg is laid', () => {
    corner.placed.hearts = ['a', 'b'];
    corner.setAccount(player([pet('a'), pet('b'), pet('c')], { egg }));
    expect(corner.placed.hearts).toEqual([null, null]);
    expect(corner.egg).toEqual(egg);
  });

  it('keep a pet that is waiting for a partner through other changes', () => {
    corner.placed.hearts[0] = 'a';
    corner.setAccount(player([pet('a'), pet('b'), pet('c')], { followerId: 'b' }));
    expect(corner.placed.hearts).toEqual(['a', null]);
  });

  it('let go of a pet that is no longer the player\'s', () => {
    corner.placed.hearts = ['a', 'b'];
    corner.placed.goodbye = 'c';
    corner.held = 0.5;
    corner.setAccount(player([pet('a')]));
    expect(corner.placed).toEqual({ hearts: ['a', null], goodbye: null });
    expect(corner.held).toBe(0);
  });

  it('are closed when the player has as many pets as they can have', () => {
    expect(corner.full).toBe(false);
    corner.setAccount(player(pets(PET_CAP)));
    expect(corner.full).toBe(true);
  });
});

describe('the friends\' board', () => {
  const place = (index: number): Vector3 => at(PET_CORNER.board.places[index], 0.1);
  beforeEach(() => {
    corner.setAccount(player([pet('a')]));
  });

  it('shows nothing when there are no friends with pets', () => {
    corner.setFriends([friend('Sam', [])]);
    expect(corner.friendShowing()).toBeNull();
    expect(corner.touched([place(0)])).toBeNull();
  });

  it('shows one friend\'s pets at a time, six to a page, and turns round at the ends', () => {
    corner.setFriends([friend('Sam', pets(8, 's')), friend('Nobody', []), friend('Pat', pets(2, 'p'))]);
    expect(corner.friendPages().map((page) => [page.friend.nickname, page.pets.length])).toEqual([
      ['Sam', 6],
      ['Sam', 2],
      ['Pat', 2],
    ]);
    expect(corner.friendShowing()!.friend.nickname).toBe('Sam');
    corner.turnFriends(1);
    corner.turnFriends(1);
    expect(corner.friendShowing()!.friend.nickname).toBe('Pat');
    corner.turnFriends(1);
    expect(corner.friendPage).toBe(0);
    corner.turnFriends(-1);
    expect(corner.friendShowing()!.friend.nickname).toBe('Pat');
  });

  it('finds the friend\'s pet a hand has reached, and the arrows when there are pages', () => {
    corner.setFriends([friend('Sam', pets(2, 's'))]);
    expect(corner.touched([place(1)])).toEqual({ kind: 'friendPet', pet: pet('s-1'), place: 1 });
    expect(corner.touched([place(4)])).toBeNull();
    expect(corner.touched([at(PET_CORNER.board.next)])).toBeNull();

    corner.setFriends([friend('Sam', pets(2, 's')), friend('Pat', pets(1, 'p'))]);
    expect(corner.touched([far])).toBeNull();
    expect(corner.touched([at(PET_CORNER.board.next)])).toEqual({ kind: 'friendPage', turn: 1 });
    expect(corner.touched([at(PET_CORNER.board.previous)])).toEqual({ kind: 'friendPage', turn: -1 });
  });

  it('stays on a page that exists when a friend\'s pets go', () => {
    corner.setFriends([friend('Sam', pets(8, 's')), friend('Pat', pets(2, 'p'))]);
    corner.turnFriends(-1);
    expect(corner.friendPage).toBe(2);
    corner.setFriends([friend('Sam', pets(2, 's'))]);
    expect(corner.friendPage).toBe(0);
  });

  it('forgets the friends when the player signs out', () => {
    corner.setFriends([friend('Sam', pets(2, 's'))]);
    corner.setAccount({ status: 'out' });
    expect(corner.friends).toEqual([]);
  });
});

describe('a friend\'s request', () => {
  const mail = request('a', pet('theirs'));
  const later = request('b', pet('other'), 'Pat');

  it('is shown one at a time, oldest first, with a yes and a no to touch', () => {
    corner.setAccount(player([pet('a'), pet('b')], { asked: [mail, later] }));
    expect(corner.mail).toEqual(mail);
    expect(corner.touched([at(PET_CORNER.mail.yes)])).toEqual({ kind: 'answer', request: mail, accept: true });
    expect(corner.touched([far])).toBeNull();
    expect(corner.touched([at(PET_CORNER.mail.no)])).toEqual({ kind: 'answer', request: mail, accept: false });
  });

  it('has nothing to touch when nobody has asked', () => {
    corner.setAccount(player([pet('a')]));
    expect(corner.mail).toBeNull();
    expect(corner.touched([at(PET_CORNER.mail.yes)])).toBeNull();
    expect(corner.touched([at(PET_CORNER.mail.no)])).toBeNull();
  });
});

describe('the goodbye perch', () => {
  const [left, right] = PET_CORNER.goodbye.pads.map((pad) => at(pad));
  beforeEach(() => {
    corner.setAccount(player([pet('a'), pet('b')]));
  });

  it('can be touched', () => {
    expect(corner.touched([at(PET_CORNER.goodbye.perch, 0.15)])).toEqual({ kind: 'goodbye' });
  });

  it('needs something on each of its two pads at once', () => {
    expect(corner.padsHeld([far, far, far])).toBe(false);
    expect(corner.padsHeld([far, left, far])).toBe(false);
    expect(corner.padsHeld([far, far, right])).toBe(false);
    expect(corner.padsHeld([far, left, right])).toBe(true);
    expect(corner.padsHeld([far, right, left])).toBe(true);
    // One hand cannot reach both.
    const between = left.clone().add(right).multiplyScalar(0.5);
    expect(corner.padsHeld([between, between, between])).toBe(false);
  });
});
