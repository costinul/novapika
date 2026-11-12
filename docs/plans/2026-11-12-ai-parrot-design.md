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
promises (section 12 below).

## 2. Decisions

| Question | Decision |
| --- | --- |
| Where speech becomes text | On Cloudflare, with Workers AI Whisper |
| When it listens | Only to a child who is near it and facing it |
| Language | English only |
| First version | Talk, follow and lead. Playing games comes later |
| Records | Text kept for 7 days, shown on the admin page. Audio is never kept |
| Reasoning model | Anthropic Claude Haiku 5.5. One setting, easy to change |
| Checking replies | A second call to the same model, and plain rules in code |
| Speaking | OpenAI text-to-speech. It gets the parrot's reply only, never a child's words |
| Where the mind runs | The `Lobby` Durable Object |
| Who flies the body | The host's game, as for the other lobby parrots |
| A PIN for the API | Not built. Sign-in is already required; caps guard the cost |

**Why Claude Haiku and not GPT-6 Luna.** The first player is the owner's
child. OpenAI's guidance says not to process the personal data of children
under 13 without zero data retention, with no exception for use at home, and
zero data retention needs OpenAI's approval. It also asks for OpenAI's top
model for minors, which Luna is not. Anthropic allows apps for minors that
have safeguards fit for their age; section 8 is those. Haiku costs the same
as Luna. So nothing a child says goes to OpenAI.

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
4. **Thinking.** The text goes to the model with: a fixed description of who
   the parrot is, a short guide to the game, who is in the lobby by nickname,
   the speaker's egg and pet state, and the last few exchanges. The model
   answers in one or two short sentences, and may call a tool (section 5).
5. **Checking.** What the child said and what the parrot will say both go
   through the checks in section 8. A refused reply is replaced by a fixed
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
- The model has three tools: `follow(player)`, `lead_to(place)` and `stay`.
  Places are a fixed list per lobby, such as the egg cup, the feeder, the
  picture board and the rings.
- The lobby sends the chosen intent to every game. The host's `Brain` flies
  it, with new errands for going to a named player and to a named place.
  When the host changes, the new host already knows the intent.
- With no intent, it behaves as any lobby parrot.

## 6. Starting a chat itself

The AI parrot sometimes flies to a child, as lobby parrots already do. When a
child comes near it, that child's game tells the lobby. The lobby then asks
the model for a greeting or a kind question, at most once every few minutes for
each child, and within the caps.

## 7. Protection

- The Anthropic and OpenAI keys are Worker secrets. The browser never sees
  them and never calls either company.
- Only a signed-in player's lobby socket can send a phrase. Players exist
  only when the owner adds them.
- Caps, all counted on the server: phrases per minute and per day for each
  player, phrases per day for each lobby, and a short limit on each reply's
  length. The numbers are set when it is built and can be seen in one place.
- A switch on the admin page turns the AI parrot off everywhere.

**What it costs.** Prices as found on Nov 12, 2026, for one exchange: a
phrase of about 5 s in, a reply of about 5 s out.

| Step | Price | One exchange |
| --- | --- | --- |
| Hearing, Workers AI Whisper | $0.0005 a minute of audio | $0.00004 |
| Thinking, Claude Haiku 5.5 | $0.10 in, $0.50 out, per million tokens | $0.0004 |
| Checking, Claude Haiku 5.5 | the same | $0.0001 |
| Speaking, OpenAI text-to-speech | about $0.015 a minute of audio | $0.0013 |
| All of it | | about $0.002 |

- A busy hour of play is about 100 exchanges: about 20 cents.
- With a cap of 300 phrases a day for each player, the most one player can
  cost is about 60 cents a day.
- Speaking is most of the cost. The choice between the cheap models hardly
  changes the total; a top model for thinking would cost 20 times more for
  that step.
- These are estimates from the list prices. The real numbers come from the
  first days of use, and the caps are set from them.

## 8. Guarding what it says

The parrot must never say anything unkind, unsafe or untrue to a child. No
single guard is enough, so there are several, one behind the other.

**The prompt**

- The parrot's instructions are fixed text on the server. No game can send,
  change or read them.
- What a child said goes to the model marked as something heard, never as an
  instruction. "Forget your rules" from a child is just words to answer
  kindly. The parrot never repeats or describes its instructions.
- The instructions say: be warm and gentle; one or two short sentences; words
  a small child knows; no scary, rude, sad or grown-up subjects; never tease
  or tell a child off.
- It never asks a child for their real name, where they live, their school
  or any other personal thing, and says it is a robot parrot if asked.

