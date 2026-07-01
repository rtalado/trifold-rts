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
      type, label: d.name, cost: d.cost, cost2: d.cost2, cost3: d.cost3, cat: 'unit',
      poor: tech && !affordable(p, d),
      enabled: tech && affordable(p, d) && !host.constructing && !host.growing,
      onClick: () => {
        if (game.mode === 'guest') netSend({ t: 'cmd', fac: game.localFac, kind: 'enq', id: host.id, type });
        else enqueue(host, type);
        playSfx('train');
        refreshCard();
      },
    });
  };
  const buildBtn = type => {
    const d = DEFS[type], tech = techMet(fac, type);
    cmds.push({
      type, label: d.name, cat: 'building',
      tag: (BUILD_VERB[fac] || 'Build').trim().toUpperCase(),
      cost: d.cost, cost2: d.cost2, cost3: d.cost3, enabled: tech && affordable(p, d),
      poor: tech && !affordable(p, d),
      onClick: () => { game.placing = type; },
    });
  };
  const researchBtn = (host, rid) => {
    const r = RESEARCH[rid], have = p.research.has(rid);
    const inProg = researchQueued(fac, rid);
    const reqMet = !r.req || p.research.has(r.req);
    cmds.push({
      rid, cat: 'research', label: (have ? '✓ ' : '⚙ ') + r.name,
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

  if (types.has('worker')) ['barracks', 'factory', 'depot', 'airfield', 'turret', 'pillbox', 'radar_van', 'techlab', 'dominion'].forEach(buildBtn);

  // scuttle any of your own selected units instantly — no refund, no bounty to the
  // enemy. Works on the whole selection at once; cores are excluded.
  const scuttleable = game.sel.filter(e => e.fac === fac && e.def.kind === 'unit' && !e.def.core);
  if (scuttleable.length) {
    cmds.push({
      label: '☠ Self-Destruct', cost: 0, enabled: true, cat: 'sell',
      sub: scuttleable.length > 1 ? scuttleable.length + ' units' : null,
      desc: 'Instantly destroy the selected unit' + (scuttleable.length > 1 ? 's' : '') + '. No refund, and the enemy gets no kill credit — handy for denying a doomed unit or clearing a cap slot.',
      onClick: () => {
        const ids = scuttleable.map(e => e.id);
        if (game.mode === 'guest') netSend({ t: 'cmd', fac: game.localFac, kind: 'selfdestruct', ids });
        else selfDestruct(fac, ids);
        game.sel = []; refreshCard();
      },
    });
  }

  if (game.sel.length === 1) {
    const d = sel0.def;
    if (d.grows) d.grows.forEach(buildBtn);
    if (d.produces && !sel0.constructing && !sel0.growing) d.produces.forEach(t => prodBtn(sel0, t));
    if (sel0.type === 'ark') {
      cmds.push({
        label: sel0.deployed ? 'Undeploy Ark' : 'Deploy Ark', cost: 0, enabled: true, cat: 'ability',
        tag: 'DEPLOY', sub: 'Siphon energy from a crystal node',
        desc: 'Anchor the Ark on a crystal node to siphon Energy quickly. Undeploy to move again.',
        onClick: () => {
          if (game.mode === 'guest') netSend({ t: 'cmd', fac: game.localFac, kind: 'deploy', id: sel0.id, on: !sel0.deployed });
          else { sel0.deployed = !sel0.deployed; if (sel0.deployed) sel0.order = { type: 'idle' }; }
          refreshCard();
        },
      });
      // the Ark upgrade ladder — buffs the Ark and enlarges its model each tier
      if (sel0.fac === fac) {
        const tier = p.arkTier || 0;
        if (tier < ARK_UPGRADES.length) {
          const up = ARK_UPGRADES[tier];
          cmds.push({
            label: up.name, cat: 'upgrade', tag: 'UPGRADE', cost: up.cost,
            sub: 'Ark tier ' + (tier + 1) + '/' + ARK_UPGRADES.length, desc: up.desc,
            enabled: p.res >= up.cost && !sel0.constructing,
            poor: p.res < up.cost,
            onClick: () => {
              if (game.mode === 'guest') netSend({ t: 'cmd', fac: game.localFac, kind: 'arkup', id: sel0.id });
              else upgradeArk(game.localFac, sel0);
              refreshCard();
            },
          });
        } else {
          cmds.push({
            label: 'Ark Ascended', cat: 'upgrade', tag: 'MAX', cost: 0, enabled: false,
            sub: 'Tier ' + ARK_UPGRADES.length + '/' + ARK_UPGRADES.length,
            desc: 'The Ark has reached its ultimate form.',
          });
        }
      }
    }
    // active targeted ability (the Worldbreaker's Gustav Strike)
    if (d.ability && sel0.fac === fac) {
      const ab = d.ability;
      const ready = (sel0.abilityCd || 0) <= 0 && !sel0.constructing && !sel0.growing;
      const aiming = game.targeting && game.targeting.id === sel0.id;
      cmds.push({
        label: (aiming ? '◎ ' : '☢ ') + ab.name, cost: 0, enabled: ready, cat: 'ability',
        sub: aiming ? 'Click a target…' : (ready ? 'READY' : 'Reload ' + Math.ceil(sel0.abilityCd || 0) + 's'),
        desc: ab.desc + ' Range ' + ab.range + ' · Blast ' + (ab.splash || ab.radius) + ' · Reload ' + ab.cd + 's.',
        onClick: () => {
          game.targeting = { id: sel0.id, ability: ab.key };
          floatMsg('Designate ' + ab.name + ' impact — left-click (Esc / right-click to cancel)');
        },
      });
    }
    // the faction's research building opens the full visual tech tree
    if (d.researchLab && RESEARCH_BY_FAC[fac]) {
      const done = RESEARCH_BY_FAC[fac].filter(rid => p.research.has(rid)).length;
      cmds.push({
        label: '⚙ Tech Tree', cost: 0, enabled: true, cat: 'research',
        sub: done + '/' + RESEARCH_BY_FAC[fac].length,
        desc: 'Open the research tree — spend ' + FACTIONS[fac].res + ' on permanent upgrades.',
        onClick: () => openTechTree(),
      });
    }
    // sell any of your own non-core buildings to recover half the cost
    if (d.kind === 'building' && !d.core && sel0.fac === fac) {
      const ref = Math.round((d.cost || 0) * SELL_REFUND);
      cmds.push({
        label: '✖ Sell', cost: 0, enabled: true, cat: 'sell',
        sub: '+' + ref + ' ' + FACTIONS[fac].res
          + (d.cost2 ? ' +' + Math.round(d.cost2 * SELL_REFUND) + ' ' + FACTIONS[fac].res2 : '')
          + (d.cost3 ? ' +' + Math.round(d.cost3 * SELL_REFUND) + ' ' + FACTIONS[fac].res3 : ''),
        desc: 'Demolish this building and recover half of what it cost. Handy for fixing a bad placement.',
        onClick: () => {
          if (game.mode === 'guest') netSend({ t: 'cmd', fac: game.localFac, kind: 'sell', id: sel0.id });
          else sellBuilding(fac, sel0.id);
          game.sel = []; refreshCard();
        },
      });
    }
  }
  // group like with like (buildings, then units, then abilities, research, sell)
  // — a stable sort, so order within each category is preserved. Both the card
  // render and the digit hotkeys read this same array, so they stay in sync.
  const catOrder = { building: 0, unit: 1, upgrade: 2, ability: 3, research: 4, sell: 5 };
  cmds.forEach((c, i) => { c._i = i; });
  cmds.sort((a, b) => ((catOrder[a.cat] ?? 8) - (catOrder[b.cat] ?? 8)) || (a._i - b._i));
  return cmds.slice(0, 16);
}

// compact stat readout for a definition, shown in the build tooltip
// "120 Stone + 30 Iron" — renders a primary (and optional secondary) cost
function costStr(fac, cost, cost2, cost3) {
  const F = FACTIONS[fac];
  let s = cost ? cost + ' ' + F.res : '';
  if (cost2) s += (s ? ' + ' : '') + cost2 + ' ' + (F.res2 || '');
  if (cost3) s += (s ? ' + ' : '') + cost3 + ' ' + (F.res3 || '');
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
  const cs = costStr(game.localFac, c.cost, c.cost2, c.cost3);
  const cat = c.cat || (d ? d.kind : null);
  const catLbl = cat === 'building' ? 'BUILDING' : cat === 'unit' ? 'UNIT'
    : cat === 'research' ? 'RESEARCH' : cat === 'sell' ? 'SELL' : cat === 'upgrade' ? 'UPGRADE'
    : cat === 'ability' ? 'ABILITY' : '';
  let html = '<div class="tipname">'
    + (catLbl ? '<span class="tipcat tipcat-' + catClass(cat) + '">' + catLbl + '</span>' : '')
    + (d ? d.name : c.label)
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
    const cat = c.cat || 'ability';
    b.className = 'cmd-' + catClass(cat);
    const cs = costStr(game.localFac, c.cost, c.cost2, c.cost3);
    const tag = c.tag || CAT_TAG[cat] || 'USE';
    const sub = cs || c.sub || '';
    b.innerHTML =
      '<span class="cmd-top"><span class="cmd-tag">' + tag + '</span>'
        + '<span class="k">' + (hot[i] || '') + '</span></span>'
      + '<span class="cmd-name">' + c.label + '</span>'
      + (sub ? '<span class="c' + (c.poor ? ' poor' : '') + '">' + sub + '</span>' : '');
    // re-fetch the command fresh at click/hover time instead of closing over `c` —
    // otherwise a button built while you were short on resources keeps checking
    // that stale (disabled) snapshot forever, even after updateHUD's cheap
    // per-tick refresh (below) flips its *visual* disabled state back on. That
    // mismatch was the "have to click it twice" bug: it LOOKED clickable the
    // moment you could afford it, but silently did nothing until you reselected.
    b.onclick = () => {
      if (game && game.netPaused) return;
      const fresh = currentCommands()[i];
      if (fresh && fresh.enabled) fresh.onClick();
    };
    b.addEventListener('mouseenter', () => showTip(currentCommands()[i] || c));
    b.addEventListener('mouseleave', () => { document.getElementById('tooltip').style.display = 'none'; });
    card.appendChild(b);
  });
}

