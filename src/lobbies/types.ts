import type { Object3D } from 'three';
import type { PhysicsWorld } from '../engine/physics';
import type { LobbyContent } from '../world/types';

export interface SpawnPoint {
  /** World position of the player's feet. */
  position: readonly [number, number, number];
}

export interface LobbyContext {
  physics: PhysicsWorld;
}

/** What a loaded lobby hands back to the engine. */
export interface LobbyInstance {
  /** Everything visible in the lobby, including its lights. */
  root: Object3D;
}

/**
 * A lobby is a self-contained module: geometry, spawn points, lighting, toys
 * and (from later milestones) activities and sounds. The engine knows
 * nothing about any particular lobby.
 */
export interface LobbyModule {
  id: string;
  name: string;
  skyColor: number;
  spawnPoints: readonly SpawnPoint[];
  /** Toys, places to put them, and things to peck. */
  content?: LobbyContent;
  load(ctx: LobbyContext): LobbyInstance;
}
