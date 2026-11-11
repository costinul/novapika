import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildParrotParts, buildStatue } from '../src/characters/parrotGeometry';
import { BACK_PERCH, character, DEFAULT_CHARACTER, PERCH_ORDER, roster } from '../src/characters/roster';
import { PhysicsWorld } from '../src/engine/physics';
import { CHARACTER_PERCHES, CONTENT, SPAWN } from '../src/lobbies/aviary/layout';
import { Player } from '../src/player/Player';
import { ActionLayer } from '../src/world/actions';
import type { Action } from '../src/world/actions';
import { WorldState } from '../src/world/WorldState';

describe('roster', () => {
  it('has the four species, with Nova and Pika as the star cockatiels', () => {
    const species = new Set(Object.values(roster).map((c) => c.species));
    expect([...species].sort()).toEqual(['budgie', 'cockatiel', 'cockatoo', 'macaw']);
    const stars = Object.values(roster).filter((c) => c.star).map((c) => c.id);
    expect(stars.sort()).toEqual(['nova', 'pika']);
    expect(roster.nova.species).toBe('cockatiel');
    expect(roster.pika.species).toBe('cockatiel');
  });

  it('keys every character by its own id and falls back to the default', () => {
    for (const [key, def] of Object.entries(roster)) expect(def.id).toBe(key);
    expect(character('nobody').id).toBe(DEFAULT_CHARACTER);
  });

  it('makes Pika much the same as Nova, told apart by a greyer, stained beak', () => {
    const { nova, pika } = roster;
    // The owner's description: the two are very alike.
    const { beak: novaBeak, beakStain: novaStain, ...novaRest } = nova.colors;
    const { beak: pikaBeak, beakStain: pikaStain, ...pikaRest } = pika.colors;
    expect(pikaRest).toEqual(novaRest);
    expect(pika.crest).toEqual(nova.crest);

    expect(novaStain).toBeUndefined();
    expect(pikaStain).toBeDefined();
    const rgb = (hex: number): number[] => [hex >> 16, (hex >> 8) & 255, hex & 255];
    const spread = (hex: number): number => Math.max(...rgb(hex)) - Math.min(...rgb(hex));
    // Greyer: less colour in it than Nova's pinkish beak, and a little darker.
    expect(spread(pikaBeak)).toBeLessThan(spread(novaBeak));
    expect(rgb(pikaBeak)[0]).toBeLessThan(rgb(novaBeak)[0]);
    // The stain is clearly darker than the beak it sits on.
    expect(rgb(pikaStain!)[0]).toBeLessThan(rgb(pikaBeak)[0] - 50);
  });

  it('gives Nova the colours in her photo', () => {
    const c = roster.nova.colors;
    const rgb = (hex: number): number[] => [hex >> 16, (hex >> 8) & 255, hex & 255];
    const [hr, hg, hb] = rgb(c.head); // lemon yellow head
    expect(hr).toBeGreaterThan(220);
    expect(hg).toBeGreaterThan(190);
    expect(hb).toBeLessThan(120);
    const [cr, cg, cb] = rgb(c.cheek!); // deep orange cheek
    expect(cr).toBeGreaterThan(200);
    expect(cg).toBeLessThan(130);
    expect(cb).toBeLessThan(60);
    const [br, bg, bb] = rgb(c.back); // grey back
    expect(Math.max(br, bg, bb) - Math.min(br, bg, bb)).toBeLessThan(20);
    const [pr, pg, pb] = rgb(c.wingPatch!); // cream patches on the wing
    expect(Math.min(pr, pg, pb)).toBeGreaterThan(200);
    expect(roster.nova.crest!.length).toBeGreaterThan(0.35); // a tall crest
  });

  it('sizes the species from budgie, smallest, to macaw, largest', () => {
    const { budgie, nova, cockatoo, macaw } = roster;
    expect(budgie.scale).toBeLessThan(nova.scale);
    expect(nova.scale).toBeLessThan(cockatoo.scale);
    expect(cockatoo.scale).toBeLessThan(macaw.scale);
  });

  it('gives smaller birds higher voices', () => {
    expect(roster.budgie.voice.pitch).toBeGreaterThan(roster.nova.voice.pitch);
    expect(roster.nova.voice.pitch).toBeGreaterThan(roster.cockatoo.voice.pitch);
    expect(roster.cockatoo.voice.pitch).toBeGreaterThan(roster.macaw.voice.pitch);
  });
});

