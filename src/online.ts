// Connection to the Pawn's Gambit room server, with automatic reconnect.

import type { Color } from 'chess.js';

export const SERVER_URL: string = import.meta.env.VITE_SERVER_URL ?? 'ws://localhost:8787';

export type EndKind =
  | 'checkmate'
  | 'resign'
  | 'flag'
  | 'abandon'
  | 'agreed'
  | 'stalemate'
  | 'repetition'
  | 'material'
  | 'fifty';

export interface Seat {
  name: string;
  connected: boolean;
}

export interface RoomState {
  t: 'state';
  code: string;
  you: Color;
  timeId: string;
  fen: string;
  moves: string[];
  lastMove: { from: string; to: string; san: string; captured: string | null; flags: string } | null;
  turn: Color;
  clocks: { w: number; b: number } | null;
  clockRunning: boolean;
  players: { w: Seat | null; b: Seat | null };
  result: { kind: EndKind; winner: Color | null } | null;
  drawOffer: Color | null;
  rematch: { w: boolean; b: boolean };
  chat: { from: Color; text: string; at: number }[];
}

export type StartRequest =
  | { mode: 'create'; name: string; timeId: string; side: 'w' | 'b' | 'random' }
  | { mode: 'join'; name: string; code: string };

type Status = 'connecting' | 'open' | 'reconnecting' | 'failed';

interface Handlers {
  onState: (s: RoomState, receivedAt: number) => void;
  onError: (message: string, fatal: boolean) => void;
  onStatus: (s: Status) => void;
}

export class OnlineClient {
  private ws: WebSocket | null = null;
  private code: string | null = null;
  private token: string | null = null;
  private closed = false;
  private retries = 0;
  private retryTimer: number | undefined;

  constructor(
    private start: StartRequest,
    private h: Handlers,
  ) {
    this.connect();
  }

  private connect() {
    this.h.onStatus(this.retries === 0 && !this.token ? 'connecting' : 'reconnecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(SERVER_URL);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retries = 0;
      this.h.onStatus('open');
      if (this.token && this.code) this.send({ t: 'resume', code: this.code, token: this.token });
      else if (this.start.mode === 'create')
        this.send({ t: 'create', name: this.start.name, timeId: this.start.timeId, side: this.start.side });
      else this.send({ t: 'join', name: this.start.name, code: this.start.code });
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(String(e.data));
      if (msg.t === 'joined') {
        this.code = msg.code;
        this.token = msg.token;
      } else if (msg.t === 'state') {
        this.h.onState(msg as RoomState, performance.now());
      } else if (msg.t === 'error') {
        this.h.onError(msg.message, Boolean(msg.fatal) || !this.token);
      }
    };
    ws.onclose = () => {
      if (this.closed) return;
      this.scheduleRetry();
    };
  }

  private scheduleRetry() {
    this.retries++;
    // Give up after about two minutes of trying.
    if (this.retries > 24) {
      this.h.onStatus('failed');
      return;
    }
    this.h.onStatus('reconnecting');
    this.retryTimer = window.setTimeout(() => this.connect(), Math.min(5000, 600 * this.retries));
  }

  send(msg: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close() {
    this.closed = true;
    clearTimeout(this.retryTimer);
    this.ws?.close();
  }
}

const NAME_KEY = 'chess-trainer:online-name';

export function loadName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(n: string) {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {
    /* ignore */
  }
}