// command categories → CSS suffix + default corner tag
const CAT_TAG = { building: 'BUILD', unit: 'TRAIN', research: 'TECH', ability: 'USE', sell: 'SELL', upgrade: 'UPGRADE' };
function catClass(cat) {
  return cat === 'building' ? 'build' : cat === 'unit' ? 'unit'
    : cat === 'research' ? 'tech' : cat === 'sell' ? 'sell'
    : cat === 'upgrade' ? 'upg' : 'ability';
}

// cancel a queued item (from the clickable queue chips in the selection panel)
function cancelQueueItem(id, idx, research) {
  const e = byId(id);
  if (!e || e.fac !== game.localFac) return;
  if (game.mode === 'guest') netSend({ t: 'cmd', fac: game.localFac, kind: 'deq', id, idx, r: research ? 1 : 0 });
  else dequeue(e, idx, research);
  renderSelInfo(document.getElementById('selinfo'));
}

// ---------------- selection info panel ----------------
function catPill(cat) {
  const lbl = cat === 'building' ? 'BUILDING' : cat === 'unit' ? 'UNIT' : cat.toUpperCase();
  return '<span class="catpill cat-' + catClass(cat) + '">' + lbl + '</span>';
}
function statBar(label, cur, max, cls) {
  const pct = max ? Math.max(0, Math.min(100, cur / max * 100)) : 0;
  return '<div class="statbar"><i class="fill ' + cls + '" style="width:' + pct + '%"></i>'
    + '<b>' + label + ' ' + Math.ceil(cur) + '/' + max + '</b></div>';
}
// #selinfo is split into two persistent children: `.si-main` (rebuilt every
// frame — non-interactive HP bars/notes) and `.si-queues` (rebuilt only when the
// queue membership changes, with delegated clicks) so the queue chips stay
// click-stable and keep their scroll position between frames.
function ensureSelStructure(si) {
  if (si.__main && si.__queues) return;
  si.innerHTML = '';
  const m = document.createElement('div'); m.className = 'si-main';
  const q = document.createElement('div'); q.className = 'si-queues';
  q.addEventListener('click', ev => {
    if (game && game.netPaused) return;
    const chip = ev.target.closest('.qchip'); if (!chip) return;
    cancelQueueItem(+chip.dataset.eid, +chip.dataset.idx, chip.dataset.r === '1');
  });
  si.appendChild(m); si.appendChild(q);
  si.__main = m; si.__queues = q; si.__qsig = null;
}

