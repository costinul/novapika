// The lobby's helper parrot: a kind parrot that talks with the players. Its
// mind runs on the lobby server; its body is one of the lobby's own parrots.
// What the game and the server must agree on about it is here.

/** What the helper parrot is called. Players hear and say this. */
export const HELPER_NAME = 'Kiki';

/** A phrase spoken to the helper travels as 16-bit samples, one channel, at this rate. */
export const HEARD_RATE = 16000; // Hz
/** The longest phrase the helper listens to. */
export const MAX_HEARD_SECONDS = 8;
/** Bytes before the samples in a frame of speech, either way. Even, so the samples line up. */
export const SOUND_HEAD = 2;
/** The biggest frame holding a phrase for the helper. */
export const MAX_HEARD_BYTES = SOUND_HEAD + HEARD_RATE * 2 * MAX_HEARD_SECONDS;

/** The lobbies that have a helper parrot. */
export const HELPER_LOBBIES: readonly string[] = ['aviary'];

/**
 * The places the helper parrot can lead a player to, and what each is, in
 * words for the helper. A lobby with a helper says where each one is.
 */
export const HELPER_PLACES = {
  'egg-cup': 'the egg cup in the nest, where an egg is fed',
  'pet-rail': "the rail in the nest where a player's pets sit",
  seeds: 'a seed lying on the grass',
  feeder: 'the feeder, the yellow tray on a tree stump on the ground',
  'toy-box': 'the toy box on the ground',
  'bird-bath': 'the bird bath, the pond on the ground',
  gym: 'the climbing gym on the ground',
} as const;

export type HelperPlace = keyof typeof HELPER_PLACES;

/** What the helper parrot's body is doing, besides talking. */
export type HelperIntent =
  /** On its own stump. */
  | { do: 'stay' }
  /** Flying with a player, and keeping near them. */
  | { do: 'follow'; playerId: string }
  /** Flying to a place and waiting there, for a player to come after it. */
  | { do: 'lead'; place: HelperPlace };
