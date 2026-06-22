// Quiet launcher for `npm start`.
//
// On Linux, Electron bundles an older libfontconfig than many current systems
// (e.g. fontconfig 2.18, which uses `<const xsi:nil="true"/>` and new generic-
// family constants). The bundled parser doesn't understand that newer syntax, so
// at startup it spews a wall of harmless "Fontconfig warning: ... invalid
// attribute / invalid constant" lines. Fonts still render fine — it's pure noise.
//
// This wrapper launches Electron and drops only those Fontconfig lines from
// stderr; every other line (and the real exit code/signal) passes straight
// through, so genuine errors are never hidden.

const { spawn } = require('child_process');
const readline = require('readline');

// Required from plain Node (not the Electron runtime), `electron` resolves to the
// path of the Electron executable.
const electronPath = require('electron');

const child = spawn(electronPath, ['.', ...process.argv.slice(2)], {
  stdio: ['inherit', 'inherit', 'pipe'],
});

const DROP = /^Fontconfig (warning|error):/;
readline.createInterface({ input: child.stderr }).on('line', line => {
  if (!DROP.test(line)) process.stderr.write(line + '\n');
});

// mirror Electron's exit so `npm start` reports failures truthfully
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code == null ? 0 : code);
});
child.on('error', err => { console.error(err); process.exit(1); });
