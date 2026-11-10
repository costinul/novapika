import { Engine } from './engine/Engine';
import { DEFAULT_LOBBY_ID } from './lobbies/registry';

// On a desktop browser with no headset, development builds emulate one.
const nativeVR = (await navigator.xr?.isSessionSupported('immersive-vr').catch(() => false)) ?? false;
if (import.meta.env.DEV && !nativeVR) {
  (await import('./dev/emulator')).installEmulator();
}

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const button = document.querySelector<HTMLButtonElement>('#enter-vr')!;

const engine = await Engine.create(canvas);
// ?lobby=<id> picks a lobby from the registry.
await engine.loadLobby(new URLSearchParams(location.search).get('lobby') ?? DEFAULT_LOBBY_ID);
engine.start();

if (await engine.isVRSupported()) {
  button.textContent = 'Enter VR';
  button.disabled = false;
  button.addEventListener('click', () => {
    engine.enterVR().catch((err) => {
      console.error(err);
      button.textContent = 'Could not start VR';
    });
  });
  engine.renderer.xr.addEventListener('sessionstart', () => (button.hidden = true));
  engine.renderer.xr.addEventListener('sessionend', () => (button.hidden = false));
} else {
  button.textContent = 'VR not available';
}
