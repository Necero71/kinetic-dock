'use strict';
/*
 * One entry per widget. To add one: write an entry here, add its id to WIDGETS in
 * main/config.js, and (if it needs system data) a loader in SOURCES in main/main.js.
 *   every   refresh interval in ms
 *   local   true when no data is needed from the main process
 *   tile    -> { value, sub, percent?, alert? } shown on the dock
 *   panel   -> DOM nodes shown in the popover
 */
const time = (d, opts) => d.toLocaleTimeString([], opts);
const meter = (percent) => ({ value: `${percent}%`, percent, alert: percent >= 90 });

const WIDGETS = {
  clock: {
    title: 'Clock', every: 1000, local: true,
    tile: () => { const d = new Date(); return { value: time(d, { hour: '2-digit', minute: '2-digit' }), sub: d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) }; },
    panel: () => {
      const d = new Date();
      const zones = ['Europe/London', 'Europe/Athens', 'America/New_York', 'Asia/Tokyo'];
      return [el('div', { className: 'big', textContent: time(d) }),
        ...zones.map((z) => row(z.split('/')[1].replace('_', ' '), time(d, { timeZone: z, hour: '2-digit', minute: '2-digit' })))];
    }
  },
  cpu: {
    title: 'CPU', every: 2000,
    tile: (d) => meter(d.percent),
    panel: (d) => [row('Load', `${d.percent}%`), row('Threads', d.cores), row('Uptime', `${Math.floor(d.uptime / 3600)}h ${Math.floor(d.uptime / 60) % 60}m`), el('p', { textContent: d.model })]
  },
  memory: {
    title: 'RAM', every: 3000,
    tile: (d) => meter(d.percent),
    panel: (d) => [row('Used', bytes(d.used)), row('Free', bytes(d.total - d.used)), row('Total', bytes(d.total))]
  },
  disk: {
    title: 'Disk', every: 30000,
    tile: (d) => meter(d.percent),
    panel: (d) => [row('Drive', d.path), row('Used', bytes(d.used)), row('Free', bytes(d.free)), row('Total', bytes(d.total))]
  },
  network: {
    title: 'Net', every: 2000,
    tile: (d) => ({ value: `↓ ${bytes(d.down)}`, sub: `↑ ${bytes(d.up)}/s` }),
    panel: (d) => [row('Download', `${bytes(d.down)}/s`), row('Upload', `${bytes(d.up)}/s`), ...d.addresses.map((a) => row(a.name, a.address))]
  },
  docker: {
    title: 'Docker', every: 10000,
    tile: (d) => ({ value: `${d.running}/${d.containers.length}`, sub: 'running' }),
    panel: (d) => d.containers.length ? d.containers.map((c) => row(c.name, c.status, c.state === 'running' ? 'up' : 'down')) : [el('p', { textContent: 'No containers yet.' })]
  },
  tailscale: {
    title: 'Tailnet', every: 10000,
    tile: (d) => ({ value: d.state === 'Running' ? `${d.online} up` : 'Off', sub: d.ip || d.state, alert: d.state !== 'Running' }),
    panel: (d) => [row('This machine', d.ip || d.state), ...d.peers.map((p) => row(p.name, p.ip, p.online ? 'up' : 'down'))]
  },
  servers: {
    title: 'Servers', every: 15000,
    tile: (d) => ({ value: `${d.up}/${d.results.length}`, sub: 'online', alert: d.up < d.results.length }),
    panel: (d) => d.results.length ? d.results.map((s) => row(s.name, s.invalid ? 'bad address' : s.up ? `${s.ms} ms` : 'offline', s.up ? 'up' : 'down')) : [el('p', { textContent: 'Add servers in Settings.' })]
  },
  weather: {
    title: 'Weather', every: 600000,
    tile: (d) => ({ value: `${d.temp}°C`, sub: d.text }),
    panel: (d) => [el('div', { className: 'big', textContent: `${d.temp}°C` }), el('p', { textContent: `${d.place} · ${d.text}` }),
      row('Wind', `${d.wind} km/h`), row('Humidity', `${d.humidity}%`),
      ...d.days.map((x) => row(`${new Date(`${x.date}T12:00`).toLocaleDateString([], { weekday: 'short' })} · ${x.text} · ${x.rain ?? 0}%`, `${x.min}° / ${x.max}°`)),
      el('p', { className: 'hint', textContent: 'Weather data by Open-Meteo.com' })]
  },
  calendar: {
    title: 'Calendar', every: 60000, local: true,
    tile: () => { const d = new Date(); return { value: String(d.getDate()), sub: d.toLocaleDateString([], { month: 'short' }) }; },
    panel: (_d, ctx) => {
      const today = new Date();
      const shown = new Date(today.getFullYear(), today.getMonth() + (ctx.month || 0), 1);
      const offset = (shown.getDay() + 6) % 7; // Monday first
      const count = new Date(shown.getFullYear(), shown.getMonth() + 1, 0).getDate();
      const move = (n) => { ctx.month = (ctx.month || 0) + n; ctx.refresh(); };
      const cells = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((x) => el('i', { textContent: x }));
      for (let i = 0; i < offset; i++) cells.push(el('span'));
      for (let day = 1; day <= count; day++) {
        const isToday = !ctx.month && day === today.getDate();
        cells.push(el('span', { textContent: day, className: isToday ? 'today' : '' }));
      }
      return [el('div', { className: 'controls' }, button('‹', () => move(-1)), el('strong', { textContent: shown.toLocaleDateString([], { month: 'long', year: 'numeric' }) }), button('›', () => move(1))),
        el('div', { className: 'month' }, cells)];
    }
  },
  timer: {
    title: 'Timer', every: 500,
    tile: (d) => ({ value: d.remaining ? clockText(d.remaining) : '--:--', sub: d.running ? 'running' : d.remaining ? 'paused' : 'ready' }),
    // Controls are built once so typing is not interrupted; only the readout updates.
    live: (ctx) => {
      const read = el('div', { className: 'big' });
      const custom = el('input', { type: 'number', min: 1, max: 1440, placeholder: 'Minutes' });
      const send = async (cmd, m) => { await window.dock.timer(cmd, m); ctx.refresh(); };
      return {
        nodes: [read, el('div', { className: 'controls' }, [5, 15, 25, 60].map((m) => button(`${m}m`, () => send('start', m)))),
          el('div', { className: 'controls' }, custom, button('Start', () => send('start', custom.value))),
          el('div', { className: 'controls' }, button('Pause / resume', () => send('toggle')), button('Reset', () => send('reset')))],
        update: (d) => { read.textContent = clockText(d.remaining); }
      };
    }
  },
  notes: {
    title: 'Notes', every: 5000, local: true,
    tile: (_d, config) => { const first = config.notes.trim().split('\n')[0]; return { value: first ? first.slice(0, 14) : 'Empty', sub: 'scratchpad' }; },
    live: (ctx) => {
      const area = el('textarea', { value: ctx.config.notes, placeholder: 'Type anything. Saves as you go.', maxLength: 20000 });
      area.addEventListener('input', () => window.dock.saveNotes(area.value));
      return { nodes: [area], update: () => {} };
    }
  },
  media: {
    title: 'Media', every: 4000,
    tile: (d) => ({ value: d.title ? d.title.slice(0, 18) : 'Nothing', sub: d.title ? (d.artist || d.status).slice(0, 22) : 'playing' }),
    live: (ctx) => {
      const title = el('div', { className: 'track' });
      const artist = el('p');
      const note = el('p', { className: 'hint' });
      const send = async (a) => { note.textContent = (await window.dock.media(a)) || ''; ctx.refresh(); };
      return {
        nodes: [title, artist, el('div', { className: 'controls' }, button('Prev', () => send('previous')), button('Play / pause', () => send('play-pause')), button('Next', () => send('next'))), note],
        update: (d) => { title.textContent = d.title || 'Nothing playing'; artist.textContent = [d.artist, d.status].filter(Boolean).join(' · '); }
      };
    }
  },
  volume: {
    title: 'Volume', every: 3000,
    tile: (d) => d.percent === null ? { value: 'Keys', sub: 'click to adjust' } : { value: d.muted ? 'Muted' : `${d.percent}%`, percent: Math.min(d.percent, 100) },
    live: (ctx) => {
      const read = el('div', { className: 'big' });
      const note = el('p', { className: 'hint' });
      const send = async (a) => { note.textContent = (await window.dock.media(a)) || ''; ctx.refresh(); };
      return {
        nodes: [read, el('div', { className: 'controls' }, button('−', () => send('volume-down')), button('Mute', () => send('mute')), button('+', () => send('volume-up'))), note],
        update: (d) => { read.textContent = d.percent === null ? '—' : d.muted ? 'Muted' : `${d.percent}%`; }
      };
    }
  }
};
