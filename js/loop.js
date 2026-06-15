// ---------------- main loop ----------------
function frame(ts) {
  const dt = Math.min(0.05, (ts - lastFrame) / 1000 || 0.016);
  lastFrame = ts;
  if (game && !game.over) {
    panCamera(dt);
    if (game.mode === 'guest') guestTick(dt); else update(dt);
    game.hudTimer -= dt;
    if (game && game.hudTimer <= 0) { game.hudTimer = 0.15; updateHUD(); }
  }
  draw();
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
  if (!game || game.over) return;
  while (dt > 0) {
    const step = Math.min(dt, 0.05);
    if (game.mode === 'guest') guestTick(step); else update(step);
    dt -= step;
  }
}, 100);

