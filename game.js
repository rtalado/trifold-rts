'use strict';
/* ============================================================
   TRIFOLD — an asymmetric 5-faction RTS
   vanguard  : classic base-building macro faction
   myriad    : creep/territory economy, free auto-spawning swarm
   exodus    : no buildings, one mobile Ark + shielded elites
   choir     : death economy — every kill anywhere pays Essence,
               units decay but lifesteal, lattice-bound building
   syndicate : banking economy — treasury earns compound interest,
               kills pay bounties, mercs arrive instantly,
               buildings air-drop anywhere on the map
   ============================================================ */

// ---------------- constants ----------------
const TILE = 32, GW = 160, GH = 104;
const WORLD_W = GW * TILE, WORLD_H = GH * TILE;
const HUD_BOTTOM = 158; // height of #bottombar that overlaps the canvas bottom
const ZMIN = 0.32, ZMAX = 1.8;  // camera zoom range (out / in)

const FACTIONS = {
  vanguard:  { name: 'IRON VANGUARD',   color: '#4da6ff', dark: '#173153', res: 'Crystal', cap: 36 },
  myriad:    { name: 'MYRIAD SWARM',    color: '#c75cff', dark: '#3a1d52', res: 'Biomass', cap: 60 },
  exodus:    { name: 'SOLARI EXODUS',   color: '#ffc94d', dark: '#4a3a14', res: 'Energy',  cap: 18 },
  choir:     { name: 'ASHEN CHOIR',     color: '#3fe0c8', dark: '#0e3f3a', res: 'Essence', cap: 30 },
  syndicate: { name: 'GILDED SYNDICATE', color: '#ff6b52', dark: '#4a1a12', res: 'Gold',   cap: 26 },
};

// neutral entities (Obelisks, Hoards) aren't a playable faction; fall back to grey
const NEUTRAL = { color: '#9aa6b8', dark: '#2a3340' };
const facColor = f => (FACTIONS[f] || NEUTRAL).color;
const facDark  = f => (FACTIONS[f] || NEUTRAL).dark;

const HINTS = {
  vanguard: 'Workers harvest crystal automatically. Select a Worker to BUILD (Barracks → Marines/Snipers/Medics, Factory → Tanks, Airfield → Gunships, Turrets to defend). Destroy the enemy core; protect your Headquarters.',
  myriad: 'Your creep IS your economy — every covered tile feeds you biomass. Select the Hive to GROW: Tumors spread creep, Spawn Pits / Spitter Mounds / Hunter Dens breed units FREE, forever; Acid Spines defend. With the Hive selected, right-click to set the swarm rally. The swarm heals on creep.',
  exodus: 'You have no base and never will. Build Collectors from the Ark to mine crystal nodes and haul it back — that is how you scale. Move the Ark onto a node and DEPLOY to siphon energy fast too. Every warrior is priceless — shields regenerate, so strike and fall back. If the Ark dies, all is lost.',
  choir: 'ALL death feeds the Choir — every unit that falls, yours or theirs, pays you Essence. Near your lattice, spirits are sustained; in the field they fade — but heal by dealing damage. Build only within the lattice (near your structures); Soul Conduits extend it and trickle Essence. Guard the Ossuary.',
  syndicate: 'Gold breeds gold: your treasury earns compound interest (up to a cap — Countinghouses raise it and pay rent). Mercenaries arrive INSTANTLY for a price, and every kill pays a bounty. Watchposts can be air-dropped across the map — but not into enemy territory. Hoard or hire — and guard the Haven.',
};

// ---------------- unit / building definitions ----------------
// kind: 'unit' | 'building'
// shot: 'melee' | 'bullet' | 'beam' | 'glob' | 'shell'
const DEFS = {
  // ----- IRON VANGUARD -----
  hq:       { fac:'vanguard', kind:'building', name:'Headquarters', hp:1600, size:42, core:true, produces:['worker'], dropoff:true },
  worker:   { fac:'vanguard', kind:'unit', name:'Worker', hp:45, size:8, speed:75, cost:50, time:6, dmg:3, range:12, cd:1, aggro:0, shot:'melee', harvester:true, builder:true },
  barracks: { fac:'vanguard', kind:'building', name:'Barracks', hp:650, size:28, cost:150, time:18, produces:['marine','sniper','medic'] },
  factory:  { fac:'vanguard', kind:'building', name:'Factory', hp:850, size:32, cost:250, time:24, produces:['tank'] },
  airfield: { fac:'vanguard', kind:'building', name:'Airfield', hp:700, size:28, cost:300, time:22, produces:['gunship'] },
  turret:   { fac:'vanguard', kind:'building', name:'Turret', hp:420, size:14, cost:100, time:12, dmg:9, range:195, cd:0.65, aggro:215, shot:'bullet' },
  marine:   { fac:'vanguard', kind:'unit', name:'Marine', hp:75, size:8, speed:82, cost:60, time:5, dmg:8, range:95, cd:0.8, aggro:170, shot:'bullet' },
  sniper:   { fac:'vanguard', kind:'unit', name:'Sniper', hp:50, size:8, speed:65, cost:110, time:8, dmg:30, range:215, cd:2.2, aggro:235, shot:'beam' },
  medic:    { fac:'vanguard', kind:'unit', name:'Medic', hp:60, size:8, speed:80, cost:75, time:6, aggro:0, aura:110, heal:6 },
  tank:     { fac:'vanguard', kind:'unit', name:'Siege Tank', hp:280, size:14, speed:52, cost:200, time:12, dmg:34, range:165, cd:2.4, aggro:195, shot:'shell', splash:42 },
  gunship:  { fac:'vanguard', kind:'unit', name:'Gunship', hp:140, size:10, speed:120, cost:180, time:11, dmg:7, range:120, cd:0.35, aggro:200, shot:'bullet' },

  // ----- MYRIAD SWARM -----
  hive:        { fac:'myriad', kind:'building', name:'Hive', hp:2100, size:44, core:true, creepR:11, produces:['broodmother'], grows:['tumor','spawnpit','spittermound','hunterden','spine'], spawns:'drone', spawnEvery:7 },
  tumor:       { fac:'myriad', kind:'building', name:'Creep Tumor', hp:130, size:10, cost:50,  time:8,  creepR:6.5 },
  spawnpit:    { fac:'myriad', kind:'building', name:'Spawn Pit', hp:350, size:21, cost:150, time:14, spawns:'drone',   spawnEvery:5 },
  spittermound:{ fac:'myriad', kind:'building', name:'Spitter Mound', hp:380, size:21, cost:200, time:16, spawns:'spitter', spawnEvery:8.5 },
  hunterden:   { fac:'myriad', kind:'building', name:'Hunter Den', hp:400, size:21, cost:250, time:18, spawns:'hunter', spawnEvery:11 },
  spine:       { fac:'myriad', kind:'building', name:'Acid Spine', hp:360, size:13, cost:120, time:10, dmg:11, range:170, cd:0.9, aggro:190, shot:'glob' },
  drone:       { fac:'myriad', kind:'unit', name:'Drone', hp:48, size:7, speed:98, dmg:6, range:14, cd:0.7, aggro:175, shot:'melee' },
  spitter:     { fac:'myriad', kind:'unit', name:'Spitter', hp:60, size:8, speed:78, dmg:9, range:115, cd:1.1, aggro:180, shot:'glob' },
  hunter:      { fac:'myriad', kind:'unit', name:'Hunter', hp:110, size:9, speed:115, dmg:13, range:16, cd:0.8, aggro:195, shot:'melee' },
  broodmother: { fac:'myriad', kind:'unit', name:'Broodmother', hp:420, size:16, speed:55, cost:300, time:20, dmg:22, range:26, cd:1.4, aggro:185, shot:'melee', splash:38 },

  // ----- SOLARI EXODUS -----
  ark:      { fac:'exodus', kind:'unit', name:'The Ark', hp:2300, shield:900, size:38, speed:34, core:true, stationary:true, dmg:12, range:175, cd:1.0, aggro:195, shot:'beam', dropoff:true, produces:['collector','seeker','lancer','guardian','phoenix','templar'] },
  collector:{ fac:'exodus', kind:'unit', name:'Collector', hp:70, shield:30, size:8, speed:84, cost:60, time:6, aggro:0, harvester:true },
  seeker:   { fac:'exodus', kind:'unit', name:'Seeker', hp:65, shield:45, size:8, speed:112, cost:120, time:9, dmg:10, range:55, cd:0.6, aggro:205, shot:'melee', blink:true },
  lancer:   { fac:'exodus', kind:'unit', name:'Lancer', hp:70, shield:55, size:9, speed:60, cost:220, time:14, dmg:30, range:235, cd:2.1, aggro:250, shot:'beam' },
  guardian: { fac:'exodus', kind:'unit', name:'Guardian', hp:120, shield:90, size:11, speed:72, cost:180, time:12, aggro:0, aura:150 },
  phoenix:  { fac:'exodus', kind:'unit', name:'Phoenix', hp:70, shield:50, size:9, speed:125, cost:150, time:10, dmg:8, range:110, cd:0.5, aggro:210, shot:'bullet' },
  templar:  { fac:'exodus', kind:'unit', name:'Templar', hp:80, shield:70, size:10, speed:65, cost:260, time:15, dmg:24, range:140, cd:2.4, aggro:200, shot:'shell', splash:55 },

  // ----- ASHEN CHOIR -----
  ossuary:   { fac:'choir', kind:'building', name:'Ossuary', hp:1900, size:42, core:true, produces:['wraith','banshee'], grows:['conduit','reliquary','spire'] },
  conduit:   { fac:'choir', kind:'building', name:'Soul Conduit', hp:160, size:11, cost:60, time:7 },
  reliquary: { fac:'choir', kind:'building', name:'Reliquary', hp:600, size:26, cost:180, time:16, produces:['revenant'] },
  spire:     { fac:'choir', kind:'building', name:'Mourning Spire', hp:450, size:14, cost:130, time:12, dmg:12, range:185, cd:1.0, aggro:205, shot:'beam' },
  wraith:    { fac:'choir', kind:'unit', name:'Wraith', hp:95, size:8, speed:105, cost:50, time:4, dmg:9, range:16, cd:0.55, aggro:185, shot:'melee' },
  banshee:   { fac:'choir', kind:'unit', name:'Banshee', hp:75, size:8, speed:70, cost:130, time:9, dmg:15, range:150, cd:1.3, aggro:195, shot:'beam' },
  revenant:  { fac:'choir', kind:'unit', name:'Revenant', hp:380, size:14, speed:58, cost:300, time:18, dmg:30, range:30, cd:1.6, aggro:190, shot:'melee', splash:40 },

  // ----- GILDED SYNDICATE -----
  haven:         { fac:'syndicate', kind:'building', name:'The Haven', hp:1700, size:40, core:true, dmg:10, range:185, cd:0.8, aggro:205, shot:'bullet', produces:['enforcer','arbalest','juggernaut'], grows:['watchpost','countinghouse'] },
  watchpost:     { fac:'syndicate', kind:'building', name:'Watchpost', hp:380, size:13, cost:140, time:6, dmg:8, range:175, cd:0.7, aggro:195, shot:'bullet' },
  countinghouse: { fac:'syndicate', kind:'building', name:'Countinghouse', hp:500, size:24, cost:200, time:8 },
  enforcer:      { fac:'syndicate', kind:'unit', name:'Enforcer', hp:90, size:8, speed:80, cost:90, time:0.5, dmg:9, range:105, cd:0.75, aggro:180, shot:'bullet' },
  arbalest:      { fac:'syndicate', kind:'unit', name:'Arbalest', hp:60, size:8, speed:62, cost:160, time:0.5, dmg:26, range:225, cd:2.0, aggro:240, shot:'beam' },
  juggernaut:    { fac:'syndicate', kind:'unit', name:'Juggernaut', hp:320, size:14, speed:55, cost:320, time:0.5, dmg:30, range:150, cd:2.2, aggro:190, shot:'shell', splash:40 },

  // ----- NEUTRAL (capture / fight) -----
  // Obelisk: indestructible capture point — hold ground nearby to claim its income.
  obelisk:       { fac:'neutral', kind:'building', name:'Obelisk', hp:1, size:22, noTarget:true, captureR:140, captureTime:6 },
  // Hoard: a guarded treasure tower that shoots intruders; destroy it for a bounty.
  hoard:         { fac:'neutral', kind:'building', name:'Ancient Hoard', hp:1500, size:30, dmg:16, range:215, cd:1.0, aggro:240, shot:'shell', splash:34, bounty:550 },
};

