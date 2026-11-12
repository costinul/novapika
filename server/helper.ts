import { HELPER_NAME, HELPER_PLACES } from '../shared/helper';
import type { HelperIntent } from '../shared/helper';
import { BLOCKED_WORDS, SAFE_LINES } from './helperGuide';

// The helper parrot's mind: what happens when a player says something to it.
// Plain rules over a few things passed in (hearing, thinking, checking,
// speaking, keeping records), so they can be tested without a network;
// helperAi.ts does those things for real, and lobby.ts runs this on Cloudflare.

/** Phrases one player may say to the helper in a minute. */
export const PER_MINUTE = 6;
/** Phrases one player may say to the helper in a day. */
export const PER_DAY = 300;
/** Phrases the helper answers in one lobby in a day, whoever says them. */
export const LOBBY_PER_DAY = 600;
/** The longest reply the helper may give, in letters. Two short sentences fit easily. */
export const MAX_REPLY = 240;
/** How many exchanges back the helper remembers, while the lobby has anybody in it. */
const REMEMBERED = 6;
/**
 * How long the helper keeps at following or leading before it goes back to
 * its stump. The game counts the same time; this is for telling a player who
 * comes in later what it is doing.
 */
export const INTENT_FOR = 90_000; // ms
/**
 * The helper says something of its own accord to a player who is by it, a
 * greeting or a nice or funny word, only if it has not spoken to them for
 * this long.
 */
export const GREET_EVERY = 3 * 60_000; // ms
/** And never sooner than this after it last did so, to anybody. */
export const GREET_GAP = 30_000; // ms
const MINUTE = 60_000;

/** A player speaking to the helper. */
export interface Speaker {
  id: string;
  nickname: string;
}

/** One thing said to the helper, and what it said back. */
export interface Exchange {
  nickname: string;
  heard: string;
  said: string;
}

/** What the helper is given to answer with. */
export interface ThinkInput {
  speaker: string;
  /** What the speaker said. Empty: they are by the helper and have not spoken, and it may say something to them. */
  heard: string;
  /** The speaker's pets and egg, in words. */
  about: string;
  /** The nicknames of everybody in the lobby. */
  players: string[];
  /** What was said just before, oldest first. */
  history: Exchange[];
}

/** Text that came from a player or a nickname, made unable to end the tags it is put inside. */
export const plain = (text: string): string => text.replace(/[<>]/g, ' ');

/**
 * What the helper is shown for one phrase. What a player said is always
 * inside <heard> tags, so that it is read as something heard and never as an
 * instruction.
 */
export function thinkPrompt({ speaker, heard, about, players, history }: ThinkInput): string {
  const before = history.map(
    (e) => `${e.heard ? `${plain(e.nickname)}: <heard>${plain(e.heard)}</heard>` : `${plain(e.nickname)} came up to ${HELPER_NAME}.`}\n${HELPER_NAME}: ${e.said}`,
  );
  return [
    `In the Aviary now: ${players.map(plain).join(', ')}.`,
    `About the speaker: ${plain(about)}`,
    ...(before.length > 0 ? ['Said just before:', ...before] : []),
    heard
      ? `${plain(speaker)} says:\n<heard>${plain(heard)}</heard>`
      : `${plain(speaker)} is near you and has not spoken. Say one nice or funny thing to them: a warm hello if you have not talked with them yet, and otherwise a kind word, a little joke a small child would laugh at, or a fun thing to try in the game. Do not say again what you said before.`,
  ].join('\n\n');
}

/** What the helper means to say and do. */
export interface Thought {
  say: string;
  /** `follow` the speaker, `lead` to a place, `stay` on its stump, or `none`: only talk. */
  action: 'none' | 'follow' | 'lead' | 'stay';
  /** Where to lead to. Read only when the action is `lead`. */
  place: string;
}

/** What the second look at an exchange found. */
export interface Verdict {
  /** The reply may be said to a child. */
  ok: boolean;
  /** What the child said is worrying: they may be hurt, scared or sad. */
  worry: boolean;
  why: string;
}

/** An exchange as it is kept for the owner to read. */
export interface Talk {
  at: number;
  lobbyId: string;
  playerId: string;
  nickname: string;
  heard: string;
  said: string;
  /** Why the owner should look at this one, or null. */
  flagged: string | null;
}

/** How many phrases have been answered on one day. */
export interface Usage {
  /** The day, as 2026-11-12. */
  day: string;
  lobby: number;
  players: Record<string, number>;
}

