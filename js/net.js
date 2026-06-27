/* ============================================================
   MULTIPLAYER — serverless peer-to-peer over a WebRTC DataChannel.
   Signaling is manual copy/paste: the host generates an INVITE code,
   the guest pastes it and sends back a REPLY code. No server involved
   (a public STUN address is used only for NAT discovery).
   The host is authoritative: it simulates and streams snapshots;
   the guest renders snapshots and sends commands.
   ============================================================ */

const TYPE_LIST = Object.keys(DEFS);
const TYPE_IDX = {}; TYPE_LIST.forEach((t, i) => { TYPE_IDX[t] = i; });

// run-length encode the creep grid (large uniform regions → tiny payload)
function rle(arr) {
  const out = []; let v = arr[0], c = 1;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] === v) c++; else { out.push(v, c); v = arr[i]; c = 1; }
  }
  out.push(v, c); return out;
}
function unrle(data, arr) {
  let i = 0;
  for (let k = 0; k < data.length; k += 2) { arr.fill(data[k], i, i + data[k + 1]); i += data[k + 1]; }
}

function buildSnap() {
  const units = game.entities.map(e => {
    let fl = 0;
    if (e.deployed) fl |= 1;
    if (e.constructing) fl |= 2;
    if (e.growing) fl |= 4;
    if (e.order && e.order.type === 'harvest' && e.order.carry > 0) fl |= 8;
    if (e.owner) fl |= facIdx(e.owner) << 4;  // Obelisk captor (bits 4-7)
    if (e.withered) fl |= 256;                // Necrotic husk (bit 8)
    if (e.mutated) fl |= 512;                 // Wildgrowth mutated Sapling (bit 9)
    if (e.corruptUntil > game.t) fl |= 1024;  // Myriad corruption (bit 10)
    if (e.burnUntil > game.t) fl |= 2048;     // Ember burning (bit 11)
    if (e.frenzyUntil > game.t) fl |= 4096;   // Pact blood frenzy (bit 12)
    const prog = (e.constructing || e.growing) ? Math.round(e.progress / e.def.time * 100) : 0;
    const q = e.queue && e.queue.length ? e.queue[0] : null;
    const rq = e.rqueue && e.rqueue.length ? e.rqueue[0] : null;
    const ql = (e.queue || []).map(it => TYPE_IDX[it.type]);   // production: type indices
    const rl = (e.rqueue || []).map(it => it.rid);             // research: rid strings
    return [e.id, TYPE_IDX[e.type], Math.round(e.x), Math.round(e.y),
      Math.ceil(e.hp), Math.ceil(e.shield), fl, prog,
      q ? Math.round((1 - q.t / q.total) * 100) : 0, ql,
      rq ? Math.round((1 - rq.t / rq.total) * 100) : 0, rl,
      e.abilityCd ? Math.ceil(e.abilityCd) : 0];
  });
  const players = {};
  for (const f in game.players) {
    const p = game.players[f];
    players[f] = [Math.round(p.res), +p.income.toFixed(1), p.kills, p.creepTiles || 0, [...p.research], Math.round(p.iron || 0), +(p.ironInc || 0).toFixed(1), p.arkTier || 0, Math.round(p.powder || 0), +(p.powderInc || 0).toFixed(1)];
  }
  return {
    t: 'snap', gt: +game.t.toFixed(2), players, units,
    nodes: game.nodes.map(n => [n.id, n.x, n.y, Math.round(n.amount), n.max]),
    creep: rle(game.creep),
    proj: game.proj.map(p => [Math.round(p.x), Math.round(p.y), p.r, p.color]),
    fx: game.netFx.map(f => ({ ...f })),
  };
}