// economy tuning
const ECON = {
  workerCarry: 10, workerMine: 2.0,
  myriadBase: 2.0, myriadPerTile: 0.012,
  exodusBase: 1.5, exodusSiphon: 4.5,
  // choir: trickle + a cut of every death on the map; units decay in the field
  // but are sustained near the lattice and lifesteal in combat
  choirBase: 1.8, choirConduit: 0.8, choirDeathFlat: 5, choirDeathPct: 0.06,
  choirDecay: 1.5, choirFloor: 0.35, choirSustain: 3, choirLeech: 0.7, choirLattice: 270,
  // syndicate: compound interest on the banked treasury, bounties on kills
  synBase: 2.5, synInterest: 0.011, synCapBase: 1200, synCapPer: 500,
  synHouseFlat: 0.8, synBountyFlat: 10, synBountyPct: 0.06, synDropKeepout: 340,
  // neutral capture points pay their holder a steady income
  obeliskIncome: 1.4,
};

// ---------------- global state ----------------
let game = null;
let nextId = 1;
let lastFrame = 0;

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
function countUnits(fac) { return game.entities.reduce((n, e) => n + (!e.dead && e.fac === fac && e.def.kind === 'unit' ? 1 : 0), 0); }
function armyOf(fac) { return ents(e => e.fac === fac && e.def.kind === 'unit' && (e.def.dmg > 0 || e.def.aura) && !e.def.harvester && !e.def.core); }

// ---------------- game setup ----------------
function newGame(playerFac) { // single player vs AI
  const others = Object.keys(FACTIONS).filter(f => f !== playerFac);
  const aiFac = others[Math.floor(Math.random() * others.length)];
  buildMatch(playerFac, aiFac, 'sp', playerFac);
}

// facA spawns bottom-left, facB top-right. In MP the host is facA.
// Both peers run buildMatch with identical args so initial entity ids line up.
function buildMatch(facA, facB, mode, localFac) {
  nextId = 1;
  game = {
    t: 0, over: false, entities: [], proj: [], fx: [], nodes: [],
    creep: new Uint8Array(GW * GH),
    facA, facB, aiFac: facB, localFac, mode, players: {},
    sel: [], placing: null,
    cam: { x: 0, y: 0, z: 1 },
    creepTimer: 0, hudTimer: 0, aiTimer: 0, netTimer: 0, netFx: [],
  };

  // crystal nodes (point-symmetric map) — a resource trail from each base toward the center
  const mirror = p => ({ x: WORLD_W - p.x, y: WORLD_H - p.y });
  const half = [
    { x: 640, y: 2730, amt: 1600 }, { x: 500, y: 2560, amt: 1600 },   // near base
    { x: 940, y: 2520, amt: 2000 }, { x: 700, y: 2180, amt: 2000 },   // expansions
    { x: 1220, y: 2300, amt: 2500 }, { x: 1560, y: 1900, amt: 2500 }, // mid
    { x: 1980, y: 1480, amt: 3000 },                                  // toward center
  ];
  let nid = 1;
  for (const n of half) {
    game.nodes.push({ id: nid++, x: n.x, y: n.y, amount: n.amt, max: n.amt, r: 20 });
    const m = mirror(n);
    game.nodes.push({ id: nid++, x: m.x, y: m.y, amount: n.amt, max: n.amt, r: 20 });
  }

  const bases = { a: { x: 440, y: WORLD_H - 440 }, b: { x: WORLD_W - 440, y: 440 } };
  setupFaction(facA, bases.a, false);
  setupFaction(facB, bases.b, mode === 'sp');

  // neutral sites to capture/fight over — point-symmetric so neither side is favoured
  spawnEnt('obelisk', 'neutral', WORLD_W / 2, WORLD_H / 2);  // contested centre
  const obHalf = [{ x: 1700, y: 1300 }, { x: 1300, y: 2050 }];
  const hoHalf = [{ x: 2150, y: 950 }, { x: 1050, y: 1664 }];
  for (const o of obHalf) { spawnEnt('obelisk', 'neutral', o.x, o.y); const m = mirror(o); spawnEnt('obelisk', 'neutral', m.x, m.y); }
  for (const o of hoHalf) { spawnEnt('hoard', 'neutral', o.x, o.y); const m = mirror(o); spawnEnt('hoard', 'neutral', m.x, m.y); }

  const myBase = localFac === facA ? bases.a : bases.b;
  const enemyFac = localFac === facA ? facB : facA;
  centerCam(myBase.x, myBase.y);

  document.getElementById('menu').style.display = 'none';
  document.getElementById('endscreen').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  const hint = document.getElementById('hint');
  hint.textContent = HINTS[localFac];
  hint.style.display = 'block';
  setTimeout(() => { if (game) hint.style.display = 'none'; }, 26000);
  document.getElementById('hudFac').textContent = FACTIONS[localFac].name;
  document.getElementById('hudFac').style.color = FACTIONS[localFac].color;
  document.getElementById('hudEnemy').innerHTML =
    'ENEMY: <span style="color:' + FACTIONS[enemyFac].color + '">' + FACTIONS[enemyFac].name
    + (mode === 'sp' ? '' : ' (friend)') + '</span>';
  refreshCard();
}

function setupFaction(fac, base, isAI) {
  const towardCenter = a => ({ x: base.x + (WORLD_W / 2 - base.x) * a, y: base.y + (WORLD_H / 2 - base.y) * a });
  const p = {
    res: 0, isAI, base, kills: 0,
    gainAccum: 0, income: 0,
    swarmRally: towardCenter(0.18),
    lastAttack: null, waveSize: 0,
  };
  game.players[fac] = p;

  if (fac === 'vanguard') {
    p.res = 250;
    spawnEnt('hq', fac, base.x, base.y);
    for (let i = 0; i < 4; i++) spawnEnt('worker', fac, base.x - 60 + i * 36, base.y + 70);
    p.waveSize = 8;
  } else if (fac === 'myriad') {
    p.res = 150;
    const hive = spawnEnt('hive', fac, base.x, base.y);
    hive.creepCur = 5;
    for (let i = 0; i < 6; i++) spawnEnt('drone', fac, base.x - 80 + i * 30, base.y + 75);
    p.waveSize = 16;
  } else if (fac === 'exodus') {
    p.res = 200;
    spawnEnt('ark', fac, base.x, base.y);
    for (let i = 0; i < 2; i++) spawnEnt('seeker', fac, base.x - 40 + i * 80, base.y + 65);
    for (let i = 0; i < 3; i++) spawnEnt('collector', fac, base.x - 60 + i * 40, base.y - 70);
    p.waveSize = 6;
  } else if (fac === 'choir') {
    p.res = 250;
    spawnEnt('ossuary', fac, base.x, base.y);
    for (let i = 0; i < 3; i++) spawnEnt('wraith', fac, base.x - 50 + i * 50, base.y + 70);
    p.waveSize = 12;
  } else { // syndicate
    p.res = 400;
    spawnEnt('haven', fac, base.x, base.y);
    for (let i = 0; i < 2; i++) spawnEnt('enforcer', fac, base.x - 40 + i * 80, base.y + 70);
    p.waveSize = 8;
  }
}

function spawnEnt(type, fac, x, y, opts = {}) {
  const d = DEFS[type];
  const e = {
    id: nextId++, type, def: d, fac,
    x: clamp(x, 20, WORLD_W - 20), y: clamp(y, 20, WORLD_H - 20),
    hp: d.hp, hpMax: d.hp, size: d.size,
    shield: d.shield || 0, shieldMax: d.shield || 0, lastHurt: -99,
    cd: 0, blinkCd: 0, scanT: Math.random() * 0.25, tgt: 0,
    order: { type: 'idle' }, dead: false,
    queue: [], rally: null, deployed: false,
  };
  if (d.creepR) e.creepCur = opts.creepCur != null ? opts.creepCur : 2;
  if (d.spawns) e.spawnTimer = d.spawnEvery;
  if (opts.constructing) { e.constructing = true; e.progress = 0; e.hp = Math.max(20, d.hp * 0.12); }
  if (opts.growing) { e.growing = true; e.progress = 0; e.hp = Math.max(20, d.hp * 0.25); }
  game.entities.push(e);
  return e;
}

