'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function setAutostart(app, enabled) {
  // Only installed builds register themselves; a dev checkout would register bare Electron.
  if (!app.isPackaged) return;
  if (process.platform !== 'linux') return app.setLoginItemSettings({ openAtLogin: enabled });
  const dir = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'autostart');
  const file = path.join(dir, 'kinetic-dock.desktop');
  if (!enabled) return fs.rmSync(file, { force: true });
  const exe = process.env.APPIMAGE || process.execPath;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, `[Desktop Entry]\nType=Application\nName=Kinetic Dock\nExec="${exe}" --ozone-platform=x11\nTerminal=false\n`);
}
module.exports = { setAutostart };