function applySnap(m) {
  game.t = m.gt;
  for (const f in m.players) {
    const p = game.players[f], a = m.players[f];
    if (p) { p.res = a[0]; p.income = a[1]; p.kills = a[2]; p.creepTiles = a[3];
      p.research = new Set(a[4] || []); p.iron = a[5] || 0; p.ironInc = a[6] || 0;
      p.arkTier = a[7] || 0; p.powder = a[8] || 0; p.powderInc = a[9] || 0;
      // research only ever grows, so its upgrade multipliers only need recomputing when the
      // set actually changes — skip the per-snapshot recalc (×players ×10/s) otherwise.
      const rc = (a[4] || []).length;
      if (p._rc !== rc) { p._rc = rc; recalcMul(p); } }
  }
  game.nodes = m.nodes.map(a => ({ id: a[0], x: a[1], y: a[2], amount: a[3], max: a[4], r: 20 }));
  unrle(m.creep, game.creep);
  game.proj = m.proj.map(a => ({ x: a[0], y: a[1], r: a[2], color: a[3] }));
  for (const f of m.fx) addFx(f);
  const seen = new Set();
  // index existing entities by id so reconciling a snapshot is O(n), not O(n²)
  // — with hundreds of units late-game the old per-unit .find() was the single
  // biggest cost on the guest and is what froze the joiner in long matches.
  const byIdMap = new Map();
  for (const o of game.entities) byIdMap.set(o.id, o);
  for (const row of m.units) {
    const [id, ti, x, y, hp, sh, fl, prog, qp, ql, rp, rl, acd] = row;
    seen.add(id);
    let e = byIdMap.get(id);
    if (!e) {
      const type = TYPE_LIST[ti], d = DEFS[type];
      e = { id, type, def: d, fac: d.fac, x, y, size: d.size, hpMax: d.hp,
        shieldMax: d.shield || 0, order: { type: 'idle' }, queue: [], rqueue: [], dead: false,
        deployed: false, lastHurt: -99, cd: 0, tgt: 0 };
      game.entities.push(e);
    }
    // reflect researched HP/shield upgrades (and the Ark's upgrade tier) so the
    // health bars and the Ark's size read correctly on the guest
    if (e.def.kind === 'unit') {
      const pp = game.players[e.fac];
      e.hpMax = baseHp(e) * (pp ? pp.hpBonusMul : 1);
      e.shieldMax = baseShield(e) * (pp ? pp.shBonusMul : 1);
      if (e.type === 'ark') e.size = baseSize(e);
    }
    e.nx = x; e.ny = y;
    e.hp = hp; e.shield = sh;
    e.deployed = !!(fl & 1); e.constructing = !!(fl & 2); e.growing = !!(fl & 4);
    e.withered = !!(fl & 256); e.mutated = !!(fl & 512);
    e.corruptUntil = (fl & 1024) ? game.t + 1 : 0;   // Myriad corruption marker (cosmetic on guests)
    e.burnUntil = (fl & 2048) ? game.t + 1 : 0;      // Ember burning marker (cosmetic on guests)
    e.frenzyUntil = (fl & 4096) ? game.t + 1 : 0;    // Pact blood frenzy marker (cosmetic on guests)
    if (e.mutated && e.def.kind === 'unit') e.size = Math.round(baseSize(e) * VERD.mutSize);
    const ownIdx = (fl >> 4) & 15; e.owner = ownIdx ? Object.keys(FACTIONS)[ownIdx - 1] : null;
    e.order = (fl & 8) ? { type: 'harvest', carry: 1 } : { type: 'idle' };
    e.progress = prog / 100 * e.def.time;
    e.abilityCd = acd || 0;
    // production and research queues (only the front item shows live progress)
    e.queue = (ql || []).map((v, i) => ({ type: TYPE_LIST[v], t: i === 0 ? (1 - qp / 100) : 1, total: 1 }));
    e.rqueue = (rl || []).map((v, i) => ({ research: true, rid: v, type: 'research', t: i === 0 ? (1 - rp / 100) : 1, total: 1 }));
  }
  game.entities = game.entities.filter(e => seen.has(e.id));
  game.sel = game.sel.filter(e => seen.has(e.id));
  // spectate once our core is gone (the host keeps the match running for the rest)
  if (!game.defeated && game.localFac && !game.entities.some(e => e.fac === game.localFac && e.def.core))
    game.defeated = true;
}

// guest per-frame: smooth positions toward the latest snapshot, age fx
function guestTick(dt) {
  game.t += dt;
  refreshGrafts();   // keep the local player's graft flags live (e.g. Moonsign fog reveal)
  const k = Math.min(1, dt * 12);
  for (const e of game.entities) {
    if (e.nx == null) continue;
    e.x += (e.nx - e.x) * k;
    e.y += (e.ny - e.y) * k;
  }
  for (const f of game.fx) f.ttl -= dt;
  game.fx = game.fx.filter(f => f.ttl > 0);
}


