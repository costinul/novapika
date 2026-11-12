import type { Dna } from './dna';

export interface Founder {
  id: string;
  name: string;
  dna: Dna;
}

const EYE = 0x16121a;
/** No special genes. */
const PLAIN = { glow: false, rainbow: false, heads: 1, tails: 1, eyeDots: 1 } as const;

/**
 * The fixed pets, each with its own hand-written DNA. The owner gives them to
 * players on the admin page, and every other pet is bred from them. There is
 * at least one for each tier. To add a fixed pet, add an entry here.
 * Only a fixed pet can be ultra mythical or god mythical: breeding never makes one.
 */
export const founders: Record<string, Founder> = {
  // --- Common: no special genes ---------------------------------------------
  pip: {
    id: 'pip',
    name: 'Pip',
    dna: {
      colors: {
        head: 0xf6e04a,
        back: 0x9ad13c,
        chest: 0x57c44a,
        belly: 0x57c44a,
        wing: 0xb8cf3a,
        wingTip: 0x34343a,
        tail: 0x2c63b8,
        beak: 0xe6b84a,
        feet: 0xa8a2b8,
        eye: EYE,
      },
      marks: { headStripes: 0x2c2c30, cheek: 0x6a4fd0 },
      size: 0.9,
      tailLength: 0.5,
      crest: null,
      ...PLAIN,
    },
  },

  sky: {
    id: 'sky',
    name: 'Sky',
    dna: {
      colors: {
        head: 0xf7f6ee,
        back: 0x8fc4ee,
        chest: 0x5aa9f0,
        belly: 0x5aa9f0,
        wing: 0xcfe3f2,
        wingTip: 0x34343a,
        tail: 0x2a4fa8,
        beak: 0xe6b84a,
        feet: 0xa8a2b8,
        eye: EYE,
      },
      marks: { headStripes: 0x2c2c30, cheek: 0x3a4fc0 },
      size: 0.9,
      tailLength: 0.5,
      crest: null,
      ...PLAIN,
    },
  },

  coco: {
    id: 'coco',
    name: 'Coco',
    dna: {
      colors: {
        head: 0xf8dc48,
        back: 0x8a8690,
        chest: 0x9a96a0,
        belly: 0xa9a5ae,
        wing: 0x7d7983,
        wingTip: 0x5a565f,
        tail: 0x7a7680,
        beak: 0xbfb3b6,
        feet: 0xd9a6a0,
        eye: EYE,
      },
      marks: { wingPatch: 0xf4eedb, cheek: 0xe9601a },
      size: 1,
      tailLength: 0.62,
      crest: { color: 0xf7e25c, length: 0.4, feathers: 6, width: 0.06 },
      ...PLAIN,
    },
  },

  // --- Uncommon: one special gene --------------------------------------------
  ember: {
    id: 'ember',
    name: 'Ember',
    dna: {
      colors: {
        head: 0xff5a2a,
        back: 0xd8321e,
        chest: 0xff7a2e,
        belly: 0xffb03a,
        wing: 0xc9281c,
        wingTip: 0x7a1410,
        tail: 0xb81e16,
        beak: 0x2a2a2e,
        feet: 0x55525a,
        eye: EYE,
      },
      marks: { wingPatch: 0xff9a2e },
      size: 1.05,
      tailLength: 0.7,
      crest: { color: 0xffc23a, length: 0.36, feathers: 5, width: 0.07 },
      ...PLAIN,
      glow: true,
    },
  },

  // --- Rare: two special genes -----------------------------------------------
  tango: {
    id: 'tango',
    name: 'Tango',
    dna: {
      colors: {
        head: 0x1fb5a8,
        back: 0x168f8a,
        chest: 0x2fd0b8,
        belly: 0xf05a9a,
        wing: 0x127a80,
        wingTip: 0x0c4f5a,
        tail: 0xe0408a,
        beak: 0xf2c14e,
        feet: 0x8a7f90,
        eye: EYE,
      },
      marks: { cheek: 0xffd84a },
      size: 1,
      tailLength: 0.75,
      crest: null,
      ...PLAIN,
      tails: 2,
      eyeDots: 2,
    },
  },

  // --- Epic: three special genes ---------------------------------------------
  trio: {
    id: 'trio',
    name: 'Trio',
    dna: {
      colors: {
        head: 0x9b6bea,
        back: 0x6a45c0,
        chest: 0xb48cf5,
        belly: 0xd7c2fb,
        wing: 0x5a38a8,
        wingTip: 0x2f1d66,
        tail: 0x7a52d8,
        beak: 0xf0e6d0,
        feet: 0x8a7f90,
        eye: EYE,
      },
      marks: { eyeRing: 0xf7f3ea },
      size: 1.1,
      tailLength: 0.55,
      crest: { color: 0xe9d8ff, length: 0.3, feathers: 4, width: 0.06 },
      ...PLAIN,
      heads: 3,
      tails: 2,
      eyeDots: 2,
    },
  },

  // --- Legendary: four special genes -----------------------------------------
  aurora: {
    id: 'aurora',
    name: 'Aurora',
    dna: {
      colors: {
        head: 0xdff6ff,
        back: 0x9fe0f0,
        chest: 0xc8f0e0,
        belly: 0xf0f8d8,
        wing: 0x8fd0f0,
        wingTip: 0x5a8fd8,
        tail: 0xa8e8d0,
        beak: 0xf6d0d8,
        feet: 0xc0b0c0,
        eye: EYE,
      },
      marks: {},
      size: 1.15,
      tailLength: 0.85,
      crest: { color: 0xffffff, length: 0.42, feathers: 6, width: 0.06 },
      ...PLAIN,
      glow: true,
      rainbow: true,
      tails: 3,
      eyeDots: 2,
    },
  },

  // --- Mythical: all five special genes --------------------------------------
  prism: {
    id: 'prism',
    name: 'Prism',
    dna: {
      colors: {
        head: 0xffffff,
        back: 0xf4f0e0,
        chest: 0xffffff,
        belly: 0xfff4c8,
        wing: 0xf0e8d0,
        wingTip: 0xf2c14e,
        tail: 0xffe9a0,
        beak: 0xf2c14e,
        feet: 0xd9b060,
        eye: EYE,
      },
      marks: {},
      size: 1.2,
      tailLength: 0.95,
      crest: { color: 0xffd84a, length: 0.5, feathers: 8, width: 0.07 },
      glow: true,
      rainbow: true,
      heads: 3,
      tails: 3,
      eyeDots: 2,
    },
  },

  // --- Ultra mythical: a tiny rainbow sun, with ten heads, ten tails and a third eye ---
  sunny: {
    id: 'sunny',
    name: 'Sunny',
    dna: {
      colors: {
        head: 0xfff6c8,
        back: 0xffd84a,
        chest: 0xffffff,
        belly: 0xffe9a0,
        wing: 0xffc23a,
        wingTip: 0xff8a2a,
        tail: 0xffd84a,
        beak: 0xff9a2e,
        feet: 0xf2c14e,
        eye: EYE,
      },
      marks: {},
      // Very small: less than half of the smallest pet that can be bred.
      size: 0.38,
      tailLength: 0.8,
      crest: null,
      glow: true,
      rainbow: true,
      heads: 10,
      tails: 10,
      eyeDots: 1,
      sun: true,
      thirdEye: true,
    },
  },

  // --- God mythical: tinier still, glowing white and gold, with twenty heads and fifteen tails ---
  halo: {
    id: 'halo',
    name: 'Halo',
    dna: {
      colors: {
        head: 0xffffff,
        back: 0xf4f0e0,
        chest: 0xffffff,
        belly: 0xfff4c8,
        wing: 0xf0e8d0,
        wingTip: 0xf2c14e,
        tail: 0xffe9a0,
        beak: 0xf2c14e,
        feet: 0xd9b060,
        eye: EYE,
      },
      marks: {},
      // Smaller than the ultra mythical pet.
      size: 0.28,
      tailLength: 0.8,
      // Two feathers only: there is a crest on each of its twenty heads.
      crest: { color: 0xffd84a, length: 0.5, feathers: 2, width: 0.07 },
      glow: true,
      rainbow: false,
      heads: 20,
      tails: 15,
      eyeDots: 1,
      god: true,
    },
  },
};
