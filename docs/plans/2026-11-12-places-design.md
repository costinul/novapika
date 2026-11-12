# Places and the gate — design

Nov 12, 2026 · agreed with the owner in a brainstorming session.

## 1. Summary

The game gets three new places to fly in: Downham Market, London and New York.
The shut portal in the Aviary becomes an open gate. A picture board beside it
lets a player choose where to go. Every place has the same gate and board, so
a player can go on to another place or back to the Aviary.

The game says "place". The code keeps the word "lobby".

## 2. Decisions

| Question | Decision |
| --- | --- |
| What a player does in a place | Explores, and plays with the same kinds of toys as in the Aviary |
| How real a place looks | Toy-town: a few landmarks a child knows, in the game's own shapes. Not to scale |
| First places | Downham Market, London, New York |
| Choosing a place | Touch a picture on a board, then fly through the gate |
| Friends | Each player travels alone. One room of up to 8 per place |
| Player counts | The board shows how many parrots are in each place |
| Nest things, Kiki | Only in the Aviary |
| What comes along | The chosen parrot and the pet that follows the player |
| Size | Downham Market about 100 m across; London and New York about 140 m |
| How travel works | The engine swaps the place while the player stays in VR |

Ruled out: reloading the page to change place, which would drop the child out
of VR; one joined-up world, which is too heavy for a headset; real map data
and photo-real models.

## 3. The journey

**The gate and the board**

- The Aviary's shut purple door becomes an open gate. Beside it stands a board
  with one big picture per place: a clock tower, Big Ben, a yellow taxi.
- Under each picture is the number of parrots there now. A full place (8) is
  greyed out and cannot be picked.
- Touching a picture with beak or claw lights the gate and shows that place in
  it. The choice is the player's own; other players do not see it.
- With no place picked, the gate is dim and flying into it does nothing.

**Going through**

- Flying through the lit gate fades the view to dark, swaps the place, and
  fades the view back in. About a second.
- The player arrives on the step of that place's own gate. Its board lists
  every other place. The Aviary is shown as a nest.
- The game always starts in the Aviary. `?lobby=<id>` still opens a place
  directly, for testing.

**What comes along**

- The player's chosen parrot, and the pet that follows them.
- A toy in the beak stays behind and goes home. Toys belong to their place.

**Friends**

- Each player travels alone. Friends who pick the same place meet there.
- Voice reaches only the players in the same place, as now.

**When things go wrong**

- With no connection the board shows no counts. Travel still works, and the
  player is alone in the new place, as in the Aviary offline today.
- If a place fills while a player is on the way, they arrive and play alone.
  The game keeps trying, and joins the others when there is room. This is
  what it does today when a room is full.
- The game never turns the player, so they arrive facing the way they flew
  in. The Aviary's gate is flown into heading north and every other gate
  heading south, so a trip from or to the Aviary arrives with the gate
  behind. A trip between two new places arrives facing the gate; the child
  turns round.

## 4. The places

**In every new place**

- Scenery built by `StaticBuilder` from coloured shapes and merged into one
  mesh, so a whole place costs one draw call.
- A gate and board, where a player arrives.
- The Aviary's kinds of play, placed round the landmarks: a ring course, bells
  to peck, bottle caps hidden in high spots, seeds and a feeder, a toy box, and
  water to splash in.
- A few of the wandering parrots, perching on the landmarks.
- The edge is a row of plain house fronts, with an invisible wall and ceiling
  behind them. No netting.
- No nest, pet rail, egg cup, friends' board, choosing perches or Kiki.

**Downham Market** — about 100 m across, 30 m high

- The clock tower in the middle of the market place, with stalls round it. The
  ring course circles the tower.
- The Town Hall, with a bottle cap hidden on its roof.
- Ginger-brown carrstone shop fronts round the square.
- Shapes and colours are worked from photos. The owner checks the result.

**London** — about 140 m across, 60 m high

- Big Ben, the tallest thing, with a big bell to peck.
- Tower Bridge over a strip of the Thames, which is the water to splash in.
- The London Eye, a red bus and a red phone box.

**New York** — about 140 m across, 60 m high

- Times Square with bright billboards in plain colours. No real brand names
  or logos.
- Yellow taxis in the street.
- The Empire State Building as the tall thing to climb.
- The Statue of Liberty on a small island in water at one edge.

A place is downloaded and built only when somebody goes there, so more places
do not slow the start of the game.

## 5. Code changes

- **Place list.** Three new ids in `shared/net.ts` (`LOBBY_IDS`) and three
  lines in `src/lobbies/registry.ts`. One folder per place under
  `src/lobbies/`, each with a `layout.ts` of plain numbers and a `scenery.ts`,
  as the Aviary has.
- **Gate and board.** One shared builder, used by all four places. A place's
  layout says where its gate stands. The pictures are drawn on a canvas, as
  the how-to board is.
- **Picking and passing.** The world rules gain two things: touching a board
  picture picks a place, and crossing the lit gate asks to travel. Picking
  works as the parrot-choosing perches do now.
- **Travel.** The engine fades the view, calls the existing `loadLobby`, and
  seats the player at the new place's gate.
- **Player counts.** One new server call returns how many players are in each
  place. The game asks only while a player is near a board. This adds to the
  server's API.
- **Pet comes along.** Today a pet follows only where there is a pet rail. The
  follower must fly in a place without one.
- No database change. No new dependencies. `HELPER_LOBBIES` is unchanged.

The chosen parrot already survives a place swap: the engine owns the player.

## 6. Build order

Each step is committed and pushed to main.

1. Gate, board and travel, proven between the Aviary and the existing test
   room. Built; see [the step 1 plan](2026-11-12-places-step-1-plan.md)
   and its notes on what was built differently.
2. The pet and the chosen parrot come along. Player counts on the board.
3. Downham Market.
4. London.
5. New York.

## 7. Tests

- **Per place**, as for the Aviary: every toy inside the walls, start points
  clear of scenery, every ring and target reachable.
- **Travel:** pick a place, fly through, and the place has changed; the old
  room is left and the new one joined. An unlit gate does nothing. A full
  place cannot be picked.
- **Server:** the counts are right, and a full place reports full.
- **Two players** in two browser windows meet in the same place.

## 8. Not built

- Kiki in the new places.
- A nest, pet rail or egg cup outside the Aviary.
- Travelling as a group.
- A special game for each place.
- Carrying a toy from one place to another.
