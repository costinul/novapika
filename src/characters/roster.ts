import type { CharacterDef } from './types';

const COCKATIEL_VOICE = { pitch: 2300, wave: 'sine', notes: 2, slide: 1.45 } as const;

/**
 * Every parrot the player can be. Nova and Pika, the family's two female
 * cockatiels, are the stars. To add a bird, add an entry here.
 */
export const roster: Record<string, CharacterDef> = {
  // Nova is a pied cockatiel, matched to the owner's photo of her: lemon
  // yellow head and tall crest, deep orange cheeks with a grey smudge behind
  // them, a pale pinkish beak, grey back and chest band, cream patches on the
  // wings and a yellow belly.
  nova: {
    id: 'nova',
    name: 'Nova',
    species: 'cockatiel',
    star: true,
    scale: 0.85,
    tail: 0.62,
    colors: {
      head: 0xf8dc48,
      back: 0x6e6a73,
      chest: 0x77727b,
      belly: 0xf1dc6a,
      wing: 0x67636c,
      wingPatch: 0xf4eedb,
      wingTip: 0x5a565f,
      tail: 0x7a7680,
      beak: 0xcdb3b6,
      feet: 0xd9a6a0,
      eye: 0x16121a,
      eyeRing: 0xd8d2d6,
      cheek: 0xe9601a,
      neckSmudge: 0x8c8790,
    },
    crest: { color: 0xf7e25c, length: 0.44, feathers: 7, width: 0.06 },
    voice: COCKATIEL_VOICE,
  },

  // Placeholder until the owner sends Pika's colours: a normal grey hen, so
  // the two are easy to tell apart. Grey all over, a soft yellow-grey face,
  // duller cheeks and a white bar on the wing.
  pika: {
    id: 'pika',
    name: 'Pika',
    species: 'cockatiel',
    star: true,
    scale: 0.85,
    tail: 0.62,
    colors: {
      head: 0xa9a48f,
      back: 0x7d7a80,
      chest: 0x8a868c,
      belly: 0x8f8b90,
      wing: 0x6f6c73,
      wingPatch: 0xf2f0ea,
      wingTip: 0x5b585f,
      tail: 0x6c6970,
      beak: 0x7f7a80,
      feet: 0xb0898a,
      eye: 0x16121a,
      eyeRing: 0xbdb8bb,
      cheek: 0xd9793a,
    },
    crest: { color: 0x8f8b83, length: 0.38, feathers: 6, width: 0.05 },
    voice: { ...COCKATIEL_VOICE, pitch: 2550 },
  },

  budgie: {
    id: 'budgie',
    name: 'Budgie',
    species: 'budgie',
    scale: 0.62,
    tail: 0.5,
    colors: {
      head: 0xf6e04a,
      headStripes: 0x2c2c30,
      back: 0x9ad13c,
      chest: 0x57c44a,
      belly: 0x57c44a,
      wing: 0xb8cf3a,
      wingTip: 0x34343a,
      tail: 0x2c63b8,
      beak: 0xe6b84a,
      feet: 0xa8a2b8,
      eye: 0x14141a,
      cheek: 0x6a4fd0,
    },
    voice: { pitch: 3400, wave: 'triangle', notes: 4, slide: 1.2 },
  },

  macaw: {
    id: 'macaw',
    name: 'Macaw',
    species: 'macaw',
    scale: 1.35,
    tail: 0.95,
    colors: {
      head: 0xe0252b,
      back: 0xd8222a,
      chest: 0xe0252b,
      belly: 0xd8222a,
      wing: 0xf2c61e,
      wingPatch: 0xe0252b,
      wingTip: 0x1f55c4,
      tail: 0xc91f2c,
      beak: 0x2a2a2e,
      feet: 0x55525a,
      eye: 0x16121a,
      facePatch: 0xf6f1ea,
    },
    voice: { pitch: 720, wave: 'sawtooth', notes: 1, slide: 0.8 },
  },

  cockatoo: {
    id: 'cockatoo',
    name: 'Cockatoo',
    species: 'cockatoo',
    scale: 1.12,
    tail: 0.34,
    colors: {
      head: 0xfbfaf4,
      back: 0xf7f6ef,
      chest: 0xfbfaf4,
      belly: 0xfbfaf4,
      wing: 0xf3f1e8,
      wingTip: 0xf7ecb0,
      tail: 0xf6f0d2,
      beak: 0x35353b,
      feet: 0x56545c,
      eye: 0x16121a,
      eyeRing: 0xcfe0ee,
    },
    crest: { color: 0xf6d53a, length: 0.5, feathers: 8, width: 0.085 },
    voice: { pitch: 1250, wave: 'square', notes: 2, slide: 1.3 },
  },
};

/** Parrots seen only in the lobby's flock, not offered on a perch. */
export const flockOnly: Record<string, CharacterDef> = {
  skyBudgie: {
    ...roster.budgie,
    id: 'skyBudgie',
    name: 'Sky budgie',
    colors: {
      ...roster.budgie.colors,
      head: 0xf7f6ee,
      back: 0x8fc4ee,
      chest: 0x5aa9f0,
      belly: 0x5aa9f0,
      wing: 0xcfe3f2,
      tail: 0x2a4fa8,
    },
    voice: { ...roster.budgie.voice, pitch: 3700 },
  },
};

/** Order of the perches in the nest. Nova and Pika take the middle two. */
export const PERCH_ORDER = ['budgie', 'nova', 'pika', 'cockatoo'] as const;
/** The macaw, the biggest, has a tall perch behind them. */
export const BACK_PERCH = 'macaw';

export const DEFAULT_CHARACTER = 'nova';

export function character(id: string): CharacterDef {
  return roster[id] ?? flockOnly[id] ?? roster[DEFAULT_CHARACTER];
}
