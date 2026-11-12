import {
  CLOSE_BAD,
  CLOSE_ELSEWHERE,
  CLOSE_FULL,
  FRAME_HEARD,
  FRAME_POSES,
  LOBBY_SIZE,
  MAX_FRAME_BYTES,
  MAX_TEXT_BYTES,
} from '../shared/net';
import { parseAction } from '../shared/actions';
import { MAX_HEARD_BYTES, SOUND_HEAD } from '../shared/helper';
import type { ClientMessage, LobbyPlayer, ServerMessage, SharedWorld } from '../shared/net';
import { LobbyWorld } from './lobbyWorld';

// One lobby: who is in it, and what they tell each other. Plain rules over
// connections of any kind, so they can be tested without a network; lobby.ts
// runs them on Cloudflare.

/** A player in the lobby, with when they came in. Kept with their connection. */
export interface Member extends LobbyPlayer {
  joinedAt: number;
}

/** A present the owner let go over the lobby: the fixed pet inside it, and when it was let go. */
export interface Gift {
  id: string;
  founderId: string;
  droppedAt: number;
}

/** What the rules need to do with a connection of type `C`. */
export interface Wire<C> {
  send(conn: C, data: string | ArrayBuffer): void;
  close(conn: C, code: number, reason: string): void;
  /** Keep this with the connection, so it outlives the lobby's memory. */
  keep(conn: C, member: Member): void;
  /** Keep how the lobby's toys stand, so it outlives the lobby's memory; null to forget it. */
  save?(world: SharedWorld | null): void;
  /**
   * A player said something to the helper parrot: the samples, as
   * shared/helper.ts describes them. Left out, the lobby has no helper.
   */
  heard?(conn: C, member: Member, samples: Uint8Array): void;
  /** A player has come up to the helper parrot without speaking. */
  near?(conn: C, member: Member): void;
  /**
   * Give a player the pet in a present. Resolves false if they cannot have
   * it, such as for want of room. Left out, a present can never be opened.
   */
  give?(member: Member, gift: Gift): Promise<boolean>;
  /** Keep the present that is waiting, so it outlives the lobby's memory; null once it has been opened. */
  keepGift?(gift: Gift | null): void;
}

const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;

export class LobbyRules<C> {
  private readonly members = new Map<C, Member>();
  private world = new LobbyWorld();
  /** The present that is coming down or waiting, if there is one. It waits for as long as it takes, even with nobody in. */
  private gift: Gift | null = null;
  /** Somebody has touched the present, and is being given the pet. Nobody else can have it meanwhile. */
  private opening = false;

  constructor(private readonly wire: Wire<C>) {}

  /** Whether a present is coming down or waiting in the lobby. */
  get hasGift(): boolean {
    return this.gift !== null;
  }

  /** A present that was waiting before the lobby last went to sleep. */
  restoreGift(gift: Gift): void {
    this.gift = gift;
  }

  /** The owner lets a present go over the lobby. False if one is already there: one at a time. */
  drop(gift: Gift): boolean {
    if (this.gift) return false;
    this.gift = gift;
    this.wire.keepGift?.(gift);
    this.tellAll({ t: 'present', present: { id: gift.id, age: 0 } });
    return true;
  }

  get players(): LobbyPlayer[] {
    return [...this.members.values()].map(view).sort((a, b) => a.slot - b.slot);
  }

  /** The player who has been in longest runs the lobby's own parrots. */
  get host(): number {
    let first: Member | null = null;
    for (const member of this.members.values()) {
      if (!first || member.joinedAt < first.joinedAt || (member.joinedAt === first.joinedAt && member.slot < first.slot)) {
        first = member;
      }
    }
    return first?.slot ?? -1;
  }

  /** Who a connection is, if it is in the lobby. */
  memberOf(conn: C): Member | undefined {
    return this.members.get(conn);
  }

  /** A connection that was open before the lobby last went to sleep. */
  restore(conn: C, member: Member): void {
    this.members.set(conn, member);
  }

  /** How the toys stood before the lobby last went to sleep. */
  restoreWorld(saved: SharedWorld): void {
    this.world = new LobbyWorld(saved);
  }

  /** A signed-in player has connected. */
  join(conn: C, who: { id: string; nickname: string }, now: number): void {
    // The same player again: the new connection takes over from the old.
    for (const [other, member] of this.members) {
      if (member.id !== who.id) continue;
      this.remove(other);
      this.wire.close(other, CLOSE_ELSEWHERE, 'elsewhere');
    }
    const taken = new Set([...this.members.values()].map((member) => member.slot));
    let slot = 0;
    while (taken.has(slot)) slot++;
    if (slot >= LOBBY_SIZE) {
      this.wire.close(conn, CLOSE_FULL, 'full');
      return;
    }
    const member: Member = { slot, id: who.id, nickname: who.nickname, characterId: '', followerPetId: null, joinedAt: now };
    this.members.set(conn, member);
    this.wire.keep(conn, member);
    this.tell(conn, { t: 'welcome', you: slot, host: this.host, players: this.players, world: this.world.state });
    if (this.gift) this.tell(conn, { t: 'present', present: { id: this.gift.id, age: Math.max(0, now - this.gift.droppedAt) } });
    this.tellOthers(conn, { t: 'player', player: view(member) });
  }

  /** A connection has closed. */
  leave(conn: C): void {
    this.remove(conn);
  }

