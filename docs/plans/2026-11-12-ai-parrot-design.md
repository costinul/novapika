# The AI parrot — design

Nov 12, 2026 · agreed with the owner in a brainstorming session.

## 1. Summary

Each lobby gets one AI parrot: a very kind helper that talks with the
children. It answers questions such as how to hatch an egg, comes when called,
follows a child, and leads them to a place to explain it. Now and then it
starts a chat itself.

Its mind runs on the server, in the lobby's Durable Object. Its body is one
more lobby parrot, flown by the host's game. No key is ever in the browser.

This is the first time the server hears a voice. It changes two earlier
promises (section 11 below).

## 2. Decisions

| Question | Decision |
| --- | --- |
| Where speech becomes text | On Cloudflare, with Workers AI Whisper. OpenAI gets text only |
| When it listens | Only to a child who is near it and facing it |
| Language | English only |
| First version | Talk, follow and lead. Playing games comes later |
| Records | Text kept for 7 days, shown on the admin page. Audio is never kept |
| Reasoning model | OpenAI GPT-6 Luna |
| Speaking | OpenAI text-to-speech |
| Where the mind runs | The `Lobby` Durable Object |
| Who flies the body | The host's game, as for the other lobby parrots |
| A PIN for the API | Not built. Sign-in is already required; caps guard the cost |

## 3. Approaches considered

- **Mind in the lobby, body on the host's game.** Chosen. One mind per lobby,
  the caps are enforced on the server, and a change of host loses nothing.
- **The host's browser runs everything.** Dropped. It trusts a child's headset
  with the conversation, and loses it when the host changes.
- **A headless bot that joins as a real player.** Dropped. It needs an
  always-on server outside Cloudflare that runs the game's physics.

## 4. How one exchange goes

1. **Hearing.** Each game watches its own player only. While the child is
   within about 3 m of the AI parrot and facing it, `VoiceCapture` listens.
   A finished phrase, at most about 8 s, goes up the lobby socket as a new
   kind of binary frame: 16 kHz, one channel.
2. **Caps.** The lobby checks the limits in section 7. Over a limit, the
   phrase is dropped.
3. **Text.** Workers AI Whisper turns the phrase into English text. The audio
   is then dropped.
4. **Thinking.** The text goes to Luna with: a fixed description of who the
   parrot is, a short guide to the game, who is in the lobby by nickname, the
   speaker's egg and pet state, and the last few exchanges. Luna answers in
   one or two short sentences, and may call a tool (section 5).
5. **Checking.** What the child said and what the parrot will say both go
   through OpenAI's moderation check. A flagged reply is replaced by a fixed
   safe line.
6. **Speaking.** OpenAI text-to-speech makes the audio. The lobby sends it to
   everyone. Each game plays it from the parrot's head, with the same fade
   over distance as a player's voice, and the parrot bobs as it talks.

One phrase is handled at a time. A phrase that arrives while the parrot is
thinking or speaking is dropped. A reply should start within 2 to 3 seconds.

The lobby keeps the last few exchanges in memory only. They are gone when the
lobby empties. The parrot remembers nothing about a child between visits.

## 5. The body

- The AI parrot is a lobby parrot with its own look and name. It takes no
  player's place, and its poses travel with the host's as the others' do.
- Luna has three tools: `follow(player)`, `lead_to(place)` and `stay`.
  Places are a fixed list per lobby, such as the egg cup, the feeder, the
  picture board and the rings.
- The lobby sends the chosen intent to every game. The host's `Brain` flies
  it, with new errands for going to a named player and to a named place.
  When the host changes, the new host already knows the intent.
- With no intent, it behaves as any lobby parrot.

## 6. Starting a chat itself

The AI parrot sometimes flies to a child, as lobby parrots already do. When a
child comes near it, that child's game tells the lobby. The lobby then asks
Luna for a greeting or a kind question, at most once every few minutes for
each child, and within the caps.

## 7. Protection

- The OpenAI key is a Worker secret. The browser never sees it and never
  calls OpenAI.
- Only a signed-in player's lobby socket can send a phrase. Players exist
  only when the owner adds them.
- Caps, all counted on the server: phrases per minute and per day for each
  player, phrases per day for each lobby, and a short limit on each reply's
  length. The numbers are set when it is built and can be seen in one place.
- A switch on the admin page turns the AI parrot off everywhere.
- The parrot is told never to ask a child for their real name, where they
  live, their school or any other personal thing, and to say it is a robot
  parrot if asked.

## 8. Records

- A new D1 table holds each exchange: when, which lobby, which player, what
  was heard, what was said, and whether it was flagged.
- Rows are deleted after 7 days by a scheduled job.
- The admin page lists them, newest first.
- No audio is stored anywhere, on the server or at Cloudflare.

## 9. When something fails

- Whisper, Luna, the check or the speech fails or is too slow: the parrot
  squawks, and nothing else happens. The error is logged.
- A cap is reached, or the switch is off: it is an ordinary lobby parrot, and
  no game sends it phrases.
- No microphone: the child cannot talk to it, but still hears it.
- The lobby goes to sleep and wakes: the conversation so far is forgotten.

## 10. Tests

Vitest, with no new dependencies.

- The mind's rules are plain functions over small interfaces for hearing,
  thinking, checking and speaking, tested with fakes: the caps, one phrase at
  a time, a flagged reply, each failure, the greeting's limit, the 7-day
  delete.
- Lobby rules: the new frame and messages, who may send them, and that the
  intent reaches a new host.
- Game: listening only when near and facing; the new errands, flown in the
  emulator.
- Not testable without the headset and real children: how well Whisper hears
  them, how the delay feels, and whether the voice is liked.

## 11. Changes to earlier promises

- README, "never hears or ..." a voice: the server now hears phrases spoken
  to the AI parrot, turns them into text and drops the audio. Voices between
  players still go straight between their games.
- `Mimicry.ts`, "Nothing of it is stored or sent anywhere": still true for
  mimicry. The comment gains a line pointing to the AI parrot.

## 12. Build order

Each step is committed and pushed to main.

1. Talk only: a perched AI parrot, the whole path from phrase to speech, the
   caps, the switch, and the records on the admin page.
2. The tools and the two new errands: follow and lead.
3. Greetings it starts itself.

Later, not designed here: fetching toys, bringing seeds, flying the rings
together.

## 13. Open points

- **Children's words still reach OpenAI as text.** A child may say their name
  or where they live. OpenAI's guidance for under-18s says not to process the
  personal data of children under 13 without zero data retention. The owner
  should ask OpenAI for zero data retention before this is used by children,
  and read that guidance and OpenAI's terms. This is not legal advice.
- Cloudflare lists GPT-6 Luna among the models it serves. If that works with
  no OpenAI key, it may be simpler. Not looked into.
- Not checked yet: the exact model names for Luna, Whisper and the speech;
  the biggest message a lobby socket takes; the microphone's sample rate on
  the headset.
- Whisper will mishear small children at times. The parrot is told to ask
  again kindly rather than guess.
- The AI parrot's name and look are not chosen.
- Adding the Workers AI binding and the scheduled job changes the Worker's
  configuration. The new table is a migration.
