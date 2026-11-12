import { Vector3 } from 'three';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../src/engine/physics';
import { Multiplayer } from '../src/net/Multiplayer';
import { POSE_BYTES, POSE_DELAY, POSE_PLAYER, Pose, PoseTrack, readPose, writePose } from '../src/net/pose';
import { Player } from '../src/player/Player';
import { WorldState } from '../src/world/WorldState';
import { fakeLobby, settle } from './fakeLobby';

// Two games in one lobby, joined through the real lobby rules with no
// network in between.

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = await PhysicsWorld.create();
});

describe('a pose on the wire', () => {
  it('comes out as it went in', () => {
    const player = new Player('a', 'nova');
    player.position.set(12.5, 30.25, -7.75);
    player.velocity.set(3.21, -9.87, 0.5);
    player.movementState = 'gliding';
    player.input.head.position.set(0.1, 1.42, -0.2);
    player.input.head.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), 1.1);
    player.input.hands.left.grip.position.set(-0.71, 1.3, -0.1);
    player.input.hands.right.grip.position.set(0.69, 1.25, -0.15);
    player.claws.right.planted = true;
    player.claws.right.normal.set(1, 0, 0);
    player.wings.flapping = true;
    player.wings.rolling = -1;
    player.wings.roll = -2.345;
    player.stamina = 0.4;
    player.reachScale = 0.8;
    player.excitement = 0.6;

    const view = new DataView(new ArrayBuffer(10 + POSE_BYTES));
    writePose(view, 10, POSE_PLAYER, player);
    const pose = new Pose();
    readPose(view, 10, pose);

    expect(pose.kind).toBe(POSE_PLAYER);
    expect(pose.state).toBe('gliding');
    expect(pose.position.distanceTo(player.position)).toBeLessThan(1e-4);
    expect(pose.velocity.distanceTo(player.velocity)).toBeLessThan(0.01);
    expect(pose.head.distanceTo(player.input.head.position)).toBeLessThan(0.001);
    expect(pose.headTurn.angleTo(player.input.head.quaternion)).toBeLessThan(0.001);
    expect(pose.hands.left.distanceTo(player.input.hands.left.grip.position)).toBeLessThan(0.001);
    expect(pose.hands.right.distanceTo(player.input.hands.right.grip.position)).toBeLessThan(0.001);
    expect(pose.planted).toEqual({ left: false, right: true });
    expect(pose.clawNormal.right.distanceTo(new Vector3(1, 0, 0))).toBeLessThan(0.01);
    expect(pose.flapping).toBe(true);
    expect(pose.rolling).toBe(-1);
    expect(pose.roll).toBeCloseTo(-2.345, 3);
    expect(pose.stamina).toBeCloseTo(0.4, 2);
    expect(pose.reachScale).toBeCloseTo(0.8, 2);
    expect(pose.excitement).toBeCloseTo(0.6, 2);
  });

  it('is drawn a little behind, part-way between the two poses either side', () => {
    const from = new Player('a', 'nova');
    const view = new DataView(new ArrayBuffer(POSE_BYTES));
    const track = new PoseTrack();
    const shown = new Player('copy', 'nova');
    expect(track.started).toBe(false);

    for (const [x, time] of [
      [0, 1.0],
      [1, 1.1],
      [2, 1.2],
    ]) {
      from.position.set(x, 0, 0);
      writePose(view, 0, POSE_PLAYER, from);
      track.push(view, 0, time);
    }
    track.apply(shown, 1.05 + POSE_DELAY);
    expect(shown.position.x).toBeCloseTo(0.5, 3);
    track.apply(shown, 1.175 + POSE_DELAY);
    expect(shown.position.x).toBeCloseTo(1.75, 3);
    // Nothing newer has been heard: it waits at the last pose.
    track.apply(shown, 5);
    expect(shown.position.x).toBeCloseTo(2, 3);
    // Asked about a time before anything was heard: the oldest pose.
    track.apply(shown, 0);
    expect(shown.position.x).toBeCloseTo(0, 3);
  });
});

