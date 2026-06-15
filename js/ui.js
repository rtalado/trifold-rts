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
    const d = DEFS[type], tech = techMet(fac, type);
    cmds.push({
      type, label: d.name, cost: d.cost, cost2: d.cost2,
      enabled: tech && affordable(p, d) && !host.constructing && !host.growing,
      onClick: () => {
        if (game.mode === 'guest') netSend({ t: 'cmd', fac: game.localFac, kind: 'enq', id: host.id, type });
        else enqueue(host, type);
        refreshCard();
      },
    });
  };
  const buildBtn = type => {
    const d = DEFS[type], tech = techMet(fac, type);
    cmds.push({
      type, label: (BUILD_VERB[fac] || 'Build ') + d.name,
      cost: d.cost, cost2: d.cost2, enabled: tech && affordable(p, d),
      onClick: () => { game.placing = type; },
    });
  };
  const researchBtn = (host, rid) => {
    const r = RESEARCH[rid], have = p.research.has(rid);
    const inProg = researchQueued(fac, rid);
    const reqMet = !r.req || p.research.has(r.req);
    cmds.push({
      rid, label: (have ? '✓ ' : '⚙ ') + r.name,
      cost: (have || inProg || !reqMet) ? 0 : r.cost,
      sub: have ? 'Researched' : (inProg ? 'Researching…' : (!reqMet ? 'Requires ' + RESEARCH[r.req].name : null)),
      desc: r.desc,
      enabled: !have && !inProg && reqMet && p.res >= r.cost && !host.constructing && !host.growing,
      onClick: () => {
        if (game.mode === 'guest') netSend({ t: 'cmd', fac: game.localFac, kind: 'research', id: host.id, rid });
        else enqueueResearch(host, rid);
        refreshCard();
      },
    });
  };

  if (types.has('worker')) ['barracks', 'factory', 'airfield', 'turret', 'techlab'].forEach(buildBtn);

  if (game.sel.length === 1) {
    const d = sel0.def;
    if (d.grows) d.grows.forEach(buildBtn);
    if (d.produces && !sel0.constructing && !sel0.growing) d.produces.forEach(t => prodBtn(sel0, t));
    if (sel0.type === 'ark') {
      cmds.push({
        label: sel0.deployed ? 'Undeploy Ark' : 'Deploy Ark', cost: 0, enabled: true,
        sub: 'Siphon energy from a crystal node',
        desc: 'Anchor the Ark on a crystal node to siphon Energy quickly. Undeploy to move again.',
        onClick: () => {
          if (game.mode === 'guest') netSend({ t: 'cmd', fac: game.localFac, kind: 'deploy', id: sel0.id, on: !sel0.deployed });
          else { sel0.deployed = !sel0.deployed; if (sel0.deployed) sel0.order = { type: 'idle' }; }
          refreshCard();
        },
      });
    }
    // research is done at the faction's research building (the Ark, for the base-less Exodus)
    if (d.researchLab && RESEARCH_BY_FAC[fac]) RESEARCH_BY_FAC[fac].forEach(rid => researchBtn(sel0, rid));
  }
  return cmds.slice(0, 12);
}

// compact stat readout for a definition, shown in the build tooltip
// "120 Stone + 30 Iron" — renders a primary (and optional secondary) cost
function costStr(fac, cost, cost2) {
  const F = FACTIONS[fac];
  let s = cost ? cost + ' ' + F.res : '';
  if (cost2) s += (s ? ' + ' : '') + cost2 + ' ' + (F.res2 || '');
  return s;
}

function statLine(d) {
  const parts = ['HP ' + d.hp];
  if (d.shield) parts.push('Shield ' + d.shield);
  if (d.dmg) parts.push('DMG ' + d.dmg + (d.splash ? ' splash' : ''));
  if (d.range > 30) parts.push('Range ' + d.range);
  if (d.speed) parts.push('Speed ' + d.speed);
  if (d.aura) parts.push('Aura ' + d.aura + (d.heal ? ' heal' : ' shield'));
  return parts.join(' · ');
}

