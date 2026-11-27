'use strict';
const path = require('node:path');
const { spawn } = require('node:child_process');
const { app, ipcMain, Menu, Tray, Notification, globalShortcut, screen, shell } = require('electron');
const config = require('./config');
const system = require('./providers/system');
const homelab = require('./providers/homelab');
const { weather } = require('./providers/weather');
const media = require('./providers/media');
const { createTimer } = require('./timer');
const { createDock, createPopover, isVertical } = require('./dock-window');
const { setAutostart } = require('./autostart');

if (!app.requestSingleInstanceLock()) app.exit(0);

let settings;
let configFile;
let dock = null;
let popover = null;
let tray = null;
let lastClosed = { id: null, at: 0 };

const timer = createTimer(() => {
  if (Notification.isSupported()) new Notification({ title: 'Kinetic Dock', body: 'Timer finished.' }).show();
  shell.beep();
});

// [loader, cache lifetime in ms]
const SOURCES = {
  cpu: [system.cpu, 1000], memory: [system.memory, 1000], disk: [system.disk, 30000], network: [system.network, 1000],
  docker: [homelab.docker, 8000], tailscale: [homelab.tailscale, 8000], servers: [homelab.servers, 15000],
  weather: [weather, 600000], media: [media.media, 3000], volume: [media.volume, 1500],
  timer: [async () => timer.state(), 0]
};
const cache = new Map();

/** Dock and popover share one cached request, so speed counters are not sampled twice. */
function getData(id) {
  if (!Object.hasOwn(SOURCES, id)) return Promise.resolve({ ok: false, error: 'Unknown widget' });
  const [load, ttl] = SOURCES[id];
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < (hit.failed ? Math.min(ttl, 10000) : ttl)) return hit.result;
  const entry = { at: Date.now(), failed: false };
  entry.result = Promise.resolve()
    .then(() => load(settings))
    .then((data) => ({ ok: true, data }), (e) => { entry.failed = true; return { ok: false, error: e.message }; });
  cache.set(id, entry);
  return entry.result;
}

function closePopover() {
  if (popover && !popover.isDestroyed()) popover.close();
}

function openPopover(id, anchor) {
  // Clicking the open widget again closes it (the blur handler may have closed it already).
  const wasOpen = (popover && popover.kdId === id) || (lastClosed.id === id && Date.now() - lastClosed.at < 300);
  closePopover();
  popover = null;
  if (wasOpen || !dock) return;
  const win = createPopover(id, Number(anchor) || 0, dock, settings.edge);
  win.kdId = id;
  win.on('close', () => { lastClosed = { id, at: Date.now() }; if (popover === win) popover = null; });
  popover = win;
}

/** What the dock's position depends on. Reserving space changes the work area, so ignore that on Linux. */
function layoutKey() {
  const d = screen.getPrimaryDisplay();
  return JSON.stringify([d.bounds, d.scaleFactor, process.platform === 'win32' ? d.workArea : null]);
}

let layout = '';
let layoutTimer = null;
let createTimeout = null;
function onDisplaysChanged() {
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(() => { if (layoutKey() !== layout) rebuildDock(); }, 500);
}

function rebuildDock() {
  layout = layoutKey();
  closePopover();
  const old = dock;
  dock = null;
  old?.destroy();
  clearTimeout(createTimeout);
  // Give the desktop a moment to release the old dock's reserved space before measuring again.
  createTimeout = setTimeout(() => { layout = layoutKey(); dock = createDock(settings.edge); }, old ? 400 : 0);
}

function persist(next) {
  settings = config.sanitize(next);
  config.save(configFile, settings);
}

function toggleDock() {
  if (!dock) return;
  closePopover();
  if (dock.isVisible()) dock.hide(); else dock.showInactive();
}

function registerIpc() {
  ipcMain.handle('config:get', () => settings);
  ipcMain.handle('config:save', (_e, patch) => {
    const before = settings;
    persist({ ...settings, ...patch });
    cache.clear();
    if (before.autostart !== settings.autostart) setAutostart(app, settings.autostart);
    if (before.edge !== settings.edge) rebuildDock();
    else if (dock) dock.webContents.send('config:changed', settings);
    return settings;
  });
  ipcMain.handle('notes:save', (_e, notes) => { persist({ ...settings, notes }); });
  ipcMain.handle('data:get', (_e, id) => getData(id));
  ipcMain.handle('media:control', async (_e, action) => {
    try { await media.control(action); } catch (e) { return e.message; }
    cache.delete('media');
    cache.delete('volume');
    return null;
  });
  ipcMain.handle('timer:command', (_e, command, minutes) => {
    if (command === 'start') timer.start(minutes);
    if (command === 'toggle') timer.toggle();
    if (command === 'reset') timer.reset();
    return timer.state();
  });
  // The renderer sends only an index, so it cannot run arbitrary commands.
  ipcMain.handle('app:launch', (_e, index) => {
    const entry = settings.apps[index];
    if (!entry) return;
    const child = spawn(entry.command, { shell: true, detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', (err) => console.warn(`Could not launch ${entry.name}: ${err.message}`));
    child.unref();
  });
  ipcMain.on('popover:open', (_e, id, x) => openPopover(String(id), x));
  ipcMain.on('popover:close', closePopover);
  ipcMain.on('menu:show', () => tray && Menu.buildFromTemplate(menuItems()).popup());
}

const menuItems = () => [
  { label: 'Show / hide dock', click: toggleDock },
  { label: 'Settings', click: () => dock && openPopover('settings', dock.getBounds()[isVertical(settings.edge) ? 'height' : 'width']) },
  { type: 'separator' },
  { label: 'Quit Kinetic Dock', click: () => app.quit() }
];

app.whenReady().then(() => {
  configFile = path.join(app.getPath('userData'), 'config.json');
  settings = config.load(configFile);
  registerIpc();
  rebuildDock();
  tray = new Tray(path.join(__dirname, '..', '..', 'assets', 'tray.png'));
  tray.setToolTip('Kinetic Dock');
  tray.setContextMenu(Menu.buildFromTemplate(menuItems()));
  globalShortcut.register('CommandOrControl+Alt+K', toggleDock);
  for (const event of ['display-metrics-changed', 'display-added', 'display-removed']) screen.on(event, onDisplaysChanged);
});

app.on('second-instance', () => dock?.showInactive());
app.on('will-quit', () => globalShortcut.unregisterAll());
// The dock is rebuilt on screen changes; only the Quit menu should end the app.
app.on('window-all-closed', () => {});
