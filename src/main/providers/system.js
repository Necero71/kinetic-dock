'use strict';
const os = require('node:os');
const fs = require('node:fs');
const { run } = require('../exec');

let lastCpu = null;
let lastNet = null;

function cpuTotals() {
  let idle = 0;
  let total = 0;
  for (const { times } of os.cpus()) {
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.idle + times.irq;
  }
  return { idle, total };
}

async function cpu() {
  if (!lastCpu) {
    lastCpu = cpuTotals();
    await new Promise((r) => setTimeout(r, 200));
  }
  const now = cpuTotals();
  const total = now.total - lastCpu.total;
  const percent = total > 0 ? Math.round(100 * (1 - (now.idle - lastCpu.idle) / total)) : 0;
  lastCpu = now;
  return { percent, cores: os.cpus().length, model: os.cpus()[0]?.model ?? 'CPU', load: os.loadavg(), uptime: os.uptime() };
}

/** MemAvailable counts reclaimable cache as free, unlike os.freemem() on some kernels. */
function parseMemAvailable(meminfo) {
  const m = meminfo.match(/^MemAvailable:\s+(\d+) kB/m);
  return m ? Number(m[1]) * 1024 : null;
}

async function memory() {
  const total = os.totalmem();
  let free = os.freemem();
  if (process.platform === 'linux') {
    free = parseMemAvailable(fs.readFileSync('/proc/meminfo', 'utf8')) ?? free;
  }
  return { total, used: total - free, percent: Math.round((100 * (total - free)) / total) };
}

async function disk() {
  // On image-based distros such as Bazzite "/" is read-only and always full, so measure the home drive.
  const target = process.platform === 'win32' ? `${process.env.SystemDrive || 'C:'}\\` : os.homedir();
  const s = await fs.promises.statfs(target);
  const total = s.blocks * s.bsize;
  const free = s.bavail * s.bsize;
  const used = total - s.bfree * s.bsize;
  return { path: target, total, used, free, percent: Math.round((100 * used) / (used + free || 1)) };
}

function parseProcNet(content) {
  let rx = 0;
  let tx = 0;
  for (const line of content.split('\n')) {
    const [name, rest] = line.split(':');
    // Skip loopback and virtual interfaces so traffic is not counted twice.
    if (!rest || /^(lo|docker|veth|br-|virbr|tailscale|tun|wg)/.test(name.trim())) continue;
    const f = rest.trim().split(/\s+/).map(Number);
    rx += f[0];
    tx += f[8];
  }
  return { rx, tx };
}

/** The first `netstat -e` row with two numbers is the byte counter, in every language. */
function parseNetstat(content) {
  const m = content.match(/^\D*?\s(\d+)\s+(\d+)\s*$/m);
  return m ? { rx: Number(m[1]), tx: Number(m[2]) } : null;
}

async function network() {
  const counters = process.platform === 'win32'
    ? parseNetstat(await run('netstat', ['-e']))
    : parseProcNet(fs.readFileSync('/proc/net/dev', 'utf8'));
  if (!counters) throw new Error('Could not read network counters');
  const now = { ...counters, at: Date.now() };
  const prev = lastNet ?? now;
  lastNet = now;
  const secs = (now.at - prev.at) / 1000 || 1;
  const addresses = Object.entries(os.networkInterfaces()).flatMap(([name, list]) =>
    (list ?? []).filter((a) => a.family === 'IPv4' && !a.internal).map((a) => ({ name, address: a.address })));
  // Counters can reset or wrap; never show a negative speed.
  return { down: Math.max(0, (now.rx - prev.rx) / secs), up: Math.max(0, (now.tx - prev.tx) / secs), addresses };
}

module.exports = { cpu, memory, disk, network, parseProcNet, parseNetstat, parseMemAvailable };
