// ---------------- rendering ----------------
// is a world point within the current camera view (+pad)? The renderer works in
// world space and leans on canvas clipping, but clipping only skips rasterising
// off-screen pixels — it still pays the JS/canvas cost of every command. So on a
// big map (up to 260×170 tiles) we'd issue draw calls for the WHOLE world every
// frame. Culling each thing to the viewport is what keeps a sprawling late-game
// fight — especially against the map-blanketing Myriad creep — smooth.
function inView(x, y, pad = 0) {
  return x >= game.cam.x - pad && x <= game.cam.x + viewW() + pad
      && y >= game.cam.y - pad && y <= game.cam.y + viewH() + pad;
}

function draw() {
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!game) return;
  computeVision();
  computeRadar();
  ctx.save();
  ctx.scale(game.cam.z, game.cam.z);
  ctx.translate(-game.cam.x, -game.cam.y);

  // visible world rect (with a tile of slack), used to cull the grid & creep
  const vx0 = Math.max(0, game.cam.x - TILE), vy0 = Math.max(0, game.cam.y - TILE);
  const vx1 = Math.min(WORLD_W, game.cam.x + viewW() + TILE);
  const vy1 = Math.min(WORLD_H, game.cam.y + viewH() + TILE);

  // grid — only the lines crossing the visible rect
  ctx.strokeStyle = '#161e2a'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.floor(vx0 / (TILE * 2)) * TILE * 2; x <= vx1; x += TILE * 2) { ctx.moveTo(x, vy0); ctx.lineTo(x, vy1); }
  for (let y = Math.floor(vy0 / (TILE * 2)) * TILE * 2; y <= vy1; y += TILE * 2) { ctx.moveTo(vx0, y); ctx.lineTo(vx1, y); }
  ctx.stroke();

  // creep — only the tiles on screen (the grid can span the whole map, so scanning
  // and filling all of it every frame is a big late-game cost, worst vs Myriad)
  const pulse = 0.78 + 0.1 * Math.sin(game.t * 2);
  const facKeys = Object.keys(FACTIONS);
  const ctx0 = Math.max(0, Math.floor(vx0 / TILE)), ctx1 = Math.min(GW - 1, Math.floor(vx1 / TILE));
  const cty0 = Math.max(0, Math.floor(vy0 / TILE)), cty1 = Math.min(GH - 1, Math.floor(vy1 / TILE));
  for (let ty = cty0; ty <= cty1; ty++)
    for (let tx = ctx0; tx <= ctx1; tx++) {
      const v = game.creep[ty * GW + tx];
      if (!v) continue;
      const fac = facKeys[v - 1];
      ctx.fillStyle = fac === 'myriad' ? 'rgba(74,29,92,' + pulse + ')' : FACTIONS[fac].dark;
      ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
    }

  // world border
  ctx.strokeStyle = '#2a3954'; ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, WORLD_W, WORLD_H);

  // impassable terrain — rocky cliffs that block movement and building
  if (game.obstacles) for (const ob of game.obstacles) drawObstacle(ob);

  // crystal nodes
  for (const n of game.nodes) {
    const f = 0.45 + 0.55 * (n.amount / n.max);
    ctx.save(); ctx.translate(n.x, n.y);
    ctx.fillStyle = '#1b4f5e';
    ctx.beginPath(); ctx.arc(0, 0, n.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6ee7ff';
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + 0.4, rr = n.r * 0.62 * f;
      ctx.save(); ctx.translate(Math.cos(a) * 6, Math.sin(a) * 6); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(0, -rr); ctx.lineTo(rr * 0.5, 0); ctx.lineTo(0, rr); ctx.lineTo(-rr * 0.5, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // selection overlays: range rings + order lines, under the entity sprites
  drawSelectionOverlays();

  // entities (buildings first, then units, sorted by y) — hidden by fog of war
  const sorted = [...game.entities].sort((a, b) =>
    (a.def.kind === 'building' ? 0 : 1) - (b.def.kind === 'building' ? 0 : 1) || a.y - b.y);
  // (pad covers oversized flourishes — a maxed Ark's corona reaches ~1.7× its size)
  for (const e of sorted) if (visibleEnt(e) && inView(e.x, e.y, e.size * 1.8 + 24)) drawEnt(e);

  // siphon tether (derived from proximity so it renders identically on guest)
  for (const e of ents(o => o.type === 'ark' && o.deployed)) {
    if (!visibleEnt(e)) continue;
    const n = game.nodes.find(n => n.amount > 0 && dist(e, n) < e.size + n.r + 30);
    if (n) {
      ctx.strokeStyle = 'rgba(110,231,255,' + (0.4 + 0.3 * Math.sin(game.t * 6)) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    }
  }

  // projectiles (hidden if they're flying through unseen territory)
  for (const pr of game.proj) {
    if (!tileVis(pr.x, pr.y) || !inView(pr.x, pr.y, 16)) continue;
    ctx.fillStyle = pr.color;
    ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r, 0, Math.PI * 2); ctx.fill();
  }

  // fx
  for (const f of game.fx) {
    const ox = f.x != null ? f.x : f.x1, oy = f.y != null ? f.y : f.y1;
    if (ox != null && (!tileVis(ox, oy) || !inView(ox, oy, (f.r || 0) + 64))) continue;
    const a = f.ttl / f.max;
    if (f.kind === 'boom') {
      ctx.strokeStyle = f.color; ctx.globalAlpha = a; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.4 - a * 0.7), 0, Math.PI * 2); ctx.stroke();
    } else if (f.kind === 'beam') {
      ctx.strokeStyle = f.color; ctx.globalAlpha = a; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
    } else if (f.kind === 'blink') {
      ctx.strokeStyle = f.color; ctx.globalAlpha = a * 0.7; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      ctx.setLineDash([]);
    } else if (f.kind === 'ping') {
      ctx.strokeStyle = f.color; ctx.globalAlpha = a; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f.x, f.y, 14 * (1.2 - a), 0, Math.PI * 2); ctx.stroke();
    } else if (f.kind === 'slash') {
      ctx.strokeStyle = f.color; ctx.globalAlpha = a; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(f.x - 6, f.y - 6); ctx.lineTo(f.x + 6, f.y + 6); ctx.stroke();
    } else if (f.kind === 'strikewarn') {
      // a Gustav shell is inbound: a pulsing crosshair + a ring closing to the blast edge
      const pulse = 0.5 + 0.5 * Math.sin(game.t * 9);
      ctx.globalAlpha = 0.4 + 0.45 * pulse; ctx.strokeStyle = f.color; ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.3 + 0.7 * (1 - a)), 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(f.x - f.r - 6, f.y); ctx.lineTo(f.x + f.r + 6, f.y);
      ctx.moveTo(f.x, f.y - f.r - 6); ctx.lineTo(f.x, f.y + f.r + 6); ctx.stroke();
      // the colossal main-gun shell itself, flying from the muzzle to the impact
      if (f.sx != null) {
        const prog = 1 - a;                               // 0 at launch → 1 at impact
        const sxp = f.sx + (f.x - f.sx) * prog, syp = f.sy + (f.y - f.sy) * prog;
        const ang = Math.atan2(f.y - f.sy, f.x - f.sx);
        const sr = 22 + 16 * prog;                        // huge, and bearing down
        // fiery trail behind the shell
        const tx = sxp - Math.cos(ang) * sr * 3.4, ty = syp - Math.sin(ang) * sr * 3.4;
        const grad = ctx.createLinearGradient(tx, ty, sxp, syp);
        grad.addColorStop(0, 'rgba(255,120,40,0)'); grad.addColorStop(1, 'rgba(255,180,80,0.85)');
        ctx.globalAlpha = 0.85; ctx.strokeStyle = grad; ctx.lineWidth = sr * 1.3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(sxp, syp); ctx.stroke(); ctx.lineCap = 'butt';
        // hot glow halo
        ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(255,205,135,0.45)';
        ctx.beginPath(); ctx.arc(sxp, syp, sr * 1.6, 0, Math.PI * 2); ctx.fill();
        // dark heavy shell body + bright rim
        ctx.fillStyle = '#241b12';
        ctx.beginPath(); ctx.arc(sxp, syp, sr, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffd9a0'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(sxp, syp, sr, 0, Math.PI * 2); ctx.stroke();
        // white-hot nose
        ctx.fillStyle = '#fff3d6';
        ctx.beginPath(); ctx.arc(sxp + Math.cos(ang) * sr * 0.45, syp + Math.sin(ang) * sr * 0.45, sr * 0.38, 0, Math.PI * 2); ctx.fill();
      }
    } else if (f.kind === 'shock') {
      // detonation shockwave: a fat expanding ring
      ctx.strokeStyle = f.color; ctx.globalAlpha = a; ctx.lineWidth = 1 + 5 * a;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.6 - a), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // fog of war overlay: dark over never-explored tiles, a dim veil over explored
  // ground that's currently out of sight. Drawn over the world but under the
  // local-player UI (placement ghost / ability targeting). Horizontal runs of the
  // same shade are merged into one rect so an unexplored map is cheap to cover.
  if (game.vis && !fogRevealed()) {
    for (let ty = 0; ty < GH; ty++) {
      let runStart = 0, runStyle = null;
      for (let tx = 0; tx <= GW; tx++) {
        const style = tx < GW && !game.vis[ty * GW + tx]
          ? (game.explored[ty * GW + tx] ? FOG_DIM : FOG_DARK) : null;
        if (style !== runStyle) {
          if (runStyle) { ctx.fillStyle = runStyle; ctx.fillRect(runStart * TILE, ty * TILE, (tx - runStart) * TILE, TILE); }
          runStyle = style; runStart = tx;
        }
      }
    }
  }

  // radar contacts: imprecise enemy blips, drawn OVER the fog so they read through it — a
  // pulsing hollow ring (sized loosely by how much is clustered there) with a faint core.
  // Deliberately vague: a hostile contact, not an identified unit.
  if (radarContacts.length) {
    const pulse = 0.5 + 0.5 * Math.sin(game.t * 3);
    ctx.lineWidth = 1.6;
    for (const c of radarContacts) {
      if (!inView(c.x, c.y, 48)) continue;
      const rr = 11 + Math.min(c.n, 6) * 2.5;
      ctx.globalAlpha = 0.22 + 0.28 * pulse;
      ctx.strokeStyle = '#ff5a5a';
      ctx.beginPath(); ctx.arc(c.x, c.y, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.5 + 0.3 * pulse;
      ctx.fillStyle = '#ff7a6a';
      ctx.beginPath(); ctx.arc(c.x, c.y, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // placement ghost
  if (game.placing) {
    const d = DEFS[game.placing];
    const ok = placeValid(game.placing, game.localFac, mouse.wx, mouse.wy)
      && game.players[game.localFac].res >= d.cost;
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = ok ? '#3fae62' : '#b03a3a';
    ctx.beginPath(); ctx.arc(mouse.wx, mouse.wy, d.size, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ok ? '#7dffa8' : '#ff7d7d';
    ctx.beginPath(); ctx.arc(mouse.wx, mouse.wy, d.size, 0, Math.PI * 2); ctx.stroke();
  }

  // active-ability targeting overlay (the Worldbreaker's Gustav Strike)
  if (game.targeting) {
    const e = byId(game.targeting.id);
    if (e && e.def.ability) {
      const ab = e.def.ability;
      const inRange = dist(e, { x: mouse.wx, y: mouse.wy }) <= ab.range;
      // colossal max-range ring around the gun
      ctx.strokeStyle = inRange ? 'rgba(255,210,150,0.5)' : 'rgba(255,120,120,0.4)';
      ctx.lineWidth = 2; ctx.setLineDash([10, 9]);
      ctx.beginPath(); ctx.arc(e.x, e.y, ab.range, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      // blast reticle under the cursor
      const col = inRange ? '#ffd9a0' : '#ff7d7d';
      ctx.globalAlpha = 0.9; ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mouse.wx, mouse.wy, ab.splash, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mouse.wx - ab.splash - 8, mouse.wy); ctx.lineTo(mouse.wx + ab.splash + 8, mouse.wy);
      ctx.moveTo(mouse.wx, mouse.wy - ab.splash - 8); ctx.lineTo(mouse.wx, mouse.wy + ab.splash + 8); ctx.stroke();
      ctx.globalAlpha = 1;
    } else game.targeting = null;
  }

  ctx.restore();

  // drag selection box (screen space)
  if (mouse.dragging) {
    ctx.strokeStyle = '#7dffa8'; ctx.lineWidth = 1;
    ctx.strokeRect(Math.min(mouse.dx0, mouse.x), Math.min(mouse.dy0, mouse.y),
      Math.abs(mouse.x - mouse.dx0), Math.abs(mouse.y - mouse.dy0));
  }

  drawMinimap();
}

// an impassable cliff — a chunky rock that blocks movement and building, drawn with
// enough contrast that the chokepoints it forms read clearly.
function drawObstacle(ob) {
  const x = ob.x, y = ob.y, s = ob.r;
  ctx.save();
  ctx.translate(x, y);
  // shadow base
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(0, s * 0.18, s * 1.02, s * 0.78, 0, 0, Math.PI * 2); ctx.fill();
  // main rock body
  ctx.fillStyle = '#2b3543'; ctx.strokeStyle = '#3d4c5f'; ctx.lineWidth = 2.5;
  poly(0, 0, s, 7, 0.5); ctx.fill(); ctx.stroke();
  // lighter facets to give it volume
  ctx.fillStyle = '#3a4757'; poly(-s * 0.2, -s * 0.22, s * 0.62, 6, 1.1); ctx.fill();
  ctx.fillStyle = '#222b37'; poly(s * 0.26, s * 0.22, s * 0.4, 5, 0.2); ctx.fill();
  ctx.restore();
}

// ---------------- fog of war (client-side vision) ----------------
// The local player only sees the world around their own units and buildings; the
// rest is dark (never-explored) or dimmed (explored, currently out of sight). This
// is a pure rendering filter — the simulation/AI are unaffected — so it costs nothing
// in the sim and works identically in single-player and as a multiplayer guest.
const FOG_DARK = 'rgba(7,9,13,0.97)';   // never explored
const FOG_DIM  = 'rgba(10,13,19,0.5)';  // explored but not currently visible

// sight radius (world units) of one entity. Buildings see a generous bubble (the
// core widest), combat things at least as far as they can shoot/aggro.
function sightOf(e) {
  const d = e.def;
  let s = d.kind === 'building' ? (d.core ? 480 : 320) : 250;
  if (d.range) s = Math.max(s, rangeOf(e) + 80);
  if (d.aggro) s = Math.max(s, aggroOf(e) + 60);
  if (d.creepR) s = Math.max(s, d.creepR * TILE + 50);
  return s;
}
// reveal the whole map when there's no active local player (spectating / match over),
// or when the local player has woven the Moonsign Graft (which lifts the fog entirely)
function fogRevealed() {
  if (!game || !game.localFac || game.over || game.defeated) return true;
  const p = game.players[game.localFac];
  return !!(p && p.gMoon);
}
function ensureFog() {
  const n = GW * GH;
  if (!game.vis || game.vis.length !== n) { game.vis = new Uint8Array(n); game.explored = new Uint8Array(n); game.fogAt = -1; }
}
// recompute the currently-visible tile grid from the local player's entities, and
// accumulate the sticky "explored" grid. Throttled — vision lagging a frame or two
// is invisible to the eye but saves stamping circles every single frame.
function computeVision() {
  ensureFog();
  if (fogRevealed()) { game.vis.fill(1); game.explored.fill(1); return; }
  if (game.fogAt >= 0 && game.t - game.fogAt < 0.12) return;
  game.fogAt = game.t;
  game.vis.fill(0);
  const fac = game.localFac;
  for (const e of game.entities) {
    if (e.dead || e.fac !== fac) continue;
    const r = sightOf(e) / TILE, r2 = r * r;
    const cx = e.x / TILE, cy = e.y / TILE;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(GW - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(GH - 1, Math.ceil(cy + r));
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        const dx = tx + 0.5 - cx, dy = ty + 0.5 - cy;
        if (dx * dx + dy * dy <= r2) { const i = ty * GW + tx; game.vis[i] = 1; game.explored[i] = 1; }
      }
  }
}
function tileVis(x, y) {
  if (!game.vis || fogRevealed()) return true;
  const tx = x / TILE | 0, ty = y / TILE | 0;
  if (tx < 0 || ty < 0 || tx >= GW || ty >= GH) return true;
  return game.vis[ty * GW + tx] === 1;
}
function tileExplored(x, y) {
  if (!game.explored || fogRevealed()) return true;
  const tx = x / TILE | 0, ty = y / TILE | 0;
  if (tx < 0 || ty < 0 || tx >= GW || ty >= GH) return true;
  return game.explored[ty * GW + tx] === 1;
}
// is an entity currently shown? Own things always; enemy/neutral only while in sight.
function visibleEnt(e) { return e.fac === game.localFac || tileVis(e.x, e.y); }

// ---------------- radar (imprecise long-range detection) ----------------
// A radar/sensor building (or the Solari Ark) detects enemy movement far beyond true
// line of sight — but only as imprecise CONTACTS, never a clear picture: every detected
// enemy is quantised to a coarse cell, so positions blur and a clump reads as a vague
// cluster, not exact units. It never lifts the fog or reveals the real entity (you can't
// click/target a contact) — pure early warning. Recomputed alongside vision (throttled).
const RADAR_CELL = TILE * 3;       // detection resolution: contacts snap to ~3-tile cells
let radarContacts = [];            // [{x,y,n}] approximate enemy clusters this sweep
function computeRadar() {
  radarContacts = [];
  if (!game || !game.localFac || fogRevealed()) return;
  const fac = game.localFac;
  const sources = [];
  for (const e of game.entities)
    if (!e.dead && e.fac === fac && e.def.radarR && !e.constructing && !e.growing) sources.push(e);
  if (!sources.length) return;
  const cells = new Map();
  for (const e of game.entities) {
    if (e.dead || e.fac === fac || e.fac === 'neutral' || e.def.noTarget) continue; // enemies only
    if (tileVis(e.x, e.y)) continue;                                                // already seen clearly
    let inRange = false;
    for (const s of sources) {
      const dx = e.x - s.x, dy = e.y - s.y, rr = s.def.radarR;
      if (dx * dx + dy * dy <= rr * rr) { inRange = true; break; }
    }
    if (!inRange) continue;
    const gx = Math.round(e.x / RADAR_CELL), gy = Math.round(e.y / RADAR_CELL);
    const key = gx + ',' + gy, c = cells.get(key);
    if (c) c.n++; else cells.set(key, { x: gx * RADAR_CELL, y: gy * RADAR_CELL, n: 1 });
  }
  radarContacts = [...cells.values()];
}

// the local player's researched range multiplier (range is shown/used with upgrades)
function rangeMulOf(fac) { const p = game.players[fac]; return (p && p.rangeMul) || 1; }

// for every selected entity: draw its weapon range as a faint ring, and for units
// draw a line to wherever they've been ordered (move / attack-move / attack / harvest).
function drawSelectionOverlays() {
  for (const e of game.sel) {
    if (e.dead) continue;
    const col = facColor(e.fac);
    // weapon range ring (skip pure-melee short range; include the Citadel's aux ring)
    if (e.def.dmg && e.def.range > 40) {
      const rng = e.def.range * rangeMulOf(e.fac) + e.size;
      ctx.strokeStyle = col + '66'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.arc(e.x, e.y, rng, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (e.def.aux) {
      const ar = e.def.aux.range * rangeMulOf(e.fac) + e.size;
      ctx.strokeStyle = col + '44'; ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.arc(e.x, e.y, ar, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    // order destination line (units only)
    if (e.def.kind !== 'unit') continue;
    const o = e.order; let dx = null, dy = null, hostile = false;
    if (o.type === 'move' || o.type === 'amove') { dx = o.x; dy = o.y; hostile = o.type === 'amove'; }
    else if (o.type === 'attack') { const t = byId(o.id); if (t) { dx = t.x; dy = t.y; hostile = true; } }
    else if (o.type === 'build') { const t = byId(o.id); if (t) { dx = t.x; dy = t.y; } }
    else if (o.type === 'harvest') { const n = game.nodes.find(n => n.id === o.nodeId); if (n) { dx = n.x; dy = n.y; } }
    if (dx == null) continue;
    ctx.strokeStyle = hostile ? 'rgba(255,106,106,0.7)' : 'rgba(125,255,168,0.7)';
    ctx.lineWidth = 1.5; ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(dx, dy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = hostile ? 'rgba(255,106,106,0.9)' : 'rgba(125,255,168,0.9)';
    ctx.beginPath(); ctx.arc(dx, dy, 3.5, 0, Math.PI * 2); ctx.fill();
  }

  // rally points: a flag (and tether) for any selected structure that musters units
  for (const e of game.sel) {
    if (e.dead || !e.rally || !(e.def.produces || e.def.spawns)) continue;
    const col = facColor(e.fac);
    ctx.strokeStyle = col + '88'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 6]);
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.rally.x, e.rally.y); ctx.stroke();
    ctx.setLineDash([]);
    drawRallyFlag(e.rally.x, e.rally.y, col);
  }
}

// a small rally flag planted at a muster point
function drawRallyFlag(x, y, col) {
  ctx.strokeStyle = col; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 17); ctx.stroke();
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(x, y - 17); ctx.lineTo(x + 12, y - 13.5); ctx.lineTo(x, y - 10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#0d1117'; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.stroke();
}

function drawEnt(e) {
  const col = facColor(e.fac), dark = facDark(e.fac);
  const sel = game.sel.includes(e);
  const x = e.x, y = e.y, s = e.size;
  ctx.save();

  if (sel) {
    ctx.strokeStyle = '#7dffa8'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, s + 5, 0, Math.PI * 2); ctx.stroke();
  }
  if (e.constructing || e.growing) ctx.globalAlpha = 0.6;

  // radar/sensor: a slow rotating sweep marks any building (or the Ark) that's a sensor,
  // and its full detection radius is shown as a faint dashed ring while it's selected, so
  // you can see (and place) its coverage. Own sensors only.
  if (e.def.radarR && e.fac === game.localFac && !e.constructing && !e.growing) {
    const sweep = game.t * 1.1 + e.id;
    ctx.save();
    ctx.globalAlpha = 0.5; ctx.strokeStyle = '#9fe8ff'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(sweep) * (s + 7), y + Math.sin(sweep) * (s + 7)); ctx.stroke();
    if (sel) {
      ctx.globalAlpha = 0.28; ctx.setLineDash([9, 9]); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(x, y, e.def.radarR, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  // Myriad corruption: a sickly, pulsing violet aura marks an infected enemy
  if (e.corruptUntil > game.t) {
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.3 * Math.sin(game.t * 5 + e.id);
    ctx.strokeStyle = '#c75cff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, s + 3, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // Ember burning: flickering ember-flames lick up off a burning enemy
  if (e.burnUntil > game.t) {
    ctx.save();
    ctx.globalAlpha = 0.45 + 0.35 * Math.sin(game.t * 11 + e.id * 1.7);
    ctx.fillStyle = '#ff8a2a';
    for (let i = 0; i < 3; i++) {
      const a = game.t * 4 + i * 2.1, fx = x + Math.cos(a) * s * 0.6;
      const fy = y - s * 0.4 - (0.4 + 0.4 * Math.sin(game.t * 9 + i + e.id)) * s;
      ctx.beginPath(); ctx.arc(fx, fy, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  // Pact blood frenzy: a hot crimson aura pulses around an enraged Pact unit
  if (e.frenzyUntil > game.t) {
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.35 * Math.sin(game.t * 9 + e.id);
    ctx.strokeStyle = '#ff2a3a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, s + 2.5, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  if (e.fac === 'vanguard') {
    if (e.def.kind === 'building') {
      ctx.fillStyle = dark; ctx.strokeStyle = col; ctx.lineWidth = 2;
      roundRect(x - s, y - s * 0.8, s * 2, s * 1.6, 5); ctx.fill(); ctx.stroke();
      if (e.type === 'hq') {
        ctx.strokeStyle = col;
        ctx.beginPath(); ctx.moveTo(x, y - s * 0.8); ctx.lineTo(x, y - s * 1.35); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y - s * 1.35, 3.5, 0, Math.PI * 2); ctx.fill();
      } else if (e.type === 'turret' || e.type === 'pillbox') {
        if (e.type === 'pillbox') { // armoured inner block under the barrel
          ctx.fillStyle = col; ctx.globalAlpha *= 0.5;
          ctx.fillRect(x - s * 0.5, y - s * 0.4, s, s * 0.8); ctx.globalAlpha /= 0.5;
        }
        const t = e.tgt ? byId(e.tgt) : null;
        const a = t ? Math.atan2(t.y - y, t.x - x) : game.t * 0.5;
        ctx.strokeStyle = col; ctx.lineWidth = e.type === 'pillbox' ? 5 : 3.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + (e.type === 'pillbox' ? 7 : 9)), y + Math.sin(a) * (s + (e.type === 'pillbox' ? 7 : 9))); ctx.stroke();
      } else if (e.type === 'depot') { // stacked supply crates + chevron
        ctx.fillStyle = col;
        for (const [cx, cy] of [[-0.42, -0.28], [0.18, -0.28], [-0.12, 0.18]]) {
          ctx.fillRect(x + cx * s, y + cy * s, s * 0.5, s * 0.5);
          ctx.strokeStyle = dark; ctx.lineWidth = 1; ctx.strokeRect(x + cx * s, y + cy * s, s * 0.5, s * 0.5);
        }
      } else {
        ctx.fillStyle = col; ctx.fillRect(x - s * 0.45, y - s * 0.3, s * 0.9, s * 0.6);
      }
    } else if (e.type === 'tank' || e.type === 'flametank' || e.type === 'goliath' || e.type === 'artillery') {
      ctx.fillStyle = e.type === 'goliath' ? '#0f2740' : dark; ctx.strokeStyle = col; ctx.lineWidth = 2;
      roundRect(x - s, y - s * 0.7, s * 2, s * 1.4, 4); ctx.fill(); ctx.stroke();
      const t = e.tgt ? byId(e.tgt) : null;
      const a = t ? Math.atan2(t.y - y, t.x - x) : 0;
      ctx.strokeStyle = e.type === 'flametank' ? '#ff9d4d' : col;
      ctx.lineWidth = e.type === 'goliath' ? 4 : e.type === 'artillery' ? 3.5 : 3;
      const reach = e.type === 'artillery' ? s + 16 : s + 8; // artillery's long howitzer barrel
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * reach, y + Math.sin(a) * reach); ctx.stroke();
      if (e.type === 'goliath') { // twin barrels
        const px = Math.cos(a + Math.PI / 2) * 3, py = Math.sin(a + Math.PI / 2) * 3;
        ctx.beginPath(); ctx.moveTo(x + px, y + py); ctx.lineTo(x + px + Math.cos(a) * (s + 6), y + py + Math.sin(a) * (s + 6));
        ctx.moveTo(x - px, y - py); ctx.lineTo(x - px + Math.cos(a) * (s + 6), y - py + Math.sin(a) * (s + 6)); ctx.stroke();
      } else if (e.type === 'artillery') { // muzzle brake at the barrel tip
        ctx.lineWidth = 3; ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * reach + Math.cos(a + Math.PI / 2) * 3, y + Math.sin(a) * reach + Math.sin(a + Math.PI / 2) * 3);
        ctx.lineTo(x + Math.cos(a) * reach - Math.cos(a + Math.PI / 2) * 3, y + Math.sin(a) * reach - Math.sin(a + Math.PI / 2) * 3); ctx.stroke();
      }
    } else if (e.type === 'outrider') { // fast light recon buggy: small angular hull + thin gun
      ctx.fillStyle = dark; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      const t = e.tgt ? byId(e.tgt) : null, a = t ? Math.atan2(t.y - y, t.x - x) : (e.facing || 0);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.7, s * 0.7); ctx.lineTo(-s * 0.7, -s * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s + 5, 0); ctx.stroke();
      ctx.restore();
    } else if (e.type === 'worker') {
      ctx.fillStyle = e.order.type === 'harvest' && e.order.carry > 0 ? '#6ee7ff' : dark;
      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.fillRect(x - s, y - s, s * 2, s * 2); ctx.strokeRect(x - s, y - s, s * 2, s * 2);
    } else if (e.type === 'gunship') {
      ctx.fillStyle = dark; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - s, y + s * 0.6); ctx.lineTo(x, y - s); ctx.lineTo(x + s, y + s * 0.6); ctx.lineTo(x, y + s * 0.15); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(157,208,255,0.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y - s * 0.2, s * 0.95, 0, Math.PI * 2); ctx.stroke();
    } else if (e.type === 'bomber') { // swept-wing strike aircraft with a payload dot
      const t = e.tgt ? byId(e.tgt) : null, a = t ? Math.atan2(t.y - y, t.x - x) : (e.facing || -Math.PI / 2);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = dark; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -s); ctx.lineTo(s * 1.1, s * 0.7); ctx.lineTo(0, s * 0.35); ctx.lineTo(-s * 1.1, s * 0.7); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, s * 0.1, s * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (e.type === 'medic') {
      ctx.fillStyle = '#dfe8f4'; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.fillRect(x - s, y - s, s * 2, s * 2); ctx.strokeRect(x - s, y - s, s * 2, s * 2);
      ctx.fillStyle = '#e05b4d';
      ctx.fillRect(x - s * 0.55, y - s * 0.18, s * 1.1, s * 0.36);
      ctx.fillRect(x - s * 0.18, y - s * 0.55, s * 0.36, s * 1.1);
    } else {
      // marine / sniper / rocketeer: triangle (rocketeer carries a launcher tube)
      ctx.fillStyle = e.type === 'sniper' ? '#1d3f63' : e.type === 'rocket' ? '#2c5a8c' : col;
      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y - s - 2); ctx.lineTo(x + s, y + s); ctx.lineTo(x - s, y + s); ctx.closePath();
      ctx.fill(); ctx.stroke();
      if (e.type === 'rocket') { // shoulder launcher tube
        const t = e.tgt ? byId(e.tgt) : null, a = t ? Math.atan2(t.y - y, t.x - x) : 0;
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y - s * 0.2); ctx.lineTo(x + Math.cos(a) * (s + 5), y - s * 0.2 + Math.sin(a) * (s + 5)); ctx.stroke();
      }
    }
  }

  else if (e.fac === 'myriad') {
    const wob = 1 + 0.08 * Math.sin(game.t * 3 + e.id);
    ctx.fillStyle = e.def.kind === 'building' ? '#5a2d7d' : '#9a4dd0';
    ctx.strokeStyle = col; ctx.lineWidth = e.def.kind === 'building' ? 2 : 1.2;
    ctx.beginPath(); ctx.arc(x, y, s * wob, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (e.type === 'hive') {
      ctx.strokeStyle = '#e3b3ff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, s * 0.62 * wob, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, s * 0.3 * wob, 0, Math.PI * 2); ctx.stroke();
    } else if (e.type === 'spawnpit' || e.type === 'spittermound' || e.type === 'hunterden') {
      ctx.fillStyle = '#2a0e3d';
      ctx.beginPath(); ctx.arc(x, y, s * 0.45, 0, Math.PI * 2); ctx.fill();
      if (e.type === 'spittermound') {
        ctx.fillStyle = '#9fe06a';
        ctx.beginPath(); ctx.arc(x, y, s * 0.2, 0, Math.PI * 2); ctx.fill();
      } else if (e.type === 'hunterden') {
        ctx.fillStyle = '#e3b3ff';
        ctx.beginPath(); ctx.arc(x, y, s * 0.2, 0, Math.PI * 2); ctx.fill();
      }
    } else if (e.type === 'spine') {
      const t = e.tgt ? byId(e.tgt) : null;
      const a = t ? Math.atan2(t.y - y, t.x - x) : game.t * 0.8;
      ctx.strokeStyle = '#9fe06a'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 10), y + Math.sin(a) * (s + 10)); ctx.stroke();
    } else if (e.type === 'hunter') {
      ctx.strokeStyle = '#e3b3ff'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + i * Math.PI / 2 + 0.15 * Math.sin(game.t * 5 + e.id);
        ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6);
        ctx.lineTo(x + Math.cos(a) * (s + 5), y + Math.sin(a) * (s + 5)); ctx.stroke();
      }
    } else if (e.type === 'broodmother') {
      ctx.fillStyle = '#e3b3ff';
      for (let i = 0; i < 3; i++) {
        const a = game.t * 1.5 + i * Math.PI * 2 / 3;
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.5, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    } else if (e.type === 'spitter') {
      ctx.fillStyle = '#9fe06a';
      ctx.beginPath(); ctx.arc(x, y - s * 0.3, 2.4, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === 'miasma') { // corruption tower: toxic barrel + acid core
      const t = e.tgt ? byId(e.tgt) : null;
      const a = t ? Math.atan2(t.y - y, t.x - x) : game.t * 0.6;
      ctx.strokeStyle = '#9fe06a'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 9), y + Math.sin(a) * (s + 9)); ctx.stroke();
      ctx.fillStyle = '#9fe06a'; ctx.beginPath(); ctx.arc(x, y, s * 0.22, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === 'corruptden' || e.type === 'infestpit') {
      ctx.fillStyle = '#9fe06a';
      ctx.beginPath(); ctx.arc(x, y, s * 0.24, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === 'mawflyer') { // flyer: a winged chevron
      ctx.strokeStyle = '#9fe06a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - s * 0.9, y + s * 0.3); ctx.lineTo(x, y - s * 0.4); ctx.lineTo(x + s * 0.9, y + s * 0.3); ctx.stroke();
    } else if (e.type === 'corruptor' || e.type === 'defiler') { // orbiting acid globs
      ctx.fillStyle = '#9fe06a';
      const dots = e.type === 'defiler' ? 3 : 1;
      for (let i = 0; i < dots; i++) {
        const a = game.t * 1.5 + i * Math.PI * 2 / dots;
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * s * 0.42, y + Math.sin(a) * s * 0.42, 2.4, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  else if (e.fac === 'choir') {
    if (e.def.kind === 'building') {
      ctx.fillStyle = '#0e332d'; ctx.strokeStyle = col; ctx.lineWidth = e.def.core ? 2.5 : 1.8;
      ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (e.type === 'ossuary') {
        ctx.fillStyle = '#9ff0e2';
        for (let i = 0; i < 5; i++) {
          const a = game.t * 0.6 + i * Math.PI * 2 / 5;
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * s * 0.62, y + Math.sin(a) * s * 0.62, 3, 0, Math.PI * 2); ctx.fill();
        }
      } else if (e.type === 'spire') {
        const t = e.tgt ? byId(e.tgt) : null;
        const a = t ? Math.atan2(t.y - y, t.x - x) : -Math.PI / 2;
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 9), y + Math.sin(a) * (s + 9)); ctx.stroke();
      } else if (e.type === 'conduit') {
        ctx.fillStyle = '#9ff0e2';
        ctx.beginPath(); ctx.arc(x, y, 2.5 + Math.sin(game.t * 3 + e.id), 0, Math.PI * 2); ctx.fill();
      } else { // reliquary
        ctx.strokeStyle = '#9ff0e2'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, y - s * 0.5); ctx.lineTo(x + s * 0.5, y); ctx.lineTo(x, y + s * 0.5); ctx.lineTo(x - s * 0.5, y); ctx.closePath(); ctx.stroke();
      }
    } else { // ghostly wisps
      ctx.fillStyle = 'rgba(63,224,200,0.22)';
      ctx.strokeStyle = col; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(x, y, s + 1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#bffff2';
      ctx.beginPath(); ctx.arc(x, y, s * 0.35, 0, Math.PI * 2); ctx.fill();
      if (e.type === 'revenant') {
        ctx.strokeStyle = '#bffff2'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x - s * 0.7, y); ctx.lineTo(x + s * 0.7, y);
        ctx.moveTo(x, y - s * 0.7); ctx.lineTo(x, y + s * 0.7); ctx.stroke();
      } else if (e.type === 'banshee') {
        ctx.strokeStyle = '#bffff2'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(x, y, s * 0.65, 0.3, Math.PI - 0.3); ctx.stroke();
      }
    }
  }

  else if (e.fac === 'syndicate') {
    if (e.def.kind === 'building') {
      ctx.fillStyle = '#3a140d'; ctx.strokeStyle = col; ctx.lineWidth = 2;
      poly(x, y, s + 2, 8, Math.PI / 8); ctx.fill(); ctx.stroke();
      if (e.type === 'haven') {
        ctx.strokeStyle = '#ffd97d'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, s * 0.45, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, s * 0.2, 0, Math.PI * 2); ctx.stroke();
      } else if (e.type === 'countinghouse') {
        ctx.fillStyle = '#ffd97d';
        ctx.beginPath(); ctx.arc(x, y, s * 0.28, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3a140d';
        ctx.beginPath(); ctx.arc(x, y, s * 0.13, 0, Math.PI * 2); ctx.fill();
      } else if (e.type === 'vault') { // a stack of bullion coins
        ctx.fillStyle = '#ffd97d'; ctx.strokeStyle = '#3a140d'; ctx.lineWidth = 1;
        for (const [cx, cy] of [[-0.26, 0.12], [0.26, 0.12], [0, -0.18]]) {
          ctx.beginPath(); ctx.arc(x + cx * s, y + cy * s, s * 0.22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      } else if (e.type === 'guild') { // crossed-blades mercenary mark
        ctx.strokeStyle = '#ffd97d'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - s * 0.4, y - s * 0.4); ctx.lineTo(x + s * 0.4, y + s * 0.4);
        ctx.moveTo(x + s * 0.4, y - s * 0.4); ctx.lineTo(x - s * 0.4, y + s * 0.4); ctx.stroke();
      }
      if (e.def.dmg) { // haven & watchpost barrels
        const t = e.tgt ? byId(e.tgt) : null;
        const a = t ? Math.atan2(t.y - y, t.x - x) : game.t * 0.4;
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 8), y + Math.sin(a) * (s + 8)); ctx.stroke();
      }
    } else if (e.type === 'dragoon') { // aerial gunner: a chevron with a rotor ring
      ctx.fillStyle = '#6b2418'; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - s, y + s * 0.6); ctx.lineTo(x, y - s); ctx.lineTo(x + s, y + s * 0.6); ctx.lineTo(x, y + s * 0.15); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,217,125,0.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y - s * 0.2, s * 0.95, 0, Math.PI * 2); ctx.stroke();
    } else if (e.type === 'sawbones') { // field surgeon: gold cross
      ctx.fillStyle = '#3a140d'; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      poly(x, y, s + 1, 5, -Math.PI / 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd97d';
      ctx.fillRect(x - s * 0.5, y - s * 0.16, s, s * 0.32);
      ctx.fillRect(x - s * 0.16, y - s * 0.5, s * 0.32, s);
    } else { // mercs: pentagons (heavier ones get a darker, chunkier body)
      const heavy = e.type === 'juggernaut' || e.type === 'ironhide' || e.type === 'demolisher';
      ctx.fillStyle = heavy ? '#54201a' : '#6b2418';
      ctx.strokeStyle = col; ctx.lineWidth = heavy ? 2 : 1.5;
      poly(x, y, s + 1, 5, -Math.PI / 2); ctx.fill(); ctx.stroke();
      if (e.type === 'arbalest' || e.type === 'demolisher') { // marksman / siege barrel
        const t = e.tgt ? byId(e.tgt) : null;
        const a = t ? Math.atan2(t.y - y, t.x - x) : -Math.PI / 2;
        ctx.strokeStyle = '#ffd97d'; ctx.lineWidth = e.type === 'demolisher' ? 3.5 : 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + (e.type === 'demolisher' ? 10 : 7)), y + Math.sin(a) * (s + (e.type === 'demolisher' ? 10 : 7))); ctx.stroke();
      } else if (e.type === 'juggernaut' || e.type === 'ironhide') {
        ctx.strokeStyle = '#ffd97d'; ctx.lineWidth = 1.5;
        poly(x, y, s * 0.5, 5, -Math.PI / 2); ctx.stroke();
      }
    }
  }

  else if (e.fac === 'neutral') {
    if (e.type === 'obelisk') {
      const oc = e.owner ? facColor(e.owner) : '#9aa6b8';
      ctx.fillStyle = e.owner ? facDark(e.owner) : '#1d2533';
      ctx.strokeStyle = oc; ctx.lineWidth = 2.5;
      poly(x, y, s, 6, -Math.PI / 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = oc;
      ctx.beginPath(); ctx.arc(x, y, s * 0.32 * (1 + 0.12 * Math.sin(game.t * 2)), 0, Math.PI * 2); ctx.fill();
      // capture-radius ring + progress arc (sim side only)
      ctx.strokeStyle = 'rgba(154,166,184,0.18)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, e.def.captureR, 0, Math.PI * 2); ctx.stroke();
      if (e.capFac && e.capProg > 0) {
        const f = clamp(e.capProg / e.def.captureTime, 0, 1);
        ctx.strokeStyle = facColor(e.capFac); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, s + 7, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.stroke();
      }
    } else if (e.type === 'cache') { // small jungle camp — a crate of loot
      ctx.fillStyle = '#26303a'; ctx.strokeStyle = '#b8923a'; ctx.lineWidth = 2;
      roundRect(x - s, y - s * 0.8, s * 2, s * 1.6, 3); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#d4a73e'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x + s, y);
      ctx.moveTo(x, y - s * 0.8); ctx.lineTo(x, y + s * 0.8); ctx.stroke();
      const t = e.tgt ? byId(e.tgt) : null;
      if (t) {
        const a = Math.atan2(t.y - y, t.x - x);
        ctx.strokeStyle = '#d4a73e'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 7), y + Math.sin(a) * (s + 7)); ctx.stroke();
      }
    } else if (e.type === 'munitions') { // heavily-armoured munitions blockhouse
      ctx.fillStyle = '#26303a'; ctx.strokeStyle = '#7d8a99'; ctx.lineWidth = 3;
      roundRect(x - s, y - s * 0.85, s * 2, s * 1.7, 4); ctx.fill(); ctx.stroke();
      // corner reinforcements
      ctx.fillStyle = '#39444f';
      for (const [cx2, cy2] of [[-s, -s * 0.85], [s, -s * 0.85], [-s, s * 0.85], [s, s * 0.85]]) {
        ctx.beginPath(); ctx.arc(x + cx2, y + cy2, s * 0.26, 0, Math.PI * 2); ctx.fill();
      }
      // central firing slit + munitions emblem (sulphur yellow = Powder)
      ctx.fillStyle = '#11161c'; roundRect(x - s * 0.55, y - s * 0.18, s * 1.1, s * 0.36, 2); ctx.fill();
      ctx.fillStyle = '#e0c24a';
      ctx.beginPath(); ctx.arc(x, y - s * 0.42, s * 0.22, 0, Math.PI * 2); ctx.fill();
      const tb = e.tgt ? byId(e.tgt) : null;
      if (tb) {
        const a = Math.atan2(tb.y - y, tb.x - x);
        ctx.strokeStyle = '#9aa6b8'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 9), y + Math.sin(a) * (s + 9)); ctx.stroke();
      }
    } else if (e.type === 'wellspring') { // a font of potential — a pulsing star, tinted to its harnesser
      const oc = e.owner ? facColor(e.owner) : '#8fe6ff';
      const pulse = 0.7 + 0.3 * Math.sin(game.t * 2.2 + e.id);
      // a soft glow halo
      ctx.globalAlpha *= 0.16;
      ctx.fillStyle = oc; ctx.beginPath(); ctx.arc(x, y, s * 1.7 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha /= 0.16;
      // harness-radius ring (so players can see how close they must build)
      ctx.strokeStyle = e.owner ? 'rgba(255,255,255,0.10)' : 'rgba(143,230,255,0.12)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, WELL.harnessR, 0, Math.PI * 2); ctx.stroke();
      // a four-point star core
      ctx.fillStyle = e.owner ? facDark(e.owner) : '#10303a'; ctx.strokeStyle = oc; ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4 - Math.PI / 2, rr = (i % 2 === 0 ? s : s * 0.42);
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = oc;
      ctx.beginPath(); ctx.arc(x, y, s * 0.26 * (0.8 + 0.4 * pulse), 0, Math.PI * 2); ctx.fill();
    } else { // hoard: a fortified treasure tower
      ctx.fillStyle = '#2a2014'; ctx.strokeStyle = '#d4a73e'; ctx.lineWidth = 2.5;
      poly(x, y, s, 5, -Math.PI / 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e8c75e';
      ctx.beginPath(); ctx.arc(x, y, s * 0.42, 0, Math.PI * 2); ctx.fill();
      const t = e.tgt ? byId(e.tgt) : null;
      if (t) {
        const a = Math.atan2(t.y - y, t.x - x);
        ctx.strokeStyle = '#d4a73e'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 9), y + Math.sin(a) * (s + 9)); ctx.stroke();
      }
    }
  }

  else if (e.fac === 'warden') { // steel hexagons & armoured blocks
    if (e.type === 'citadel') { // the super-weapon: a colossal artillery bunker
      // outer armoured ring + inner keep
      ctx.fillStyle = dark; ctx.strokeStyle = col; ctx.lineWidth = 3.5;
      poly(x, y, s, 6, 0); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 2; poly(x, y, s * 0.78, 6, Math.PI / 6); ctx.stroke();
      ctx.fillStyle = '#3a4656'; poly(x, y, s * 0.5, 6, 0); ctx.fill(); ctx.stroke();
      // four side machine-gun turrets, each tracking its own target
      const auxT = e.auxTgt || [];
      for (let i = 0; i < 4; i++) {
        const ga = i * Math.PI / 2 + Math.PI / 4;
        const gx = x + Math.cos(ga) * s * 0.72, gy = y + Math.sin(ga) * s * 0.72;
        ctx.fillStyle = '#2b3543'; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(gx, gy, s * 0.16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        const gt = auxT[i] ? byId(auxT[i]) : null;
        const ba = gt ? Math.atan2(gt.y - gy, gt.x - gx) : ga;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(ba) * s * 0.34, gy + Math.sin(ba) * s * 0.34); ctx.stroke();
      }
      // the main artillery cannon
      const t = e.tgt ? byId(e.tgt) : null;
      const a = t ? Math.atan2(t.y - y, t.x - x) : -Math.PI / 2;
      ctx.strokeStyle = col; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 14), y + Math.sin(a) * (s + 14)); ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = '#e7edf5'; ctx.beginPath(); ctx.arc(x, y, s * 0.2, 0, Math.PI * 2); ctx.fill();
    }
    else if (e.type === 'worldbreaker') { // the doomsday Gustav siege gun — layered fortress + colossal barrel
      ctx.fillStyle = dark; ctx.strokeStyle = col; ctx.lineWidth = 4;
      poly(x, y, s, 8, Math.PI / 8); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 2.5; poly(x, y, s * 0.82, 8, 0); ctx.stroke();
      ctx.fillStyle = '#3a4656'; poly(x, y, s * 0.55, 6, 0); ctx.fill(); ctx.stroke();
      // aux machine-gun ring (six guns), each tracking its own target
      const guns = (e.def.aux && e.def.aux.guns) || 6, auxT = e.auxTgt || [];
      for (let i = 0; i < guns; i++) {
        const ga = i * Math.PI * 2 / guns + Math.PI / guns;
        const gx = x + Math.cos(ga) * s * 0.74, gy = y + Math.sin(ga) * s * 0.74;
        ctx.fillStyle = '#2b3543'; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(gx, gy, s * 0.12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        const gt = auxT[i] ? byId(auxT[i]) : null;
        const ba = gt ? Math.atan2(gt.y - gy, gt.x - gx) : ga;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(ba) * s * 0.26, gy + Math.sin(ba) * s * 0.26); ctx.stroke();
      }
      // glowing charge core — bright & pulsing when the Gustav Strike is loaded
      const ready = (e.abilityCd || 0) <= 0 && !e.constructing && !e.growing;
      const gl = ready ? (0.55 + 0.45 * Math.sin(game.t * 4)) : 0.16;
      ctx.fillStyle = 'rgba(255,205,140,' + gl + ')';
      ctx.beginPath(); ctx.arc(x, y, s * 0.3, 0, Math.PI * 2); ctx.fill();
      // the gigantic main cannon (twin-tone for heft) — scales with the body
      const t = e.tgt ? byId(e.tgt) : null;
      const a = t ? Math.atan2(t.y - y, t.x - x) : -Math.PI / 2;
      const bx = x + Math.cos(a) * (s * 1.38), by = y + Math.sin(a) * (s * 1.38);
      ctx.lineCap = 'round';
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(10, s * 0.13); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bx, by); ctx.stroke();
      ctx.strokeStyle = '#1a2230'; ctx.lineWidth = Math.max(3, s * 0.045); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bx, by); ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = '#e7edf5'; ctx.beginPath(); ctx.arc(x, y, s * 0.17, 0, Math.PI * 2); ctx.fill();
      // a faint apex-style aura so it reads as the ultimate structure
      ctx.globalAlpha = 0.3 + 0.25 * Math.sin(game.t * 3);
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, s + 8, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    else if (e.def.kind === 'building') {
      ctx.fillStyle = dark; ctx.strokeStyle = col; ctx.lineWidth = e.def.core ? 3 : 2;
      poly(x, y, s, 6, 0); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 1; poly(x, y, s * 0.6, 6, 0); ctx.stroke();
      if (e.type === 'forge') { // glowing molten core + anvil
        const gl = 0.5 + 0.3 * Math.sin(game.t * 4 + e.id);
        ctx.fillStyle = 'rgba(255,150,60,' + gl + ')';
        ctx.beginPath(); ctx.arc(x, y, s * 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#d8dee8'; ctx.fillRect(x - s * 0.3, y - s * 0.12, s * 0.6, s * 0.24);
      } else if (e.type === 'arsenal') { // crossed hammers over a gear
        ctx.strokeStyle = '#cfd8e4'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x - s * 0.45, y - s * 0.45); ctx.lineTo(x + s * 0.45, y + s * 0.45);
        ctx.moveTo(x + s * 0.45, y - s * 0.45); ctx.lineTo(x - s * 0.45, y + s * 0.45); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, s * 0.16, 0, Math.PI * 2); ctx.fill();
      } else if (e.type === 'quarry') { // stacked cut-stone blocks
        ctx.fillStyle = '#cfd8e4';
        ctx.fillRect(x - s * 0.42, y - s * 0.05, s * 0.36, s * 0.34);
        ctx.fillRect(x + s * 0.06, y - s * 0.05, s * 0.36, s * 0.34);
        ctx.fillRect(x - s * 0.18, y - s * 0.42, s * 0.36, s * 0.34);
      } else if (e.type === 'hall') { // an oath banner on a pole
        ctx.strokeStyle = '#cfd8e4'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y + s * 0.5); ctx.lineTo(x, y - s * 0.6); ctx.stroke();
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(x, y - s * 0.6); ctx.lineTo(x + s * 0.55, y - s * 0.42); ctx.lineTo(x, y - s * 0.18); ctx.closePath(); ctx.fill();
      } else if (e.def.dmg) { // any armed Warden structure (keep, bastion, bunker, redoubt, cauldron, ballista)
        const t = e.tgt ? byId(e.tgt) : null;
        const a = t ? Math.atan2(t.y - y, t.x - x) : -Math.PI / 2;
        ctx.lineWidth = e.type === 'redoubt' ? 4 : 3.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 8), y + Math.sin(a) * (s + 8)); ctx.stroke();
      }
    } else if (e.type === 'castellan') { // tier-3 siege colossus: armoured hex hull + heavy cannon
      ctx.fillStyle = '#1a2230'; ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      poly(x, y, s, 6, Math.PI / 6); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 1.2; poly(x, y, s * 0.55, 6, Math.PI / 6); ctx.stroke();
      const t = e.tgt ? byId(e.tgt) : null;
      const a = t ? Math.atan2(t.y - y, t.x - x) : -Math.PI / 2;
      ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 11), y + Math.sin(a) * (s + 11)); ctx.stroke();
      ctx.lineCap = 'butt';
    } else {
      ctx.fillStyle = e.type === 'ironclad' ? '#2a3342' : e.type === 'marshal' ? '#27405a' : dark;
      ctx.strokeStyle = col; ctx.lineWidth = e.type === 'ironclad' ? 2.5 : 2;
      roundRect(x - s, y - s, s * 2, s * 2, 3); ctx.fill(); ctx.stroke();
      if (e.type === 'bombard' || e.type === 'warden_g' || e.type === 'trebuchet' || e.type === 'marshal') {
        const t = e.tgt ? byId(e.tgt) : null;
        const a = t ? Math.atan2(t.y - y, t.x - x) : 0;
        const reach = e.type === 'trebuchet' ? s + 11 : s + 7;
        ctx.lineWidth = (e.type === 'bombard' || e.type === 'trebuchet') ? 3 : 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * reach, y + Math.sin(a) * reach); ctx.stroke();
        if (e.type === 'trebuchet') { // throwing-arm pivot
          ctx.fillStyle = '#dfe6f0'; ctx.beginPath(); ctx.arc(x, y, s * 0.28, 0, Math.PI * 2); ctx.fill();
        } else if (e.type === 'marshal') { // rally banner
          ctx.strokeStyle = '#dfe6f0'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x, y + s * 0.4); ctx.lineTo(x, y - s - 4); ctx.stroke();
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.moveTo(x, y - s - 4); ctx.lineTo(x + s * 0.8, y - s + 1); ctx.lineTo(x, y - s * 0.4); ctx.closePath(); ctx.fill();
        }
      } else if (e.type === 'ironclad') { // riveted cross plating
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - s * 0.6, y); ctx.lineTo(x + s * 0.6, y);
        ctx.moveTo(x, y - s * 0.6); ctx.lineTo(x, y + s * 0.6); ctx.stroke();
      } else if (e.type === 'pikeman' || e.type === 'halberd') { // forward polearm
        ctx.strokeStyle = '#dfe6f0'; ctx.lineWidth = 2;
        const len = e.type === 'halberd' ? s + 9 : s + 5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - len); ctx.stroke();
        if (e.type === 'halberd') { // axe head on the haft
          ctx.fillStyle = '#dfe6f0';
          ctx.beginPath(); ctx.moveTo(x, y - len); ctx.lineTo(x + s * 0.55, y - len + s * 0.5); ctx.lineTo(x, y - len + s * 0.7); ctx.closePath(); ctx.fill();
        }
      } else { ctx.fillStyle = col; ctx.fillRect(x - s * 0.4, y - s * 0.4, s * 0.8, s * 0.8); }
    }
  }

  else if (e.fac === 'ember') { // burning triangles & chevron raiders
    if (e.def.kind === 'building') {
      ctx.fillStyle = dark; ctx.strokeStyle = col; ctx.lineWidth = e.def.core ? 2.5 : 1.8;
      poly(x, y, s, 3, -Math.PI / 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd27a';
      const fl = s * (0.28 + 0.12 * Math.sin(game.t * 8 + e.id));
      ctx.beginPath(); ctx.arc(x, y - s * 0.1, fl, 0, Math.PI * 2); ctx.fill();
      if (e.type === 'totem') {
        const t = e.tgt ? byId(e.tgt) : null;
        const a = t ? Math.atan2(t.y - y, t.x - x) : game.t;
        ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 8), y + Math.sin(a) * (s + 8)); ctx.stroke();
      }
    } else {
      ctx.fillStyle = (e.type === 'warbeast' || e.type === 'cinderguard' || e.type === 'catapult') ? '#7a3410'
        : e.type === 'shaman' ? '#ffd27a' : col;
      ctx.strokeStyle = col; ctx.lineWidth = (e.type === 'cinderguard' || e.type === 'catapult') ? 2.2 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s); ctx.lineTo(x, y + s * 0.4); ctx.lineTo(x - s, y + s);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  else if (e.fac === 'verdant') { // organic blooms & leaf creatures
    if (e.def.kind === 'building') {
      const wither = e.withered;   // Necrotic husk: a dead, repairable shell
      ctx.fillStyle = wither ? '#332d20' : dark;
      ctx.strokeStyle = wither ? '#6b5a3a' : col; ctx.lineWidth = e.def.core ? 2.5 : 1.8;
      ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (wither) {
        ctx.strokeStyle = '#5a4a30'; ctx.lineWidth = 1.4;
        for (let i = 0; i < 5; i++) {
          const a = i * 1.45 + 0.4;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * s * 0.8, y + Math.sin(a) * s * 0.78); ctx.stroke();
        }
      } else if (e.type === 'erdtree') { // the massive, indestructible golden world-tree
        const pul = 0.5 + 0.5 * Math.sin(game.t * 1.2 + e.id);
        // radiant golden halo
        const grad = ctx.createRadialGradient(x, y - s * 0.2, s * 0.2, x, y - s * 0.2, s * 1.5);
        grad.addColorStop(0, 'rgba(255,226,122,' + (0.45 + 0.25 * pul).toFixed(2) + ')');
        grad.addColorStop(1, 'rgba(255,226,122,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(x, y - s * 0.2, s * 1.5, 0, Math.PI * 2); ctx.fill();
        // slow-turning light shafts
        ctx.strokeStyle = 'rgba(255,236,150,0.3)'; ctx.lineWidth = 3;
        for (let i = 0; i < 12; i++) {
          const a = i * Math.PI / 6 + game.t * 0.05;
          ctx.beginPath(); ctx.moveTo(x, y - s * 0.2);
          ctx.lineTo(x + Math.cos(a) * s * 1.4, y - s * 0.2 + Math.sin(a) * s * 1.4); ctx.stroke();
        }
        // trunk
        ctx.fillStyle = '#5a4326'; ctx.strokeStyle = '#3a2c18'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - s * 0.16, y + s * 0.95);
        ctx.lineTo(x - s * 0.10, y - s * 0.15);
        ctx.lineTo(x + s * 0.10, y - s * 0.15);
        ctx.lineTo(x + s * 0.16, y + s * 0.95);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        // layered golden canopy
        for (let i = 0; i < 5; i++) {
          const ry = y - s * 0.2 - i * s * 0.16;
          const rr = s * (0.95 - i * 0.13);
          ctx.fillStyle = i % 2 ? '#7bbf4a' : '#c8e87a';
          ctx.beginPath(); ctx.arc(x, ry, rr, 0, Math.PI * 2); ctx.fill();
        }
        // glowing crown
        ctx.fillStyle = '#ffe27a';
        ctx.beginPath(); ctx.arc(x, y - s * 0.95, s * 0.28 * (0.9 + 0.2 * pul), 0, Math.PI * 2); ctx.fill();
      } else if (e.type === 'erdwall') { // chunky golden root-wall block
        ctx.fillStyle = '#4a3a1e'; ctx.strokeStyle = '#d8b24a'; ctx.lineWidth = 2.5;
        roundRect(x - s, y - s, s * 2, s * 2, 4); ctx.fill(); ctx.stroke();
        // interlocking root grain
        ctx.strokeStyle = '#caa44a'; ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x - s * 0.6, y - s * 0.5); ctx.lineTo(x + s * 0.6, y - s * 0.5);
        ctx.moveTo(x - s * 0.6, y + s * 0.1); ctx.lineTo(x + s * 0.6, y + s * 0.1);
        ctx.moveTo(x - s * 0.6, y + s * 0.6); ctx.lineTo(x + s * 0.6, y + s * 0.6); ctx.stroke();
      } else if (e.type === 'bloom') {
        ctx.fillStyle = '#b8f0a0';
        for (let i = 0; i < 6; i++) {
          const a = game.t * 0.3 + i * Math.PI / 3;
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6, s * 0.26, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(x, y, s * 0.3, 0, Math.PI * 2); ctx.fill();
      } else if (e.type === 'heart' || e.type === 'grove') {
        ctx.strokeStyle = '#b8f0a0'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, s * 0.6, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, s * 0.3, 0, Math.PI * 2); ctx.stroke();
      } else if (e.type === 'bramble') {
        const t = e.tgt ? byId(e.tgt) : null;
        const a = t ? Math.atan2(t.y - y, t.x - x) : game.t * 0.6;
        ctx.strokeStyle = '#b8f0a0'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 9), y + Math.sin(a) * (s + 9)); ctx.stroke();
      } else if (e.type === 'petalspire') { // pollen sacs on a spire
        ctx.fillStyle = '#ffe27a';
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i - 2) * 0.5;
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, s * 0.22, 0, Math.PI * 2); ctx.fill();
        }
      } else if (e.type === 'mulchbed') { // dark loamy mound with fungus dots
        ctx.fillStyle = '#caa46a';
        for (let i = 0; i < 5; i++) {
          const a = game.t * 0.1 + i * 1.3;
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.45, s * 0.16, 0, Math.PI * 2); ctx.fill();
        }
      } else if (e.type === 'sporevent') { // venting spore puffs
        ctx.fillStyle = 'rgba(160,224,140,0.5)';
        for (let i = 0; i < 4; i++) {
          const ph = (game.t * 0.8 + i * 0.7) % 1;
          ctx.beginPath(); ctx.arc(x, y - s * 0.2 - ph * s * 0.9, s * (0.18 + ph * 0.22), 0, Math.PI * 2); ctx.fill();
        }
      } else if (e.type === 'thornwall' || e.type === 'greatroot') { // rooted spiky barricade
        const n = e.type === 'greatroot' ? 9 : 6;
        ctx.fillStyle = '#2f6b2a'; ctx.strokeStyle = '#b8f0a0'; ctx.lineWidth = e.type === 'greatroot' ? 2.4 : 1.6;
        for (let i = 0; i < n; i++) {
          const a = i * Math.PI * 2 / n + 0.2;
          ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.5);
          ctx.lineTo(x + Math.cos(a) * (s + (e.type === 'greatroot' ? 9 : 6)), y + Math.sin(a) * (s + (e.type === 'greatroot' ? 9 : 6))); ctx.stroke();
        }
        if (e.type === 'greatroot') { ctx.strokeStyle = '#3f8a36'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, s * 0.62, 0, Math.PI * 2); ctx.stroke(); }
      } else if (e.type === 'heartsap') { // a young Heartwood — twin rings + saplings
        ctx.strokeStyle = '#b8f0a0'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, s * 0.62, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, s * 0.34, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(x, y, s * 0.16, 0, Math.PI * 2); ctx.fill();
      } else if (e.type === 'fertpod') { // pulsing nutrient field
        const ph = (game.t * 0.6) % 1;
        ctx.strokeStyle = 'rgba(184,240,160,' + (0.55 * (1 - ph)).toFixed(2) + ')'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, s * 0.5 + ph * s * 1.4, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#caa46a'; ctx.beginPath(); ctx.arc(x, y, s * 0.32, 0, Math.PI * 2); ctx.fill();
      } else if (e.type === 'sporebloss') { // a vast drifting slow-cloud
        ctx.fillStyle = 'rgba(150,210,140,0.16)';
        ctx.beginPath(); ctx.arc(x, y, s * 0.9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#9fe06a';
        for (let i = 0; i < 7; i++) {
          const a = game.t * 0.25 + i * (Math.PI * 2 / 7);
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, s * 0.16, 0, Math.PI * 2); ctx.fill();
        }
      } else if (e.def.graft) { // Heartwood Graft — a glowing rune-sigil
        const gc = e.def.graft === 'necro' ? '#9b7ad6' : e.def.graft === 'moon' ? '#bfe0ff' : '#ffe27a';
        ctx.strokeStyle = gc; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, s * 0.6, 0, Math.PI * 2); ctx.stroke();
        const pul = 0.5 + 0.5 * Math.sin(game.t * 2 + e.id);
        ctx.fillStyle = gc; ctx.globalAlpha = 0.5 + 0.5 * pul;
        ctx.beginPath(); ctx.arc(x, y, s * 0.26, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else {
      const mut = e.mutated;   // Wildgrowth mutated Sapling
      const heavy = e.type === 'treant' || e.type === 'bramblehorn';
      ctx.fillStyle = mut ? '#46871f' : (heavy ? '#2f6b2a' : col);
      ctx.strokeStyle = mut ? '#d6ff8a' : '#2f6b2a'; ctx.lineWidth = mut || heavy ? 1.8 : 1.3;
      ctx.beginPath();
      ctx.moveTo(x, y - s - 1); ctx.quadraticCurveTo(x + s, y, x, y + s + 1); ctx.quadraticCurveTo(x - s, y, x, y - s - 1);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      if (mut) { ctx.fillStyle = '#d6ff8a'; ctx.beginPath(); ctx.arc(x, y, s * 0.28, 0, Math.PI * 2); ctx.fill(); }
      if (e.type === 'bramblehorn') { // wreath of thorns around the beast
        ctx.strokeStyle = '#d6ff8a'; ctx.lineWidth = 1.6;
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4 + 0.2;
          ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6);
          ctx.lineTo(x + Math.cos(a) * (s + 5), y + Math.sin(a) * (s + 5)); ctx.stroke();
        }
      } else if (e.type === 'sporecaller') { // glowing spore sac
        ctx.fillStyle = '#cdb6ff';
        ctx.beginPath(); ctx.arc(x, y - s * 0.1, s * 0.34, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  else if (e.fac === 'stormforge') { // octagonal machines & energised diamonds
    if (e.def.kind === 'building') {
      ctx.fillStyle = dark; ctx.strokeStyle = col; ctx.lineWidth = e.def.core ? 2.5 : 1.8;
      poly(x, y, s, 8, Math.PI / 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffb3d9';
      ctx.beginPath(); ctx.arc(x, y, s * (0.24 + 0.08 * Math.sin(game.t * 5 + e.id)), 0, Math.PI * 2); ctx.fill();
      if (e.type === 'dynamo') {
        ctx.strokeStyle = '#ffb3d9'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(x, y, s * 0.62, game.t % (Math.PI * 2), game.t % (Math.PI * 2) + Math.PI * 1.3); ctx.stroke();
      } else if (e.type === 'pylon') { // expanding charge field that re-energises shields
        const ph = (game.t * 0.7) % 1;
        ctx.strokeStyle = 'rgba(255,156,203,' + (0.6 * (1 - ph)).toFixed(2) + ')'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, s * 0.5 + ph * s * 1.3, 0, Math.PI * 2); ctx.stroke();
      }
    } else {
      ctx.fillStyle = e.type === 'colossus' ? '#5a153f' : dark;
      ctx.strokeStyle = col; ctx.lineWidth = e.type === 'colossus' ? 2.5 : 1.5;
      ctx.beginPath(); ctx.moveTo(x, y - s - 2); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s + 2); ctx.lineTo(x - s, y); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffb3d9'; ctx.beginPath(); ctx.arc(x, y, s * 0.3, 0, Math.PI * 2); ctx.fill();
      if (e.shield > 1) {
        const frac = e.shield / e.shieldMax;
        ctx.strokeStyle = '#ff9ccb'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, s + 5, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
      }
    }
  }

  else if (e.fac === 'pact') { // dark pentagons & gaunt crimson triangles
    if (e.def.kind === 'building') {
      ctx.fillStyle = dark; ctx.strokeStyle = col; ctx.lineWidth = e.def.core ? 2.5 : 1.8;
      poly(x, y, s, 5, -Math.PI / 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ff6b73'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, s * 0.55, 0, Math.PI * 2); ctx.stroke();
      if (e.type === 'altar' || e.type === 'spike') {
        const t = e.tgt ? byId(e.tgt) : null;
        const a = t ? Math.atan2(t.y - y, t.x - x) : -Math.PI / 2;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 8), y + Math.sin(a) * (s + 8)); ctx.stroke();
      }
    } else {
      ctx.fillStyle = e.type === 'behemoth' ? '#5a0e14' : col;
      ctx.strokeStyle = '#ff6b73'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x, y - s - 1); ctx.lineTo(x + s, y + s); ctx.lineTo(x - s, y + s); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
  }

  else { // exodus: diamonds
    ctx.fillStyle = e.type === 'ark' ? '#4a3a14' : e.type === 'collector' ? '#2e5a52' : '#705a1e';
    ctx.strokeStyle = col; ctx.lineWidth = e.type === 'ark' ? 2.5 : 1.5;
    ctx.beginPath(); ctx.moveTo(x, y - s - 2); ctx.lineTo(x + s + 2, y); ctx.lineTo(x, y + s + 2); ctx.lineTo(x - s - 2, y); ctx.closePath();
    ctx.fill(); ctx.stroke();
    if (e.type === 'collector') {
      // glows cyan while hauling crystal back to the Ark
      ctx.fillStyle = e.order.type === 'harvest' && e.order.carry > 0 ? '#6ee7ff' : '#9ff0e2';
      ctx.beginPath(); ctx.arc(x, y, s * 0.4, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === 'ark') {
      const tier = (game.players[e.fac] && game.players[e.fac].arkTier) || 0;
      // inner diamond
      ctx.strokeStyle = '#ffe3a3'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y - s * 0.5); ctx.lineTo(x + s * 0.5, y); ctx.lineTo(x, y + s * 0.5); ctx.lineTo(x - s * 0.5, y); ctx.closePath(); ctx.stroke();
      // each upgrade tier layers on more: a second hull ring, radiant spokes, a halo
      if (tier >= 1) {
        ctx.strokeStyle = 'rgba(255,217,125,0.8)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y - s * 0.78); ctx.lineTo(x + s * 0.78, y); ctx.lineTo(x, y + s * 0.78); ctx.lineTo(x - s * 0.78, y); ctx.closePath(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,231,160,' + (0.4 + 0.25 * Math.sin(game.t * 3 + e.id)) + ')';
        ctx.beginPath(); ctx.arc(x, y, s * (0.18 + 0.05 * tier), 0, Math.PI * 2); ctx.fill();
      }
      if (tier >= 2) {
        ctx.strokeStyle = '#ffe3a3'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
          const a2 = i * Math.PI / 2 + Math.PI / 4;
          ctx.beginPath(); ctx.moveTo(x + Math.cos(a2) * s * 0.5, y + Math.sin(a2) * s * 0.5);
          ctx.lineTo(x + Math.cos(a2) * (s + 8), y + Math.sin(a2) * (s + 8)); ctx.stroke();
        }
      }
      if (tier >= 3) {
        ctx.globalAlpha = 0.35 + 0.3 * Math.sin(game.t * 3);
        ctx.strokeStyle = '#ffe9b0'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, s + 7, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // the superweapon tiers (4+): a slowly-rotating ring of solar spokes, a hot core
      // glow, and at the apex a full corona — the Ark reads as a walking sun
      if (tier >= 4) {
        const spokes = 8 + (tier - 4) * 2, rot = game.t * (0.3 + 0.12 * (tier - 4));
        ctx.strokeStyle = 'rgba(255,210,120,0.9)'; ctx.lineWidth = 2;
        for (let i = 0; i < spokes; i++) {
          const a2 = rot + i * Math.PI * 2 / spokes;
          const r1 = s + 9, r2 = s + 9 + (8 + (tier - 4) * 5) * (0.6 + 0.4 * Math.sin(game.t * 4 + i));
          ctx.beginPath(); ctx.moveTo(x + Math.cos(a2) * r1, y + Math.sin(a2) * r1);
          ctx.lineTo(x + Math.cos(a2) * r2, y + Math.sin(a2) * r2); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,244,210,' + (0.5 + 0.3 * Math.sin(game.t * 5)) + ')';
        ctx.beginPath(); ctx.arc(x, y, s * (0.3 + 0.06 * (tier - 3)), 0, Math.PI * 2); ctx.fill();
      }
      if (tier >= 7) { // apotheosis: a radiant corona halo
        ctx.globalAlpha = 0.18 + 0.12 * Math.sin(game.t * 2.5);
        ctx.fillStyle = '#ffe9b0';
        ctx.beginPath(); ctx.arc(x, y, s * 1.7, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (e.deployed) {
        ctx.strokeStyle = 'rgba(255,217,125,' + (0.5 + 0.3 * Math.sin(game.t * 4)) + ')';
        ctx.beginPath(); ctx.arc(x, y, s + 10, 0, Math.PI * 2); ctx.stroke();
      }
      // point-defence gun ring — grows from 4 to 8 barrels as the Ark ascends, each
      // tracking its own target (mirrors the apex machine-gun ring)
      const guns = auxGunsOf(e), auxT = e.auxTgt || [];
      for (let i = 0; i < guns; i++) {
        const ga = i * Math.PI * 2 / guns + Math.PI / guns;
        const gx = x + Math.cos(ga) * s * 0.82, gy = y + Math.sin(ga) * s * 0.82;
        ctx.fillStyle = '#4a3a14'; ctx.strokeStyle = '#ffe3a3'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(gx, gy, Math.max(2.4, s * 0.13), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        const gt = auxT[i] ? byId(auxT[i]) : null;
        const ba = gt ? Math.atan2(gt.y - gy, gt.x - gx) : ga;
        ctx.strokeStyle = '#ffe3a3'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(ba) * s * 0.3, gy + Math.sin(ba) * s * 0.3); ctx.stroke();
      }
    } else if (e.type === 'guardian') {
      ctx.strokeStyle = 'rgba(125,213,255,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, e.def.aura, 0, Math.PI * 2); ctx.stroke();
    } else if (e.type === 'templar') {
      ctx.strokeStyle = '#ffe3a3'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, s * 0.45, 0, Math.PI * 2); ctx.stroke();
    } else if (e.type === 'phoenix') {
      ctx.strokeStyle = '#ffe3a3'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - s * 0.9, y + s * 0.3); ctx.lineTo(x, y - s * 0.4); ctx.lineTo(x + s * 0.9, y + s * 0.3); ctx.stroke();
    }
    // shield arc
    if (e.shield > 1) {
      const frac = e.shield / e.shieldMax;
      ctx.strokeStyle = '#7dd5ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, s + 6, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
    }
  }

  // apex marker: a pulsing aura ring, plus tracking gun-turret nubs for any unit
  // carrying a machine-gun ring (Leviathan, Sovereign, Warlord, Ash Titan, Storm Titan)
  if (e.def.apex && !e.constructing && !e.growing) {
    ctx.globalAlpha = 0.45 + 0.3 * Math.sin(game.t * 3 + e.id);
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, s + 6, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    if (e.def.aux) {
      const guns = e.def.aux.guns || 1, auxT = e.auxTgt || [];
      for (let i = 0; i < guns; i++) {
        const ga = i * Math.PI * 2 / guns + Math.PI / guns;
        const gx = x + Math.cos(ga) * s * 0.78, gy = y + Math.sin(ga) * s * 0.78;
        ctx.fillStyle = dark; ctx.strokeStyle = col; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(gx, gy, s * 0.17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        const gt = auxT[i] ? byId(auxT[i]) : null;
        const ba = gt ? Math.atan2(gt.y - gy, gt.x - gx) : ga;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(ba) * s * 0.32, gy + Math.sin(ba) * s * 0.32); ctx.stroke();
      }
    }
  }

  ctx.globalAlpha = 1;

  // hp bar (suppressed for finished indestructible structures — HP is meaningless)
  if ((sel || e.hp < e.hpMax || e.constructing || e.growing) && !(e.def.invuln && !e.constructing && !e.growing)) {
    const w = Math.max(20, s * 2), hpf = clamp(e.hp / e.hpMax, 0, 1);
    const by = y - s - 10;
    ctx.fillStyle = '#000a'; ctx.fillRect(x - w / 2, by, w, 4);
    ctx.fillStyle = hpf > 0.5 ? '#5fd068' : hpf > 0.25 ? '#e0b84d' : '#e05b4d';
    ctx.fillRect(x - w / 2, by, w * hpf, 4);
  }

  // Verdant Heartwood Graft indicators — a coloured pip per standing Graft that
  // empowers this unit (Necrotic purple, Moonsign blue, Wildgrowth gold), matching
  // the Graft sigil colours. Grafts are faction-wide, so the whole army shows them.
  if (e.def.kind === 'unit' && e.fac === 'verdant') {
    const vp = game.players.verdant;
    if (vp && (vp.gNecro || vp.gMoon || vp.gWild)) {
      const cols = [];
      if (vp.gNecro) cols.push('#9b7ad6');
      if (vp.gMoon) cols.push('#bfe0ff');
      if (vp.gWild) cols.push('#ffe27a');
      const gap = 4.5, py = y - s - 4;
      let px = x - (cols.length - 1) * gap / 2;
      for (const c of cols) {
        ctx.fillStyle = c; ctx.strokeStyle = '#0009'; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.arc(px, py, 1.9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        px += gap;
      }
    }
  }

  ctx.restore();
}

