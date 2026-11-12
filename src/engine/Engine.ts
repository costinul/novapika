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
import { iceServers, petsApi } from '../account/account';
import { Ear } from '../audio/Ear';
import { Microphone } from '../audio/Microphone';
import { Mimicry } from '../audio/Mimicry';
import { Sounds } from '../audio/Sounds';
import { FeatherBatch } from '../characters/FeatherBatch';
import { tickParrotMaterials } from '../characters/parrotMaterial';
import { character, DEFAULT_CHARACTER, roster } from '../characters/roster';
import { ReachMeter } from '../comfort/ReachMeter';
import { Vignette } from '../comfort/Vignette';
import { movementConfig } from '../config/movement';
import { DebugPanel } from '../debug/DebugPanel';
import { Flock } from '../flock/Flock';
import { Helper } from '../helper/Helper';
import type { PanelPointer } from '../debug/DebugPanel';
import { lobbyRegistry } from '../lobbies/registry';
import type { LobbyInstance, LobbyModule } from '../lobbies/types';
import { newMoveInput, toMoveInput } from '../movement/input';
import { connectLobby } from '../net/LobbyClient';
import { Multiplayer } from '../net/Multiplayer';
import { Pets } from '../pets/Pets';
import { bodyCenter, clawCorrection, placeAt, stepMovement } from '../movement/step';
import { HANDS, Player } from '../player/Player';
import type { InputSource } from '../player/Player';
import { PlayerView } from '../player/PlayerView';
import { XRInput } from '../player/XRInput';
import { createRecognisers } from '../stunts/recognisers';
import { Voice } from '../voice/Voice';
import type { StuntSample } from '../stunts/recognisers';
import { ActionLayer } from '../world/actions';
import type { Action } from '../world/actions';
import { beakPosition } from '../world/beak';
import { WorldState } from '../world/WorldState';
import type { Toy } from '../world/WorldState';
import { WorldView } from '../world/WorldView';
import { FixedStepper } from './fixedStep';
import { PhysicsWorld } from './physics';

/** Simulation rate. Movement and physics always advance in steps of 1/SIM_HZ. */
const SIM_HZ = 120;
const EYE_HEIGHT_DESKTOP = 1.6; // m, camera height when there is no headset
const FALL_OUT_Y = -30; // m, below this the player is put back at the spawn point
const MENU_HOLD = 0.8; // s to hold B or Y to open or close the debug panel
const SHOW_DEBUG = new URLSearchParams(globalThis.location?.search ?? '').has('debug');
const CHARACTER_KEY = 'novapika.character';

/** The parrot chosen last time, kept on this device only. */
function rememberedCharacter(): string {
  try {
    const id = globalThis.localStorage?.getItem(CHARACTER_KEY);
    return id && id in roster ? id : DEFAULT_CHARACTER;
  } catch {
    return DEFAULT_CHARACTER; // Storage switched off: start as the default.
  }
}

function rememberCharacter(id: string): void {
  try {
    globalThis.localStorage?.setItem(CHARACTER_KEY, id);
  } catch {
    // Storage switched off: the choice just lasts for this visit.
  }
}

/** The lobby's parrots are simulated on every this-many-th step, to save time. */
const FLOCK_EVERY = 2;

export class Engine {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(70, 1, 0.05, 600);
  /** The local player's tracking space. Moving the player moves this. */
  private readonly rig = new Group();
  readonly localPlayer = new Player('local', rememberedCharacter());

