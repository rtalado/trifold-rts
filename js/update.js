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
  tickStrikes(dt);

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

  // host: stream a state snapshot to all guests ~10×/s. If a guest's channel is
  // backed up, skip this snapshot (only the latest matters) and retry sooner —
  // this is what keeps a slow joiner from drowning in a snapshot backlog and
  // freezing late-game. We still clear netFx so cosmetic events don't pile up.
  if (game.mode === 'host') {
    game.netTimer -= dt;
    if (game.netTimer <= 0) {
      if (snapBacklogged()) { game.netTimer = 0.05; }
      else { game.netTimer = 0.1; netSend(buildSnap()); }
      game.netFx.length = 0;
    }
  }

  // sweep the dead
  if (game.entities.some(e => e.dead)) {
    game.sel = game.sel.filter(e => !e.dead);
    game.entities = game.entities.filter(e => !e.dead);
  }
  game.nodes = game.nodes.filter(n => n.amount > 0);

  // elimination + victory (free-for-all: last core standing wins)
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
  document.getElementById('endscreen').style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  document.getElementById('menu').style.display = 'flex';
  if (netConnected()) showLobby(); // still linked — straight back to the rematch lobby
  else showScreen('home');
}

