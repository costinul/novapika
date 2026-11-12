import { LobbyRules } from '../server/lobbyRules';
import type { SharedWorld } from '../shared/net';
import type { Connect, LinkHandlers } from '../src/net/LobbyClient';

interface Conn {
  handlers: LinkHandlers;
  open: boolean;
}

export interface FakeLobby {
  rules: LobbyRules<Conn>;
  /** A way in for the player with this id and nickname. */
  as(id: string, nickname: string): Connect;
  /** What the lobby last kept of how its toys stand; null once it is empty. */
  saved: SharedWorld | null;
  /** From now, what the games say to the lobby waits, as if on its way. */
  hold(): void;
  /** Everything that was waiting arrives, in the order it was said. */
  release(): void;
}

/**
 * A lobby as the game sees it, without a network: the real lobby rules, with
 * each game's line wired straight to them. A line opens a moment after it is
 * asked for, as a real one does; `await settle()` lets it.
 */
export function fakeLobby(): FakeLobby {
  let clock = 0;
  let waiting: (() => void)[] | null = null;
  const lobby: FakeLobby = {
    saved: null,
    rules: new LobbyRules<Conn>({
      send: (conn, data) => {
        if (!conn.open) return;
        if (typeof data === 'string') conn.handlers.onMessage(JSON.parse(data));
        else conn.handlers.onFrame(data.slice(0));
      },
      close: (conn) => {
        if (!conn.open) return;
        conn.open = false;
        conn.handlers.onClose();
      },
      keep: () => {},
      save: (world) => void (lobby.saved = world && JSON.parse(JSON.stringify(world))),
    }),
    hold: () => void (waiting = []),
    release: () => {
      const arrived = waiting ?? [];
      waiting = null;
      for (const arrive of arrived) arrive();
    },
    as: (id, nickname) => (_lobbyId, handlers) => {
      const conn: Conn = { handlers, open: false };
      let wanted = true;
      queueMicrotask(() => {
        if (!wanted) return;
        conn.open = true;
        lobby.rules.join(conn, { id, nickname }, ++clock);
        if (conn.open) handlers.onOpen();
      });
      return {
        get open() {
          return conn.open;
        },
        send: (message) => {
          const text = JSON.stringify(message);
          const arrive = (): void => lobby.rules.text(conn, text);
          if (waiting) waiting.push(arrive);
          else arrive();
        },
        sendFrame: (data) => lobby.rules.binary(conn, data.slice().buffer),
        close: () => {
          wanted = false;
          if (!conn.open) return;
          conn.open = false;
          lobby.rules.leave(conn);
          handlers.onClose();
        },
      };
    },
  };
  return lobby;
}

/** Let lines open and messages arrive. */
export const settle = async (): Promise<void> => {
  for (let i = 0; i < 3; i++) await new Promise((done) => setTimeout(done, 0));
};
