// ---------------- menu wiring ----------------
const SP = { fac: null, ai: 1, diff: 'normal' }; // single-player setup state
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

$('btnSP').addEventListener('click', () => { showScreen('sp'); refreshSP(); });
$('btnMP').addEventListener('click', () => { showScreen('mp'); resetMP(); });
$('spBack').addEventListener('click', () => showScreen('home'));
$('mpBack').addEventListener('click', () => { if (net.peer) onDisconnect(); showScreen('home'); });
$('spAiMinus').addEventListener('click', () => { SP.ai = Math.max(1, SP.ai - 1); refreshSP(); });
$('spAiPlus').addEventListener('click', () => { SP.ai = Math.min(3, SP.ai + 1); refreshSP(); });
$('spStart').addEventListener('click', () => { if (SP.fac) newGame(SP.fac, SP.ai, SP.diff); });

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
$('mpAiMinus').addEventListener('click', () => { net.aiCount = Math.max(0, net.aiCount - 1); updateLobby(); });
$('mpAiPlus').addEventListener('click', () => { net.aiCount = Math.min(4 - net.players.length, net.aiCount + 1); updateLobby(); });

// boot: cards live in the single-player holder; start on the home screen
mountCards('cardsHolderSP');
showScreen('home');