// ---------------- multiplayer (peer-to-peer over WebRTC, via PeerJS) ----------------
// No dedicated server: one player hosts and is authoritative (simulates + streams
// snapshots); guests connect straight to the host over WebRTC and send commands.
// Matchmaking goes through the free PeerJS broker, and WebRTC's NAT traversal lets
// players on different networks connect without port forwarding. The host's browser
// runs the room logic (slots, lobby, relay) that a server would normally handle.
// Up to 4 players (humans + AI) share one lobby, joined by a 5-letter code.
const PEER_PREFIX = 'trifold-rts-v1-';
const net = { peer: null, hostConn: null, connected: false, slot: -1, code: '', host: false, players: [], aiCount: 1, inGame: false };
let room = null; // host only: { started, roster, seed, members:[{ pid, conn, slot, fac, host }] }

// failsafe: what a guest needs to reconnect to a running match after a freeze/drop.
// Kept outside `net` (which onDisconnect wipes) so the Rejoin button survives a drop.
let rejoinInfo = null;       // { code, slot, fac } for the guest's live match
let lastSnapAt = 0;          // performance.now() of the last snapshot a guest applied
let rejoining = false;       // true while a reconnect attempt is in flight

// ---- match-pause failsafe (so a dropped/frozen player can always rejoin & finish) ----
// When a human guest drops or silently freezes, the host PAUSES the whole simulation and
// holds it until they reconnect — nobody advances while a player is missing. Guests send a
// heartbeat so the host can spot a silent freeze (no close/error event ever fires). A grace
// timer is the escape hatch: if a player never comes back, the host auto-continues without
// them after PAUSE_GRACE_MS (or the host clicks CONTINUE WITHOUT THEM) so the rest can finish.
const GUEST_PING_MS   = 2000;    // guest → host heartbeat cadence
const MEMBER_STALL_MS = 6000;    // no word from a guest for this long ⇒ presumed frozen ⇒ pause
const PAUSE_GRACE_MS  = 120000;  // auto-continue without a missing player after this long
const CMD_RATE_LIMIT  = 120;     // max gameplay commands a guest may have executed per second
const MAX_ORDER_IDS   = 800;     // cap a single order's selection size (anti-flood / anti-OOM)
let netPauseTarget = 0;          // client: performance.now() deadline for the pause countdown
const numOk = v => typeof v === 'number' && isFinite(v);

function netConnected() { return net.connected; }

// host: is THIS guest's data channel backed up? Each snapshot is the full state
// of the world, so when a guest can't keep up the right move is to DROP the next
// snapshot for that guest rather than queue it — a growing backlog is what freezes
// a joiner in long matches (PeerJS overflow-buffers above 8 MB and the guest never
// catches up). Checked per member so one slow joiner can't starve the others.
const SNAP_BUFFER_LIMIT = 256 * 1024; // bytes already queued on the RTCDataChannel
function memberBacklogged(m) {
  if (m.pid === 'HOST' || !m.conn || !m.conn.open) return false;
  if (m.conn.bufferSize > 0) return true; // PeerJS already overflow-buffering
  const dc = m.conn.dataChannel;
  return !!(dc && dc.bufferedAmount > SNAP_BUFFER_LIMIT);
}
function mpStatus(s) { document.getElementById('mpStatus').textContent = s || ''; }

// Unified send. Host loops messages through its own room logic (it IS the authority);
// guests send straight to the host. Routing then mirrors the old server relay.
function netSend(o) {
  if (net.host) hostHandleMsg('HOST', o);
  else if (net.hostConn && net.hostConn.open) { try { net.hostConn.send(o); } catch (e) {} }
}

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no easily-confused chars
  let c = ''; for (let i = 0; i < 5; i++) c += A[(Math.random() * A.length) | 0];
  return c;
}

