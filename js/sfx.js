// ---------------- sound effects ----------------
// Tiny Web Audio synth. Every SFX is generated at runtime from oscillators and
// noise, so — unlike the soundtrack — there are no audio assets to ship or to
// forget in the build bundle. One shared AudioContext, created lazily and
// resumed on the first user gesture (browsers block audio until then). The
// master level follows the sfxVol setting; 0 mutes everything outright.
let audioCtx = null, sfxBus = null;
function sfxCtx() {
  if (!audioCtx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      sfxBus = audioCtx.createGain();
      sfxBus.gain.value = clamp(+SETTINGS.sfxVol || 0, 0, 1);
      sfxBus.connect(audioCtx.destination);
    } catch (e) { audioCtx = null; }
  }
  return audioCtx;
}
function applySfxVol() { if (sfxBus) sfxBus.gain.value = clamp(+SETTINGS.sfxVol || 0, 0, 1); }
// Browsers start the context suspended until a user gesture; unlock it on the
// first interaction (mirrors the soundtrack's startMusic dance in core.js).
addEventListener('pointerdown', () => { const c = sfxCtx(); if (c && c.state === 'suspended') c.resume().catch(() => {}); });
addEventListener('keydown', () => { const c = sfxCtx(); if (c && c.state === 'suspended') c.resume().catch(() => {}); });

// one oscillator with a quick exponential attack/decay envelope
function tone(ctx, t0, { type = 'square', f0, f1 = f0, dur = 0.1, gain = 0.2 }) {
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(sfxBus);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

// a short band-passed noise burst — used for the muzzle "crack" of gunfire
function noise(ctx, t0, { dur = 0.08, gain = 0.1, f = 1400 }) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n); // decaying white noise
  const src = ctx.createBufferSource(); src.buffer = buf;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 0.7;
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(bp); bp.connect(g); g.connect(sfxBus);
  src.start(t0); src.stop(t0 + dur);
}

// each effect is a recipe layered from the primitives above
const SFX = {
  select: (c, t) => tone(c, t, { type: 'square', f0: 660, f1: 880, dur: 0.06, gain: 0.10 }),
  order:  (c, t) => tone(c, t, { type: 'triangle', f0: 520, f1: 780, dur: 0.10, gain: 0.14 }),
  build:  (c, t) => { tone(c, t, { type: 'sawtooth', f0: 170, f1: 85, dur: 0.20, gain: 0.16 });
                      tone(c, t, { type: 'square', f0: 300, f1: 190, dur: 0.12, gain: 0.08 }); },
  train:  (c, t) => tone(c, t, { type: 'triangle', f0: 400, f1: 620, dur: 0.09, gain: 0.11 }),
  shoot:  (c, t) => { noise(c, t, { dur: 0.07, gain: 0.09, f: 1800 });
                      tone(c, t, { type: 'square', f0: 220, f1: 70, dur: 0.05, gain: 0.05 }); },
  // under-attack klaxon: two urgent falling tones
  alert:  (c, t) => { tone(c, t, { type: 'square', f0: 920, f1: 620, dur: 0.13, gain: 0.13 });
                      tone(c, t + 0.16, { type: 'square', f0: 920, f1: 620, dur: 0.13, gain: 0.13 }); },
  // end-of-match stings: a rising major triad for victory, a heavy falling pair for defeat
  victory: (c, t) => { tone(c, t,        { type: 'triangle', f0: 523, dur: 0.18, gain: 0.16 });
                       tone(c, t + 0.14, { type: 'triangle', f0: 659, dur: 0.18, gain: 0.16 });
                       tone(c, t + 0.28, { type: 'triangle', f0: 784, dur: 0.40, gain: 0.18 });
                       tone(c, t + 0.28, { type: 'triangle', f0: 1046, dur: 0.40, gain: 0.10 }); },
  defeat:  (c, t) => { tone(c, t,        { type: 'sawtooth', f0: 330, f1: 220, dur: 0.42, gain: 0.14 });
                       tone(c, t + 0.20, { type: 'sawtooth', f0: 247, f1: 120, dur: 0.70, gain: 0.14 }); },
};

function playSfx(name) {
  if (!(+SETTINGS.sfxVol > 0)) return;
  const ctx = sfxCtx(); if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const fn = SFX[name]; if (fn) fn(ctx, ctx.currentTime);
}

// Combat fires constantly, so throttle per-effect to avoid a wall of clipped
// noise when a whole army shoots at once.
const _sfxLast = {};
function playSfxThrottled(name, ms) {
  const now = performance.now();
  if (_sfxLast[name] && now - _sfxLast[name] < ms) return;
  _sfxLast[name] = now;
  playSfx(name);
}

// is a world point roughly within the current camera view? (gates combat SFX
// to what the player can actually see, so off-screen battles stay quiet)
function onScreen(x, y) {
  if (!game) return false;
  const m = 60;
  return x >= game.cam.x - m && x <= game.cam.x + viewW() + m
      && y >= game.cam.y - m && y <= game.cam.y + viewH() + m;
}
