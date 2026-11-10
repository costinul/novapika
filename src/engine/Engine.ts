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
import { HANDS, Player } from '../player/Player';
import type { InputSource } from '../player/Player';
import { PlayerView } from '../player/PlayerView';
import { XRInput } from '../player/XRInput';
import { FixedStepper } from './fixedStep';
import { PhysicsWorld } from './physics';

/** Simulation rate. Movement and physics always advance in steps of 1/SIM_HZ. */
const SIM_HZ = 120;
const EYE_HEIGHT_DESKTOP = 1.6; // m, camera height when there is no headset

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
      movementState: this.localPlayer.movementState,
      lobbyId: this.lobby?.module.id ?? '-',
    }));
    this.scene.add(this.debugPanel.object);

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

    const player = this.localPlayer;
    player.position.fromArray(module.spawnPoints[0].position);
    player.velocity.set(0, 0, 0);
    player.movementState = 'standing';
    this.rig.position.copy(player.position);
    this.input.read(player.input);
    player.updateWorldPoses();
    this.debugPanel.placeInFrontOf(player.head);
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

    const steps = this.stepper.advance(dt);
    for (let i = 0; i < steps; i++) this.simulate(this.stepper.stepSeconds);

    player.updateWorldPoses();
    this.rig.position.copy(player.position);
    this.playerView.update();
    this.updateDebugPanel(dt);

    this.renderer.render(this.scene, this.camera);
  };

  /** One fixed simulation step. Player movement is added here in milestone 2. */
  private simulate(dt: number): void {
    this.physics.step(dt);
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