// ---- host: room management (the in-browser stand-in for the old server.js) ----
function freeSlot() {
  const used = new Set(room.members.filter(m => m.slot >= 0).map(m => m.slot));
  for (let i = 0; i < 4; i++) if (!used.has(i)) return i;
  return -1;
}
function lobbyMsg() {
  return { t: 'lobby', players: room.members.filter(m => m.slot >= 0)
    .map(m => ({ slot: m.slot, fac: m.fac, host: m.host })).sort((a, b) => a.slot - b.slot) };
}
function hostSendTo(pid, o) {
  if (pid === 'HOST') { handleNet(o); return; } // loopback to the host's own client
  const m = room.members.find(x => x.pid === pid);
  if (m && m.conn && m.conn.open) { try { m.conn.send(o); } catch (e) {} }
}
function hostBroadcast(o, exceptPid) {
  for (const m of room.members) {
    if (m.pid === exceptPid) continue;
    if (o.t === 'snap' && memberBacklogged(m)) continue; // drop this frame for a slow guest only
    hostSendTo(m.pid, o);
  }
}
function hostHandleMsg(pid, m) {
  if (!m || typeof m.t !== 'string') return;     // ignore malformed traffic
  const mem = room && room.members.find(x => x.pid === pid);
  if (mem) mem.lastSeen = performance.now();      // any word from a peer proves it's alive
  if (m.t === 'ping') {                           // heartbeat only — liveness, nothing else
    if (mem && room && room.paused) hostCheckPresence(); // a stalled peer just spoke up → maybe resume
    return;
  }
  if (m.t === 'join') {
    if (!mem) return;
    if (room.started) { hostSendTo(pid, { t: 'err', msg: 'That match has already started.' }); return; }
    if (room.members.filter(x => x.slot >= 0).length >= 4) { hostSendTo(pid, { t: 'err', msg: 'That room is full (4 players).' }); return; }
    mem.slot = freeSlot();
    hostSendTo(pid, { t: 'joined', code: net.code, slot: mem.slot });
    hostBroadcast(lobbyMsg());
  } else if (m.t === 'rejoin') {
    // a guest who froze/crashed reconnects (with a fresh peer id) and reclaims its
    // original slot+faction; we hand back the roster+seed so it can rebuild the
    // world, then the normal snapshot stream catches it up to the live match.
    if (!mem) return;
    if (!room.started || !room.roster) { hostSendTo(pid, { t: 'err', msg: 'There is no match to rejoin.' }); return; }
    const r = room.roster.find(x => !x.ai && x.slot === m.slot && x.fac === m.fac);
    if (!r) { hostSendTo(pid, { t: 'err', msg: 'Could not match you to that game.' }); return; }
    // anti-hijack: refuse to hand a slot to a stranger while its real owner is still live
    const live = room.members.find(x => x.slot === m.slot && x.pid !== pid
      && x.conn && x.conn.open && (performance.now() - (x.lastSeen || 0) < MEMBER_STALL_MS));
    if (live) { hostSendTo(pid, { t: 'err', msg: 'That slot is still active in the match.' }); return; }
    mem.slot = m.slot; mem.fac = m.fac;
    hostSendTo(pid, { t: 'start', roster: room.roster, seed: room.seed });
    hostCheckPresence(); // the missing player is back — lift the pause if everyone's present
  } else if (!mem || mem.slot < 0) {
    // ignore anything before this peer has joined a slot
  } else if (m.t === 'pick') {
    mem.fac = m.fac;
    hostBroadcast(lobbyMsg());
  } else if (m.t === 'start') {
    room.started = true;
    room.roster = m.roster; room.seed = m.seed; // kept so dropped guests can rejoin
    hostBroadcast({ t: 'start', roster: m.roster, seed: m.seed }); // to everyone, host included
  } else if (m.t === 'cmd' && pid !== 'HOST') {
    // rate-limit a guest's gameplay commands so a buggy or hostile peer can't flood the
    // authoritative host (the host's own loopback traffic is trusted and never throttled).
    const now = performance.now();
    if (now - (mem.cmdWin || 0) > 1000) { mem.cmdWin = now; mem.cmdCount = 0; }
    if (++mem.cmdCount > CMD_RATE_LIMIT) return;
    hostBroadcast(m, pid);
  } else {
    hostBroadcast(m, pid); // relay gameplay (snap / cmd / msg / end) to the others
  }
}

// ---- host: presence tracking + the match-pause failsafe ----
function rosterName(r) { return 'Player ' + (r.slot + 1) + ' (' + (FACTIONS[r.fac] ? FACTIONS[r.fac].name : '?') + ')'; }
// which human roster slots are NOT currently held by a live connection (dropped or frozen).
function hostMissing() {
  if (!room || !room.roster) return [];
  const now = performance.now();
  const hostMem = room.members.find(x => x.host);
  const hostSlot = hostMem ? hostMem.slot : 0;
  const out = [];
  for (const r of room.roster) {
    if (r.ai || r.slot === hostSlot) continue;   // AI and the host itself are always present
    const m = room.members.find(x => x.slot === r.slot && !x.host);
    const present = m && m.conn && m.conn.open && (now - (m.lastSeen || 0) < MEMBER_STALL_MS);
    if (!present) out.push(r);
  }
  return out;
}
// pause the world the instant a human goes missing; resume the instant they're all back;
// and, as a last resort, auto-continue without anyone who never returns (grace timeout).
function hostCheckPresence() {
  if (!net.host || !room || !room.started) return;
  const now = performance.now();
  const missing = hostMissing();
  if (missing.length && !room.paused) {
    room.paused = true; room.pauseDeadline = now + PAUSE_GRACE_MS;
    hostBroadcast({ t: 'netpause', names: missing.map(rosterName), grace: Math.round(PAUSE_GRACE_MS / 1000) });
  } else if (room.paused && !missing.length) {
    room.paused = false; room.pauseDeadline = 0;
    hostBroadcast({ t: 'netresume' });
  } else if (room.paused && now > room.pauseDeadline) {
    room.paused = false; room.pauseDeadline = 0;
    hostBroadcast({ t: 'netresume', dropped: missing.map(rosterName) });
  }
}
// host-only: the player at the keyboard gives up waiting and forces the match onward.
function hostForceResume() {
  if (!net.host || !room || !room.paused) return;
  const dropped = hostMissing().map(rosterName);
  room.paused = false; room.pauseDeadline = 0;
  hostBroadcast({ t: 'netresume', dropped });
}

