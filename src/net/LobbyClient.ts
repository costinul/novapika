import { CLOSE_ELSEWHERE, PROTOCOL } from '../../shared/net';
import type { ClientMessage, ServerMessage } from '../../shared/net';
import { savedToken } from '../account/account';

// The game's line to a lobby: a WebSocket to the server, signed in with the
// same token as everything else, that comes back by itself when it drops.

export interface LinkHandlers {
  /** The line is up. Everything known about the lobby before is out of date. */
  onOpen(): void;
  onMessage(message: ServerMessage): void;
  /** A binary frame, passed on from another player. */
  onFrame(data: ArrayBuffer): void;
  /** The line is down. It is tried again unless it was closed from here. */
  onClose(): void;
  /** The server would not open a line at all: perhaps the sign-in is no longer good. */
  onRefused(): void;
}

/** A line to a lobby. */
export interface Link {
  readonly open: boolean;
  send(message: ClientMessage): void;
  sendFrame(data: Uint8Array<ArrayBuffer>): void;
  close(): void;
}

/** Opens a line to a lobby. The game uses `connectLobby`; tests wire one up without a network. */
export type Connect = (lobbyId: string, handlers: LinkHandlers) => Link;

const RETRY_FIRST = 1000; // ms
const RETRY_MOST = 8000; // ms

export const connectLobby: Connect = (lobbyId, handlers) => {
  let socket: WebSocket | null = null;
  let wanted = true;
  let open = false;
  let retry = RETRY_FIRST;

  const again = (): void => {
    if (!wanted) return;
    setTimeout(start, retry);
    retry = Math.min(RETRY_MOST, retry * 2);
  };

  function start(): void {
    if (!wanted) return;
    const token = savedToken();
    if (!token) return handlers.onRefused();
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    // The token rides in the list of protocols, never in the address.
    const ws = new WebSocket(`${scheme}://${location.host}/api/lobby/${lobbyId}`, [PROTOCOL, token]);
    ws.binaryType = 'arraybuffer';
    socket = ws;
    ws.onopen = () => {
      open = true;
      retry = RETRY_FIRST;
      handlers.onOpen();
    };
    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return handlers.onFrame(event.data as ArrayBuffer);
      try {
        handlers.onMessage(JSON.parse(event.data) as ServerMessage);
      } catch (error) {
        console.error(error);
      }
    };
    ws.onclose = (event) => {
      if (socket !== ws) return;
      socket = null;
      const wasOpen = open;
      open = false;
      if (wasOpen) handlers.onClose();
      else if (wanted) handlers.onRefused();
      // Somebody signed in as this player elsewhere: leave them to it.
      if (event.code !== CLOSE_ELSEWHERE) again();
    };
  }
  start();

  return {
    get open() {
      return open;
    },
    send: (message) => {
      if (open) socket?.send(JSON.stringify(message));
    },
    sendFrame: (data) => {
      if (open) socket?.send(data);
    },
    close: () => {
      wanted = false;
      const wasOpen = open;
      open = false;
      const ws = socket;
      socket = null;
      ws?.close();
      if (wasOpen) handlers.onClose();
    },
  };
};