function showTip(c) {
  const tip = document.getElementById('tooltip');
  if (!c || (!c.type && !c.desc)) { tip.style.display = 'none'; return; }
  const d = c.type ? DEFS[c.type] : null;
  const cs = costStr(game.localFac, c.cost, c.cost2);
  let html = '<div class="tipname">' + (d ? d.name : c.label)
    + (cs ? '<span class="tipcost">' + cs + '</span>' : '') + '</div>';
  html += '<div class="tipdesc">' + (c.desc || (c.type ? meta(c.type).desc : '') || '') + '</div>';
  if (d) html += '<div class="tipstat">' + statLine(d) + '</div>';
  if (c.type) {
    for (const r of reqStatus(game.localFac, c.type)) {
      html += '<div class="tipreq" style="color:' + (r.ok ? '#7dd87d' : '#e0843d') + '">'
        + (r.ok ? '✓ ' : '✗ Requires ') + r.name + '</div>';
    }
  }
  tip.innerHTML = html;
  tip.style.display = 'block';
}

function refreshCard() {
  const card = document.getElementById('cmdcard');
  card.innerHTML = '';
  document.getElementById('tooltip').style.display = 'none';
  if (!game) return;
  const cmds = currentCommands();
  const hot = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  cmds.forEach((c, i) => {
    const b = document.createElement('button');
    b.disabled = !c.enabled;
    const cs = costStr(game.localFac, c.cost, c.cost2);
    b.innerHTML = '<span class="k">' + (hot[i] || '') + '</span>' + c.label
      + (cs ? '<span class="c">' + cs + '</span>' : (c.sub ? '<span class="c">' + c.sub + '</span>' : ''));
    b.onclick = () => { if (c.enabled) c.onClick(); };
    b.addEventListener('mouseenter', () => showTip(c));
    b.addEventListener('mouseleave', () => { document.getElementById('tooltip').style.display = 'none'; });
    card.appendChild(b);
  });
}

function updateHUD() {
  const fac = game.localFac, p = game.players[fac];
  if (game.defeated && !game.over) {
    const hf = document.getElementById('hudFac');
    hf.textContent = 'DEFEATED — spectating'; hf.style.color = '#ff7d7d';
  }
  document.getElementById('hudRes').innerHTML = FACTIONS[fac].res + ': <b>' + Math.floor(p.res) + '</b>';
  const res2El = document.getElementById('hudRes2');
  if (FACTIONS[fac].res2) {
    res2El.style.display = '';
    res2El.innerHTML = FACTIONS[fac].res2 + ': <b>' + Math.floor(p.iron || 0) + '</b>'
      + ' <span style="opacity:.7">+' + (p.ironInc || 0).toFixed(1) + '/s</span>';
  } else res2El.style.display = 'none';
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
      const what = it.research ? ('Researching ' + (RESEARCH[it.rid] ? RESEARCH[it.rid].name : '…'))
        : ('Producing ' + DEFS[it.type].name);
      s += '\n' + what + ' ' + Math.floor((1 - it.t / it.total) * 100) + '%'
        + (e.queue.length > 1 ? ' (+' + (e.queue.length - 1) + ' queued)' : '');
    }
    if (e.type === 'hive') s += '\nRight-click to set the swarm rally';
    if (e.type === 'ark' && e.deployed) s += '\nDEPLOYED — siphoning' + (e.siphonNode ? ' crystal' : '… (no node in reach)');
    if (e.type === 'haven') s += '\nTreasury earns interest — Countinghouses raise the cap';
    if (e.fac === 'choir' && e.def.kind === 'unit') s += '\nFades away from the lattice — heals by dealing damage';
    const desc = meta(e.type).desc;
    if (desc) s += '\n' + desc;
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