function hostGame() {
  const code = makeCode();
  const peer = new Peer(PEER_PREFIX + code, { debug: 1 });
  net.peer = peer;
  peer.on('open', () => {
    net.host = true; net.connected = true; net.code = code;
    room = { started: false, members: [{ pid: 'HOST', conn: null, slot: 0, fac: null, host: true }] };
    handleNet({ t: 'created', code, slot: 0 });
    hostBroadcast(lobbyMsg());
  });
  peer.on('error', e => {
    if (e.type === 'unavailable-id') { peer.destroy(); hostGame(); return; } // code collision — retry
    mpStatus('Could not start a room (' + (e.type || e) + '). Check your internet connection.');
  });
  peer.on('connection', conn => {
    const pid = conn.peer;
    conn.on('open', () => { room.members.push({ pid, conn, slot: -1, fac: null, host: false }); });
    conn.on('data', msg => hostHandleMsg(pid, msg));
    const drop = () => {
      if (!room) return;
      room.members = room.members.filter(x => x.pid !== pid);
      if (room.started) hostCheckPresence();   // a player just dropped mid-match → pause & wait
      else hostBroadcast(lobbyMsg());
    };
    conn.on('close', drop);
    conn.on('error', drop);
  });
}

// status text during a join goes to the lobby panel; during a rejoin it goes to
// the CONNECTION LOST end screen (the menu/lobby isn't visible mid-match).
function joinStatus(s) {
  if (rejoining) document.getElementById('endDetail').textContent = s || '';
  else mpStatus(s);
}

// `rejoin` (optional) = { slot, fac }: reconnect to a running match instead of
// joining a fresh lobby. The host validates it and replies with a fresh `start`.
function joinGame(code, rejoin) {
  const peer = new Peer({ debug: 1 });
  net.peer = peer; let opened = false;
  peer.on('open', () => {
    const conn = peer.connect(PEER_PREFIX + code.toUpperCase(), { reliable: true, serialization: 'json' });
    net.hostConn = conn;
    conn.on('open', () => {
      opened = true; net.host = false; net.connected = true;
      if (rejoin) conn.send({ t: 'rejoin', code: code.toUpperCase(), slot: rejoin.slot, fac: rejoin.fac });
      else conn.send({ t: 'join', code: code.toUpperCase() });
    });
    conn.on('data', msg => handleNet(msg));
    conn.on('close', () => { if (opened) onDisconnect(); });
    conn.on('error', () => { if (!opened) { joinStatus(rejoin ? 'Could not reach the host to rejoin.' : 'Could not reach that room.'); rejoinFailed(); } else onDisconnect(); });
    setTimeout(() => { if (!opened) { joinStatus(rejoin ? 'The host is no longer reachable.' : 'No room with that code (or the host went offline).'); rejoinFailed(); } }, 9000);
  });
  peer.on('error', e => {
    if (e.type === 'peer-unavailable') { joinStatus(rejoin ? 'The host is no longer reachable.' : 'No room with that code.'); rejoinFailed(); }
    else if (!opened) { joinStatus('Could not connect (' + (e.type || e) + '). Check your internet connection.'); rejoinFailed(); }
  });
}