describe('models', () => {
  it('builds a model for every character within a small triangle count', () => {
    for (const def of Object.values(roster)) {
      const parts = buildParrotParts(def);
      const statue = buildStatue(def);
      expect(!!parts.crest, def.id).toBe(!!def.crest);
      const triangles = statue.attributes.position.count / 3;
      expect(triangles, def.id).toBeGreaterThan(100);
      expect(triangles, def.id).toBeLessThan(2500);
      statue.computeBoundingBox();
      // Stands on the ground, and is about one unit tall before scaling.
      expect(statue.boundingBox!.max.y, def.id).toBeGreaterThan(0.9);
      expect(statue.attributes.color.count).toBe(statue.attributes.position.count);
    }
  });
});

describe('choosing a character in the nest', () => {
  let physics: PhysicsWorld;
  let world: WorldState;
  let actions: ActionLayer;
  let applied: Action[];
  let player: Player;

  beforeAll(async () => {
    physics = await PhysicsWorld.create();
    physics.addStaticBox([0, -0.5, 0], [50, 0.5, 50]);
    world = new WorldState(physics);
    player = new Player('p', DEFAULT_CHARACTER);
    world.players.set(player.id, player);
    world.load(CONTENT);
    actions = new ActionLayer(world);
    applied = [];
    actions.onApplied((a) => applied.push(a));
  });

  const park = (): void => {
    player.head.position.set(0, 20, 0);
    player.hands.left.grip.position.set(-0.3, 20, 0);
    player.hands.right.grip.position.set(0.3, 20, 0);
  };

  it('has a perch for every character, Nova and Pika in the middle', () => {
    const ids = CHARACTER_PERCHES.map((p) => p.characterId).sort();
    expect(ids).toEqual(Object.keys(roster).sort());
    expect([...PERCH_ORDER.slice(1, 3)]).toEqual(['nova', 'pika']);
    expect(roster[BACK_PERCH].scale).toBe(Math.max(...Object.values(roster).map((c) => c.scale)));
    // Every perch is within a short hop of the spawn point.
    for (const perch of CHARACTER_PERCHES) {
      const d = new Vector3(...perch.position).distanceTo(new Vector3(...SPAWN));
      expect(d, perch.id).toBeLessThan(1.6);
    }
  });

  it('turns the player into the parrot whose perch they touch, by hand or beak', () => {
    park();
    world.updateInteractions(actions, 1 / 72);
    expect(player.characterId).toBe('nova');

    const macaw = world.perches.get('perch-macaw')!;
    player.hands.right.grip.position.copy(macaw.center);
    world.updateInteractions(actions, 1 / 72);
    expect(player.characterId).toBe('macaw');
    expect(applied).toContainEqual({ type: 'chooseCharacter', playerId: 'p', characterId: 'macaw' });

    // Holding the hand there does not choose it again and again.
    world.updateInteractions(actions, 1 / 72);
    expect(applied.filter((a) => a.type === 'chooseCharacter')).toHaveLength(1);

    park();
    const pika = world.perches.get('perch-pika')!;
    player.head.position.copy(pika.center).add(new Vector3(0, 0.1, 0.13)); // beak on it
    world.updateInteractions(actions, 1 / 72);
    expect(player.characterId).toBe('pika');
  });

  it('refuses a character that is not in the roster', () => {
    expect(actions.dispatch({ type: 'chooseCharacter', playerId: 'p', characterId: 'dragon' })).toBe(false);
  });

  it('lifts the crest for a stunt', () => {
    player.excitement = 0;
    expect(actions.dispatch({ type: 'stunt', playerId: 'p', name: 'diveBomb' })).toBe(true);
    expect(player.excitement).toBe(1);
  });
});
