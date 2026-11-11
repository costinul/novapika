// A character is data: looks, size and voice on one shared parrot shape.
// A new species or a new named bird is a new entry in the roster, nothing more.

export type Species = 'cockatiel' | 'budgie' | 'macaw' | 'cockatoo';

export interface ParrotColors {
  head: number;
  /** Back of the body. */
  back: number;
  /** Upper front of the body. */
  chest: number;
  /** Lower front of the body. */
  belly: number;
  wing: number;
  /** A lighter patch on the inner part of the wing, if the bird has one. */
  wingPatch?: number;
  /** The outer flight feathers. These change colour as stamina runs low. */
  wingTip: number;
  tail: number;
  beak: number;
  /** A small dark mark on the front of the beak. */
  beakStain?: number;
  feet: number;
  eye: number;
  /** A pale ring of skin round the eye. */
  eyeRing?: number;
  /** Round patch on each cheek. */
  cheek?: number;
  /** A smudge behind and below the cheek. */
  neckSmudge?: number;
  /** A patch of bare skin round the eye and cheek. */
  facePatch?: number;
  /** Fine dark bars across the back of the head. */
  headStripes?: number;
}

export interface CrestDef {
  color: number;
  /** Length of the longest feather, as a share of the bird's height. */
  length: number;
  feathers: number;
  /** Feather width at the base, as a share of the bird's height. */
  width: number;
}

export interface VoiceDef {
  /** Pitch of a chirp in Hz. Smaller birds are higher. */
  pitch: number;
  /** Pure for a whistle, harsher for a squawk. */
  wave: 'sine' | 'triangle' | 'square' | 'sawtooth';
  /** Notes in one chirp. */
  notes: number;
  /** How far each note slides upward; 1 is flat. */
  slide: number;
}

export interface CharacterDef {
  id: string;
  name: string;
  species: Species;
  /** Nova and Pika: the stars of the game, given the central perches. */
  star?: boolean;
  /** Size against a mid-sized parrot. In v1 size changes looks only. */
  scale: number;
  /** Tail length as a share of the bird's height. */
  tail: number;
  colors: ParrotColors;
  crest?: CrestDef;
  voice: VoiceDef;
}
