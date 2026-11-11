// Pawn's Gambit room server.
// Pairs two players by room code, checks every move with chess.js,
// keeps both clocks, and relays chat, draw offers and rematches.

import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { Chess } from 'chess.js';

const PORT = Number(process.env.PORT) || 8787;
const ABANDON_MS = 60_000; // a disconnected player loses after this long
const ROOM_IDLE_MS = 30 * 60_000; // finished/empty rooms are cleared after this
const MIN = 60_000;

// Same options as the app's clock picker.
const TIME_CONTROLS = {
  none: { base: 0, increment: 0 },
  '3+2': { base: 3 * MIN, increment: 2000 },
  5: { base: 5 * MIN, increment: 0 },
  10: { base: 10 * MIN, increment: 0 },
  '15+10': { base: 15 * MIN, increment: 10_000 },
  30: { base: 30 * MIN, increment: 0 },
};

const REACTIONS = ['👍', '😮', '😂', '🔥', '😬', '👏', '🤝', '😭'];

const WORDS = ['KNIGHT', 'ROOK', 'BISHOP', 'PAWN', 'QUEEN', 'KING', 'CASTLE', 'GAMBIT', 'FORK', 'CHECK', 'BOARD', 'SQUARE'];

/** @type {Map<string, Room>} */
const rooms = new Map();

function newCode() {
  for (let i = 0; i < 1000; i++) {
    const code = `${WORDS[crypto.randomInt(WORDS.length)]}-${crypto.randomInt(10, 100)}`;
    if (!rooms.has(code)) return code;
  }
  return `ROOM-${crypto.randomInt(1000, 10000)}`;
}

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);

class Room {
  constructor(code, timeId, hostSide) {
    this.code = code;
    this.timeId = TIME_CONTROLS[timeId] ? timeId : 'none';
    this.tc = TIME_CONTROLS[this.timeId];
    this.hostSide = hostSide; // 'w' | 'b' | 'random'
    /** seats by color */
    this.seats = { w: null, b: null };
    this.touched = Date.now();
    this.chat = [];
    this.rematch = { w: false, b: false };
    this.newGame();
  }

  newGame() {
    this.game = new Chess();
    this.clock = { w: this.tc.base, b: this.tc.base, turnStart: null };
    this.result = null; // { kind, winner: 'w'|'b'|null, detail }
    this.drawOffer = null; // color that offered
    this.rematch = { w: false, b: false };
    this.lastMove = null;
    this.clearFlagTimer();
  }

  seatOf(token) {
    for (const c of ['w', 'b']) if (this.seats[c]?.token === token) return c;
    return null;
  }

  others(color) {
    return color === 'w' ? 'b' : 'w';
  }

  remaining(color, now = Date.now()) {
    if (!this.tc.base) return null;
    const running = !this.result && this.clock.turnStart !== null && this.game.turn() === color;
    return this.clock[color] - (running ? now - this.clock.turnStart : 0);
  }

  clearFlagTimer() {
    clearTimeout(this.flagTimer);
    this.flagTimer = null;
  }

  /** Wake up when the side to move would run out of time. */
  armFlagTimer() {
    this.clearFlagTimer();
    if (!this.tc.base || this.result || this.clock.turnStart === null) return;
    const left = this.remaining(this.game.turn());
    this.flagTimer = setTimeout(() => this.checkFlag(), Math.max(0, left) + 30);
  }

  checkFlag() {
    if (this.result || !this.tc.base) return;
    const turn = this.game.turn();
    if (this.remaining(turn) <= 0) {
      this.clock[turn] = 0;
      this.clock.turnStart = null;
      this.end('flag', this.others(turn));
    } else this.armFlagTimer();
  }

  end(kind, winner) {
    if (this.result) return;
    // Stop the running clock where it is.
    if (this.clock.turnStart !== null && this.tc.base) {
      const t = this.game.turn();
      this.clock[t] -= Date.now() - this.clock.turnStart;
    }
    this.clock.turnStart = null;
    this.result = { kind, winner };
    this.drawOffer = null;
    this.clearFlagTimer();
    this.broadcast();
  }

