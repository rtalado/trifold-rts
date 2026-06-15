// ---------------- game setup ----------------
// single player vs 1–3 AI opponents (distinct random factions) at a chosen difficulty
function newGame(playerFac, aiCount = 1, diff = 'normal') {
  const pool = Object.keys(FACTIONS).filter(f => f !== playerFac);
  for (let i = pool.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const ais = pool.slice(0, Math.max(1, Math.min(3, aiCount)));
  const roster = [{ fac: playerFac, ai: false }].concat(ais.map(f => ({ fac: f, ai: true, diff })));
  buildMatch(roster, playerFac, 'sp', (Math.random() * 1e9) | 0);
}

// up to four spawn corners; with 2 players they sit diagonally opposite
function cornerBases(n) {
  const m = 440;
  const all = [
    { x: m, y: WORLD_H - m },            // bottom-left
    { x: WORLD_W - m, y: m },            // top-right
    { x: m, y: m },                      // top-left
    { x: WORLD_W - m, y: WORLD_H - m },  // bottom-right
  ];
  return all.slice(0, n);
}
const signTo = b => ({ sx: b.x < WORLD_W / 2 ? 1 : -1, sy: b.y < WORLD_H / 2 ? 1 : -1 });

// seeded, deterministic map. Every player gets a small fair starter economy by
// their base, then the rest of the world is strewn with crystal nodes and neutral
// "jungle" camps in random spots (League-of-Legends style) so the map feels alive
// rather than a single lane of stuff aimed at the foe. Same seed → identical map
// on every peer, so multiplayer entity ids line up.
function genLayout(rng, bases) {
  let nid = 1;
  const node = (x, y, amt) => game.nodes.push({ id: nid++, x: clamp(x, 60, WORLD_W - 60), y: clamp(y, 60, WORLD_H - 60), amount: amt, max: amt, r: 20 });
  const cx = WORLD_W / 2, cy = WORLD_H / 2;
  const P = bases.length;

  const farFromBases = (x, y, d) => bases.every(b => Math.hypot(b.x - x, b.y - y) > d);
  const occupied = (x, y, d) =>
    game.nodes.some(n => Math.hypot(n.x - x, n.y - y) < d) ||
    game.entities.some(e => e.fac === 'neutral' && Math.hypot(e.x - x, e.y - y) < d);
  // try up to 60 seeded random spots; return the first that clears the spacing rules
  const findSpot = (margin, minBase, minOther) => {
    for (let k = 0; k < 60; k++) {
      const x = margin + rng() * (WORLD_W - 2 * margin);
      const y = margin + rng() * (WORLD_H - 2 * margin);
      if (farFromBases(x, y, minBase) && !occupied(x, y, minOther)) return { x, y };
    }
    return null;
  };

  // 1) fair starter economy: two close nodes fanning toward the centre, per base
  const starters = [
    { ox: 150 + rng() * 70, oy: 150 + rng() * 70, amt: 1800 },
    { ox: 300 + rng() * 90, oy: 250 + rng() * 90, amt: 2200 },
  ];
  for (const b of bases) {
    const { sx, sy } = signTo(b);
    for (const o of starters) node(b.x + sx * o.ox, b.y + sy * o.oy, o.amt);
  }

  // 2) a field of extra crystal nodes scattered across the whole map
  const extraNodes = 14 + 10 * P;     // 2p:34  3p:44  4p:54
  for (let i = 0; i < extraNodes; i++) {
    const s = findSpot(80, 360, 150);
    if (s) node(s.x, s.y, 1500 + Math.floor(rng() * 2200));
  }

  // 3) neutral "jungle": lots of small caches, a scatter of Hoards & capture Obelisks
  const caches = 12 + 9 * P;          // 2p:30  3p:39  4p:48
  const hoards = 3 + P;               // 2p:5   3p:6   4p:7
  const obs    = 2 + P;               // 2p:4   3p:5   4p:6
  for (let i = 0; i < caches; i++) { const s = findSpot(90, 300, 160);  if (s) spawnEnt('cache',   'neutral', s.x, s.y); }
  for (let i = 0; i < hoards; i++) { const s = findSpot(120, 420, 240); if (s) spawnEnt('hoard',   'neutral', s.x, s.y); }
  for (let i = 0; i < obs;    i++) { const s = findSpot(120, 420, 260); if (s) spawnEnt('obelisk', 'neutral', s.x, s.y); }

  // 4) central contested prize: a guarded Hoard + Obelisk ringed by rich nodes
  spawnEnt('obelisk', 'neutral', cx, cy);
  spawnEnt('hoard', 'neutral', cx + 150, cy);
  node(cx - 170, cy, 3200); node(cx, cy - 170, 3200);
}

// purely-visual world dressing (rocks, rubble, craters, scrub) so the map reads as
// a real place. Deterministic from the same rng, so every peer draws the same scene.
function genDecor(rng, bases) {
  game.decor = [];
  const kinds = ['rock', 'rubble', 'crater', 'scrub', 'shard'];
  const n = 60 + 40 * bases.length;
  for (let i = 0; i < n; i++) {
    const x = 40 + rng() * (WORLD_W - 80);
    const y = 40 + rng() * (WORLD_H - 80);
    if (bases.some(b => Math.hypot(b.x - x, b.y - y) < 130)) continue;  // keep cores clear
    game.decor.push({ x, y, k: kinds[Math.floor(rng() * kinds.length)], s: 6 + rng() * 16, r: rng() * Math.PI * 2 });
  }
}

// roster: [{ fac, ai }] in spawn order. localFac = this client's faction.
// All peers call buildMatch with the same roster + seed so entity ids line up.
function buildMatch(roster, localFac, mode, seed) {
  setMapSize(roster.length);
  nextId = 1;
  const rng = makeRng(seed);
  game = {
    t: 0, over: false, defeated: false, entities: [], proj: [], fx: [], nodes: [], decor: [],
    creep: new Uint8Array(GW * GH),
    roster, localFac, mode, seed, players: {},
    aiFacs: roster.filter(r => r.ai).map(r => r.fac),
    eliminated: new Set(),
    sel: [], placing: null,
    cam: { x: 0, y: 0, z: 1 },
    creepTimer: 0, hudTimer: 0, aiTimer: 0, aiCursor: 0, netTimer: 0, netFx: [],
    aiInterval: 1.0,
  };
  // bots re-plan as often as the toughest of them demands
  const reacts = roster.filter(r => r.ai).map(r => (DIFFS[r.diff] || DIFFS.normal).react);
  game.aiInterval = reacts.length ? Math.min(...reacts) : 1.0;

  const bases = cornerBases(roster.length);
  roster.forEach((r, i) => { r.base = bases[i]; setupFaction(r.fac, bases[i], r.ai, r.diff); });
  genLayout(rng, bases);
  genDecor(rng, bases);

  const me = roster.find(r => r.fac === localFac) || roster[0];
  centerCam(me.base.x, me.base.y);

  document.getElementById('menu').style.display = 'none';
  document.getElementById('endscreen').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  const hint = document.getElementById('hint');
  hint.textContent = HINTS[localFac];
  hint.style.display = 'block';
  setTimeout(() => { if (game) hint.style.display = 'none'; }, 26000);
  document.getElementById('hudFac').textContent = FACTIONS[localFac].name;
  document.getElementById('hudFac').style.color = FACTIONS[localFac].color;
  const foes = roster.filter(r => r.fac !== localFac);
  document.getElementById('hudEnemy').innerHTML = 'FOES: ' + foes.map(r =>
    '<span style="color:' + FACTIONS[r.fac].color + '">' + FACTIONS[r.fac].name + (r.ai ? '' : '*') + '</span>').join(' · ');
  refreshCard();
}

function setupFaction(fac, base, isAI, diff) {
  const towardCenter = a => ({ x: base.x + (WORLD_W / 2 - base.x) * a, y: base.y + (WORLD_H / 2 - base.y) * a });
  const D = (isAI && DIFFS[diff]) ? DIFFS[diff] : DIFFS.normal;
  const p = {
    res: 0, isAI, base, kills: 0,
    iron: 0, ironAccum: 0, ironInc: 0,   // secondary resource (Warden: Iron)
    gainAccum: 0, income: 0,
    swarmRally: towardCenter(0.18),
    lastAttack: null, waveSize: 0,
    research: new Set(), dmgMul: 1, hpBonusMul: 1, shBonusMul: 1,
    speedMul: 1, rangeMul: 1, cdMul: 1, splashMul: 1, econMul: 1, capBonus: 0,
    // difficulty handicaps (1 / neutral for humans)
    diff: isAI ? (diff || 'normal') : null,
    incomeMul: isAI ? D.incomeMul : 1, firstWave: D.firstWave, waveStep: D.waveStep,
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
  } else if (fac === 'syndicate') {
    p.res = 400;
    spawnEnt('haven', fac, base.x, base.y);
    for (let i = 0; i < 2; i++) spawnEnt('enforcer', fac, base.x - 40 + i * 80, base.y + 70);
    p.waveSize = 8;
  } else if (fac === 'warden') {
    p.res = 250; p.iron = 40;
    spawnEnt('keep', fac, base.x, base.y);
    for (let i = 0; i < 3; i++) spawnEnt('sentinel', fac, base.x - 50 + i * 50, base.y + 72);
    p.waveSize = 10;
  } else if (fac === 'ember') {
    p.res = 200;
    spawnEnt('pyre', fac, base.x, base.y);
    for (let i = 0; i < 4; i++) spawnEnt('raider', fac, base.x - 70 + i * 36, base.y + 70);
    p.waveSize = 12;
  } else if (fac === 'verdant') {
    p.res = 200;
    spawnEnt('heart', fac, base.x, base.y);
    for (let i = 0; i < 4; i++) spawnEnt('sapling', fac, base.x - 60 + i * 34, base.y + 72);
    p.waveSize = 18;
  } else if (fac === 'stormforge') {
    p.res = 250;
    spawnEnt('reactor', fac, base.x, base.y);
    for (let i = 0; i < 2; i++) spawnEnt('arclight', fac, base.x - 40 + i * 80, base.y + 70);
    p.waveSize = 7;
  } else { // pact
    p.res = 200;
    spawnEnt('altar', fac, base.x, base.y);
    for (let i = 0; i < 5; i++) spawnEnt('thrall', fac, base.x - 80 + i * 36, base.y + 72);
    p.waveSize = 16;
  }
}

function spawnEnt(type, fac, x, y, opts = {}) {
  const d = DEFS[type];
  // units inherit their owner's researched HP/shield upgrades
  const p = game.players[fac];
  const hpMul = (d.kind === 'unit' && p) ? p.hpBonusMul : 1;
  const shMul = (d.kind === 'unit' && p) ? p.shBonusMul : 1;
  const e = {
    id: nextId++, type, def: d, fac,
    x: clamp(x, 20, WORLD_W - 20), y: clamp(y, 20, WORLD_H - 20),
    hp: d.hp * hpMul, hpMax: d.hp * hpMul, size: d.size,
    shield: (d.shield || 0) * shMul, shieldMax: (d.shield || 0) * shMul, lastHurt: -99,
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
  // ember war economy: plunder scales with the damage the warband deals to foes
  if (attacker && attacker.fac === 'ember' && t.fac !== 'ember' && game.players.ember) {
    const g = dmg0 * ECON.emberLootPerDmg * game.players.ember.incomeMul;
    game.players.ember.res += g; game.players.ember.gainAccum += g;
  }
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
      const g = (ECON.choirDeathFlat + t.hpMax * ECON.choirDeathPct) * choirP.incomeMul;
      choirP.res += g; choirP.gainAccum += g;
    }
    // syndicate collects a bounty on its kills
    if (attacker && attacker.fac === 'syndicate' && t.fac !== 'syndicate' && game.players.syndicate) {
      const g = (ECON.synBountyFlat + t.hpMax * ECON.synBountyPct) * game.players.syndicate.incomeMul;
      game.players.syndicate.res += g; game.players.syndicate.gainAccum += g;
    }
    // obsidian pact: each of your own fallen units spills Blood for the next summoning
    if (t.fac === 'pact' && t.def.kind === 'unit' && game.players.pact) {
      const g = (ECON.pactMartyrFlat + t.hpMax * ECON.pactMartyrPct) * game.players.pact.incomeMul;
      game.players.pact.res += g; game.players.pact.gainAccum += g;
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
  let best = null, bd = aggroOf(e);
  for (const o of game.entities) {
    if (o.dead || o.fac === e.fac || o.def.noTarget) continue;
    const dd = dist(e, o) - o.size;
    if (dd < bd) { bd = dd; best = o; }
  }
  return best;
}

function fireAt(e, t) {
  const d = e.def, dmg = dmgOf(e);
  e.cd = cdOf(e);
  e.tgt = t.id;
  if (d.shot === 'melee') {
    applyDamage(t, dmg, e);
    if (d.splash) splash(e, t);
    addFx({ kind: 'slash', x: t.x, y: t.y, ttl: 0.15, max: 0.15, color: facColor(e.fac) });
  } else if (d.shot === 'beam') {
    applyDamage(t, dmg, e);
    addFx({ kind: 'beam', x1: e.x, y1: e.y, x2: t.x, y2: t.y, ttl: 0.18, max: 0.18, color: facColor(e.fac) });
  } else {
    const speed = d.shot === 'shell' ? 240 : 380;
    game.proj.push({ x: e.x, y: e.y, targetId: t.id, lx: t.x, ly: t.y, speed,
      dmg, splash: splashOf(e), fac: e.fac, attackerId: e.id,
      color: d.shot === 'glob' ? '#9fe06a' : facColor(e.fac), r: d.shot === 'shell' ? 4 : 2.5 });
  }
}

function splash(e, center) {
  const dmg = dmgOf(e), rad = splashOf(e);
  for (const o of game.entities) {
    if (o.dead || o.fac === e.fac || o === center) continue;
    if (dist(center, o) < rad + o.size) applyDamage(o, dmg * 0.6, e);
  }
}

// secondary rapid-fire turrets (e.g. the Citadel's side machine guns): several
// independent guns, each tracking and shooting its own nearest target.
function updateAux(e, dt) {
  const ax = e.def.aux, guns = ax.guns || 1, p = game.players[e.fac];
  const reach = ax.range * ((p && p.rangeMul) || 1), cd = ax.cd * ((p && p.cdMul) || 1);
  if (!e.auxCd) { e.auxCd = new Array(guns).fill(0); e.auxTgt = new Array(guns).fill(0); }
  for (let i = 0; i < guns; i++) {
    e.auxCd[i] = Math.max(0, e.auxCd[i] - dt);
    let t = e.auxTgt[i] ? byId(e.auxTgt[i]) : null;
    if (!t || t.dead || dist(e, t) > reach + e.size + t.size) {
      t = null; let bd = reach + e.size;
      for (const o of game.entities) {
        if (o.dead || o.fac === e.fac || o.def.noTarget) continue;
        const dd = dist(e, o) - o.size;
        if (dd < bd) { bd = dd; t = o; }
      }
      e.auxTgt[i] = t ? t.id : 0;
    }
    if (t && e.auxCd[i] <= 0 && dist(e, t) <= reach + e.size + t.size) {
      e.auxCd[i] = cd;
      game.proj.push({ x: e.x, y: e.y, targetId: t.id, lx: t.x, ly: t.y, speed: 380,
        dmg: ax.dmg, splash: 0, fac: e.fac, attackerId: e.id, color: facColor(e.fac), r: 2.5 });
    }
  }
}

// engage target: shoot if in range else chase (unless stationary)
function engage(e, t, dt) {
  const d = e.def;
  const r = rangeOf(e) + e.size + t.size;
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
  const sp = spd(e) * dt;
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
    if (t && dist(e, t) <= rangeOf(e) + e.size + t.size && e.cd <= 0) fireAt(e, t);
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
  // apex units (Leviathan, Sovereign, …) carry their own machine-gun ring
  if (d.aux) updateAux(e, dt);
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
      if (countUnits(e.fac) < capOf(e.fac)) {
        const a = Math.random() * Math.PI * 2;
        const u = spawnEnt(d.spawns, e.fac, e.x + Math.cos(a) * (e.size + 12), e.y + Math.sin(a) * (e.size + 12));
        const r = game.players[e.fac].swarmRally;
        u.order = { type: 'amove', x: r.x, y: r.y };
      }
    }
  }
  // production / research queue (research labs have no `produces` but still queue)
  if (d.produces || (e.queue && e.queue.length)) tickQueue(e, dt);
  // turret combat
  if (d.dmg) {
    e.cd = Math.max(0, e.cd - dt);
    e.scanT -= dt;
    if (e.scanT <= 0) { e.scanT = 0.3; const t = findTarget(e); e.tgt = t ? t.id : 0; }
    const t = e.tgt ? byId(e.tgt) : null;
    if (t && dist(e, t) <= rangeOf(e) + e.size + t.size && e.cd <= 0) fireAt(e, t);
  }
  // secondary machine-gun ring (the Citadel)
  if (d.aux) updateAux(e, dt);
}

