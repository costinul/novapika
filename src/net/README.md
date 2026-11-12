# net

Multiplayer: up to eight signed-in players in one lobby.

The rule everything follows: each game **simulates some parrots and only
shows the rest**. It always simulates its own player and the pet following
them. The lobby's own parrots are simulated by one game, the host's: the
player who has been in the lobby longest. For the parrots it simulates a game
sends a pose many times a second; every other parrot is moved to the poses
that arrive. `Player.simulatedHere` says which is which.

- `LobbyClient.ts`: the WebSocket to the lobby server (`server/lobby.ts`),
  signed in with the same token as `src/account/`. It reconnects by itself.
- `pose.ts`: the bytes one parrot's pose travels as, and `PoseTrack`, which
  draws a parrot a tenth of a second behind, between the two poses either side.
- `RemotePlayers.ts`: the other people in the lobby and their followers, each
  an ordinary `Player` drawn by the ordinary `PlayerView`.
- `Multiplayer.ts`: joins a lobby, sends this game's poses and hears the rest.

What the game and the server say to each other is in `shared/net.ts`.
