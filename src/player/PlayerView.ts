import { Color, ConeGeometry, Group, Mesh, MeshLambertMaterial, Quaternion, SRGBColorSpace, Vector3 } from 'three';
import type { BufferGeometry, Sprite } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FeatherBatch } from '../characters/FeatherBatch';
import {
  buildParrotParts,
  CREST_FLAT,
  CREST_RAISED,
  CREST_ROOT,
  HEAD_CENTER,
  SHOULDER,
} from '../characters/parrotGeometry';
import { parrotAura, parrotEmblem, parrotMaterial } from '../characters/parrotMaterial';
import { character } from '../characters/roster';
import type { CharacterDef } from '../characters/types';
import { movementConfig } from '../config/movement';
import { BEAK_OFFSET } from '../world/beak';
import { HANDS } from './Player';
import type { Player } from './Player';

/** Height of a parrot of scale 1, feet to crown, in metres. */
export const PARROT_HEIGHT = 0.72;
const FEATHERS_PER_WING = 7;
const STAMINA_EMPTY = new Color(0xff3b30); // wing tips when out of puff
const UP = new Vector3(0, 1, 0);
const AIRBORNE = new Set(['flapping', 'gliding', 'diving', 'falling', 'rolling']);

const saturate = (x: number): number => Math.min(1, Math.max(0, x));

/** Toes spread on a surface: three forward and one back, lying in the XZ plane. */
function clawGeometry(): BufferGeometry {
  const toes = [-0.5, 0, 0.5, Math.PI].map((angle) =>
    new ConeGeometry(0.014, 0.085, 4).translate(0, 0.0425, 0).rotateX(-Math.PI / 2).rotateY(angle),
  );
  const merged = mergeGeometries(toes);
  for (const toe of toes) toe.dispose();
  return merged;
}

/**
 * Draws one parrot from its Player state. It never reads the headset, so the
 * same view serves the local player, lobby parrots and, later, remote players.
 *
 * The wings are feathers strung from each shoulder to each hand, so they
 * follow the arms and spread as the arms go out. For the local player the
 * head and body are left out (the camera is inside them); they see their
 * wings, their claws on a surface and the tip of their beak.
 */
export class PlayerView {
  readonly object = new Group();
  private readonly body = new Mesh();
  private readonly headPivot = new Group();
  private readonly head = new Mesh();
  private readonly crest = new Mesh();
  private aura: Sprite | null = null;
  private emblem: Mesh | null = null;
  private readonly beakTip: Mesh;
  private readonly claws: Mesh[];
  private readonly clawMaterial = new MeshLambertMaterial();
  private def: CharacterDef | null = null;
  private crestRaise = 0.2;
  private lean = 0;

  private readonly forward = new Vector3(0, 0, -1);
  private readonly yaw = new Quaternion();
  private readonly bodyTurn = new Quaternion();
  private readonly q = new Quaternion();
  private readonly shoulder = new Vector3();
  private readonly arm = new Vector3();
  private readonly armDir = new Vector3();
  private readonly back = new Vector3();
  private readonly root = new Vector3();
  private readonly dir = new Vector3();
  private readonly folded = new Vector3();
  private readonly normal = new Vector3();
  private readonly tip = new Color();
  private readonly hue = new Color();
  private time = 0;

  /**
   * `pet` is the character of a pet, which is not in the roster. Left out,
   * the parrot is whoever the player is.
   */
  constructor(
    private readonly player: Player,
    private readonly feathers: FeatherBatch,
    local: boolean,
    private readonly pet?: CharacterDef,
  ) {
    this.headPivot.add(this.head, this.crest);
    this.crest.position.copy(CREST_ROOT);

    this.beakTip = new Mesh(new ConeGeometry(0.02, 0.07, 8).rotateX(-Math.PI / 2), new MeshLambertMaterial());
    const clawShape = clawGeometry();
    this.claws = HANDS.map(() => new Mesh(clawShape, this.clawMaterial));

    this.object.add(this.body, this.headPivot, this.beakTip, ...this.claws);
    this.body.visible = this.headPivot.visible = !local;
    this.beakTip.visible = local;
  }

  /** Swap in the models for a character. */
  private setCharacter(def: CharacterDef): void {
    this.def = def;
    this.body.geometry.dispose();
    this.head.geometry.dispose();
    this.crest.geometry.dispose();
    const parts = buildParrotParts(def);
    this.body.geometry = parts.body;
    this.head.geometry = parts.head;
    this.crest.visible = !!parts.crest;
    if (parts.crest) this.crest.geometry = parts.crest;
    this.body.material = this.head.material = this.crest.material = parrotMaterial(def);
    // A halo for a parrot that glows. It rides on the body, which is 1 unit tall.
    if (this.aura) this.body.remove(this.aura);
    this.aura = parrotAura(def);
    if (this.aura) this.body.add(this.aura);
    // A badge with a letter, for a bird that wears one. It rides on the chest.
    if (this.emblem) this.body.remove(this.emblem);
    this.emblem = parrotEmblem(def);
    if (this.emblem) this.body.add(this.emblem);
    (this.beakTip.material as MeshLambertMaterial).color.set(def.colors.beak);
    this.clawMaterial.color.set(def.colors.feet);
  }

  /** Free the models. Call when the parrot is gone for good. */
  dispose(): void {
    for (const mesh of [this.body, this.head, this.crest, this.beakTip, this.claws[0]]) mesh.geometry.dispose();
    (this.beakTip.material as MeshLambertMaterial).dispose();
    this.clawMaterial.dispose();
  }