// the Virulent Strain's current hivemind resistance — every unit shares one, so this
// reads straight off the player record rather than the selected entity
function evoResistNote(fac) {
  const p = game.players[fac];
  return (p && p.evoResist) ? 'Swarm-wide: hardened against ' + p.evoResist + ' damage' : 'Swarm-wide: not yet adapted to anything';
}

function renderSelInfo(si) {
  ensureSelStructure(si);
  si.__main.innerHTML = buildSelMainHTML();
  const sig = queueSig();
  if (sig !== si.__qsig) { si.__qsig = sig; si.__queues.innerHTML = buildQueuesHTML(); }
  updateQueueProgress(si.__queues);
}

function buildSelMainHTML() {
  if (!game.sel.length) {
    return '<div class="sel-empty"><div class="sel-empty-t">NOTHING SELECTED</div>'
      + '<div>Drag or click to select.</div>'
      + '<div>Right-click — move / attack / harvest</div>'
      + '<div>Shift+right-click — attack-move</div>'
      + '<div>Ctrl+right-click — attack that way</div>'
      + '<div><b>F</b> select army &nbsp;·&nbsp; <b>Space</b> jump to core</div></div>';
  }
  if (game.sel.length === 1) {
    const e = game.sel[0], cat = e.def.kind;
    let h = '<div class="sel-head">' + catPill(cat) + '<span class="sel-name">' + e.def.name + '</span></div>';
    h += '<div class="sel-bars">' + statBar('HP', e.hp, e.hpMax, 'hp');
    if (e.shieldMax) h += statBar('Shield', e.shield, e.shieldMax, 'shield');
    h += '</div>';
    const notes = [];
    if (e.constructing) notes.push('Under construction ' + Math.floor(e.progress / e.def.time * 100) + '%');
    if (e.growing) notes.push('Growing ' + Math.floor(e.progress / e.def.time * 100) + '%');
    // your own queues render as editable chips below; others just get a text note
    if (e.fac !== game.localFac && e.queue && e.queue.length) {
      const it = e.queue[0];
      notes.push('Producing ' + DEFS[it.type].name + ' ' + Math.floor((1 - it.t / it.total) * 100) + '%'
        + (e.queue.length > 1 ? ' (+' + (e.queue.length - 1) + ' queued)' : ''));
    }
    if (e.type === 'hive') notes.push('Right-click to set the swarm rally');
    if (e.type === 'ark' && e.deployed) notes.push('DEPLOYED — siphoning' + (e.siphonNode ? ' crystal' : '… (no node in reach)'));
    if (e.type === 'haven') notes.push('Treasury earns interest — Countinghouses & Vaults raise the cap');
    if (e.type === 'vault') notes.push('Bullion stored — raises your interest cap & pays rent');
    if (e.def.ability) notes.push(e.def.ability.name + ((e.abilityCd || 0) > 0 ? ': reloading ' + Math.ceil(e.abilityCd) + 's' : ': READY — target via the command card'));
    if (e.fac === 'choir' && e.def.kind === 'unit') notes.push('Fades away from the lattice — heals by dealing damage');
    if (e.fac === 'strain' && e.def.kind === 'unit') notes.push(evoResistNote('strain'));
    if (notes.length) h += '<div class="sel-status">' + notes.map(n => '<div>' + n + '</div>').join('') + '</div>';
    // description only when there's no editable queue taking the space
    const ownsQueues = e.fac === game.localFac && ((e.queue && e.queue.length) || (e.rqueue && e.rqueue.length));
    if (!ownsQueues) { const desc = meta(e.type).desc; if (desc) h += '<div class="sel-desc">' + desc + '</div>'; }
    return h;
  }
  // multi-select: count, then a colour-dotted tally by type
  const counts = {};
  for (const e of game.sel) counts[e.type] = (counts[e.type] || 0) + 1;
  let h = '<div class="sel-head"><span class="sel-name">' + game.sel.length + ' SELECTED</span></div>';
  if (game.sel.some(e => e.fac === 'strain' && e.def.kind === 'unit'))
    h += '<div class="sel-status"><div>' + evoResistNote('strain') + '</div></div>';
  h += '<div class="sel-list">';
  for (const t in counts) {
    const d = DEFS[t];
    h += '<div class="sel-li"><span class="dot dot-' + catClass(d.kind) + '"></span>'
      + '<span class="n">' + d.name + '</span><span class="x">×' + counts[t] + '</span></div>';
  }
  return h + '</div>';
}