// ---- guest failsafe: rejoin a match we froze out of / dropped from ----
function tryRejoin() {
  if (!rejoinInfo || rejoining) return;
  rejoining = true;
  if (net.peer) { try { net.peer.destroy(); } catch (e) {} net.peer = null; }
  net.hostConn = null; net.connected = false;
  net.code = rejoinInfo.code; net.slot = rejoinInfo.slot; // restore so `start` maps us to our faction
  document.getElementById('endRejoin').style.display = 'none';
  document.getElementById('endTitle').textContent = 'CONNECTION LOST';
  document.getElementById('endTitle').style.color = '#e0b84d';
  document.getElementById('endDetail').textContent = 'Reconnecting…';
  document.getElementById('endscreen').style.display = 'flex';
  joinGame(rejoinInfo.code, { slot: rejoinInfo.slot, fac: rejoinInfo.fac });
}
function rejoinFailed() {
  if (!rejoining) return;
  rejoining = false;
  const btn = document.getElementById('endRejoin');
  if (rejoinInfo) btn.style.display = 'inline-block';
}

function handleNet(m) {
  switch (m.t) {
    case 'created': net.code = m.code; net.slot = m.slot; net.host = true; net.aiCount = 1; showLobby(); break;
    case 'joined':  net.code = m.code; net.slot = m.slot; net.host = false; showLobby(); break;
    case 'lobby':   net.players = m.players; updateLobby(); break;
    case 'err':     if (rejoining) { joinStatus(m.msg); rejoining = false; if (rejoinInfo) document.getElementById('endRejoin').style.display = 'inline-block'; } else mpStatus(m.msg); break;
    case 'start': {
      net.inGame = true; rejoining = false;
      const me = m.roster.find(r => r.slot === net.slot) || m.roster[0];
      buildMatch(m.roster.map(r => ({ fac: r.fac, ai: r.ai, diff: r.diff })), me.fac, net.host ? 'host' : 'guest', m.seed);
      if (!net.host) { rejoinInfo = { code: net.code, slot: net.slot, fac: me.fac }; lastSnapAt = performance.now(); }
      break;
    }
    case 'snap': if (game && game.mode === 'guest' && !game.over) { lastSnapAt = performance.now(); applySnap(m); } break;
    case 'cmd':  if (game && game.mode === 'host' && !game.over) handleCmd(m); break;
    case 'msg':  if (!m.to || m.to === game.localFac) floatMsg(m.text); break;
    case 'end':  if (game && game.mode !== 'host' && !game.over) endGame(m.winner); break;
    case 'hostleft': onDisconnect(); break;
    // the host paused the world because a human dropped/froze — hold here until they're back
    case 'netpause': if (game && !game.over) { game.netPaused = true; netPauseTarget = performance.now() + (m.grace || 120) * 1000; showNetPause(m.names || []); } break;
    case 'netresume': if (game) { game.netPaused = false; hideNetPause(); if (m.dropped && m.dropped.length) floatMsg('Continuing without ' + m.dropped.join(', ')); } break;
  }
}

// host: execute a guest command, validated against that guest's own faction. Every field
// is sanity-checked before use — the host is authoritative, so a guest's message is
// untrusted input: bad coordinates, oversized selections, unknown types and commands for a
// faction the sender doesn't own are all rejected rather than acted on.
function handleCmd(m) {
  if (game.netPaused) return;                     // the world is frozen — ignore gameplay input
  if (!m || typeof m.fac !== 'string') return;
  const fac = m.fac;
  if (!game.players[fac] || game.eliminated.has(fac)) return;
  if (m.fac && game.players[fac].isAI) return;    // commands may only drive a human faction
  // coordinates (when present) must be finite, and are clamped into the world bounds
  if (m.x != null && !numOk(m.x)) return;
  if (m.y != null && !numOk(m.y)) return;
  const cx = m.x != null ? clamp(m.x, 0, WORLD_W) : 0;
  const cy = m.y != null ? clamp(m.y, 0, WORLD_H) : 0;
  if (m.kind === 'order') {
    if (!Array.isArray(m.ids) || m.ids.length > MAX_ORDER_IDS) return;
    const sel = m.ids.map(byId).filter(e => e && e.fac === fac);
    if (sel.length) applyOrder(fac, sel, cx, cy, m.mode || (m.amove ? 'amove' : 'move'));
  } else if (m.kind === 'place') {
    if (DEFS[m.type] && DEFS[m.type].fac === fac) placeBuilding(fac, m.type, cx, cy);
  } else if (m.kind === 'enq') {
    const e = byId(m.id);
    if (e && e.fac === fac && e.def.produces && e.def.produces.includes(m.type)) enqueue(e, m.type);
  } else if (m.kind === 'deq') {
    const e = byId(m.id);
    if (e && e.fac === fac) dequeue(e, m.idx, m.r);
  } else if (m.kind === 'arkup') {
    const e = byId(m.id);
    if (e && e.fac === fac && e.type === 'ark') upgradeArk(fac, e);
  } else if (m.kind === 'deploy') {
    const e = byId(m.id);
    if (e && e.fac === fac && e.type === 'ark') { e.deployed = m.on; if (m.on) e.order = { type: 'idle' }; }
  } else if (m.kind === 'research') {
    const e = byId(m.id);
    if (e && e.fac === fac && e.def.researchLab) enqueueResearch(e, m.rid);
  } else if (m.kind === 'sell') {
    sellBuilding(fac, m.id);
  } else if (m.kind === 'ability') {
    const e = byId(m.id);
    if (e && e.fac === fac && e.def.ability) fireAbility(fac, e, cx, cy);
  }
}

