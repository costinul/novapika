# Nova Pika — VR Game Requirements (v1)

Nov 10, 2026 · @Costinu

## 1. Overview

Nova Pika is a browser-based VR game for Meta Quest where the player is a parrot that climbs, flies and carries things. Movement is inspired by Gorilla Tag: the player's own arm movements drive everything.

The game is for the owner's son. It is named after the family's two cockatiels, Nova and Pika (both female), who are the star characters.

**Goal of v1:** one single-player lobby where climbing, flying and carrying toys feel good in the headset. Nothing else matters until that is true.

**Design pillars**

- **Button-free movement.** Arms and head do the moving. Buttons only add supporting actions.
- **One body, three tools.** Hands are wings in open air and claws on a surface. The head is the beak.
- **Built for a child.** Easy to learn, generous physics, no reading needed to play. Sign-in is a 6-digit code from the owner, needed to play, and no personal data is collected.
- **Built to grow.** More lobbies, more parrot species and multiplayer with voice must be addable later without a rewrite.

**Originality:** only the movement style is inspired by Gorilla Tag. Do not copy its name, art, maps, sounds or code.

## 2. Tech stack

These choices are fixed. Do not substitute alternatives without asking the owner.

| Layer | Choice | Notes |
| --- | --- | --- |
| Platform | WebXR in the Meta Quest Browser | Must also run in any WebXR browser; no Meta-only APIs in core code |
| Language | TypeScript, strict mode |  |
| 3D engine | Three.js |  |
| Physics | Rapier (WebAssembly) | Used for collision queries and toy physics; player movement is custom code |
| Build | Vite | Dev server must serve HTTPS so the headset can connect over the local network |
| Tests | Vitest | Movement maths tested with synthetic hand traces, no headset needed |
| Desktop testing | A WebXR emulator in the desktop browser | So the agent can run and check the game without a headset |
| Hosting | Cloudflare: static files, plus a Worker API with a D1 database | The API keeps players and pets only; the game plays without it. See `docs/plans/2026-11-11-pets-design.md` |
| Multiplayer | Cloudflare Durable Objects with WebSockets | Being built: see the README |
| Voice | WebRTC, headset to headset | Built: see the README |
| Later: store | Packaged as a PWA for the Meta Horizon Store | Not in v1 |

## 3. Architecture rules

v1 is single-player with one lobby, but the code must be shaped so that more lobbies and multiplayer plug in later.

**Lobbies are data, not engine code**

- Each lobby is a self-contained module: geometry, spawn points, toys, activities, lighting and sounds.
- A lobby registry lists the available lobbies. Adding a lobby means adding one folder and one registry entry, with no engine changes.
- The engine loads and unloads a lobby by id. v1 ships one lobby plus a visible but closed portal as the hook for future ones.

**The player is "just another player"**

- A generic Player holds all state: head pose, both hand poses, velocity, movement state, stamina, carried item and character id.
- The local player is one Player instance fed by the headset. Later, remote players are the same class fed by the network.
- Rendering only reads Player state. It never reads the headset directly.

**World changes go through actions**

- Every toy and interactive object has a stable id.
- Pick up, drop, place and ring are named actions passed through one action layer. Later a server can approve or reject them.

**Simulation**

- Movement and physics run on a fixed timestep, separate from rendering.
- Movement logic is pure functions of (state, input, world queries), so it can be unit tested.

**Tuning**

- Every movement constant lives in one config file with a name, unit and comment.
- An in-headset debug panel can change these values live and show the current movement state. Tuning by feel is the main work of this project.

**Reserved for later**

- Keep empty, documented places for networking and voice. Write no networking code in v1.

## 4. Controls and movement

Context decides what a hand is: touching a surface makes it a claw, open air makes it a wing. There is no mode switch.

| Body part | Input | Does |
| --- | --- | --- |
| Wings | Hands in open air | Flap, glide, steer, dive |
| Claws | Hands touching a surface | Push, pull and climb |
| Beak | Head position | Reach objects to bite; peck things |
| Support: hold | Grip button | Lock a touching hand to the surface, to perch or hang |
| Support: bite | Trigger button (either hand) | Bite or release the object at the beak |

The game must be fully playable for movement without pressing any button.

### Claws: climbing and ground movement

