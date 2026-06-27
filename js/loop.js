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
      if (game.mode === 'guest') guestTick(dt); else update(dt);
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
  while (dt > 0) {
    const step = Math.min(dt, 0.05);
    if (game.mode === 'guest') guestTick(step); else update(step);
    dt -= step;
  }
}, 100);

