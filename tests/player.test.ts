import { describe, expect, it } from 'vitest';
import { DEFAULT_LOBBY_ID, lobbyRegistry } from '../src/lobbies/registry';
import { Player } from '../src/player/Player';

describe('Player', () => {
  it('derives world poses from its position and tracking-space input', () => {
    const p = new Player('p1', 'nova');
    p.position.set(10, 2, -3);
    p.input.head.position.set(0, 1.6, 0);
    p.input.hands.left.grip.position.set(-0.3, 1.2, -0.4);
    p.input.hands.right.aim.position.set(0.3, 1.2, -0.4);
    p.updateWorldPoses();

    expect(p.head.position.toArray()).toEqual([10, 3.6, -3]);
    expect(p.hands.left.grip.position.toArray()).toEqual([9.7, 3.2, -3.4]);
    expect(p.hands.right.aim.position.toArray()).toEqual([10.3, 3.2, -3.4]);
  });

  it('starts standing with full stamina and an empty beak', () => {
    const p = new Player('p1', 'pika');
    expect(p.movementState).toBe('standing');
    expect(p.stamina).toBe(1);
    expect(p.carriedItemId).toBeNull();
  });
});

describe('lobby registry', () => {
  it('loads every registered lobby module under its own id', async () => {
    expect(lobbyRegistry[DEFAULT_LOBBY_ID]).toBeDefined();
    for (const [id, load] of Object.entries(lobbyRegistry)) {
      const lobby = await load();
      expect(lobby.id).toBe(id);
      expect(lobby.spawnPoints.length).toBeGreaterThan(0);
    }
  });
});