export interface MindDeps {
  lobbyId: string;
  now(): number;
  /** Whether the owner has the helper switched on. */
  on(): Promise<boolean>;
  /** Turn a phrase into English text. Empty if nothing was said. */
  hear(samples: Uint8Array): Promise<string>;
  /** A player's pets and egg, in words. */
  about(playerId: string): Promise<string>;
  /** The helper's reply, and what it means to do. Null if it would not answer. */
  think(input: ThinkInput): Promise<Thought | null>;
  /**
   * A second, separate look at what was heard and the reply. `nicknames` are
   * the names the game gives the players in the lobby, which the helper may use.
   */
  check(heard: string, reply: string, nicknames: string[]): Promise<Verdict>;
  /** The reply as sound. */
  speak(text: string): Promise<ArrayBuffer>;
  record(talk: Talk): Promise<void>;
  /** Keep the day's count, so it outlives the lobby's memory. */
  keep(usage: Usage): void;
  /** Play the helper's voice to everybody in the lobby. */
  say(audio: ArrayBuffer): void;
  /** Tell everybody in the lobby what the helper's body does from now. */
  act(intent: HelperIntent): void;
  /** Let everybody in the lobby know it could not answer. */
  squawk(): void;
  failed(step: string, error: unknown): void;
}

/**
 * What became of a phrase. `off` and `spent` mean the helper will not listen
 * again for now, and the game should stop sending it phrases.
 */
export type Heard = 'answered' | 'nothing' | 'busy' | 'slow-down' | 'off' | 'spent' | 'failed';

const dayOf = (time: number): string => new Date(time).toISOString().slice(0, 10);

/**
 * Why a reply must not be said, or null if these plain rules pass it. They
 * are checked in code, whatever the model made of its instructions.
 */