  update(dt: number): void {
    const player = this.player;
    if (this.pet) {
      if (this.def !== this.pet) this.setCharacter(this.pet);
    } else if (this.def?.id !== player.characterId) {
      this.setCharacter(character(player.characterId));
    }
    const def = this.def!;
    const height = PARROT_HEIGHT * def.scale;
    const head = player.head;
    const airborne = AIRBORNE.has(player.movementState);
    this.time += dt;

    // Which way the bird faces: where the head looks, flattened.
    this.dir.set(0, 0, -1).applyQuaternion(head.quaternion).setY(0);
    if (this.dir.lengthSq() > 0.01) this.forward.copy(this.dir).normalize();
    this.yaw.setFromUnitVectors(this.dir.set(0, 0, -1), this.forward);

    // Head, with the crest up when flying fast or showing off, down at rest.
    this.headPivot.position.copy(head.position);
    this.headPivot.quaternion.copy(head.quaternion);
    this.headPivot.scale.setScalar(height);
    const excited = airborne ? Math.max(0.25, player.velocity.length() / 6) : 0.15;
    const raise = saturate(Math.max(excited, player.excitement));
    this.crestRaise += (raise - this.crestRaise) * (1 - Math.exp(-6 * dt));
    this.crest.rotation.x = CREST_FLAT + (CREST_RAISED - CREST_FLAT) * this.crestRaise;

    // Body: hangs from the head, leans forward in flight and shows the roll.
    this.lean += ((airborne ? 1.05 : 0) - this.lean) * (1 - Math.exp(-5 * dt));
    this.bodyTurn
      .copy(this.yaw)
      .multiply(this.q.setFromAxisAngle(this.dir.set(0, 0, -1), player.wings.roll))
      .multiply(this.q.setFromAxisAngle(this.dir.set(1, 0, 0), -this.lean));
    this.body.quaternion.copy(this.bodyTurn);
    this.body.scale.setScalar(height);
    this.body.position
      .copy(HEAD_CENTER)
      .multiplyScalar(-height)
      .applyQuaternion(this.bodyTurn)
      .add(head.position);

    this.beakTip.position.copy(BEAK_OFFSET).applyQuaternion(head.quaternion).add(head.position);
    this.beakTip.quaternion.copy(head.quaternion);
    this.beakTip.rotateX(-0.4); // hooked slightly downward

    // Wing tips fade from the bird's own colour to red as stamina runs out.
    const stamina = movementConfig.staminaEnabled.value ? player.stamina : 1;
    this.tip.set(def.colors.wingTip).lerp(STAMINA_EMPTY, 1 - saturate(stamina));
    const tipColor = this.tip.getHex();

    this.back.copy(this.forward).negate();
    HANDS.forEach((h, index) => {
      const side = h === 'left' ? -1 : 1;
      const hand = player.hands[h].grip.position;
      this.shoulder
        .set(side * SHOULDER.x, SHOULDER.y, SHOULDER.z)
        .multiplyScalar(height)
        .applyQuaternion(this.yaw)
        .add(head.position);
      this.arm.copy(hand).sub(this.shoulder);
      this.armDir.copy(this.arm).normalize();

      // How far out the arm is, the same way the glide measures it.
      const out = Math.hypot(hand.x - head.position.x, hand.z - head.position.z);
      const tuck = movementConfig.wingTuckDistance.value * player.reachScale;
      const full = movementConfig.wingSpreadDistance.value * player.reachScale;
      const spread = saturate((out - tuck) / Math.max(0.01, full - tuck));

      this.folded.copy(this.back).multiplyScalar(0.45).addScaledVector(UP, -1).addScaledVector(this.armDir, 0.1);
      for (let i = 0; i < FEATHERS_PER_WING; i++) {
        const t = (i + 0.5) / FEATHERS_PER_WING; // 0 at the shoulder, 1 at the hand
        this.root.copy(this.shoulder).addScaledVector(this.arm, t);
        // Spread: inner feathers trail behind, outer ones fan out along the arm.
        this.dir
          .copy(this.back)
          .multiplyScalar(1 - 0.75 * t * t)
          .addScaledVector(this.armDir, 1.1 * t * t)
          .addScaledVector(UP, -0.1)
          .lerp(this.folded, 1 - spread)
          .normalize();
        this.normal.crossVectors(this.armDir, this.dir);
        if (this.normal.y < 0) this.normal.negate();
        const length = height * (0.2 + 0.22 * t) * (0.7 + 0.3 * spread);
        const color = def.specials?.rainbow
          ? // A rainbow bird's wing runs through the colours, which flow along it.
            this.hue.setHSL(t * 0.6 - this.time * 0.25, 0.95, 0.56, SRGBColorSpace).getHex()
          : i >= FEATHERS_PER_WING - 2
            ? tipColor
            : def.colors.wingPatch !== undefined && t < 0.42
              ? def.colors.wingPatch
              : def.colors.wing;
        this.feathers.add(this.root, this.dir, this.normal, length, color);
      }

      // Claws show on a hand that is gripping a surface.
      const claw = player.claws[h];
      const mesh = this.claws[index];
      mesh.visible = claw.planted;
      if (claw.planted) {
        mesh.position.copy(hand).addScaledVector(claw.normal, -movementConfig.handRadius.value * 0.9);
        mesh.quaternion.setFromUnitVectors(UP, claw.normal);
        mesh.scale.setScalar(def.scale * 1.4);
      }
    });
  }
}
