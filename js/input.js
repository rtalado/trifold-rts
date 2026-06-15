// ---------------- input ----------------
const mouse = { x: 0, y: 0, wx: 0, wy: 0, dragging: false, dx0: 0, dy0: 0 };
const keys = {};

canvas.addEventListener('mousemove', ev => {
  mouse.x = ev.clientX; mouse.y = ev.clientY;
  if (game) { const w = screenToWorld(mouse.x, mouse.y); mouse.wx = w.x; mouse.wy = w.y; }
});

canvas.addEventListener('mousedown', ev => {
  if (!game || game.over) return;
  if (ev.button === 0) {
    if (game.placing) {
      if (game.mode === 'guest') {
        const d = DEFS[game.placing], fac = game.localFac;
        if (placeValid(game.placing, fac, mouse.wx, mouse.wy) && game.players[fac].res >= d.cost) {
          netSend({ t: 'cmd', fac: game.localFac, kind: 'place', type: game.placing, x: mouse.wx, y: mouse.wy });
          game.placing = null;
        } else floatMsg(placeErr(fac));
      } else if (placeBuilding(game.localFac, game.placing, mouse.wx, mouse.wy)) game.placing = null;
      return;
    }
    mouse.dragging = true; mouse.dx0 = mouse.x; mouse.dy0 = mouse.y;
  } else if (ev.button === 2) {
    if (game.placing) { game.placing = null; return; }
    issueOrder(mouse.wx, mouse.wy);
  }
});

addEventListener('mouseup', ev => {
  if (ev.button !== 0 || !mouse.dragging || !game || game.over) { mouse.dragging = false; return; }
  mouse.dragging = false;
  const a0 = screenToWorld(Math.min(mouse.dx0, mouse.x), Math.min(mouse.dy0, mouse.y));
  const a1 = screenToWorld(Math.max(mouse.dx0, mouse.x), Math.max(mouse.dy0, mouse.y));
  const x0 = a0.x, y0 = a0.y, x1 = a1.x, y1 = a1.y;
  const isClick = (x1 - x0) < 6 && (y1 - y0) < 6;
  let picked = [];
  if (isClick) {
    const e = ents(o => o.fac === game.localFac && dist(o, { x: mouse.wx, y: mouse.wy }) <= o.size + 4)
      .sort((a, b) => dist(a, { x: mouse.wx, y: mouse.wy }) - dist(b, { x: mouse.wx, y: mouse.wy }))[0];
    if (e) picked = [e];
  } else {
    picked = ents(o => o.fac === game.localFac && o.def.kind === 'unit'
      && o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1);
    if (!picked.length)
      picked = ents(o => o.fac === game.localFac && o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1);
  }
  game.sel = picked;
  refreshCard();
});

canvas.addEventListener('contextmenu', ev => ev.preventDefault());

// mouse-wheel zoom, anchored on the cursor so the point under it stays put
canvas.addEventListener('wheel', ev => {
  if (!game) return;
  ev.preventDefault();
  const z0 = game.cam.z;
  const z1 = clamp(z0 * (ev.deltaY < 0 ? 1.12 : 1 / 1.12), ZMIN, ZMAX);
  if (z1 === z0) return;
  const before = screenToWorld(mouse.x, mouse.y);
  game.cam.z = z1;
  game.cam.x = before.x - mouse.x / z1;
  game.cam.y = before.y - mouse.y / z1;
  clampCam();
  const w = screenToWorld(mouse.x, mouse.y); mouse.wx = w.x; mouse.wy = w.y;
}, { passive: false });

function issueOrder(wx, wy) { // local right-click
  if (!game.sel.length) return;
  if (game.mode === 'guest') {
    netSend({ t: 'cmd', fac: game.localFac, kind: 'order', ids: game.sel.map(e => e.id), x: wx, y: wy });
    addFx({ kind: 'ping', x: wx, y: wy, ttl: 0.4, max: 0.4, color: '#7dffa8' });
    return;
  }
  applyOrder(game.localFac, game.sel, wx, wy);
}

