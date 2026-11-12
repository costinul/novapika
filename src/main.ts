import type { Account } from './account/account';
import { setUpSignIn } from './account/signInPad';
import { startButton } from './account/startButton';
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

// Nobody plays without signing in. Both are null until known: who is signed
// in on this device, and whether this browser can do VR.
let account: Account | null = null;
let vr: boolean | null = null;
let engine: Engine | null = null;

/** The start button shows its state as a picture; the label is for screen readers. */
function show(): void {
  const { state, label } = startButton(vr, account);
  button.dataset.state = state;
  // Loading and no-VR have nothing to press.
  button.disabled = state === 'loading' || state === 'none';
  button.setAttribute('aria-label', label);
}

const signIn = setUpSignIn((next) => {
  account = next;
  engine?.pets.setAccount(next);
  if (next.status === 'out') {
    // Signed out in the middle of a game: back to the start screen.
    void engine?.renderer.xr.getSession()?.end();
    start.hidden = false;
  }
  show();
});

button.addEventListener('click', (event) => {
  const state = button.dataset.state;
  if (state === 'locked') {
    event.stopPropagation();
    signIn.open();
  } else if (state === 'offline') {
    account = null;
    show();
    signIn.check();
  } else if (state === 'ready') {
    engine?.enterVR().catch((err) => {
      console.error(err);
      vr = false;
      show();
    });
  }
});
// No headset here: once signed in, the game can still be looked at on the flat screen.
start.addEventListener('click', () => {
  if (vr === false && account?.status === 'in') start.hidden = true;
});

engine = await Engine.create(canvas);
if (account) engine.pets.setAccount(account);
// The server stopped taking this device's sign-in while the game was running.
engine.onSignedOut = () => signIn.check();
// ?lobby=<id> picks a lobby from the registry.
await engine.loadLobby(new URLSearchParams(location.search).get('lobby') ?? DEFAULT_LOBBY_ID);
engine.start();
// Development only: lets the console and test scripts inspect the game.
if (import.meta.env.DEV) (window as unknown as { engine: Engine }).engine = engine;

engine.renderer.xr.addEventListener('sessionstart', () => (start.hidden = true));
engine.renderer.xr.addEventListener('sessionend', () => (start.hidden = false));
vr = await engine.isVRSupported();
show();