- Each hand has a small sphere collider. While it touches a surface, the hand stays planted and the body moves opposite to the hand's motion.
- When the hand leaves the surface, the body keeps its velocity. A fast push gives a jump.
- This works the same on the ground, trunks, branches, ropes and walls. All surfaces are climbable unless a lobby marks them otherwise.
- On the ground the player moves by hand pushes and short flap-hops. There is no thumbstick walking.

### Wings: flying

- **Flap:** lift is applied only when both hands sweep downward together, above a speed threshold, within a short time window, and neither hand is touching a surface.
- Lift grows with flap speed up to a cap. Each flap also gives a little forward push in the direction the head faces.
- **Glide:** both arms held out to the sides and roughly level while airborne. Gravity is reduced and the player moves forward.
- **Steer:** bank by lowering one hand and raising the other. The player turns toward the lower hand.
- **Dive:** arms down or tucked in. Normal gravity applies and speed builds.
- Alternating hand movement, as in climbing, must never produce lift.

### Transitions

1. **Take-off:** push off the ground for a hop, then flap. A strong flap from standing also lifts off.
2. **Landing on the ground:** stop flapping and glide down. When the body touches a walkable surface, the player is standing.
3. **Landing on a wall or branch:** the first hand to touch a surface "catches". Most of the incoming speed is absorbed over a short moment so the player sticks, not bounces.
4. **Launching from a perch:** push off with the claws, then spread the arms to glide or flap.

### Support: hold (grip)

- While grip is pressed and that hand touches a surface, the hand locks to it. The player can hang and swing below it.
- Releasing grip lets go. Hold is optional and never required to climb.

### Beak

- The beak is a small collider just in front of and below the headset. Its tip is visible at the bottom of the view.
- A biteable object within reach is highlighted. Trigger bites it; trigger again drops it.
- A carried object hangs in front of the face, low enough not to block the view. One object at a time.
- Moving the head into a peckable object, such as a bell, triggers it without any button.

### Stamina

- Flapping drains stamina. Gliding does not. Standing, perching or hanging refills it quickly.
- At zero stamina, flaps give only weak lift, enough to soften a fall.
- Show stamina without text, for example as a colour change on the wing tips.
- It must be tunable and switchable off in config.

### Starting values (to be tuned in the headset)

| Constant | Start at |
| --- | --- |
| Flap speed threshold | 1.5 m/s downward |
| Both-hands time window | 150 ms |
| Maximum flying speed | 8 m/s |
| Glide sink rate | 1 m/s |
| Catch absorb time | 0.2 s |
| Full flaps from full stamina | 12 |
| Stamina refill time | 3 s |

## 5. Stunts

Stunts come from the same wing rules, not from separate buttons. The player discovers them by moving.

### One-wing roll (required)

- While airborne, if one arm stays out and the other stops or tucks in, the parrot rolls toward the tucked wing and loses lift.
- The result is a falling spiral. Spreading both arms again levels out and recovers the glide.
- **The player's view stays level.** The roll is shown on the parrot's body, wings and shadow, and felt through the curved falling path, wind sound and speed. Rotating the camera itself causes motion sickness quickly.
- A full camera roll may exist as a setting, off by default.

### Other stunts

| Stunt | How the player does it |
| --- | --- |
| Dive bomb | Tuck both arms to dive, then spread them to pull out |
| Barrel roll | One-wing roll, then swap arms quickly to roll the other way |
| Swoop | Dive, pull out close to the ground and keep the speed |
| Ring pass | Fly through a hanging ring without touching it |
| Perch landing | Catch a branch at speed and come to rest on it |

### Stunt system

- Each stunt is a small recogniser that watches movement state and emits an event with the stunt's name.
- New stunts are added as new recognisers, with no change to movement code.
- v1 feedback is a happy chirp and a puff of feathers. No scores or leaderboards in v1.

## 6. The lobby

v1 has one lobby, working name **The Aviary**: a giant outdoor bird enclosure full of trees and parrot toys.

**Size and bounds**

- About 60 m by 60 m, and 25 m high. Big enough for a long glide and a proper dive.
- The boundary is climbable netting, like a real aviary. The player can never leave or fall out of the world.

**What is in it**