// ---------------- damage / death ----------------
function applyDamage(t, dmg, attacker) {
  if (t.dead || t.def.noTarget) return;  // Obelisks are captured, never destroyed
  const dmg0 = dmg;
  t.lastHurt = game.t;
  const p = game.players[t.fac];
  if (p) p.lastAttack = { t: game.t, x: t.x, y: t.y };
  if (t.shield > 0) { const s = Math.min(t.shield, dmg); t.shield -= s; dmg -= s; }
  t.hp -= dmg;
  // choir lifesteal: spirits feast on the damage they deal
  if (attacker && !attacker.dead && attacker.fac === 'choir' && attacker.def.kind === 'unit')
    attacker.hp = Math.min(attacker.hpMax, attacker.hp + dmg0 * ECON.choirLeech);
  // retaliate if idle
  if (attacker && !attacker.dead && t.def.dmg > 0 && !t.def.harvester && t.def.kind === 'unit'
      && !t.def.stationary && t.order.type === 'idle') {
    t.order = { type: 'attack', id: attacker.id };
  }
  if (t.hp <= 0) {
    t.dead = true;
    if (attacker && game.players[attacker.fac]) game.players[attacker.fac].kills++;
    // every death anywhere pays the Choir essence — friend or foe
    const choirP = game.players.choir;
    if (choirP) {
      const g = ECON.choirDeathFlat + t.hpMax * ECON.choirDeathPct;
      choirP.res += g; choirP.gainAccum += g;
    }
    // syndicate collects a bounty on its kills
    if (attacker && attacker.fac === 'syndicate' && t.fac !== 'syndicate' && game.players.syndicate) {
      const g = ECON.synBountyFlat + t.hpMax * ECON.synBountyPct;
      game.players.syndicate.res += g; game.players.syndicate.gainAccum += g;
    }
    // cracking open a neutral Hoard pays its destroyer a one-time bounty
    if (t.def.bounty && attacker && game.players[attacker.fac]) {
      const p = game.players[attacker.fac];
      p.res += t.def.bounty; p.gainAccum += t.def.bounty;
      localMsg(attacker.fac, 'Hoard plundered: +' + t.def.bounty + ' ' + FACTIONS[attacker.fac].res);
    }
    addFx({ kind: 'boom', x: t.x, y: t.y, r: t.size * 1.6, ttl: 0.5, max: 0.5, color: facColor(t.fac) });
  }
}

function addFx(f) {
  game.fx.push(f);
  if (game.mode === 'host') game.netFx.push(f); // forwarded in the next snapshot
}

// ---------------- combat ----------------
function findTarget(e) {
  const d = e.def;
  let best = null, bd = d.aggro;
  for (const o of game.entities) {
    if (o.dead || o.fac === e.fac || o.def.noTarget) continue;
    const dd = dist(e, o) - o.size;
    if (dd < bd) { bd = dd; best = o; }
  }
  return best;
}

function fireAt(e, t) {
  const d = e.def;
  e.cd = d.cd;
  e.tgt = t.id;
  if (d.shot === 'melee') {
    applyDamage(t, d.dmg, e);
    if (d.splash) splash(e, t, d);
    addFx({ kind: 'slash', x: t.x, y: t.y, ttl: 0.15, max: 0.15, color: facColor(e.fac) });
  } else if (d.shot === 'beam') {
    applyDamage(t, d.dmg, e);
    addFx({ kind: 'beam', x1: e.x, y1: e.y, x2: t.x, y2: t.y, ttl: 0.18, max: 0.18, color: facColor(e.fac) });
  } else {
    const speed = d.shot === 'shell' ? 240 : 380;
    game.proj.push({ x: e.x, y: e.y, targetId: t.id, lx: t.x, ly: t.y, speed,
      dmg: d.dmg, splash: d.splash || 0, fac: e.fac, attackerId: e.id,
      color: d.shot === 'glob' ? '#9fe06a' : facColor(e.fac), r: d.shot === 'shell' ? 4 : 2.5 });
  }
}

function splash(e, center, d) {
  for (const o of game.entities) {
    if (o.dead || o.fac === e.fac || o === center) continue;
    if (dist(center, o) < d.splash + o.size) applyDamage(o, d.dmg * 0.6, e);
  }
}

// engage target: shoot if in range else chase (unless stationary)
function engage(e, t, dt) {
  const d = e.def;
  const r = d.range + e.size + t.size;
  if (dist(e, t) <= r) {
    if (e.cd <= 0) fireAt(e, t);
  } else if (!d.stationary && d.speed) {
    // seeker blink: teleport to the target's flank
    if (d.blink && e.blinkCd <= 0 && dist(e, t) < 260) {
      addFx({ kind: 'blink', x1: e.x, y1: e.y, x2: t.x, y2: t.y, ttl: 0.3, max: 0.3, color: '#ffe9b0' });
      const a = Math.random() * Math.PI * 2;
      e.x = clamp(t.x + Math.cos(a) * (t.size + 22), 10, WORLD_W - 10);
      e.y = clamp(t.y + Math.sin(a) * (t.size + 22), 10, WORLD_H - 10);
      e.blinkCd = 6;
    } else {
      moveToward(e, t.x, t.y, dt);
    }
  }
}

function moveToward(e, x, y, dt) {
  const dx = x - e.x, dy = y - e.y, dl = Math.hypot(dx, dy);
  if (dl < 3) return true;
  const sp = e.def.speed * dt;
  if (dl <= sp) { e.x = x; e.y = y; return true; }
  e.x += dx / dl * sp; e.y += dy / dl * sp;
  return false;
}

// ---------------- unit update ----------------
function updateUnit(e, dt) {
  const d = e.def;
  e.cd = Math.max(0, e.cd - dt);
  e.blinkCd = Math.max(0, e.blinkCd - dt);
  const o = e.order;

  // the Ark fires on its own while doing anything
  if (d.stationary && d.dmg) {
    e.scanT -= dt;
    if (e.scanT <= 0) {
      e.scanT = 0.3;
      const t = findTarget(e);
      e.tgt = t ? t.id : 0;
    }
    const t = e.tgt ? byId(e.tgt) : null;
    if (t && dist(e, t) <= d.range + e.size + t.size && e.cd <= 0) fireAt(e, t);
  }

  switch (o.type) {
    case 'idle': {
      if (d.harvester) { autoHarvest(e); break; }
      if (d.dmg > 0 && d.aggro > 0 && !d.stationary) {
        e.scanT -= dt;
        if (e.scanT <= 0) {
          e.scanT = 0.3;
          const t = findTarget(e);
          if (t) e.order = { type: 'attack', id: t.id };
        }
      }
      break;
    }
    case 'move': {
      if (moveToward(e, o.x, o.y, dt)) e.order = { type: 'idle' };
      break;
    }
    case 'amove': {
      if (d.dmg > 0 && d.aggro > 0) {
        e.scanT -= dt;
        if (e.scanT <= 0) { e.scanT = 0.25; const t = findTarget(e); e.tgt = t ? t.id : 0; }
        const t = e.tgt ? byId(e.tgt) : null;
        if (t) { engage(e, t, dt); break; }
      }
      if (moveToward(e, o.x, o.y, dt)) e.order = { type: 'idle' };
      break;
    }
    case 'attack': {
      const t = byId(o.id);
      if (!t) { e.order = { type: 'idle' }; break; }
      engage(e, t, dt);
      break;
    }
    case 'harvest': harvestStep(e, dt); break;
    case 'build': {
      const site = byId(o.id);
      if (!site || !site.constructing) { e.order = { type: 'idle' }; break; }
      if (dist(e, site) > site.size + e.size + 8) { moveToward(e, site.x, site.y, dt); break; }
      site.progress += dt;
      site.hp = Math.min(site.hpMax, site.hpMax * (0.12 + 0.88 * site.progress / site.def.time));
      if (site.progress >= site.def.time) { site.constructing = false; site.hp = site.hpMax; e.order = { type: 'idle' }; }
      break;
    }
  }

  // Ark production + siphon
  if (d.produces && d.kind === 'unit') tickQueue(e, dt);
}

function nearestNode(x, y) {
  let best = null, bd = 1e9;
  for (const n of game.nodes) {
    if (n.amount <= 0) continue;
    const dd = Math.hypot(n.x - x, n.y - y);
    if (dd < bd) { bd = dd; best = n; }
  }
  return best;
}

function autoHarvest(e) {
  const n = nearestNode(e.x, e.y);
  if (n) e.order = { type: 'harvest', nodeId: n.id, phase: 'go', timer: 0, carry: 0 };
}

function harvestStep(e, dt) {
  const o = e.order;
  const node = game.nodes.find(n => n.id === o.nodeId);
  if (o.phase === 'go') {
    if (!node || node.amount <= 0) { e.order = { type: 'idle' }; return; }
    if (dist(e, node) <= node.r + e.size + 4) { o.phase = 'mine'; o.timer = ECON.workerMine; }
    else moveToward(e, node.x, node.y, dt);
  } else if (o.phase === 'mine') {
    if (!node || node.amount <= 0) { e.order = { type: 'idle' }; return; }
    o.timer -= dt;
    if (o.timer <= 0) {
      o.carry = Math.min(ECON.workerCarry, node.amount);
      node.amount -= o.carry;
      o.phase = 'return';
    }
  } else { // return
    const drop = ents(x => x.fac === e.fac && x.def.dropoff && !x.constructing)
      .sort((a, b) => dist(e, a) - dist(e, b))[0];
    if (!drop) { e.order = { type: 'idle' }; return; }
    if (dist(e, drop) <= drop.size + e.size + 6) {
      const p = game.players[e.fac];
      p.res += o.carry; p.gainAccum += o.carry;
      o.carry = 0;
      if (node && node.amount > 0) o.phase = 'go';
      else { e.order = { type: 'idle' }; }
    } else moveToward(e, drop.x, drop.y, dt);
  }
}

