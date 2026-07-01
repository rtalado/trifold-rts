// ---------------- global state ----------------
let game = null;
let nextId = 1;
let lastFrame = 0;

// ---------------- persisted settings ----------------
// Saved to localStorage so they survive across sessions. Wired into the
// camera (input.js) and the FPS readout (loop.js); surfaced in the Settings
// panel reachable from the main menu and the in-game pause menu.
const SETTINGS = (() => {
  const def = { edgePan: true, panSpeed: 1.0, showFps: false, musicVol: 0.5, sfxVol: 0.5 };
  try { return Object.assign(def, JSON.parse(localStorage.getItem('trifold.settings') || '{}')); }
  catch (e) { return def; }
})();
function saveSettings() {
  try { localStorage.setItem('trifold.settings', JSON.stringify(SETTINGS)); } catch (e) {}
}

// ---------------- soundtrack ----------------
// One looping <audio> element. Browsers block autoplay until the first user
// gesture, so we apply the saved volume up front and kick off playback on the
// first interaction (see startMusic). Volume 0 just leaves it silent/paused.
const bgm = document.getElementById('bgm');
function applyMusicVol() {
  if (!bgm) return;
  bgm.volume = clamp(+SETTINGS.musicVol || 0, 0, 1);
  if (bgm.volume === 0) bgm.pause();
  else startMusic();
}
function startMusic() {
  if (!bgm || bgm.volume === 0) return;
  const p = bgm.play();
  if (p && p.catch) p.catch(() => {}); // ignore autoplay rejection; retried on next gesture
}
// Unlock audio on the first user gesture, then keep nudging playback on later
// gestures in case the very first attempt was blocked.
addEventListener('pointerdown', startMusic);
addEventListener('keydown', startMusic);

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const mmCanvas = document.getElementById('minimap');
const mmCtx = mmCanvas.getContext('2d');

function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
addEventListener('resize', resize); resize();

// ---------------- helpers ----------------
// Looking a unit up by id is done constantly — every projectile and every
// engaged unit resolves its target by id EVERY frame. A linear .find() made
// that O(n) per call ⇒ O(n²) per frame in a big fight. The simulating side
// (SP/host) keeps a live id→entity index (rebuilt each tick in update(), and
// kept fresh by spawnEnt), so this is O(1) there; guests have no index and fall
// back to the scan (they don't simulate, so they barely call this).
const byId = id => {
  const idx = game._idx;
  if (idx) { const e = idx.get(id); return (e && !e.dead) ? e : undefined; }
  return game.entities.find(e => e.id === id && !e.dead);
};
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
// the local player's idle workers/harvesters. Guests don't simulate orders, so they
// read the idle bit the host syncs per snapshot (e.isIdle) instead of e.order.
function idleHarvesters() {
  return ents(e => e.fac === game.localFac && e.def.harvester
    && (game.mode === 'guest' ? e.isIdle : e.order.type === 'idle'));
}