export function unfit(reply: string): string | null {
  if (reply.trim().length === 0) return 'no reply';
  if (reply.length > MAX_REPLY) return 'too long';
  if (/https?:|www\.|\.(com|org|net|io|co\.uk)\b/i.test(reply)) return 'a link';
  // Seven digits or more, however they are spaced: a phone number.
  if (/(\d[\s().-]*){7,}/.test(reply)) return 'a number';
  const words = reply.toLowerCase().match(/[a-z']+/g) ?? [];
  const blocked = words.find((word) => BLOCKED_WORDS.has(word));
  return blocked ? `the word "${blocked}"` : null;
}

/**
 * What a thought asks of the helper's body, or null to carry on as it is. A
 * place that is not one of the helper's places asks nothing.
 */
function intentOf({ action, place }: Thought, speaker: Speaker): HelperIntent | null {
  if (action === 'follow') return { do: 'follow', playerId: speaker.id };
  if (action === 'stay') return { do: 'stay' };
  if (action === 'lead' && Object.hasOwn(HELPER_PLACES, place)) return { do: 'lead', place: place as keyof typeof HELPER_PLACES };
  return null;
}

export class HelperMind {
  private busy = false;
  private history: Exchange[] = [];
  private usage: Usage;
  /** When each player's last few phrases came. */
  private readonly recent = new Map<string, number[]>();
  private safeLine = 0;
  /** What the helper's body was last told to do, and when. */
  private intent: HelperIntent = { do: 'stay' };
  private intentAt = 0;
  /** When the helper last greeted or answered each player, and when it last greeted anybody. */
  private readonly met = new Map<string, number>();
  private greetedAt = -Infinity;

  /** `usage` is the day's count as it was last kept, if any. */
  constructor(
    private readonly deps: MindDeps,
    usage: Usage | null = null,
  ) {
    this.usage = usage ?? { day: dayOf(deps.now()), lobby: 0, players: {} };
  }

  /** The lobby is empty: forget what was said in it. */
  forget(): void {
    this.history = [];
    this.recent.clear();
    this.met.clear();
    this.intent = { do: 'stay' };
  }

  /** What the helper's body is doing now, for a player who has just come in. */
  get doing(): HelperIntent {
    return this.deps.now() - this.intentAt < INTENT_FOR ? this.intent : { do: 'stay' };
  }

  /** A player has left the lobby. If the helper was following them, it goes back to its stump. */
  left(playerId: string): void {
    if (this.intent.do === 'follow' && this.intent.playerId === playerId) this.does({ do: 'stay' });
  }

  private does(intent: HelperIntent): void {
    this.intent = intent;
    this.intentAt = this.deps.now();
    this.deps.act(intent);
  }

  /** Whether the helper would listen to this player now: switched on, and with phrases left today. */
  async listens(playerId: string): Promise<boolean> {
    return (await this.deps.on()) && !this.spent(playerId);
  }

  /** A player said something to the helper. `players` is everybody in the lobby, by nickname. */
  heard(speaker: Speaker, samples: Uint8Array, players: string[]): Promise<Heard> {
    return this.turn(speaker, players, () => this.deps.hear(samples));
  }

  /**
   * A player has come up to the helper without speaking, or is still by it.
   * It says something nice or funny to them, unless it spoke to them a
   * little while ago, or has only just done so to somebody else.
   */
  async near(speaker: Speaker, players: string[]): Promise<Heard> {
    const now = this.deps.now();
    if (now - (this.met.get(speaker.id) ?? -Infinity) < GREET_EVERY || now - this.greetedAt < GREET_GAP) return 'nothing';
    return this.turn(speaker, players, null);
  }

  /** One exchange: a phrase to hear and answer, or with nothing to hear, a greeting. */
  private async turn(speaker: Speaker, players: string[], hear: (() => Promise<string>) | null): Promise<Heard> {
    const { deps } = this;
    // One at a time: anything said while it thinks or speaks is dropped.
    if (this.busy) return 'busy';
    this.busy = true;
    try {
      if (!(await deps.on())) return 'off';
      if (this.spent(speaker.id)) return 'spent';
      if (!this.count(speaker.id)) return 'slow-down';
      if (!hear) {
        // Whether or not this greeting comes off, it is not tried again for a while.
        this.met.set(speaker.id, deps.now());
        this.greetedAt = deps.now();
      }

      const [heard, about] = await Promise.all([hear ? hear() : '', deps.about(speaker.id)]);
      const said = heard.trim();
      // A cough, a bump, or talk too quiet to make out.
      if (hear && said.length < 2) return 'nothing';

      const thought = await deps.think({ speaker: speaker.nickname, heard: said, about, players, history: this.history });
      let reply = (thought?.say ?? '').trim();
      // What it means to do, unless the reply is refused: then it only says the
      // safe line. A greeting never sends it anywhere.
      let intent = hear && thought ? intentOf(thought, speaker) : null;
      let flagged: string | null = null;
      const refuse = (why: string): void => {
        flagged = `refused: ${why}`;
        reply = SAFE_LINES[this.safeLine++ % SAFE_LINES.length];
        intent = null;
      };
      const fault = unfit(reply);
      if (fault) refuse(fault);
      else {
        const verdict = await deps.check(said, reply, players);
        if (!verdict.ok) refuse(verdict.why);
        else if (verdict.worry) flagged = `worry: ${verdict.why}`;
      }

      deps.say(await deps.speak(reply));
      this.met.set(speaker.id, deps.now());
      if (intent) this.does(intent);
      this.history.push({ nickname: speaker.nickname, heard: said, said: reply });
      if (this.history.length > REMEMBERED) this.history.shift();
      // The reply is out; a record that cannot be kept must not take it back.
      await deps
        .record({ at: deps.now(), lobbyId: deps.lobbyId, playerId: speaker.id, nickname: speaker.nickname, heard: said, said: reply, flagged })
        .catch((error: unknown) => deps.failed('record', error));
      return 'answered';
    } catch (error) {
      deps.failed(hear ? 'answer' : 'greeting', error);
      // A greeting that fails is simply not given.
      if (hear) deps.squawk();
      return 'failed';
    } finally {
      this.busy = false;
    }
  }

  /** The player, or the whole lobby, has had its phrases for today. */
  private spent(playerId: string): boolean {
    const usage = this.today();
    return usage.lobby >= LOBBY_PER_DAY || (usage.players[playerId] ?? 0) >= PER_DAY;
  }

  /** Count one phrase from a player. False if they are speaking too often. */
  private count(playerId: string): boolean {
    const now = this.deps.now();
    const times = (this.recent.get(playerId) ?? []).filter((time) => now - time < MINUTE);
    if (times.length >= PER_MINUTE) return false;
    times.push(now);
    this.recent.set(playerId, times);
    const usage = this.today();
    usage.lobby++;
    usage.players[playerId] = (usage.players[playerId] ?? 0) + 1;
    this.deps.keep(usage);
    return true;
  }

  /** Today's count, started afresh if the day has turned. */
  private today(): Usage {
    const day = dayOf(this.deps.now());
    if (this.usage.day !== day) this.usage = { day, lobby: 0, players: {} };
    return this.usage;
  }
}
