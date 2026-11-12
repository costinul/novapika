import { Quaternion, Vector3 } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { HOLD, Menu } from '../src/menu/Menu';
import { MENU_BUTTONS } from '../src/menu/buttons';

// The player's menu, with hands that are wherever the test puts them. There
// are no pictures here: nothing draws outside a browser.

const DT = 1 / 60;
const blank = { draw: () => {} };
const head = { position: new Vector3(1, 1.4, 2), quaternion: new Quaternion() };

let chosen: string[];
let menu: Menu;

/** Where a button is in the player's tracking space, once the menu is open. */
function at(index: number, count = 2): Vector3 {
  const across = 0.17 + 0.05;
  return new Vector3((index - (count - 1) / 2) * across, 0, 0).applyQuaternion(menu.object.quaternion).add(menu.object.position);
}

const run = (seconds: number, ...hands: Vector3[]): void => {
  for (let t = 0; t < seconds; t += DT) menu.update(DT, hands);
};

beforeEach(() => {
  chosen = [];
  menu = new Menu([{ id: 'one', ...blank }, { id: 'two', ...blank }], (id) => void chosen.push(id));
});

describe('the menu', () => {
  it('opens in front of the player at their chest, facing them, and closes again', () => {
    expect(menu.open).toBe(false);
    menu.toggle(head);
    expect(menu.open).toBe(true);
    // The player looks along -z: the board is ahead of them and below their eyes.
    expect(menu.object.position.x).toBeCloseTo(1);
    expect(menu.object.position.z).toBeCloseTo(2 - 0.45);
    expect(menu.object.position.y).toBeCloseTo(1.4 - 0.32);
    const faces = new Vector3(0, 0, 1).applyQuaternion(menu.object.quaternion);
    expect(faces.z).toBeCloseTo(1);
    menu.toggle(head);
    expect(menu.open).toBe(false);
  });

  it('opens the way the player faces, upright however they tilt their head', () => {
    const turned = { position: head.position, quaternion: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2) };
    turned.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.6));
    menu.toggle(turned);
    // Facing -x now: the board is that way, and faces back along +x.
    expect(menu.object.position.x).toBeCloseTo(1 - 0.45);
    expect(menu.object.position.z).toBeCloseTo(2);
    const faces = new Vector3(0, 0, 1).applyQuaternion(menu.object.quaternion);
    expect(faces.x).toBeCloseTo(1);
    expect(faces.y).toBeCloseTo(0);
  });

  it('chooses a button a hand is held on, once, and closes', () => {
    menu.toggle(head);
    run(HOLD - 0.2, at(1));
    expect(chosen).toEqual([]);
    expect(menu.progress('two')).toBeGreaterThan(0.7);
    expect(menu.progress('one')).toBe(0);
    run(0.4, at(1));
    expect(chosen).toEqual(['two']);
    expect(menu.open).toBe(false);
    // The hand is still there, but the menu is closed: nothing more is chosen.
    run(3, at(1));
    expect(chosen).toEqual(['two']);
    // Opened again, it starts empty.
    menu.toggle(head);
    expect(menu.progress('two')).toBe(0);
  });

  it('is not set off by a touch in passing, or by a hand beside it', () => {
    menu.toggle(head);
    for (let i = 0; i < 6; i++) {
      run(0.3, at(0));
      run(0.5);
    }
    expect(chosen).toEqual([]);
    expect(menu.progress('one')).toBe(0);
    run(3, at(0).add(new Vector3(0, 0.2, 0)), at(1).add(new Vector3(0, 0, 0.25)));
    expect(chosen).toEqual([]);
  });

  it('takes either hand', () => {
    menu.toggle(head);
    run(HOLD + 0.1, new Vector3(9, 9, 9), at(0));
    expect(chosen).toEqual(['one']);
  });

  it('does nothing while it is closed', () => {
    menu.toggle(head);
    const where = at(0);
    menu.toggle(head);
    run(3, where);
    expect(chosen).toEqual([]);
  });

  it('has a way to leave the game', () => {
    expect(MENU_BUTTONS.map((button) => button.id)).toContain('leave');
  });
});
