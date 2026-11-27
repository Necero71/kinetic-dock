'use strict';
const { execFile } = require('node:child_process');

/** Run a program without a shell; resolves to stdout, rejects on failure. */
function run(cmd, args = [], timeout = 5000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

const powershell = (script) =>
  run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], 10000);

module.exports = { run, powershell };
