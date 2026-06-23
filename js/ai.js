// ---------------- AI ----------------
// caps that grow over the match so bots keep expanding economy and output instead
// of stalling at an early-game ceiling: base now, +perMin every minute, up to max.
const aiGrow = (base, perMin, max) => Math.min(max, base + Math.floor(game.t / 60) * perMin);

// AI builds its research station, then works through the whole tech tree — taking
// the cheapest currently-available node whenever it has a comfortable surplus, so
// it keeps teching across all four branches without starving its army.
function aiResearch(fac, p) {
  const labType = LAB_OF[fac];
  if (!labType) return;
  const lab = ents(e => e.fac === fac && e.type === labType)[0];
  if (!lab) { // no station yet — build one as a priority (Exodus' lab is its Ark)
    if (DEFS[labType].kind === 'building' && p.res >= DEFS[labType].cost) aiPlace(fac, labType, p.base);
    return;
  }
  if (lab.constructing || lab.growing || (lab.rqueue && lab.rqueue.length)) return;
  let best = null;
  for (const rid of RESEARCH_BY_FAC[fac] || []) {
    const r = RESEARCH[rid];
    if (p.research.has(rid) || researchQueued(fac, rid)) continue;
    if (r.req && !p.research.has(r.req)) continue;           // prereq not met yet
    if (p.res < r.cost + 60) continue;                       // keep a small buffer for the army
    if (!best || r.cost < RESEARCH[best].cost) best = rid;    // cheapest available
  }
  if (best) enqueueResearch(lab, best);
}

