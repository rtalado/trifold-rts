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

// is (x,y) within `pad` of any impassable terrain obstacle?
function onObstacle(x, y, pad = 0) {
  for (const o of game.obstacles) if (Math.hypot(o.x - x, o.y - y) < o.r + pad) return true;
  return false;
}

// impassable rock/cliff terrain, seeded deterministically. The centrepiece is a
// broken ring of cliffs around the central prize, leaving a lane toward each base
// corner — so the middle Obelisk, Hoard and Bunker sit behind real chokepoints.
// A scatter of boulder clusters breaks up the open field elsewhere. The cliffs are
// spaced (not a solid wall) so units flow around them without needing pathfinding.
function genObstacles(rng, bases) {
  game.obstacles = [];
  const cx = WORLD_W / 2, cy = WORLD_H / 2;
  const clearOf = (x, y, pad) => bases.every(b => Math.hypot(b.x - x, b.y - y) > 360 + pad)
    && Math.hypot(cx - x, cy - y) > 150;
  const add = (x, y, r) => { if (clearOf(x, y, 0)) game.obstacles.push({ x: clamp(x, 40, WORLD_W - 40), y: clamp(y, 40, WORLD_H - 40), r }); };
  // wide lanes left open toward each map corner (every base sits in a corner)
  const lanes = [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4];
  const ringR = Math.min(WORLD_W, WORLD_H) * 0.27;
  const steps = 30;
  for (let i = 0; i < steps; i++) {
    const a = i / steps * Math.PI * 2;
    if (lanes.some(L => Math.abs(((a - L + Math.PI) % (Math.PI * 2)) - Math.PI) < 0.34)) continue;
    const jr = ringR + (rng() - 0.5) * 50;
    add(cx + Math.cos(a) * jr, cy + Math.sin(a) * jr, 34 + rng() * 18);
  }
  // scattered boulder clusters across the open field (minor cover / chokepoints)
  const clusters = 4 + bases.length;
  for (let c = 0; c < clusters; c++) {
    let bx = 0, by = 0, ok = false;
    for (let k = 0; k < 30 && !ok; k++) {
      bx = 120 + rng() * (WORLD_W - 240);
      by = 120 + rng() * (WORLD_H - 240);
      ok = clearOf(bx, by, 90) && Math.hypot(cx - bx, cy - by) > ringR + 140;
    }
    if (!ok) continue;
    const rocks = 2 + (rng() * 3 | 0);
    for (let j = 0; j < rocks; j++)
      add(bx + (rng() - 0.5) * 120, by + (rng() - 0.5) * 120, 26 + rng() * 22);
  }
}

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
    onObstacle(x, y, d) ||
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

  // 3) neutral "jungle": lots of small caches, a scatter of Hoards, capture Obelisks,
  // and a few heavily-guarded Munitions Bunkers (a big bounty for anyone, a Powder
  // cache for the Warden). More Obelisks now — map control is the main way to scale.
  const caches  = 12 + 9 * P;          // 2p:30  3p:39  4p:48
  const hoards  = 3 + P;               // 2p:5   3p:6   4p:7
  const obs     = 4 + 2 * P;           // 2p:8   3p:10  4p:12 (home econ is capped — territory IS the economy)
  const bunkers = 1 + P;               // 2p:3   3p:4   4p:5
  for (let i = 0; i < caches;  i++) { const s = findSpot(90, 300, 160);  if (s) spawnEnt('cache',   'neutral', s.x, s.y); }
  for (let i = 0; i < hoards;  i++) { const s = findSpot(120, 420, 240); if (s) spawnEnt('hoard',   'neutral', s.x, s.y); }
  for (let i = 0; i < obs;     i++) { const s = findSpot(120, 420, 260); if (s) spawnEnt('obelisk', 'neutral', s.x, s.y); }
  for (let i = 0; i < bunkers; i++) { const s = findSpot(140, 520, 300); if (s) spawnEnt('munitions', 'neutral', s.x, s.y); }

  // Wellsprings: the faction-specific expansion economy. Scattered out in contested
  // ground (kept well away from any base) so reaching one means marching out and
  // chaining your economy toward it. More of them on bigger maps.
  const wells = 5 + 3 * P;             // 2p:11  3p:14  4p:17 — lots of ground to fight over
  for (let i = 0; i < wells; i++) { const s = findSpot(140, 480, 300); if (s) spawnEnt('wellspring', 'neutral', s.x, s.y); }

  // 4) central contested prize, behind the cliff-ring chokepoints: a guarded Hoard,
  // an Obelisk, a Munitions Bunker and rich crystal nodes — worth marching for.
  spawnEnt('obelisk', 'neutral', cx, cy);
  spawnEnt('hoard', 'neutral', cx + 150, cy);
  spawnEnt('munitions', 'neutral', cx, cy + 175);
  node(cx - 170, cy, 3200); node(cx, cy - 170, 3200);
}

