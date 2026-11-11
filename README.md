# Nova Pika

A browser VR game for Meta Quest where you are a parrot. Requirements:
[Nova Pika — VR Game Requirements (v1).md](<Nova Pika — VR Game Requirements (v1).md>).

Current state: **milestone 5 (The Aviary)**: the full first lobby, a 60 m
outdoor bird enclosure with a home tree and nest, eight climbing trees, a play
gym, a ring course, bells, a bird bath, a feeder, a toy box, nest shelves, a
closed portal and 28 toys. Movement is claws, wings and beak.

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

The game opens in the Aviary. Add `?lobby=test-room` to the address to load
the small test room instead; lobbies are picked by id from
`src/lobbies/registry.ts`.

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
- **Hands in open air are wings.**
  - Flap: sweep both arms down together. A few flaps gain a lot of height.
  - Glide: hold both arms out to the sides, roughly level.
  - Steer: lower one hand and raise the other; you turn toward the lower hand.
  - Dive: tuck the arms in or drop them to your sides. Spread them to pull out.
  - Catch: reach a hand onto a wall while flying and you stick to it.
- **The head is the beak.**
  - Bite: a toy near the beak glows. Pull either **trigger** to bite it; pull
    again to drop it (desktop: **B**).
  - Carry: the toy hangs low in front of your face, also in flight.
  - Place: drop a toy into the toy box for a chirp and a sparkle.
  - Peck: move your head (or a hand) into a bell to ring it. No button.
- **Grip** (optional): locks a touching hand to the surface.

## Things to do in the Aviary

- Fly the ring course round the home tree. Rings turn green as you pass.
- Tidy up: carry blocks, balls, knots and feathers to the toy box, or put them
  on the shelves above the nest.
- Feed: carry seeds and millet to the feeder.
- Ring every bell.
- Find the four shiny bottle caps hidden in hard-to-reach places.
- Splash in the bird bath.
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
| `src/world/` | Toys, target places and bells; the action layer every world change goes through |
| `src/audio/` | Sounds, synthesized in code |
| `src/lobbies/` | Lobby registry and one folder per lobby |
| `src/debug/` | In-headset debug panel |
| `src/dev/` | Desktop WebXR emulator (development builds only) |
| `src/net/`, `src/voice/` | Reserved for multiplayer and voice; empty in v1 |
| `tests/` | Vitest unit tests |

## Art and audio sources

All art is built in code and all sounds are synthesized in code with the Web
Audio API; both are original to this project. There are no asset files. Any
third-party asset added later must be listed here with its licence.
