'use strict';
const fs = require('node:fs');
const path = require('node:path');

const WIDGETS = ['clock', 'cpu', 'memory', 'disk', 'network', 'docker', 'tailscale', 'servers', 'weather', 'calendar', 'timer', 'notes', 'media', 'volume'];

function defaults(platform = process.platform) {
  return {
    edge: 'bottom',
    widgets: [...WIDGETS],
    city: 'Cape Town',
    apps: platform === 'win32'
      ? [{ name: 'Files', command: 'explorer' }, { name: 'Terminal', command: 'start cmd' }]
      : [{ name: 'Files', command: 'xdg-open "$HOME"' }, { name: 'Browser', command: 'xdg-open https://github.com' }],
    servers: [{ name: 'Immich', target: 'http://localhost:2283' }, { name: 'Minecraft', target: 'localhost:25565' }],
    notes: '',
    autostart: false
  };
}

const text = (v, max) => String(v ?? '').slice(0, max);

function list(value, key, fallback) {
  if (!Array.isArray(value)) return fallback;
  return value
    .map((x) => ({ name: text(x?.name, 40).trim(), [key]: text(x?.[key], 500).trim() }))
    .filter((x) => x.name && x[key])
    .slice(0, 20);
}

/** Turn anything (old file, hand edits, renderer input) into a valid config. */
function sanitize(input, platform) {
  const d = defaults(platform);
  const c = input && typeof input === 'object' ? input : {};
  return {
    edge: c.edge === 'top' ? 'top' : 'bottom',
    widgets: Array.isArray(c.widgets) ? [...new Set(c.widgets.filter((w) => WIDGETS.includes(w)))] : d.widgets,
    city: typeof c.city === 'string' ? text(c.city, 80).trim() : d.city,
    apps: list(c.apps, 'command', d.apps),
    servers: list(c.servers, 'target', d.servers),
    notes: typeof c.notes === 'string' ? text(c.notes, 20000) : d.notes,
    autostart: c.autostart === true
  };
}

function load(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return defaults();
  }
  try {
    return sanitize(JSON.parse(raw));
  } catch {
    // Keep the broken file so hand edits are not lost.
    fs.copyFileSync(file, `${file}.bak`);
    return defaults();
  }
}

function save(file, config) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(config, null, 2));
  fs.renameSync(`${file}.tmp`, file);
}

module.exports = { WIDGETS, defaults, sanitize, load, save };