// roster: [{ fac, ai }] in spawn order. localFac = this client's faction.
// All peers call buildMatch with the same roster + seed so entity ids line up.
function buildMatch(roster, localFac, mode, seed) {
  setMapSize(roster.length);
  nextId = 1;
  const rng = makeRng(seed);
  game = {
    t: 0, over: false, defeated: false, entities: [], proj: [], fx: [], strikes: [], nodes: [], obstacles: [],
    creep: new Uint8Array(GW * GH),
    roster, localFac, mode, seed, players: {},
    aiFacs: roster.filter(r => r.ai).map(r => r.fac),
    eliminated: new Set(),
    sel: [], placing: null,
    cam: { x: 0, y: 0, z: 1 },
    creepTimer: 0, hudTimer: 0, aiTimer: 0, aiCursor: 0, netTimer: 0, netFx: [],
    aiInterval: 1.0,
    nav: null, navDirty: true, navBuilt: -9, pathCalls: 0,   // pathfinding state (nav.js)
  };
  // bots re-plan as often as the toughest of them demands
  const reacts = roster.filter(r => r.ai).map(r => (DIFFS[r.diff] || DIFFS.normal).react);
  game.aiInterval = reacts.length ? Math.min(...reacts) : 1.0;

  const bases = cornerBases(roster.length);
  roster.forEach((r, i) => { r.base = bases[i]; setupFaction(r.fac, bases[i], r.ai, r.diff); });
  genObstacles(rng, bases);   // impassable terrain (before the layout, so loot avoids it)
  genLayout(rng, bases);

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
    powder: 0, powderAccum: 0, powderInc: 0,   // tertiary resource (Warden: Powder)
    gainAccum: 0, income: 0,
    swarmRally: towardCenter(0.18),
    lastAttack: null, waveSize: 0,
    research: new Set(), dmgMul: 1, hpBonusMul: 1, shBonusMul: 1,
    speedMul: 1, rangeMul: 1, cdMul: 1, splashMul: 1, econMul: 1, capBonus: 0,
    arkTier: 0,   // Solari Exodus: how far the Ark has been upgraded
    gMoon: false, gNecro: false, gWild: false,   // Verdant: standing Heartwood Grafts

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
    p.res = 250; p.iron = 40; p.powder = 0;
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
  // the Ark's base size/HP/shields come from its current upgrade tier
  const bHp = type === 'ark' ? arkTierData(fac).hp : d.hp;
  const bSh = type === 'ark' ? arkTierData(fac).shield : (d.shield || 0);
  const bSize = type === 'ark' ? arkTierData(fac).size : d.size;
  const e = {
    id: nextId++, type, def: d, fac,
    x: clamp(x, 20, WORLD_W - 20), y: clamp(y, 20, WORLD_H - 20),
    hp: bHp * hpMul, hpMax: bHp * hpMul, size: bSize,
    shield: bSh * shMul, shieldMax: bSh * shMul, lastHurt: -99,
    cd: 0, blinkCd: 0, scanT: Math.random() * 0.25, tgt: 0,
    order: { type: 'idle' }, dead: false,
    queue: [], rqueue: [], rally: null, deployed: false,
  };
  if (d.creepR) e.creepCur = opts.creepCur != null ? opts.creepCur : 2;
  if (d.spawns) e.spawnTimer = d.spawnEvery;
  if (d.ability) e.abilityCd = 0;   // active-ability buildings start ready
  // Wildgrowth Graft: free Saplings erupt as bigger, fiercer mutated Saplings
  if (d.freeUnit && p && p.gWild) {
    e.mutated = true;
    e.size = Math.round(bSize * VERD.mutSize);
    e.hpMax = bHp * hpMul * VERD.mutHp; e.hp = e.hpMax;
  }
  if (opts.constructing) { e.constructing = true; e.progress = 0; e.hp = Math.max(20, d.hp * 0.12); }
  if (opts.growing) { e.growing = true; e.progress = 0; e.hp = Math.max(20, d.hp * 0.25); }
  if (d.kind === 'building') game.navDirty = true;   // new blocker → re-plan paths
  game.entities.push(e);
  return e;
}

// ---------------- damage / death ----------------
function applyDamage(t, dmg, attacker) {
  if (t.dead || t.def.noTarget) return;  // Obelisks are captured, never destroyed
  if (t.def.invuln && !t.constructing && !t.growing) return;  // the Erdtree: an indestructible living wall
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
  // myriad corruption: every Myriad attack infects the foe it strikes (units &
  // buildings, never neutrals); corruption units/towers (`corrupt`) inflict a longer
  // dose. A corrupted foe deals less damage, is slowed, rots, and bursts Larva on death.
  if (attacker && attacker.fac === 'myriad' && t.fac !== 'myriad' && t.fac !== 'neutral') {
    t.corruptUntil = Math.max(t.corruptUntil || 0, game.t + (attacker.def.corrupt || CORRUPT.baseDur));
  }
  // ember burning: every Ember attack ignites the foe it strikes (units & buildings,
  // never neutrals); fire units/towers (`burn`) set a longer blaze. A burning foe takes
  // a fire DoT that itself keeps paying Plunder (see tickBurning).
  if (attacker && attacker.fac === 'ember' && t.fac !== 'ember' && t.fac !== 'neutral') {
    t.burnUntil = Math.max(t.burnUntil || 0, game.t + (attacker.def.burn || BURN.baseDur));
  }
  // retaliate if idle
  if (attacker && !attacker.dead && t.def.dmg > 0 && !t.def.harvester && t.def.kind === 'unit'
      && !t.def.stationary && t.order.type === 'idle') {
    t.order = { type: 'attack', id: attacker.id };
  }
  if (t.hp <= 0) {
    // Necrotic Graft: your buildings don't die — they collapse into inert withered
    // husks (still blocking) that a Fertiliser Pod can nurse back to life. Cores and
    // the Grafts themselves are never spared (you can still lose them, and the mutation).
    if (t.def.kind === 'building' && !t.def.core && !t.def.graft && !t.withered
        && game.players[t.fac] && game.players[t.fac].gNecro) {
      t.withered = true;
      t.hp = Math.max(1, t.hpMax * VERD.witherHp);
      t.tgt = 0; t.queue = []; t.rqueue = [];
      addFx({ kind: 'boom', x: t.x, y: t.y, r: t.size, ttl: 0.4, max: 0.4, color: '#6b4a22' });
      return;
    }
    t.dead = true;
    if (t.def.kind === 'building') game.navDirty = true;   // blocker gone → re-plan paths
    // Necrotic Graft: the garden feeds on the enemy dead nearby, growing permanently stronger
    if (t.def.kind === 'unit' && t.fac !== 'neutral')
      for (const f in game.players)
        if (f !== t.fac && game.players[f].gNecro) growNecrotic(f, t.x, t.y);
    if (attacker && game.players[attacker.fac]) game.players[attacker.fac].kills++;
    // myriad infestation: a CORRUPTED enemy unit bursts free Larva from its corpse —
    // bounded by the free-Larva cap so a big fight can't spawn an unbounded tide.
    if (t.corruptUntil > game.t && t.def.kind === 'unit' && t.fac !== 'myriad' && t.fac !== 'neutral' && game.players.myriad) {
      const room = freeCapOf('myriad') - countFree('myriad');
      const burst = Math.max(0, Math.min(CORRUPT.larvaBurst, room));
      for (let i = 0; i < burst; i++) {
        const a = Math.random() * Math.PI * 2;
        spawnEnt('larva', 'myriad', t.x + Math.cos(a) * 10, t.y + Math.sin(a) * 10);
      }
      if (burst > 0) addFx({ kind: 'boom', x: t.x, y: t.y, r: t.size * 1.5, ttl: 0.4, max: 0.4, color: '#9a4dd0' });
    }
    // every death anywhere pays the Choir essence — friend or foe
    const choirP = game.players.choir;
    if (choirP) {
      const g = (ECON.choirDeathFlat + t.hpMax * ECON.choirDeathPct) * choirP.incomeMul;
      choirP.res += g; choirP.gainAccum += g;
      // REANIMATION: a share of every non-Choir unit that falls rises as a free Husk
      // under the Choir (bounded by the free-Husk cap), so death swells the deathless host.
      if (t.def.kind === 'unit' && t.fac !== 'choir' && t.fac !== 'neutral'
          && Math.random() < REANIM.chance && countFree('choir') < freeCapOf('choir')) {
        const a = Math.random() * Math.PI * 2;
        spawnEnt('husk', 'choir', t.x + Math.cos(a) * 10, t.y + Math.sin(a) * 10);
        addFx({ kind: 'boom', x: t.x, y: t.y, r: t.size * 1.4, ttl: 0.4, max: 0.4, color: '#3fe0c8' });
      }
    }
    // OBSIDIAN PACT blood frenzy: a Pact unit's death whips every nearby Pact unit into
    // a frenzy — striking harder and faster for a few seconds (read live in dmgOf/cdOf).
    if (t.fac === 'pact' && t.def.kind === 'unit' && game.players.pact) {
      const r2 = PACT.frenzyR * PACT.frenzyR;
      for (const o of game.entities) {
        if (o.dead || o === t || o.fac !== 'pact' || o.def.kind !== 'unit') continue;
        const dx = o.x - t.x, dy = o.y - t.y;
        if (dx * dx + dy * dy < r2) o.frenzyUntil = game.t + PACT.dur;
      }
    }
    // syndicate collects a bounty on its kills
    if (attacker && attacker.fac === 'syndicate' && t.fac !== 'syndicate' && game.players.syndicate) {
      const g = (ECON.synBountyFlat + t.hpMax * ECON.synBountyPct) * game.players.syndicate.incomeMul;
      game.players.syndicate.res += g; game.players.syndicate.gainAccum += g;
    }
    // syndicate severance insurance: a fallen merc refunds part of its hire price
    if (t.fac === 'syndicate' && t.def.kind === 'unit' && (t.def.cost || 0) > 0 && game.players.syndicate) {
      const g = t.def.cost * ECON.synSeverance * game.players.syndicate.incomeMul;
      game.players.syndicate.res += g; game.players.syndicate.gainAccum += g;
    }
    // obsidian pact: each of your own fallen units spills Blood for the next summoning
    if (t.fac === 'pact' && t.def.kind === 'unit' && game.players.pact) {
      const g = (ECON.pactMartyrFlat + t.hpMax * ECON.pactMartyrPct) * game.players.pact.incomeMul;
      game.players.pact.res += g; game.players.pact.gainAccum += g;
    }
    // cracking open a neutral Hoard / Bunker pays its destroyer a one-time bounty —
    // and a Bunker also yields a cache of Powder to a Warden, for its grand projects
    if (t.def.bounty && attacker && game.players[attacker.fac]) {
      const p = game.players[attacker.fac], af = attacker.fac;
      p.res += t.def.bounty; p.gainAccum += t.def.bounty;
      let msg = (t.type === 'munitions' ? 'Bunker cracked: +' : 'Hoard plundered: +') + t.def.bounty + ' ' + FACTIONS[af].res;
      if (t.def.powder && FACTIONS[af].res3) {
        p.powder = (p.powder || 0) + t.def.powder; p.powderAccum += t.def.powder;
        msg += ' +' + t.def.powder + ' ' + FACTIONS[af].res3;
      }
      localMsg(af, msg);
    }
    addFx({ kind: 'boom', x: t.x, y: t.y, r: t.size * 1.6, ttl: 0.5, max: 0.5, color: facColor(t.fac) });
  }
}