- **Home tree:** a large central tree with a nest where the player spawns.
- **Climbing trees:** 6 to 10 more trees of different heights, with thick branches to perch on and trunks to climb.
- **Play gym:** ladders, ropes, swings and hanging perches, like a giant version of a pet parrot's play stand.
- **Ring course:** hanging rings at different heights, forming a flying route around the lobby.
- **Bells:** hanging bells that ring when pecked or hit.
- **Bird bath:** a shallow pond with splash sounds and effects.
- **Feeder:** a feeding station where seeds can be delivered.
- **Toy box and nest shelves:** places to put toys.
- **Portal perch:** a visible, closed doorway to future lobbies.

**Things to do**

- Fly the ring course.
- Tidy up: carry scattered toys to the toy box or decorate the nest.
- Feed: carry seeds and millet to the feeder.
- Ring every bell.
- Explore: a few hidden shiny objects in hard-to-reach places reward good climbing and flying.

**Look and sound**

- Low-poly, bright, flat colours, friendly shapes. Simple lighting with no real-time shadows; use a soft blob shadow under the player and toys.
- Daytime sky. Gentle background sounds: leaves, distant birds.
- All art and audio must be original or free to use commercially. Keep a list of sources and licences.

## 7. Toys and carrying

The lobby holds 20 to 30 small objects the player can bite, carry and put somewhere else.

| Toy | Behaviour |
| --- | --- |
| Bell balls | Roll and jingle when moved or dropped |
| Wooden blocks | Stack on shelves and in the nest |
| Rope knots | Light, swing from the beak when carried |
| Shiny bottle caps | Hidden collectables that glint from a distance |
| Millet sprays and seeds | Deliver to the feeder |
| Feathers | Float down slowly when dropped |

**Rules**

- Toys are light physics objects. They can be dropped in flight and will fall and bounce.
- A toy that leaves the lobby or sits untouched in an unreachable spot returns to its start position after a while.
- Target places (toy box, nest shelves, feeder) detect a toy placed in them and respond with a chirp and a sparkle.
- Toy types and target places are defined as data in the lobby module, so a new lobby can bring its own.
- Each toy keeps its stable id and current holder, ready for multiplayer and for stealing from another parrot's beak later.

## 8. Characters

v1 has four parrot species to play as. Nova and Pika, two female cockatiels, are the stars of the game. The lobby is also home to computer-controlled parrots.

**Cockatiel look**

- Slim body, long tail, a tall crest on the head and round orange cheek patches.
- Nova and Pika must be clearly different from each other. Their exact colours come from the owner (see open questions).
- The crest is expressive: it rises when flying fast or doing a stunt and relaxes when perched.

**Choosing a character**

- At the spawn nest the player picks a parrot by touching its perch. Nova and Pika have the two central perches. Pictures only; no reading needed.

**What the player sees of themselves**

- Wings that follow the hands, feathers spreading when the arms are out.
- Claws at the hands when touching a surface.
- The beak tip at the bottom of the view, and the parrot's shadow on the ground.
- A full body model exists from the start, so other players can see it later.

**Sounds**

- Cockatiel-style whistles and chirps for take-off, landing, stunts and placing toys.

**Characters are data**

- A character is data: model, colours, sound set and size, on a shared skeleton.
- Further species are added as new character entries. Nova and Pika stay the special, most valuable characters in the roster.

### Species in v1

| Species | Size | Look |
| --- | --- | --- |
| Cockatiel (Nova, Pika) | Small to medium | Tall crest, orange cheek patches, long tail |
| Budgie | Smallest | Green and yellow or blue, striped head |
| Macaw | Largest | Long tail, bold red, blue and yellow |
| Cockatoo | Large | White, with a big yellow crest |

- In v1 species differ in looks, size and sounds only. All move by the same rules.
- Different abilities per species may come later.

### Models

- The coding agent builds all parrot models in code as simple low-poly shapes. Prototype quality is accepted.
- Models sit behind the character data, so better art can replace them later without code changes.

### Lobby parrots (computer-controlled)

The lobby has 6 to 8 parrots of mixed species that live there on their own, so it never feels empty.

- They fly between perches, land, preen, hop and call to each other.
- They come close when the player holds a seed or millet in the beak, and may take it.
- Now and then one picks up a loose toy and carries it somewhere else.
- One or two will follow the player for a while, then lose interest.
- They keep clear of the player's face and never block the view.
- Behaviour is scripted with simple states and timers. No language model in v1.
- A lobby parrot is the same Player class as the human player, fed by a behaviour script. It obeys the same movement rules.

