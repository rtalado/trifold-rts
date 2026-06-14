// Trifold RTS — self-hosted game server (no external dependencies).
// Serves the game and relays messages between everyone in a room. Rooms are
// keyed by a 5-letter code; up to 4 players share a lobby. The host's browser
// is authoritative (simulates + streams snapshots); this server just forwards.
//
//   Run it with:  node server.js     (or use start.bat / start.sh)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json' };

// ---------------- static file server ----------------
const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';
  const file = path.join(ROOT, path.normalize(url));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------------- minimal WebSocket ----------------
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const accept = key => crypto.createHash('sha1').update(key + GUID).digest('base64');

server.on('upgrade', (req, socket, head) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  socket.setNoDelay(true);
  socket.write('HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept(key) + '\r\n\r\n');
  const conn = new Conn(socket);
  socket.on('data', d => conn.onData(d));
  socket.on('error', () => conn.close());
  socket.on('close', () => conn.onClose());
  if (head && head.length) conn.onData(head);
});

class Conn {
  constructor(socket) {
    this.socket = socket; this.buf = Buffer.alloc(0);
    this.room = null; this.slot = -1; this.fac = null; this.host = false;
    this.alive = true; this._closed = false;
    wireRoom(this);
  }
  onData(d) { this.buf = Buffer.concat([this.buf, d]); this.parse(); }
  parse() {
    while (this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1];
      const op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      const need = off + (masked ? 4 : 0) + len;
      if (this.buf.length < need) return;
      let payload;
      if (masked) {
        const mask = this.buf.slice(off, off + 4); off += 4;
        payload = Buffer.allocUnsafe(len);
        for (let i = 0; i < len; i++) payload[i] = this.buf[off + i] ^ mask[i & 3];
      } else payload = this.buf.slice(off, off + len);
      this.buf = this.buf.slice(need);
      if (op === 8) { this.close(); return; }                 // close
      else if (op === 9) { this.sendFrame(payload, 0xA); }     // ping -> pong
      else if (op === 1) { try { this.onmessage(JSON.parse(payload.toString('utf8'))); } catch (e) {} }
    }
  }
  sendFrame(payload, op = 1) {
    if (!this.alive) return;
    const len = payload.length;
    let header;
    if (len < 126) header = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { header = Buffer.allocUnsafe(4); header[0] = 0x80 | op; header[1] = 126; header.writeUInt16BE(len, 2); }
    else { header = Buffer.allocUnsafe(10); header[0] = 0x80 | op; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
    try { this.socket.write(Buffer.concat([header, payload])); } catch (e) { this.close(); }
  }
  send(obj) { this.sendFrame(Buffer.from(JSON.stringify(obj))); }
  close() { if (!this.alive) return; this.alive = false; try { this.socket.end(); } catch (e) {} this.onClose(); }
  onClose() { if (this._closed) return; this._closed = true; this.alive = false; leaveRoom(this); }
}

// ---------------- rooms ----------------
const rooms = new Map(); // code -> { code, conns:[Conn], started:bool }
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no easily-confused chars
function genCode() {
  let c;
  do { c = ''; for (let i = 0; i < 5; i++) c += ALPHABET[(Math.random() * ALPHABET.length) | 0]; }
  while (rooms.has(c));
  return c;
}
function freeSlot(room) {
  const used = new Set(room.conns.map(c => c.slot));
  for (let i = 0; i < 4; i++) if (!used.has(i)) return i;
  return -1;
}
function lobbyMsg(room) {
  return { t: 'lobby', players: room.conns.map(c => ({ slot: c.slot, fac: c.fac, host: c.host })).sort((a, b) => a.slot - b.slot) };
}
function broadcast(room, obj, except) { for (const c of room.conns) if (c !== except) c.send(obj); }

function wireRoom(conn) {
  conn.onmessage = m => {
    if (m.t === 'create') {
      const code = genCode();
      const room = { code, conns: [], started: false };
      rooms.set(code, room);
      conn.room = room; conn.slot = 0; conn.host = true; room.conns.push(conn);
      conn.send({ t: 'created', code, slot: 0 });
      broadcast(room, lobbyMsg(room));
    } else if (m.t === 'join') {
      const room = rooms.get((m.code || '').toUpperCase());
      if (!room) { conn.send({ t: 'err', msg: 'No room with that code.' }); return; }
      if (room.started) { conn.send({ t: 'err', msg: 'That match has already started.' }); return; }
      if (room.conns.length >= 4) { conn.send({ t: 'err', msg: 'That room is full (4 players).' }); return; }
      const slot = freeSlot(room);
      conn.room = room; conn.slot = slot; conn.host = false; room.conns.push(conn);
      conn.send({ t: 'joined', code: room.code, slot });
      broadcast(room, lobbyMsg(room));
    } else if (!conn.room) {
      // ignore anything before joining a room
    } else if (m.t === 'pick') {
      conn.fac = m.fac;
      broadcast(conn.room, lobbyMsg(conn.room));
    } else if (m.t === 'start') {
      conn.room.started = true;
      broadcast(conn.room, { t: 'start', roster: m.roster, seed: m.seed }); // to everyone, host included
    } else {
      broadcast(conn.room, m, conn); // relay gameplay (snap / cmd / msg / end) to the others
    }
  };
}

function leaveRoom(conn) {
  const room = conn.room;
  if (!room) return;
  room.conns = room.conns.filter(c => c !== conn);
  if (!room.conns.length) { rooms.delete(room.code); return; }
  if (conn.host) {
    if (room.started) broadcast(room, { t: 'hostleft' }); // authoritative player gone — match can't continue
    room.conns[0].host = true; // promote someone in the lobby
  }
  broadcast(room, lobbyMsg(room));
}

// ---------------- boot ----------------
server.listen(PORT, () => {
  const ifs = os.networkInterfaces();
  let lan = 'localhost';
  for (const name in ifs) for (const i of ifs[name]) if (i.family === 'IPv4' && !i.internal) { lan = i.address; break; }
  console.log('\n  ============================================');
  console.log('   TRIFOLD RTS  —  server running');
  console.log('  ============================================\n');
  console.log('   On this computer:        http://localhost:' + PORT);
  console.log('   Friends on your network: http://' + lan + ':' + PORT + '\n');
  console.log('   1. Open the address above in a browser.');
  console.log('   2. Click HOST GAME to get a 5-letter room code.');
  console.log('   3. Share that code (and the network address) with friends.');
  console.log('   (Playing over the internet needs port ' + PORT + ' forwarded, or a tunnel.)\n');
  console.log('   Press Ctrl+C to stop the server.\n');
});