  afterMove(move) {
    const now = Date.now();
    if (this.tc.base) {
      if (this.clock.turnStart !== null) this.clock[move.color] -= now - this.clock.turnStart;
      this.clock[move.color] += this.tc.increment;
      this.clock.turnStart = now;
    } else {
      this.clock.turnStart = now;
    }
    this.lastMove = { from: move.from, to: move.to, san: move.san, captured: move.captured ?? null, flags: move.flags };
    this.drawOffer = null;
    const g = this.game;
    if (g.isCheckmate()) this.end('checkmate', move.color);
    else if (g.isStalemate()) this.end('stalemate', null);
    else if (g.isThreefoldRepetition()) this.end('repetition', null);
    else if (g.isInsufficientMaterial()) this.end('material', null);
    else if (g.isDraw()) this.end('fifty', null);
    else {
      this.armFlagTimer();
      this.broadcast();
    }
  }

  snapshot(forColor) {
    const now = Date.now();
    const seat = (c) => (this.seats[c] ? { name: this.seats[c].name, connected: !!this.seats[c].ws } : null);
    return {
      t: 'state',
      code: this.code,
      you: forColor,
      timeId: this.timeId,
      fen: this.game.fen(),
      moves: this.game.history(),
      lastMove: this.lastMove,
      turn: this.game.turn(),
      clocks: this.tc.base ? { w: this.remaining('w', now), b: this.remaining('b', now) } : null,
      clockRunning: this.tc.base > 0 && !this.result && this.clock.turnStart !== null,
      players: { w: seat('w'), b: seat('b') },
      result: this.result,
      drawOffer: this.drawOffer,
      rematch: this.rematch,
      chat: this.chat.slice(-50),
    };
  }

