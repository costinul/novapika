import type { Dna } from './dna';

// What the server sends about players and pets, to the game and to the admin
// page. Nothing secret is ever in these.

/** The most pets a player can have, eggs included. */
export const PET_CAP = 24;
/** Seeds an egg must be fed before it hatches. */
export const SEEDS_TO_HATCH = 3;
/** How long a pet that was set free can still be brought back. */
export const FREED_FOR_DAYS = 30;

/** A hatched pet. */
export interface PetView {
  id: string;
  dna: Dna;
}

/**
 * An egg. Only its shell is told: what will hatch is a surprise, and is
 * already fixed on the server.
 */
export interface EggView {
  id: string;
  /** Two colours for the shell, taken from the DNA inside: the shell and its speckles. */
  shell: [number, number];
  /** Seeds it has been fed so far. */
  seeds: number;
}

/** One player asking another for a pet's DNA, as seen by either of them. */
export interface RequestView {
  id: string;
  /** The pet of the player looking at this. */
  myPetId: string;
  /** The other player's nickname, and their pet. */
  friend: string;
  theirPet: PetView;
}

export interface PlayerView {
  id: string;
  nickname: string;
  /** The pet that follows the player, if any. */
  followerId: string | null;
  /** Hatched pets, in the order they were got. */
  pets: PetView[];
  egg: EggView | null;
  /** The DNA the player has asked a friend for, and not yet been answered. */
  asking: RequestView | null;
  /** Friends' requests for the DNA of the player's pets, oldest first. */
  asked: RequestView[];
}

/** Another player, and the pets whose DNA can be asked for. */
export interface FriendView {
  id: string;
  nickname: string;
  pets: PetView[];
}

/** How many players are in each lobby now, by lobby id: what a gate's board shows. */
export interface PlacesView {
  counts: Record<string, number>;
}

/** A lobby as the admin page sees it, for choosing where to let a present go. */
export interface RoomView {
  id: string;
  /** How many players are in it now. */
  players: number;
  /** A present is on its way down there, or waiting to be touched. */
  present: boolean;
}

/** A player as the admin page sees them. */
export interface AdminPlayerView extends PlayerView {
  /** Pets set free in the last 30 days, which can still be brought back. */
  freed: PetView[];
}

/** How long what was said to the helper parrot is kept. */
export const TALK_KEPT_DAYS = 7;

/** One thing a player said to the helper parrot and what it answered, as the admin page sees it. */
export interface TalkView {
  at: number;
  lobbyId: string;
  nickname: string;
  heard: string;
  said: string;
  /** Why the owner should look at this one; null for ordinary talk. */
  flagged: string | null;
}

/** The helper parrot, as the admin page sees it. */
export interface HelperView {
  /** The owner's switch. */
  on: boolean;
  /** The server has the keys it needs to hear, think and speak. */
  ready: boolean;
  /** Flagged talk first, then the rest; each newest first. */
  talk: TalkView[];
}
