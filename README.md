# Nova Pika

A browser VR game for Meta Quest where you are a parrot. Requirements:
[Nova Pika — VR Game Requirements (v1).md](<Nova Pika — VR Game Requirements (v1).md>).

Current state: **all eight v1 milestones are built.** You play as Nova, Pika,
a budgie, a macaw or a cockatoo in the Aviary, with claws, wings, beak,
stamina and stunts, among seven lobby parrots. The last milestone made it
startable by a child: a picture-only start screen, a picture board of the
moves, comfort settings and movement that fits short arms.

Not yet checked on a real headset by the author of the code: every milestone
was tested with unit tests and a desktop WebXR emulator only.

## Pets (being built)

Design: [docs/plans/2026-11-11-pets-design.md](docs/plans/2026-11-11-pets-design.md).
Step 1 of 4 is built: pet DNA, tiers, breeding rules and the pet models. Pets
are not in the game yet. Add `?lobby=pet-show` to the address to look at them:
the eight fixed pets stand on the front bar, and eight babies bred from pairs
of them on the bar behind.

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
Advanced → Proceed. Then press the big round play button.

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

## Starting, for a child

- **Start screen:** pictures only. It shows a parrot with its arms spread
  inside a clear ring, with the furniture pushed out, because flapping uses
  the full arm span. Below it is one big play button.
- **In the nest:** a board of six pictures shows the moves: flap, glide, turn,
  dive, climb and bite. Orange arrows are what your arms do; green arrows are
  what happens.
- **Arm reach:** the game learns how far the player can reach the first time
  they spread their arms, and scales the wing distances and flap speed to it,
  so a child's arms work as well as an adult's. `autoArmReach` switches it off.
- **Your parrot is remembered** on the device between visits. Nothing else is
  kept, and nothing is sent anywhere.

## Comfort

- The view is never turned or tilted by the game.
- Flying and falling speeds are capped.
- Above normal glide speed the edges of the view darken slightly.
  `comfortVignette` on the debug panel switches that off.

## Choosing a parrot

You start in the nest as Nova. In front of you are five perches, each with a
parrot on it: touch one with a hand or your beak to become that parrot. Nova
and Pika have the two golden perches in the middle. Species differ in looks,
size and voice only; all move by the same rules.

Nova's model is matched to the owner's photo of her. Pika looks much the same;
you tell her by her beak, which is greyer and has a dark stain on it. To change
either, edit `src/characters/roster.ts`.

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

## The lobby's own parrots

Seven parrots live in the Aviary: three budgies, two cockatoos and two macaws.

- They fly between perches, sit, look about, preen, hop and call to each other.
- Hold a seed or millet in your beak and one or two will come and may take it,
  then carry it to the feeder.
- Now and then one picks up a loose toy and carries it somewhere else.
- Two of them like to follow you for a while, then lose interest.
- They land to your side and steer round your head, to stay out of your view.

Each is the same kind of `Player` as you, fed by a script instead of a
headset, and it moves by the same claw and wing rules: it really flaps to
climb and glides to travel. The one difference is that a flap tires a lobby
parrot less (40% of the cost), since it flaps far more than a child would.

### Mimicry and the microphone

Two of the parrots copy you. When one is perched within a few metres it
sometimes listens, and repeats what you said in a higher, squeaky voice.

The game asks for the microphone once, when you press the play button. If you refuse,
everything else works the same; there is just no mimicry. The microphone is
used for nothing else. Sound is only looked at while a parrot is listening;
one phrase of at most three seconds is held in memory, played back once and
dropped. Nothing is stored and nothing leaves the headset.

## Things to do in the Aviary

- Fly the ring course round the home tree. Rings turn green as you pass.
- Tidy up: carry blocks, balls, knots and feathers to the toy box, or put them
  on the shelves above the nest.
- Feed: carry seeds and millet to the feeder.
- Ring every bell.
- Find the four shiny bottle caps hidden in hard-to-reach places.
- Splash in the bird bath.
- Hold **B** or **Y** for a moment: show or hide the debug panel (desktop:
  **P**). Add `?debug` to the address to have it open from the start.
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
| `src/comfort/` | Speed vignette and arm-reach measuring |
| `src/flock/` | The lobby's own parrots: the pilot that flies them and their behaviour |
| `src/world/` | Toys, target places and bells; the action layer every world change goes through |
| `src/audio/` | Sounds, synthesized in code; mimicry |
| `src/lobbies/` | Lobby registry and one folder per lobby |
| `src/debug/` | In-headset debug panel |
| `src/dev/` | Desktop WebXR emulator (development builds only) |
| `src/net/`, `src/voice/` | Reserved for multiplayer and voice; empty in v1 |
| `shared/` | Pet DNA, tiers, breeding rules and the fixed pets; for the game and, later, the server |
| `tests/` | Vitest unit tests |

## Art and audio sources

All art is built in code and all sounds are synthesized in code with the Web
Audio API; both are original to this project. There are no asset files. Any
third-party asset added later must be listed here with its licence.
