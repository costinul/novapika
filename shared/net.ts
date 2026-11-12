// What the game and the lobby server say to each other over a WebSocket.
// Small things travel as JSON text. Poses, many times a second, travel as
// binary frames the server passes on without reading.

/** The lobbies a player can be in. Each is one room on the server. */
export const LOBBY_IDS = ['aviary', 'test-room', 'pet-show'] as const;

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

/** First byte of a binary frame of poses. The server writes the sender's slot into the second. */
export const FRAME_POSES = 1;
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
  | { t: 'rtc'; to: number; data: RtcData };

export type ServerMessage =
  /** The first thing a player hears: who they are here, and who else is in. */
  | { t: 'welcome'; you: number; host: number; players: LobbyPlayer[] }
  /** Somebody came in, or changed parrot or follower. */
  | { t: 'player'; player: LobbyPlayer }
  | { t: 'leave'; slot: number }
  /** Who now runs the lobby's own parrots: the player who has been in longest. */
  | { t: 'host'; slot: number }
  /** From the player in place `from`, for this player only. */
  | { t: 'rtc'; from: number; data: RtcData };
