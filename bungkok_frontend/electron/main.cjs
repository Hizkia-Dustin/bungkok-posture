const { app, BrowserWindow, Menu, Notification, Tray, ipcMain, nativeImage, powerSaveBlocker, session } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

let window;
let tray;
let backend;
let blockerId = null;
let quitting = false;
let monitorState = { status: 'idle', posture: 'unknown', isOpen: false };

const isMonitoring = () => ['monitoring', 'paused', 'interrupted'].includes(monitorState.status);

function sendMonitorAction(action) {
  window?.webContents.send('monitor:action', action);
  if (action === 'open' || action === 'finish') {
    window?.show();
    window?.focus();
  }
}

function updatePowerState() {
  if (isMonitoring() && blockerId === null) {
    blockerId = powerSaveBlocker.start('prevent-app-suspension');
  } else if (!isMonitoring() && blockerId !== null) {
    if (powerSaveBlocker.isStarted(blockerId)) powerSaveBlocker.stop(blockerId);
    blockerId = null;
  }
}

function updateTrayMenu() {
  if (!tray) return;
  const active = isMonitoring();
  tray.setToolTip(active ? `Bungkok — ${monitorState.status}` : 'Bungkok Posture Tracker');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: active ? 'Buka monitor aktif' : 'Buka Bungkok', click: () => sendMonitorAction('open') },
    { label: monitorState.status === 'paused' ? 'Lanjutkan latihan' : 'Jeda latihan', enabled: active, click: () => sendMonitorAction('pause') },
    { label: 'Selesaikan latihan', enabled: active, click: () => sendMonitorAction('finish') },
    { type: 'separator' },
    { label: 'Keluar Bungkok', click: () => { quitting = true; app.quit(); } },
  ]));
}

function startBackend() {
  const sourceBackend = path.resolve(__dirname, '..', '..', 'bungkok_backend_camera');
  const packagedBackend = path.join(process.resourcesPath, 'bungkok_backend_camera');
  const backendDir = app.isPackaged ? packagedBackend : sourceBackend;
  if (!fs.existsSync(path.join(backendDir, 'app.py'))) return;
  const bundledPython = path.join(backendDir, '.venv', 'Scripts', 'python.exe');
  const python = fs.existsSync(bundledPython) ? bundledPython : 'python';
  backend = spawn(python, ['-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', '8000'], {
    cwd: backendDir,
    windowsHide: true,
    stdio: 'ignore',
  });
  backend.on('error', () => { backend = null; });
}

function createWindow() {
  window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 700,
    show: false,
    backgroundColor: '#f2f8fc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  const appUrl = process.env.BUNGKOK_APP_URL;
  if (appUrl) window.loadURL(appUrl);
  else window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  window.once('ready-to-show', () => window.show());
  window.on('close', (event) => {
    if (!quitting && isMonitoring()) {
      event.preventDefault();
      window.hide();
      new Notification({ title: 'Bungkok tetap memantau', body: 'Latihan berjalan di latar belakang. Buka kembali lewat ikon tray.' }).show();
    }
  });
}

app.requestSingleInstanceLock() || app.quit();
app.on('second-instance', () => sendMonitorAction('open'));
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media' || permission === 'notifications');
  });
  startBackend();
  createWindow();
  const iconPath = app.isPackaged
    ? path.join(__dirname, '..', 'dist', 'favicon.svg')
    : path.join(__dirname, '..', 'public', 'favicon.svg');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.on('double-click', () => sendMonitorAction('open'));
  updateTrayMenu();
});

ipcMain.on('monitor:set-state', (_event, state) => {
  monitorState = { ...monitorState, ...state };
  updatePowerState();
  updateTrayMenu();
});
ipcMain.on('monitor:notify', (_event, payload) => {
  if (!Notification.isSupported()) return;
  new Notification({ title: payload?.title || 'Bungkok', body: payload?.message || 'Periksa postur dudukmu.' }).show();
});

app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => {
  if (backend && !backend.killed) backend.kill();
  if (blockerId !== null && powerSaveBlocker.isStarted(blockerId)) powerSaveBlocker.stop(blockerId);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin' && !isMonitoring()) app.quit(); });