// a signature of which items are queued (not their progress) — when it changes
// we rebuild the chips; otherwise we leave them be and just animate progress
function queueSig() {
  if (game.sel.length !== 1) return 'none';
  const e = game.sel[0];
  if (e.fac !== game.localFac) return 'foreign:' + e.id;
  return e.id + '|P:' + (e.queue || []).map(it => it.type).join(',')
    + '|R:' + (e.rqueue || []).map(it => it.rid).join(',');
}

function qchip(eid, idx, name, research) {
  return '<button class="qchip' + (research ? ' q-research' : '') + '" title="Cancel (refunds cost)"'
    + ' data-eid="' + eid + '" data-idx="' + idx + '" data-r="' + (research ? 1 : 0) + '">'
    + '<i class="qprog" data-front="' + (idx === 0 ? 1 : 0) + '"></i>'
    + '<span class="qn">' + name + '</span><span class="qx">✕</span></button>';
}

function buildQueuesHTML() {
  if (game.sel.length !== 1) return '';
  const e = game.sel[0];
  if (e.fac !== game.localFac) return '';
  let h = '';
  if (e.queue && e.queue.length) {
    h += '<div class="sel-qhead">PRODUCTION <span class="qcap">' + e.queue.length + '/' + MAX_QUEUE + '</span></div>'
      + '<div class="sel-queue">' + e.queue.map((it, i) => qchip(e.id, i, DEFS[it.type].name, false)).join('') + '</div>';
  }
  if (e.rqueue && e.rqueue.length) {
    h += '<div class="sel-qhead">RESEARCH <span class="qcap">' + e.rqueue.length + '/6</span></div>'
      + '<div class="sel-queue">' + e.rqueue.map((it, i) => qchip(e.id, i, (RESEARCH[it.rid] ? RESEARCH[it.rid].name : '…'), true)).join('') + '</div>';
  }
  return h;
}