function addFx(f) {
  game.fx.push(f);
  if (game.mode === 'host') game.netFx.push(f); // forwarded in the next snapshot
}

// Necrotic Graft: when an enemy falls, every nearby (within build range) finished
// plant/beast of faction `fac` gains a permanent stacking buff (+HP now, +damage via
// dmgOf), up to a cap. Cores and withered husks don't feed.
function growNecrotic(fac, x, y) {
  const r2 = VERD.necroRange * VERD.necroRange;
  for (const e of game.entities) {
    if (e.dead || e.fac !== fac || e.constructing || e.growing || e.withered || e.def.core) continue;
    if ((e.necroStacks || 0) >= VERD.necroMaxStacks) continue;
    const dx = e.x - x, dy = e.y - y;
    if (dx * dx + dy * dy > r2) continue;
    e.necroStacks = (e.necroStacks || 0) + 1;
    const add = (e.def.kind === 'unit' ? baseHp(e) : e.def.hp) * VERD.necroStackHp;
    e.hpMax += add; e.hp += add;
  }
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
  if (e.fac === game.localFac && onScreen(e.x, e.y)) playSfxThrottled('shoot', 55);
  e.cd = cdOf(e);
  e.tgt = t.id;
  if (d.shot === 'melee') {
    applyDamage(t, dmg, e);
    if (d.splash) splash(e, t);
    addFx({ kind: 'slash', x: t.x, y: t.y, ttl: 0.15, max: 0.15, color: facColor(e.fac) });
  } else if (d.shot === 'beam') {
    applyDamage(t, dmg, e);
    if (d.splash) splash(e, t); // chaining/arcing beams (e.g. the Galvan) splash on hit
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
  const ax = e.def.aux, guns = auxGunsOf(e), p = game.players[e.fac];
  const mul = arkStatMul(e);   // the Ark's aux damage & reach also scale with its tier
  const reach = ax.range * ((p && p.rangeMul) || 1) * mul, cd = ax.cd * ((p && p.cdMul) || 1);
  const auxDmg = ax.dmg * mul;
  // (re)size the per-gun state when the gun count changes (the Ark adds guns as it ascends)
  if (!e.auxCd || e.auxCd.length !== guns) { e.auxCd = new Array(guns).fill(0); e.auxTgt = new Array(guns).fill(0); }
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
        dmg: auxDmg, splash: 0, fac: e.fac, attackerId: e.id, color: facColor(e.fac), r: 2.5 });
    }
  }
}