  /** A text message from a player. */
  text(conn: C, text: string): void {
    const member = this.members.get(conn);
    if (!member) return;
    const message = text.length <= MAX_TEXT_BYTES ? parse(text) : null;
    if (!message) return this.bad(conn);

    if (message.t === 'me') {
      const { characterId, followerPetId } = message.me ?? {};
      if (!isText(characterId, 40) || !(followerPetId === null || isText(followerPetId, 64))) return this.bad(conn);
      member.characterId = characterId;
      member.followerPetId = followerPetId;
      this.wire.keep(conn, member);
      this.tellOthers(conn, { t: 'player', player: view(member) });
      return;
    }
    if (message.t === 'rtc') {
      const { to, data } = message;
      if (!Number.isInteger(to) || typeof data !== 'object' || data === null) return this.bad(conn);
      // Somebody who has just left may still be sent to: that is nobody's fault.
      for (const [other, them] of this.members) {
        if (them.slot === to && other !== conn) this.tell(other, { t: 'rtc', from: member.slot, data });
      }
      return;
    }
    if (message.t === 'near') {
      this.wire.near?.(conn, member);
      return;
    }
    if (message.t === 'open') {
      if (!isText(message.id, 64)) return this.bad(conn);
      this.open(conn, member, message.id);
      return;
    }
    if (message.t === 'act') {
      const action = parseAction(message.action);
      if (!action) return this.bad(conn);
      const host = member.slot === this.host;
      // A game speaks for its own player; the host's also for the lobby's own parrots.
      const mine = !('playerId' in action) || action.playerId === member.id;
      const flock = 'playerId' in action && action.type !== 'claim' && host && !this.isPlayer(action.playerId);
      if ((mine || flock) && this.world.take(action, member.id, host)) {
        this.save();
        this.tellOthers(conn, { t: 'act', action });
      } else if (action.type === 'pickUp' || action.type === 'take') {
        // It took a toy it could not have: say who really has it.
        const { toyId } = action;
        this.tell(conn, { t: 'held', toyId, by: this.world.holderOf(toyId), at: this.world.restOf(toyId) });
      }
      return;
    }
    this.bad(conn);
  }

  /** A binary frame from a player: passed on to the others, marked with who sent it. */
  binary(conn: C, data: ArrayBuffer): void {
    const member = this.members.get(conn);
    if (!member) return;
    const bytes = new Uint8Array(data);
    if (bytes[0] === FRAME_HEARD) {
      if (bytes.length > MAX_HEARD_BYTES) return this.bad(conn);
      // For the helper parrot only: passed on to nobody.
      if (bytes.length > SOUND_HEAD) this.wire.heard?.(conn, member, bytes.subarray(SOUND_HEAD));
      return;
    }
    if (bytes.length < 2 || bytes.length > MAX_FRAME_BYTES || bytes[0] !== FRAME_POSES) return this.bad(conn);
    bytes[1] = member.slot;
    for (const other of this.members.keys()) if (other !== conn) this.wire.send(other, data);
  }

  /**
   * A player has touched a present. The first to do so is given the pet in
   * it; a touch that comes while that is being done, or after, is too late.
   * Only a player touches: a game never speaks for the parrots it runs.
   */
  private open(conn: C, member: Member, id: string): void {
    const gift = this.gift;
    if (!gift || gift.id !== id || this.opening) return;
    this.opening = true;
    const given = this.wire.give ? this.wire.give(member, gift).catch(() => false) : Promise.resolve(false);
    void given.then((ok) => {
      this.opening = false;
      // No room for it, or it could not be given: the present stays for somebody else.
      if (!ok) return this.tell(conn, { t: 'shut', id });
      this.gift = null;
      this.wire.keepGift?.(null);
      this.tellAll({ t: 'opened', id, by: member.slot });
    });
  }

  private remove(conn: C): void {
    const member = this.members.get(conn);
    if (!member) return;
    const host = this.host;
    this.members.delete(conn);
    // What they carried, and what their game was moving, goes back to where it started.
    for (const toyId of this.world.leave(member.id)) this.tellAll({ t: 'act', action: { type: 'home', toyId } });
    this.tellAll({ t: 'leave', slot: member.slot });
    if (host === member.slot && this.members.size > 0) this.tellAll({ t: 'host', slot: this.host });
    // An empty lobby starts afresh for whoever comes next.
    if (this.members.size === 0) {
      this.world = new LobbyWorld();
      this.wire.save?.(null);
    } else this.save();
  }

  /** Keep how the toys stand, if that has changed. */
  private save(): void {
    if (!this.world.changed) return;
    this.world.changed = false;
    this.wire.save?.(this.world.state);
  }

  private isPlayer(id: string): boolean {
    for (const member of this.members.values()) if (member.id === id) return true;
    return false;
  }

  private bad(conn: C): void {
    this.remove(conn);
    this.wire.close(conn, CLOSE_BAD, 'bad');
  }

  /** Tell one player something. */
  tell(conn: C, message: ServerMessage): void {
    this.wire.send(conn, JSON.stringify(message));
  }

  /** Send everybody in the lobby a binary frame. */
  sendAll(frame: ArrayBuffer): void {
    for (const conn of this.members.keys()) this.wire.send(conn, frame);
  }

  private tellOthers(conn: C, message: ServerMessage): void {
    const text = JSON.stringify(message);
    for (const other of this.members.keys()) if (other !== conn) this.wire.send(other, text);
  }

  /** Tell everybody in the lobby something. */
  tellAll(message: ServerMessage): void {
    const text = JSON.stringify(message);
    for (const conn of this.members.keys()) this.wire.send(conn, text);
  }
}

const view = ({ slot, id, nickname, characterId, followerPetId }: Member): LobbyPlayer => ({
  slot,
  id,
  nickname,
  characterId,
  followerPetId,
});

function parse(text: string): Partial<ClientMessage> | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null ? (value as Partial<ClientMessage>) : null;
  } catch {
    return null;
  }
}
