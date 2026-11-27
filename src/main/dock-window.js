'use strict';
const path = require('node:path');
const { BrowserWindow, screen } = require('electron');
const { run } = require('./exec');

const HEIGHT = 64; // thickness along the top or bottom
const WIDTH = 108; // thickness along the left or right
const isVertical = (edge) => edge === 'left' || edge === 'right';
const clamp = (v, min, max) => Math.round(Math.min(Math.max(v, min), max));
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

function dockBounds(edge, display, platform = process.platform) {
  // Windows keeps its taskbar in place, so sit inside the work area there. On Linux use the screen edge.
  const a = platform === 'win32' ? display.workArea : display.bounds;
  if (isVertical(edge)) {
    // Stop short of any top or bottom system panel so it stays clickable.
    const { y, height } = display.workArea;
    return { x: edge === 'left' ? a.x : a.x + a.width - WIDTH, y, width: WIDTH, height };
  }
  return { x: a.x, y: edge === 'top' ? a.y : a.y + a.height - HEIGHT, width: a.width, height: HEIGHT };
}

/**
 * _NET_WM_STRUT_PARTIAL values that reserve the dock's strip on X11:
 * left, right, top, bottom, then a start and end coordinate for each.
 */
function strutValues(edge, bounds, scale, screenSize) {
  const px = (v) => Math.round(v * scale);
  const [x1, x2] = [px(bounds.x), px(bounds.x + bounds.width) - 1];
  const [y1, y2] = [px(bounds.y), px(bounds.y + bounds.height) - 1];
  const v = new Array(12).fill(0);
  if (edge === 'left') [v[0], v[4], v[5]] = [px(bounds.x + bounds.width), y1, y2];
  else if (edge === 'right') [v[1], v[6], v[7]] = [px(screenSize.width - bounds.x), y1, y2];
  else if (edge === 'top') [v[2], v[8], v[9]] = [px(bounds.y + bounds.height), x1, x2];
  else [v[3], v[10], v[11]] = [px(screenSize.height - bounds.y), x1, x2];
  return v;
}

async function reserveSpace(win, edge, bounds) {
  if (process.platform !== 'linux') return;
  const id = String(win.getNativeWindowHandle().readUInt32LE(0));
  const all = screen.getAllDisplays().map((d) => d.bounds);
  const screenSize = { width: Math.max(...all.map((b) => b.x + b.width)), height: Math.max(...all.map((b) => b.y + b.height)) };
  const value = strutValues(edge, bounds, screen.getPrimaryDisplay().scaleFactor, screenSize).join(',');
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

/** Open the popover beside the dock, centred on the clicked widget. `anchor` is its offset along the dock. */
function popoverBounds(edge, anchor, d, area) {
  const { width } = POPOVER;
  if (isVertical(edge)) {
    const height = Math.min(POPOVER.height, d.height - 16);
    const x = edge === 'left' ? d.x + d.width + 6 : d.x - width - 6;
    return { x, y: clamp(d.y + anchor - height / 2, d.y + 8, d.y + d.height - height - 8), width, height };
  }
  const height = Math.min(POPOVER.height, area.height - HEIGHT);
  const x = clamp(d.x + anchor - width / 2, d.x + 8, d.x + d.width - width - 8);
  return { x, y: edge === 'top' ? d.y + d.height + 6 : d.y - height - 6, width, height };
}

function createPopover(id, anchor, dock, edge) {
  const d = dock.getBounds();
  const win = makeWindow(popoverBounds(edge, anchor, d, screen.getDisplayMatching(d).workArea), { popover: id });
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.on('blur', () => { if (!win.isDestroyed()) win.close(); });
  return win;
}

module.exports = { createDock, createPopover, dockBounds, popoverBounds, strutValues, isVertical };