function updateQueueProgress(q) {
  if (game.sel.length !== 1) return;
  const e = game.sel[0];
  const pf = q.querySelector('.qchip[data-r="0"] .qprog[data-front="1"]');
  if (pf && e.queue && e.queue[0]) pf.style.width = Math.floor((1 - e.queue[0].t / e.queue[0].total) * 100) + '%';
  const rf = q.querySelector('.qchip[data-r="1"] .qprog[data-front="1"]');
  if (rf && e.rqueue && e.rqueue[0]) rf.style.width = Math.floor((1 - e.rqueue[0].t / e.rqueue[0].total) * 100) + '%';
}

function updateHUD() {
  const fac = game.localFac, p = game.players[fac];
  if (game.defeated && !game.over) {
    const hf = document.getElementById('hudFac');
    hf.textContent = 'DEFEATED — spectating'; hf.style.color = '#ff7d7d';
  }
  document.getElementById('hudRes').innerHTML = FACTIONS[fac].res + ': <b>' + Math.floor(p.res) + '</b>'
    + ' <span style="opacity:.7">+' + p.income.toFixed(1) + '/s</span>';
  const res2El = document.getElementById('hudRes2');
  if (FACTIONS[fac].res2) {
    res2El.style.display = '';
    res2El.innerHTML = FACTIONS[fac].res2 + ': <b>' + Math.floor(p.iron || 0) + '</b>'
      + ' <span style="opacity:.7">+' + (p.ironInc || 0).toFixed(1) + '/s</span>';
  } else res2El.style.display = 'none';
  const res3El = document.getElementById('hudRes3');
  if (FACTIONS[fac].res3) {
    res3El.style.display = '';
    res3El.innerHTML = FACTIONS[fac].res3 + ': <b>' + Math.floor(p.powder || 0) + '</b>'
      + ' <span style="opacity:.7">+' + (p.powderInc || 0).toFixed(1) + '/s</span>';
  } else res3El.style.display = 'none';
  // the main resource now shows its +/s inline (like Iron/Powder); this slot keeps
  // only the Myriad's creep readout
  const incEl = document.getElementById('hudIncome');
  incEl.style.display = fac === 'myriad' ? '' : 'none';
  incEl.innerHTML = fac === 'myriad' ? 'Creep: <b>' + (p.creepTiles || 0) + '</b> tiles' : '';
  let armyHtml = 'Units: <b>' + countUnits(fac) + '</b>/' + capOf(fac);
  // the Verdant Bloom's free Saplings and the Myriad's free Larva keep their own cap
  if (fac === 'verdant') {
    const sc = freeCapOf(fac);
    armyHtml += ' · Saplings: <b>' + countFree(fac) + '</b>/' + (sc === Infinity ? '∞' : sc);
  } else if (fac === 'myriad') {
    const lc = freeCapOf(fac);
    armyHtml += ' · Larva: <b>' + countFree(fac) + '</b>/' + (lc === Infinity ? '∞' : lc);
  } else if (fac === 'choir') {
    armyHtml += ' · Husks: <b>' + countFree(fac) + '</b>/' + freeCapOf(fac);
  } else if (fac === 'ember') {
    armyHtml += ' · Emberlings: <b>' + countFree(fac) + '</b>/' + freeCapOf(fac);
  }
  document.getElementById('hudArmy').innerHTML = armyHtml;

  // match timer (elapsed match time — game.t is shared across host/guest/SP)
  const secs = Math.max(0, Math.floor(game.t));
  document.getElementById('hudTime').innerHTML =
    '⏱ <b>' + Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0') + '</b>';

  // selection info
  renderSelInfo(document.getElementById('selinfo'));

  // refresh card button enabled-state cheaply
  const card = document.getElementById('cmdcard');
  const cmds = currentCommands();
  const btns = card.querySelectorAll('button');
  if (btns.length === cmds.length) cmds.forEach((c, i) => { btns[i].disabled = !c.enabled; });
  else refreshCard();

  if (techOpen) refreshTechTree(); // keep the open tech tree live (no DOM rebuild)
}