// ---------------- active abilities (the Worldbreaker's Gustav Strike) ----------------
// Fire a building's targeted ground ability at (wx,wy). Runs on the simulating side
// (SP or host). Returns true if the strike was launched. The shell is telegraphed:
// a warning marker shows for `delay` seconds before it lands, so a sharp opponent
// can scatter — power, but not a free instant-win button.
function fireAbility(fac, e, wx, wy) {
  if (!e || e.dead || e.fac !== fac || !e.def.ability) return false;
  if (e.constructing || e.growing) { localMsg(fac, 'Still being raised'); return false; }
  const ab = e.def.ability;
  if ((e.abilityCd || 0) > 0) { localMsg(fac, ab.name + ' reloading (' + Math.ceil(e.abilityCd) + 's)'); return false; }
  if (dist(e, { x: wx, y: wy }) > ab.range) { localMsg(fac, 'Target out of range'); return false; }
  // spawn-type ability (the Syndicate's Reinforcement Drop): air-drop a free squad at
  // the target — but never into enemy territory (no dropping mercs on top of their base)
  if (ab.spawn) {
    const enemyNear = game.entities.some(o => !o.dead && o.fac !== fac && o.fac !== 'neutral'
      && o.def.kind === 'building' && Math.hypot(o.x - wx, o.y - wy) < ECON.enemyKeepout);
    if (enemyNear) { localMsg(fac, 'Cannot drop into enemy territory'); return false; }
    e.abilityCd = ab.cd;
    const n = ab.count || 3;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      spawnEnt(ab.spawn, fac, wx + Math.cos(ang) * 18, wy + Math.sin(ang) * 18);
    }
    addFx({ kind: 'shock', x: wx, y: wy, r: 60, ttl: 0.6, max: 0.6, color: '#ffd97d' });
    localMsg(fac, ab.name + ' — mercs inbound!');
    return true;
  }
  // corruption-type ability (the Myriad's Corruption Bloom): heavily corrupt and burst-
  // damage every enemy in a radius (corrupted dead then burst Larva via applyDamage).
  if (ab.corrupt) {
    e.abilityCd = ab.cd;
    for (const o of game.entities) {
      if (o.dead || o.fac === fac || o.fac === 'neutral' || o.def.noTarget) continue;
      if (Math.hypot(o.x - wx, o.y - wy) > ab.radius + o.size) continue;
      o.corruptUntil = Math.max(o.corruptUntil || 0, game.t + ab.corruptDur);
      applyDamage(o, ab.dmg, e);
    }
    addFx({ kind: 'shock', x: wx, y: wy, r: ab.radius, ttl: 0.7, max: 0.7, color: '#9a4dd0' });
    addFx({ kind: 'beam', x1: e.x, y1: e.y, x2: wx, y2: wy, ttl: 0.4, max: 0.4, color: '#c75cff' });
    localMsg(fac, ab.name + ' — corruption blooms!');
    return true;
  }
  // dirge-type ability (the Choir's Dirge of the Damned): a death-nova that burst-damages
  // every enemy in a radius (the slain reanimate via applyDamage) and mends every Choir
  // spirit caught (`heal` is a fraction of max HP restored).
  if (ab.key === 'dirge') {
    e.abilityCd = ab.cd;
    for (const o of game.entities) {
      if (o.dead || o.def.noTarget) continue;
      if (Math.hypot(o.x - wx, o.y - wy) > ab.radius + o.size) continue;
      if (o.fac === fac) { if (o.hpMax > 0) o.hp = Math.min(o.hpMax, o.hp + o.hpMax * ab.heal); }
      else if (o.fac !== 'neutral') applyDamage(o, ab.dmg, e);
    }
    addFx({ kind: 'shock', x: wx, y: wy, r: ab.radius, ttl: 0.7, max: 0.7, color: '#3fe0c8' });
    addFx({ kind: 'beam', x1: e.x, y1: e.y, x2: wx, y2: wy, ttl: 0.4, max: 0.4, color: '#9ff0e2' });
    localMsg(fac, ab.name + ' — the dead answer!');
    return true;
  }
  // firestorm-type ability (the Ember Nomads' Firestorm): ignite and burst-burn every
  // enemy in a radius (burning foes keep paying Plunder as they cook — see tickBurning).
  if (ab.key === 'firestorm') {
    e.abilityCd = ab.cd;
    for (const o of game.entities) {
      if (o.dead || o.fac === fac || o.fac === 'neutral' || o.def.noTarget) continue;
      if (Math.hypot(o.x - wx, o.y - wy) > ab.radius + o.size) continue;
      o.burnUntil = Math.max(o.burnUntil || 0, game.t + ab.burnDur);
      applyDamage(o, ab.dmg, e);
    }
    addFx({ kind: 'shock', x: wx, y: wy, r: ab.radius, ttl: 0.7, max: 0.7, color: '#ff8a2a' });
    addFx({ kind: 'beam', x1: e.x, y1: e.y, x2: wx, y2: wy, ttl: 0.4, max: 0.4, color: '#ffd27a' });
    localMsg(fac, ab.name + ' — the world burns!');
    return true;
  }
  // rite-type ability (the Obsidian Pact's Crimson Rite): rupture every enemy in a radius
  // for a burst of damage, and whip every nearby Pact unit into a frenzy (dmgOf/cdOf).
  if (ab.key === 'rite') {
    e.abilityCd = ab.cd;
    for (const o of game.entities) {
      if (o.dead || o.def.noTarget) continue;
      const within = Math.hypot(o.x - wx, o.y - wy) <= ab.radius + o.size;
      if (!within) continue;
      if (o.fac === fac) { if (o.def.kind === 'unit') o.frenzyUntil = game.t + ab.frenzyDur; }
      else if (o.fac !== 'neutral') applyDamage(o, ab.dmg, e);
    }
    addFx({ kind: 'shock', x: wx, y: wy, r: ab.radius, ttl: 0.7, max: 0.7, color: '#c0303a' });
    addFx({ kind: 'beam', x1: e.x, y1: e.y, x2: wx, y2: wy, ttl: 0.4, max: 0.4, color: '#ff5a5a' });
    localMsg(fac, ab.name + ' — the horde rages!');
    return true;
  }
  e.abilityCd = ab.cd;
  // ground-strike abilities scale with the Ark's ascension tier (arkStatMul is 1 for
  // every non-Ark caster, so the Worldbreaker's Gustav Strike is unaffected): damage
  // grows with the full tier multiplier, the blast radius grows more gently.
  const mul = arkStatMul(e);
  const dmg = ab.dmg * mul, splash = ab.splash * (0.6 + 0.4 * mul);
  game.strikes.push({ x: wx, y: wy, t: ab.delay, dmg, splash, fac, attackerId: e.id });
  // a long-lived warning marker (forwarded to guests as cosmetic fx) telegraphs the
  // hit. sx/sy carry the gun's muzzle so the renderer can fly a huge shell in.
  addFx({ kind: 'strikewarn', x: wx, y: wy, sx: e.x, sy: e.y, r: splash, ttl: ab.delay, max: ab.delay, color: facColor(fac) });
  // muzzle flash + a streak from the gun toward the impact point
  addFx({ kind: 'beam', x1: e.x, y1: e.y, x2: wx, y2: wy, ttl: 0.4, max: 0.4, color: '#ffd9a0' });
  localMsg(fac, ab.name + ' away!');
  return true;
}

