// ---------------- navigation / pathfinding ----------------
// The host (or single-player) simulation is authoritative — guests only
// interpolate snapshots — so pathfinding lives entirely here and never has to
// be deterministic across machines. We keep a coarse occupancy grid of every
// building, resource node and terrain obstacle, rebuilt only when something
// changes (game.navDirty) or on a slow safety timer, then run A* on demand with
// a per-frame budget and a straight-line fast path for the common open case.

const NAV_CELL = 32;            // grid resolution (one map tile)
const NAV_MARGIN = 6;           // extra clearance baked around every blocker (px)
const PATH_BUDGET = 80;         // max A* searches per simulation frame
const PATH_MAX_ITER = 5000;     // node-expansions before A* gives up (unreachable)
const SQRT2 = Math.SQRT2;
// 8-neighbour offsets as flat arrays (was an array-of-arrays walked with
// `for (const [dx,dy,cost] of NB)` — the per-node destructuring is a real cost in
// the A* inner loop, which runs millions of times a frame in a big fight).
const NB_DX = [1, -1, 0, 0, 1, 1, -1, -1];
const NB_DY = [0, 0, 1, -1, 1, -1, 1, -1];
const NB_COST = [1, 1, 1, 1, SQRT2, SQRT2, SQRT2, SQRT2];

// (re)build the occupancy grid when the world has changed
function navGrid() {
  if (!game.nav || game.navDirty || game.t - (game.navBuilt || -9) > 1.5) buildNavGrid();
  return game.nav;
}

function buildNavGrid() {
  const w = Math.ceil(WORLD_W / NAV_CELL), h = Math.ceil(WORLD_H / NAV_CELL);
  const blocked = new Uint8Array(w * h);
  const mark = (bx, by, r) => {
    const rr = r + NAV_MARGIN;
    const c0 = Math.max(0, Math.floor((bx - rr) / NAV_CELL));
    const c1 = Math.min(w - 1, Math.floor((bx + rr) / NAV_CELL));
    const r0 = Math.max(0, Math.floor((by - rr) / NAV_CELL));
    const r1 = Math.min(h - 1, Math.floor((by + rr) / NAV_CELL));
    for (let cy = r0; cy <= r1; cy++)
      for (let cx = c0; cx <= c1; cx++) {
        const px = cx * NAV_CELL + NAV_CELL / 2, py = cy * NAV_CELL + NAV_CELL / 2;
        if (Math.hypot(px - bx, py - by) < rr) blocked[cy * w + cx] = 1;
      }
  };
  for (const e of game.entities)
    if (!e.dead && e.def.kind === 'building') mark(e.x, e.y, e.size);
  for (const o of game.obstacles) mark(o.x, o.y, o.r);
  for (const n of game.nodes) if (n.amount > 0) mark(n.x, n.y, Math.max(4, n.r - 4));
  game.nav = { w, h, blocked };
  game.navDirty = false;
  game.navBuilt = game.t;
}

function navCellFree(g, cx, cy) {
  return cx >= 0 && cy >= 0 && cx < g.w && cy < g.h && !g.blocked[cy * g.w + cx];
}

// spiral outward from a (possibly blocked) cell to the closest free one
function nearestFreeCell(g, cx, cy) {
  if (navCellFree(g, cx, cy)) return [cx, cy];
  for (let r = 1; r < 30; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (navCellFree(g, cx + dx, cy + dy)) return [cx + dx, cy + dy];
      }
  return null;
}

// is the straight segment clear of blockers? (endpoints ignored, so a unit
// standing in a building's clearance ring can still see out of it)
function lineClear(x0, y0, x1, y1) {
  const g = navGrid();
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  if (len < 1) return true;
  const steps = Math.ceil(len / (NAV_CELL * 0.75));
  for (let i = 1; i < steps; i++) {
    const x = x0 + dx * i / steps, y = y0 + dy * i / steps;
    if (!navCellFree(g, Math.floor(x / NAV_CELL), Math.floor(y / NAV_CELL))) return false;
  }
  return true;
}

// greedily drop intermediate waypoints we have line-of-sight past
function smoothPath(pts) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !lineClear(pts[i].x, pts[i].y, pts[j].x, pts[j].y)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

// Reusable A* scratch buffers. Allocating three N-sized typed arrays on EVERY
// findPath call (dozens of times a frame in a big fight) churned tens of MB/s of
// garbage — the GC pauses that produced were the host's worst mid-battle frame
// spikes (and so the multiplayer guest's freezes). Instead we keep the buffers
// and stamp each cell with the id of the search that last wrote it: a stale stamp
// reads as "untouched", so nothing has to be cleared between searches.
let navScratch = null;
function navScratchFor(N) {
  if (!navScratch || navScratch.N !== N) {
    navScratch = { N, gScore: new Float32Array(N), came: new Int32Array(N),
      gStamp: new Int32Array(N), cStamp: new Int32Array(N), gen: 0 };
  }
  return navScratch;
}