// ---------------- building update ----------------
function updateBuilding(e, dt) {
  const d = e.def;
  if (e.constructing) return;           // built by a worker, see 'build' order
  if (e.growing) {
    e.progress += dt;
    e.hp = Math.min(e.hpMax, e.hpMax * (0.25 + 0.75 * e.progress / d.time));
    if (e.progress >= d.time) { e.growing = false; e.hp = e.hpMax; }
    return;
  }
  // creep growth
  if (d.creepR) e.creepCur = Math.min(d.creepR, e.creepCur + dt * 0.35);
  // free auto-spawn
  if (d.spawns) {
    e.spawnTimer -= dt;
    if (e.spawnTimer <= 0) {
      e.spawnTimer = d.spawnEvery;
      if (countUnits(e.fac) < FACTIONS[e.fac].cap) {
        const a = Math.random() * Math.PI * 2;
        const u = spawnEnt(d.spawns, e.fac, e.x + Math.cos(a) * (e.size + 12), e.y + Math.sin(a) * (e.size + 12));
        const r = game.players[e.fac].swarmRally;
        u.order = { type: 'amove', x: r.x, y: r.y };
      }
    }
  }
  // production queue
  if (d.produces) tickQueue(e, dt);
  // turret combat
  if (d.dmg) {
    e.cd = Math.max(0, e.cd - dt);
    e.scanT -= dt;
    if (e.scanT <= 0) { e.scanT = 0.3; const t = findTarget(e); e.tgt = t ? t.id : 0; }
    const t = e.tgt ? byId(e.tgt) : null;
    if (t && dist(e, t) <= d.range + e.size + t.size && e.cd <= 0) fireAt(e, t);
  }
}

function tickQueue(e, dt) {
  if (!e.queue.length) return;
  const item = e.queue[0];
  item.t -= dt;
  if (item.t <= 0) {
    if (countUnits(e.fac) >= FACTIONS[e.fac].cap) { item.t = 0; return; } // hold until supply frees
    e.queue.shift();
    const a = Math.random() * Math.PI * 2;
    const u = spawnEnt(item.type, e.fac, e.x + Math.cos(a) * (e.size + 14), e.y + Math.sin(a) * (e.size + 14));
    const r = e.rally || { x: e.x + 50, y: e.y + 50 };
    u.order = u.def.harvester ? { type: 'move', x: r.x, y: r.y } : { type: 'amove', x: r.x, y: r.y };
  }
}

// route an error message to whichever human owns this faction (local or remote)
function localMsg(fac, text) {
  if (fac === game.localFac) floatMsg(text);
  else if (game.mode === 'host' && !game.players[fac].isAI) netSend({ t: 'msg', text });
}

function enqueue(e, type) {
  const d = DEFS[type], p = game.players[e.fac];
  if (e.queue.length >= 5) { localMsg(e.fac, 'Queue is full'); return false; }
  if (p.res < d.cost) { localMsg(e.fac, 'Not enough ' + FACTIONS[e.fac].res); return false; }
  p.res -= d.cost;
  e.queue.push({ type, t: d.time, total: d.time });
  return true;
}

// ---------------- placement ----------------
let placeErrMsg = 'Cannot build there';
function placeValid(type, fac, x, y) {
  const d = DEFS[type];
  if (x < d.size + 8 || y < d.size + 8 || x > WORLD_W - d.size - 8 || y > WORLD_H - d.size - 8) {
    placeErrMsg = 'Cannot build there'; return false;
  }
  for (const o of game.entities)
    if (!o.dead && o.def.kind === 'building' && Math.hypot(o.x - x, o.y - y) < o.size + d.size + 10) {
      placeErrMsg = 'Too close to another building'; return false;
    }
  for (const n of game.nodes)
    if (n.amount > 0 && Math.hypot(n.x - x, n.y - y) < n.r + d.size + 10) {
      placeErrMsg = 'Too close to a crystal node'; return false;
    }
  if (fac === 'myriad' && !onCreep(fac, x, y)) { placeErrMsg = 'Must grow on your creep'; return false; }
  if (fac === 'choir') { // lattice rule: must be near an existing finished Choir structure
    const ok = game.entities.some(e => !e.dead && e.fac === fac && e.def.kind === 'building'
      && !e.constructing && !e.growing && Math.hypot(e.x - x, e.y - y) < ECON.choirLattice);
    if (!ok) { placeErrMsg = 'Must build within the lattice — near another Choir structure'; return false; }
  }
  // syndicate air-drops can't be planted in enemy-held territory (no turret-rushing the base)
  if (fac === 'syndicate') {
    const enemyNear = game.entities.some(o => !o.dead && o.fac !== fac && o.fac !== 'neutral'
      && o.def.kind === 'building' && Math.hypot(o.x - x, o.y - y) < ECON.synDropKeepout);
    if (enemyNear) { placeErrMsg = 'Too close to enemy territory'; return false; }
  }
  return true;
}

function placeErr(fac) { return placeErrMsg; }

function placeBuilding(fac, type, x, y) {
  const d = DEFS[type], p = game.players[fac];
  if (p.res < d.cost) { localMsg(fac, 'Not enough ' + FACTIONS[fac].res); return false; }
  if (!placeValid(type, fac, x, y)) { localMsg(fac, placeErr(fac)); return false; }
  if (fac === 'vanguard') {
    const w = ents(e => e.fac === fac && e.def.builder && e.order.type !== 'build')
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
    if (!w) { localMsg(fac, 'No worker available'); return false; }
    p.res -= d.cost;
    const site = spawnEnt(type, fac, x, y, { constructing: true });
    w.order = { type: 'build', id: site.id };
  } else {
    p.res -= d.cost;
    spawnEnt(type, fac, x, y, { growing: true });
  }
  return true;
}

// ---------------- creep & economy ----------------
function recomputeCreep() {
  game.creep.fill(0);
  for (const e of game.entities) {
    if (e.dead || !e.def.creepR || e.constructing || e.growing) continue;
    const v = facIdx(e.fac);
    const cr = e.creepCur, cr2 = cr * cr;
    const cx = e.x / TILE, cy = e.y / TILE;
    const x0 = Math.max(0, Math.floor(cx - cr)), x1 = Math.min(GW - 1, Math.ceil(cx + cr));
    const y0 = Math.max(0, Math.floor(cy - cr)), y1 = Math.min(GH - 1, Math.ceil(cy + cr));
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        const dx = tx + 0.5 - cx, dy = ty + 0.5 - cy;
        if (dx * dx + dy * dy <= cr2) {
          const i = ty * GW + tx;
          if (game.creep[i] === 0) game.creep[i] = v;
        }
      }
  }
}

function tickEconomy(dt) {
  for (const fac in game.players) {
    const p = game.players[fac];
    let gain = 0;
    if (fac === 'myriad') {
      let tiles = 0;
      const v = facIdx(fac);
      for (let i = 0; i < game.creep.length; i++) if (game.creep[i] === v) tiles++;
      p.creepTiles = tiles;
      gain = ECON.myriadBase + tiles * ECON.myriadPerTile;
    } else if (fac === 'exodus') {
      gain = ECON.exodusBase;
      const ark = ents(e => e.fac === fac && e.def.core)[0];
      if (ark && ark.deployed) {
        const n = game.nodes.find(n => n.amount > 0 && dist(ark, n) < ark.size + n.r + 30);
        if (n) {
          const s = Math.min(ECON.exodusSiphon * dt, n.amount);
          n.amount -= s; gain += ECON.exodusSiphon;
          ark.siphonNode = n.id;
        } else ark.siphonNode = 0;
      }
    } else if (fac === 'choir') {
      const conduits = ents(e => e.fac === fac && e.type === 'conduit' && !e.growing).length;
      gain = ECON.choirBase + conduits * ECON.choirConduit;
    } else if (fac === 'syndicate') {
      const houses = ents(e => e.fac === fac && e.type === 'countinghouse' && !e.growing).length;
      const cap = ECON.synCapBase + houses * ECON.synCapPer;
      gain = ECON.synBase + houses * ECON.synHouseFlat + ECON.synInterest * Math.min(p.res, cap);
    }
    // every Obelisk this faction holds adds a steady trickle
    gain += ents(e => e.type === 'obelisk' && e.owner === fac).length * ECON.obeliskIncome;
    p.res += gain * dt;
    p.gainAccum += gain * dt;
  }
}

// Obelisks are captured by holding ground: stand units nearby with no enemy
// units contesting, and the capture meter fills toward your faction.
function tickCapture(dt) {
  for (const e of game.entities) {
    if (e.dead || e.type !== 'obelisk') continue;
    const counts = {};
    for (const o of game.entities) {
      if (o.dead || o.def.kind !== 'unit' || o.fac === 'neutral') continue;
      if (dist(e, o) <= e.def.captureR) counts[o.fac] = (counts[o.fac] || 0) + 1;
    }
    const facs = Object.keys(counts);
    if (facs.length === 1 && facs[0] !== e.owner) {
      const fac = facs[0];
      if (e.capFac !== fac) { e.capFac = fac; e.capProg = 0; }
      e.capProg = (e.capProg || 0) + dt;
      if (e.capProg >= e.def.captureTime) { e.owner = fac; e.capProg = 0; e.capFac = null; }
    } else if (facs.length === 0) {
      // uncontested and empty: the meter slowly bleeds back
      e.capProg = Math.max(0, (e.capProg || 0) - dt * 0.5);
      if (e.capProg === 0) e.capFac = null;
    }
    // contested by two+ factions: freeze the meter
  }
}

// regen: swarm heals on creep, exodus shields recharge, choir spirits decay
function tickRegen(dt) {
  for (const e of game.entities) {
    if (e.dead) continue;
    if (e.fac === 'myriad' && e.hp < e.hpMax && onCreep(e.fac, e.x, e.y) && !e.constructing && !e.growing)
      e.hp = Math.min(e.hpMax, e.hp + 4 * dt);
    if (e.fac === 'exodus' && e.shieldMax > 0 && game.t - e.lastHurt > 2.5)
      e.shield = Math.min(e.shieldMax, e.shield + 8 * dt);
    if (e.fac === 'choir' && e.def.kind === 'unit') {
      // the lattice sustains spirits; in the field they fade (never below a remnant)
      const home = game.entities.some(b => !b.dead && b.fac === 'choir'
        && b.def.kind === 'building' && !b.growing && dist(e, b) < ECON.choirLattice);
      if (home) e.hp = Math.min(e.hpMax, e.hp + ECON.choirSustain * dt);
      else {
        const floor = e.hpMax * ECON.choirFloor;
        if (e.hp > floor) e.hp = Math.max(floor, e.hp - ECON.choirDecay * dt);
      }
    }
  }
  // healing auras: exodus guardian (shields+hp), vanguard medic (hp)
  for (const g of ents(e => e.def.aura)) {
    for (const o of game.entities) {
      if (o.dead || o.fac !== g.fac || o === g) continue;
      if (dist(g, o) < g.def.aura) {
        if (g.type === 'guardian') {
          if (o.shieldMax > 0) o.shield = Math.min(o.shieldMax, o.shield + 10 * dt);
          o.hp = Math.min(o.hpMax, o.hp + 2 * dt);
        } else if (g.def.heal) {
          o.hp = Math.min(o.hpMax, o.hp + g.def.heal * dt);
        }
      }
    }
  }
}