// Myriad corruption: corrupted enemies slowly rot (a light corrosion DoT). The debuff's
// other effects — reduced damage and speed — are read live in dmgOf/spd; this only ticks
// the rot. Runs on the simulating side (SP/host). `n` is captured so Larva burst from a
// rot-kill this frame aren't themselves processed.
function tickCorruption(dt) {
  if (!game.players.myriad) return;
  const es = game.entities, n = es.length;
  for (let i = 0; i < n; i++) {
    const e = es[i];
    if (e.dead || e.fac === 'myriad' || e.fac === 'neutral') continue;
    if (e.corruptUntil > game.t) applyDamage(e, CORRUPT.dps * dt, null);
  }
}

// Ember burning: a burning enemy takes a fire DoT — and because Plunder is paid on the
// damage the warband deals, the burn keeps paying out as the foe cooks. We damage with a
// null attacker (so applyDamage doesn't double-credit) and bank the Plunder here.
// Runs on the simulating side (SP/host). `n` is captured so deaths this frame are safe.
function tickBurning(dt) {
  const ep = game.players.ember;
  const es = game.entities, n = es.length;
  for (let i = 0; i < n; i++) {
    const e = es[i];
    if (e.dead || e.fac === 'ember' || e.fac === 'neutral') continue;
    if (e.burnUntil > game.t) {
      const dmg = BURN.dps * dt;
      applyDamage(e, dmg, null);
      if (ep) { const g = dmg * ECON.emberLootPerDmg * ep.incomeMul; ep.res += g; ep.gainAccum += g; }
    }
  }
}

// pending ground strikes detonate when their flight timer expires
function tickStrikes(dt) {
  if (!game.strikes.length) return;
  for (const s of game.strikes) {
    s.t -= dt;
    if (s.t > 0) continue;
    s.done = true;
    const attacker = byId(s.attackerId);
    for (const o of game.entities) {
      if (o.dead || o.fac === s.fac || o.def.noTarget) continue;
      if (Math.hypot(o.x - s.x, o.y - s.y) < s.splash + o.size) applyDamage(o, s.dmg, attacker);
    }
    // big detonation: an expanding shockwave ring + a flash
    addFx({ kind: 'shock', x: s.x, y: s.y, r: s.splash * 1.6, ttl: 0.8, max: 0.8, color: '#ffe2b0' });
    addFx({ kind: 'boom', x: s.x, y: s.y, r: s.splash, ttl: 0.6, max: 0.6, color: facColor(s.fac) });
  }
  game.strikes = game.strikes.filter(s => !s.done);
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
      navMove(e, t.x, t.y, dt);
    }
  }
}

// ranged units snap off a shot at the nearest foe in range without breaking
// stride — so a relocating, retreating or kiting squad keeps up its fire while it
// moves. Melee units (and anything without a gun) need to stop and close, so they
// skip this. Target scanning is throttled (scanT) just like the idle/amove scans.
function moveFire(e, dt) {
  const d = e.def;
  if (d.shot === 'melee' || !d.dmg || !d.aggro) return;
  e.scanT -= dt;
  if (e.scanT <= 0) { e.scanT = 0.3; const t = findTarget(e); e.tgt = t ? t.id : 0; }
  const t = e.tgt ? byId(e.tgt) : null;
  if (t && e.cd <= 0 && dist(e, t) <= rangeOf(e) + e.size + t.size) fireAt(e, t);
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
      const arrived = navMove(e, o.x, o.y, dt);
      moveFire(e, dt);   // ranged units shoot on the run while relocating/retreating
      if (arrived) e.order = { type: 'idle' };
      break;
    }
    case 'amove': {
      if (d.dmg > 0 && d.aggro > 0) {
        e.scanT -= dt;
        if (e.scanT <= 0) { e.scanT = 0.25; const t = findTarget(e); e.tgt = t ? t.id : 0; }
        const t = e.tgt ? byId(e.tgt) : null;
        if (t) { engage(e, t, dt); break; }
      }
      if (navMove(e, o.x, o.y, dt)) e.order = { type: 'idle' };
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
      if (dist(e, site) > site.size + e.size + 8) { navMove(e, site.x, site.y, dt); break; }
      site.progress += dt;
      // construction ADDS hp over time rather than setting it, so a half-built site can
      // still be damaged (and destroyed) mid-build — the build rate carries a pristine
      // site from its 12% start to full over its build time.
      site.hp = Math.min(site.hpMax, site.hp + site.hpMax * 0.88 * (dt / site.def.time));
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
    else navMove(e, node.x, node.y, dt);
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
    } else navMove(e, drop.x, drop.y, dt);
  }
}

// ---------------- building update ----------------
function updateBuilding(e, dt) {
  const d = e.def;
  if (e.constructing) return;           // built by a worker, see 'build' order
  if (e.withered) return;               // Necrotic husk: inert until a Fertiliser Pod heals it back
  if (e.growing) {
    // Moonsign Graft hastens everything the garden grows
    const p = game.players[e.fac];
    if (p && p.gMoon) dt *= VERD.moonProd;
    e.progress += dt;
    // grow ADDS hp over time rather than setting it, so a growing structure can still be
    // damaged (and destroyed) mid-grow instead of being effectively invincible.
    e.hp = Math.min(e.hpMax, e.hp + e.hpMax * 0.75 * (dt / d.time));
    if (e.progress >= d.time) { e.growing = false; e.hp = e.hpMax; }
    return;
  }
  // Moonsign Graft: quicken free-spawn timers and production queues
  { const p = game.players[e.fac]; if (p && p.gMoon) dt *= VERD.moonProd; }
  // creep growth
  if (d.creepR) e.creepCur = Math.min(d.creepR, e.creepCur + dt * 0.35);
  // free auto-spawn
  if (d.spawns) {
    e.spawnTimer -= dt;
    if (e.spawnTimer <= 0) {
      e.spawnTimer = d.spawnEvery;
      const free = DEFS[d.spawns].freeUnit;   // Saplings draw on their own separate cap
      if (free ? countFree(e.fac) < freeCapOf(e.fac) : countUnits(e.fac) < capOf(e.fac)) {
        const a = Math.random() * Math.PI * 2;
        const u = spawnEnt(d.spawns, e.fac, e.x + Math.cos(a) * (e.size + 12), e.y + Math.sin(a) * (e.size + 12));
        const r = game.players[e.fac].swarmRally;
        u.order = { type: 'amove', x: r.x, y: r.y };
      }
    }
  }
  // production / research queues (research labs have no `produces` but still queue)
  if (d.produces || (e.queue && e.queue.length) || (e.rqueue && e.rqueue.length)) tickQueue(e, dt);
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
  // active-ability reload (the Worldbreaker's Gustav Strike)
  if (d.ability && e.abilityCd > 0) e.abilityCd = Math.max(0, e.abilityCd - dt);
}

