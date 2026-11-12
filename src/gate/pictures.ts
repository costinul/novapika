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

  /** The test room: pale tiled walls, a green floor and coloured blocks. */
  'test-room'(g) {
    g.fillStyle = '#ffe9c7';
    g.fillRect(0, 0, SIZE, SIZE);
    g.strokeStyle = '#f2d3a3';
    g.lineWidth = 3;
    for (let i = 32; i < SIZE; i += 32) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 176);
      g.moveTo(0, i);
      g.lineTo(SIZE, i);
      g.stroke();
    }
    g.fillStyle = '#9ed67f';
    g.fillRect(0, 176, SIZE, 80);
    // Steps of rising height, and the blue climbing wall.
    for (const [color, x, height] of [
      ['#ff7a70', 28, 30],
      ['#ffb24d', 72, 56],
      ['#4fc7b5', 116, 84],
      ['#9b7bea', 160, 114],
    ] as const) {
      g.fillStyle = color;
      g.fillRect(x, 200 - height, 40, height);
    }
    g.fillStyle = '#5aa9f0';
    g.fillRect(212, 60, 26, 140);
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