// ---------------- separation / collision ----------------
function separation() {
  const units = ents(e => e.def.kind === 'unit');
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const rr = a.size + b.size;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 > 0.01) {
        const d = Math.sqrt(d2), push = (rr - d) / 2;
        const nx = dx / d, ny = dy / d;
        // a deployed Ark is anchored — shove the other party instead
        if (a.deployed) { b.x += nx * push * 2; b.y += ny * push * 2; }
        else if (b.deployed) { a.x -= nx * push * 2; a.y -= ny * push * 2; }
        else { a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push; }
      }
    }
    // push out of buildings & nodes
    for (const s of game.entities) {
      if (s.dead || s.def.kind !== 'building') continue;
      const dx = a.x - s.x, dy = a.y - s.y, rr = a.size + s.size;
      const d = Math.hypot(dx, dy);
      if (d < rr && d > 0.01) { a.x = s.x + dx / d * rr; a.y = s.y + dy / d * rr; }
    }
    for (const n of game.nodes) {
      if (n.amount <= 0) continue;
      const dx = a.x - n.x, dy = a.y - n.y, rr = a.size + n.r - 4;
      const d = Math.hypot(dx, dy);
      if (d < rr && d > 0.01) { a.x = n.x + dx / d * rr; a.y = n.y + dy / d * rr; }
    }
    a.x = clamp(a.x, a.size, WORLD_W - a.size);
    a.y = clamp(a.y, a.size, WORLD_H - a.size);
  }
}

// ---------------- projectiles & fx ----------------
function tickProjectiles(dt) {
  for (const pr of game.proj) {
    const t = byId(pr.targetId);
    if (t) { pr.lx = t.x; pr.ly = t.y; }
    const dx = pr.lx - pr.x, dy = pr.ly - pr.y, dl = Math.hypot(dx, dy);
    const sp = pr.speed * dt;
    if (dl <= sp) {
      pr.done = true;
      const attacker = game.entities.find(e => e.id === pr.attackerId);
      if (t) applyDamage(t, pr.dmg, attacker);
      if (pr.splash) {
        for (const o of game.entities) {
          if (o.dead || o.fac === pr.fac || o === t) continue;
          if (Math.hypot(o.x - pr.lx, o.y - pr.ly) < pr.splash + o.size) applyDamage(o, pr.dmg * 0.6, attacker);
        }
        addFx({ kind: 'boom', x: pr.lx, y: pr.ly, r: pr.splash, ttl: 0.35, max: 0.35, color: pr.color });
      }
    } else { pr.x += dx / dl * sp; pr.y += dy / dl * sp; }
  }
  game.proj = game.proj.filter(p => !p.done);
  for (const f of game.fx) f.ttl -= dt;
  game.fx = game.fx.filter(f => f.ttl > 0);
}

// ---------------- AI ----------------
function aiTick(fac) {
  const p = game.players[fac];
  const enemyFac = fac === game.localFac ? game.aiFac : game.localFac;
  const enemyCore = ents(e => e.fac === enemyFac && e.def.core)[0];
  const myCore = ents(e => e.fac === fac && e.def.core)[0];
  if (!myCore || !enemyCore) return;
  const army = armyOf(fac);
  const underAttack = p.lastAttack && game.t - p.lastAttack.t < 6;

  // ---- shared: defend / attack waves ----
  const defendPt = underAttack ? p.lastAttack : null;
  if (defendPt && Math.hypot(defendPt.x - myCore.x, defendPt.y - myCore.y) < 700) {
    for (const u of army) if (u.order.type === 'idle' || u.order.type === 'amove')
      u.order = { type: 'amove', x: defendPt.x, y: defendPt.y };
  } else if (army.length >= p.waveSize && game.t > 90) {
    for (const u of army) u.order = { type: 'amove', x: enemyCore.x, y: enemyCore.y };
    p.waveSize += 2;
  }

  if (fac === 'vanguard') {
    const workers = ents(e => e.fac === fac && e.type === 'worker');
    const hq = ents(e => e.fac === fac && e.type === 'hq' && !e.constructing)[0];
    if (hq && workers.length < 9 && p.res >= 50 && !hq.queue.length) enqueue(hq, 'worker');
    const rax = ents(e => e.fac === fac && e.type === 'barracks');
    const fact = ents(e => e.fac === fac && e.type === 'factory');
    const air = ents(e => e.fac === fac && e.type === 'airfield');
    const turrets = ents(e => e.fac === fac && e.type === 'turret');
    if (rax.length < 2 && p.res >= 150) aiPlace(fac, 'barracks', p.base);
    else if (rax.length >= 1 && fact.length < 1 && p.res >= 250) aiPlace(fac, 'factory', p.base);
    else if (fact.length >= 1 && air.length < 1 && p.res >= 300 && game.t > 200) aiPlace(fac, 'airfield', p.base);
    else if (turrets.length < 3 && p.res >= 220 && game.t > 150) aiPlace(fac, 'turret', p.base);
    for (const b of rax) if (!b.constructing && !b.queue.length && p.res >= 60) {
      const r = Math.random();
      enqueue(b, (r < 0.25 && p.res >= 110) ? 'sniper' : (r < 0.4 && p.res >= 75) ? 'medic' : 'marine');
    }
    for (const b of fact) if (!b.constructing && !b.queue.length && p.res >= 200) enqueue(b, 'tank');
    for (const b of air) if (!b.constructing && !b.queue.length && p.res >= 180) enqueue(b, 'gunship');
  }

  else if (fac === 'myriad') {
    const hive = ents(e => e.fac === fac && e.type === 'hive')[0];
    const tumors = ents(e => e.fac === fac && e.type === 'tumor');
    const pits = ents(e => e.fac === fac && e.type === 'spawnpit');
    const mounds = ents(e => e.fac === fac && e.type === 'spittermound');
    const dens = ents(e => e.fac === fac && e.type === 'hunterden');
    const spines = ents(e => e.fac === fac && e.type === 'spine');
    // spread creep toward the enemy
    if (tumors.length < 9 && p.res >= 50 && Math.random() < 0.65) {
      const sources = [hive, ...tumors].filter(Boolean);
      const src = sources[Math.floor(Math.random() * sources.length)];
      if (src) {
        const ang = Math.atan2(enemyCore.y - src.y, enemyCore.x - src.x) + (Math.random() - 0.5) * 1.6;
        const r = (src.creepCur || 5) * TILE * 0.8;
        aiPlaceAt(fac, 'tumor', src.x + Math.cos(ang) * r, src.y + Math.sin(ang) * r);
      }
    }
    if (pits.length < 3 && p.res >= 150) aiPlace(fac, 'spawnpit', p.base);
    else if (mounds.length < 2 && pits.length >= 1 && p.res >= 200) aiPlace(fac, 'spittermound', p.base);
    else if (dens.length < 2 && pits.length >= 2 && p.res >= 250) aiPlace(fac, 'hunterden', p.base);
    else if (spines.length < 3 && p.res >= 120 && game.t > 150) aiPlace(fac, 'spine', p.base);
    else if (hive && !hive.queue.length && p.res >= 300 && game.t > 180) enqueue(hive, 'broodmother');
    // swarm rally drifts toward the enemy as the game goes on
    p.swarmRally = underAttack && defendPt ? { x: defendPt.x, y: defendPt.y }
      : { x: p.base.x + (enemyCore.x - p.base.x) * 0.3, y: p.base.y + (enemyCore.y - p.base.y) * 0.3 };
  }

  else if (fac === 'exodus') {
    const ark = myCore;
    // production mix
    if (!ark.queue.length) {
      const collectors = ents(e => e.fac === fac && e.type === 'collector').length;
      const seekers = ents(e => e.fac === fac && e.type === 'seeker').length;
      const lancers = ents(e => e.fac === fac && e.type === 'lancer').length;
      const guards = ents(e => e.fac === fac && e.type === 'guardian').length;
      const phoenixes = ents(e => e.fac === fac && e.type === 'phoenix').length;
      const templars = ents(e => e.fac === fac && e.type === 'templar').length;
      if (collectors < 5 && p.res >= 60) enqueue(ark, 'collector');
      else if (guards < 1 && lancers >= 1 && p.res >= 180) enqueue(ark, 'guardian');
      else if (lancers <= seekers / 2 && p.res >= 220) enqueue(ark, 'lancer');
      else if (phoenixes < 2 && p.res >= 150 && game.t > 150) enqueue(ark, 'phoenix');
      else if (templars < 1 && guards >= 1 && p.res >= 260 && game.t > 240) enqueue(ark, 'templar');
      else if (p.res >= 120) enqueue(ark, 'seeker');
    }
    // siphon management
    const arkHurt = (ark.hp + ark.shield) / (ark.hpMax + ark.shieldMax) < 0.45;
    if (arkHurt) {
      ark.deployed = false;
      ark.order = { type: 'move', x: p.base.x, y: p.base.y };
      for (const u of army) u.order = { type: 'amove', x: ark.x, y: ark.y };
    } else {
      const n = nearestNode(ark.x, ark.y);
      if (n) {
        if (dist(ark, n) < ark.size + n.r + 24) { ark.deployed = true; ark.order = { type: 'idle' }; }
        else if (!ark.deployed && ark.order.type !== 'move') ark.order = { type: 'move', x: n.x, y: n.y };
        else if (ark.deployed && dist(ark, n) >= ark.size + n.r + 24) {
          // current node depleted → relocate
          ark.deployed = false; ark.order = { type: 'move', x: n.x, y: n.y };
        }
      }
    }
  }

  else if (fac === 'choir') {
    const oss = ents(e => e.fac === fac && e.type === 'ossuary')[0];
    const conduits = ents(e => e.fac === fac && e.type === 'conduit');
    const reliqs = ents(e => e.fac === fac && e.type === 'reliquary');
    const spires = ents(e => e.fac === fac && e.type === 'spire');
    // crawl the lattice toward the enemy with conduits
    if (conduits.length < 8 && p.res >= 60 && Math.random() < 0.6) {
      const srcs = ents(e => e.fac === fac && e.def.kind === 'building' && !e.growing);
      const src = srcs[Math.floor(Math.random() * srcs.length)];
      if (src) {
        const ang = Math.atan2(enemyCore.y - src.y, enemyCore.x - src.x) + (Math.random() - 0.5) * 1.8;
        aiPlaceAt(fac, 'conduit', src.x + Math.cos(ang) * 200, src.y + Math.sin(ang) * 200);
      }
    }
    if (reliqs.length < 1 && p.res >= 180) aiPlace(fac, 'reliquary', p.base);
    else if (spires.length < 2 && p.res >= 130 && game.t > 130) aiPlace(fac, 'spire', p.base);
    if (oss && !oss.queue.length && p.res >= 50)
      enqueue(oss, (Math.random() < 0.35 && p.res >= 130) ? 'banshee' : 'wraith');
    for (const b of reliqs) if (!b.growing && !b.queue.length && p.res >= 300) enqueue(b, 'revenant');
  }

  else { // syndicate: bank gold for interest, spend the overflow on mercs
    const haven = myCore;
    const houses = ents(e => e.fac === fac && e.type === 'countinghouse');
    const posts = ents(e => e.fac === fac && e.type === 'watchpost');
    if (houses.length < 2 && p.res >= 420) aiPlace(fac, 'countinghouse', p.base);
    else if (posts.length < 3 && p.res >= 360 && game.t > 120) aiPlace(fac, 'watchpost', p.base);
    if (haven && !haven.queue.length && (p.res >= 400 || (underAttack && p.res >= 100))) {
      const enf = ents(e => e.fac === fac && e.type === 'enforcer').length;
      const arb = ents(e => e.fac === fac && e.type === 'arbalest').length;
      const jug = ents(e => e.fac === fac && e.type === 'juggernaut').length;
      if (jug < Math.floor(enf / 5) && p.res >= 650) enqueue(haven, 'juggernaut');
      else if (arb < enf / 2 && p.res >= 520) enqueue(haven, 'arbalest');
      else enqueue(haven, 'enforcer');
    }
  }
}