function tickQueue(e, dt) {
  // unit production
  if (e.queue && e.queue.length) {
    const item = e.queue[0];
    item.t -= dt;
    if (item.t <= 0) {
      const free = DEFS[item.type].freeUnit;
      if (free ? countFree(e.fac) >= freeCapOf(e.fac) : countUnits(e.fac) >= capOf(e.fac)) item.t = 0; // hold until supply frees
      else {
        e.queue.shift();
        const a = Math.random() * Math.PI * 2;
        const u = spawnEnt(item.type, e.fac, e.x + Math.cos(a) * (e.size + 14), e.y + Math.sin(a) * (e.size + 14));
        const r = e.rally || { x: e.x + 50, y: e.y + 50 };
        u.order = u.def.harvester ? { type: 'move', x: r.x, y: r.y } : { type: 'amove', x: r.x, y: r.y };
      }
    }
  }
  // research runs on its own track, in parallel with production
  if (e.rqueue && e.rqueue.length) {
    const it = e.rqueue[0];
    it.t -= dt;
    if (it.t <= 0) { e.rqueue.shift(); applyResearch(e.fac, it.rid); }
  }
}

// route an error message to whichever human owns this faction (local or remote)
function localMsg(fac, text) {
  if (fac === game.localFac) floatMsg(text);
  else if (game.mode === 'host' && !game.players[fac].isAI) netSend({ t: 'msg', text, to: fac });
}

const MAX_QUEUE = 12;
function enqueue(e, type) {
  const d = DEFS[type], p = game.players[e.fac];
  if (e.queue.length >= MAX_QUEUE) { localMsg(e.fac, 'Queue is full'); return false; }
  if (!techMet(e.fac, type)) { localMsg(e.fac, reqMsg(e.fac, type)); return false; }
  if (!affordable(p, d)) { localMsg(e.fac, costMsg(e.fac, d)); return false; }
  payFor(p, d);
  e.queue.push({ type, t: d.time, total: d.time });
  return true;
}

// cancel a queued item, refunding what it cost. idx 0 is the one in progress.
// `research` true cancels from the research queue, else the production queue.
function dequeue(e, idx, research) {
  const q = research ? e.rqueue : e.queue;
  if (!e || !q || idx < 0 || idx >= q.length) return false;
  const item = q[idx], p = game.players[e.fac];
  if (item.research) { const r = RESEARCH[item.rid]; if (r) p.res += r.cost; }
  else { const d = DEFS[item.type]; if (d) { p.res += d.cost || 0; p.iron = (p.iron || 0) + (d.cost2 || 0); p.powder = (p.powder || 0) + (d.cost3 || 0); } }
  q.splice(idx, 1);
  return true;
}

// ---- Solari Exodus: buy the next Ark upgrade ----
function upgradeArk(fac, e) {
  if (!e || e.dead || e.fac !== fac || e.type !== 'ark') return false;
  if (e.constructing) { localMsg(fac, 'Still being raised'); return false; }
  const p = game.players[fac], tier = p.arkTier || 0;
  if (tier >= ARK_UPGRADES.length) { localMsg(fac, 'The Ark is fully ascended'); return false; }
  const up = ARK_UPGRADES[tier];
  if (p.res < up.cost) { localMsg(fac, 'Need ' + up.cost + ' ' + FACTIONS[fac].res); return false; }
  p.res -= up.cost;
  p.arkTier = tier + 1;
  refreshArk(fac);
  addFx({ kind: 'shock', x: e.x, y: e.y, r: e.size + 30, ttl: 0.7, max: 0.7, color: '#ffe3a3' });
  localMsg(fac, up.name + ' — the Ark grows');
  return true;
}

