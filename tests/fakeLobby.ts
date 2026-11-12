import { LobbyRules } from '../server/lobbyRules';
import type { Connect, LinkHandlers } from '../src/net/LobbyClient';

interface Conn {
  handlers: LinkHandlers;
  open: boolean;
}

/**
 * A lobby as the game sees it, without a network: the real lobby rules, with
 * each game's line wired straight to them. A line opens a moment after it is
 * asked for, as a real one does; `await settle()` lets it.
 */
export function fakeLobby(): { rules: LobbyRules<Conn>; as(id: string, nickname: string): Connect } {
  let clock = 0;
  const rules = new LobbyRules<Conn>({
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
  });
  return {
    rules,
    as: (id, nickname) => (_lobbyId, handlers) => {
      const conn: Conn = { handlers, open: false };
      let wanted = true;
      queueMicrotask(() => {
        if (!wanted) return;
        conn.open = true;
        rules.join(conn, { id, nickname }, ++clock);
        if (conn.open) handlers.onOpen();
      });
      return {
        get open() {
          return conn.open;
        },
        send: (message) => rules.text(conn, JSON.stringify(message)),
        sendFrame: (data) => rules.binary(conn, data.slice().buffer),
        close: () => {
          wanted = false;
          if (!conn.open) return;
          conn.open = false;
          rules.leave(conn);
          handlers.onClose();
        },
      };
    },
  };
}

/** Let lines open and messages arrive. */
export const settle = async (): Promise<void> => {
  for (let i = 0; i < 3; i++) await new Promise((done) => setTimeout(done, 0));
};