function aiPlace(fac, type, near) {
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, r = 70 + Math.random() * 170;
    const x = near.x + Math.cos(a) * r, y = near.y + Math.sin(a) * r;
    if (placeValid(type, fac, x, y)) return placeBuilding(fac, type, x, y);
  }
  return false;
}
function aiPlaceAt(fac, type, x, y) {
  for (let i = 0; i < 10; i++) {
    const jx = x + (Math.random() - 0.5) * 60, jy = y + (Math.random() - 0.5) * 60;
    if (placeValid(type, fac, jx, jy)) return placeBuilding(fac, type, jx, jy);
  }
  return false;
}

// ---------------- main update ----------------
function update(dt) {
  game.t += dt;

  game.creepTimer -= dt;
  if (game.creepTimer <= 0) { game.creepTimer = 0.5; recomputeCreep(); }

  tickEconomy(dt);
  tickRegen(dt);
  tickCapture(dt);

  for (const e of game.entities) {
    if (e.dead) continue;
    if (e.def.kind === 'unit') updateUnit(e, dt);
    else updateBuilding(e, dt);
  }

  separation();
  tickProjectiles(dt);

  // income display (per-second window)
  for (const fac in game.players) {
    const p = game.players[fac];
    p.incomeT = (p.incomeT || 0) + dt;
    if (p.incomeT >= 1) { p.income = p.gainAccum / p.incomeT; p.gainAccum = 0; p.incomeT = 0; }
  }

  if (game.mode === 'sp') {
    game.aiTimer -= dt;
    if (game.aiTimer <= 0) { game.aiTimer = 1.0; aiTick(game.aiFac); }
  }

  // host: stream a state snapshot to the guest ~10×/s
  if (game.mode === 'host') {
    game.netTimer -= dt;
    if (game.netTimer <= 0) { game.netTimer = 0.1; netSend(buildSnap()); game.netFx.length = 0; }
  }

  // sweep the dead
  if (game.entities.some(e => e.dead)) {
    game.sel = game.sel.filter(e => !e.dead);
    game.entities = game.entities.filter(e => !e.dead);
  }
  game.nodes = game.nodes.filter(n => n.amount > 0);

  // victory check
  for (const fac of [game.localFac, game.aiFac]) {
    if (!ents(e => e.fac === fac && e.def.core).length) {
      endGame(fac === game.localFac ? game.aiFac : game.localFac);
      return;
    }
  }
}

function endGame(winner) {
  game.over = true;
  if (game.mode === 'host') netSend({ t: 'end', winner });
  const won = winner === game.localFac;
  const t = document.getElementById('endTitle');
  t.textContent = won ? 'VICTORY' : 'DEFEAT';
  t.style.color = won ? '#7dffa8' : '#ff7d7d';
  const mins = Math.floor(game.t / 60), secs = Math.floor(game.t % 60);
  document.getElementById('endDetail').textContent =
    FACTIONS[winner].name + ' prevails — ' + mins + 'm ' + String(secs).padStart(2, '0') + 's · your kills: '
    + game.players[game.localFac].kills;
  document.getElementById('endscreen').style.display = 'flex';
}

function backToMenu() {
  game = null;
  document.getElementById('endscreen').style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  document.getElementById('menu').style.display = 'flex';
  if (netConnected()) showLobby(); // still linked — straight back to the rematch lobby
}

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
          netSend({ t: 'cmd', kind: 'place', type: game.placing, x: mouse.wx, y: mouse.wy });
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
    netSend({ t: 'cmd', kind: 'order', ids: game.sel.map(e => e.id), x: wx, y: wy });
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
  const hot = ['1', '2', '3', '4', '5', '6', '7'];
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

// ---------------- command card ----------------
let msgTimer = null;
function floatMsg(text) {
  const m = document.getElementById('msg');
  m.textContent = text; m.style.opacity = 1;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { m.style.opacity = 0; }, 1800);
}

function currentCommands() {
  if (!game || !game.sel.length) return [];
  const fac = game.localFac, p = game.players[fac];
  const cmds = [];
  const sel0 = game.sel[0];
  const types = new Set(game.sel.map(e => e.type));

  const prodBtn = (host, type) => {
    const d = DEFS[type];
    cmds.push({
      label: d.name, cost: d.cost, enabled: p.res >= d.cost && !host.constructing && !host.growing,
      onClick: () => {
        if (game.mode === 'guest') netSend({ t: 'cmd', kind: 'enq', id: host.id, type });
        else enqueue(host, type);
        refreshCard();
      },
    });
  };
  const buildBtn = type => {
    const d = DEFS[type];
    cmds.push({
      label: (fac === 'myriad' ? 'Grow ' : fac === 'syndicate' ? 'Drop ' : 'Build ') + d.name,
      cost: d.cost, enabled: p.res >= d.cost,
      onClick: () => { game.placing = type; },
    });
  };

  if (types.has('worker')) ['barracks', 'factory', 'airfield', 'turret'].forEach(buildBtn);

  if (game.sel.length === 1) {
    const d = sel0.def;
    if (d.grows) d.grows.forEach(buildBtn);
    if (d.produces && !sel0.constructing && !sel0.growing) d.produces.forEach(t => prodBtn(sel0, t));
    if (sel0.type === 'ark') {
      cmds.push({
        label: sel0.deployed ? 'Undeploy Ark' : 'Deploy Ark', cost: 0, enabled: true,
        sub: 'Siphon energy from a crystal node',
        onClick: () => {
          if (game.mode === 'guest') netSend({ t: 'cmd', kind: 'deploy', id: sel0.id, on: !sel0.deployed });
          else { sel0.deployed = !sel0.deployed; if (sel0.deployed) sel0.order = { type: 'idle' }; }
          refreshCard();
        },
      });
    }
  }
  return cmds.slice(0, 7);
}

function refreshCard() {
  const card = document.getElementById('cmdcard');
  card.innerHTML = '';
  if (!game) return;
  const cmds = currentCommands();
  const hot = ['1', '2', '3', '4', '5', '6', '7'];
  cmds.forEach((c, i) => {
    const b = document.createElement('button');
    b.disabled = !c.enabled;
    b.innerHTML = '<span class="k">' + hot[i] + '</span>' + c.label
      + (c.cost ? '<span class="c">' + c.cost + ' ' + FACTIONS[game.localFac].res + '</span>' : (c.sub ? '<span class="c">' + c.sub + '</span>' : ''));
    b.onclick = () => { if (c.enabled) c.onClick(); };
    card.appendChild(b);
  });
}