describe('two players in a lobby', () => {
  interface Game {
    world: WorldState;
    local: Player;
    net: Multiplayer;
    /** What the game asked of its voice, in order. */
    voice: string[];
  }
  let lobby: ReturnType<typeof fakeLobby>;
  let time: number;
  let alex: Game;
  let sam: Game;
  /** Where the last game to draw a frame told its voice the players in places 0 and 1 are. */
  let heads: (number | null)[];

  const game = (id: string, nickname: string, characterId: string): Game => {
    const world = new WorldState(physics);
    const local = new Player('local', characterId);
    world.players.set(local.id, local);
    const voice: string[] = [];
    const net = new Multiplayer({
      world,
      feathers: null,
      local,
      connect: lobby.as(id, nickname),
      about: () => ({ characterId: local.characterId, followerPetId: null }),
      onRefused: () => {},
      now: () => time,
      voice: {
        call: (slot) => void voice.push(`call ${slot}`),
        signal: (from, data) => void voice.push(`signal ${from} ${JSON.stringify(data)}`),
        remove: (slot) => void voice.push(`remove ${slot}`),
        clear: () => void voice.push('clear'),
        place: (_position, _turn, headOf) => void (heads = [0, 1].map((slot) => headOf(slot)?.x ?? null)),
      },
    });
    return { world, local, net, voice };
  };
  /** Both games draw frames for `seconds`. */
  const play = (seconds: number): void => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      time += 1 / 60;
      alex.net.frame(1 / 60);
      sam.net.frame(1 / 60);
    }
  };

  beforeEach(async () => {
    physics.clear();
    lobby = fakeLobby();
    time = 100;
    alex = game('id-alex', 'Alex', 'nova');
    sam = game('id-sam', 'Sam', 'macaw');
    alex.net.join('aviary');
    await settle();
    sam.net.join('aviary');
    await settle();
  });

  it('puts each in the other\'s world once they have been seen to move', () => {
    expect(alex.net.online && sam.net.online).toBe(true);
    // Nobody stands at the middle of the world waiting for their first pose.
    expect([...alex.world.players.keys()]).toEqual(['local']);

    alex.local.position.set(3, 20, -4);
    sam.local.position.set(-6, 22, 1);
    play(0.5);

    const samAtAlex = alex.world.players.get('id-sam')!;
    expect(samAtAlex.position.distanceTo(sam.local.position)).toBeLessThan(0.01);
    expect(samAtAlex.characterId).toBe('macaw');
    expect(samAtAlex.human).toBe(true);
    expect(samAtAlex.simulatedHere).toBe(false);
    const alexAtSam = sam.world.players.get('id-alex')!;
    expect(alexAtSam.position.distanceTo(alex.local.position)).toBeLessThan(0.01);
    expect(alexAtSam.characterId).toBe('nova');
    // Each game still runs only its own player.
    expect(alex.local.simulatedHere && sam.local.simulatedHere).toBe(true);
  });

  it('shows the head and hands where the other player has them', () => {
    sam.local.position.set(5, 10, 5);
    sam.local.input.head.position.set(0.1, 1.5, 0);
    sam.local.input.hands.left.grip.position.set(-0.6, 1.4, -0.1);
    play(0.5);
    const shown = alex.world.players.get('id-sam')!;
    expect(shown.head.position.distanceTo(new Vector3(5.1, 11.5, 5))).toBeLessThan(0.01);
    expect(shown.hands.left.grip.position.distanceTo(new Vector3(4.4, 11.4, 4.9))).toBeLessThan(0.01);
  });

  it('follows a player who keeps moving, a moment behind', () => {
    for (let i = 0; i < 120; i++) {
      sam.local.position.x += 2 / 60; // 2 m/s
      play(1 / 60);
    }
    const shown = alex.world.players.get('id-sam')!;
    const behind = sam.local.position.x - shown.position.x;
    expect(behind).toBeGreaterThan(0.1);
    expect(behind).toBeLessThan(0.5);
  });

  it('shows a player as the parrot they change into', async () => {
    play(0.2);
    sam.local.characterId = 'budgie';
    sam.net.aboutChanged();
    await settle();
    expect(alex.world.players.get('id-sam')!.characterId).toBe('budgie');
  });

  it('shows the default parrot for one it does not know', async () => {
    play(0.2);
    sam.local.characterId = 'dragon';
    sam.net.aboutChanged();
    await settle();
    expect(alex.world.players.get('id-sam')!.characterId).toBe('nova');
  });

  it('takes a player out of the world when they leave', () => {
    play(0.2);
    sam.net.leave();
    expect(sam.net.online).toBe(false);
    expect([...alex.world.players.keys()]).toEqual(['local']);
    // And whoever left sees nobody either.
    expect([...sam.world.players.keys()]).toEqual(['local']);
  });

  it('has the player in the lower place ring the other, once', async () => {
    expect(alex.voice.filter((line) => line.startsWith('call'))).toEqual(['call 1']);
    expect(sam.voice.filter((line) => line.startsWith('call'))).toEqual([]);
    // Changing parrot is not a reason to ring again.
    sam.local.characterId = 'budgie';
    sam.net.aboutChanged();
    await settle();
    expect(alex.voice.filter((line) => line.startsWith('call'))).toEqual(['call 1']);
  });

  it('carries the messages that set a call up, to the one they are for', () => {
    alex.net.sendRtc(1, { sdp: { type: 'offer', sdp: 'v=0' } });
    expect(sam.voice.at(-1)).toBe('signal 0 {"sdp":{"type":"offer","sdp":"v=0"}}');
    sam.net.sendRtc(0, { ice: { candidate: 'c' } });
    expect(alex.voice.at(-1)).toBe('signal 1 {"ice":{"candidate":"c"}}');
  });

  it('tells its voice where everyone is, and when they leave', () => {
    sam.local.position.set(-6, 22, 1);
    alex.net.frame(1 / 60);
    // Not seen to move yet: nowhere to play their voice from.
    expect(heads).toEqual([null, null]);
    play(0.5);
    alex.net.frame(1 / 60);
    expect(heads[1]).toBeCloseTo(-6, 2);

    sam.net.leave();
    expect(alex.voice.at(-1)).toBe('remove 1');
    expect(sam.voice.at(-1)).toBe('clear');
  });

  it('starts afresh when the line drops and comes back', async () => {
    play(0.2);
    sam.net.join('aviary');
    expect([...sam.world.players.keys()]).toEqual(['local']);
    await settle();
    play(0.3);
    expect(sam.world.players.has('id-alex')).toBe(true);
    expect(alex.world.players.has('id-sam')).toBe(true);
    expect(lobby.rules.players).toHaveLength(2);
  });
});
