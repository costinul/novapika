import { Engine } from './engine/Engine';
import { DEFAULT_LOBBY_ID } from './lobbies/registry';

// On a desktop browser with no headset, development builds emulate one.
const nativeVR = (await navigator.xr?.isSessionSupported('immersive-vr').catch(() => false)) ?? false;
if (import.meta.env.DEV && !nativeVR) {
  (await import('./dev/emulator')).installEmulator();
}

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const start = document.querySelector<HTMLElement>('#start')!;
const button = document.querySelector<HTMLButtonElement>('#enter-vr')!;

/** The start button shows its state as a picture; the label is for screen readers. */
function show(state: 'loading' | 'ready' | 'none', label: string): void {
  button.dataset.state = state;
  button.disabled = state !== 'ready';
  button.setAttribute('aria-label', label);
}

const engine = await Engine.create(canvas);
// ?lobby=<id> picks a lobby from the registry.
await engine.loadLobby(new URLSearchParams(location.search).get('lobby') ?? DEFAULT_LOBBY_ID);
engine.start();
// Development only: lets the console and test scripts inspect the game.
if (import.meta.env.DEV) (window as unknown as { engine: Engine }).engine = engine;

if (await engine.isVRSupported()) {
  show('ready', 'Play');
  button.addEventListener('click', () => {
    engine.enterVR().catch((err) => {
      console.error(err);
      show('none', 'Could not start VR');
    });
  });
  engine.renderer.xr.addEventListener('sessionstart', () => (start.hidden = true));
  engine.renderer.xr.addEventListener('sessionend', () => (start.hidden = false));
} else {
  // No headset here: the game can still be looked at on the flat screen.
  show('none', 'VR is not available in this browser');
  start.addEventListener('click', () => (start.hidden = true), { once: true });
}
