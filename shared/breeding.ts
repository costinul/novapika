import { COLOR_GENES, hasSpecial, MARK_GENES, SIZE_RANGE, TAIL_RANGE } from './dna';
import type { Dna, SpecialGene } from './dna';

/** Every chance used in breeding, in one place. Each is from 0 to 1. */
export const breedingOdds = {
  /** The baby has a special gene that both parents have. */
  specialFromBoth: 0.6,
  /** The baby has a special gene that one parent has. */
  specialFromOne: 0.3,
  /** The baby has a special gene that neither parent has. */
  specialFromNeither: 0.03,
  /** A colour is a mix of both parents' instead of a copy of one parent's. */
  blend: 0.25,
  /** A look gene changes a little on its own. */
  mutate: 0.05,
};
export type BreedingOdds = typeof breedingOdds;

/** The furthest a mutation moves one colour channel, out of 255. */
const COLOR_NUDGE = 40;
/** The furthest a mutation changes size or tail length, as a share. */
const NUMBER_NUDGE = 0.1;

const channels = (hex: number): number[] => [hex >> 16, (hex >> 8) & 255, hex & 255];
const fromChannels = (rgb: number[]): number =>
  rgb.reduce((hex, v) => (hex << 8) | Math.min(255, Math.max(0, Math.round(v))), 0);
const clamp = (x: number, [min, max]: readonly [number, number]): number => Math.min(max, Math.max(min, x));

/**
 * The DNA of a baby of two pets. Runs on the server only; `random` gives
 * numbers from 0 up to 1 and is passed in so that tests can repeat a result.
 */
export function breed(
  a: Dna,
  b: Dna,
  random: () => number = Math.random,
  odds: BreedingOdds = breedingOdds,
): Dna {
  const pick = <T>(x: T, y: T): T => (random() < 0.5 ? x : y);
  const mutates = (): boolean => random() < odds.mutate;
  const nudgeColor = (hex: number): number =>
    fromChannels(channels(hex).map((v) => v + (random() * 2 - 1) * COLOR_NUDGE));
  const nudge = (x: number): number => x * (1 + (random() * 2 - 1) * NUMBER_NUDGE);

  const colors = {} as Dna['colors'];
  for (const gene of COLOR_GENES) {
    const x = a.colors[gene];
    const y = b.colors[gene];
    const blended = random() < odds.blend;
    const color = blended ? fromChannels(channels(x).map((v, i) => (v + channels(y)[i]) / 2)) : pick(x, y);
    colors[gene] = mutates() ? nudgeColor(color) : color;
  }

  // A marking comes from one parent, who may not have it.
  const marks: Dna['marks'] = {};
  for (const gene of MARK_GENES) {
    const color = pick(a.marks[gene], b.marks[gene]);
    if (color !== undefined) marks[gene] = mutates() ? nudgeColor(color) : color;
  }

  const size = pick(a.size, b.size);
  const tailLength = pick(a.tailLength, b.tailLength);
  const crest = pick(a.crest, b.crest);

  const special = (gene: SpecialGene): boolean => {
    const parents = Number(hasSpecial(a, gene)) + Number(hasSpecial(b, gene));
    return random() < [odds.specialFromNeither, odds.specialFromOne, odds.specialFromBoth][parents];
  };
  // How many heads or tails: as a parent that has extra ones, or two if neither has.
  const count = (gene: 'heads' | 'tails'): 1 | 2 | 3 => {
    if (!special(gene)) return 1;
    const extra = [a[gene], b[gene]].filter((n) => n > 1);
    return extra.length > 0 ? extra[Math.floor(random() * extra.length)] : 2;
  };

  return {
    colors,
    marks,
    size: clamp(mutates() ? nudge(size) : size, SIZE_RANGE),
    tailLength: clamp(mutates() ? nudge(tailLength) : tailLength, TAIL_RANGE),
    crest: crest && { ...crest },
    glow: special('glow'),
    rainbow: special('rainbow'),
    heads: count('heads'),
    tails: count('tails'),
    eyeDots: special('eyeDots') ? 2 : 1,
  };
}