  private readonly input: InputSource;
  private readonly playerView: PlayerView;
  private readonly debugPanel: DebugPanel;
  private readonly stepper = new FixedStepper(1 / SIM_HZ);
  private readonly world: WorldState;
  private readonly actions: ActionLayer;
  private readonly worldView: WorldView;
  private readonly sounds = new Sounds();
  /** Room for forty parrots' wings: the players, their followers and the lobby's own. */
  private readonly feathers = new FeatherBatch(560);
  private readonly microphone = new Microphone();
  private readonly mimicry = new Mimicry();
  private readonly ear = new Ear();
  private readonly voice: Voice;
  private readonly flock: Flock;
  private readonly helper: Helper;
  /** A signed-in player's pets. Tell it who is signed in with `pets.setAccount`. */
  readonly pets: Pets;
  /** Called when the server stops taking this device's sign-in in the middle of a game. */
  onSignedOut: (() => void) | null = null;
  private readonly multiplayer: Multiplayer;
  private wantOnline = false;
  /** Somebody has just started playing: seat them at their own place once the lobby says which it is. */
  private seatWhenIn = false;
  /** Simulation steps run so far. The flock and the pets are stepped on every second one. */
  private simSteps = 0;
  private readonly stunts = createRecognisers();
  private readonly stuntSample: StuntSample = {
    state: 'standing',
    speed: 0,
    verticalSpeed: 0,
    rolling: 0,
    clearance: 0,
    height: 0,
    passedRing: false,
  };
  private wasAirborne = false;
  private wasFlapping = false;
  private readonly wasPlanted = { left: false, right: false };
  private readonly vignette = new Vignette();
  private readonly reach = new ReachMeter();
  /** How long the menu button has been held, s. */
  private menuHeld = 0;
  /** The toy the local player's beak could bite right now. */
  private biteable: Toy | null = null;
  private biteWasPressed = false;
  private drawCalls = 0;
  private triangles = 0;
  private desktopBite = false;

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
    this.camera.add(this.vignette.object);
    this.scene.add(this.rig);

    this.input = new XRInput(this.renderer, this.camera);
    this.playerView = new PlayerView(this.localPlayer, this.feathers, true);
    this.scene.add(this.playerView.object, this.feathers.mesh);

    this.debugPanel = new DebugPanel(movementConfig, () => ({
      fps: this.fps,
      movementState: this.describeMovement(),
      lobbyId: `${this.lobby?.module.id ?? '-'}  reach ${this.reach.reach.toFixed(2)} m`,
      drawCalls: this.drawCalls,
      triangles: this.triangles,
    }));
    this.scene.add(this.debugPanel.object);
    this.debugPanel.object.visible = false;

    this.world = new WorldState(this.physics);
    this.world.players.set(this.localPlayer.id, this.localPlayer);
    this.actions = new ActionLayer(this.world);
    this.worldView = new WorldView(this.world, this.physics);
    this.scene.add(this.worldView.object);
    this.sounds.setVoice(character(this.localPlayer.characterId).voice);
    this.actions.onApplied((action, remote) => {
      const mine = 'playerId' in action && action.playerId === this.localPlayer.id;
      if (action.type === 'chooseCharacter' && mine) {
        this.sounds.setVoice(character(action.characterId).voice);
        rememberCharacter(action.characterId);
      }
      if (action.type === 'passRing' && mine) this.stuntSample.passedRing = true;
      // Food in the egg cup feeds the egg of whoever carried it there.
      if (action.type === 'place' && this.world.toys.get(action.toyId)?.lastHolderId === this.localPlayer.id) {
        this.pets.onPlaced(action.toyId, action.targetId);
      }
      this.worldView.onAction(action);
      this.playAction(action, remote);
    });
    this.world.onJingle = (_toy, strength) => this.sounds.jingle(strength);
    this.flock = new Flock(this.world, this.actions, this.physics, this.feathers, this.sounds, this.mimicry);
    this.scene.add(this.flock.object);
    this.helper = new Helper({
      local: this.localPlayer,
      parrot: () => this.flock.helper,
      ear: this.ear,
      context: () => this.sounds.context,
      send: (samples) => this.multiplayer.sendHeard(samples),
      onSpeaks: (seconds) => this.flock.helperSpeaks(seconds),
      onSquawks: () => this.flock.helperSquawks(),
      onIntent: (intent) => {
        // Somebody or somewhere this game does not know of: it stays where it is.
        const who = intent.do === 'follow' ? this.world.players.get(intent.playerId) : undefined;
        const place = intent.do === 'lead' ? this.lobby?.module.content?.helperPlaces?.[intent.place] : undefined;
        this.flock.helperDoes(who ? { follow: who } : place ? { lead: new Vector3(...place) } : null);
      },
    });
    this.pets = new Pets({
      physics: this.physics,
      feathers: this.feathers,
      api: petsApi,
      spots: () => this.flock.spots,
      eat: (toyId) => void this.actions.dispatch({ type: 'eat', toyId }),
      onSignedOut: () => this.onSignedOut?.(),
      onEvent: (event) => {
        if (event.type === 'call') {
          const distance = this.localPlayer.head.position.distanceTo(event.at);
          this.sounds.call(event.voice, Math.max(0.1, 1 / (1 + distance / 5)));
        } else if (event.type === 'refused') {
          this.sounds.refuse();
          this.worldView.burst(event.at, 0xff6a5f);
        } else {
          // A pet coming home is quiet; anything else is cheered.
          if (event.type !== 'home') this.sounds.chirp();
          this.worldView.burst(event.at, event.type === 'home' ? 0xffffff : 0xfff27a);
        }
      },
    });
    this.scene.add(this.pets.object);