### Mimicry

- A lobby parrot near the player sometimes records a few seconds of what the player says and repeats it in a higher, squeaky voice.
- This uses the headset microphone. For mimicry, audio is kept in memory for a few seconds, never stored and never sent anywhere. (Since multiplayer, the same microphone also carries the player's voice to the other players in the lobby.)
- The game asks for microphone permission once and works fully if it is refused.

## 9. Comfort, safety and performance

**Comfort**

- The game never rotates or tilts the player's view on its own. The horizon always stays level.
- Flying and falling speeds are capped.
- At high speed the edges of the view darken slightly. This can be switched off.
- Flapping is generous: a few flaps give a lot of height, so arms do not tire quickly.
- Movement scales to the player's arm reach, so a child and an adult can both play.

**Safety**

- On start, show a picture-based reminder to clear space around the player, because flapping uses the full arm span.
- No ads and no personal data. The game's network calls are to its own server, for sign-in, pets and the lobby; that server keeps a nickname, pets, eggs and DNA requests. The microphone is used for mimicry, on the headset, and for voice, which goes only to the other players in the lobby and is never recorded.

**Performance**

- Hold the headset's native frame rate (72 fps or better) at all times in the full lobby.
- Budget: under 100 draw calls and under 150,000 visible triangles. Share materials and use texture atlases.
- The lobby loads in a few seconds on the headset's Wi-Fi.
- Show a frame-rate readout in the debug panel.

## 10. Out of scope for v1

Do not build these yet. The architecture in section 3 keeps the door open for each.

- Multiplayer and tag game modes
- Voice chat
- Additional lobbies
- Different abilities per species
- Talking parrots driven by a language model
- Store packaging, purchases
- Controller-free hand tracking
- Scores, leaderboards and progression

## 11. Milestones and acceptance

Build in this order. Stop after each milestone and wait for the owner to test in the headset before starting the next. The agent cannot judge how movement feels; only the headset test can.

| # | Milestone | Accepted when |
| --- | --- | --- |
| 1 | **Skeleton:** project set up, enter VR in an empty test room, debug panel, config file, desktop emulator run | The owner opens an HTTPS link on the Quest, enters VR, sees hands and the debug panel; unit tests run |
| 2 | **Claws:** hand-push movement and climbing in a test room with blocks, a wall and a pole | The player can cross the floor, jump by pushing, and climb the wall and pole without buttons |
| 3 | **Wings:** flap, glide, steer, dive and all four transitions | The player can take off, circle the room, land on the floor and catch a wall; climbing never causes lift |
| 4 | **Beak and toys:** bite, carry, drop, peck, target places | The player can carry a toy across the room in flight and place it in a toy box; a bell rings when pecked |
| 5 | **The Aviary:** the full lobby loaded through the lobby registry, with all contents from sections 6 and 7 | Everything listed is present and reachable; frame rate holds; a second empty test lobby loads by changing only its id |
| 6 | **Stunts, stamina and characters:** one-wing roll, other stunts, stamina, the four species with Nova and Pika, character choice | The roll works with a level view and recovers; stamina forces an occasional perch; the player can choose any of the four species, including Nova or Pika |
| 7 | **Lobby parrots:** the scripted flock and mimicry from section 8 | 6 to 8 parrots move around the lobby on their own, come to a held seed and sometimes move a toy; one repeats the player's words; frame rate holds |
| 8 | **Polish:** sounds, effects, comfort options, space reminder | The owner's son can start and play without help |

**Rules for the agent**

- After each milestone, report what was built, how to test it, and which config values most affect the feel.
- When the owner reports how something feels, change config values first and code second.
- Keep unit tests for the movement rules in section 4, including "alternating hands never produce lift".
- Ask before adding any dependency not listed in section 2.

## 12. Open questions for the owner

None of these block milestones 1 to 4.

- [ ] Which Quest model will the game be played on?
- [ ] What do Nova and Pika look like? Colours and markings, or photos, so the two models can match the real birds.
- [ ] How old is your son? This sets arm-reach scaling and how forgiving the flying should be.
- [ ] Is "The Aviary" the right theme for the first lobby, or should it be something else, such as a jungle or your own garden?
- [ ] Should stamina be on from the start, or off until he asks for more challenge?
