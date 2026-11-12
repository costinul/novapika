import type { Dna } from '../../shared/dna';
import type { CharacterDef } from './types';

/** Size of an average pet against a mid-sized parrot. */
export const PET_SCALE = 0.4;

/** The parrot that a pet's DNA describes, for the parrot builder to draw. */
export function petCharacter(id: string, dna: Dna): CharacterDef {
  return {
    id,
    name: 'Pet',
    species: 'pet',
    scale: PET_SCALE * dna.size,
    tail: dna.tailLength,
    colors: { ...dna.colors, ...dna.marks },
    crest: dna.crest ?? undefined,
    // A small bird with a high voice; a bigger pet is a little lower.
    voice: { pitch: 3800 / dna.size, wave: 'sine', notes: 3, slide: 1.3 },
    specials: {
      glow: dna.glow,
      rainbow: dna.rainbow,
      heads: dna.heads,
      tails: dna.tails,
      eyeDots: dna.eyeDots,
      sun: dna.sun,
      thirdEye: dna.thirdEye,
    },
  };
}
