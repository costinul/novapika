import { beforeEach, describe, expect, it } from 'vitest';
import { Travel } from '../src/gate/Travel';

// The trip from one place to another, with a place swap that waits to be told it is done.

const FADE = 0.4;
const DT = 1 / 72;

let swaps: string[];
let finish: () => void;
let fail: () => void;
let travel: Travel;

beforeEach(() => {
  swaps = [];
  travel = new Travel((placeId) => {
    swaps.push(placeId);
    return new Promise<void>((resolve, reject) => {
      finish = resolve;
      fail = () => reject(new Error('no such place'));
    });
  }, FADE);
});

function run(seconds: number): void {
  for (let t = 0; t < seconds; t += DT) travel.update(DT);
}

/** Let what waits on the swap carry on. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));

describe('a trip', () => {
  it('swaps the place only once the view is black', () => {
    travel.go('test-room');
    run(FADE / 2);
    expect(travel.dark).toBeGreaterThan(0);
    expect(travel.dark).toBeLessThan(1);
    expect(swaps).toEqual([]);
    run(FADE);
    expect(travel.dark).toBe(1);
    expect(swaps).toEqual(['test-room']);
  });

  it('stays black while the place loads, then fades back in', async () => {
    travel.go('test-room');
    run(FADE * 3);
    expect(travel.dark).toBe(1);
    expect(travel.busy).toBe(true);
    finish();
    await settle();
    run(FADE / 2);
    expect(travel.dark).toBeLessThan(1);
    run(FADE);
    expect(travel.dark).toBe(0);
    expect(travel.busy).toBe(false);
  });

  it('takes no other trip until it is over', async () => {
    expect(travel.go('test-room')).toBe(true);
    expect(travel.go('aviary')).toBe(false);
    run(FADE * 2);
    expect(travel.go('aviary')).toBe(false);
    finish();
    await settle();
    run(FADE / 2);
    expect(travel.go('aviary')).toBe(false);
    run(FADE);
    expect(swaps).toEqual(['test-room']);
    expect(travel.go('aviary')).toBe(true);
  });

  it('fades back in where the player was if the place cannot be loaded', async () => {
    travel.go('test-room');
    run(FADE * 2);
    fail();
    await settle();
    run(FADE * 2);
    expect(travel.dark).toBe(0);
    expect(travel.busy).toBe(false);
    expect(swaps).toEqual(['test-room']);
  });

  it('shows nothing when nobody is going anywhere', () => {
    run(1);
    expect(travel.dark).toBe(0);
    expect(swaps).toEqual([]);
  });
});