// ---------------- visual tech tree ----------------
let techOpen = false;
let techBuiltFor = null;        // which faction the current node DOM was built for
const techNodeEls = {};         // rid -> persistent node element (kept stable so
                                // hovering/clicking isn't interrupted by refreshes)
// the player's standing research building (the Ark, for the base-less Exodus)
function techLab() { return ents(e => e.fac === game.localFac && e.def.researchLab && !e.constructing && !e.growing)[0]; }
function openTechTree() { if (!game) return; techOpen = true; document.getElementById('techtree').style.display = 'flex'; buildTechTree(); }
function closeTechTree() { techOpen = false; document.getElementById('techtree').style.display = 'none'; }
function toggleTechTree() { techOpen ? closeTechTree() : openTechTree(); }

function researchNode(rid) {
  const fac = game.localFac, p = game.players[fac], r = RESEARCH[rid];
  if (!r || p.research.has(rid) || researchQueued(fac, rid)) return; // done/queued — ignore
  if (r.req && !p.research.has(r.req)) { floatMsg('Requires ' + RESEARCH[r.req].name); return; }
  const lab = techLab();
  if (!lab) { floatMsg('Build your research building first'); return; }
  if (game.mode === 'guest') netSend({ t: 'cmd', fac, kind: 'research', id: lab.id, rid });
  else enqueueResearch(lab, rid);
  refreshTechTree();
}

// grid layout: tier = column, branch = row
const TECH_COLW = 188, TECH_ROWH = 104, TECH_PADX = 116, TECH_PADY = 14, TECH_NW = 150, TECH_NH = 70;
function techPos(rid) { const r = RESEARCH[rid]; return { x: TECH_PADX + r.tier * TECH_COLW, y: TECH_PADY + r.branch * TECH_ROWH }; }