function updateHUD() {
  const fac = game.localFac, p = game.players[fac];
  document.getElementById('hudRes').innerHTML = FACTIONS[fac].res + ': <b>' + Math.floor(p.res) + '</b>';
  document.getElementById('hudIncome').innerHTML = '+' + p.income.toFixed(1) + '/s'
    + (fac === 'myriad' ? ' · Creep: <b>' + (p.creepTiles || 0) + '</b> tiles' : '');
  document.getElementById('hudArmy').innerHTML = 'Units: <b>' + countUnits(fac) + '</b>/' + FACTIONS[fac].cap;

  // selection info
  const si = document.getElementById('selinfo');
  if (!game.sel.length) {
    si.textContent = 'Nothing selected.\nDrag to select · right-click to act\nF = select army · Space = go to core';
  } else if (game.sel.length === 1) {
    const e = game.sel[0];
    let s = e.def.name + '\nHP ' + Math.ceil(e.hp) + '/' + e.hpMax;
    if (e.shieldMax) s += '  ·  Shield ' + Math.ceil(e.shield) + '/' + e.shieldMax;
    if (e.constructing) s += '\nUnder construction ' + Math.floor(e.progress / e.def.time * 100) + '%';
    if (e.growing) s += '\nGrowing ' + Math.floor(e.progress / e.def.time * 100) + '%';
    if (e.queue && e.queue.length) {
      const it = e.queue[0];
      s += '\nProducing ' + DEFS[it.type].name + ' ' + Math.floor((1 - it.t / it.total) * 100) + '%'
        + (e.queue.length > 1 ? ' (+' + (e.queue.length - 1) + ' queued)' : '');
    }
    if (e.type === 'hive') s += '\nRight-click to set the swarm rally';
    if (e.type === 'ark' && e.deployed) s += '\nDEPLOYED — siphoning' + (e.siphonNode ? ' crystal' : '… (no node in reach)');
    if (e.type === 'haven') s += '\nTreasury earns interest — Countinghouses raise the cap';
    if (e.fac === 'choir' && e.def.kind === 'unit') s += '\nFades away from the lattice — heals by dealing damage';
    si.textContent = s;
  } else {
    const counts = {};
    for (const e of game.sel) counts[e.def.name] = (counts[e.def.name] || 0) + 1;
    si.textContent = game.sel.length + ' selected\n'
      + Object.entries(counts).map(([n, c]) => c + '× ' + n).join('\n');
  }

  // refresh card button enabled-state cheaply
  const card = document.getElementById('cmdcard');
  const cmds = currentCommands();
  const btns = card.querySelectorAll('button');
  if (btns.length === cmds.length) cmds.forEach((c, i) => { btns[i].disabled = !c.enabled; });
  else refreshCard();
}

// ---------------- rendering ----------------
function draw() {
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!game) return;
  ctx.save();
  ctx.scale(game.cam.z, game.cam.z);
  ctx.translate(-game.cam.x, -game.cam.y);

  // grid
  ctx.strokeStyle = '#161e2a'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= WORLD_W; x += TILE * 2) { ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); }
  for (let y = 0; y <= WORLD_H; y += TILE * 2) { ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); }
  ctx.stroke();

  // creep
  const pulse = 0.78 + 0.1 * Math.sin(game.t * 2);
  for (let ty = 0; ty < GH; ty++)
    for (let tx = 0; tx < GW; tx++) {
      const v = game.creep[ty * GW + tx];
      if (!v) continue;
      const fac = Object.keys(FACTIONS)[v - 1];
      ctx.fillStyle = fac === 'myriad' ? 'rgba(74,29,92,' + pulse + ')' : FACTIONS[fac].dark;
      ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
    }

  // world border
  ctx.strokeStyle = '#2a3954'; ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, WORLD_W, WORLD_H);

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

  // entities (buildings first, then units, sorted by y)
  const sorted = [...game.entities].sort((a, b) =>
    (a.def.kind === 'building' ? 0 : 1) - (b.def.kind === 'building' ? 0 : 1) || a.y - b.y);
  for (const e of sorted) drawEnt(e);

  // siphon tether (derived from proximity so it renders identically on guest)
  for (const e of ents(o => o.type === 'ark' && o.deployed)) {
    const n = game.nodes.find(n => n.amount > 0 && dist(e, n) < e.size + n.r + 30);
    if (n) {
      ctx.strokeStyle = 'rgba(110,231,255,' + (0.4 + 0.3 * Math.sin(game.t * 6)) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    }
  }

  // projectiles
  for (const pr of game.proj) {
    ctx.fillStyle = pr.color;
    ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r, 0, Math.PI * 2); ctx.fill();
  }

  // fx
  for (const f of game.fx) {
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

  ctx.restore();

  // drag selection box (screen space)
  if (mouse.dragging) {
    ctx.strokeStyle = '#7dffa8'; ctx.lineWidth = 1;
    ctx.strokeRect(Math.min(mouse.dx0, mouse.x), Math.min(mouse.dy0, mouse.y),
      Math.abs(mouse.x - mouse.dx0), Math.abs(mouse.y - mouse.dy0));
  }

  drawMinimap();
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

  if (e.fac === 'vanguard') {
    if (e.def.kind === 'building') {
      ctx.fillStyle = dark; ctx.strokeStyle = col; ctx.lineWidth = 2;
      roundRect(x - s, y - s * 0.8, s * 2, s * 1.6, 5); ctx.fill(); ctx.stroke();
      if (e.type === 'hq') {
        ctx.strokeStyle = col;
        ctx.beginPath(); ctx.moveTo(x, y - s * 0.8); ctx.lineTo(x, y - s * 1.35); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y - s * 1.35, 3.5, 0, Math.PI * 2); ctx.fill();
      } else if (e.type === 'turret') {
        const t = e.tgt ? byId(e.tgt) : null;
        const a = t ? Math.atan2(t.y - y, t.x - x) : game.t * 0.5;
        ctx.strokeStyle = col; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 9), y + Math.sin(a) * (s + 9)); ctx.stroke();
      } else {
        ctx.fillStyle = col; ctx.fillRect(x - s * 0.45, y - s * 0.3, s * 0.9, s * 0.6);
      }
    } else if (e.type === 'tank') {
      ctx.fillStyle = dark; ctx.strokeStyle = col; ctx.lineWidth = 2;
      roundRect(x - s, y - s * 0.7, s * 2, s * 1.4, 4); ctx.fill(); ctx.stroke();
      const t = e.tgt ? byId(e.tgt) : null;
      const a = t ? Math.atan2(t.y - y, t.x - x) : 0;
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 8), y + Math.sin(a) * (s + 8)); ctx.stroke();
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
    } else if (e.type === 'medic') {
      ctx.fillStyle = '#dfe8f4'; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.fillRect(x - s, y - s, s * 2, s * 2); ctx.strokeRect(x - s, y - s, s * 2, s * 2);
      ctx.fillStyle = '#e05b4d';
      ctx.fillRect(x - s * 0.55, y - s * 0.18, s * 1.1, s * 0.36);
      ctx.fillRect(x - s * 0.18, y - s * 0.55, s * 0.36, s * 1.1);
    } else {
      // marine / sniper: triangle
      ctx.fillStyle = e.type === 'sniper' ? '#1d3f63' : col;
      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y - s - 2); ctx.lineTo(x + s, y + s); ctx.lineTo(x - s, y + s); ctx.closePath();
      ctx.fill(); ctx.stroke();
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
      }
      if (e.def.dmg) { // haven & watchpost barrels
        const t = e.tgt ? byId(e.tgt) : null;
        const a = t ? Math.atan2(t.y - y, t.x - x) : game.t * 0.4;
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 8), y + Math.sin(a) * (s + 8)); ctx.stroke();
      }
    } else { // mercs: pentagons
      ctx.fillStyle = e.type === 'juggernaut' ? '#54201a' : '#6b2418';
      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      poly(x, y, s + 1, 5, -Math.PI / 2); ctx.fill(); ctx.stroke();
      if (e.type === 'arbalest') {
        const t = e.tgt ? byId(e.tgt) : null;
        const a = t ? Math.atan2(t.y - y, t.x - x) : -Math.PI / 2;
        ctx.strokeStyle = '#ffd97d'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 7), y + Math.sin(a) * (s + 7)); ctx.stroke();
      } else if (e.type === 'juggernaut') {
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
      ctx.strokeStyle = '#ffe3a3'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y - s * 0.5); ctx.lineTo(x + s * 0.5, y); ctx.lineTo(x, y + s * 0.5); ctx.lineTo(x - s * 0.5, y); ctx.closePath(); ctx.stroke();
      if (e.deployed) {
        ctx.strokeStyle = 'rgba(255,217,125,' + (0.5 + 0.3 * Math.sin(game.t * 4)) + ')';
        ctx.beginPath(); ctx.arc(x, y, s + 10, 0, Math.PI * 2); ctx.stroke();
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

  ctx.globalAlpha = 1;

  // hp bar
  if (sel || e.hp < e.hpMax || e.constructing || e.growing) {
    const w = Math.max(20, s * 2), hpf = clamp(e.hp / e.hpMax, 0, 1);
    const by = y - s - 10;
    ctx.fillStyle = '#000a'; ctx.fillRect(x - w / 2, by, w, 4);
    ctx.fillStyle = hpf > 0.5 ? '#5fd068' : hpf > 0.25 ? '#e0b84d' : '#e05b4d';
    ctx.fillRect(x - w / 2, by, w * hpf, 4);
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
  // nodes
  mmCtx.fillStyle = '#6ee7ff';
  for (const n of game.nodes) mmCtx.fillRect(n.x * sx - 1.5, n.y * sy - 1.5, 3, 3);
  // entities (Obelisks show their captor's colour)
  for (const e of game.entities) {
    if (e.dead) continue;
    mmCtx.fillStyle = facColor(e.owner || e.fac);
    const r = e.def.core ? 3 : e.def.kind === 'building' ? 2 : 1.2;
    mmCtx.fillRect(e.x * sx - r, e.y * sy - r, r * 2, r * 2);
  }
  // camera
  mmCtx.strokeStyle = '#cdd6e4'; mmCtx.lineWidth = 1;
  mmCtx.strokeRect(game.cam.x * sx, game.cam.y * sy, viewW() * sx, viewH() * sy);
}

// ---------------- main loop ----------------
function frame(ts) {
  const dt = Math.min(0.05, (ts - lastFrame) / 1000 || 0.016);
  lastFrame = ts;
  if (game && !game.over) {
    panCamera(dt);
    if (game.mode === 'guest') guestTick(dt); else update(dt);
    game.hudTimer -= dt;
    if (game && game.hudTimer <= 0) { game.hudTimer = 0.15; updateHUD(); }
  }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// keep the simulation (and multiplayer snapshots) running while the tab is
// hidden — requestAnimationFrame stops firing, which would freeze the match
// for BOTH players if the host minimized the window
let lastBgTick = performance.now();
setInterval(() => {
  const now = performance.now();
  if (!document.hidden) { lastBgTick = now; return; }
  let dt = Math.min((now - lastBgTick) / 1000, 2);
  lastBgTick = now;
  if (!game || game.over) return;
  while (dt > 0) {
    const step = Math.min(dt, 0.05);
    if (game.mode === 'guest') guestTick(step); else update(step);
    dt -= step;
  }
}, 100);

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
    return [e.id, TYPE_IDX[e.type], Math.round(e.x), Math.round(e.y),
      Math.ceil(e.hp), Math.ceil(e.shield), fl, prog,
      q ? TYPE_IDX[q.type] : 0, q ? Math.round((1 - q.t / q.total) * 100) : 0,
      e.queue ? e.queue.length : 0];
  });
  const players = {};
  for (const f in game.players) {
    const p = game.players[f];
    players[f] = [Math.round(p.res), +p.income.toFixed(1), p.kills, p.creepTiles || 0];
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
    if (p) { p.res = a[0]; p.income = a[1]; p.kills = a[2]; p.creepTiles = a[3]; }
  }
  game.nodes = m.nodes.map(a => ({ id: a[0], x: a[1], y: a[2], amount: a[3], max: a[4], r: 20 }));
  unrle(m.creep, game.creep);
  game.proj = m.proj.map(a => ({ x: a[0], y: a[1], r: a[2], color: a[3] }));
  for (const f of m.fx) addFx(f);
  const seen = new Set();
  for (const row of m.units) {
    const [id, ti, x, y, hp, sh, fl, prog, qt, qp, qn] = row;
    seen.add(id);
    let e = game.entities.find(o => o.id === id);
    if (!e) {
      const type = TYPE_LIST[ti], d = DEFS[type];
      e = { id, type, def: d, fac: d.fac, x, y, size: d.size, hpMax: d.hp,
        shieldMax: d.shield || 0, order: { type: 'idle' }, queue: [], dead: false,
        deployed: false, lastHurt: -99, cd: 0, tgt: 0 };
      game.entities.push(e);
    }
    e.nx = x; e.ny = y;
    e.hp = hp; e.shield = sh;
    e.deployed = !!(fl & 1); e.constructing = !!(fl & 2); e.growing = !!(fl & 4);
    const ownIdx = (fl >> 4) & 15; e.owner = ownIdx ? Object.keys(FACTIONS)[ownIdx - 1] : null;
    e.order = (fl & 8) ? { type: 'harvest', carry: 1 } : { type: 'idle' };
    e.progress = prog / 100 * e.def.time;
    e.queue = [];
    for (let i = 0; i < qn; i++) e.queue.push({ type: TYPE_LIST[qt], t: 1 - qp / 100, total: 1 });
  }
  game.entities = game.entities.filter(e => seen.has(e.id));
  game.sel = game.sel.filter(e => seen.has(e.id));
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

