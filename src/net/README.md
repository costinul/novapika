# net (reserved, empty in v1)

Multiplayer goes here later: a WebSocket client for the Go game server.

How it plugs in without a rewrite:

- A remote player is the same `Player` class as the local one. A network
  `InputSource` fills its `PlayerInput` instead of the headset.
- World changes (pick up, drop, place, ring) pass through one action layer
  keyed by stable object ids (built in milestone 4). The server approves or
  rejects them there.

No networking code is written in v1.
