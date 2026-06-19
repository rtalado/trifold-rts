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
    players[f] = [Math.round(p.res), +p.income.toFixed(1), p.kills, p.creepTiles || 0, [...p.research], Math.round(p.iron || 0), +(p.ironInc || 0).toFixed(1), p.arkTier || 0];
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
      p.arkTier = a[7] || 0; recalcMul(p); }
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
let room = null; // host only: { started, members:[{ pid, conn, slot, fac, host }] }

function netConnected() { return net.connected; }

// host: is any guest's data channel backed up? Each snapshot is the full state
// of the world, so when a guest can't keep up the right move is to DROP the next
// snapshot rather than queue it — a growing backlog is what freezes the joiner in
// long matches (PeerJS overflow-buffers above 8 MB and the guest never catches up).
const SNAP_BUFFER_LIMIT = 256 * 1024; // bytes already queued on the RTCDataChannel
function snapBacklogged() {
  if (!room) return false;
  for (const m of room.members) {
    if (m.pid === 'HOST' || !m.conn || !m.conn.open) continue;
    if (m.conn.bufferSize > 0) return true; // PeerJS already overflow-buffering
    const dc = m.conn.dataChannel;
    if (dc && dc.bufferedAmount > SNAP_BUFFER_LIMIT) return true;
  }
  return false;
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
  for (const m of room.members) if (m.pid !== exceptPid) hostSendTo(m.pid, o);
}
function hostHandleMsg(pid, m) {
  const mem = room && room.members.find(x => x.pid === pid);
  if (m.t === 'join') {
    if (!mem) return;
    if (room.started) { hostSendTo(pid, { t: 'err', msg: 'That match has already started.' }); return; }
    if (room.members.filter(x => x.slot >= 0).length >= 4) { hostSendTo(pid, { t: 'err', msg: 'That room is full (4 players).' }); return; }
    mem.slot = freeSlot();
    hostSendTo(pid, { t: 'joined', code: net.code, slot: mem.slot });
    hostBroadcast(lobbyMsg());
  } else if (!mem || mem.slot < 0) {
    // ignore anything before this peer has joined a slot
  } else if (m.t === 'pick') {
    mem.fac = m.fac;
    hostBroadcast(lobbyMsg());
  } else if (m.t === 'start') {
    room.started = true;
    hostBroadcast({ t: 'start', roster: m.roster, seed: m.seed }); // to everyone, host included
  } else {
    hostBroadcast(m, pid); // relay gameplay (snap / cmd / msg / end) to the others
  }
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
      hostBroadcast(lobbyMsg());
    };
    conn.on('close', drop);
    conn.on('error', drop);
  });
}

function joinGame(code) {
  const peer = new Peer({ debug: 1 });
  net.peer = peer; let opened = false;
  peer.on('open', () => {
    const conn = peer.connect(PEER_PREFIX + code.toUpperCase(), { reliable: true, serialization: 'json' });
    net.hostConn = conn;
    conn.on('open', () => {
      opened = true; net.host = false; net.connected = true;
      conn.send({ t: 'join', code: code.toUpperCase() });
    });
    conn.on('data', msg => handleNet(msg));
    conn.on('close', () => { if (opened) onDisconnect(); });
    conn.on('error', () => { if (!opened) mpStatus('Could not reach that room.'); else onDisconnect(); });
    setTimeout(() => { if (!opened) mpStatus('No room with that code (or the host went offline).'); }, 9000);
  });
  peer.on('error', e => {
    if (e.type === 'peer-unavailable') mpStatus('No room with that code.');
    else if (!opened) mpStatus('Could not connect (' + (e.type || e) + '). Check your internet connection.');
  });
}

function handleNet(m) {
  switch (m.t) {
    case 'created': net.code = m.code; net.slot = m.slot; net.host = true; net.aiCount = 1; showLobby(); break;
    case 'joined':  net.code = m.code; net.slot = m.slot; net.host = false; showLobby(); break;
    case 'lobby':   net.players = m.players; updateLobby(); break;
    case 'err':     mpStatus(m.msg); break;
    case 'start': {
      net.inGame = true;
      const me = m.roster.find(r => r.slot === net.slot) || m.roster[0];
      buildMatch(m.roster.map(r => ({ fac: r.fac, ai: r.ai, diff: r.diff })), me.fac, net.host ? 'host' : 'guest', m.seed);
      break;
    }
    case 'snap': if (game && game.mode === 'guest' && !game.over) applySnap(m); break;
    case 'cmd':  if (game && game.mode === 'host' && !game.over) handleCmd(m); break;
    case 'msg':  if (!m.to || m.to === game.localFac) floatMsg(m.text); break;
    case 'end':  if (game && game.mode !== 'host' && !game.over) endGame(m.winner); break;
    case 'hostleft': onDisconnect(); break;
  }
}

// host: execute a guest command, validated against that guest's own faction
function handleCmd(m) {
  const fac = m.fac;
  if (!fac || !game.players[fac] || game.eliminated.has(fac)) return;
  if (m.kind === 'order') {
    const sel = (m.ids || []).map(byId).filter(e => e && e.fac === fac);
    if (sel.length) applyOrder(fac, sel, m.x, m.y, m.amove);
  } else if (m.kind === 'place') {
    if (DEFS[m.type] && DEFS[m.type].fac === fac) placeBuilding(fac, m.type, m.x, m.y);
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
    if (e && e.fac === fac && e.def.ability) fireAbility(fac, e, m.x, m.y);
  }
}

function onDisconnect() {
  if (game && game.mode !== 'sp' && !game.over) {
    game.over = true;
    document.getElementById('endTitle').textContent = 'CONNECTION LOST';
    document.getElementById('endTitle').style.color = '#e0b84d';
    document.getElementById('endDetail').textContent = 'The peer-to-peer connection dropped.';
    document.getElementById('endscreen').style.display = 'flex';
  }
  if (net.peer) { try { net.peer.destroy(); } catch (e) {} }
  net.peer = null; net.hostConn = null; net.connected = false; room = null;
  net.slot = -1; net.code = ''; net.host = false; net.players = []; net.inGame = false;
  document.getElementById('mpLobby').style.display = 'none';
  document.getElementById('mpPanel').style.display = 'none';
  for (const c of document.querySelectorAll('#cards .card')) c.classList.remove('picked');
  if (document.getElementById('menu').style.display !== 'none') showScreen('home');
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

