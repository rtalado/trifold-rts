// ---------------- main loop ----------------
let fpsAcc = 0, fpsFrames = 0, fpsShown = 0;
function frame(ts) {
  const dt = Math.min(0.05, (ts - lastFrame) / 1000 || 0.016);
  lastFrame = ts;
  if (game && !game.over) {
    if (game.netPaused) {
      // a human dropped/froze — the whole match holds here until they reconnect (or the
      // host's grace timer / CONTINUE lifts it). The host keeps streaming the frozen world
      // so a reconnecting guest can resync; nobody advances the simulation.
      panCamera(dt);
      hostPausedTick(dt);
    } else if (!game.paused) {
      panCamera(dt);
      // single-player time scale (Fast/Slow). Multiplayer stays locked at 1× so host and
      // guests advance together. Any scaled dt is run in ≤0.05s sub-steps so speeding up
      // just runs more steps — the sim stays stable (no projectile tunnelling at high speed).
      const spd = game.mode === 'sp' ? (game.speed || 1) : 1;
      let acc = dt * spd;
      while (acc > 1e-6) {
        const step = Math.min(acc, 0.05);
        if (game.mode === 'guest') guestTick(step); else update(step);
        acc -= step;
      }
    }
    game.hudTimer -= dt;
    if (game && game.hudTimer <= 0) { game.hudTimer = 0.15; updateHUD(); }
  }
  draw();
  // FPS readout (optional, off by default)
  fpsAcc += dt; fpsFrames++;
  if (fpsAcc >= 0.5) { fpsShown = Math.round(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }
  const fpsEl = document.getElementById('fps');
  if (fpsEl) {
    const on = SETTINGS.showFps && game && !game.over;
    fpsEl.style.display = on ? 'block' : 'none';
    if (on) fpsEl.textContent = fpsShown + ' FPS';
  }
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
  if (!game || game.over || game.paused) return;
  if (game.netPaused) { hostPausedTick(Math.min(dt, 0.1)); return; } // frozen: only keep the link warm
  if (game.mode === 'sp') dt *= (game.speed || 1);   // honour the single-player time scale
  while (dt > 0) {
    const step = Math.min(dt, 0.05);
    if (game.mode === 'guest') guestTick(step); else update(step);
    dt -= step;
  }
}, 100);

// ---------------- single-player game speed ----------------
const GAME_SPEEDS = [0.5, 1, 2, 3];
function setGameSpeed(mult) {
  if (!game || game.mode !== 'sp') return;
  game.speed = mult;
  updateSpeedHud();
  floatMsg('Game speed: ' + mult + '×');
}
// step the speed up or down through GAME_SPEEDS (dir +1 faster, -1 slower)
function stepGameSpeed(dir) {
  if (!game || game.mode !== 'sp') return;
  const i = GAME_SPEEDS.indexOf(game.speed || 1);
  const ni = clamp((i < 0 ? 1 : i) + dir, 0, GAME_SPEEDS.length - 1);
  setGameSpeed(GAME_SPEEDS[ni]);
}
// cycle to the next speed (wraps) — used by the clickable HUD readout
function cycleGameSpeed() {
  if (!game || game.mode !== 'sp') return;
  const i = GAME_SPEEDS.indexOf(game.speed || 1);
  setGameSpeed(GAME_SPEEDS[(i + 1) % GAME_SPEEDS.length]);
}
function updateSpeedHud() {
  const el = document.getElementById('hudSpeed'); if (!el) return;
  const sp = game && game.mode === 'sp';
  el.style.display = sp ? '' : 'none';
  if (sp) el.innerHTML = '⏩ <b>' + (game.speed || 1) + '×</b>';
}