function aiTick(fac) {
  const p = game.players[fac];
  const myCore = ents(e => e.fac === fac && e.def.core)[0];
  if (!myCore) return;
  aiResearch(fac, p);
  // free-for-all: go for the nearest surviving enemy core
  const enemyCore = ents(e => e.def.core && e.fac !== fac && e.fac !== 'neutral')
    .sort((a, b) => dist(myCore, a) - dist(myCore, b))[0];
  if (!enemyCore) return;
  const army = armyOf(fac);
  const underAttack = p.lastAttack && game.t - p.lastAttack.t < 6;

  // ---- shared: defend / muster / committed attack waves ----
  // The bot defends by default and only all-ins once it has genuinely MASSED an
  // army — then it commits for a sustained window so newly-built units stream into
  // the same push (no more trickling units in to die one squad at a time).
  const defendPt = underAttack ? p.lastAttack : null;
  // muster point: just outside our own core, so idle units stay home to defend
  const muster = { x: myCore.x + (enemyCore.x - myCore.x) * 0.12, y: myCore.y + (enemyCore.y - myCore.y) * 0.12 };
  if (defendPt && Math.hypot(defendPt.x - myCore.x, defendPt.y - myCore.y) < 850) {
    for (const u of army) if (u.order.type === 'idle' || u.order.type === 'amove')
      u.order = { type: 'amove', x: defendPt.x, y: defendPt.y };
  } else {
    // launch once we hit our wave size; afterwards commit for a window and ratchet
    // the next wave up toward the army we can field, so pushes grow over the match
    if (game.t > p.firstWave && army.length >= p.waveSize && (!p.attackUntil || game.t > p.attackUntil + 12)) {
      p.attackUntil = game.t + 40;
      p.waveSize = Math.min(90, Math.max(p.waveSize + p.waveStep + 2, Math.floor(army.length * 0.6)));
    }
    if (p.attackUntil && game.t < p.attackUntil) {
      for (const u of army) if (u.order.type === 'idle' || u.order.type === 'amove')
        u.order = { type: 'amove', x: enemyCore.x, y: enemyCore.y };
    } else {
      // between pushes: GRAB TERRITORY. Home economy is capped, so the bot marches its
      // army out to seize the nearest objective it doesn't already hold — an un-owned
      // Obelisk (captured by standing on it) or a Wellspring it hasn't harnessed (to clear
      // the ground and guard the econ structure it builds there). Falls back to mustering.
      const objective = ents(e => (e.type === 'obelisk' && e.owner !== fac) || (e.def.wellspring && e.owner !== fac))
        .map(e => ({ e, d: dist(myCore, e) })).filter(o => o.d < 1500).sort((a, b) => a.d - b.d)[0];
      const hold = objective ? objective.e : muster;
      for (const u of army) if (u.order.type === 'idle') u.order = { type: 'amove', x: hold.x, y: hold.y };
    }
  }

  // ---- shared: expansion. Try to harness the nearest un-held Wellspring by raising
  // our econ structure beside it. placeValid still requires it to connect to us (except
  // the Syndicate's forward-dropped Watchpost), so the bot only claims fonts its base
  // has actually grown toward — the same pressure to expand a human player feels.
  const harnessType = WELL.harness[fac];
  if (harnessType && Math.random() < 0.5) {
    const w = ents(e => e.def.wellspring && e.owner !== fac)
      .sort((a, b) => dist(myCore, a) - dist(myCore, b))[0];
    if (w && dist(myCore, w) < 1300 && affordable(p, DEFS[harnessType]) && techMet(fac, harnessType))
      aiPlace(fac, harnessType, w); // aiPlace rings 70–240 around the font — outside its keepout, mostly in harness range
  }

  if (fac === 'vanguard') {
    const workers = ents(e => e.fac === fac && e.type === 'worker');
    const hq = ents(e => e.fac === fac && e.type === 'hq' && !e.constructing)[0];
    if (hq && workers.length < aiGrow(9, 2, 26) && p.res >= 50 && !hq.queue.length) enqueue(hq, 'worker');
    const rax = ents(e => e.fac === fac && e.type === 'barracks');
    const fact = ents(e => e.fac === fac && e.type === 'factory');
    const air = ents(e => e.fac === fac && e.type === 'airfield');
    const depots = ents(e => e.fac === fac && e.type === 'depot');
    const lab = ents(e => e.fac === fac && e.type === 'techlab');
    const turrets = ents(e => e.fac === fac && e.type === 'turret');
    const pillboxes = ents(e => e.fac === fac && e.type === 'pillbox');
    if (rax.length < aiGrow(2, 1, 6) && p.res >= 150) aiPlace(fac, 'barracks', p.base);
    else if (rax.length >= 1 && depots.length < aiGrow(2, 1, 6) && p.res >= 175) aiPlace(fac, 'depot', p.base);
    else if (rax.length >= 1 && fact.length < aiGrow(1, 1, 4) && p.res >= 250) aiPlace(fac, 'factory', p.base);
    else if (fact.length >= 1 && lab.length < 1 && p.res >= 150 && game.t > 150) aiPlace(fac, 'techlab', p.base);
    else if (fact.length >= 1 && air.length < aiGrow(1, 1, 3) && p.res >= 300 && game.t > 200) aiPlace(fac, 'airfield', p.base);
    else if (turrets.length < aiGrow(3, 1, 10) && p.res >= 220 && game.t > 150) aiPlace(fac, 'turret', p.base);
    else if (pillboxes.length < aiGrow(2, 1, 6) && p.res >= 200 && game.t > 240) aiPlace(fac, 'pillbox', p.base);
    for (const b of rax) if (!b.constructing && !b.queue.length && p.res >= 60) {
      const r = Math.random();
      enqueue(b, (r < 0.18 && p.res >= 110) ? 'sniper' : (r < 0.38 && p.res >= 85) ? 'rocket' : (r < 0.5 && p.res >= 75) ? 'medic' : 'marine');
    }
    for (const b of fact) if (!b.constructing && !b.queue.length && p.res >= 90) {
      const r = Math.random();
      enqueue(b, (r < 0.18 && p.res >= 250 && techMet(fac, 'artillery')) ? 'artillery'
        : (r < 0.4 && p.res >= 270) ? 'goliath' : (r < 0.62 && p.res >= 170) ? 'flametank'
        : (r < 0.82 && p.res >= 200) ? 'tank' : 'outrider');
    }
    for (const b of air) if (!b.constructing && !b.queue.length && p.res >= 180)
      enqueue(b, (Math.random() < 0.4 && p.res >= 240) ? 'bomber' : 'gunship');
  }

  else if (fac === 'myriad') {
    const hive = ents(e => e.fac === fac && e.type === 'hive')[0];
    const tumors = ents(e => e.fac === fac && e.type === 'tumor');
    const pits = ents(e => e.fac === fac && e.type === 'spawnpit');
    const mounds = ents(e => e.fac === fac && e.type === 'spittermound');
    const dens = ents(e => e.fac === fac && e.type === 'hunterden');
    const spines = ents(e => e.fac === fac && e.type === 'spine');
    // spread creep — toward the enemy, but every so often crawl it out to the nearest
    // un-covered Wellspring instead, so the swarm harnesses fonts (its creep IS its claim)
    if (tumors.length < aiGrow(9, 3, 30) && p.res >= 50 && Math.random() < 0.65) {
      const sources = [hive, ...tumors].filter(Boolean);
      const src = sources[Math.floor(Math.random() * sources.length)];
      if (src) {
        let goal = enemyCore;
        if (Math.random() < 0.45) {
          const w = ents(e => e.def.wellspring && e.owner !== fac && dist(src, e) < 1100)
            .sort((a, b) => dist(src, a) - dist(src, b))[0];
          if (w) goal = w;
        }
        const ang = Math.atan2(goal.y - src.y, goal.x - src.x) + (Math.random() - 0.5) * 1.6;
        const r = (src.creepCur || 5) * TILE * 0.8;
        aiPlaceAt(fac, 'tumor', src.x + Math.cos(ang) * r, src.y + Math.sin(ang) * r);
      }
    }
    if (pits.length < aiGrow(3, 1, 8) && p.res >= 150) aiPlace(fac, 'spawnpit', p.base);
    else if (mounds.length < aiGrow(2, 1, 6) && pits.length >= 1 && p.res >= 200) aiPlace(fac, 'spittermound', p.base);
    else if (dens.length < aiGrow(2, 1, 6) && pits.length >= 2 && p.res >= 250) aiPlace(fac, 'hunterden', p.base);
    else if (spines.length < aiGrow(3, 1, 9) && p.res >= 120 && game.t > 150) aiPlace(fac, 'spine', p.base);
    else if (hive && !hive.queue.length && p.res >= 200 && game.t > 160 && techMet(fac, 'ravager'))
      enqueue(hive, (p.res >= 300 && Math.random() < 0.5) ? 'broodmother' : 'ravager');
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
      const aegises = ents(e => e.fac === fac && e.type === 'aegis').length;
      const sovs = ents(e => e.fac === fac && e.type === 'sovereign').length;
      if (collectors < aiGrow(5, 2, 15) && p.res >= 60) enqueue(ark, 'collector');
      else if (sovs < 2 && p.res >= 820 && techMet(fac, 'sovereign')) enqueue(ark, 'sovereign');
      else if (aegises < 2 && p.res >= 300 && game.t > 200) enqueue(ark, 'aegis');
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
    if (conduits.length < aiGrow(8, 2, 24) && p.res >= 60 && Math.random() < 0.6) {
      const srcs = ents(e => e.fac === fac && e.def.kind === 'building' && !e.growing);
      const src = srcs[Math.floor(Math.random() * srcs.length)];
      if (src) {
        const ang = Math.atan2(enemyCore.y - src.y, enemyCore.x - src.x) + (Math.random() - 0.5) * 1.8;
        aiPlaceAt(fac, 'conduit', src.x + Math.cos(ang) * 200, src.y + Math.sin(ang) * 200);
      }
    }
    if (reliqs.length < aiGrow(1, 1, 3) && p.res >= 180) aiPlace(fac, 'reliquary', p.base);
    else if (spires.length < aiGrow(2, 1, 6) && p.res >= 130 && game.t > 130) aiPlace(fac, 'spire', p.base);
    if (oss && !oss.queue.length && p.res >= 50)
      enqueue(oss, (Math.random() < 0.35 && p.res >= 130) ? 'banshee' : 'wraith');
    for (const b of reliqs) if (!b.growing && !b.queue.length && p.res >= 180)
      enqueue(b, (p.res >= 300 && Math.random() < 0.6) ? 'revenant' : 'lich');
  }

  else if (fac === 'syndicate') { // bank gold for interest, spend the overflow on mercs
    const haven = myCore;
    const houses = ents(e => e.fac === fac && e.type === 'countinghouse');
    const posts = ents(e => e.fac === fac && e.type === 'watchpost');
    if (houses.length < aiGrow(2, 1, 7) && p.res >= 420) aiPlace(fac, 'countinghouse', p.base);
    else if (posts.length < aiGrow(3, 1, 9) && p.res >= 360 && game.t > 120) aiPlace(fac, 'watchpost', p.base);
    if (haven && !haven.queue.length && (p.res >= 400 || (underAttack && p.res >= 100))) {
      const enf = ents(e => e.fac === fac && e.type === 'enforcer').length;
      const arb = ents(e => e.fac === fac && e.type === 'arbalest').length;
      const jug = ents(e => e.fac === fac && e.type === 'juggernaut').length;
      const mar = ents(e => e.fac === fac && e.type === 'marauder').length;
      if (jug < Math.floor(enf / 5) && p.res >= 650 && techMet(fac, 'juggernaut')) enqueue(haven, 'juggernaut');
      else if (arb < enf / 2 && p.res >= 520 && techMet(fac, 'arbalest')) enqueue(haven, 'arbalest');
      else if (mar < enf / 3 && p.res >= 500) enqueue(haven, 'marauder');
      else enqueue(haven, 'enforcer');
    }
  }

  else if (fac === 'warden') { // turtle: Forges for Iron, Quarries+Ramparts for mass, then grind out tiers
    const keep = myCore;
    const can = t => affordable(p, DEFS[t]);   // respects both Stone and Iron
    const have = t => ents(e => e.fac === fac && e.type === t).length;
    const ramparts = have('rampart'), forges = have('forge');
    if (forges < 2 && can('forge')) aiPlace(fac, 'forge', p.base);
    else if (have('powdermill') < aiGrow(1, 1, 4) && can('powdermill') && game.t > 70) aiPlace(fac, 'powdermill', p.base);
    else if (have('quarry') < aiGrow(2, 1, 8) && can('quarry')) aiPlace(fac, 'quarry', p.base);
    else if (ramparts < aiGrow(8, 3, 32) && can('rampart')) aiPlace(fac, 'rampart', p.base);
    else if (have('bastion') < aiGrow(3, 1, 8) && can('bastion')) aiPlace(fac, 'bastion', p.base);
    else if (have('cauldron') < aiGrow(2, 1, 6) && can('cauldron') && techMet(fac, 'cauldron') && game.t > 90) aiPlace(fac, 'cauldron', p.base);
    else if (have('bunker') < aiGrow(3, 1, 8) && can('bunker') && techMet(fac, 'bunker')) aiPlace(fac, 'bunker', p.base);
    else if (have('ballista') < aiGrow(2, 1, 7) && can('ballista') && techMet(fac, 'ballista')) aiPlace(fac, 'ballista', p.base);
    else if (have('forge') < aiGrow(4, 1, 11) && can('forge')) aiPlace(fac, 'forge', p.base);
    else if (have('foundry_w') < aiGrow(1, 1, 3) && can('foundry_w') && game.t > 110) aiPlace(fac, 'foundry_w', p.base);
    else if (have('college') < 1 && can('college') && game.t > 130) aiPlace(fac, 'college', p.base);
    else if (have('hall') < 1 && can('hall') && techMet(fac, 'hall') && game.t > 150) aiPlace(fac, 'hall', p.base);
    else if (have('redoubt') < aiGrow(2, 1, 6) && can('redoubt') && techMet(fac, 'redoubt')) aiPlace(fac, 'redoubt', p.base);
    else if (have('arsenal') < aiGrow(1, 1, 2) && can('arsenal') && techMet(fac, 'arsenal')) aiPlace(fac, 'arsenal', p.base);
    else if (have('citadel') < 1 && can('citadel') && techMet(fac, 'citadel')) aiPlace(fac, 'citadel', p.base);
    else if (have('worldbreaker') < 1 && can('worldbreaker') && techMet(fac, 'worldbreaker')) aiPlace(fac, 'worldbreaker', p.base);
    else if (ramparts < aiGrow(16, 4, 44) && p.res >= 400) aiPlace(fac, 'rampart', p.base);
    if (keep && !keep.queue.length) {
      const guards = have('warden_g'), sents = have('sentinel'), pikes = have('pikeman');
      if (pikes < sents / 3 && can('pikeman') && techMet(fac, 'pikeman')) enqueue(keep, 'pikeman');
      else if (guards < sents / 2 && can('warden_g') && techMet(fac, 'warden_g')) enqueue(keep, 'warden_g');
      else if (can('sentinel')) enqueue(keep, 'sentinel');
    }
    for (const f of ents(e => e.fac === fac && e.type === 'foundry_w' && !e.growing))
      if (!f.queue.length) {
        if (have('ironclad') < aiGrow(4, 1, 12) && can('ironclad')) enqueue(f, 'ironclad');
        else if (can('bombard')) enqueue(f, 'bombard');
      }
    for (const h of ents(e => e.fac === fac && e.type === 'hall' && !e.growing))
      if (!h.queue.length) {
        if (have('marshal') < aiGrow(1, 1, 4) && can('marshal')) enqueue(h, 'marshal');
        else if (can('halberd')) enqueue(h, 'halberd');
      }
    for (const ar of ents(e => e.fac === fac && e.type === 'arsenal' && !e.growing))
      if (!ar.queue.length) {
        if (have('trebuchet') < aiGrow(2, 1, 6) && can('trebuchet')) enqueue(ar, 'trebuchet');
        else if (can('castellan')) enqueue(ar, 'castellan');
      }
    // unleash the Gustav Strike on the richest enemy target in range whenever it's loaded
    for (const wb of ents(e => e.fac === fac && e.type === 'worldbreaker' && !e.growing && !e.constructing && (e.abilityCd || 0) <= 0))
      aiGustavStrike(fac, wb);
  }

  else if (fac === 'ember') { // pure aggression — fund the war by waging it
    const pyre = myCore;
    const camps = ents(e => e.fac === fac && e.type === 'warcamp').length;
    const totems = ents(e => e.fac === fac && e.type === 'totem').length;
    const forges = ents(e => e.fac === fac && e.type === 'emberforge').length;
    if (camps < aiGrow(2, 1, 5) && p.res >= 120) aiPlace(fac, 'warcamp', p.base);
    else if (forges < 1 && p.res >= 190 && game.t > 80) aiPlace(fac, 'emberforge', p.base);
    else if (totems < aiGrow(2, 1, 6) && p.res >= 110 && game.t > 60) aiPlace(fac, 'totem', p.base);
    const prod = e => {
      if (!e || e.queue.length || e.growing) return;
      const beasts = ents(o => o.fac === fac && o.type === 'warbeast').length;
      const brands = ents(o => o.fac === fac && o.type === 'firebrand').length;
      const wagons = ents(o => o.fac === fac && o.type === 'firewagon').length;
      if (beasts < aiGrow(3, 1, 9) && p.res >= 280 && techMet(fac, 'warbeast')) enqueue(e, 'warbeast');
      else if (wagons < aiGrow(3, 1, 9) && p.res >= 160 && techMet(fac, 'firewagon')) enqueue(e, 'firewagon');
      else if (brands < aiGrow(5, 1, 14) && p.res >= 150 && techMet(fac, 'firebrand')) enqueue(e, 'firebrand');
      else if (p.res >= 80 && Math.random() < 0.5) enqueue(e, 'slinger');
      else if (p.res >= 45) enqueue(e, 'raider');
    };
    // the Ember Foundry beats out the heavy warband — a tank wall, reach, siege, a healer
    const prodForge = e => {
      if (!e || e.queue.length || e.growing) return;
      const guards = ents(o => o.fac === fac && o.type === 'cinderguard').length;
      const catas = ents(o => o.fac === fac && o.type === 'catapult').length;
      const shamans = ents(o => o.fac === fac && o.type === 'shaman').length;
      const bows = ents(o => o.fac === fac && o.type === 'cinderbow').length;
      if (guards < aiGrow(2, 1, 6) && p.res >= 180) enqueue(e, 'cinderguard');
      else if (catas < aiGrow(1, 1, 4) && p.res >= 240) enqueue(e, 'catapult');
      else if (shamans < aiGrow(1, 1, 3) && p.res >= 130) enqueue(e, 'shaman');
      else if (bows < aiGrow(4, 1, 10) && p.res >= 110) enqueue(e, 'cinderbow');
    };
    prod(pyre);
    for (const c of ents(e => e.fac === fac && e.type === 'warcamp' && !e.growing)) prod(c);
    for (const fb of ents(e => e.fac === fac && e.type === 'emberforge' && !e.growing)) prodForge(fb);
    // raiders are restless — keep pushing even below full wave size
    if (army.length >= 5 && game.t > 60) for (const u of army)
      if (u.order.type === 'idle') u.order = { type: 'amove', x: enemyCore.x, y: enemyCore.y };
  }

  else if (fac === 'verdant') { // 3-harvest garden: Sap + Pollen + Loam, snowball with free saplings
    const heart = myCore;
    const can = t => affordable(p, DEFS[t]);   // respects Sap, Pollen and Loam
    const have = t => ents(e => e.fac === fac && e.type === t).length;
    const blooms = have('bloom');
    if (blooms < aiGrow(5, 2, 14) && p.res >= 90) aiPlace(fac, 'bloom', p.base);
    else if (have('petalspire') < aiGrow(2, 1, 6) && p.res >= 110) aiPlace(fac, 'petalspire', p.base);
    else if (have('mulchbed') < aiGrow(2, 1, 6) && p.res >= 120) aiPlace(fac, 'mulchbed', p.base);
    else if (have('grove') < aiGrow(3, 1, 8) && p.res >= 170) aiPlace(fac, 'grove', p.base);
    else if (have('bramble') < aiGrow(3, 1, 9) && p.res >= 120 && game.t > 90) aiPlace(fac, 'bramble', p.base);
    else if (have('sporevent') < aiGrow(2, 1, 6) && can('sporevent') && techMet(fac, 'sporevent') && game.t > 120) aiPlace(fac, 'sporevent', p.base);
    else if (have('fertpod') < aiGrow(1, 1, 4) && can('fertpod') && techMet(fac, 'fertpod') && game.t > 110) aiPlace(fac, 'fertpod', p.base);
    else if (have('sporebloss') < aiGrow(1, 1, 3) && can('sporebloss') && techMet(fac, 'sporebloss') && game.t > 150) aiPlace(fac, 'sporebloss', p.base);
    // weave one Heartwood Graft (Wildgrowth — fattens the free swarm), beside the core
    else if (have('graft_wild') < 1 && can('graft_wild') && techMet(fac, 'graft_wild') && game.t > 180) aiPlaceAt(fac, 'graft_wild', heart ? heart.x : p.base.x, heart ? heart.y + 70 : p.base.y + 70);
    else if (have('greatroot') < aiGrow(1, 1, 4) && can('greatroot') && techMet(fac, 'greatroot') && game.t > 200) aiPlace(fac, 'greatroot', p.base);
    // one indestructible Erdtree to anchor the hold, once the garden is rich
    else if (have('erdtree') < 1 && can('erdtree') && techMet(fac, 'erdtree') && game.t > 300) aiPlace(fac, 'erdtree', p.base);
    else if (blooms < aiGrow(11, 3, 28) && p.res >= 300) aiPlace(fac, 'bloom', p.base);
    if (heart && !heart.queue.length && p.res >= 90) {
      const treants = have('treant');
      const ancients = have('ancient');
      const horns = have('bramblehorn');
      const callers = have('sporecaller');
      // once the Arboretum is up, lean on the heavier beasts as the army's backbone
      if (horns < 3 && can('bramblehorn') && techMet(fac, 'bramblehorn') && game.t > 240) enqueue(heart, 'bramblehorn');
      else if (callers < 3 && can('sporecaller') && techMet(fac, 'sporecaller') && game.t > 220) enqueue(heart, 'sporecaller');
      else if (ancients < 2 && can('ancient') && game.t > 220 && techMet(fac, 'ancient')) enqueue(heart, 'ancient');
      else if (treants < 3 && can('treant') && game.t > 150 && techMet(fac, 'treant')) enqueue(heart, 'treant');
      else enqueue(heart, 'thornling');
    }
  }

  else if (fac === 'stormforge') { // ramp the engine, shield the army, then field giants
    const reactor = myCore;
    const have = t => ents(e => e.fac === fac && e.type === t).length;
    const dynamos = have('dynamo');
    if (dynamos < aiGrow(4, 1, 12) && p.res >= 200) aiPlace(fac, 'dynamo', p.base);
    else if (have('pylon') < aiGrow(2, 1, 6) && p.res >= 170 && game.t > 70) aiPlace(fac, 'pylon', p.base);
    else if (have('tesla') < aiGrow(3, 1, 8) && p.res >= 160 && game.t > 80) aiPlace(fac, 'tesla', p.base);
    else if (have('foundry_s') < aiGrow(1, 1, 3) && p.res >= 260 && game.t > 160) aiPlace(fac, 'foundry_s', p.base);
    if (reactor && !reactor.queue.length && p.res >= 110) {
      const volts = have('voltaic');
      const arcs = have('arclight');
      const glads = have('gladius');
      const galvs = have('galvan');
      if (glads < arcs / 2 && p.res >= 230 && techMet(fac, 'gladius')) enqueue(reactor, 'gladius');
      else if (volts < arcs / 2 && p.res >= 210 && techMet(fac, 'voltaic')) enqueue(reactor, 'voltaic');
      else if (galvs < arcs / 2 && p.res >= 180 && techMet(fac, 'galvan')) enqueue(reactor, 'galvan');
      else enqueue(reactor, 'arclight');
    }
    for (const f of ents(e => e.fac === fac && e.type === 'foundry_s' && !e.growing))
      if (!f.queue.length && p.res >= 420) enqueue(f, 'colossus');
  }

  else if (fac === 'pact') { // throw cheap bodies into the grinder, reap Blood, raise giants
    const altar = myCore;
    const shrines = ents(e => e.fac === fac && e.type === 'shrine').length;
    const spikes = ents(e => e.fac === fac && e.type === 'spike').length;
    if (shrines < aiGrow(3, 1, 9) && p.res >= 120) aiPlace(fac, 'shrine', p.base);
    else if (spikes < aiGrow(2, 1, 6) && p.res >= 110 && game.t > 80) aiPlace(fac, 'spike', p.base);
    if (altar && !altar.queue.length && p.res >= 30) {
      const behes = ents(e => e.fac === fac && e.type === 'behemoth').length;
      const zeals = ents(e => e.fac === fac && e.type === 'zealot').length;
      const cults = ents(e => e.fac === fac && e.type === 'cultist').length;
      if (behes < 3 && p.res >= 340 && game.t > 150 && techMet(fac, 'behemoth')) enqueue(altar, 'behemoth');
      else if (cults < zeals && p.res >= 70) enqueue(altar, 'cultist');
      else if (zeals < 6 && p.res >= 110 && techMet(fac, 'zealot')) enqueue(altar, 'zealot');
      else if (p.res >= 30) enqueue(altar, 'thrall');
    }
  }

  // ---- apex tech (all factions but Exodus, handled above, and the Warden, which
  // already has its Castellan + Bulwark): once the bot has teched deep, raise its
  // super-structure and keep one titan rolling out of it ----
  const APEX = {
    vanguard: { b: 'dominion', u: 'leviathan' }, myriad: { b: 'broodnexus', u: 'tyrant' },
    choir: { b: 'charnel', u: 'devourer' }, syndicate: { b: 'exchange', u: 'warlord' },
    ember: { b: 'greatpyre', u: 'titan' }, verdant: { b: 'heartgrove', u: 'eldertree' },
    stormforge: { b: 'arcfoundry', u: 'tempest' }, pact: { b: 'grandaltar', u: 'bloodavatar' },
  };
  const ax = APEX[fac];
  if (ax && game.t > 220) {
    const yards = ents(e => e.fac === fac && e.type === ax.b);
    if (yards.length < 1 && affordable(p, DEFS[ax.b]) && techMet(fac, ax.b)) aiPlace(fac, ax.b, p.base);
    for (const b of yards)
      if (!b.constructing && !b.growing && !b.queue.length
        && ents(e => e.fac === fac && e.type === ax.u).length < 2
        && affordable(p, DEFS[ax.u]) && techMet(fac, ax.u)) enqueue(b, ax.u);
  }
}

// pick the juiciest impact point for a Worldbreaker's Gustav Strike and fire it:
// the enemy entity whose blast neighbourhood holds the most hostile mass (prefers a
// dense army cluster, and will gladly bombard an enemy core if one is in range).
function aiGustavStrike(fac, wb) {
  const ab = wb.def.ability; if (!ab) return;
  const foes = ents(e => e.fac !== fac && e.fac !== 'neutral' && !e.def.noTarget && dist(wb, e) <= ab.range);
  if (!foes.length) return;
  let best = null, bestScore = 0;
  for (const c of foes) {
    let score = 0;
    for (const o of foes) {
      if (Math.hypot(o.x - c.x, o.y - c.y) <= ab.splash) score += o.def.core ? 60 : (o.def.kind === 'building' ? 8 : 4);
    }
    if (score > bestScore) { bestScore = score; best = c; }
  }
  // only spend the shot on a worthwhile target (a cluster or any structure/core)
  if (best && bestScore >= 12) fireAbility(fac, wb, best.x, best.y);
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

