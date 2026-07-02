// ---------------- main update ----------------
function update(dt) {
  game.t += dt;
  game.pathCalls = 0;   // per-frame A* search budget (see nav.js)

  // rebuild the id→entity index for O(1) byId() this tick (see core.js). Reused
  // across frames to avoid per-frame allocation; spawnEnt keeps it live for units
  // created mid-tick, and dead entities are ignored by byId until the sweep below.
  if (!game._idx) game._idx = new Map();
  game._idx.clear();
  for (const e of game.entities) game._idx.set(e.id, e);

  refreshGrafts();   // Verdant: which Heartwood Grafts are standing this tick

  // Strain: cache the live Gene Samplers once per tick so evoMitigate (which runs per
  // damage event, potentially dozens of times a frame) never scans all entities itself
  game._samplers = game.players.strain
    ? game.entities.filter(e => !e.dead && e.def.collector) : null;

  game.creepTimer -= dt;
  if (game.creepTimer <= 0) { game.creepTimer = 0.5; recomputeCreep(); recomputeWellsprings(); }

  tickEconomy(dt);
  tickRegen(dt);
  tickCapture(dt);
  if (game.sandbox) tickSandbox();

  for (const e of game.entities) {
    if (e.dead) continue;
    if (e.def.kind === 'unit') updateUnit(e, dt);
    else updateBuilding(e, dt);
  }

  separation();
  tickProjectiles(dt);
  tickStrikes(dt);
  tickCorruption(dt);
  tickBurning(dt);

  // income display (per-second window)
  for (const fac in game.players) {
    const p = game.players[fac];
    p.incomeT = (p.incomeT || 0) + dt;
    if (p.incomeT >= 1) {
      p.income = p.gainAccum / p.incomeT; p.gainAccum = 0;
      p.ironInc = p.ironAccum / p.incomeT; p.ironAccum = 0;
      p.powderInc = p.powderAccum / p.incomeT; p.powderAccum = 0;
      p.incomeT = 0;
    }
  }

  // the simulating side (SP or host) drives every AI faction, but ROUND-ROBIN —
  // one bot per fire instead of all of them in the same frame. Each faction still
  // re-plans every aiInterval seconds; the work is just spread across frames so the
  // AI no longer causes a periodic lag spike.
  if (game.aiFacs.length) {
    game.aiTimer -= dt;
    if (game.aiTimer <= 0) {
      game.aiTimer = (game.aiInterval || 1.0) / game.aiFacs.length;
      game.aiCursor = (game.aiCursor || 0) % game.aiFacs.length;
      aiTick(game.aiFacs[game.aiCursor]);
      game.aiCursor++;
    }
  }

  // host: stream a state snapshot to all guests ~10×/s. Dropping a backed-up
  // guest's snapshot (only the latest matters) is what keeps a slow joiner from
  // drowning in a backlog and freezing late-game — but that drop is now decided
  // per guest (in hostBroadcast), so one slow joiner can't starve the others.
  // We still clear netFx so cosmetic events don't pile up.
  if (game.mode === 'host') {
    game.netTimer -= dt;
    if (game.netTimer <= 0) {
      game.netTimer = 0.1;
      netSend(buildSnap());
      game.netFx.length = 0;
    }
  }

  // sweep the dead
  if (game.entities.some(e => e.dead)) {
    game.sel = game.sel.filter(e => !e.dead);
    game.entities = game.entities.filter(e => !e.dead);
  }
  game.nodes = game.nodes.filter(n => n.amount > 0);

  // elimination + victory (free-for-all: last core standing wins) — skipped in the
  // sandbox, which has no opponents and isn't trying to be "won"
  if (!game.sandbox) {
    const hasCore = fac => game.entities.some(e => !e.dead && e.fac === fac && e.def.core);
    for (const r of game.roster) {
      if (!game.eliminated.has(r.fac) && !hasCore(r.fac)) {
        game.eliminated.add(r.fac);
        for (const e of game.entities) if (e.fac === r.fac) e.dead = true; // the faction collapses
        if (r.fac === game.localFac) game.defeated = true;
      }
    }
    const alive = game.roster.filter(r => !game.eliminated.has(r.fac));
    if (alive.length <= 1 || (game.mode === 'sp' && game.defeated)) {
      endGame(alive[0] ? alive[0].fac : null);
    }
  }
}

// Verdant Bloom: cache which Heartwood Grafts are standing, so the hot paths
// (dmgOf/spd/cdOf, sapling caps, fog reveal) read a cheap per-player boolean.
function refreshGrafts() {
  const p = game.players.verdant;
  if (!p) return;
  p.gNecro = hasGraft('verdant', 'necro');
  p.gMoon  = hasGraft('verdant', 'moon');
  p.gWild  = hasGraft('verdant', 'wild');
}

function endGame(winner) {
  game.over = true;
  if (game.mode === 'host') netSend({ t: 'end', winner });
  const won = winner === game.localFac;
  const t = document.getElementById('endTitle');
  t.textContent = won ? 'VICTORY' : 'DEFEAT';
  t.style.color = won ? '#7dffa8' : '#ff7d7d';
  const mins = Math.floor(game.t / 60), secs = Math.floor(game.t % 60);
  const who = winner ? FACTIONS[winner].name + ' prevails' : 'Mutual annihilation';
  const myKills = game.players[game.localFac] ? game.players[game.localFac].kills : 0;
  document.getElementById('endDetail').textContent =
    who + ' — ' + mins + 'm ' + String(secs).padStart(2, '0') + 's · your kills: ' + myKills;
  document.getElementById('endscreen').style.display = 'flex';
}

function backToMenu() {
  game = null;
  rejoinInfo = null; rejoining = false; // gave up on / finished the match — no stale reconnect
  document.getElementById('endscreen').style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  document.getElementById('hudSandboxBtn').style.display = 'none';
  closeSandboxPanel();
  document.getElementById('menu').style.display = 'flex';
  if (netConnected()) showLobby(); // still linked — straight back to the rematch lobby
  else showScreen('home');
}

