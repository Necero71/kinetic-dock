'use strict';
const path = require('node:path');
const { BrowserWindow, screen } = require('electron');
const { run } = require('./exec');

const HEIGHT = 64;
const POPOVER = { width: 360, height: 440 };

function makeWindow(options, query) {
  const win = new BrowserWindow({
    frame: false, resizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, show: false, backgroundColor: '#15170f',
    ...options,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), { query });
  return win;
}

function dockBounds(edge, display) {
  // Windows keeps its taskbar in place, so sit inside the work area there. On Linux use the screen edge.
  const a = process.platform === 'win32' ? display.workArea : display.bounds;
  return { x: a.x, y: edge === 'top' ? a.y : a.y + a.height - HEIGHT, width: a.width, height: HEIGHT };
}

/** _NET_WM_STRUT_PARTIAL values that reserve the dock's strip on X11. */
function strutValues(edge, bounds, scale, screenHeight) {
  const px = (v) => Math.round(v * scale);
  const v = new Array(12).fill(0);
  const x1 = px(bounds.x);
  const x2 = px(bounds.x + bounds.width) - 1;
  if (edge === 'top') { v[2] = px(bounds.y + bounds.height); v[8] = x1; v[9] = x2; } else { v[3] = px(screenHeight - bounds.y); v[10] = x1; v[11] = x2; }
  return v;
}

async function reserveSpace(win, edge, bounds) {
  if (process.platform !== 'linux') return;
  const id = String(win.getNativeWindowHandle().readUInt32LE(0));
  const screenHeight = Math.max(...screen.getAllDisplays().map((d) => d.bounds.y + d.bounds.height));
  const value = strutValues(edge, bounds, screen.getPrimaryDisplay().scaleFactor, screenHeight).join(',');
  try {
    await run('xprop', ['-id', id, '-f', '_NET_WM_STRUT_PARTIAL', '32c', '-set', '_NET_WM_STRUT_PARTIAL', value]);
  } catch {
    console.warn('Could not reserve screen space (xprop missing or not on X11); the dock will float on top.');
  }
}

function createDock(edge) {
  const bounds = dockBounds(edge, screen.getPrimaryDisplay());
  const win = makeWindow({ ...bounds, type: process.platform === 'linux' ? 'dock' : 'toolbar' }, {});
  win.once('ready-to-show', async () => {
    win.showInactive();
    win.setBounds(bounds);
    win.setVisibleOnAllWorkspaces(true);
    await reserveSpace(win, edge, bounds);
  });
  return win;
}

function createPopover(id, anchorX, dock, edge) {
  const d = dock.getBounds();
  const area = screen.getDisplayMatching(d).workArea;
  const height = Math.min(POPOVER.height, area.height - HEIGHT);
  const x = Math.round(Math.min(Math.max(d.x + anchorX - POPOVER.width / 2, d.x + 8), d.x + d.width - POPOVER.width - 8));
  const y = edge === 'top' ? d.y + d.height + 6 : d.y - height - 6;
  const win = makeWindow({ x, y, width: POPOVER.width, height }, { popover: id });
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.on('blur', () => { if (!win.isDestroyed()) win.close(); });
  return win;
}

module.exports = { createDock, createPopover, dockBounds, strutValues, HEIGHT };