function onDisconnect() {
  if (rejoining) return; // a reconnect is already in flight — ignore the stale drop
  // a guest mid-match can climb back into the running game; the host stays authoritative
  const canRejoin = !!(game && game.mode === 'guest' && !game.over && rejoinInfo);
  if (game && game.mode !== 'sp' && !game.over) {
    game.over = true;
    document.getElementById('endTitle').textContent = 'CONNECTION LOST';
    document.getElementById('endTitle').style.color = '#e0b84d';
    document.getElementById('endDetail').textContent = canRejoin
      ? 'The connection dropped — trying to reconnect…'
      : 'The peer-to-peer connection dropped.';
    document.getElementById('endRejoin').style.display = 'none';
    document.getElementById('endscreen').style.display = 'flex';
  }
  if (net.peer) { try { net.peer.destroy(); } catch (e) {} }
  net.peer = null; net.hostConn = null; net.connected = false; room = null;
  net.slot = -1; net.code = ''; net.host = false; net.players = []; net.inGame = false;
  document.getElementById('mpLobby').style.display = 'none';
  document.getElementById('mpPanel').style.display = 'none';
  for (const c of document.querySelectorAll('#cards .card')) c.classList.remove('picked');
  if (canRejoin) { tryRejoin(); return; } // auto-attempt; the Rejoin button appears if it fails
  rejoinInfo = null;
  if (document.getElementById('menu').style.display !== 'none') showScreen('home');
}

// Guest watchdog: a WebRTC data channel can silently stall — no 'close'/'error'
// event fires — so the joiner just freezes on a stale frame with no way out. If
// we're an in-game guest and no snapshot has landed for a while, declare the link
// dead so the failsafe (auto-reconnect + Rejoin button) takes over.
const SNAP_TIMEOUT = 8000; // ms without a snapshot before the link is presumed dead
setInterval(() => {
  if (rejoining || !net.connected) return;
  if (!game || game.mode !== 'guest' || game.over) return;
  if (lastSnapAt && performance.now() - lastSnapAt > SNAP_TIMEOUT) onDisconnect();
}, 1000);

// Guest heartbeat: a steady ping UP to the host so it can tell a live-but-idle player
// apart from one whose channel has silently stalled (no close/error event ever fires).
setInterval(() => {
  if (net.connected && !net.host && net.hostConn && net.hostConn.open
      && game && game.mode === 'guest' && !game.over) {
    try { net.hostConn.send({ t: 'ping' }); } catch (e) {}
  }
}, GUEST_PING_MS);

// Host watchdog: re-evaluate who's present every second so a SILENT guest freeze (which
// fires no close/error) still trips the pause once its heartbeat goes quiet, and the grace
// timeout can auto-continue a match whose missing player never comes back.
setInterval(() => { if (net.host && room && room.started) hostCheckPresence(); }, 1000);

// ---- the "match paused, waiting to reconnect" overlay (shown to everyone still in) ----
function showNetPause(names) {
  const el = document.getElementById('netpause'); if (!el) return;
  document.getElementById('netpauseWho').textContent = names.length
    ? 'Waiting for ' + names.join(', ') + ' to reconnect…'
    : 'Waiting for a player to reconnect…';
  document.getElementById('netpauseContinue').style.display = net.host ? 'inline-block' : 'none';
  el.style.display = 'flex';
  updateNetPauseCountdown();
}
function hideNetPause() { const el = document.getElementById('netpause'); if (el) el.style.display = 'none'; }
function updateNetPauseCountdown() {
  const el = document.getElementById('netpauseCount'); if (!el) return;
  const left = Math.max(0, Math.ceil((netPauseTarget - performance.now()) / 1000));
  el.textContent = net.host
    ? 'Auto-continuing in ' + left + 's if they don’t return — or continue now.'
    : 'The match is held until they return (up to ' + left + 's).';
}
setInterval(() => { if (game && game.netPaused) updateNetPauseCountdown(); }, 500);

