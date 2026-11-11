# Pets, sign-in and breeding — design

Nov 11, 2026 · agreed with the owner in a brainstorming session.

## 1. Summary

Players get pets: small parrots that follow them. Pets have DNA and one of six
rarity tiers. Two pets can be bred into an egg, which hatches when it is fed.
Pets belong to a signed-in player and are stored on a new backend. The owner
manages players and pets on an admin page.

This adds the game's first backend and first accounts. It changes three lines
of the v1 requirements (section 12 below).

## 2. Decisions

| Question | Decision |
| --- | --- |
| Sign-in | A 6-digit code the owner creates. No email, no password |
| What a pet does | Follows the player |
| Rarity | Counted from the DNA, never stored |
| Getting a friend's DNA | Ask in the game; the friend answers later |
| Breeding your own pets | Allowed |
| Hatching | Feed the egg 3 seeds |
| Pet cap | 24 per player, eggs included |
| Parting with a pet | Set free by a deliberate act, with a 30-day undo |
| Selling, gifting | Not built |
| Backend | Cloudflare Worker + D1, in this repo |

## 3. Backend and repo layout

- `server/`: a Cloudflare Worker that answers `/api/*`, with a D1 database. The
  same Worker keeps serving the game's static files. `npm run deploy` deploys
  both.
- `shared/`: the DNA rules (genes, tiers, breeding) and the fixed pets. The
  game, the server and the tests all import it, so the rules exist once.
- No new npm dependencies. Wrangler is already run through `npx`.

**Ready for multiplayer.** Every player and pet has a stable server id, and
the server alone decides who owns what. A player's current follower is stored
on the server, so other players can be shown it later. A Durable Object per
lobby can add WebSockets later, using the same sign-in token. No multiplayer
code is written now. This replaces the "Go with WebSockets" plan.

## 4. Players and sign-in

- The owner adds a player on the admin page with a nickname only. The page
  shows a 6-digit code.
- The child enters the code once, on a big number pad on the existing 2D start
  screen, before entering VR.
- The server swaps the code for a long random token, which the headset keeps.
  The server stores only hashes of the code and the token.
- Resetting a code on the admin page signs that headset out.
- Sign-in is limited to 5 tries a minute from one address, and admin calls to
  60. Cloudflare counts these per location, so the limits are approximate.
- A code has only 6 digits, so its hash would not hide it from someone who
  had a copy of the database. The tokens are long and random, and safe.
- A new player starts with one random common pet, which follows them from the
  start.
- With no code, or with the server unreachable, the game plays as it does
  today, without pets.

Stored data: nickname, pets, eggs and DNA requests. Nothing else.

## 5. DNA

A pet's DNA is one small record with two kinds of genes.

- **Look genes:** the fields parrots already use in `CharacterDef`: species
  shape, body colours, size, tail length and crest.
- **Special genes (five):**

| Gene | Values |
| --- | --- |
| Glow | off, on |
| Rainbow | off, on |
| Heads | 1, 2 or 3 |
| Tails | 1, 2 or 3 |
| Eye dots | 1 or 2 |

A special gene counts as "on" when it is not at its first value.

One function turns DNA into a `CharacterDef`, so the existing parrot builder
draws pets. The builder is extended for the five specials. Pets are drawn at
about 40% of a player parrot's size.

## 6. Tiers

| Special genes on | Tier | Perch colour |
| --- | --- | --- |
| 0 | Common | Grey |
| 1 | Uncommon | Green |
| 2 | Rare | Blue |
| 3 | Epic | Purple |
| 4 | Legendary | Gold |
| 5 | Mythical | Rainbow |

A mythical has all five: it glows, is rainbow, and has several heads, several
tails and two-dot eyes.

## 7. Fixed pets

`shared/founders.ts` holds about 8 hand-written DNAs, at least one per tier,
in the same style as today's roster. A new fixed pet is a new entry. The owner
gives them to players on the admin page.

## 8. Breeding

Breeding runs on the server only.

- Each look gene comes from one parent at random. Colours sometimes blend.
  A look gene has a 5% chance to mutate a little.
- Each special gene is on in the baby with these odds:

| Parents with the gene on | Chance |
| --- | --- |
| Both | 60% |
| One | 30% |
| Neither | 3% |

- When a baby gets extra heads or tails, the count comes from a parent that
  has them.
- Two mythicals hatch a mythical about 8% of the time. Two commons hatch
  something better about 14% of the time.
- All odds live in one config file in `shared/`.
- The egg's DNA is fixed when the egg is made. Feeding cannot reroll it.
- Parents are not used up.

**Limits**

- 24 pets per player, eggs included.
- One egg at a time.
- One follower at a time.
- An open DNA request holds the asker's egg slot, so a "yes" always produces
  an egg.

## 9. In the nest

Everything is pictures and touch, like the character perches. It sits in a new
pet corner of the nest, opposite the character perches.

**Your pets**

- Six small perches show one page of your pets. Arrows flip pages.
- The perch colour shows the tier.
- Touch a pet and it follows you. The previous follower flies back.

**Following**

- The follower is a small parrot run by the flock's follow behaviour, made
  permanent. It flies after you, lands beside you when you perch, and keeps
  out of your face.