function poly(x, y, r, n, rot) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + i * Math.PI * 2 / n;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawMinimap() {
  const sx = mmCanvas.width / WORLD_W, sy = mmCanvas.height / WORLD_H;
  mmCtx.fillStyle = '#0d1117';
  mmCtx.fillRect(0, 0, mmCanvas.width, mmCanvas.height);
  // creep
  mmCtx.fillStyle = '#4a1d5c';
  for (let ty = 0; ty < GH; ty++)
    for (let tx = 0; tx < GW; tx++)
      if (game.creep[ty * GW + tx]) mmCtx.fillRect(tx * TILE * sx, ty * TILE * sy, TILE * sx + 1, TILE * sy + 1);
  // impassable terrain
  if (game.obstacles) {
    mmCtx.fillStyle = '#3a4757';
    for (const ob of game.obstacles) mmCtx.fillRect(ob.x * sx - 1.5, ob.y * sy - 1.5, 3, 3);
  }
  // nodes (only ones you've discovered)
  mmCtx.fillStyle = '#6ee7ff';
  for (const n of game.nodes) if (tileExplored(n.x, n.y)) mmCtx.fillRect(n.x * sx - 1.5, n.y * sy - 1.5, 3, 3);
  // entities (Obelisks show their captor's colour) — enemies hidden by fog of war
  for (const e of game.entities) {
    if (e.dead || !visibleEnt(e)) continue;
    mmCtx.fillStyle = facColor(e.owner || e.fac);
    const r = e.def.core ? 3 : e.def.kind === 'building' ? 2 : 1.2;
    mmCtx.fillRect(e.x * sx - r, e.y * sy - r, r * 2, r * 2);
  }
  // fog of war veil over the minimap (horizontal runs merged, like the main view)
  if (game.vis && !fogRevealed()) {
    for (let ty = 0; ty < GH; ty++) {
      let runStart = 0, runStyle = null;
      for (let tx = 0; tx <= GW; tx++) {
        const style = tx < GW && !game.vis[ty * GW + tx]
          ? (game.explored[ty * GW + tx] ? 'rgba(10,13,19,0.5)' : 'rgba(7,9,13,0.92)') : null;
        if (style !== runStyle) {
          if (runStyle) { mmCtx.fillStyle = runStyle; mmCtx.fillRect(runStart * TILE * sx, ty * TILE * sy, (tx - runStart) * TILE * sx + 1, TILE * sy + 1); }
          runStyle = style; runStart = tx;
        }
      }
    }
  }
  // radar contacts — imprecise enemy blips, drawn OVER the fog veil so they show through it
  if (radarContacts.length) {
    const pulse = 0.4 + 0.6 * Math.abs(Math.sin(game.t * 3));
    mmCtx.fillStyle = 'rgba(255,90,90,' + (0.45 + 0.4 * pulse).toFixed(2) + ')';
    for (const c of radarContacts) mmCtx.fillRect(c.x * sx - 1.6, c.y * sy - 1.6, 3.2, 3.2);
  }
  // camera
  mmCtx.strokeStyle = '#cdd6e4'; mmCtx.lineWidth = 1;
  mmCtx.strokeRect(game.cam.x * sx, game.cam.y * sy, viewW() * sx, viewH() * sy);
}