    this.voice = new Voice({
      context: () => this.sounds.context,
      send: (to, data) => this.multiplayer.sendRtc(to, data),
      iceServers,
    });
    this.multiplayer = new Multiplayer({
      voice: this.voice,
      helper: this.helper,
      world: this.world,
      feathers: this.feathers,
      local: this.localPlayer,
      actions: this.actions,
      connect: connectLobby,
      about: () => ({
        characterId: this.localPlayer.characterId,
        followerPetId: this.pets.follower?.petId ?? null,
      }),
      flock: () => this.flock.players,
      follower: () => this.pets.follower?.player ?? null,
      petOf: (ownerId, petId) => this.pets.friendPet(ownerId, petId),
      onRefused: () =>
        void petsApi.account().then((account) => {
          if (account.status === 'out') this.onSignedOut?.();
        }),
      onJoined: () => {
        if (this.seatWhenIn) this.needsSpawn = true;
        this.seatWhenIn = false;
      },
    });
    this.scene.add(this.multiplayer.object);

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
      this.multiplayer.leave();
      this.flock.clear();
      this.pets.clear();
      this.world.clear();
      this.physics.clear();
    }

    const instance = module.load({ physics: this.physics });
    if (module.content) this.world.load(module.content);
    this.flock.load(module.content?.flock);
    this.pets.load(module.content?.petCorner);
    this.worldView.rebuild();
    this.sounds.setAmbience(module.ambience ?? null);
    this.scene.add(instance.root);
    this.scene.background = new Color(module.skyColor);
    this.lobby = { module, instance };

    this.needsSpawn = true;
    if (this.wantOnline) this.multiplayer.join(module.id);
  }

  /** Join the other players in this lobby, or leave them. Call with true once somebody is playing. */
  setOnline(on: boolean): void {
    this.wantOnline = on;
    this.seatWhenIn = on;
    if (!on) this.multiplayer.leave();
    else if (this.lobby) this.multiplayer.join(this.lobby.module.id);
  }

  /** Put the local player at rest on the lobby's spawn point. */
  private respawn(): void {
    if (!this.lobby) return;
    const player = this.localPlayer;
    // Each player in the lobby has their own place to start, where the lobby has enough.
    const points = this.lobby.module.spawnPoints;
    this.scratch.fromArray(points[Math.max(0, this.multiplayer.slot) % points.length].position);
    placeAt(player, this.moveNow, movementConfig, this.scratch);
    toMoveInput(player.input, this.movePrev);
    player.updateWorldPoses();
    // Off to the right, so it does not hide the room.
    // The debug panel is for the grown-up tuning the game: shown at the start
    // only when the address has ?debug, otherwise opened by holding B or Y.
    if (SHOW_DEBUG) this.debugPanel.placeInFrontOf(player.head, -0.7);
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
    this.sounds.unlock();
    // Asks for the microphone once: to talk to the other players, for the
    // parrots that copy what you say, and for the helper parrot to hear you.
    // The game is the same without it.
    void this.microphone.open().then((stream) => {
      this.voice.setMicrophone(stream);
      if (!this.sounds.context) return;
      void this.mimicry.enable(this.sounds.context, stream);
      void this.ear.enable(this.sounds.context, stream);
    });
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
    this.measureReach(dt);
    // With other players in the lobby, only the host's game runs the lobby's own parrots.
    this.flock.setSimulated(this.multiplayer.isHost);

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
      this.moveStep.headForward.copy(this.moveNow.headForward);
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
    this.feathers.begin();
    this.playerView.update(dt);
    // First, so that parrots other games run are where those games say before they are drawn.
    this.multiplayer.frame(dt);
    this.helper.frame(dt);
    // The flock is simulated at half rate; draw it part way between its steps.
    const between = ((this.simSteps % FLOCK_EVERY) + this.stepper.alpha) / FLOCK_EVERY;
    this.flock.frame(dt, between);
    this.pets.frame(dt, between, player);
    this.feathers.end();
    this.updateBeak(dt);
    this.updateStunts(dt);
    this.worldView.update(dt, this.biteable);
    tickParrotMaterials(dt);
    this.sounds.update(dt);
    this.updateDebugPanel(dt);

    this.renderer.render(this.scene, this.camera);
    // In VR this counts both eyes, so it reads about double the scene's own total.
    this.drawCalls = this.renderer.info.render.calls;
    this.triangles = this.renderer.info.render.triangles;
  };

  /** One fixed simulation step. */
  private simulate(dt: number): void {
    this.physics.step(dt);
    stepMovement(this.localPlayer, this.moveStep, this.physics, movementConfig, dt);
    if (++this.simSteps % FLOCK_EVERY === 0) {
      this.flock.step(dt * FLOCK_EVERY);
      this.pets.step(dt * FLOCK_EVERY, this.localPlayer);
    }
    this.world.step(dt, this.actions);
  }

  /** The sound of an action. One another player's game made happen is quieter the further off it was. */
  private playAction(action: Action, remote: boolean): void {
    if (!remote) return this.sounds.onAction(action);
    const who = 'playerId' in action ? this.world.players.get(action.playerId) : undefined;
    const where =
      who?.head.position ??
      ('toyId' in action ? this.world.toys.get(action.toyId)?.position : undefined) ??
      ('objectId' in action ? this.world.peckables.get(action.objectId)?.position : undefined);
    const loudness = where ? Math.max(0.06, 1 / (1 + this.localPlayer.head.position.distanceTo(where) / 5)) : 1;
    // A cheer is in the voice of the parrot that cheers.
    if (who && (action.type === 'stunt' || action.type === 'chooseCharacter')) {
      this.sounds.call(character(who.characterId).voice, loudness);
    } else this.sounds.onAction(action, loudness);
  }

  /** Learn the player's arm reach from how far out they hold their hands. */
  private measureReach(dt: number): void {
    const player = this.localPlayer;
    if (!movementConfig.autoArmReach.value || !this.renderer.xr.isPresenting) {
      player.reachScale = 1;
      return;
    }
    const { head, hands } = this.moveNow;
    const out = (h: 'left' | 'right'): number =>
      Math.hypot(hands[h].position.x - head.x, hands[h].position.z - head.z);
    this.reach.update(out('left'), out('right'), dt);
    player.reachScale = this.reach.scale;
  }

  /** Watch the local player for stunts, and make the sounds of flight. */
  private updateStunts(dt: number): void {
    const player = this.localPlayer;
    const s = this.stuntSample;
    s.state = player.movementState;
    s.speed = player.velocity.length();
    s.verticalSpeed = player.velocity.y;
    s.rolling = player.wings.rolling;
    // Underside of the body, a little up so the ray starts above what it rests on.
    this.scratch.copy(player.head.position);
    this.scratch.y -= movementConfig.bodyHeight.value - 0.1;
    s.height = this.scratch.y;
    const ground = this.physics.groundBelow(this.scratch, 60);
    s.clearance = ground === null ? 60 : this.scratch.y - ground;

    for (const stunt of this.stunts) {
      if (stunt.update(s, dt)) {
        this.actions.dispatch({ type: 'stunt', playerId: player.id, name: stunt.name });
      }
    }
    s.passedRing = false;
    player.excitement = Math.max(0, player.excitement - dt / 1.5);

    const airborne = !player.grounded && !player.supported;
    if (airborne !== this.wasAirborne) {
      if (airborne) {
        this.sounds.takeOff();
      } else {
        this.sounds.land();
        // A little dust where the feet come down.
        this.scratch.copy(player.head.position);
        this.scratch.y -= movementConfig.bodyHeight.value;
        this.worldView.burst(this.scratch, 0xe8dcc0);
      }
      this.wasAirborne = airborne;
    }
    this.sounds.setWind(airborne ? s.speed : 0);
    this.vignette.update(airborne ? s.speed : 0, movementConfig, dt);

    // Wing beats and claws are heard, and felt in the hands.
    const flapping = player.wings.flapping;
    if (flapping && !this.wasFlapping) {
      this.sounds.flap(player.wings.flapStrength);
      for (const h of HANDS) this.input.pulse?.(h, 0.25 * player.wings.flapStrength, 70);
    }
    this.wasFlapping = flapping;
    for (const h of HANDS) {
      const planted = player.claws[h].planted;
      if (planted && !this.wasPlanted[h]) {
        this.sounds.clawTap();
        this.input.pulse?.(h, 0.35, 30);
      }
      this.wasPlanted[h] = planted;
    }
  }

  /** Beak: carry, peck, and bite or drop on a trigger press. */
  private updateBeak(dt: number): void {
    const player = this.localPlayer;
    this.world.updateInteractions(this.actions, dt);

    this.biteable = player.carriedItemId
      ? null
      : this.world.nearestBiteable(beakPosition(player.head, this.scratch), movementConfig.biteReach.value);

    const held = this.desktopBite || HANDS.some((h) => player.input.hands[h].triggerPressed);
    const pressed = held && !this.biteWasPressed;
    this.biteWasPressed = held;
    this.desktopBite = false;
    if (!pressed || this.debugPanel.pointerOnPanel) return;

    if (player.carriedItemId) {
      this.actions.dispatch({ type: 'drop', playerId: player.id });
    } else if (this.biteable) {
      this.actions.dispatch({ type: 'pickUp', playerId: player.id, toyId: this.biteable.id });
      this.biteable = null;
    }
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
    // Hold B or Y for a moment: a child's stray press does not open it.
    const menuPressed = HANDS.some((h) => player.input.hands[h].menuPressed);
    const before = this.menuHeld;
    this.menuHeld = menuPressed ? this.menuHeld + dt : 0;
    if (before < MENU_HOLD && this.menuHeld >= MENU_HOLD) this.debugPanel.toggle(player.head);

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
      this.sounds.unlock();
      aimMouse(e);
      this.mouse.pressed = true;
    });
    window.addEventListener('pointerup', () => {
      this.mouse.pressed = false;
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'p') this.debugPanel.toggle(this.localPlayer.head);
      if (e.key === 'b') this.desktopBite = true; // bite or drop, as the trigger does
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
