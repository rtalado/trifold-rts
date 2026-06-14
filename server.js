// Trifold RTS — tiny static file server (no external dependencies).
// Multiplayer no longer needs a relay: players connect peer-to-peer over WebRTC
// (via the PeerJS broker), so this just serves the game files to your browser.
// You can host and play across different networks with no port forwarding.
//
//   Run it with:  node server.js     (or use start.bat / start.sh)

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';
  const file = path.join(ROOT, path.normalize(url));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.log('\n  Port ' + PORT + ' is already in use.');
    console.log('  The game is probably already running — open http://localhost:' + PORT + ' in your browser.');
    console.log('  (Or close the other server window, then run start.bat / start.sh again.)\n');
  } else {
    console.log('\n  Could not start the server: ' + err.message + '\n');
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log('\n  ============================================');
  console.log('   TRIFOLD RTS  —  running');
  console.log('  ============================================\n');
  console.log('   Open this in your browser:  http://localhost:' + PORT + '\n');
  console.log('   To play with a friend (even on a different network):');
  console.log('   1. You and your friend each run start.bat / start.sh.');
  console.log('   2. One of you clicks HOST GAME to get a 5-letter room code.');
  console.log('   3. Share the code; your friend clicks JOIN GAME and types it.');
  console.log('   (Matchmaking goes through the internet — no port forwarding needed.)\n');
  console.log('   Press Ctrl+C to stop.\n');
});
