# Nova Pika

A browser VR game for Meta Quest where you are a parrot. Requirements:
[Nova Pika — VR Game Requirements (v1).md](<Nova Pika — VR Game Requirements (v1).md>).

Current state: **milestone 2 (claws)**: hand-push movement and climbing in a
test room with blocks, a wall and a pole.

## Run

```bash
npm install
```

On the Quest (same Wi-Fi as this PC):

```bash
npm run cert
```

```bash
npm run dev
```

Open the `Network:` HTTPS address it prints in the Quest Browser. The
certificate is self-signed, so the browser warns once: choose
Advanced → Proceed. Then press **Enter VR**.

On the desktop, with an emulated headset (no HTTPS needed):

```bash
npm run dev:local
```

Tests and checks:

```bash
npm test
```

```bash
npm run build
```

## Controls so far

- **Hands on a surface are claws.** Push against the ground, a block, the
  wall or the pole and the body moves the other way. Push fast and let go to
  jump. Reach up, pull down, and repeat with the other hand to climb.
- **Grip** (optional): locks a touching hand to the surface.
- **B** or **Y**: show or hide the debug panel (desktop: **P**).
- Point at a − / + button on the panel and pull the **trigger** to change a
  movement value live (desktop: click with the mouse).

## Layout

| Path | What |
| --- | --- |
| `src/config/movement.ts` | Every movement constant, with unit and comment |
| `src/engine/` | Renderer, fixed-timestep loop, physics wrapper |
| `src/player/` | `Player` state, headset input, player rendering |
| `src/movement/` | Movement rules as pure functions of state, input and world queries |
| `src/lobbies/` | Lobby registry and one folder per lobby |
| `src/debug/` | In-headset debug panel |
| `src/dev/` | Desktop WebXR emulator (development builds only) |
| `src/net/`, `src/voice/` | Reserved for multiplayer and voice; empty in v1 |
| `tests/` | Vitest unit tests |

## Art and audio sources

All art so far is generated in code and original to this project. No audio
yet. Any third-party asset added later must be listed here with its licence.