// Build the tech-tree DOM once (per faction). Node elements are then kept and
// only their *state* is updated by refreshTechTree, so hovering or clicking a
// node is never interrupted by a rebuild.
function buildTechTree() {
  if (!game || !techOpen) return;
  const fac = game.localFac, F = FACTIONS[fac], list = RESEARCH_BY_FAC[fac] || [];
  const title = document.getElementById('techTitle');
  title.textContent = F.name + ' — TECH TREE'; title.style.color = F.color;

  const W = TECH_PADX + 4 * TECH_COLW, H = TECH_PADY + 4 * TECH_ROWH;
  const nodes = document.getElementById('techNodes'), svg = document.getElementById('techLines');
  nodes.style.width = W + 'px'; nodes.style.height = H + 'px';
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  nodes.innerHTML = '';
  for (const k in techNodeEls) delete techNodeEls[k];

  // branch labels down the left
  TECH_BRANCHES.forEach((b, i) => {
    const lbl = document.createElement('div'); lbl.className = 'techbranch';
    lbl.textContent = b; lbl.style.left = '6px'; lbl.style.top = (TECH_PADY + i * TECH_ROWH + TECH_NH / 2) + 'px';
    nodes.appendChild(lbl);
  });

  // nodes (static structure + one persistent click handler each)
  for (const rid of list) {
    const r = RESEARCH[rid];
    const el = document.createElement('div'); el.className = 'technode';
    const pp = techPos(rid); el.style.left = pp.x + 'px'; el.style.top = pp.y + 'px';
    el.innerHTML = '<div class="tn-name">' + r.name + '</div><div class="tn-desc">' + r.desc + '</div><div class="tn-cost"></div>';
    el.onclick = () => { if (game && game.netPaused) return; researchNode(rid); };
    techNodeEls[rid] = el;
    nodes.appendChild(el);
  }
  techBuiltFor = fac;
  refreshTechTree();
}

// Per-frame: update header, dependency-line colours and each node's class/cost
// in place. No elements are created or destroyed here.
function refreshTechTree() {
  if (!game || !techOpen) return;
  const fac = game.localFac;
  if (techBuiltFor !== fac) { buildTechTree(); return; }
  const p = game.players[fac], F = FACTIONS[fac], list = RESEARCH_BY_FAC[fac] || [];
  const done = list.filter(r => p.research.has(r)).length;
  document.getElementById('techRes').innerHTML = F.res + ': <b>' + Math.floor(p.res) + '</b> &nbsp;·&nbsp; Researched ' + done + '/' + list.length;

  let lines = '';
  for (const rid of list) {
    const r = RESEARCH[rid]; if (!r.req) continue;
    const a = techPos(r.req), b = techPos(rid);
    const x1 = a.x + TECH_NW, y1 = a.y + TECH_NH / 2, x2 = b.x, y2 = b.y + TECH_NH / 2, mx = (x1 + x2) / 2;
    const col = p.research.has(rid) ? '#7dd87d' : (p.research.has(r.req) ? '#5b6b82' : '#2c3849');
    lines += '<path d="M' + x1 + ' ' + y1 + ' C ' + mx + ' ' + y1 + ' ' + mx + ' ' + y2 + ' ' + x2 + ' ' + y2 + '" fill="none" stroke="' + col + '" stroke-width="2"/>';
  }
  document.getElementById('techLines').innerHTML = lines;

  for (const rid of list) {
    const el = techNodeEls[rid]; if (!el) continue;
    const r = RESEARCH[rid];
    const has = p.research.has(rid), queued = researchQueued(fac, rid);
    const reqMet = !r.req || p.research.has(r.req), afford = p.res >= r.cost;
    let cls = 'technode';
    if (has) cls += ' done'; else if (queued) cls += ' queued'; else if (!reqMet) cls += ' locked'; else cls += afford ? ' avail' : ' poor';
    if (el.className !== cls) el.className = cls;
    const costEl = el.querySelector('.tn-cost');
    const costTxt = has ? '✓ Researched' : queued ? '⚙ Researching…' : (r.cost + ' ' + F.res);
    if (costEl.textContent !== costTxt) costEl.textContent = costTxt;
  }
}


// ---------------- sandbox panel: spawn anything, from any faction, for free ----------------
let sandboxOpen = false;
let sandboxFac = null;             // which faction's units/buildings you're about to spawn
let sandboxBuiltFor = null;        // guard: only rebuild the grid once per panel-open

