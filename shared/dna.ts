// A pet's DNA: everything that decides how it looks. It is plain data with no
// imports, so the game, the server and the tests all use the same rules.

/** Colours every pet has, as 0xRRGGBB. */
export const COLOR_GENES = [
  'head',
  'back',
  'chest',
  'belly',
  'wing',
  'wingTip',
  'tail',
  'beak',
  'feet',
  'eye',
] as const;
export type ColorGene = (typeof COLOR_GENES)[number];

/** Markings a pet may or may not have, each a colour as 0xRRGGBB. */
export const MARK_GENES = [
  'wingPatch',
  'cheek',
  'eyeRing',
  'facePatch',
  'headStripes',
  'neckSmudge',
  'beakStain',
] as const;
export type MarkGene = (typeof MARK_GENES)[number];

export interface CrestGene {
  color: number;
  /** Length of the longest feather, as a share of the bird's height. */
  length: number;
  feathers: number;
  /** Feather width at the base, as a share of the bird's height. */
  width: number;
}

/** The five special genes. The more of them a pet has, the rarer it is. */
export const SPECIAL_GENES = ['glow', 'rainbow', 'heads', 'tails', 'eyeDots'] as const;
export type SpecialGene = (typeof SPECIAL_GENES)[number];

export interface Dna {
  // Look genes.
  colors: Record<ColorGene, number>;
  marks: Partial<Record<MarkGene, number>>;
  /** Size against an average pet. */
  size: number;
  /** Tail length as a share of the bird's height. */
  tailLength: number;
  crest: CrestGene | null;

  // Special genes. Each counts as "on" when it is not at its first value.
  glow: boolean;
  rainbow: boolean;
  heads: 1 | 2 | 3;
  tails: 1 | 2 | 3;
  eyeDots: 1 | 2;
}

/** Limits a bred pet's size and tail length stay within. */
export const SIZE_RANGE = [0.8, 1.25] as const;
export const TAIL_RANGE = [0.3, 1] as const;

export function hasSpecial(dna: Dna, gene: SpecialGene): boolean {
  const value = dna[gene];
  return typeof value === 'boolean' ? value : value > 1;
}

/** Rarity, from the most common to the rarest. */
export const TIERS = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythical'] as const;
export type Tier = (typeof TIERS)[number];

/** A pet's tier is the number of special genes it has. It is never stored. */
export function tierOf(dna: Dna): Tier {
  return TIERS[SPECIAL_GENES.filter((gene) => hasSpecial(dna, gene)).length];
}
