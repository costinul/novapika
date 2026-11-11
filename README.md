# Nova Pika

A browser VR game for Meta Quest where you are a parrot. Requirements:
[Nova Pika — VR Game Requirements (v1).md](<Nova Pika — VR Game Requirements (v1).md>).

Current state: **milestone 6 (stunts, stamina and characters)**. The Aviary
lobby, with claws, wings and beak, now has stamina, the one-wing roll and other
stunts, and five parrots to play as: Nova and Pika the cockatiels, a budgie, a
macaw and a cockatoo.

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

## Choosing a parrot

You start in the nest as Nova. In front of you are five perches, each with a
parrot on it: touch one with a hand or your beak to become that parrot. Nova
and Pika have the two golden perches in the middle. Species differ in looks,
size and voice only; all move by the same rules.

Nova's model is matched to the owner's photo of her. Pika is a placeholder (a
plain grey hen) until her colours are known. To change either, edit
`src/characters/roster.ts`.

## Stamina and stunts

- **Stamina:** each flap spends some; gliding spends none. Standing, perching
  or hanging refills it in about three seconds. Your wing tips turn red as it
  runs out, and with none left a flap only softens a fall. `staminaEnabled` on
  the debug panel switches it off.
- **One-wing roll:** in the air, keep one arm out and tuck the other in. The
  parrot rolls toward the tucked wing and falls in a spiral; spread both arms
  to level out. Your view stays level throughout.
- **Other stunts** are found by moving, not by buttons: dive bomb, barrel
  roll, swoop, ring pass and perch landing. Each earns a chirp and a puff of
  feathers. There are no scores.

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
| `src/characters/` | The roster of parrots as data, and the code that builds their models |
| `src/stunts/` | One small recogniser per stunt |
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