function tickQueue(e, dt) {
  if (!e.queue.length) return;
  const item = e.queue[0];
  item.t -= dt;
  if (item.t <= 0) {
    if (item.research) { e.queue.shift(); applyResearch(e.fac, item.rid); return; }
    if (countUnits(e.fac) >= capOf(e.fac)) { item.t = 0; return; } // hold until supply frees
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
  else if (game.mode === 'host' && !game.players[fac].isAI) netSend({ t: 'msg', text, to: fac });
}

function enqueue(e, type) {
  const d = DEFS[type], p = game.players[e.fac];
  if (e.queue.length >= 5) { localMsg(e.fac, 'Queue is full'); return false; }
  if (!techMet(e.fac, type)) { localMsg(e.fac, reqMsg(e.fac, type)); return false; }
  if (!affordable(p, d)) { localMsg(e.fac, costMsg(e.fac, d)); return false; }
  payFor(p, d);
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
  // no faction may build in enemy-held territory (no turret-rushing / walling the enemy base)
  const enemyNear = game.entities.some(o => !o.dead && o.fac !== fac && o.fac !== 'neutral'
    && o.def.kind === 'building' && Math.hypot(o.x - x, o.y - y) < ECON.enemyKeepout);
  if (enemyNear) { placeErrMsg = 'Too close to enemy territory'; return false; }
  return true;
}

function placeErr(fac) { return placeErrMsg; }

function placeBuilding(fac, type, x, y) {
  const d = DEFS[type], p = game.players[fac];
  if (!techMet(fac, type)) { localMsg(fac, reqMsg(fac, type)); return false; }
  if (!affordable(p, d)) { localMsg(fac, costMsg(fac, d)); return false; }
  if (!placeValid(type, fac, x, y)) { localMsg(fac, placeErr(fac)); return false; }
  if (fac === 'vanguard') {
    const w = ents(e => e.fac === fac && e.def.builder && e.order.type !== 'build')
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
    if (!w) { localMsg(fac, 'No worker available'); return false; }
    payFor(p, d);
    const site = spawnEnt(type, fac, x, y, { constructing: true });
    w.order = { type: 'build', id: site.id };
  } else {
    payFor(p, d);
    spawnEnt(type, fac, x, y, { growing: true });
  }
  return true;
}

// fraction of a building's cost returned when you sell/demolish it
const SELL_REFUND = 0.5;
// sell (demolish) one of your buildings — refunds half its cost. Cores can't be sold.
function sellBuilding(fac, id) {
  const e = byId(id);
  if (!e || e.fac !== fac || e.def.kind !== 'building' || e.def.core) return false;
  const p = game.players[fac], d = e.def;
  p.res += Math.round((d.cost || 0) * SELL_REFUND);
  p.iron = (p.iron || 0) + Math.round((d.cost2 || 0) * SELL_REFUND);
  e.dead = true;
  addFx({ kind: 'boom', x: e.x, y: e.y, r: e.size * 1.4, ttl: 0.4, max: 0.4, color: facColor(fac) });
  localMsg(fac, 'Sold ' + d.name + ' (+' + Math.round((d.cost || 0) * SELL_REFUND) + ' ' + FACTIONS[fac].res + ')');
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
  // tally creep coverage per faction here (every 0.5s) so the economy doesn't have
  // to rescan the whole grid every single frame
  const counts = {};
  for (let i = 0; i < game.creep.length; i++) { const v = game.creep[i]; if (v) counts[v] = (counts[v] || 0) + 1; }
  for (const fac in game.players) game.players[fac].creepTiles = counts[facIdx(fac)] || 0;
}

function tickEconomy(dt) {
  for (const fac in game.players) {
    const p = game.players[fac];
    let gain = 0;
    if (fac === 'myriad') {
      // creepTiles is refreshed in recomputeCreep (every 0.5s) — no per-frame rescan
      gain = ECON.myriadBase + (p.creepTiles || 0) * ECON.myriadPerTile;
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
    } else if (fac === 'warden') {
      // the fortress pays out by its mass: total HP of all finished buildings
      let hp = 0;
      for (const e of game.entities)
        if (!e.dead && e.fac === fac && e.def.kind === 'building' && !e.constructing && !e.growing) hp += e.hp;
      gain = ECON.wardenBase + hp * ECON.wardenPerHp;
    } else if (fac === 'ember') {
      gain = ECON.emberBase; // the rest is plundered through combat (see applyDamage)
    } else if (fac === 'verdant') {
      const blooms = ents(e => e.fac === fac && e.type === 'bloom' && !e.growing).length;
      gain = ECON.verdantBase + blooms * ECON.verdantPerBloom;
    } else if (fac === 'stormforge') {
      const dynamos = ents(e => e.fac === fac && e.type === 'dynamo' && !e.growing).length;
      gain = (ECON.stormBase + dynamos * ECON.stormPerDynamo) * (1 + game.t * ECON.stormRamp);
    } else if (fac === 'pact') {
      gain = ECON.pactBase; // the rest is reaped from your own dying (see applyDamage)
    }
    // every Obelisk this faction holds adds a steady trickle
    gain += ents(e => e.type === 'obelisk' && e.owner === fac).length * ECON.obeliskIncome;
    gain *= p.incomeMul * (p.econMul || 1); // AI handicap × researched economy upgrades
    p.res += gain * dt;
    p.gainAccum += gain * dt;

    // secondary resource: the Warden mints Iron from every finished Iron Forge
    let iron = 0;
    for (const e of game.entities)
      if (!e.dead && e.fac === fac && e.def.ironPerSec && !e.constructing && !e.growing) iron += e.def.ironPerSec;
    if (iron) { iron *= p.incomeMul * (p.econMul || 1); p.iron += iron * dt; p.ironAccum += iron * dt; }
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
// Tight all-pairs loop (V8 JITs this far better than a spatial grid at the unit
// counts this game reaches). The one real fix over the old version: push units out
// of a pre-filtered BUILDINGS list rather than re-scanning every entity per unit.
function separation() {
  const units = ents(e => e.def.kind === 'unit');
  const buildings = ents(e => e.def.kind === 'building');
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
    for (const s of buildings) {
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