  broadcast() {
    this.touched = Date.now();
    for (const c of ['w', 'b']) {
      const s = this.seats[c];
      if (s?.ws && s.ws.readyState === 1) s.ws.send(JSON.stringify(this.snapshot(c)));
    }
  }
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function handle(ws, msg) {
  switch (msg.t) {
    case 'create': {
      const code = newCode();
      const room = new Room(code, msg.timeId, ['w', 'b', 'random'].includes(msg.side) ? msg.side : 'random');
      const color = room.hostSide === 'random' ? (crypto.randomInt(2) ? 'w' : 'b') : room.hostSide;
      const token = crypto.randomUUID();
      room.seats[color] = { name: clean(msg.name, 24) || 'Player 1', token, ws };
      rooms.set(code, room);
      ws.room = room;
      ws.color = color;
      send(ws, { t: 'joined', code, color, token });
      room.broadcast();
      return;
    }
    case 'join': {
      const code = clean(msg.code, 20).toUpperCase().replace(/\s+/g, '-');
      const room = rooms.get(code);
      if (!room) return send(ws, { t: 'error', message: `No game found with code ${code || '(blank)'}. Check the code and try again.` });
      const free = ['w', 'b'].find((c) => !room.seats[c]);
      if (!free) return send(ws, { t: 'error', message: 'That game already has two players.' });
      const token = crypto.randomUUID();
      room.seats[free] = { name: clean(msg.name, 24) || 'Player 2', token, ws };
      ws.room = room;
      ws.color = free;
      send(ws, { t: 'joined', code, color: free, token });
      room.broadcast();
      return;
    }
    case 'resume': {
      const room = rooms.get(clean(msg.code, 20));
      const color = room?.seatOf(msg.token);
      if (!room || !color) return send(ws, { t: 'error', message: 'That game has ended or expired.', fatal: true });
      const seat = room.seats[color];
      if (seat.ws && seat.ws !== ws) seat.ws.close();
      seat.ws = ws;
      clearTimeout(seat.abandonTimer);
      ws.room = room;
      ws.color = color;
      send(ws, { t: 'joined', code: room.code, color, token: seat.token });
      room.broadcast();
      return;
    }
  }

  const room = ws.room;
  const color = ws.color;
  if (!room || !color) return send(ws, { t: 'error', message: 'Join a game first.' });
  const opponentHere = !!room.seats[room.others(color)];

  switch (msg.t) {
    case 'move': {
      if (room.result) return;
      if (!opponentHere) return send(ws, { t: 'error', message: 'Wait for your friend to join before moving.' });
      if (room.game.turn() !== color) return send(ws, { t: 'error', message: 'It’s not your turn.' });
      let move;
      try {
        move = room.game.move({ from: msg.from, to: msg.to, promotion: msg.promotion });
      } catch {
        room.broadcast(); // resync the client
        return;
      }
      room.afterMove(move);
      return;
    }
    case 'resign':
      if (!room.result && room.game.history().length > 0) room.end('resign', room.others(color));
      return;
    case 'offer-draw':
      if (!room.result && opponentHere) {
        room.drawOffer = color;
        room.broadcast();
      }
      return;
    case 'answer-draw':
      if (!room.result && room.drawOffer && room.drawOffer !== color) {
        if (msg.accept) room.end('agreed', null);
        else {
          room.drawOffer = null;
          room.broadcast();
        }
      }
      return;
    case 'rematch': {
      if (!room.result) return;
      room.rematch[color] = true;
      if (room.rematch.w && room.rematch.b) {
        // Swap colors for the next game.
        const { w, b } = room.seats;
        room.seats = { w: b, b: w };
        // Chat is labeled by color, so flip it to keep each message with its author.
        for (const m of room.chat) m.from = m.from === 'w' ? 'b' : 'w';
        for (const c of ['w', 'b']) if (room.seats[c]?.ws) room.seats[c].ws.color = c;
        room.newGame();
      }
      room.broadcast();
      return;
    }
    case 'react': {
      // Quick emoji reactions: a fixed set, and at most 4 every 5 seconds.
      if (!REACTIONS.includes(msg.emoji)) return;
      const now = Date.now();
      ws.reacts = (ws.reacts ?? []).filter((t) => now - t < 5000);
      if (ws.reacts.length >= 4) return;
      ws.reacts.push(now);
      for (const c of ['w', 'b']) {
        const s = room.seats[c];
        if (s?.ws) send(s.ws, { t: 'reaction', from: color, emoji: msg.emoji });
      }
      return;
    }
    case 'chat': {
      const text = clean(msg.text, 200);
      if (!text) return;
      room.chat.push({ from: color, text, at: Date.now() });
      if (room.chat.length > 200) room.chat.shift();
      room.broadcast();
      return;
    }
  }
}

const server = http.createServer((req, res) => {
  // Health check for the hosting service.
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`Pawn's Gambit server is running. ${rooms.size} active rooms.\n`);
});

const wss = new WebSocketServer({ server, maxPayload: 4096 });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (msg && typeof msg.t === 'string') handle(ws, msg);
  });
  ws.on('close', () => {
    const room = ws.room;
    const seat = room?.seats[ws.color];
    if (!seat || seat.ws !== ws) return;
    seat.ws = null;
    room.broadcast();
    // If they don't come back, the other player wins.
    seat.abandonTimer = setTimeout(() => {
      if (!seat.ws && !room.result && room.game.history().length > 0 && room.seats[room.others(ws.color)]) {
        room.end('abandon', room.others(ws.color));
      }
    }, ABANDON_MS);
  });
});

// Drop dead connections and stale rooms.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) ws.terminate();
    else {
      ws.isAlive = false;
      ws.ping();
    }
  }
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyone = room.seats.w?.ws || room.seats.b?.ws;
    if (!anyone && now - room.touched > ROOM_IDLE_MS) {
      room.clearFlagTimer();
      rooms.delete(code);
    }
  }
}, 30_000);

server.listen(PORT, () => console.log(`Pawn's Gambit server listening on port ${PORT}`));
