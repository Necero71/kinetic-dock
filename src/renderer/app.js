'use strict';
const root = document.getElementById('root');
const popoverId = new URLSearchParams(location.search).get('popover');

/** Call fn now and then every `ms`, never overlapping slow requests. Returns a stop function. */
function poll(fn, ms) {
  let stopped = false;
  let handle;
  const tick = async () => {
    const ok = await fn();
    // Retry sooner after a failure, so a slow-refresh widget recovers quickly.
    if (!stopped) handle = setTimeout(tick, ok === false ? Math.min(ms, 15000) : ms);
  };
  tick();
  return () => { stopped = true; clearTimeout(handle); };
}

const fetchFor = (id) => (WIDGETS[id].local ? Promise.resolve({ ok: true, data: null }) : window.dock.getData(id));
let stops = [];

function renderDock(config) {
  const vertical = config.edge === 'left' || config.edge === 'right';
  // Where a widget sits along the dock, so its popover can open next to it.
  const anchor = (node) => {
    const r = node.getBoundingClientRect();
    return vertical ? r.top + r.height / 2 : r.left + r.width / 2;
  };
  stops.forEach((stop) => stop());
  stops = [];
  const apps = el('nav', { className: 'apps' }, config.apps.map((a, i) =>
    button(a.name.slice(0, 2).toUpperCase(), () => window.dock.launch(i), { title: a.name, className: 'app' })));

  const tiles = config.widgets.map((id) => {
    const widget = WIDGETS[id];
    const value = el('b', { textContent: '…' });
    const sub = el('small');
    const bar = el('progress', { max: 100, value: 0, hidden: true });
    const tile = button('', (e) => window.dock.open(id, anchor(e.currentTarget)), { className: 'tile' });
    tile.append(el('span', { textContent: widget.title }), value, bar, sub);
    let latest = config;
    stops.push(poll(async () => {
      const res = await fetchFor(id);
      if (id === 'notes') latest = await window.dock.getConfig();
      const view = res.ok ? widget.tile(res.data, latest) : { value: 'N/A', sub: 'click for info' };
      value.textContent = view.value;
      sub.textContent = view.sub || '';
      bar.hidden = view.percent === undefined;
      bar.value = view.percent || 0;
      tile.title = res.ok ? widget.title : res.error;
      tile.classList.toggle('alert', !!view.alert);
      tile.classList.toggle('off', !res.ok);
      return res.ok;
    }, widget.every));
    return tile;
  });

  const strip = el('div', { className: 'strip' }, tiles);
  // A normal mouse wheel scrolls the widget strip sideways on narrow screens. Vertical docks scroll natively.
  if (!vertical) strip.addEventListener('wheel', (e) => { strip.scrollLeft += e.deltaY + e.deltaX; }, { passive: true });
  root.className = vertical ? `dock vertical ${config.edge}` : 'dock';
  root.replaceChildren(el('div', { className: 'brand', title: 'Kinetic Dock' }, 'K', el('em', { textContent: 'D' })), apps, strip,
    button('⚙', (e) => window.dock.open('settings', anchor(e.currentTarget)), { className: 'gear', title: 'Settings' }));
}

function renderPopover(id, config) {
  const widget = WIDGETS[id];
  const body = el('main');
  root.className = 'popover';
  root.replaceChildren(el('header', {}, el('h1', { textContent: widget ? widget.title : 'Settings' }), button('✕', () => window.dock.close(), { title: 'Close' })), body);
  if (!widget) return body.append(...settingsPanel(config));

  const ctx = { config };
  const live = widget.live?.(ctx);
  const error = el('p', { className: 'error' });
  if (live) body.append(error, ...live.nodes);
  const update = async () => {
    const res = await fetchFor(id);
    if (live) {
      error.textContent = res.ok ? '' : res.error;
      if (res.ok) live.update(res.data);
    } else {
      const scroll = body.scrollTop;
      body.replaceChildren(...(res.ok ? widget.panel(res.data, ctx) : [el('p', { className: 'error', textContent: res.error })]));
      body.scrollTop = scroll;
    }
    return res.ok;
  };
  ctx.refresh = update;
  poll(update, widget.every);
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && popoverId) window.dock.close(); });
window.dock.getConfig().then((config) => {
  if (popoverId) return renderPopover(popoverId, config);
  renderDock(config);
  document.addEventListener('contextmenu', (e) => { e.preventDefault(); window.dock.menu(); });
  window.dock.onConfig(renderDock);
});
