// ---------------- menu wiring ----------------
const SP = { fac: null, ai: 1, diff: 'normal', sandbox: false }; // single-player setup state
net.diff = 'normal';                              // host's AI difficulty for multiplayer
const cardsEl = document.getElementById('cards');
const $ = id => document.getElementById(id);

function mountCards(holderId) { $(holderId).appendChild(cardsEl); cardsEl.style.display = 'flex'; }
function showScreen(name) {
  $('screenHome').style.display = name === 'home' ? 'flex' : 'none';
  $('screenSP').style.display = name === 'sp' ? 'flex' : 'none';
  $('screenMP').style.display = name === 'mp' ? 'flex' : 'none';
  if (name === 'sp') mountCards('cardsHolderSP');
}

const DIFF_KEYS = ['easy', 'normal', 'hard', 'brutal'];
function renderDiff(containerId, current, onPick) {
  const c = $(containerId); c.innerHTML = '';
  for (const k of DIFF_KEYS) {
    const b = document.createElement('button');
    b.className = 'diffbtn' + (k === current ? ' sel' : '');
    b.textContent = DIFFS[k].name.toUpperCase();
    b.onclick = () => onPick(k);
    c.appendChild(b);
  }
}

function refreshSP() {
  $('spHead').textContent = SP.sandbox ? 'Choose your faction — sandbox (no AI, unlimited resources)' : 'Choose your faction';
  $('spOpts').style.display = SP.sandbox ? 'none' : '';
  $('spStart').textContent = SP.sandbox ? 'ENTER SANDBOX ▶' : 'START BATTLE ▶';
  $('spAiCount').textContent = SP.ai;
  $('spStart').disabled = !SP.fac;
  renderDiff('spDiff', SP.diff, k => { SP.diff = k; refreshSP(); });
  for (const card of cardsEl.querySelectorAll('.card')) card.classList.toggle('picked', card.dataset.fac === SP.fac);
}
function resetMP() {
  if (net.peer) return; // already hosting/joined — keep current lobby/panel
  $('mpPanel').style.display = 'none';
  $('mpLobby').style.display = 'none';
  mpStatus('');
}

// faction cards: in the lobby they set your pick; in single player they choose your faction
for (const card of cardsEl.querySelectorAll('.card')) {
  card.addEventListener('click', () => {
    if (netConnected() && !net.inGame) pickFaction(card.dataset.fac);
    else if (!netConnected()) { SP.fac = card.dataset.fac; refreshSP(); }
  });
}

$('btnSP').addEventListener('click', () => { SP.sandbox = false; showScreen('sp'); refreshSP(); });
$('btnSandbox').addEventListener('click', () => { SP.sandbox = true; showScreen('sp'); refreshSP(); });
$('btnMP').addEventListener('click', () => { showScreen('mp'); resetMP(); });
$('spBack').addEventListener('click', () => showScreen('home'));
$('mpBack').addEventListener('click', () => { if (net.peer) onDisconnect(); showScreen('home'); });
$('spAiMinus').addEventListener('click', () => { SP.ai = Math.max(1, SP.ai - 1); refreshSP(); });
$('spAiPlus').addEventListener('click', () => { SP.ai = Math.min(3, SP.ai + 1); refreshSP(); });
// remembered single-player setup, so the end screen's REMATCH can restart it in one click
let lastMatchSetup = null;
function startSingle() {
  if (SP.sandbox) newSandbox(lastMatchSetup.fac);
  else newGame(lastMatchSetup.fac, lastMatchSetup.ai, lastMatchSetup.diff);
}
$('spStart').addEventListener('click', () => {
  if (!SP.fac) return;
  lastMatchSetup = { fac: SP.fac, ai: SP.ai, diff: SP.diff, sandbox: SP.sandbox };
  startSingle();
});
$('endRematch').addEventListener('click', () => {
  if (!lastMatchSetup) { backToMenu(); return; }
  document.getElementById('endscreen').style.display = 'none';
  startSingle();
});

$('mpHostBtn').addEventListener('click', () => {
  if (net.peer) return;
  mpStatus('Creating a room…');
  hostGame();
});
$('mpJoinBtn').addEventListener('click', () => {
  if (net.code) return;
  $('mpPanel').style.display = 'block';
  mpStatus('Enter the host’s 5-letter room code, then press JOIN.');
  $('mpJoinCode').focus();
});
$('mpJoinGo').addEventListener('click', () => {
  const code = ($('mpJoinCode').value || '').trim().toUpperCase();
  if (code.length < 4) { mpStatus('Enter the room code.'); return; }
  if (net.peer) return;
  mpStatus('Connecting to room ' + code + '…');
  joinGame(code);
});
$('mpJoinCode').addEventListener('keydown', ev => { if (ev.key === 'Enter') $('mpJoinGo').click(); });
$('mpStart').addEventListener('click', hostStart);
$('endRejoin').addEventListener('click', () => { rejoinAttempts = 0; tryRejoin(); }); // fresh batch of auto-retries
$('netpauseContinue').addEventListener('click', hostForceResume);