// A* on the occupancy grid → array of world-space waypoints, or null if there
// is no route (or the search blew its budget). 8-directional, no corner-cutting.
function findPath(sx, sy, gx, gy) {
  const g = navGrid();
  const s = nearestFreeCell(g, Math.floor(sx / NAV_CELL), Math.floor(sy / NAV_CELL));
  const t = nearestFreeCell(g, Math.floor(gx / NAV_CELL), Math.floor(gy / NAV_CELL));
  if (!s || !t) return null;
  const [scx, scy] = s, [gcx, gcy] = t;
  if (scx === gcx && scy === gcy) return null;     // already in the goal cell
  const w = g.w, h = g.h, N = w * h, blk = g.blocked;
  const startI = scy * w + scx, goalI = gcy * w + gcx;
  const sc = navScratchFor(N), gen = ++sc.gen;
  const gScore = sc.gScore, came = sc.came, gStamp = sc.gStamp, cStamp = sc.cStamp;
  // gScore[i] counts only when stamped with THIS search's gen; else it's Infinity
  const gAt = i => gStamp[i] === gen ? gScore[i] : Infinity;
  const hC = (cx, cy) => { const dx = Math.abs(cx - gcx), dy = Math.abs(cy - gcy); return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy); };
  // binary min-heap keyed on fScore
  const hi = [], hf = [];
  const swap = (a, b) => { const ti = hi[a]; hi[a] = hi[b]; hi[b] = ti; const tf = hf[a]; hf[a] = hf[b]; hf[b] = tf; };
  const push = (idx, f) => {
    hi.push(idx); hf.push(f);
    let c = hi.length - 1;
    while (c > 0) { const p = (c - 1) >> 1; if (hf[p] <= hf[c]) break; swap(p, c); c = p; }
  };
  const pop = () => {
    const top = hi[0], n = hi.length - 1;
    hi[0] = hi[n]; hf[0] = hf[n]; hi.pop(); hf.pop();
    let c = 0;
    while (true) {
      let l = c * 2 + 1, r = l + 1, m = c;
      if (l < hi.length && hf[l] < hf[m]) m = l;
      if (r < hi.length && hf[r] < hf[m]) m = r;
      if (m === c) break; swap(m, c); c = m;
    }
    return top;
  };
  gScore[startI] = 0; gStamp[startI] = gen; push(startI, hC(scx, scy));
  let iter = 0;
  while (hi.length) {
    if (++iter > PATH_MAX_ITER) return null;
    const cur = pop();
    if (cur === goalI) break;
    if (cStamp[cur] === gen) continue;
    cStamp[cur] = gen;
    const cx = cur % w, cy = (cur / w) | 0, cg = gScore[cur];
    for (let k = 0; k < 8; k++) {
      const dx = NB_DX[k], dy = NB_DY[k];
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (blk[ni] || cStamp[ni] === gen) continue;
      // no diagonal squeeze between two blocked orthogonal cells
      if (dx && dy && (blk[cy * w + nx] || blk[ny * w + cx])) continue;
      const ng = cg + NB_COST[k];
      if (ng < gAt(ni)) { gScore[ni] = ng; gStamp[ni] = gen; came[ni] = cur; push(ni, ng + hC(nx, ny)); }
    }
  }
  // goalI was reached only if it got stamped this search (came[] is reused, so a
  // stale value there is meaningless without the matching stamp)
  if (gStamp[goalI] !== gen && goalI !== startI) return null;
  // reconstruct (cell centres), dropping the start cell — we use the real start
  const cells = [];
  for (let c = goalI; c !== startI && c !== -1; c = came[c]) cells.push(c);
  cells.reverse();
  const pts = [{ x: sx, y: sy }];
  for (const c of cells) pts.push({ x: (c % w) * NAV_CELL + NAV_CELL / 2, y: ((c / w) | 0) * NAV_CELL + NAV_CELL / 2 });
  pts.push({ x: gx, y: gy });          // exact destination as the final waypoint
  return smoothPath(pts);
}

// move e toward (gx,gy) this frame, routing around blockers. Caches the path on
// the entity and only re-plans when the goal drifts or the route runs out.
// Returns true once the destination is reached. Falls back to a straight step
// when the route is clear, the path budget is spent, or no path exists.
function navMove(e, gx, gy, dt) {
  const dx = gx - e.x, dy = gy - e.y;
  if (dx * dx + dy * dy < 9) { e.path = null; return true; }
  if (lineClear(e.x, e.y, gx, gy)) { e.path = null; e.pathGoal = null; return moveToward(e, gx, gy, dt); }

  const stale = !e.path || e.pathIdx >= e.path.length || !e.pathGoal
    || (((e.pathGoal.x - gx) ** 2 + (e.pathGoal.y - gy) ** 2 > NAV_CELL * NAV_CELL)
        && game.t - (e.pathT || 0) > 0.25);
  if (stale) {
    if (game.pathCalls >= PATH_BUDGET) return moveToward(e, gx, gy, dt);
    game.pathCalls++;
    e.path = findPath(e.x, e.y, gx, gy);
    e.pathGoal = { x: gx, y: gy }; e.pathT = game.t; e.pathIdx = 0;
    if (!e.path) return moveToward(e, gx, gy, dt);
  }
  // skip ahead to the furthest waypoint we can already see
  while (e.pathIdx < e.path.length - 1 && lineClear(e.x, e.y, e.path[e.pathIdx + 1].x, e.path[e.pathIdx + 1].y)) e.pathIdx++;
  const wp = e.path[e.pathIdx];
  if (!wp) { e.path = null; return moveToward(e, gx, gy, dt); }
  if (moveToward(e, wp.x, wp.y, dt)) { e.pathIdx++; if (e.pathIdx >= e.path.length) e.path = null; }
  return false;
}
