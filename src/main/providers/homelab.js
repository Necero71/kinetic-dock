'use strict';
const net = require('node:net');
const { run } = require('../exec');

function parseDocker(stdout) {
  return stdout.split('\n').filter(Boolean).map((line) => {
    const c = JSON.parse(line);
    return { name: c.Names, state: c.State, status: c.Status };
  });
}

async function docker() {
  try {
    const containers = parseDocker(await run('docker', ['ps', '-a', '--format', '{{json .}}']));
    return { containers, running: containers.filter((c) => c.state === 'running').length };
  } catch (e) {
    throw new Error(e.code === 'ENOENT' ? 'Docker is not installed' : 'Docker is not reachable (is it running, and is your user in the docker group?)');
  }
}

function parseTailscale(stdout) {
  const s = JSON.parse(stdout);
  const peers = Object.values(s.Peer ?? {}).map((p) => ({ name: p.HostName, ip: p.TailscaleIPs?.[0] ?? '', online: !!p.Online }));
  peers.sort((a, b) => b.online - a.online || a.name.localeCompare(b.name));
  return { state: s.BackendState, ip: s.Self?.TailscaleIPs?.[0] ?? '', online: peers.filter((p) => p.online).length, peers };
}

async function tailscale() {
  try {
    return parseTailscale(await run('tailscale', ['status', '--json']));
  } catch (e) {
    throw new Error(e.code === 'ENOENT' ? 'Tailscale is not installed' : 'Tailscale is not reachable');
  }
}

/** Accepts "http(s)://..." for a web check, or "host:port" for a TCP check. */
function parseTarget(target) {
  if (/^https?:\/\//i.test(target)) return { type: 'http', url: target };
  const m = target.match(/^\[?([^\]\s/]+?)\]?:(\d{1,5})$/);
  const port = m ? Number(m[2]) : 0;
  return m && port > 0 && port < 65536 ? { type: 'tcp', host: m[1], port } : null;
}

function tcpCheck(host, port, timeout) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (up) => { socket.destroy(); resolve(up); };
    socket.setTimeout(timeout, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

async function check({ name, target }, timeout = 3000) {
  const t = parseTarget(target);
  const started = Date.now();
  let up = false;
  if (t?.type === 'tcp') up = await tcpCheck(t.host, t.port, timeout);
  if (t?.type === 'http') {
    try {
      // Any reply below 500 (including a login redirect or 401) means the service is alive.
      const res = await fetch(t.url, { redirect: 'manual', signal: AbortSignal.timeout(timeout) });
      up = res.status < 500;
      await res.body?.cancel();
    } catch { up = false; }
  }
  return { name, target, up, ms: up ? Date.now() - started : null, invalid: !t };
}

async function servers(config) {
  const results = await Promise.all(config.servers.map((s) => check(s)));
  return { results, up: results.filter((r) => r.up).length };
}

module.exports = { docker, tailscale, servers, check, parseDocker, parseTailscale, parseTarget };
