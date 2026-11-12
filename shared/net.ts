import type { Action, ToyPlace } from './actions';
import type { HelperIntent } from './helper';

// What the game and the lobby server say to each other over a WebSocket.
// Small things travel as JSON text. Poses, many times a second, travel as
// binary frames the server passes on without reading.

/** The lobbies a player can be in. Each is one room on the server. */
export const LOBBY_IDS = ['aviary', 'downham-market', 'london', 'new-york', 'test-room', 'pet-show'] as const;

/** What the owner's page calls each lobby. */
export const LOBBY_NAMES: Record<(typeof LOBBY_IDS)[number], string> = {
  aviary: 'The Aviary',
  'downham-market': 'Downham Market',
  london: 'London',
  'new-york': 'New York',
  'test-room': 'Test Room',
  'pet-show': 'Pet Show',
};

/** The most players in one lobby. */
export const LOBBY_SIZE = 8;

/**
 * A browser cannot put a header on a WebSocket, so the sign-in token rides
 * in the list of protocols: this name first, then the token.
 */
export const PROTOCOL = 'novapika';

/** Why the server closed a connection. */
export const CLOSE_FULL = 4001;
/** The same player has connected again, from here or another device. */
export const CLOSE_ELSEWHERE = 4002;
/** The connection sent something that is not ours. */
export const CLOSE_BAD = 4003;

/**
 * First byte of a binary frame: where the parrots and loose toys one game
 * runs are. The server writes the sender's slot into the second byte. The
 * third is how many poses follow; after them, toys to the end of the frame.
 */
export const FRAME_POSES = 1;
/** Bytes before the first pose. */
export const FRAME_HEAD = 3;
/**
 * First byte of a binary frame, game to server only: a phrase spoken to the
 * helper parrot. The server turns it into text and drops it; it is passed on
 * to nobody. See shared/helper.ts for what follows the first two bytes.
 */
export const FRAME_HEARD = 2;
/** First byte of a binary frame, server to game only: the helper parrot's voice, as an MP3 after two bytes. */
export const FRAME_SPEECH = 3;
/** The biggest binary frame the server passes on. */
export const MAX_FRAME_BYTES = 4096;
/** The biggest text message the server reads. */
export const MAX_TEXT_BYTES = 16384;

/** A player in the lobby, as everyone there sees them. */
export interface LobbyPlayer {
  /** 0..LOBBY_SIZE-1, theirs for as long as they stay. */
  slot: number;
  id: string;
  nickname: string;
  /** The parrot they are. */
  characterId: string;
  /** The pet following them, if any. */
  followerPetId: string | null;
}

/** How the lobby's toys, bells and rings stand, for a player who has just come in. */
export interface SharedWorld {
  /** Toy to the parrot carrying it. */
  holders: [string, string][];
  /** Loose, moving toy to the player whose game is moving it. */
  sims: [string, string][];
  /** Toy to the place it has been put in. */
  placed: [string, string][];
  /** Toy to where it lies, if not where it started. */
  rest: [string, ToyPlace][];
  /** Bells rung since every bell was last rung. */
  bells: string[];
  /** Rings flown since the course was last finished. */
  rings: string[];
}

/**
 * A present the owner has let go from the sky over a lobby, with a pet
 * inside. It comes down slowly; the first player to touch it gets the pet.
 * What is inside is a surprise, so it is not told.
 */
export interface Present {
  id: string;
  /** How long ago it was let go, in milliseconds, when this was sent. */
  age: number;
}

/** What a player tells the lobby about themself. */
export interface AboutMe {
  characterId: string;
  followerPetId: string | null;
}

/**
 * What two games pass each other to set up a voice call between them: an
 * offer or an answer, or a way to reach them. The server passes it on unread.
 */
export type RtcData = Record<string, unknown>;

export type ClientMessage =
  /** Sent on joining, and again whenever it changes. */
  | { t: 'me'; me: AboutMe }
  /** For the player in place `to` only. */
  | { t: 'rtc'; to: number; data: RtcData }
  /** Something this game made happen to the lobby's toys, bells or rings. */
  | { t: 'act'; action: Action }
  /** This game's player has come up to the helper parrot, or is still by it. It may say something to them. */
  | { t: 'near' }
  /** This game's player has touched the present. A game speaks only for its own player, never for a parrot it runs. */
  | { t: 'open'; id: string };

export type ServerMessage =
  /** The first thing a player hears: who they are here, and who else is in. */
  | { t: 'welcome'; you: number; host: number; players: LobbyPlayer[]; world: SharedWorld }
  /** Somebody came in, or changed parrot or follower. */
  | { t: 'player'; player: LobbyPlayer }
  | { t: 'leave'; slot: number }
  /** Who now runs the lobby's own parrots: the player who has been in longest. */
  | { t: 'host'; slot: number }
  /** From the player in place `from`, for this player only. */
  | { t: 'rtc'; from: number; data: RtcData }
  /** Something another game made happen. */
  | { t: 'act'; action: Action }
  /**
   * This game took a toy the lobby would not let it have. Who really has it:
   * a parrot, or nobody, and then where it lies (null: where it started).
   */
  | { t: 'held'; toyId: string; by: string | null; at: ToyPlace | null }
  /** Whether the helper parrot is listening. While it is not, no game sends it a phrase. */
  | { t: 'helper'; listens: boolean }
  /** The helper parrot heard a phrase and could not answer it. */
  | { t: 'squawk' }
  /** What the helper parrot's body does from now. Every game is told; the host's flies it. */
  | { t: 'intent'; intent: HelperIntent }
  /** A present is on its way down, or is waiting where it landed. */
  | { t: 'present'; present: Present }
  /** The player in place `by` touched the present first: the pet in it is theirs. */
  | { t: 'opened'; id: string; by: number }
  /** For the player who touched it only: they could not be given the pet, so the present stays for somebody else. */
  | { t: 'shut'; id: string };