// copy the room code to the clipboard so the host can paste it to a friend
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.focus(); ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
}
$('lobbyCopy').addEventListener('click', () => {
  const code = net.code || $('lobbyCode').textContent;
  if (!code || code === '—') return;
  const flash = () => { $('lobbyCopy').textContent = '✓ COPIED'; setTimeout(() => { $('lobbyCopy').textContent = '⧉ COPY'; }, 1400); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(flash).catch(() => { fallbackCopy(code); flash(); });
  } else { fallbackCopy(code); flash(); }
});
$('hudSpeed').addEventListener('click', cycleGameSpeed);   // click the SP time-scale readout to cycle it
// the idle-worker count in the HUD is rebuilt each tick, so delegate its click from the army stat
$('hudArmy').addEventListener('click', e => { if (e.target.closest('#hudIdle')) selectIdleWorker(); });
$('mpAiMinus').addEventListener('click', () => { net.aiCount = Math.max(0, net.aiCount - 1); updateLobby(); });
$('mpAiPlus').addEventListener('click', () => { net.aiCount = Math.min(4 - net.players.length, net.aiCount + 1); updateLobby(); });

// ---------------- pause menu & settings ----------------
let pauseOpen = false, settingsOpen = false, controlsOpen = false;

function openControls() { controlsOpen = true; $('controls').style.display = 'flex'; }
function closeControls() { controlsOpen = false; $('controls').style.display = 'none'; }

function openPauseMenu() {
  if (!game || game.over) return;
  pauseOpen = true;
  if (game.mode === 'sp') game.paused = true;          // real pause only in single player
  $('pauseMpNote').style.display = game.mode === 'sp' ? 'none' : 'block';
  $('pausemenu').style.display = 'flex';
}
function resumeGame() {
  pauseOpen = false;
  if (game) game.paused = false;
  $('pausemenu').style.display = 'none';
}
function quitToMenu() {
  resumeGame();
  if (net.peer) onDisconnect();   // leaving a multiplayer match disconnects us
  backToMenu();
}

function syncSettingsUI() {
  $('setEdgePan').checked = !!SETTINGS.edgePan;
  $('setShowFps').checked = !!SETTINGS.showFps;
  $('setPanSpeed').value = SETTINGS.panSpeed;
  $('setPanSpeedVal').textContent = (+SETTINGS.panSpeed).toFixed(1) + '×';
  $('setMusicVol').value = SETTINGS.musicVol;
  $('setMusicVolVal').textContent = Math.round(SETTINGS.musicVol * 100) + '%';
  $('setSfxVol').value = SETTINGS.sfxVol;
  $('setSfxVolVal').textContent = Math.round(SETTINGS.sfxVol * 100) + '%';
}
function openSettings() { settingsOpen = true; syncSettingsUI(); $('settings').style.display = 'flex'; }
function closeSettings() { settingsOpen = false; $('settings').style.display = 'none'; }

$('btnSettings').addEventListener('click', openSettings);
$('btnControls').addEventListener('click', openControls);
$('pauseControls').addEventListener('click', openControls);
$('ctrlClose').addEventListener('click', closeControls);
$('setClose').addEventListener('click', closeSettings);
$('pauseResume').addEventListener('click', resumeGame);
$('pauseSettings').addEventListener('click', openSettings);
$('pauseQuit').addEventListener('click', quitToMenu);
$('setEdgePan').addEventListener('change', e => { SETTINGS.edgePan = e.target.checked; saveSettings(); });
$('setShowFps').addEventListener('change', e => { SETTINGS.showFps = e.target.checked; saveSettings(); });
$('setPanSpeed').addEventListener('input', e => {
  SETTINGS.panSpeed = +e.target.value;
  $('setPanSpeedVal').textContent = SETTINGS.panSpeed.toFixed(1) + '×';
  saveSettings();
});
$('setMusicVol').addEventListener('input', e => {
  SETTINGS.musicVol = +e.target.value;
  $('setMusicVolVal').textContent = Math.round(SETTINGS.musicVol * 100) + '%';
  applyMusicVol();
  saveSettings();
});
$('setSfxVol').addEventListener('input', e => {
  SETTINGS.sfxVol = +e.target.value;
  $('setSfxVolVal').textContent = Math.round(SETTINGS.sfxVol * 100) + '%';
  applySfxVol();
  playSfx('select'); // audible preview as you drag
  saveSettings();
});

// boot: cards live in the single-player holder; start on the home screen
$('version').textContent = 'v' + APP_VERSION;
mountCards('cardsHolderSP');
showScreen('home');
applyMusicVol(); // arm the soundtrack at the saved volume (starts on first gesture)
