// Every change to a lobby's toys, bells and rings is one of these named
// actions, addressed by stable ids. The game applies them; with other
// players about, the lobby server checks them and passes them on.

/** Where a toy lies: its position, then its turn as a quaternion. */
export type ToyPlace = readonly [number, number, number, number, number, number, number];

export type Action =
  | { type: 'pickUp'; playerId: string; toyId: string }
  | { type: 'drop'; playerId: string }
  | { type: 'place'; toyId: string; targetId: string }
  /** Food was eaten: the toy goes back to where it started. */
  | { type: 'eat'; toyId: string }
  | { type: 'ring'; objectId: string; playerId: string }
  | { type: 'passRing'; ringId: string; playerId: string }
  | { type: 'splash'; waterId: string; playerId: string }
  /** Take a toy out of another parrot's beak. */
  | { type: 'take'; playerId: string; toyId: string }
  | { type: 'chooseCharacter'; playerId: string; characterId: string }
  /** A stunt was recognised. Changes nothing; it is cheered with a chirp. */
  | { type: 'stunt'; playerId: string; name: string }
  /** An activity was finished: every bell rung, or every ring flown. */
  | { type: 'celebrate'; what: 'bells' | 'rings' }
  // The rest only happen with other players about, to keep every game's toys the same.
  /** A loose toy has come to rest, here. Said by the game that was moving it. */
  | { type: 'rest'; toyId: string; at: ToyPlace }
  /** A toy lying still was knocked: `playerId`'s game moves it from now, until it rests. */
  | { type: 'claim'; toyId: string; playerId: string }
  /** A toy went back to where it started: lost, left lying too long, or let go of by somebody who left. */
  | { type: 'home'; toyId: string };

const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 64;
const isPlace = (value: unknown): value is ToyPlace =>
  Array.isArray(value) && value.length === 7 && value.every((n) => typeof n === 'number' && Number.isFinite(n));

/** The action in something that came over the network, or null if it is not one. */
export function parseAction(value: unknown): Action | null {
  if (typeof value !== 'object' || value === null) return null;
  const a = value as Record<string, unknown>;
  switch (a.type) {
    case 'pickUp':
    case 'take':
    case 'claim':
      return isId(a.playerId) && isId(a.toyId) ? { type: a.type, playerId: a.playerId, toyId: a.toyId } : null;
    case 'drop':
      return isId(a.playerId) ? { type: 'drop', playerId: a.playerId } : null;
    case 'place':
      return isId(a.toyId) && isId(a.targetId) ? { type: 'place', toyId: a.toyId, targetId: a.targetId } : null;
    case 'eat':
    case 'home':
      return isId(a.toyId) ? { type: a.type, toyId: a.toyId } : null;
    case 'ring':
      return isId(a.objectId) && isId(a.playerId) ? { type: 'ring', objectId: a.objectId, playerId: a.playerId } : null;
    case 'passRing':
      return isId(a.ringId) && isId(a.playerId) ? { type: 'passRing', ringId: a.ringId, playerId: a.playerId } : null;
    case 'splash':
      return isId(a.waterId) && isId(a.playerId) ? { type: 'splash', waterId: a.waterId, playerId: a.playerId } : null;
    case 'chooseCharacter':
      return isId(a.playerId) && isId(a.characterId)
        ? { type: 'chooseCharacter', playerId: a.playerId, characterId: a.characterId }
        : null;
    case 'stunt':
      return isId(a.playerId) && isId(a.name) ? { type: 'stunt', playerId: a.playerId, name: a.name } : null;
    case 'celebrate':
      return a.what === 'bells' || a.what === 'rings' ? { type: 'celebrate', what: a.what } : null;
    case 'rest':
      return isId(a.toyId) && isPlace(a.at) ? { type: 'rest', toyId: a.toyId, at: a.at } : null;
    default:
      return null;
  }
}
