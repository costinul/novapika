import { Matrix4, Vector3 } from 'three';
import type { Camera, Object3D, WebGLRenderer, XRTargetRaySpace } from 'three';
import { HANDS } from './Player';
import type { Handedness, InputSource, PlayerInput, Pose } from './Player';

// xr-standard gamepad button indices.
const BUTTON_TRIGGER = 0;
const BUTTON_SQUEEZE = 1;
const BUTTON_BOARD = 4; // A on the right controller, X on the left
const BUTTON_MENU = 5; // B on the right controller, Y on the left

// Hand positions used on a flat screen, relative to the head.
const DESKTOP_HAND_OFFSET: Record<Handedness, Vector3> = {
  left: new Vector3(-0.25, -0.25, -0.55),
  right: new Vector3(0.25, -0.25, -0.55),
};

interface TrackedHand {
  grip: Object3D;
  aim: XRTargetRaySpace;
  handedness: Handedness | null;
}

/**
 * Reads the headset and controllers into a PlayerInput. This is the only
 * place gameplay code touches WebXR.
 */
export class XRInput implements InputSource {
  private readonly tracked: TrackedHand[];
  private readonly m = new Matrix4();
  private readonly v = new Vector3();

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly camera: Camera,
  ) {
    // three.js keeps these objects' transforms up to date in tracking space.
    this.tracked = [0, 1].map((i) => {
      const entry: TrackedHand = {
        grip: renderer.xr.getControllerGrip(i),
        aim: renderer.xr.getController(i),
        handedness: null,
      };
      entry.aim.addEventListener('connected', (e) => {
        const h = e.data.handedness;
        entry.handedness = h === 'left' || h === 'right' ? h : null;
      });
      entry.aim.addEventListener('disconnected', () => {
        entry.handedness = null;
      });
      return entry;
    });
  }

  read(out: PlayerInput): void {
    const xr = this.renderer.xr;
    if (!xr.isPresenting) {
      this.readDesktop(out);
      return;
    }

    // Head: midpoint of the eye cameras, straight from this frame's pose.
    const eyes = xr.getCamera().cameras;
    if (eyes.length > 0) {
      out.head.position.set(0, 0, 0);
      for (const eye of eyes) out.head.position.add(this.v.setFromMatrixPosition(eye.matrix));
      out.head.position.divideScalar(eyes.length);
      out.head.quaternion.setFromRotationMatrix(this.m.extractRotation(eyes[0].matrix));
    }

    for (const t of this.tracked) {
      if (!t.handedness) continue;
      const hand = out.hands[t.handedness];
      copyPose(t.grip, hand.grip);
      copyPose(t.aim, hand.aim);
    }

    for (const h of HANDS) {
      out.hands[h].gripPressed = false;
      out.hands[h].triggerPressed = false;
      out.hands[h].menuPressed = false;
      out.hands[h].boardPressed = false;
    }
    for (const source of xr.getSession()?.inputSources ?? []) {
      const h = source.handedness;
      const buttons = source.gamepad?.buttons;
      if ((h !== 'left' && h !== 'right') || !buttons) continue;
      out.hands[h].triggerPressed = buttons[BUTTON_TRIGGER]?.pressed ?? false;
      out.hands[h].gripPressed = buttons[BUTTON_SQUEEZE]?.pressed ?? false;
      out.hands[h].menuPressed = buttons[BUTTON_MENU]?.pressed ?? false;
      out.hands[h].boardPressed = buttons[BUTTON_BOARD]?.pressed ?? false;
    }
  }

  /** A short buzz in one controller. `strength` is 0..1. Does nothing where unsupported. */
  pulse(hand: Handedness, strength: number, milliseconds: number): void {
    for (const source of this.renderer.xr.getSession()?.inputSources ?? []) {
      if (source.handedness !== hand) continue;
      const gamepad = source.gamepad as (Gamepad & { hapticActuators?: { pulse?(s: number, ms: number): unknown }[] }) | undefined;
      void gamepad?.hapticActuators?.[0]?.pulse?.(strength, milliseconds);
    }
  }

  /** No headset: head is the screen camera, hands float in front of it. */
  private readDesktop(out: PlayerInput): void {
    copyPose(this.camera, out.head);
    for (const h of HANDS) {
      const hand = out.hands[h];
      hand.grip.position
        .copy(DESKTOP_HAND_OFFSET[h])
        .applyQuaternion(out.head.quaternion)
        .add(out.head.position);
      hand.grip.quaternion.copy(out.head.quaternion);
      hand.aim.position.copy(hand.grip.position);
      hand.aim.quaternion.copy(hand.grip.quaternion);
      hand.gripPressed = hand.triggerPressed = hand.menuPressed = hand.boardPressed = false;
    }
  }
}

function copyPose(from: Object3D, to: Pose): void {
  to.position.copy(from.position);
  to.quaternion.copy(from.quaternion);
}
