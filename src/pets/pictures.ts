import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import type { PetView } from '../../shared/api';
import { buildStatue } from '../characters/parrotGeometry';
import { parrotAura, parrotMaterial } from '../characters/parrotMaterial';
import { petCharacter } from '../characters/pets';
import { PARROT_HEIGHT } from '../player/PlayerView';
import type { Stand } from '../world/types';

// The small pictures of the pet corner, drawn in code, and the models of pets
// that stand about in it. Pictures only: nothing here needs reading.

type Draw = (g: CanvasRenderingContext2D) => void;
const INK = '#39424e';

/** A padlock: nobody is signed in. */
export const padlock: Draw = (g) => {
  g.strokeStyle = INK;
  g.lineWidth = 22;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(128, 104, 46, Math.PI, 0);
  g.lineTo(174, 128);
  g.moveTo(82, 104);
  g.lineTo(82, 128);
  g.stroke();
  g.fillStyle = '#f2c14e';
  g.beginPath();
  g.roundRect(56, 122, 144, 104, 22);
  g.fill();
  g.fillStyle = INK;
  g.beginPath();
  g.arc(128, 164, 15, 0, Math.PI * 2);
  g.fill();
  g.fillRect(120, 164, 16, 34);
};

/** A cloud with a line through it: the server cannot be reached. */
export const noConnection: Draw = (g) => {
  g.fillStyle = '#ffffff';
  g.strokeStyle = INK;
  g.lineWidth = 14;
  g.lineJoin = 'round';
  g.beginPath();
  g.arc(92, 150, 42, Math.PI * 0.5, Math.PI * 1.5);
  g.arc(132, 108, 50, Math.PI * 1.1, Math.PI * 1.9);
  g.arc(176, 150, 42, Math.PI * 1.5, Math.PI * 0.5);
  g.closePath();
  g.fill();
  g.stroke();
  g.strokeStyle = '#e0352b';
  g.lineWidth = 20;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(56, 222);
  g.lineTo(204, 50);
  g.stroke();
};

/** An hourglass: waiting for a friend's answer. */
export const hourglass: Draw = (g) => {
  g.strokeStyle = INK;
  g.fillStyle = '#ffe08a';
  g.lineWidth = 16;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(72, 44);
  g.lineTo(184, 44);
  g.lineTo(128, 128);
  g.lineTo(184, 212);
  g.lineTo(72, 212);
  g.lineTo(128, 128);
  g.closePath();
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(56, 44);
  g.lineTo(200, 44);
  g.moveTo(56, 212);
  g.lineTo(200, 212);
  g.stroke();
};

/** A heart: these two would be the parents. */
export const heart: Draw = (g) => {
  g.fillStyle = '#f06292';
  g.beginPath();
  g.moveTo(128, 214);
  g.bezierCurveTo(20, 140, 44, 40, 128, 92);
  g.bezierCurveTo(212, 40, 236, 140, 128, 214);
  g.fill();
};

const disc = (g: CanvasRenderingContext2D, color: string): void => {
  g.fillStyle = color;
  g.beginPath();
  g.arc(128, 128, 112, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#ffffff';
  g.lineWidth = 30;
  g.lineCap = 'round';
  g.lineJoin = 'round';
};

/** A white tick on green: yes. */
export const tick: Draw = (g) => {
  disc(g, '#2fae4a');
  g.beginPath();
  g.moveTo(72, 132);
  g.lineTo(112, 172);
  g.lineTo(186, 88);
  g.stroke();
};

/** A white cross on red: no. */
export const cross: Draw = (g) => {
  disc(g, '#e0352b');
  g.beginPath();
  g.moveTo(84, 84);
  g.lineTo(172, 172);
  g.moveTo(172, 84);
  g.lineTo(84, 172);
  g.stroke();
};

/** A nest brimming with birds, crossed out: no room for another. */
export const noRoom: Draw = (g) => {
  g.fillStyle = '#b9884f';
  g.beginPath();
  g.ellipse(128, 170, 96, 44, 0, 0, Math.PI);
  g.fill();
  for (const [x, color] of [[78, '#57c44a'], [128, '#f8dc48'], [178, '#5aa9f0']] as const) {
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, 138, 30, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#e0352b';
  g.lineWidth = 20;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(48, 222);
  g.lineTo(208, 40);
  g.stroke();
};

/** A texture with one of the drawings above on it. */
export function picture(draw: Draw): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  draw(canvas.getContext('2d')!);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A flat square showing a picture, standing at a place and facing the way the place faces. */
export function sign(texture: CanvasTexture, stand: Stand, size: number): Mesh {
  const mesh = new Mesh(new PlaneGeometry(size, size), new MeshBasicMaterial({ map: texture, transparent: true }));
  mesh.position.set(...stand.position);
  // A plane faces +Z before it is turned; a model faces -Z.
  mesh.rotation.y = stand.yaw + Math.PI;
  return mesh;
}

let ghostMaterial: MeshLambertMaterial | null = null;

/**
 * A model of a pet standing at a place. `size` is against its true size; a
 * `ghost` is see-through, for a friend's pet that is asked for but not here.
 */
export function petStatue(pet: PetView, stand: Stand, size = 1, ghost = false): Mesh {
  const who = petCharacter(pet.id, pet.dna);
  ghostMaterial ??= new MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const statue = new Mesh(buildStatue(who), ghost ? ghostMaterial : parrotMaterial(who));
  statue.position.set(...stand.position);
  statue.rotation.y = stand.yaw;
  statue.scale.setScalar(PARROT_HEIGHT * who.scale * size);
  const aura = ghost ? null : parrotAura(who);
  if (aura) statue.add(aura);
  return statue;
}
