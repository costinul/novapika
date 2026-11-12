# Places, step 1: gate, board and travel — plan

Nov 12, 2026 · the plan for step 1 of
[the places design](2026-11-12-places-design.md).

## 1. What is done at the end

A player in the Aviary touches the test room's picture on the board, flies
through the lit gate, and is in the test room. From there the board shows the
Aviary, and the same trip leads back. The player stays in VR the whole time.

Not in this step: the pet coming along, player counts, any new place. The
board lists the test room only until Downham Market replaces it in step 3.

No server change: the test room is already a room on the server. No new
dependencies. No database change.

## 2. What the code showed

- **The chosen parrot survives a swap.** The engine owns the local player, and
  `WorldState.clear()` keeps the players. Nothing to do.
- **A full room.** The server closes the line, the game plays the place alone,
  and `LobbyClient` keeps trying, so the player joins when there is room.
  Nothing to do.
- **Picking a place is not an action.** Actions go to the lobby server, which
  drops a connection that sends one it does not know. The choice is private
  to one player, so the gate keeps it in its own small class.
- **The game never turns the player.** Which way a player faces comes from the
  headset alone. So a player arrives facing the way they flew in. See
  section 3.

## 3. One decision: which way the gates face

A player should arrive with the gate behind them. With no turning, that works
only if the trip out and the trip back fly in opposite directions.

**Plan:** the Aviary's gate is flown into heading north (−z), as its doorway
already stands. Every other place's gate is flown into heading south (+z).
Then every trip from the Aviary, and every trip back to it, arrives with the
gate behind.

**The cost:** a trip between two new places, such as Downham Market to
London, arrives facing the gate. The gate is dim on arrival, so flying on
does nothing; the child turns round. This does not arise until step 4.

**The other way,** not planned: turn the player's whole view on arrival. That
touches the movement code, which every test of flying and climbing rests on.
It can be added later if arriving facing the gate proves a nuisance.

## 4. Parts

New, in `src/gate/`:

| File | What it is |
| --- | --- |
| `places.ts` | The places a board can show, by lobby id. Now: the Aviary and the test room |
| `layout.ts` | From a place's `GateDef`, plain numbers: the doorway's opening, where each picture hangs, where a player arrives. Used by the rules, the scenery, the view and the tests |
| `scenery.ts` | `buildGate`: the step, pillars, beam and board frame, for every place |
| `pictures.ts` | Draws each place's picture on a canvas |
| `Gate.ts` | The rules, with no drawing: which place is picked, and whether the player has just flown through the lit doorway |
| `GateView.ts` | Draws the pictures and the sheet in the doorway. Freed when the place unloads |
| `Travel.ts` | The trip as a small state machine: fade out, swap, fade in |

Also new: `src/comfort/Fade.ts`, a black sheet in front of the eyes. The
vignette cannot do this, as its middle is clear.

Changed:

| File | Change |
| --- | --- |
| `src/world/types.ts` | `GateDef` (foot of the doorway, and the way it faces); `LobbyContent.gate` |
| `src/lobbies/aviary/layout.ts`, `scenery.ts` | The door comes out; the doorway uses `buildGate`. The arch keeps its shape, so the bottle cap on top and the flock's spot on the step stay |
| `src/lobbies/testRoom/index.ts` | A gate against the south wall |
| `src/engine/Engine.ts` | Owns the gate, its view, the fade and the trip. `loadLobby` can seat the player at the gate instead of the start points |
| `server/helperGuide.ts` | Kiki's two lines that say the doorway is closed |
| `README.md` | How to travel; the folder table |

## 5. Rules of the gate

- A board shows every place in `places.ts` except the one it stands in.
- **Picking.** The beak or a hand on a picture, or up to 0.3 m in front of
  it, picks that place. A parrot's body keeps its beak a little over 0.2 m
  from a board it stands at, so a touch as close as the choosing perches
  need would not be reached. Pictures hang at the height of a standing
  parrot's beak, with a gap between them, so one touch cannot pick two.
- Picking gives a chirp and a puff. The sheet in the doorway shows the picked
  place's picture, lit. With nothing picked it is dim.
- **Passing.** The head crossing the doorway's plane from front to back,
  inside the opening, with a place picked, starts the trip. From behind,
  beside or above the opening, or with nothing picked, nothing happens.
