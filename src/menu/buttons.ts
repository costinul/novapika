import type { MenuButton } from './Menu';

// What is on the player's menu, as pictures. A new choice is a new entry
// here, and a line in the engine saying what it does.

type G = CanvasRenderingContext2D;

/** A rounded square in one colour, filling the picture. */
function tile(g: G, size: number, color: string): void {
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(4, 4, size - 8, size - 8, size * 0.16);
  g.fill();
}

/** Leave the game: an open door with an arrow going out through it. */
export const LEAVE: MenuButton = {
  id: 'leave',
  draw(g, size) {
    const s = size / 256;
    tile(g, size, '#ffd9a8');
    // The doorway, dark where it is open, and the door swung back on its left.
    g.fillStyle = '#3a2f2a';
    g.fillRect(96 * s, 46 * s, 96 * s, 164 * s);
    g.fillStyle = '#9a6b3f';
    g.beginPath();
    g.moveTo(96 * s, 46 * s);
    g.lineTo(52 * s, 66 * s);
    g.lineTo(52 * s, 228 * s);
    g.lineTo(96 * s, 210 * s);
    g.closePath();
    g.fill();
    g.fillStyle = '#f2c14e';
    g.beginPath();
    g.arc(64 * s, 146 * s, 7 * s, 0, Math.PI * 2);
    g.fill();
    // An arrow out through the doorway.
    g.strokeStyle = g.fillStyle = '#2fae4a';
    g.lineWidth = 20 * s;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(116 * s, 128 * s);
    g.lineTo(196 * s, 128 * s);
    g.stroke();
    g.beginPath();
    g.moveTo(240 * s, 128 * s);
    g.lineTo(192 * s, 92 * s);
    g.lineTo(192 * s, 164 * s);
    g.closePath();
    g.fill();
  },
};

/** The buttons on the menu, left to right. */
export const MENU_BUTTONS: readonly MenuButton[] = [LEAVE];