// re-derive each Ark's size/HP/shields from the player's current tier, keeping
// its health fraction. Runs when an upgrade is bought (and on guests per snapshot).
function refreshArk(fac) {
  const p = game.players[fac];
  for (const e of ents(o => o.fac === fac && o.type === 'ark')) {
    const hpFrac = e.hpMax > 0 ? clamp(e.hp / e.hpMax, 0, 1) : 1;
    const shFrac = e.shieldMax > 0 ? clamp(e.shield / e.shieldMax, 0, 1) : 0;
    e.size = baseSize(e);
    e.hpMax = baseHp(e) * (p.hpBonusMul || 1); e.hp = e.hpMax * hpFrac;
    e.shieldMax = baseShield(e) * (p.shBonusMul || 1); e.shield = e.shieldMax * shFrac;
  }
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
  if (onObstacle(x, y, d.size + 8)) { placeErrMsg = 'Cannot build on rough terrain'; return false; }
  if (fac === 'myriad' && !onCreep(fac, x, y)) { placeErrMsg = 'Must grow on your creep'; return false; }
  if (fac === 'choir') { // lattice rule: must be near an existing finished Choir structure
    const ok = game.entities.some(e => !e.dead && e.fac === fac && e.def.kind === 'building'
      && !e.constructing && !e.growing && Math.hypot(e.x - x, e.y - y) < ECON.choirLattice);
    if (!ok) { placeErrMsg = 'Must build within the lattice — near another Choir structure'; return false; }
  }
  // Heartwood Grafts must root right beside the Heartwood (a core), so the mutation
  // is woven into the heart of the garden — not flung out across the map.
  if (d.graft) {
    const beside = game.entities.some(e => !e.dead && e.fac === fac && e.def.core
      && Math.hypot(e.x - x, e.y - y) < e.size + d.size + 90);
    if (!beside) { placeErrMsg = 'A Graft must be raised beside the Heartwood'; return false; }
  }
  // network rule: most factions must build within their connection range of one of
  // their own structures, so a base grows as a connected web rather than teleporting
  // across the map. The Verdant garden reaches further, and a building may extend the
  // reach further still with its own `connectR` (the Heartwood Sapling). `forward`
  // buildings (the Syndicate Watchpost) are exempt.
  if (NETWORKED[fac] && !d.forward) {
    const base = connectBase(fac);
    const linked = game.entities.some(e => !e.dead && e.fac === fac && e.def.kind === 'building'
      && Math.hypot(e.x - x, e.y - y) < (e.def.connectR || base) + e.size);
    if (!linked) { placeErrMsg = 'Must connect to your base — build closer to your own structures'; return false; }
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
  p.powder = (p.powder || 0) + Math.round((d.cost3 || 0) * SELL_REFUND);
  e.dead = true;
  game.navDirty = true;   // blocker gone → re-plan paths
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

// Wellspring harness: every 0.5s (right after creep), decide who holds each font.
// A faction harnesses a Wellspring if its designated econ structure is the closest one
// within WELL.harnessR (the Myriad instead needs the font under its creep). The owner
// is stored on the entity (so it colours in and syncs to guests like an Obelisk) and
// tallied per player for tickEconomy. The Warden (turtle) never harnesses; the nomadic
// Exodus harnesses a font by parking Collectors or the Ark beside it (no econ buildings).
function recomputeWellsprings() {
  for (const fac in game.players) game.players[fac].wellHarness = 0;
  for (const w of game.entities) {
    if (w.dead || !w.def.wellspring) continue;
    let best = null, bestD = WELL.harnessR;
    for (const fac in game.players) {
      if (fac === 'warden') continue;
      let d = Infinity;
      if (fac === 'myriad') {
        if (onCreep('myriad', w.x, w.y)) d = 0;        // covered in creep
      } else if (fac === 'exodus') {
        // nomads: any Collector or the Ark parked within range claims the font
        for (const e of game.entities) {
          if (e.dead || e.fac !== fac || (e.type !== 'collector' && e.type !== 'ark')) continue;
          const dd = Math.hypot(e.x - w.x, e.y - w.y);
          if (dd < d) d = dd;
        }
      } else {
        const ht = WELL.harness[fac]; if (!ht) continue;
        for (const e of game.entities) {
          if (e.dead || e.fac !== fac || e.type !== ht || e.constructing || e.growing) continue;
          const dd = Math.hypot(e.x - w.x, e.y - w.y);
          if (dd < d) d = dd;
        }
      }
      if (d < bestD) { bestD = d; best = fac; }
    }
    w.owner = best;
    if (best) game.players[best].wellHarness++;
  }
}

function tickEconomy(dt) {
  for (const fac in game.players) {
    const p = game.players[fac];
    let gain = 0;
    // territory held this tick: harnessed Wellsprings + captured Obelisks. This is the
    // uncapped scaler — with home economies plateaued, holding ground IS the economy.
    const wells = p.wellHarness || 0;
    const obs = ents(e => e.type === 'obelisk' && e.owner === fac).length;
    if (fac === 'vanguard') {
      // home economy is Workers hauling FINITE crystal (see harvestStep) — once the
      // starter nodes run dry you MUST send Workers out to claim distant nodes. No
      // passive minting: Supply Depots are forward drop-offs, not a corner crystal tap.
      gain = 0;
    } else if (fac === 'myriad') {
      // biomass per creep tile, but the tile income PLATEAUS — a home creep-blob maxes
      // out, so growth means creeping OUT across the map (and over Wellsprings).
      gain = ECON.myriadBase + Math.min(p.creepTiles || 0, ECON.myriadCapTiles) * ECON.myriadPerTile;
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
      // lattice trickle PLATEAUS at choirConduitCap — the Choir scales by feeding on
      // death across the map (see applyDamage), not by stacking conduits at home.
      const conduits = ents(e => e.fac === fac && e.type === 'conduit' && !e.growing).length;
      gain = ECON.choirBase + Math.min(conduits, ECON.choirConduitCap) * ECON.choirConduit;
    } else if (fac === 'syndicate') {
      // interest on the treasury — but the CAP is driven by TERRITORY, so a bank in a
      // corner stalls at synCapBase. Each held Obelisk/Wellspring lifts it a lot.
      const houses = ents(e => e.fac === fac && e.type === 'countinghouse' && !e.growing).length;
      const vaults = ents(e => e.fac === fac && e.type === 'vault' && !e.growing).length;
      const cap = ECON.synCapBase + houses * ECON.synCapPer + vaults * ECON.synVaultCap + (obs + wells) * ECON.synCapTerritory;
      gain = ECON.synBase + houses * ECON.synHouseFlat + vaults * ECON.synVaultFlat + ECON.synInterest * Math.min(p.res, cap);
    } else if (fac === 'warden') {
      // THE exception — self-sufficient. Income scales with the total HP of standing
      // buildings, plus a flat trickle from each Stone Quarry. The walled brotherhood
      // needn't march out (and cannot harness Wellsprings at all).
      let hp = 0, quarries = 0;
      for (const e of game.entities)
        if (!e.dead && e.fac === fac && e.def.kind === 'building' && !e.constructing && !e.growing) {
          hp += e.hp; if (e.type === 'quarry') quarries++;
        }
      gain = ECON.wardenBase + hp * ECON.wardenPerHp + quarries * ECON.wardenQuarry;
    } else if (fac === 'ember') {
      gain = ECON.emberBase; // the rest is plundered through combat (see applyDamage)
    } else if (fac === 'verdant') {
      // Sap per Bloom PLATEAUS at verdantBloomCap — a home garden caps out. The scarce
      // Pollen/Loam (and bonus Sap) come from harnessed Wellsprings (see below).
      const blooms = ents(e => e.fac === fac && e.type === 'bloom' && !e.growing && !e.withered).length;
      gain = ECON.verdantBase + Math.min(blooms, ECON.verdantBloomCap) * ECON.verdantPerBloom;
    } else if (fac === 'stormforge') {
      // home Dynamo output is FLAT and plateaus at stormDynamoCap — no more scaling by
      // idling. The acceleration now lives on the map (each Storm Font ramps — see below).
      const dynamos = ents(e => e.fac === fac && e.type === 'dynamo' && !e.growing).length;
      gain = ECON.stormBase + Math.min(dynamos, ECON.stormDynamoCap) * ECON.stormPerDynamo;
    } else if (fac === 'pact') {
      gain = ECON.pactBase; // the rest is reaped from your own dying (see applyDamage)
    }
    // ---- TERRITORY: the dominant, uncapped income (bar the self-sufficient Warden) ----
    gain += obs * ECON.obeliskIncome;
    if (fac === 'exodus') gain += obs * ECON.exodusObeliskBonus; // nomads live off held ground
    // harnessed Wellsprings pour out your primary resource. The Stormforge's Storm Fonts
    // ramp the longer they're held — its 'engine that accelerates', re-homed onto the map.
    let wellPay = wells * (WELL.income[fac] || WELL.defaultIncome);
    if (fac === 'stormforge') wellPay *= (1 + game.t * ECON.stormFontRamp);
    gain += wellPay;
    gain *= p.incomeMul * (p.econMul || 1); // AI handicap × researched economy upgrades
    p.res += gain * dt;
    p.gainAccum += gain * dt;

    // secondary resource: Warden Iron from Forges; Verdant Pollen from Pollen Spires —
    // PLUS, for the Verdant, a flow of Pollen from every harnessed Wellspring, so the
    // scarce harvest its diverse late-game garden needs comes from holding fertile ground.
    let iron = 0;
    for (const e of game.entities)
      if (!e.dead && e.fac === fac && e.def.ironPerSec && !e.constructing && !e.growing && !e.withered) iron += e.def.ironPerSec;
    if (fac === 'verdant') iron += wells * ECON.verdantFontPollen;
    if (iron) { iron *= p.incomeMul * (p.econMul || 1); p.iron += iron * dt; p.ironAccum += iron * dt; }

    // tertiary resource: Warden Powder (Mills + held Obelisks); Verdant Loam from Mulch
    // Beds — plus, for the Verdant, Loam from every harnessed Wellspring (the third
    // harvest the great trees demand, again paid out only for holding the map).
    let powder = 0;
    for (const e of game.entities)
      if (!e.dead && e.fac === fac && e.def.powderPerSec && !e.constructing && !e.growing && !e.withered) powder += e.def.powderPerSec;
    if (FACTIONS[fac].res3 && fac !== 'verdant')
      powder += ents(e => e.type === 'obelisk' && e.owner === fac).length * ECON.wardenObeliskPowder;
    if (fac === 'verdant') powder += wells * ECON.verdantFontLoam;
    if (powder) { powder *= p.incomeMul * (p.econMul || 1); p.powder += powder * dt; p.powderAccum += powder * dt; }
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

// regen: general out-of-combat healing, swarm creep-heal, exodus shields, choir decay
const REGEN_DELAY = 8;     // seconds without taking damage before HP regen kicks in
const REGEN_RATE = 0.03;   // fraction of max HP healed per second once regenerating
function tickRegen(dt) {
  for (const e of game.entities) {
    if (e.dead) continue;
    // general out-of-combat regeneration — anything that hasn't been hit for a
    // while slowly heals. Skips neutral camps and Choir field-units (which fade
    // by their own lattice rules below).
    if (e.fac !== 'neutral' && !e.constructing && !e.growing && !e.withered && e.hp < e.hpMax
        && !(e.fac === 'choir' && e.def.kind === 'unit')
        && game.t - (e.lastHurt || -99) > REGEN_DELAY)
      e.hp = Math.min(e.hpMax, e.hp + e.hpMax * REGEN_RATE * dt);
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
  // healing auras: exodus guardian (shields+hp), stormforge Charge Pylon (shields+hp),
  // verdant Fertiliser Pod (buff + hp + repairs withered husks), medic & apex (hp)
  for (const g of ents(e => e.def.aura && !e.withered && !e.growing && !e.constructing)) {
    for (const o of game.entities) {
      if (o.dead || o.fac !== g.fac || o === g) continue;
      if (dist(g, o) < g.def.aura) {
        if (g.type === 'guardian') {
          if (o.shieldMax > 0) o.shield = Math.min(o.shieldMax, o.shield + 10 * dt);
          o.hp = Math.min(o.hpMax, o.hp + 2 * dt);
        } else if (g.def.shieldHeal) {
          if (o.shieldMax > 0) o.shield = Math.min(o.shieldMax, o.shield + g.def.shieldHeal * dt);
          if (g.def.heal) o.hp = Math.min(o.hpMax, o.hp + g.def.heal * dt);
        } else if (g.def.buffAura) {
          o.fertUntil = game.t + VERD.fertWindow;     // fortified: harder, faster (see dmgOf/cdOf)
          if (o.withered) {                            // nurse a Necrotic husk back to life
            o.hp = Math.min(o.hpMax, o.hp + o.hpMax * 0.05 * dt);
            if (o.hp >= o.hpMax * VERD.witherRepair) { o.withered = false; o.lastHurt = game.t; }
          } else if (g.def.heal) o.hp = Math.min(o.hpMax, o.hp + g.def.heal * dt);
        } else if (g.def.heal) {
          o.hp = Math.min(o.hpMax, o.hp + g.def.heal * dt);
        }
      }
    }
  }
  // Spore Blossom: drag every enemy unit in a huge radius to a crawl (see spd)
  for (const g of ents(e => e.def.slowAura && !e.withered && !e.growing && !e.constructing)) {
    const r2 = g.def.slowAura * g.def.slowAura;
    for (const o of game.entities) {
      if (o.dead || o.def.kind !== 'unit' || o.fac === g.fac || o.fac === 'neutral') continue;
      const dx = o.x - g.x, dy = o.y - g.y;
      if (dx * dx + dy * dy < r2) o.slowUntil = game.t + VERD.slowWindow;
    }
  }
  // Verdant ecosystem: a Wellspring the Bloom has harnessed becomes a thriving garden
  // — it fortifies (buffs damage & fire-rate) and heals nearby Verdant plants & beasts,
  // just like a Fertiliser Pod planted on the font. Rewards spreading the garden out.
  const vWell = game.players.verdant && ents(e => e.def.wellspring && e.owner === 'verdant');
  if (vWell && vWell.length) {
    const r2 = WELL.verdBuffR * WELL.verdBuffR;
    for (const w of vWell) for (const o of game.entities) {
      if (o.dead || o.fac !== 'verdant' || o.constructing || o.growing) continue;
      const dx = o.x - w.x, dy = o.y - w.y;
      if (dx * dx + dy * dy < r2) {
        o.fertUntil = game.t + VERD.fertWindow;
        if (o.hp < o.hpMax) o.hp = Math.min(o.hpMax, o.hp + 3 * dt);
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
    // shove units out of impassable terrain (radial push, like buildings/nodes)
    for (const ob of game.obstacles) {
      const dx = a.x - ob.x, dy = a.y - ob.y, rr = a.size + ob.r;
      const d = Math.hypot(dx, dy);
      if (d < rr && d > 0.01) { a.x = ob.x + dx / d * rr; a.y = ob.y + dy / d * rr; }
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

