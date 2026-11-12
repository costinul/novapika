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
