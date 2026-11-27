'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const config = require('../src/main/config');
const system = require('../src/main/providers/system');
const lab = require('../src/main/providers/homelab');
const media = require('../src/main/providers/media');
const { createTimer } = require('../src/main/timer');

test('sanitize drops bad values', () => {
  const c = config.sanitize({ edge: 'left', widgets: ['cpu', 'cpu', 'nope'], apps: [{ name: 'A', command: 'a' }, { name: '' }, null] });
  assert.strictEqual(c.edge, 'bottom');
  assert.deepStrictEqual(c.widgets, ['cpu']);
  assert.deepStrictEqual(c.apps, [{ name: 'A', command: 'a' }]);
});

test('config round trip, and a broken file is backed up', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kd-')), 'config.json');
  config.save(file, { ...config.defaults(), notes: 'hi' });
  assert.strictEqual(config.load(file).notes, 'hi');
  fs.writeFileSync(file, '{oops');
  assert.strictEqual(config.load(file).notes, '');
  assert.strictEqual(fs.readFileSync(`${file}.bak`, 'utf8'), '{oops');
});

test('network and memory parsers', () => {
  const proc = 'h1\nh2\n    lo: 9 0 0 0 0 0 0 0 9 0\n  eth0: 100 1 0 0 0 0 0 0 200 1\nveth1: 5 0 0 0 0 0 0 0 5 0\n';
  assert.deepStrictEqual(system.parseProcNet(proc), { rx: 100, tx: 200 });
  const netstat = 'Interface Statistics\r\n\r\n                 Received   Sent\r\n\r\nBytes            123456     654321\r\nUnicast packets  10  20\r\n';
  assert.deepStrictEqual(system.parseNetstat(netstat), { rx: 123456, tx: 654321 });
  assert.strictEqual(system.parseMemAvailable('MemTotal: 10 kB\nMemAvailable:    4 kB\n'), 4096);
});

test('homelab parsers', () => {
  assert.strictEqual(lab.parseDocker('{"Names":"immich","State":"running","Status":"Up 2 days"}\n')[0].name, 'immich');
  const ts = lab.parseTailscale(JSON.stringify({ BackendState: 'Running', Self: { TailscaleIPs: ['100.0.0.1'] }, Peer: { a: { HostName: 'b', Online: false }, c: { HostName: 'a', Online: true } } }));
  assert.strictEqual(ts.online, 1);
  assert.strictEqual(ts.peers[0].name, 'a');
  assert.deepStrictEqual(lab.parseTarget('nas:25565'), { type: 'tcp', host: 'nas', port: 25565 });
  assert.strictEqual(lab.parseTarget('nas:99999'), null);
  assert.strictEqual(lab.parseTarget('nonsense'), null);
});

test('server check sees an open and a closed port', async () => {
  const server = net.createServer((s) => s.end());
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const target = `127.0.0.1:${server.address().port}`;
  assert.strictEqual((await lab.check({ name: 'x', target })).up, true);
  await new Promise((r) => server.close(r));
  assert.strictEqual((await lab.check({ name: 'x', target })).up, false);
});

test('media parsers', async () => {
  assert.deepStrictEqual(media.parsePlayerctl('Playing\tBand\tSong\n'), { status: 'Playing', artist: 'Band', title: 'Song' });
  assert.deepStrictEqual(media.parseWpctl('Volume: 0.45 [MUTED]\n'), { percent: 45, muted: true });
  await assert.rejects(media.control('constructor'), /Unknown/);
});

test('timer pauses and resumes', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let done = 0;
  const timer = createTimer(() => done++);
  timer.start(1);
  t.mock.timers.tick(20000);
  timer.toggle();
  t.mock.timers.tick(100000);
  assert.deepStrictEqual(timer.state(), { remaining: 40000, running: false });
  timer.toggle();
  t.mock.timers.tick(40000);
  assert.strictEqual(done, 1);
});
