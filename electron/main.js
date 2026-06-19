// Trifold RTS — Electron desktop wrapper.
// Loads the existing, unmodified browser game (index.html + js/ + css/ + libs/)
// in a standalone Chromium window. No browser chrome means the game's own
// keyboard shortcuts (T, F, Space, 1-0, ...) never collide with browser ones.
//
//   Dev:    npm start
//   Build:  npm run dist        (current OS)
//           npm run dist:win    /  npm run dist:linux
//   Release: npm run publish    (builds + uploads to GitHub Releases)

const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

// Keep a reference so the window isn't garbage-collected.
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0a0c12',
    autoHideMenuBar: true,           // no menu bar stealing Alt / F-keys
    title: 'Trifold RTS',
    icon: path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      // The game is self-contained vanilla JS and needs no Node access in the
      // page, so keep the secure defaults.
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false    // keep simulating when the window is unfocused
    }
  });

  // No application menu at all — removes every browser-style accelerator
  // (Ctrl+W close, Ctrl+R reload, Ctrl+Shift+I, etc.) so they can't interfere
  // with in-game controls.
  Menu.setApplicationMenu(null);

  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));

  // Open any real external links (e.g. the PeerJS broker is internal, but if a
  // link is ever clicked) in the user's real browser, not a new app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdate();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Quit on Windows/Linux when the last window closes (standard for a game).
  if (process.platform !== 'darwin') app.quit();
});

// --- Auto-update via GitHub Releases ---------------------------------------
// Checks on launch; downloads in the background; installs on next quit.
// Only runs in a packaged build (no-op during `npm start`).
function setupAutoUpdate() {
  if (!app.isPackaged) return;
  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    return; // electron-updater not available — skip silently
  }
  autoUpdater.autoDownload = true;
  autoUpdater.on('error', err => console.log('[update] ' + (err && err.message)));
  autoUpdater.on('update-available', info => console.log('[update] available: ' + info.version));
  autoUpdater.on('update-downloaded', info => console.log('[update] downloaded: ' + info.version + ' — installs on next launch'));
  autoUpdater.checkForUpdatesAndNotify().catch(() => {});
}
