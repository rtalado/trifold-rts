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
    if (game.targeting) {        // designating an active-ability strike point
      fireAbilityAt(mouse.wx, mouse.wy);
      game.targeting = null;
      return;
    }
    if (game.placing) {
      if (game.mode === 'guest') {
        const d = DEFS[game.placing], fac = game.localFac;
        if (placeValid(game.placing, fac, mouse.wx, mouse.wy) && game.players[fac].res >= d.cost) {
          netSend({ t: 'cmd', fac: game.localFac, kind: 'place', type: game.placing, x: mouse.wx, y: mouse.wy });
          game.placing = null; playSfx('build');
        } else floatMsg(placeErr(fac));
      } else if (placeBuilding(game.localFac, game.placing, mouse.wx, mouse.wy)) { game.placing = null; playSfx('build'); }
      return;
    }
    mouse.dragging = true; mouse.dx0 = mouse.x; mouse.dy0 = mouse.y;
  } else if (ev.button === 2) {
    if (game.targeting) { game.targeting = null; return; }
    if (game.placing) { game.placing = null; return; }
    // Ctrl = attack toward a direction (auto-finds the foe), Shift = attack-move
    const mode = ev.ctrlKey ? 'adir' : ev.shiftKey ? 'amove' : 'move';
    issueOrder(mouse.wx, mouse.wy, mode);
  }
});

// fire the currently-targeted building's active ability at a world point
function fireAbilityAt(wx, wy) {
  const t = game.targeting; if (!t) return;
  const e = byId(t.id);
  if (!e || e.fac !== game.localFac || !e.def.ability) return;
  if (game.mode === 'guest') {
    netSend({ t: 'cmd', fac: game.localFac, kind: 'ability', id: e.id, x: wx, y: wy });
    addFx({ kind: 'ping', x: wx, y: wy, ttl: 0.4, max: 0.4, color: '#ffd9a0' });
  } else fireAbility(game.localFac, e, wx, wy);
}

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
  if (picked.length) playSfx('select');
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

// local right-click. mode: 'move' (plain), 'amove' (attack-move to point),
// 'adir' (attack toward the clicked direction — auto-finds the nearest foe).
function issueOrder(wx, wy, mode) {
  if (!game.sel.length) return;
  if (game.sel.some(e => e.fac === game.localFac)) playSfx('order');
  if (game.mode === 'guest') {
    netSend({ t: 'cmd', fac: game.localFac, kind: 'order', ids: game.sel.map(e => e.id), x: wx, y: wy, mode });
    addFx({ kind: 'ping', x: wx, y: wy, ttl: 0.4, max: 0.4, color: mode !== 'move' ? '#ff6a6a' : '#7dffa8' });
    return;
  }
  applyOrder(game.localFac, game.sel, wx, wy, mode);
}

// pick the nearest enemy lying in the general direction of (wx,wy) from the
// selection's centre — the engine behind Ctrl+RMB "attack that way", so you needn't
// pixel-hunt a tiny unit. Returns null if nothing falls within the aim cone.
function directionalTarget(fac, selEnts, wx, wy) {
  let cx = 0, cy = 0, n = 0;
  for (const e of selEnts) { cx += e.x; cy += e.y; n++; }
  if (!n) return null;
  cx /= n; cy /= n;
  const aim = Math.atan2(wy - cy, wx - cx);
  let best = null, bd = 1e9;
  for (const o of game.entities) {
    if (o.dead || o.fac === fac || o.fac === 'neutral' || o.def.noTarget) continue;
    const ang = Math.atan2(o.y - cy, o.x - cx);
    if (Math.abs(((ang - aim + Math.PI) % (Math.PI * 2)) - Math.PI) > 0.7) continue;  // ~40° cone
    const dd = Math.hypot(o.x - cx, o.y - cy);
    if (dd < bd) { bd = dd; best = o; }
  }
  return best;
}

// runs on the simulating side (SP or host) for either faction.
// mode 'amove' issues an attack-move (engage on the way); 'adir' aims an attack-move
// at the nearest foe in the clicked direction; anything else is a plain move that
// ignores enemies — so you can actually pull units OUT of a fight to retreat.
function applyOrder(fac, selEnts, wx, wy, mode) {
  if (mode === true) mode = 'amove';        // tolerate the old boolean form
  const target = ents(o => o.fac !== fac && !o.def.noTarget && dist(o, { x: wx, y: wy }) <= o.size + 5)[0];
  const node = game.nodes.find(n => n.amount > 0 && Math.hypot(n.x - wx, n.y - wy) <= n.r + 6);
  // Ctrl+RMB: if there's no foe right under the cursor, march on the nearest one in
  // that direction; either way it resolves to an attack-move.
  if (mode === 'adir') {
    if (!target) { const ft = directionalTarget(fac, selEnts, wx, wy); if (ft) { wx = ft.x; wy = ft.y; } }
    mode = 'amove';
  }
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
    else { e.order = { type: mode === 'amove' ? 'amove' : 'move', x: wx, y: wy }; acted = true; }
  }
  if (acted) addFx({ kind: 'ping', x: wx, y: wy, ttl: 0.4, max: 0.4, color: target ? '#ff6a6a' : '#7dffa8' });
}

addEventListener('keydown', ev => {
  keys[ev.key.toLowerCase()] = true;
  const k = ev.key.toLowerCase();
  // overlays first — these work regardless of game state
  if (k === 'escape') {
    if (settingsOpen) { closeSettings(); return; }
    if (pauseOpen) { resumeGame(); return; }
  }
  if (!game || game.over) return;
  if (k === 'escape') {
    // Esc cancels whatever you're doing; if there's nothing to cancel, it pauses
    if (techOpen) { closeTechTree(); return; }
    if (game.placing) { game.placing = null; return; }
    if (game.targeting) { game.targeting = null; return; }
    if (game.sel.length) { game.sel = []; refreshCard(); return; }
    openPauseMenu(); return;
  }
  if (pauseOpen) return; // swallow game hotkeys while the pause menu is up
  if (k === 't') { ev.preventDefault(); toggleTechTree(); return; }
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
  const sp = 620 * (SETTINGS.panSpeed || 1) * dt / game.cam.z;  // constant on-screen speed regardless of zoom
  let dx = 0, dy = 0;
  if (keys['arrowleft'] || keys['a']) dx -= sp;
  if (keys['arrowright'] || keys['d']) dx += sp;
  if (keys['arrowup'] || keys['w']) dy -= sp;
  if (keys['arrowdown'] || keys['s']) dy += sp;
  if (SETTINGS.edgePan) {
    const M = 18;
    if (mouse.x < M) dx -= sp; if (mouse.x > innerWidth - M) dx += sp;
    if (mouse.y < M) dy -= sp; if (mouse.y > innerHeight - M) dy += sp;
  }
  game.cam.x += dx; game.cam.y += dy;
  clampCam();
  const w = screenToWorld(mouse.x, mouse.y); mouse.wx = w.x; mouse.wy = w.y;
}

