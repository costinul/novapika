import {
  Color,
  Group,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Material, Mesh, Object3D, Texture } from 'three';
import { movementConfig } from '../config/movement';
import { DebugPanel } from '../debug/DebugPanel';
import type { PanelPointer } from '../debug/DebugPanel';
import { lobbyRegistry } from '../lobbies/registry';
import type { LobbyInstance, LobbyModule } from '../lobbies/types';
import { bodyCenter, clawCorrection, placeAt, stepMovement } from '../movement/step';
import type { MoveInput } from '../movement/types';
import { HANDS, Player } from '../player/Player';
import type { InputSource, PlayerInput } from '../player/Player';
import { PlayerView } from '../player/PlayerView';
import { XRInput } from '../player/XRInput';
import { FixedStepper } from './fixedStep';
import { PhysicsWorld } from './physics';

/** Simulation rate. Movement and physics always advance in steps of 1/SIM_HZ. */
const SIM_HZ = 120;
const EYE_HEIGHT_DESKTOP = 1.6; // m, camera height when there is no headset
const FALL_OUT_Y = -30; // m, below this the player is put back at the spawn point

const newMoveInput = (): MoveInput => ({
  head: new Vector3(),
  hands: {
    left: { position: new Vector3(), gripPressed: false },
    right: { position: new Vector3(), gripPressed: false },
  },
});

function toMoveInput(from: PlayerInput, to: MoveInput): void {
  to.head.copy(from.head.position);
  for (const h of HANDS) {
    to.hands[h].position.copy(from.hands[h].grip.position);
    to.hands[h].gripPressed = from.hands[h].gripPressed;
  }
}

export class Engine {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(70, 1, 0.05, 200);
  /** The local player's tracking space. Moving the player moves this. */
  private readonly rig = new Group();
  readonly localPlayer = new Player('local', 'nova');

  private readonly input: InputSource;
  private readonly playerView: PlayerView;
  private readonly debugPanel: DebugPanel;
  private readonly stepper = new FixedStepper(1 / SIM_HZ);

  private lobby: { module: LobbyModule; instance: LobbyInstance } | null = null;
  /** Movement input: this frame's, last frame's, and the blend fed to each step. */
  private readonly moveNow = newMoveInput();
  private readonly movePrev = newMoveInput();
  private readonly moveStep = newMoveInput();
  /** Where the player is drawn: the simulated position brought up to this instant. */
  private readonly viewPosition = new Vector3();
  private readonly scratch = new Vector3();
  private readonly scratch2 = new Vector3();
  private needsSpawn = false;
  private lastTimeMs = 0;
  private fps = 0;
  private menuWasPressed = false;
  private readonly pointers: PanelPointer[] = HANDS.map(() => ({
    origin: new Vector3(),
    direction: new Vector3(),
    pressed: false,
  }));
  private readonly mouse: PanelPointer & { active: boolean } = {
    origin: new Vector3(),
    direction: new Vector3(),
    pressed: false,
    active: false,
  };

  private constructor(
    canvas: HTMLCanvasElement,
    private readonly physics: PhysicsWorld,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local-floor');

    this.camera.position.set(0, EYE_HEIGHT_DESKTOP, 0);
    this.rig.add(this.camera);
    this.scene.add(this.rig);

    this.input = new XRInput(this.renderer, this.camera);
    this.playerView = new PlayerView(this.localPlayer);
    this.scene.add(this.playerView.object);

    this.debugPanel = new DebugPanel(movementConfig, () => ({
      fps: this.fps,
      movementState: this.describeMovement(),
      lobbyId: this.lobby?.module.id ?? '-',
    }));
    this.scene.add(this.debugPanel.object);

    // Head height changes when a session starts or ends, so re-seat the player.
    this.renderer.xr.addEventListener('sessionstart', () => (this.needsSpawn = true));
    this.renderer.xr.addEventListener('sessionend', () => (this.needsSpawn = true));

    this.listenToWindow(canvas);
  }

  static async create(canvas: HTMLCanvasElement): Promise<Engine> {
    return new Engine(canvas, await PhysicsWorld.create());
  }

  /** Unload the current lobby, if any, and load the one with this id. */
  async loadLobby(id: string): Promise<void> {
    const loader = lobbyRegistry[id];
    if (!loader) throw new Error(`Unknown lobby "${id}"`);
    const module = await loader();

    if (this.lobby) {
      this.scene.remove(this.lobby.instance.root);
      disposeTree(this.lobby.instance.root);
      this.physics.clear();
    }

    const instance = module.load({ physics: this.physics });
    this.scene.add(instance.root);
    this.scene.background = new Color(module.skyColor);
    this.lobby = { module, instance };

    this.needsSpawn = true;
  }

  /** Put the local player at rest on the lobby's spawn point. */
  private respawn(): void {
    if (!this.lobby) return;
    const player = this.localPlayer;
    this.scratch.fromArray(this.lobby.module.spawnPoints[0].position);
    placeAt(player, this.moveNow, movementConfig, this.scratch);
    toMoveInput(player.input, this.movePrev);
    player.updateWorldPoses();
    // Off to the right, so it does not hide the room.
    this.debugPanel.placeInFrontOf(player.head, -0.7);
    this.needsSpawn = false;
  }

  start(): void {
    this.renderer.setAnimationLoop(this.frame);
  }

  async isVRSupported(): Promise<boolean> {
    return (await navigator.xr?.isSessionSupported('immersive-vr')) ?? false;
  }