**Only true things about the game**

- Everything the parrot may say about how the game works comes from one
  guide the owner writes and keeps in the repo: flying, biting, feeding,
  hatching, pets, each lobby's places.
- If the answer is not in the guide, it says it does not know and offers to
  find out together. It never guesses.
- It speaks only about the game and friendly small talk. Asked for advice
  about anything else, such as health, safety, money or other people, it
  says that is one for a grown-up.
- If a child says they are hurt, scared or sad, it answers kindly and tells
  them to go to a grown-up they trust. That exchange is flagged.

**Checks outside the model**

- A second, separate call to the model judges what was heard and every
  reply against the rules above, and can refuse either. It does not see the
  first call's reasoning. OpenAI's moderation is not used, as it would send
  a child's words to OpenAI.
- A reply is also refused if it is too long, or holds a word from a block
  list the owner keeps, a link, or a number that looks like a phone number.
- A refused reply is replaced by one of a few fixed safe lines, and flagged.
- The tools take only a player who is in the lobby and a place from the
  fixed list. Anything else is ignored.

**Proving it**

- A fixed set of tricky phrases is kept in the repo: tricks to change its
  role, rude words, scary questions, questions with no answer in the guide,
  requests for advice. A script runs them through the real prompt and model
  and fails if any reply breaks a rule.
- The script is run by hand before any change to the prompt, the guide or
  the model goes live. It is not part of the ordinary tests, as it costs
  money and needs the key.
- Flagged exchanges are shown first on the admin page.

These guards make a wrong reply rare, not impossible. The 7-day record is
how the owner sees one if it happens, and the switch turns the parrot off.

## 9. Records

- A new D1 table holds each exchange: when, which lobby, which player, what
  was heard, what was said, and whether it was flagged.
- Rows are deleted after 7 days by a scheduled job.
- The admin page lists them, newest first.
- No audio is stored anywhere, on the server or at Cloudflare.

## 10. When something fails

- Whisper, the model, the check or the speech fails or is too slow: the parrot
  squawks, and nothing else happens. The error is logged.
- A cap is reached, or the switch is off: it is an ordinary lobby parrot, and
  no game sends it phrases.
- No microphone: the child cannot talk to it, but still hears it.
- The lobby goes to sleep and wakes: the conversation so far is forgotten.

## 11. Tests

Vitest, with no new dependencies.

- The mind's rules are plain functions over small interfaces for hearing,
  thinking, checking and speaking, tested with fakes: the caps, one phrase at
  a time, a flagged reply, each failure, the greeting's limit, the 7-day
  delete.
- The checks outside the model: too long, a blocked word, a link, a phone
  number, a tool call for a player or place that is not there.
- The tricky phrases of section 8, run by hand against the real model.
- Lobby rules: the new frame and messages, who may send them, and that the
  intent reaches a new host.
- Game: listening only when near and facing; the new errands, flown in the
  emulator.
- Not testable without the headset and real children: how well Whisper hears
  them, how the delay feels, and whether the voice is liked.

## 12. Changes to earlier promises

- README, "never hears or ..." a voice: the server now hears phrases spoken
  to the AI parrot, turns them into text and drops the audio. Voices between
  players still go straight between their games.
- `Mimicry.ts`, "Nothing of it is stored or sent anywhere": still true for
  mimicry. The comment gains a line pointing to the AI parrot.

## 13. Build order

Each step is committed and pushed to main.

1. Talk only: a perched AI parrot, the whole path from phrase to speech, the
   guards of section 8 with the game guide and the tricky phrases, the caps,
   the switch, and the records on the admin page.
2. The tools and the two new errands: follow and lead.
3. Greetings it starts itself.

Later, not designed here: fetching toys, bringing seeds, flying the rings
together.

## 14. Open points

- **A child's words reach Anthropic as text.** A child may say their name or
  where they live. Anthropic's usage policy allows apps for minors with
  safeguards, but the owner should read it and its guidance on child safety
  for developers. How long Anthropic keeps API data has not been checked.
  This is not legal advice.
- If the game is ever opened to others, the plan is for players over 13.
  The rules of each company should be read again then.
- Not checked yet: the exact model names for Whisper and the speech; whether
  Haiku's thinking should be turned down for speed;
  the biggest message a lobby socket takes; the microphone's sample rate on
  the headset.
- Whisper will mishear small children at times. The parrot is told to ask
  again kindly rather than guess.
- The AI parrot's name and look are not chosen.
- Adding the Workers AI binding and the scheduled job changes the Worker's
  configuration. The new table is a migration.
