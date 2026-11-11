import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { HOW_TO } from './layout';

// A picture board in the nest that shows the moves, with no words. Orange
// arrows show what your arms do; green arrows show what happens to you.

const CELL = 384; // px, one picture
const DO = '#ff7a1a';
const RESULT = '#2fae4a';
const INK = '#3a2f2a';

type G = CanvasRenderingContext2D;

function arrow(g: G, x1: number, y1: number, x2: number, y2: number, color: string, width = 16): void {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = width * 2.2;
  g.strokeStyle = g.fillStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2 - Math.cos(angle) * head * 0.8, y2 - Math.sin(angle) * head * 0.8);
  g.stroke();
  g.beginPath();
  g.moveTo(x2, y2);
  g.lineTo(x2 - Math.cos(angle - 0.5) * head, y2 - Math.sin(angle - 0.5) * head);
  g.lineTo(x2 - Math.cos(angle + 0.5) * head, y2 - Math.sin(angle + 0.5) * head);
  g.closePath();
  g.fill();
}

/**
 * A little parrot seen from the front. Arm angles are in degrees above
 * level; `reach` is how far out the arms go, 0..1.
 */
function parrot(g: G, x: number, y: number, left: number, right: number, reach = 1, faded = false): void {
  g.globalAlpha = faded ? 0.3 : 1;
  const wing = (side: number, degrees: number): void => {
    const a = (degrees * Math.PI) / 180;
    const length = 105 * reach;
    const hx = x + side * (30 + Math.cos(a) * length);
    const hy = y + 10 - Math.sin(a) * length;
    g.strokeStyle = '#6e6a73';
    g.lineWidth = 30;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x + side * 30, y + 10);
    g.lineTo(hx, hy);
    g.stroke();
    g.fillStyle = '#f4eedb';
    g.beginPath();
    g.arc(hx, hy, 15, 0, Math.PI * 2);
    g.fill();
  };
  wing(-1, left);
  wing(1, right);
  // Body, head, crest, cheeks, beak.
  g.fillStyle = '#f1dc6a';
  g.beginPath();
  g.ellipse(x, y + 45, 42, 62, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f8dc48';
  g.beginPath();
  g.arc(x, y - 35, 38, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(x - 12, y - 66);
  g.lineTo(x + 4, y - 120);
  g.lineTo(x + 14, y - 66);
  g.closePath();
  g.fill();
  g.fillStyle = '#e9601a';
  for (const side of [-1, 1]) {
    g.beginPath();
    g.arc(x + side * 25, y - 28, 10, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = INK;
  for (const side of [-1, 1]) {
    g.beginPath();
    g.arc(x + side * 13, y - 44, 5, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#cdb3b6';
  g.beginPath();
  g.moveTo(x - 9, y - 34);
  g.lineTo(x + 9, y - 34);
  g.lineTo(x, y - 16);
  g.closePath();
  g.fill();
  g.globalAlpha = 1;
}

const pictures: ((g: G) => void)[] = [
  // Flap: both arms down together, and up you go.
  (g) => {
    parrot(g, 192, 215, 50, 50, 1, true);
    parrot(g, 192, 215, -35, -35);
    arrow(g, 52, 120, 52, 280, DO);
    arrow(g, 332, 120, 332, 280, DO);
    arrow(g, 192, 100, 192, 26, RESULT, 20);
  },
  // Glide: arms out and level.
  (g) => {
    parrot(g, 192, 170, 0, 0);
    arrow(g, 70, 310, 320, 340, RESULT, 20);
  },
  // Turn: tilt, and you turn toward the low hand.
  (g) => {
    parrot(g, 192, 185, -28, 28);
    g.strokeStyle = RESULT;
    g.lineWidth = 20;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(210, 250, 110, 0.15 * Math.PI, 0.72 * Math.PI);
    g.stroke();
    arrow(g, 150, 340, 96, 318, RESULT, 20);
  },
  // Dive: arms in.
  (g) => {
    parrot(g, 192, 150, -80, -80, 0.55);
    arrow(g, 192, 265, 192, 362, RESULT, 20);
  },
  // Climb: hold on, pull down, and you go up.
  (g) => {
    g.fillStyle = '#9a6b3f';
    g.fillRect(40, 0, 54, CELL);
    parrot(g, 215, 215, 62, -70, 1);
    arrow(g, 128, 70, 128, 200, DO);
    arrow(g, 320, 250, 320, 110, RESULT, 20);
  },
  // Bite: trigger, with a toy at your beak.
  (g) => {
    parrot(g, 150, 190, -75, -75, 0.5);
    g.fillStyle = '#fff27a';
    g.beginPath();
    g.arc(150, 300, 48, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e8b06a';
    g.fillRect(122, 272, 56, 56);
    // A controller, with its trigger marked.
    g.fillStyle = '#dfe4ea';
    g.beginPath();
    g.roundRect(266, 130, 62, 150, 26);
    g.fill();
    g.beginPath();
    g.arc(297, 128, 44, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = DO;
    g.beginPath();
    g.roundRect(244, 168, 34, 46, 12);
    g.fill();
    arrow(g, 222, 250, 196, 286, DO, 12);
  },
];

/** The board's pictures as a flat sheet. Its wooden back and posts are scenery. */
export function howToBoard(): Mesh {
  const columns = 3;
  const rows = 2;
  const canvas = document.createElement('canvas');
  canvas.width = CELL * columns;
  canvas.height = CELL * rows;
  const g = canvas.getContext('2d')!;
  const tints = ['#e7f6ff', '#fff6dc', '#eaffe6', '#ffe9e2', '#f1eaff', '#fff1f6'];
  pictures.forEach((draw, i) => {
    const x = (i % columns) * CELL;
    const y = Math.floor(i / columns) * CELL;
    g.save();
    g.translate(x, y);
    g.beginPath();
    g.rect(0, 0, CELL, CELL);
    g.clip();
    g.fillStyle = tints[i];
    g.fillRect(0, 0, CELL, CELL);
    draw(g);
    g.strokeStyle = '#c98a4b';
    g.lineWidth = 10;
    g.strokeRect(0, 0, CELL, CELL);
    g.restore();
  });

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  const board = new Mesh(
    new PlaneGeometry(HOW_TO.width, HOW_TO.height),
    new MeshBasicMaterial({ map: texture }),
  );
  board.position.set(...HOW_TO.position);
  board.rotation.y = HOW_TO.yaw;
  // Just in front of its wooden back.
  board.translateZ(0.04);
  return board;
}