function openSandboxPanel() {
  if (!game || !game.sandbox) return;
  sandboxOpen = true;
  if (!sandboxFac) sandboxFac = game.localFac;
  document.getElementById('sandboxGodChk').checked = !!game.sandboxGod;
  document.getElementById('sandboxtree').style.display = 'flex';
  buildSandboxPanel();
}
function closeSandboxPanel() {
  sandboxOpen = false;
  document.getElementById('sandboxtree').style.display = 'none';
}
function toggleSandboxPanel() { sandboxOpen ? closeSandboxPanel() : openSandboxPanel(); }

function armSandboxItem(type) {
  if (game.sandboxPlacing && game.sandboxPlacing.type === type && game.sandboxPlacing.fac === sandboxFac) {
    game.sandboxPlacing = null; // clicking the armed item again disarms it
  } else {
    game.sandboxPlacing = { type, fac: sandboxFac };
    playSfx('select');
  }
  refreshSandboxArmedState();
}
function refreshSandboxArmedState() {
  const grid = document.getElementById('sandboxGrid');
  for (const el of grid.querySelectorAll('.sbitem')) {
    const armed = !!(game.sandboxPlacing && game.sandboxPlacing.type === el.dataset.type && game.sandboxPlacing.fac === sandboxFac);
    el.classList.toggle('armed', armed);
  }
}

function buildSandboxPanel() {
  if (!game) return;
  // faction picker row (rebuilt every open — cheap, and reflects the current roster)
  const facRow = document.getElementById('sandboxFacRow');
  facRow.innerHTML = '';
  for (const f in FACTIONS) {
    const b = document.createElement('button');
    b.className = 'sbfac' + (f === sandboxFac ? ' sel' : '');
    b.style.color = facColor(f);
    b.textContent = FACTIONS[f].name;
    b.onclick = () => { sandboxFac = f; buildSandboxPanel(); };
    facRow.appendChild(b);
  }
  // spawnable grid — every non-neutral unit/building in the game, grouped loosely
  // by kind so buildings and units aren't interleaved
  const grid = document.getElementById('sandboxGrid');
  grid.innerHTML = '';
  const types = Object.keys(DEFS).filter(t => DEFS[t].fac === sandboxFac)
    .sort((a, b) => (DEFS[a].kind === DEFS[b].kind ? 0 : DEFS[a].kind === 'building' ? -1 : 1));
  for (const type of types) {
    const d = DEFS[type];
    const b = document.createElement('button');
    b.className = 'sbitem'; b.dataset.type = type;
    b.style.borderLeftColor = facColor(sandboxFac);
    b.innerHTML = '<span class="sb-name">' + d.name + '</span><span class="sb-kind">'
      + (d.kind === 'building' ? 'Building' : 'Unit') + (d.core ? ' · core' : d.apex ? ' · apex' : '') + '</span>';
    b.onclick = () => armSandboxItem(type);
    grid.appendChild(b);
  }
  refreshSandboxArmedState();
}

// heal every currently-selected entity to full HP/shield
function sandboxHealSelection() {
  if (!game) return;
  for (const e of game.sel) { e.hp = e.hpMax; if (e.shieldMax) e.shield = e.shieldMax; }
}
// instantly kill every currently-selected entity (bypasses god mode on purpose)
function sandboxKillSelection() {
  if (!game) return;
  for (const e of game.sel) e.dead = true;
  game.sel = []; refreshCard();
}
// wipe every entity that isn't owned by the faction you're currently spawning as
function sandboxClearOthers() {
  if (!game) return;
  for (const e of game.entities) if (e.fac !== sandboxFac) e.dead = true;
  game.sel = game.sel.filter(e => e.fac === sandboxFac);
  refreshCard();
}

document.getElementById('sandboxHealBtn').addEventListener('click', sandboxHealSelection);
document.getElementById('sandboxKillBtn').addEventListener('click', sandboxKillSelection);
document.getElementById('sandboxClearBtn').addEventListener('click', sandboxClearOthers);
document.getElementById('sandboxGodChk').addEventListener('change', ev => { if (game) game.sandboxGod = ev.target.checked; });
