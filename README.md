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

## Multiplayer

Up to eight signed-in players share a lobby: they see and hear each other, and
the lobby's parrots, toys, bells and rings are the same for all of them.

- **Seeing each other.** Everyone playing in the same lobby sees the others'
  parrots move: head, wings, claws and body. Each game runs its own player and
  sends their pose fifteen times a second; the others are drawn a tenth of a
  second behind, so they move smoothly. Each player starts at their own place
  in the nest.
- **The lobby server.** One Cloudflare Durable Object per lobby, which every
  player there holds a WebSocket to, signed in with the same token as the
  rest. It passes messages on, settles who got a toy first, and remembers how
  the toys, bells and rings stand for whoever comes in next. Once the lobby is
  empty it forgets everything: the next player finds every toy where it
  started.

- **Voice.** Players in a lobby hear each other, always on: louder when
  closer, and from the direction of the other parrot. Each pair of players
  holds one WebRTC connection straight between their two headsets; the server
  only passes the few messages it takes to set one up, and never hears or
  keeps a voice between players. A voice is sent only while playing, never
  from the start screen. (What a player says to Kiki, the helper parrot, is
  the one thing the server does hear: see below.)

- **The lobby's parrots are the same for everyone.** One game runs them: the
  host's, which is whoever has been in the lobby longest. The others are sent
  where each parrot is and only show it. When the host leaves, the next
  player's game carries each parrot on from where it was. A mimic's squeaky
  repeat is heard only by the host, whose voice it copies.
- **Followers.** Everyone sees the pet that follows each other player. Its
  owner's game runs it. The pet corner stays your own: you see only your pets
  there.

- **Toys, bells and rings.** Picking up, dropping, taking from a beak,
  putting away, ringing and flying a ring happen for everyone. A toy two
  players bite at the same moment goes to whoever the lobby heard first. A
  toy that is let go is moved by the game of whoever let go of it, which tells
  the others where it is until it lies still; the same game moves any toy it
  knocks on the way. What a player was carrying goes back to where it started
  when they leave. Food put in the egg cup feeds the egg of the player who
  carried it there.

Not checked by the author of the code, because it needs two headsets: how
voices sound (echo, loudness, distance), connecting between two homes, and
the frame rate with a full lobby. Everything else was tested with unit tests
and two desktop browser windows.

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

## Kiki, the helper parrot (being built)

Design: [docs/plans/2026-11-12-ai-parrot-design.md](docs/plans/2026-11-12-ai-parrot-design.md).
All three steps are built: Kiki talks, follows a player and leads them to a
place, and starts a chat itself. It has not yet been run with its keys.

Kiki is a turquoise parrot with a pink crest, on its own stump in the nest of
the Aviary, beside the picture board. It is a kind robot parrot that answers
questions about the game, such as how to hatch an egg.

- **Talking to Kiki.** Stand within a few metres of Kiki and look at it. It
  turns to you. Say something; when you stop, it answers out loud in two or
  three seconds, and bobs as it speaks. Everybody in the lobby hears it, from
  where it is. One phrase is answered at a time.
- **Following and leading.** Ask Kiki to come with you and it flies after you
  and lands to your side, like the lobby parrots that follow. Ask where
  something is and it flies there and waits for you: the egg cup, the pet
  rail, a seed on the grass, the feeder, the toy box, the bird bath or the
  climbing gym. After a minute and a half, or when asked to stop, it flies
  back to its stump. It cannot carry anything. The host's game flies it, as it
  does the other lobby parrots.
- **Starting a chat.** When you come up to Kiki, whichever way you face, it
  greets you or asks a kind question: at most once in five minutes for each
  player, and never within half a minute of its last greeting. With nothing
  asked of it, Kiki also flies over to a player every two or three minutes,
  stays half a minute, and flies back. Nothing is heard for a greeting; your
  game only tells the server that you are near. A greeting is checked, counted
  and recorded like any reply.
- **What happens to a phrase.** The game cuts one phrase of at most 8 seconds
  from the microphone, only while you are close to Kiki and facing it, and
  sends it to the game's server. The server has Cloudflare turn it into text
  (Workers AI, Whisper) and drops the sound. The text goes to Claude Haiku
  (Anthropic), which writes Kiki's reply. A second, separate call to the same
  model checks what was said and the reply; plain rules in code check the
  reply as well. Then OpenAI's text-to-speech speaks the reply. OpenAI is sent
  Kiki's own words only, never a player's.
- **What Kiki may say.** Its instructions and everything it may say about the
  game are in `server/helperGuide.ts`. If the answer is not in that guide it
  says it does not know. A reply that fails a check is replaced by a fixed
  safe line and flagged for the owner.
- **Limits.** Each player may say 6 phrases a minute and 300 a day, and one
  lobby answers 600 a day; these are at the top of `server/helper.ts`. Past a
  limit Kiki is an ordinary parrot until the next day.
- **Records.** What was said to Kiki and what it answered is kept as text
  for 7 days and shown on the admin page, flagged talk first. No sound is
  kept anywhere. Deleting a player deletes what they said.
- **The switch.** The admin page switches Kiki off and on for every lobby,
  within half a minute. While it is off, or the server has no keys for it,
  no game sends it anything.