// runs on the simulating side (SP or host) for either faction
function applyOrder(fac, selEnts, wx, wy) {
  const target = ents(o => o.fac !== fac && !o.def.noTarget && dist(o, { x: wx, y: wy }) <= o.size + 5)[0];
  const node = game.nodes.find(n => n.amount > 0 && Math.hypot(n.x - wx, n.y - wy) <= n.r + 6);
  let acted = false;

  for (const e of selEnts) {
    const d = e.def;
    if (d.kind === 'building' || (d.produces && d.kind === 'unit' && d.core)) {
      // rally point (also Ark rally); hive sets the global swarm rally
      if (d.produces || d.spawns) { e.rally = { x: wx, y: wy }; acted = true; }
      if (e.type === 'hive' || d.spawns) { game.players[e.fac].swarmRally = { x: wx, y: wy }; acted = true; }
      if (d.core && d.kind === 'unit' && !target) { // move the Ark
        e.deployed = false; e.order = { type: 'move', x: wx, y: wy }; acted = true;
      } else if (d.core && d.kind === 'unit' && target) {
        e.order = { type: 'idle' }; e.tgt = target.id; acted = true;
      }
      continue;
    }
    if (target) {
      // units that can't shoot (medic, guardian) escort to the target instead
      e.order = d.dmg ? { type: 'attack', id: target.id } : { type: 'move', x: target.x, y: target.y };
      acted = true;
    }
    else if (node && d.harvester) { e.order = { type: 'harvest', nodeId: node.id, phase: 'go', timer: 0, carry: 0 }; acted = true; }
    else if (d.harvester || !d.dmg) { e.order = { type: 'move', x: wx, y: wy }; acted = true; }
    else { e.order = { type: 'amove', x: wx, y: wy }; acted = true; }
  }
  if (acted) addFx({ kind: 'ping', x: wx, y: wy, ttl: 0.4, max: 0.4, color: target ? '#ff6a6a' : '#7dffa8' });
}

addEventListener('keydown', ev => {
  keys[ev.key.toLowerCase()] = true;
  if (!game || game.over) return;
  const k = ev.key.toLowerCase();
  if (k === 'escape') { game.placing = null; game.sel = []; refreshCard(); }
  if (k === ' ') {
    ev.preventDefault();
    const core = ents(e => e.fac === game.localFac && e.def.core)[0];
    if (core) centerCam(core.x, core.y);
  }
  if (k === 'f') { // select all combat units
    game.sel = armyOf(game.localFac);
    refreshCard();
  }
  // command card hotkeys (digits — letters are reserved for camera pan)
  const card = currentCommands();
  const hot = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  const i = hot.indexOf(k);
  if (i >= 0 && card[i] && card[i].enabled) card[i].onClick();
});
addEventListener('keyup', ev => { keys[ev.key.toLowerCase()] = false; });

// minimap navigation
let mmDown = false;
mmCanvas.addEventListener('mousedown', ev => { mmDown = true; mmNav(ev); });
addEventListener('mouseup', () => { mmDown = false; });
mmCanvas.addEventListener('mousemove', ev => { if (mmDown) mmNav(ev); });
function mmNav(ev) {
  if (!game) return;
  const r = mmCanvas.getBoundingClientRect();
  const wx = (ev.clientX - r.left) / mmCanvas.width * WORLD_W;
  const wy = (ev.clientY - r.top) / mmCanvas.height * WORLD_H;
  centerCam(wx, wy);
}

// the world region currently visible, in world units (shrinks as you zoom in)
function viewW() { return canvas.width / game.cam.z; }
function viewH() { return canvas.height / game.cam.z; }
// keep the camera inside the world; allow a little extra at the bottom so the
// map's edge can rise clear of the bottom HUD bar
function clampCam() {
  const vw = viewW(), vh = viewH();
  // when zoomed out far enough that the whole map fits, centre it; else keep it in bounds
  game.cam.x = vw >= WORLD_W ? (WORLD_W - vw) / 2 : clamp(game.cam.x, 0, WORLD_W - vw);
  game.cam.y = vh >= WORLD_H ? (WORLD_H - vh) / 2
    : clamp(game.cam.y, 0, WORLD_H - vh + HUD_BOTTOM / game.cam.z);
}
function centerCam(x, y) { game.cam.x = x - viewW() / 2; game.cam.y = y - viewH() / 2; clampCam(); }
// screen pixel -> world coordinate (accounts for pan + zoom)
function screenToWorld(sx, sy) { return { x: sx / game.cam.z + game.cam.x, y: sy / game.cam.z + game.cam.y }; }

function panCamera(dt) {
  const sp = 620 * dt / game.cam.z;  // constant on-screen speed regardless of zoom
  let dx = 0, dy = 0;
  if (keys['arrowleft'] || keys['a']) dx -= sp;
  if (keys['arrowright'] || keys['d']) dx += sp;
  if (keys['arrowup'] || keys['w']) dy -= sp;
  if (keys['arrowdown'] || keys['s']) dy += sp;
  const M = 18;
  if (mouse.x < M) dx -= sp; if (mouse.x > innerWidth - M) dx += sp;
  if (mouse.y < M) dy -= sp; if (mouse.y > innerHeight - M) dy += sp;
  game.cam.x += dx; game.cam.y += dy;
  clampCam();
  const w = screenToWorld(mouse.x, mouse.y); mouse.wx = w.x; mouse.wy = w.y;
}