// ---------------- connection plumbing ----------------
const net = { pc: null, dc: null, role: null, myFac: null, theirFac: null };

function netConnected() { return !!(net.dc && net.dc.readyState === 'open'); }
function netSend(o) { if (netConnected()) net.dc.send(JSON.stringify(o)); }

function wireDC() {
  net.dc.onopen = () => showLobby();
  net.dc.onmessage = ev => handleNet(JSON.parse(ev.data));
  net.dc.onclose = () => onDisconnect();
  net.dc.onerror = () => onDisconnect();
}

function handleNet(m) {
  switch (m.t) {
    case 'fac': net.theirFac = m.fac; updateLobby(); break;
    case 'start':
      net.theirFac = m.a; net.myFac = m.b;
      buildMatch(m.a, m.b, 'guest', m.b);
      break;
    case 'snap': if (game && game.mode === 'guest' && !game.over) applySnap(m); break;
    case 'cmd': if (game && game.mode === 'host' && !game.over) handleCmd(m); break;
    case 'msg': floatMsg(m.text); break;
    case 'end': if (game && game.mode === 'guest' && !game.over) endGame(m.winner); break;
  }
}

// host: execute a guest command (validated against the guest's faction)
function handleCmd(m) {
  const fac = game.facB;
  if (m.kind === 'order') {
    const sel = (m.ids || []).map(byId).filter(e => e && e.fac === fac);
    if (sel.length) applyOrder(fac, sel, m.x, m.y);
  } else if (m.kind === 'place') {
    if (DEFS[m.type] && DEFS[m.type].fac === fac) placeBuilding(fac, m.type, m.x, m.y);
  } else if (m.kind === 'enq') {
    const e = byId(m.id);
    if (e && e.fac === fac && e.def.produces && e.def.produces.includes(m.type)) enqueue(e, m.type);
  } else if (m.kind === 'deploy') {
    const e = byId(m.id);
    if (e && e.fac === fac && e.type === 'ark') {
      e.deployed = m.on;
      if (m.on) e.order = { type: 'idle' };
    }
  }
}

function onDisconnect() {
  if (game && game.mode !== 'sp' && !game.over) {
    game.over = true;
    document.getElementById('endTitle').textContent = 'CONNECTION LOST';
    document.getElementById('endTitle').style.color = '#e0b84d';
    document.getElementById('endDetail').textContent = 'The link to your opponent dropped.';
    document.getElementById('endscreen').style.display = 'flex';
  }
  net.pc = null; net.dc = null; net.role = null; net.theirFac = null; net.myFac = null;
  document.getElementById('mpLobby').style.display = 'none';
  document.getElementById('mpPanel').style.display = 'none';
  for (const c of document.querySelectorAll('#cards .card')) c.classList.remove('picked');
}

// ---------------- manual WebRTC signaling ----------------
const RTC_CFG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
let mpState = null;

function iceDone(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(res => {
    const to = setTimeout(res, 3000); // settle for whatever candidates we have
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') { clearTimeout(to); res(); }
    });
  });
}
const sdpEncode = d => btoa(JSON.stringify(d));
const sdpDecode = s => JSON.parse(atob(s.trim()));

async function startHost() {
  net.role = 'host';
  net.pc = new RTCPeerConnection(RTC_CFG);
  net.dc = net.pc.createDataChannel('game');
  wireDC();
  await net.pc.setLocalDescription(await net.pc.createOffer());
  await iceDone(net.pc);
  mpState = 'host-wait-answer';
  mpUI({
    step: '1. Send this INVITE code to your friend (Discord, WhatsApp, anything).\n2. Paste their REPLY code below and press CONNECT.',
    out: sdpEncode(net.pc.localDescription), status: '',
  });
}

async function hostAccept(answerText) {
  try {
    await net.pc.setRemoteDescription(new RTCSessionDescription(sdpDecode(answerText)));
    mpUI({ status: 'Connecting…' });
  } catch (e) { mpUI({ status: 'That reply code is invalid — paste the whole thing.' }); }
}

async function joinWithOffer(offerText) {
  try {
    net.role = 'guest';
    net.pc = new RTCPeerConnection(RTC_CFG);
    net.pc.ondatachannel = ev => { net.dc = ev.channel; wireDC(); };
    await net.pc.setRemoteDescription(new RTCSessionDescription(sdpDecode(offerText)));
    await net.pc.setLocalDescription(await net.pc.createAnswer());
    await iceDone(net.pc);
    mpUI({
      step: 'Send this REPLY code back to the host.',
      out: sdpEncode(net.pc.localDescription),
      status: 'Waiting for the host to connect…',
    });
  } catch (e) { mpUI({ status: 'That invite code is invalid — paste the whole thing.' }); }
}

// ---------------- lobby ----------------
function mpUI(o) {
  document.getElementById('mpPanel').style.display = 'block';
  if (o.step !== undefined) document.getElementById('mpStep').textContent = o.step;
  if (o.out !== undefined) document.getElementById('mpOut').value = o.out;
  if (o.status !== undefined) document.getElementById('mpStatus').textContent = o.status;
}

function showLobby() {
  document.getElementById('menu').style.display = 'flex';
  document.getElementById('mpPanel').style.display = 'none';
  document.getElementById('mpLobby').style.display = 'flex';
  updateLobby();
}

function pickFaction(f) {
  net.myFac = f;
  netSend({ t: 'fac', fac: f });
  updateLobby();
}

function updateLobby() {
  if (!netConnected()) return;
  document.getElementById('mpLobby').style.display = 'flex';
  for (const c of document.querySelectorAll('#cards .card'))
    c.classList.toggle('picked', c.dataset.fac === net.myFac);
  const nameOf = f => f ? FACTIONS[f].name : '—';
  let txt = 'CONNECTED · click a faction card to pick · You: ' + nameOf(net.myFac)
    + ' · Friend: ' + nameOf(net.theirFac);
  const clash = net.myFac && net.myFac === net.theirFac;
  if (clash) txt += '  (pick different factions!)';
  document.getElementById('lobbyText').textContent = txt;
  const startBtn = document.getElementById('mpStart');
  if (net.role === 'host') {
    startBtn.style.display = 'inline-block';
    startBtn.disabled = !(net.myFac && net.theirFac && !clash);
  } else {
    startBtn.style.display = 'none';
  }
}

// ---------------- menu wiring ----------------
for (const card of document.querySelectorAll('#cards .card')) {
  card.addEventListener('click', () => {
    if (netConnected()) pickFaction(card.dataset.fac); // lobby mode: cards pick, host starts
    else newGame(card.dataset.fac);
  });
}

document.getElementById('mpHostBtn').addEventListener('click', () => {
  if (net.pc) return;
  mpUI({ step: 'Creating invite code…', out: '', status: '' });
  startHost();
});
document.getElementById('mpJoinBtn').addEventListener('click', () => {
  if (net.pc) return;
  mpState = 'join-enter-offer';
  mpUI({ step: 'Paste the host\'s INVITE code below and press CONNECT.', out: '', status: '' });
});
document.getElementById('mpGo').addEventListener('click', () => {
  const text = document.getElementById('mpIn').value;
  if (!text.trim()) { mpUI({ status: 'Paste a code first.' }); return; }
  if (mpState === 'host-wait-answer') hostAccept(text);
  else if (mpState === 'join-enter-offer') joinWithOffer(text);
});
document.getElementById('mpCopy').addEventListener('click', () => {
  const out = document.getElementById('mpOut');
  out.select();
  try { navigator.clipboard.writeText(out.value); } catch (e) { document.execCommand('copy'); }
  mpUI({ status: 'Copied to clipboard.' });
});
document.getElementById('mpStart').addEventListener('click', () => {
  if (net.role !== 'host' || !net.myFac || !net.theirFac || net.myFac === net.theirFac) return;
  netSend({ t: 'start', a: net.myFac, b: net.theirFac });
  buildMatch(net.myFac, net.theirFac, 'host', net.myFac);
});
