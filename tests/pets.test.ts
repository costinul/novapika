import { ShaderLib } from 'three';
import type { BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import type { Dna } from '../shared/dna';
import { founders } from '../shared/founders';
import { buildParrotParts, buildStatue } from '../src/characters/parrotGeometry';
import { parrotMaterial } from '../src/characters/parrotMaterial';
import { PET_SCALE, petCharacter } from '../src/characters/pets';
import { roster } from '../src/characters/roster';

const plain = founders.pip.dna;
const statue = (dna: Dna): BufferGeometry => buildStatue(petCharacter('pet', dna));
const triangles = (g: BufferGeometry): number => g.attributes.position.count / 3;
const width = (g: BufferGeometry): number => {
  g.computeBoundingBox();
  return g.boundingBox!.max.x - g.boundingBox!.min.x;
};
/** How many different colours the model is painted with. */
const colours = (g: BufferGeometry): number => {
  const c = g.attributes.color;
  const seen = new Set<string>();
  for (let i = 0; i < c.count; i++) seen.add(`${c.getX(i).toFixed(2)},${c.getY(i).toFixed(2)},${c.getZ(i).toFixed(2)}`);
  return seen.size;
};
const hasWhite = (g: BufferGeometry): boolean => {
  const c = g.attributes.color;
  for (let i = 0; i < c.count; i++) if (c.getX(i) === 1 && c.getY(i) === 1 && c.getZ(i) === 1) return true;
  return false;
};

describe('a pet as a parrot', () => {
  it('is about 40% of the size of a mid-sized parrot, by its size gene', () => {
    expect(PET_SCALE).toBeCloseTo(0.4);
    expect(petCharacter('p', { ...plain, size: 1 }).scale).toBeCloseTo(0.4);
    expect(petCharacter('p', { ...plain, size: 1.2 }).scale).toBeCloseTo(0.48);
    // Smaller than the smallest parrot a player can be.
    const smallest = Math.min(...Object.values(roster).map((c) => c.scale));
    for (const founder of Object.values(founders)) {
      expect(petCharacter(founder.id, founder.dna).scale).toBeLessThan(smallest);
    }
  });

  it('carries its colours, markings, crest and special genes', () => {
    const def = petCharacter('coco-1', founders.coco.dna);
    expect(def.id).toBe('coco-1');
    expect(def.colors.head).toBe(founders.coco.dna.colors.head);
    expect(def.colors.cheek).toBe(founders.coco.dna.marks.cheek);
    expect(def.colors.facePatch).toBeUndefined();
    expect(def.crest).toEqual(founders.coco.dna.crest);
    expect(petCharacter('p', plain).crest).toBeUndefined();
    expect(petCharacter('p', founders.prism.dna).specials).toEqual({
      glow: true,
      rainbow: true,
      heads: 3,
      tails: 3,
      eyeDots: 2,
    });
  });

  it('gives a bigger pet a lower voice', () => {
    const small = petCharacter('p', { ...plain, size: 0.8 }).voice.pitch;
    const big = petCharacter('p', { ...plain, size: 1.25 }).voice.pitch;
    expect(small).toBeGreaterThan(big);
  });
});

describe('pet models', () => {
  it('builds every fixed pet within a small triangle count', () => {
    for (const founder of Object.values(founders)) {
      const def = petCharacter(founder.id, founder.dna);
      const model = buildStatue(def);
      const parts = buildParrotParts(def);
      expect(triangles(model), founder.id).toBeGreaterThan(100);
      expect(triangles(model), founder.id).toBeLessThan(4000);
      expect(!!parts.crest, founder.id).toBe(!!founder.dna.crest);
      model.computeBoundingBox();
      // Stands on its feet, and is about one unit tall before scaling.
      expect(model.boundingBox!.max.y, founder.id).toBeGreaterThan(0.9);
      expect(model.attributes.color.count).toBe(model.attributes.position.count);
    }
  });

  it('draws extra heads side by side, each with its own crest', () => {
    const crested = founders.coco.dna;
    const one = buildParrotParts(petCharacter('p', crested));
    const two = buildParrotParts(petCharacter('p', { ...crested, heads: 2 }));
    const three = buildParrotParts(petCharacter('p', { ...crested, heads: 3 }));
    expect(triangles(two.head)).toBeGreaterThan(triangles(one.head) * 2);
    expect(triangles(three.head)).toBeGreaterThan(triangles(one.head) * 3);
    expect(width(two.head)).toBeGreaterThan(width(one.head) * 1.4);
    expect(width(three.head)).toBeGreaterThan(width(two.head));
    expect(triangles(two.crest!)).toBe(triangles(one.crest!) * 2);
    expect(triangles(three.crest!)).toBe(triangles(one.crest!) * 3);
    // The body is the same whatever the number of heads.
    expect(triangles(two.body)).toBe(triangles(one.body));
  });

  it('draws extra tails fanned out to the sides', () => {
    const one = buildParrotParts(petCharacter('p', plain)).body;
    const two = buildParrotParts(petCharacter('p', { ...plain, tails: 2 })).body;
    const three = buildParrotParts(petCharacter('p', { ...plain, tails: 3 })).body;
    const perTail = triangles(two) - triangles(one);
    expect(perTail).toBeGreaterThan(0);
    expect(triangles(three) - triangles(two)).toBe(perTail);
    expect(width(two)).toBeGreaterThan(width(one));
    expect(width(three)).toBeGreaterThan(width(two));
  });

  it('draws two-dot eyes as a pale eye with two pupils', () => {
    const one = statue(plain);
    const two = statue({ ...plain, eyeDots: 2 });
    expect(hasWhite(one)).toBe(false);
    expect(hasWhite(two)).toBe(true);
    // One eye shape a side becomes three: the pale eye and two pupils.
    expect(triangles(two)).toBeGreaterThan(triangles(one));
  });

  it('draws the ultra mythical pet tiny, with ten heads, a third eye on each, and ten tails in one fan', () => {
    const sunny = founders.sunny.dna;
    const def = petCharacter('s', sunny);
    expect(def.scale).toBeLessThan(PET_SCALE / 2);
    expect(def.specials).toMatchObject({ heads: 10, tails: 10, sun: true, thirdEye: true });

    const ten = buildParrotParts(def);
    const three = buildParrotParts(petCharacter('s', { ...sunny, heads: 3, tails: 3 }));
    const blind = buildParrotParts(petCharacter('s', { ...sunny, thirdEye: false }));
    // The heads fan out wider than three do, and no head is below the body's top.
    expect(width(ten.head)).toBeGreaterThan(width(three.head));
    // The third eye is the same two shapes on every one of the ten heads.
    const eyes = triangles(ten.head) - triangles(blind.head);
    expect(eyes).toBeGreaterThan(0);
    expect(eyes % 10).toBe(0);
    expect(hasWhite(ten.head)).toBe(true);
    expect(hasWhite(blind.head)).toBe(false);

    // Ten tails: seven more than three, each the same three feathers.
    const perTail = (triangles(ten.body) - triangles(three.body)) / 7;
    expect(Number.isInteger(perTail) && perTail > 0).toBe(true);
    // They spread into a fan behind the bird, and do not wrap round to its front.
    ten.body.computeBoundingBox();
    expect(width(ten.body)).toBeGreaterThan(width(three.body));
    expect(ten.body.boundingBox!.min.z).toBeGreaterThan(-0.3);
  });

  it('draws the god mythical pet tinier still, with twenty heads on necks, a crest on each, and fifteen tails', () => {
    const halo = founders.halo.dna;
    const def = petCharacter('h', halo);
    expect(def.scale).toBeLessThan(petCharacter('s', founders.sunny.dna).scale);
    expect(def.specials).toMatchObject({ glow: true, rainbow: false, heads: 20, tails: 15 });

    const twenty = buildParrotParts(def);
    const one = buildParrotParts(petCharacter('h', { ...halo, heads: 1, tails: 1 }));
    const ten = buildParrotParts(petCharacter('h', { ...halo, heads: 10, tails: 10 }));
    expect(triangles(twenty.crest!)).toBe(triangles(one.crest!) * 20);
    // The heads rise higher than ten do. Each is the same head and neck.
    twenty.head.computeBoundingBox();
    ten.head.computeBoundingBox();
    expect(twenty.head.boundingBox!.max.y).toBeGreaterThan(ten.head.boundingBox!.max.y);
    expect(triangles(twenty.head) % 20).toBe(0);
    // Fifteen tails: five more than ten, in a fan that stays behind the bird.
    const perTail = (triangles(twenty.body) - triangles(ten.body)) / 5;
    expect(Number.isInteger(perTail) && perTail > 0).toBe(true);
    twenty.body.computeBoundingBox();
    expect(twenty.body.boundingBox!.min.z).toBeGreaterThan(-0.3);
    // It glows as any glowing pet does.
    expect(parrotMaterial(def)).toBe(parrotMaterial(petCharacter('p', { ...founders.pip.dna, glow: true })));
  });

  it('shines the ultra mythical pet with a material of its own', () => {
    const def = petCharacter('s', founders.sunny.dna);
    expect(parrotMaterial(def)).not.toBe(parrotMaterial(petCharacter('p', founders.prism.dna)));
    expect(parrotMaterial(def)).toBe(parrotMaterial(petCharacter('t', { ...founders.sunny.dna, heads: 1 })));
  });

  it('paints a rainbow pet in bands of many colours', () => {
    expect(colours(statue(plain))).toBeLessThan(15);
    expect(colours(statue({ ...plain, rainbow: true }))).toBeGreaterThan(60);
  });

  it('leaves the parrots players can be as they were', () => {
    for (const def of Object.values(roster)) {
      expect(def.specials, def.id).toBeUndefined();
      expect(parrotMaterial(def)).toBe(parrotMaterial(roster.nova));
    }
  });
});

describe('pet materials', () => {
  const pet = (genes: Partial<Dna>) => petCharacter('p', { ...plain, ...genes });

  it('shares one material between pets with the same shimmer', () => {
    expect(parrotMaterial(pet({}))).toBe(parrotMaterial(roster.nova));
    expect(parrotMaterial(pet({ glow: true }))).toBe(parrotMaterial(pet({ glow: true, heads: 3 })));
    const four = new Set([
      parrotMaterial(pet({})),
      parrotMaterial(pet({ glow: true })),
      parrotMaterial(pet({ rainbow: true })),
      parrotMaterial(pet({ glow: true, rainbow: true })),
    ]);
    expect(four.size).toBe(4);
  });

  it('adds the glow and the rainbow to the shader of this version of three.js', () => {
    const compile = (genes: Partial<Dna>): string => {
      const material = parrotMaterial(pet(genes));
      const shader = { uniforms: {} as Record<string, unknown>, fragmentShader: ShaderLib.lambert.fragmentShader };
      material.onBeforeCompile(shader as never, null as never);
      if (genes.glow || genes.rainbow) expect(shader.uniforms.shimmerTime).toBeDefined();
      return shader.fragmentShader;
    };
    expect(compile({})).toBe(ShaderLib.lambert.fragmentShader);
    const glow = compile({ glow: true });
    expect(glow).toContain('uniform float shimmerTime');
    expect(glow).toContain('totalEmissiveRadiance +=');
    expect(glow).not.toContain('float turn');
    const rainbow = compile({ rainbow: true });
    expect(rainbow).toContain('float turn');
    expect(rainbow).not.toContain('totalEmissiveRadiance +=');
    const both = compile({ glow: true, rainbow: true });
    expect(both).toContain('float turn');
    expect(both).toContain('totalEmissiveRadiance +=');
  });
});
