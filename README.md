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

## Multiplayer (being built)

Up to eight signed-in players share a lobby. Built so far:

- **Seeing each other.** Everyone playing in the same lobby sees the others'
  parrots move: head, wings, claws and body. Each game runs its own player and
  sends their pose fifteen times a second; the others are drawn a tenth of a
  second behind, so they move smoothly. Each player starts at their own place
  in the nest.
- **The lobby server.** One Cloudflare Durable Object per lobby, which every
  player there holds a WebSocket to, signed in with the same token as the
  rest. It only passes messages on; it keeps nothing once the lobby is empty.

- **Voice.** Players in a lobby hear each other, always on: louder when
  closer, and from the direction of the other parrot. Each pair of players
  holds one WebRTC connection straight between their two headsets; the server
  only passes the few messages it takes to set one up, and never hears or
  keeps a voice. A voice is sent only while playing, never from the start
  screen.

Still to come: shared lobby parrots and followers, shared toys.

Not checked by the author of the code, because it needs two headsets: how
voices sound (echo, loudness, distance), and connecting between two homes.

## Pets (being built)

Design: [docs/plans/2026-11-11-pets-design.md](docs/plans/2026-11-11-pets-design.md).
All four steps are built. A signed-in player has pets in the Aviary: one
follows them, two can be bred into an egg, and the egg hatches when it is fed.

- **Breeding.** Two pink heart perches stand either side of an egg cup. Touch
  one and your follower lands on it; choose another pet to follow you and land
  that on the other. An egg appears in the cup. The parents are not used up.
- **A friend's pet.** The friends' board shows one friend's pets at a time.
  With one of your own pets on a heart perch, touch a friend's pet: a
  see-through copy of it sits on the other perch with an hourglass until the
  friend answers. Touch it to take the request back.
- **Answering.** A friend's request shows over the middle of the rail: their
  pet, yours, a green tick and a red cross. Saying yes costs you nothing.
- **Hatching.** Carry three seeds or millet to the egg cup. The egg rocks and
  cracks with each, and hatches on the third. The baby flies to the rail.
- **Setting a pet free.** Three steps, so it cannot happen by accident: make
  the pet your follower, touch the goodbye perch so that it lands there, then
  hold a hand on each of the two pads for three seconds while a ring fills.
  The pet flies away. For 30 days the admin page can bring it back. A
  player's last pet can never be set free.

- **The pet corner.** A rail on one side of the nest, across from the parrots
  you can be. A signed-in player's pets sit along it, six at a time, each on a
  band coloured for its tier: grey, green, blue, purple, gold, and a rainbow
  for a mythical. With more than six pets, orange arrows at the ends of the
  rail turn the page. Signed out, the rail shows a padlock; with no
  connection, a crossed-out cloud.
- **The follower.** Touch a pet with a hand or your beak and it follows you:
  it flies after you, lands to one side, and watches you. The pet that was
  following flies back to its place on the rail. The server decides who
  follows; if it says no, the pet shakes its head and nothing changes. The
  follower is still with you the next time you play.
- **Pet DNA, tiers, breeding rules and models.** Add `?lobby=pet-show` to the
  address to look at them: the eight fixed pets stand on the front bar, and
  eight babies bred from pairs of them on the bar behind.
- **A small server** that keeps players and their pets.
- **Sign-in.** Nobody plays without signing in. Signed out, the play button
  shows a key and opens a number pad for a player's 6-digit code. It is typed
  once; the headset then stays signed in. With no connection the button shows
  a crossed-out cloud; pressing it tries again.
- **The admin page**, at `/admin` (`/admin.html` on the dev server). It asks
  for the admin password, then lets you add and delete players, regenerate
  their codes, give or remove pets, and bring back a pet that was set free.
  A code is shown once, when it is made. Deleting a player takes their pets
  with them and cannot be undone.

### Running the server on this PC

Copy `.dev.vars.example` to `.dev.vars` once; it holds a password for the
local admin page only. Then run the server beside the game:

```bash
npm run dev:api
```

It keeps its own test database under `.wrangler/`, apart from the real one.

### Putting the server on Cloudflare

Do these once, in this order. The first asks you to type the admin password;
choose a long one and keep it somewhere safe.

```bash
npx wrangler@4.160.0 secret put ADMIN_PASSWORD
```

```bash
npm run deploy
```

```bash
npm run db:remote
```

The first deploy creates the database and writes its id into
`wrangler.jsonc`; commit that change. After that, `npm run deploy` is enough,
followed by `npm run db:remote` whenever `server/migrations` has a new file.

#### The voice relay (optional)

Two players' headsets normally connect straight to each other for voice. Some
home and mobile networks do not allow that; a relay (TURN) gets round it.
Without one, those players see each other but cannot hear each other.

In the Cloudflare dashboard, under Realtime, create a TURN key. Then give its
two values to the server:

```bash
npx wrangler@4.160.0 secret put TURN_KEY_ID
```

```bash
npx wrangler@4.160.0 secret put TURN_KEY_API_TOKEN
```

The key stays on the server. Each signed-in player is handed a pass for the
relay that lasts a day. The first 1,000 GB a month are free.

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
- **Your parrot is remembered** on the device between visits. If a player has
  signed in, so is their sign-in. Nothing else is kept on the device. What
  leaves it: sign-in, pets and where your parrot is go to the game's own
  server; your voice goes to the other players in your lobby, and nowhere
  else.

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

### Mimicry, voice and the microphone

Two of the parrots copy you. When one is perched within a few metres it
sometimes listens, and repeats what you said in a higher, squeaky voice.

The game asks for the microphone once, when you press the play button. If you
refuse, everything else works the same; there is no mimicry, and the other
players cannot hear you (you still hear them). The microphone is used for two
things:

- **Mimicry.** Sound is only looked at while a parrot is listening; one phrase
  of at most three seconds is held in memory, played back once and dropped.
  None of it is stored or leaves the headset.
- **Voice.** While you are playing, your voice goes to the other players in
  your lobby, who are all players the owner has given a code. It goes straight
  from headset to headset (or through Cloudflare's relay, which only passes it
  on). Nothing is recorded, and the game's server never receives it.

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
| `src/audio/` | Sounds, synthesized in code; the microphone; mimicry |
| `src/lobbies/` | Lobby registry and one folder per lobby |
| `src/debug/` | In-headset debug panel |
| `src/dev/` | Desktop WebXR emulator (development builds only) |
| `src/net/` | Multiplayer: the line to the lobby server, the other players, and how a pose travels |
| `src/voice/` | Voice between the players in a lobby |
| `src/account/` | Signing in: the number pad on the start screen and the token the device keeps |
| `src/pets/` | The pet corner in the nest, and the pet that follows the player |
| `src/admin/`, `admin.html` | The owner's admin page |
| `shared/` | Pet DNA, tiers, breeding rules, the fixed pets, what the server sends, and what the game and the lobby say to each other; used by game and server |
| `server/` | The API on Cloudflare: rules, database layer and migrations; the lobby's rules and its Durable Object |
| `tests/` | Vitest unit tests |

## Art and audio sources

All art is built in code and all sounds are synthesized in code with the Web
Audio API; both are original to this project. There are no asset files. Any
third-party asset added later must be listed here with its licence.
