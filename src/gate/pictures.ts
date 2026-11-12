import { CanvasTexture, SRGBColorSpace } from 'three';

// The picture of each place, as it hangs on a gate's board and shows in the
// lit doorway. No words: a small child picks a place by what it looks like.

const SIZE = 256; // px

type G = CanvasRenderingContext2D;

const blob = (g: G, color: string, x: number, y: number, rx: number, ry = rx): void => {
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
};

/** Draws each place, by lobby id, on a square of SIZE pixels. */
export const PICTURES: Record<string, (g: G) => void> = {
  /** Home: the nest in the tree, with three eggs. */
  aviary(g) {
    g.fillStyle = '#bfe6ff';
    g.fillRect(0, 0, SIZE, SIZE);
    // The trunk, and leaves above and to the sides.
    g.fillStyle = '#9a6b3f';
    g.fillRect(104, 150, 48, 110);
    for (const [x, y, r, color] of [
      [40, 40, 60, '#5dbb4a'],
      [128, 14, 70, '#74c95a'],
      [216, 44, 62, '#4aa63c'],
      [16, 120, 36, '#74c95a'],
      [240, 124, 38, '#5dbb4a'],
    ] as const) {
      blob(g, color, x, y, r);
    }
    // Eggs first, so the nest's rim hides their lower halves.
    for (const x of [92, 128, 164]) blob(g, '#fff4d6', x, 138, 20, 27);
    blob(g, '#b9884f', 128, 176, 92, 36);
    g.strokeStyle = '#7d5430';
    g.lineWidth = 5;
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      g.moveTo(48 + i * 19, 166 + (i % 2) * 14);
      g.lineTo(70 + i * 19, 182 - (i % 3) * 8);
      g.stroke();
    }
  },

  /** Downham Market: the black and white clock tower, with ginger-brown shops behind it. */
  'downham-market'(g) {
    g.fillStyle = '#bfe6ff';
    g.fillRect(0, 0, SIZE, SIZE);
    // Shops behind, and the paving of the market place.
    for (const [color, x, top] of [
      ['#a8612f', 0, 118],
      ['#eadfc4', 70, 96],
      ['#8d4f27', 150, 110],
      ['#b55a3c', 206, 126],
    ] as const) {
      g.fillStyle = color;
      g.fillRect(x, top, 80, 200 - top);
      g.fillStyle = '#5c6370';
      g.fillRect(x, top - 8, 80, 8);
    }
    g.fillStyle = '#d9cfb8';
    g.fillRect(0, 196, SIZE, 60);

    // The tower: steps, base, shaft, the clock and its pointed roof.
    g.fillStyle = '#b5b0a8';
    g.fillRect(84, 214, 88, 14);
    g.fillStyle = '#25272b';
    g.fillRect(104, 170, 48, 46);
    g.fillStyle = '#f4f1e8';
    g.fillRect(114, 100, 28, 72);
    g.fillRect(118, 180, 20, 28);
    g.fillStyle = '#25272b';
    for (const y of [112, 134, 156]) g.fillRect(112, y, 32, 6);
    g.fillRect(96, 52, 64, 52);
    g.beginPath();
    g.moveTo(90, 52);
    g.lineTo(128, 10);
    g.lineTo(166, 52);
    g.fill();
    blob(g, '#ffffff', 128, 78, 20);
    g.strokeStyle = '#25272b';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(128, 64);
    g.lineTo(128, 78);
    g.lineTo(138, 78);
    g.stroke();
  },

  /** London: Big Ben over the Thames, and a red bus. */
  london(g) {
    g.fillStyle = '#cfe6f5';
    g.fillRect(0, 0, SIZE, SIZE);
    // Parliament, low and long, and the river in front of it.
    g.fillStyle = '#d9bd82';
    g.fillRect(96, 150, 160, 50);
    g.fillStyle = '#bf9f63';
    for (let x = 104; x < SIZE; x += 18) g.fillRect(x, 142, 6, 58);
    g.fillStyle = '#4f9fd0';
    g.fillRect(0, 200, SIZE, 56);
    g.fillStyle = '#7fbfe6';
    g.fillRect(20, 214, 60, 6);
    g.fillRect(150, 232, 70, 6);

    // The tower: the shaft, the clock, the belfry and the roof stepping up to a point.
    g.fillStyle = '#d9bd82';
    g.fillRect(52, 96, 44, 104);
    g.fillRect(46, 52, 56, 46);
    g.fillStyle = '#bf9f63';
    for (const x of [60, 72, 84]) g.fillRect(x, 100, 5, 100);
    g.fillStyle = '#3d4651';
    g.fillRect(50, 40, 48, 12);
    g.fillRect(58, 28, 32, 12);
    g.fillRect(66, 16, 16, 12);
    g.fillStyle = '#e2b33c';
    g.fillRect(72, 4, 4, 12);
    blob(g, '#e2b33c', 74, 75, 21);
    blob(g, '#ffffff', 74, 75, 17);
    g.strokeStyle = '#25272b';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(74, 62);
    g.lineTo(74, 75);
    g.lineTo(84, 75);
    g.stroke();

    // The bus, on the bridge.
    g.fillStyle = '#6fa58a';
    g.fillRect(120, 196, 136, 8);
    g.fillStyle = '#c8302b';
    g.fillRect(150, 150, 84, 46);
    g.fillStyle = '#3d5266';
    g.fillRect(156, 156, 72, 12);
    g.fillRect(156, 176, 72, 10);
    blob(g, '#25272b', 168, 198, 8);
    blob(g, '#25272b', 216, 198, 8);
  },
};

/** The picture of a place, to draw on a flat sheet. Free it with `dispose` when done. */
export function placePicture(placeId: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext('2d')!;
  PICTURES[placeId]?.(g);
  // A white edge, so the picture stands out from the board and from the doorway's glow.
  g.strokeStyle = '#ffffff';
  g.lineWidth = 12;
  g.strokeRect(6, 6, SIZE - 12, SIZE - 12);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