  /** Must be called from a user gesture such as a button click. */
  async enterVR(): Promise<void> {
    if (this.renderer.xr.isPresenting) return;
    const session = await navigator.xr!.requestSession('immersive-vr', {
      requiredFeatures: ['local-floor'],
    });
    await this.renderer.xr.setSession(session);
  }

  private readonly frame = (timeMs: number): void => {
    const dt = Math.min(0.1, (timeMs - this.lastTimeMs) / 1000);
    this.lastTimeMs = timeMs;
    if (dt > 0) this.fps += (1 / dt - this.fps) * (this.fps === 0 ? 1 : 0.05);

    const player = this.localPlayer;
    this.input.read(player.input);
    toMoveInput(player.input, this.moveNow);

    // In VR, wait for the first real head pose before seating the player.
    const poseReady = !this.renderer.xr.isPresenting || this.moveNow.head.y > 0.2;
    if ((this.needsSpawn && poseReady) || player.position.y < FALL_OUT_Y) this.respawn();

    // Each step gets the input as it was at that step's moment in time, so
    // hand speed is measured evenly whatever the display's frame rate.
    const step = this.stepper.stepSeconds;
    const sinceLastStep = this.stepper.alpha * step;
    const steps = this.stepper.advance(dt);
    for (let k = 1; k <= steps; k++) {
      const t = dt > 0 ? Math.min(1, Math.max(0, (k * step - sinceLastStep) / dt)) : 1;
      this.moveStep.head.lerpVectors(this.movePrev.head, this.moveNow.head, t);
      for (const h of HANDS) {
        this.moveStep.hands[h].position.lerpVectors(
          this.movePrev.hands[h].position,
          this.moveNow.hands[h].position,
          t,
        );
        this.moveStep.hands[h].gripPressed = this.moveNow.hands[h].gripPressed;
      }
      this.simulate(step);
    }
    toMoveInput(player.input, this.movePrev);

    this.updateViewPosition();
    player.updateWorldPoses(this.viewPosition);
    this.rig.position.copy(this.viewPosition);
    this.playerView.update();
    this.updateDebugPanel(dt);

    this.renderer.render(this.scene, this.camera);
  };

  /** One fixed simulation step. */
  private simulate(dt: number): void {
    this.physics.step(dt);
    stepMovement(this.localPlayer, this.moveStep, this.physics, movementConfig, dt);
  }

  /**
   * The simulation is up to one step behind the headset. Close that gap for
   * drawing, so a planted claw stays exactly on its surface and free flight
   * is even from frame to frame.
   */
  private updateViewPosition(): void {
    const player = this.localPlayer;
    const view = this.viewPosition.copy(player.position);
    const move = this.scratch;

    if (clawCorrection(player, this.moveNow, movementConfig, move) > 0) {
      view.add(move);
      return;
    }

    // Free: carry on at the current velocity, stopping at anything solid.
    move.copy(player.velocity).multiplyScalar(this.stepper.alpha * this.stepper.stepSeconds);
    let length = move.length();
    if (length < 1e-6) return;
    move.multiplyScalar(1 / length);
    const center = bodyCenter(player, this.moveNow, movementConfig, this.scratch2);
    const hit = this.physics.castSphere(center, move, length, movementConfig.bodyRadius.value);
    if (hit) length = hit.distance;
    view.addScaledVector(move, length);
  }

  private describeMovement(): string {
    const { movementState, claws } = this.localPlayer;
    const mark = (planted: boolean): string => (planted ? '■' : '□');
    return `${movementState}   L${mark(claws.left.planted)} R${mark(claws.right.planted)}`;
  }

  private updateDebugPanel(dt: number): void {
    const player = this.localPlayer;
    const menuPressed = HANDS.some((h) => player.input.hands[h].menuPressed);
    if (menuPressed && !this.menuWasPressed) this.debugPanel.toggle(player.head);
    this.menuWasPressed = menuPressed;

    HANDS.forEach((h, i) => {
      const aim = player.hands[h].aim;
      const p = this.pointers[i];
      p.origin.copy(aim.position);
      p.direction.set(0, 0, -1).applyQuaternion(aim.quaternion);
      p.pressed = player.input.hands[h].triggerPressed;
    });
    const active = this.renderer.xr.isPresenting
      ? this.pointers
      : this.mouse.active
        ? [this.mouse]
        : [];
    this.debugPanel.update(dt, active);
  }

  private listenToWindow(canvas: HTMLCanvasElement): void {
    const resize = (): void => {
      if (this.renderer.xr.isPresenting) return;
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    };
    window.addEventListener('resize', resize);
    resize();

    // Desktop: the mouse works as a debug-panel pointer.
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    const aimMouse = (e: PointerEvent): void => {
      ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      raycaster.setFromCamera(ndc, this.camera);
      this.mouse.origin.copy(raycaster.ray.origin);
      this.mouse.direction.copy(raycaster.ray.direction);
      this.mouse.active = true;
    };
    canvas.addEventListener('pointermove', aimMouse);
    canvas.addEventListener('pointerdown', (e) => {
      aimMouse(e);
      this.mouse.pressed = true;
    });
    window.addEventListener('pointerup', () => {
      this.mouse.pressed = false;
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'p') this.debugPanel.toggle(this.localPlayer.head);
    });
  }
}

/** Free the GPU memory of everything under an object. */
function disposeTree(root: Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as Partial<Mesh>;
    mesh.geometry?.dispose();
    const materials = mesh.material
      ? Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]
      : [];
    for (const m of materials as (Material & { map?: Texture | null })[]) {
      m.map?.dispose();
      m.dispose();
    }
  });
}
