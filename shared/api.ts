import type { Dna } from './dna';

// What the server sends about players and pets, to the game and to the admin
// page. Nothing secret is ever in these.

/** The most pets a player can have, eggs included. */
export const PET_CAP = 24;

export interface PetView {
  id: string;
  dna: Dna;
  stage: 'egg' | 'hatched';
}

export interface PlayerView {
  id: string;
  nickname: string;
  /** The pet that follows the player, if any. */
  followerId: string | null;
  pets: PetView[];
}
