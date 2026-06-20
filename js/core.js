// ---------------- global state ----------------
let game = null;
let nextId = 1;
let lastFrame = 0;

// ---------------- persisted settings ----------------
// Saved to localStorage so they survive across sessions. Wired into the
// camera (input.js) and the FPS readout (loop.js); surfaced in the Settings
// panel reachable from the main menu and the in-game pause menu.
const SETTINGS = (() => {
  const def = { edgePan: true, panSpeed: 1.0, showFps: false };
  try { return Object.assign(def, JSON.parse(localStorage.getItem('trifold.settings') || '{}')); }
  catch (e) { return def; }
})();
function saveSettings() {
  try { localStorage.setItem('trifold.settings', JSON.stringify(SETTINGS)); } catch (e) {}
}

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const mmCanvas = document.getElementById('minimap');
const mmCtx = mmCanvas.getContext('2d');

function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
addEventListener('resize', resize); resize();

// ---------------- helpers ----------------
const byId = id => game.entities.find(e => e.id === id && !e.dead);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const tileIdx = (x, y) => {
  const tx = clamp(Math.floor(x / TILE), 0, GW - 1), ty = clamp(Math.floor(y / TILE), 0, GH - 1);
  return ty * GW + tx;
};
const facIdx = fac => Object.keys(FACTIONS).indexOf(fac) + 1;
const onCreep = (fac, x, y) => game.creep[tileIdx(x, y)] === facIdx(fac);

function ents(filter) { return game.entities.filter(e => !e.dead && filter(e)); }
// `freeUnit` swarm (Verdant Saplings) keep their own separate cap (see freeCapOf),
// so they never count against — or get blocked by — the faction's main unit cap.
function countUnits(fac) { return game.entities.reduce((n, e) => n + (!e.dead && e.fac === fac && e.def.kind === 'unit' && !e.def.freeUnit ? 1 : 0), 0); }
function armyOf(fac) { return ents(e => e.fac === fac && e.def.kind === 'unit' && (e.def.dmg > 0 || e.def.aura) && !e.def.harvester && !e.def.core); }