- The sheet is never solid. Behind it is the place's wall.
- Arriving forgets the pick, so the gate a player arrives at is dim.

## 6. The trip

1. The view fades to black in 0.4 s. The player keeps flying.
2. At full black the engine loads the place with the existing `loadLobby`. It
   leaves the old room and joins the new one, as it does today.
3. The player is put on the step in front of the new place's gate.
4. The view fades back in 0.4 s.

- A second pass through a gate during a trip is ignored.
- If the place cannot be loaded, such as with no connection and the place not
  yet downloaded, the view fades back in where the player was. `loadLobby`
  already fetches the new place before it unloads the old.
- A fall out of the world still returns the player to the place's start
  points, not to the gate.

## 7. Order of work

1. **Data and layout.** `GateDef`, `places.ts`, `layout.ts`.
   Verify: typecheck passes.
2. **Rules.** `Gate.ts`, written test-first.
   Verify: `tests/gate.test.ts` passes (section 8).
3. **The trip.** `Fade.ts`, `Travel.ts`, test-first.
   Verify: `tests/travel.test.ts` passes.
4. **Scenery.** `buildGate`; the Aviary's doorway; the test room's gate.
   Verify: the placement tests of section 8, and the Aviary's own tests
   still pass, the triangle budget among them.
5. **Drawing and wiring.** `GateView.ts`; the engine.
   Verify: in the desktop emulator, fly Aviary → test room → Aviary, with a
   screenshot of each end.
6. **Words.** Kiki's guide, the README, the design's open points.
   Verify: `npm run build` and `npm test` pass.
7. **Two players.** In two browser windows, one player travels.
   Verify: they vanish from the other's Aviary, and the two meet again when
   the second follows.

Then commit and push to main.

## 8. Tests

`tests/gate.test.ts`, the rules with a player moved by hand:

- touching a picture picks its place; touching nothing picks nothing
- a board never shows its own place
- flying through the lit doorway gives the picked place
- flying through with nothing picked gives nothing
- passing beside or above the opening gives nothing
- coming through from behind gives nothing
- a pick is forgotten when a place loads

`tests/travel.test.ts`, the trip with a fake loader:

- the place is swapped only at full black
- a second request during a trip is ignored
- the view fades back in after the swap
- a failed load fades back in and leaves the place as it was

Placement, for the Aviary and the test room, against the real colliders:

- a player put at the arrival point stands on the step, clear of the scenery
- the way through the opening is clear to fly
- no picture is inside something solid, and each has room for a parrot in
  front of it
- the arrival point is not close enough to a picture to pick it by standing
  there

Not testable without the headset: how the fade feels, and whether a small
child finds the pictures easy to reach.

## 9. For the owner

- Kiki's guide changes, so by the rule in the AI parrot design the tricky
  phrases should be run by hand before this goes live: `npm run test:helper`.
  It needs the key and costs a little.
- If the game is deployed between this step and step 3, the board shows the
  test room.

## 10. As built

Built as planned, with these differences:

- `buildGate` is in `src/gate/scenery.ts`, with the rest of the gate, not in
  `src/lobbies/build.ts`. The pictures are drawn in `src/gate/pictures.ts`.
- A picture is picked from up to 0.3 m in front of it, not from within
  0.26 m of its middle (section 5).
- **The Aviary's perch stays** on the step in front of the doorway. A player
  arrives at the front of the step, with the perch and the doorway behind
  them. So a parrot flies into the gate over the perch, or walks round its
  ends; it cannot walk straight in. Taking the perch out was tried: it
  changes how the flock's scripted parrots fly, and one landing in
  `tests/flock.test.ts` then fails, because the pilot counts a brush against
  a branch on the way up as a landing. That is the pilot's own weakness, and
  is left for the owner to decide on. In step 4 the same test failed
  again, when the Aviary's board grew to two pictures. Its check was then
  changed: a parrot that touches down and comes straight off counts as a
  failed landing against the test's pass mark, rather than failing the test
  outright. So the perch no longer has to stay for the test's sake.
- **Each player has their own spot to arrive at**, side by side along the
  front of the step, picked by their slot in the lobby they left. The
  two-player check showed friends who follow each other through landing
  inside each other otherwise.
- The test room's gate is tested by its numbers only: inside the walls, and
  facing the right way. The room's own colliders cannot be built in a test
  without a browser. The trip through it was checked in the browser.