// host-only network heartbeat while paused: keep streaming the (frozen) world so a
// reconnecting guest still resyncs to the live state, without advancing the simulation.
function hostPausedTick(dt) {
  if (!game || game.mode !== 'host') return;
  game.netTimer -= dt;
  if (game.netTimer <= 0) { game.netTimer = 0.1; netSend(buildSnap()); game.netFx.length = 0; }
}

// ---------------- lobby ----------------
function showLobby() {
  net.inGame = false; // back in the lobby — allow re-picking for a rematch
  document.getElementById('menu').style.display = 'flex';
  showScreen('mp');
  document.getElementById('mpPanel').style.display = 'none';
  mountCards('cardsHolderMP');
  document.getElementById('mpLobby').style.display = 'block';
  updateLobby();
}

function pickFaction(f) {
  if (!netConnected() || net.inGame) return;
  netSend({ t: 'pick', fac: f });
}

function myPick() { const me = net.players.find(p => p.slot === net.slot); return me ? me.fac : null; }

function updateLobby() {
  if (!netConnected()) return;
  document.getElementById('mpLobby').style.display = 'block';
  document.getElementById('lobbyCode').textContent = net.code;
  const mine = myPick();
  for (const c of document.querySelectorAll('#cards .card')) c.classList.toggle('picked', c.dataset.fac === mine);
  net.aiCount = Math.max(0, Math.min(net.aiCount, 4 - net.players.length));

  document.getElementById('lobbyPlayers').innerHTML = net.players.map(p => {
    const who = 'Player ' + (p.slot + 1) + (p.slot === net.slot ? ' (you)' : '') + (p.host ? ' · host' : '');
    const fac = p.fac ? '<b style="color:' + FACTIONS[p.fac].color + '">' + FACTIONS[p.fac].name + '</b>'
      : '<span style="color:#7b8aa3">choosing…</span>';
    return '<div class="lobbyrow">' + who + ' — ' + fac + '</div>';
  }).join('');

  document.getElementById('mpAiWrap').style.display = net.host ? 'flex' : 'none';
  document.getElementById('mpAiCount').textContent = 'AI opponents: ' + net.aiCount;
  document.getElementById('mpDiffWrap').style.display = (net.host && net.aiCount > 0) ? 'flex' : 'none';
  if (net.host && net.aiCount > 0) renderDiff('mpDiff', net.diff, k => { net.diff = k; updateLobby(); });
  const picks = net.players.map(p => p.fac);
  const allPicked = picks.length > 0 && picks.every(Boolean);
  const distinct = new Set(picks).size === picks.length;
  const total = net.players.length + net.aiCount;
  const startBtn = document.getElementById('mpStart');
  startBtn.style.display = net.host ? 'inline-block' : 'none';
  startBtn.disabled = !(net.host && allPicked && distinct && total >= 2 && total <= 4);
  document.getElementById('lobbyText').textContent = net.host
    ? (!allPicked ? 'Waiting for everyone to pick a faction…'
      : !distinct ? 'Players must pick different factions.'
      : total < 2 ? 'Add an AI opponent (need 2+ players).'
      : 'Ready — press START MATCH.')
    : 'Pick a faction below. The host starts the match.';
}

function hostStart() {
  if (!net.host) return;
  const picks = net.players.map(p => p.fac);
  if (!picks.every(Boolean)) { mpStatus('Everyone must pick a faction first.'); return; }
  if (new Set(picks).size !== picks.length) { mpStatus('Players must pick different factions.'); return; }
  const used = new Set(picks);
  const pool = Object.keys(FACTIONS).filter(f => !used.has(f));
  const ai = [];
  for (let i = 0; i < net.aiCount && pool.length; i++) ai.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
  const roster = net.players.map(p => ({ fac: p.fac, ai: false, slot: p.slot }))
    .concat(ai.map(f => ({ fac: f, ai: true, slot: -1, diff: net.diff || 'normal' })));
  if (roster.length < 2 || roster.length > 4) { mpStatus('Need 2–4 players total.'); return; }
  netSend({ t: 'start', roster, seed: (Math.random() * 1e9) | 0 });
}

