import type { LobbyModule } from './types';

/**
 * Every lobby the game can load. To add a lobby: add one folder under
 * src/lobbies/ and one line here. No engine changes.
 */
export const lobbyRegistry: Record<string, () => Promise<LobbyModule>> = {
  aviary: () => import('./aviary').then((m) => m.default),
  'downham-market': () => import('./downhamMarket').then((m) => m.default),
  'test-room': () => import('./testRoom').then((m) => m.default),
  'pet-show': () => import('./petShow').then((m) => m.default),
};

export const DEFAULT_LOBBY_ID = 'aviary';
