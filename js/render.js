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

  // scenery (drawn under everything else)
  if (game.decor) for (const d of game.decor) drawDecor(d);

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

// a single piece of background scenery — muted, low-contrast so it never competes
// with units or buildings for attention
function drawDecor(d) {
  const x = d.x, y = d.y, s = d.s;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(d.r);
  if (d.k === 'rock') {
    ctx.fillStyle = '#1b2533'; ctx.strokeStyle = '#2c3a4f'; ctx.lineWidth = 1.5;
    poly(0, 0, s, 5, 0.3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#243042'; poly(-s * 0.18, -s * 0.18, s * 0.5, 5, 0.9); ctx.fill();
  } else if (d.k === 'rubble') {
    ctx.fillStyle = '#202b3a';
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3, rr = s * (0.4 + 0.5 * ((i * 7) % 3) / 3);
      ctx.beginPath(); ctx.arc(Math.cos(a) * s * 0.5, Math.sin(a) * s * 0.5, rr * 0.4, 0, Math.PI * 2); ctx.fill();
    }
  } else if (d.k === 'crater') {
    ctx.fillStyle = '#11171f'; ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2a3954'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, s * 0.92, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#0c1016'; ctx.beginPath(); ctx.arc(0, 0, s * 0.55, 0, Math.PI * 2); ctx.fill();
  } else if (d.k === 'scrub') {
    ctx.strokeStyle = '#234027'; ctx.lineWidth = 1.6; ctx.fillStyle = '#1a3320';
    ctx.beginPath(); ctx.arc(0, 0, s * 0.7, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s); ctx.stroke();
    }
  } else { // shard — a dull rocky crystal cluster (not harvestable)
    ctx.fillStyle = '#243a44'; ctx.strokeStyle = '#34525e'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1, px = Math.cos(a) * s * 0.4, py = Math.sin(a) * s * 0.4;
      ctx.beginPath(); ctx.moveTo(px, py - s * 0.7); ctx.lineTo(px + s * 0.3, py); ctx.lineTo(px, py + s * 0.4); ctx.lineTo(px - s * 0.3, py); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
  }
  ctx.restore();
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
    } else if (e.type === 'tank' || e.type === 'flametank' || e.type === 'goliath') {
      ctx.fillStyle = e.type === 'goliath' ? '#0f2740' : dark; ctx.strokeStyle = col; ctx.lineWidth = 2;
      roundRect(x - s, y - s * 0.7, s * 2, s * 1.4, 4); ctx.fill(); ctx.stroke();
      const t = e.tgt ? byId(e.tgt) : null;
      const a = t ? Math.atan2(t.y - y, t.x - x) : 0;
      ctx.strokeStyle = e.type === 'flametank' ? '#ff9d4d' : col;
      ctx.lineWidth = e.type === 'goliath' ? 4 : 3;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 8), y + Math.sin(a) * (s + 8)); ctx.stroke();
      if (e.type === 'goliath') { // twin barrels
        const px = Math.cos(a + Math.PI / 2) * 3, py = Math.sin(a + Math.PI / 2) * 3;
        ctx.beginPath(); ctx.moveTo(x + px, y + py); ctx.lineTo(x + px + Math.cos(a) * (s + 6), y + py + Math.sin(a) * (s + 6));
        ctx.moveTo(x - px, y - py); ctx.lineTo(x - px + Math.cos(a) * (s + 6), y - py + Math.sin(a) * (s + 6)); ctx.stroke();
      }
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
    } else if (e.type === 'cache') { // small jungle camp — a crate of loot
      ctx.fillStyle = '#26303a'; ctx.strokeStyle = '#b8923a'; ctx.lineWidth = 2;
      roundRect(x - s, y - s * 0.8, s * 2, s * 1.6, 3); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#d4a73e'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x + s, y);
      ctx.moveTo(x, y - s * 0.8); ctx.lineTo(x, y + s * 0.8); ctx.stroke();
      const t = e.tgt ? byId(e.tgt) : null;
      if (t) {
        const a = Math.atan2(t.y - y, t.x - x);
        ctx.strokeStyle = '#d4a73e'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 7), y + Math.sin(a) * (s + 7)); ctx.stroke();
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

  else if (e.fac === 'warden') { // steel hexagons & armoured blocks
    if (e.type === 'citadel') { // the super-weapon: a colossal artillery bunker
      // outer armoured ring + inner keep
      ctx.fillStyle = dark; ctx.strokeStyle = col; ctx.lineWidth = 3.5;
      poly(x, y, s, 6, 0); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 2; poly(x, y, s * 0.78, 6, Math.PI / 6); ctx.stroke();
      ctx.fillStyle = '#3a4656'; poly(x, y, s * 0.5, 6, 0); ctx.fill(); ctx.stroke();
      // four side machine-gun turrets, each tracking its own target
      const auxT = e.auxTgt || [];
      for (let i = 0; i < 4; i++) {
        const ga = i * Math.PI / 2 + Math.PI / 4;
        const gx = x + Math.cos(ga) * s * 0.72, gy = y + Math.sin(ga) * s * 0.72;
        ctx.fillStyle = '#2b3543'; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(gx, gy, s * 0.16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        const gt = auxT[i] ? byId(auxT[i]) : null;
        const ba = gt ? Math.atan2(gt.y - gy, gt.x - gx) : ga;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(ba) * s * 0.34, gy + Math.sin(ba) * s * 0.34); ctx.stroke();
      }
      // the main artillery cannon
      const t = e.tgt ? byId(e.tgt) : null;
      const a = t ? Math.atan2(t.y - y, t.x - x) : -Math.PI / 2;
      ctx.strokeStyle = col; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 14), y + Math.sin(a) * (s + 14)); ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = '#e7edf5'; ctx.beginPath(); ctx.arc(x, y, s * 0.2, 0, Math.PI * 2); ctx.fill();
    }
    else if (e.def.kind === 'building') {
      ctx.fillStyle = dark; ctx.strokeStyle = col; ctx.lineWidth = e.def.core ? 3 : 2;
      poly(x, y, s, 6, 0); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 1; poly(x, y, s * 0.6, 6, 0); ctx.stroke();
      if (e.type === 'forge') { // glowing molten core + anvil
        const gl = 0.5 + 0.3 * Math.sin(game.t * 4 + e.id);
        ctx.fillStyle = 'rgba(255,150,60,' + gl + ')';
        ctx.beginPath(); ctx.arc(x, y, s * 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#d8dee8'; ctx.fillRect(x - s * 0.3, y - s * 0.12, s * 0.6, s * 0.24);
      } else if (e.type === 'arsenal') { // crossed hammers over a gear
        ctx.strokeStyle = '#cfd8e4'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x - s * 0.45, y - s * 0.45); ctx.lineTo(x + s * 0.45, y + s * 0.45);
        ctx.moveTo(x + s * 0.45, y - s * 0.45); ctx.lineTo(x - s * 0.45, y + s * 0.45); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, s * 0.16, 0, Math.PI * 2); ctx.fill();
      } else if (e.def.dmg) { // any armed Warden structure (keep, bastion, bunker, redoubt)
        const t = e.tgt ? byId(e.tgt) : null;
        const a = t ? Math.atan2(t.y - y, t.x - x) : -Math.PI / 2;
        ctx.lineWidth = e.type === 'redoubt' ? 4 : 3.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 8), y + Math.sin(a) * (s + 8)); ctx.stroke();
      }
    } else if (e.type === 'castellan') { // tier-3 siege colossus: armoured hex hull + heavy cannon
      ctx.fillStyle = '#1a2230'; ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      poly(x, y, s, 6, Math.PI / 6); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 1.2; poly(x, y, s * 0.55, 6, Math.PI / 6); ctx.stroke();
      const t = e.tgt ? byId(e.tgt) : null;
      const a = t ? Math.atan2(t.y - y, t.x - x) : -Math.PI / 2;
      ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 11), y + Math.sin(a) * (s + 11)); ctx.stroke();
      ctx.lineCap = 'butt';
    } else {
      ctx.fillStyle = e.type === 'ironclad' ? '#2a3342' : dark; ctx.strokeStyle = col;
      ctx.lineWidth = e.type === 'ironclad' ? 2.5 : 2;
      roundRect(x - s, y - s, s * 2, s * 2, 3); ctx.fill(); ctx.stroke();
      if (e.type === 'bombard' || e.type === 'warden_g') {
        const t = e.tgt ? byId(e.tgt) : null;
        const a = t ? Math.atan2(t.y - y, t.x - x) : 0;
        ctx.lineWidth = e.type === 'bombard' ? 3 : 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 7), y + Math.sin(a) * (s + 7)); ctx.stroke();
      } else if (e.type === 'ironclad') { // riveted cross plating
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - s * 0.6, y); ctx.lineTo(x + s * 0.6, y);
        ctx.moveTo(x, y - s * 0.6); ctx.lineTo(x, y + s * 0.6); ctx.stroke();
      } else if (e.type === 'pikeman') { // forward spike
        ctx.strokeStyle = '#dfe6f0'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - s - 5); ctx.stroke();
      } else { ctx.fillStyle = col; ctx.fillRect(x - s * 0.4, y - s * 0.4, s * 0.8, s * 0.8); }
    }
  }

  else if (e.fac === 'ember') { // burning triangles & chevron raiders
    if (e.def.kind === 'building') {
      ctx.fillStyle = dark; ctx.strokeStyle = col; ctx.lineWidth = e.def.core ? 2.5 : 1.8;
      poly(x, y, s, 3, -Math.PI / 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd27a';
      const fl = s * (0.28 + 0.12 * Math.sin(game.t * 8 + e.id));
      ctx.beginPath(); ctx.arc(x, y - s * 0.1, fl, 0, Math.PI * 2); ctx.fill();
      if (e.type === 'totem') {
        const t = e.tgt ? byId(e.tgt) : null;
        const a = t ? Math.atan2(t.y - y, t.x - x) : game.t;
        ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 8), y + Math.sin(a) * (s + 8)); ctx.stroke();
      }
    } else {
      ctx.fillStyle = e.type === 'warbeast' ? '#7a3410' : col;
      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s); ctx.lineTo(x, y + s * 0.4); ctx.lineTo(x - s, y + s);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  else if (e.fac === 'verdant') { // organic blooms & leaf creatures
    if (e.def.kind === 'building') {
      ctx.fillStyle = dark; ctx.strokeStyle = col; ctx.lineWidth = e.def.core ? 2.5 : 1.8;
      ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (e.type === 'bloom') {
        ctx.fillStyle = '#b8f0a0';
        for (let i = 0; i < 6; i++) {
          const a = game.t * 0.3 + i * Math.PI / 3;
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6, s * 0.26, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(x, y, s * 0.3, 0, Math.PI * 2); ctx.fill();
      } else if (e.type === 'heart' || e.type === 'grove') {
        ctx.strokeStyle = '#b8f0a0'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, s * 0.6, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, s * 0.3, 0, Math.PI * 2); ctx.stroke();
      } else if (e.type === 'bramble') {
        const t = e.tgt ? byId(e.tgt) : null;
        const a = t ? Math.atan2(t.y - y, t.x - x) : game.t * 0.6;
        ctx.strokeStyle = '#b8f0a0'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 9), y + Math.sin(a) * (s + 9)); ctx.stroke();
      }
    } else {
      ctx.fillStyle = e.type === 'treant' ? '#2f6b2a' : col;
      ctx.strokeStyle = '#2f6b2a'; ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x, y - s - 1); ctx.quadraticCurveTo(x + s, y, x, y + s + 1); ctx.quadraticCurveTo(x - s, y, x, y - s - 1);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  else if (e.fac === 'stormforge') { // octagonal machines & energised diamonds
    if (e.def.kind === 'building') {
      ctx.fillStyle = dark; ctx.strokeStyle = col; ctx.lineWidth = e.def.core ? 2.5 : 1.8;
      poly(x, y, s, 8, Math.PI / 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffb3d9';
      ctx.beginPath(); ctx.arc(x, y, s * (0.24 + 0.08 * Math.sin(game.t * 5 + e.id)), 0, Math.PI * 2); ctx.fill();
      if (e.type === 'dynamo') {
        ctx.strokeStyle = '#ffb3d9'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(x, y, s * 0.62, game.t % (Math.PI * 2), game.t % (Math.PI * 2) + Math.PI * 1.3); ctx.stroke();
      }
    } else {
      ctx.fillStyle = e.type === 'colossus' ? '#5a153f' : dark;
      ctx.strokeStyle = col; ctx.lineWidth = e.type === 'colossus' ? 2.5 : 1.5;
      ctx.beginPath(); ctx.moveTo(x, y - s - 2); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s + 2); ctx.lineTo(x - s, y); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffb3d9'; ctx.beginPath(); ctx.arc(x, y, s * 0.3, 0, Math.PI * 2); ctx.fill();
      if (e.shield > 1) {
        const frac = e.shield / e.shieldMax;
        ctx.strokeStyle = '#ff9ccb'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, s + 5, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
      }
    }
  }

  else if (e.fac === 'pact') { // dark pentagons & gaunt crimson triangles
    if (e.def.kind === 'building') {
      ctx.fillStyle = dark; ctx.strokeStyle = col; ctx.lineWidth = e.def.core ? 2.5 : 1.8;
      poly(x, y, s, 5, -Math.PI / 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ff6b73'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, s * 0.55, 0, Math.PI * 2); ctx.stroke();
      if (e.type === 'altar' || e.type === 'spike') {
        const t = e.tgt ? byId(e.tgt) : null;
        const a = t ? Math.atan2(t.y - y, t.x - x) : -Math.PI / 2;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (s + 8), y + Math.sin(a) * (s + 8)); ctx.stroke();
      }
    } else {
      ctx.fillStyle = e.type === 'behemoth' ? '#5a0e14' : col;
      ctx.strokeStyle = '#ff6b73'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x, y - s - 1); ctx.lineTo(x + s, y + s); ctx.lineTo(x - s, y + s); ctx.closePath();
      ctx.fill(); ctx.stroke();
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

