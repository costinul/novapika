import { describe, expect, it } from 'vitest';
import { breed, breedingOdds } from '../shared/breeding';
import { COLOR_GENES, hasSpecial, MARK_GENES, SIZE_RANGE, SPECIAL_GENES, TAIL_RANGE, tierOf, TIERS } from '../shared/dna';
import { founders } from '../shared/founders';

/** A random that gives the same numbers every run (mulberry32). */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const { pip, sky, coco, ember, tango, prism } = founders;

describe('tiers', () => {
  it('counts the special genes, from common with none to mythical with all five', () => {
    expect(tierOf(pip.dna)).toBe('common');
    expect(tierOf({ ...pip.dna, glow: true })).toBe('uncommon');
    expect(tierOf({ ...pip.dna, glow: true, tails: 2 })).toBe('rare');
    expect(tierOf({ ...pip.dna, glow: true, tails: 3, heads: 2 })).toBe('epic');
    expect(tierOf({ ...pip.dna, glow: true, tails: 2, heads: 3, eyeDots: 2 })).toBe('legendary');
    expect(tierOf({ ...pip.dna, glow: true, tails: 2, heads: 2, eyeDots: 2, rainbow: true })).toBe('mythical');
  });
});

describe('fixed pets', () => {
  it('keys each by its own id and has at least one for every tier', () => {
    for (const [key, founder] of Object.entries(founders)) expect(founder.id).toBe(key);
    const tiers = new Set(Object.values(founders).map((f) => tierOf(f.dna)));
    expect([...tiers].sort()).toEqual([...TIERS].sort());
  });

  it('gives the mythical all five: glow, rainbow, several heads, several tails, two-dot eyes', () => {
    const { dna } = prism;
    expect(dna.glow && dna.rainbow).toBe(true);
    expect(dna.heads).toBeGreaterThan(1);
    expect(dna.tails).toBeGreaterThan(1);
    expect(dna.eyeDots).toBe(2);
  });
});

describe('breeding', () => {
  /** Share of many babies that pass a test. */
  const share = (a: typeof pip, b: typeof pip, test: (tier: string) => boolean): number => {
    const random = seeded(11);
    const runs = 20000;
    let hits = 0;
    for (let i = 0; i < runs; i++) if (test(tierOf(breed(a.dna, b.dna, random)))) hits++;
    return hits / runs;
  };

  it('gives the same baby for the same random numbers', () => {
    expect(breed(coco.dna, tango.dna, seeded(3))).toEqual(breed(coco.dna, tango.dna, seeded(3)));
    expect(breed(coco.dna, tango.dna, seeded(3))).not.toEqual(breed(coco.dna, tango.dna, seeded(4)));
  });

  it('hatches a mythical from two mythicals about 8% of the time', () => {
    const mythical = share(prism, prism, (tier) => tier === 'mythical');
    expect(mythical).toBeGreaterThan(0.065);
    expect(mythical).toBeLessThan(0.09);
  });

  it('hatches something better than common from two commons about 14% of the time', () => {
    const better = share(pip, sky, (tier) => tier !== 'common');
    expect(better).toBeGreaterThan(0.125);
    expect(better).toBeLessThan(0.155);
  });

  it('passes on a special gene that one parent has about 30% of the time', () => {
    const glowing = share(ember, pip, (tier) => tier !== 'common');
    // Glow at 30%, or one of the other four at 3% each.
    const expected = 1 - 0.7 * 0.97 ** 4;
    expect(Math.abs(glowing - expected)).toBeLessThan(0.015);
  });

  it('takes every look gene from one parent or the other when nothing blends or mutates', () => {
    const odds = { ...breedingOdds, blend: 0, mutate: 0 };
    const random = seeded(5);
    for (let i = 0; i < 200; i++) {
      const baby = breed(coco.dna, tango.dna, random, odds);
      for (const gene of COLOR_GENES) {
        expect([coco.dna.colors[gene], tango.dna.colors[gene]]).toContain(baby.colors[gene]);
      }
      for (const gene of MARK_GENES) {
        expect([coco.dna.marks[gene], tango.dna.marks[gene]]).toContain(baby.marks[gene]);
      }
      expect([coco.dna.size, tango.dna.size]).toContain(baby.size);
      expect([coco.dna.tailLength, tango.dna.tailLength]).toContain(baby.tailLength);
      expect([coco.dna.crest, tango.dna.crest]).toContainEqual(baby.crest);
    }
  });

  it('blends a colour to half way between the parents', () => {
    const odds = { ...breedingOdds, blend: 1, mutate: 0 };
    const baby = breed(
      { ...pip.dna, colors: { ...pip.dna.colors, head: 0x204060 } },
      { ...pip.dna, colors: { ...pip.dna.colors, head: 0x4080a0 } },
      seeded(1),
      odds,
    );
    expect(baby.colors.head).toBe(0x306080);
  });

  it('keeps mutated genes within sensible limits', () => {
    const odds = { ...breedingOdds, mutate: 1 };
    const random = seeded(9);
    let changed = 0;
    for (let i = 0; i < 300; i++) {
      const baby = breed(prism.dna, prism.dna, random, odds);
      for (const gene of COLOR_GENES) {
        expect(baby.colors[gene]).toBeGreaterThanOrEqual(0);
        expect(baby.colors[gene]).toBeLessThanOrEqual(0xffffff);
        expect(Number.isInteger(baby.colors[gene])).toBe(true);
      }
      expect(baby.size).toBeGreaterThanOrEqual(SIZE_RANGE[0]);
      expect(baby.size).toBeLessThanOrEqual(SIZE_RANGE[1]);
      expect(baby.tailLength).toBeGreaterThanOrEqual(TAIL_RANGE[0]);
      expect(baby.tailLength).toBeLessThanOrEqual(TAIL_RANGE[1]);
      if (baby.colors.back !== prism.dna.colors.back) changed++;
    }
    expect(changed).toBeGreaterThan(250);
  });

  it('copies the number of extra heads and tails from a parent that has them', () => {
    const random = seeded(2);
    const twoHeads = { ...pip.dna, heads: 2 as const };
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const baby = breed(prism.dna, twoHeads, random);
      seen.add(baby.heads);
      // Tails come from Prism, who has three, or not at all.
      expect([1, 3]).toContain(baby.tails);
    }
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('gives two heads or tails when they appear from nowhere', () => {
    const odds = { ...breedingOdds, specialFromNeither: 1 };
    const baby = breed(pip.dna, sky.dna, seeded(1), odds);
    expect(baby.heads).toBe(2);
    expect(baby.tails).toBe(2);
    expect(SPECIAL_GENES.every((gene) => hasSpecial(baby, gene))).toBe(true);
  });

  it('leaves the parents as they were', () => {
    const before = JSON.stringify([coco.dna, prism.dna]);
    const baby = breed(coco.dna, prism.dna, seeded(6));
    if (baby.crest) baby.crest.length = 99;
    baby.colors.head = 0;
    expect(JSON.stringify([coco.dna, prism.dna])).toBe(before);
  });
});