**Breeding**

- An egg cup with a heart perch on each side. Fill both and an egg appears.
- Your own pet: touch a heart perch and your follower lands on it.
- A friend's pet: touch its picture on the friends' board. A see-through copy
  appears on the free heart perch with an hourglass. That is the request.
- Touch an occupied heart perch to cancel.

**Friends' board**

- A picture board showing one friend's pets at a time, with arrows to flip
  between friends.

**Answering a request**

- An envelope floats over the asked pet's perch, showing the asker's parrot,
  with a green tick pad and a red cross pad. Giving DNA costs nothing.

**Hatching**

- The shell takes its colours from the egg's DNA. The special genes stay a
  surprise.
- Drop 3 seeds or millet into the cup. Each makes it wobble and crack. On the
  third it hatches with a chirp and a feather puff, and the baby flies to a
  free perch.
- The egg cup is a new kind of target place that accepts food.

**Setting a pet free**

A goodbye perch stands at the nest's edge, away from the other perches. All
three steps are needed:

1. Make the pet your follower.
2. Touch the goodbye perch so it lands there.
3. Hold a hand on each of two pads for 3 seconds while a ring fills. Letting
   go cancels.

The pet then flies off. The server keeps it for 30 days, and the owner can
bring it back on the admin page. A player can never free their last pet, an
egg, or a pet on a heart perch. Freeing a pet cancels any request that names
it.

**Other states**

- At 24 pets the heart perches show a "full" picture.
- Signed out, the pet corner shows a padlock.

## 10. Admin page

A plain page at `/admin`, protected by one admin password held as a Worker
secret. The owner sets it; it is never in the repo. The page keeps the
password only in memory, so it is asked for again after a reload. A deploy
fails if the password has not been set.

- Players: list, add by nickname (shows the code), reset code.
- Per player: their pets with picture, tier and traits. Give a fixed pet,
  remove a pet, restore a freed pet.
- Pictures use the same parrot builder as the game.
- No DNA editor.
- Restoring a freed pet arrives with step 4, when pets can first be freed.

## 11. Data and API

**Tables (D1)**

| Table | Holds |
| --- | --- |
| `players` | id, nickname, code hash, current follower |
| `sessions` | token hash, player |
| `pets` | id, owner, DNA, both parents, stage (egg, hatched, freed), seeds fed, dates |
| `requests` | asker, asker's pet, asked pet, status |

**API**

| Call | Does |
| --- | --- |
| `POST /api/login` | Code in, token out |
| `GET /api/me` | My pets, egg, follower, and requests to and from me |
| `GET /api/friends` | Other players and their hatched pets |
| `POST /api/me/follower` | Choose my follower |
| `POST /api/breed` | Two of my own pets make an egg |
| `POST /api/requests` | Ask: my pet and a friend's pet |
| `POST /api/requests/:id` | Answer yes or no. Yes makes the asker's egg |
| `DELETE /api/requests/:id` | Cancel my request |
| `POST /api/egg/feed` | One seed. The third hatches the egg |
| `POST /api/pets/:id/free` | Set a pet free |
| `/api/admin/*` | Players, codes, give, remove, restore |

The game sends only ids, never DNA. The server checks ownership, the cap, one
egg and "not your last pet" on every call. The one thing it takes on trust is
that a seed was dropped in the cup.

**When things go wrong**

- Server unreachable: the game plays as today, and the pet corner shows a
  "no connection" picture.
- The server refuses a touch: the perch shakes with a "no" sound and nothing
  changes. The game shows only what the server confirmed.
- Wrong code: the number pad shakes and clears.

**Performance**

- Perched pets and board pictures use the existing one-mesh statue, one draw
  call each. Only the follower is fully animated.
- A pet that glows adds one more draw call, for its halo.
- A pet has 1,000 to 1,400 triangles, or up to 3,300 with three heads.
- To be measured against the budget of 100 draw calls.

## 12. Changes to the v1 requirements

Made in the requirements document with build step 2:

- Section 1, "no accounts or data collection" becomes: sign-in by code, no
  personal data.
- Section 2, "Later: game server: Go with WebSockets" becomes: Cloudflare
  Worker + D1 now, Durable Objects for multiplayer later.
- Section 9, "no accounts ... no network calls" becomes: the game calls its
  own backend for pets only. The microphone rule is unchanged.

## 13. Tests

Vitest, with no new dependencies.

- DNA: tier counting, breeding odds with a seeded random, DNA to character.
- Server rules, written as plain functions over a small storage interface and
  tested with an in-memory store: login, the cap, one egg, the request flow,
  feeding to hatch, setting free and restoring.
- Game: the egg cup accepts food; the follower follows.
- Not testable without the headset: how it feels.

## 14. Build order

Each step is committed and pushed to main when the owner has checked it.

1. Shared DNA, and drawing the five specials.
2. Server, sign-in and the admin page.
3. The pet corner and the follower.
4. Breeding, requests, the egg, hatching and setting free.

## 15. Open points

- The owner's sentence "we have to put the source for this" was cut off. It
  was read as "the backend source lives in this repo".
- The follower moves by the same wing rules as every parrot. At 40% size it
  may need its own tuning.