- **When something fails,** Kiki gives its own call and nothing else happens.

### Giving Kiki its keys

Kiki needs two secrets on the server. Without both, the game runs as before
and Kiki is silent. Hearing needs no secret: it uses the Workers AI binding
in `wrangler.jsonc`.

```bash
npx wrangler@4.160.0 secret put ANTHROPIC_API_KEY
```

```bash
npx wrangler@4.160.0 secret put OPENAI_API_KEY
```

On this PC, put the same two names in `.dev.vars`. `npm run dev:api` must
then be signed in to Cloudflare (`npx wrangler login`), since the hearing
runs there even in local work.

### Before changing what Kiki is told

`tests/helperLive.test.ts` says a list of tricky phrases to Kiki's real
instructions and the real model: tricks to change what it is, rude words,
questions with no answer in the guide, worrying things. It fails if any reply
breaks a rule. Run it by hand before a change to `server/helperGuide.ts` or to
the model goes live. It costs a few pence and needs an Anthropic key, so the
ordinary tests skip it. In PowerShell:

```powershell
$env:HELPER_LIVE_KEY = '<an Anthropic key>'; npm run test:helper
```

Read what it prints as well: a reply can pass every check and still be odd.

Not checked by the author of the code, because it needs the keys, a
microphone and a headset: the whole path from a spoken phrase to Kiki's voice,
how well small children are heard, how long an answer takes, and how its
voice sounds. Everything else was tested with unit tests and the desktop emulator.

## Places (being built)

Design: [docs/plans/2026-11-12-places-design.md](docs/plans/2026-11-12-places-design.md).
Step 1 of 5 is built: the gate, its board and the trip. The new places
themselves (Downham Market, London, New York) are not built yet, so for now
the gate leads to the test room and back.

- **The gate.** The big stone gate against the Aviary's far netting is open.
  With no place picked the sheet in it is dim, and going through does nothing.
- **The board.** A small board stands on the grass to the left of the gate,
  with a picture of every other place. Touch a picture with a hand or your
  beak: it gets a yellow frame, and the gate lights up and shows that place.
  The choice is your own; other players do not see it.
- **The trip.** Fly or walk through the lit gate. The view fades to black, the
  place is swapped, and the view fades back in with you on the step of that
  place's gate. You stay in VR. You leave the players in the old place and
  join those in the new one.
- **Coming home.** Every place has the same gate and board. The Aviary is the
  picture of a nest.
- **Which way you face.** The game never turns your view, so you arrive facing
  the way you flew in. The Aviary's gate is flown into heading away from the
  nest, and every other gate the opposite way, so on a trip from or to the
  Aviary the gate is behind you when you arrive.

Not checked on a real headset: how the fade feels, and whether a small child
finds the pictures easy to reach.

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
  server; your voice goes to the other players in your lobby; and what you
  say to Kiki, the helper parrot, while close to it and facing it goes to the
  game's server to be answered. Nothing else.

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
players cannot hear you (you still hear them), and Kiki cannot either. The
microphone is used for three things:

- **Mimicry.** Sound is only looked at while a parrot is listening; one phrase
  of at most three seconds is held in memory, played back once and dropped.
  None of it is stored or leaves the headset.
- **Voice.** While you are playing, your voice goes to the other players in
  your lobby, who are all players the owner has given a code. It goes straight
  from headset to headset (or through Cloudflare's relay, which only passes it
  on). Nothing is recorded, and the game's server never receives it.
- **Kiki, the helper parrot.** Only while you are close to it and facing it:
  one phrase at a time goes to the game's server, is turned into text and
  dropped. See "Kiki, the helper parrot" above for where the text goes.

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
| `src/comfort/` | Speed vignette, arm-reach measuring, and the fade to black between places |
| `src/flock/` | The lobby's own parrots: the pilot that flies them and their behaviour |
| `src/world/` | Toys, target places and bells; the action layer every world change goes through |
| `src/audio/` | Sounds, synthesized in code; the microphone; mimicry; the ear that hears what is said to the helper parrot |
| `src/lobbies/` | Lobby registry and one folder per lobby |
| `src/gate/` | The gate to the other places: its layout, rules, scenery and pictures, and the trip through it |
| `src/debug/` | In-headset debug panel |
| `src/dev/` | Desktop WebXR emulator (development builds only) |
| `src/net/` | Multiplayer: the line to the lobby server, the other players, and how a pose travels |
| `src/voice/` | Voice between the players in a lobby |
| `src/account/` | Signing in: the number pad on the start screen and the token the device keeps |
| `src/pets/` | The pet corner in the nest, and the pet that follows the player |
| `src/helper/` | The game's side of the helper parrot: when it listens, and playing its voice |
| `src/admin/`, `admin.html` | The owner's admin page |
| `shared/` | Pet DNA, tiers, breeding rules, the fixed pets, what the server sends, and what the game and the lobby say to each other; used by game and server |
| `server/` | The API on Cloudflare: rules, database layer and migrations; the lobby's rules and its Durable Object; the helper parrot's mind (`helper*.ts`) |
| `tests/` | Vitest unit tests |

## Art and audio sources

All art is built in code and all sounds are synthesized in code with the Web
Audio API; both are original to this project. There are no asset files. Any
third-party asset added later must be listed here with its licence.
