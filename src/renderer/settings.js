'use strict';
const toLines = (items, key) => items.map((x) => `${x.name} | ${x[key]}`).join('\n');
const fromLines = (value, key) => value.split('\n').map((line) => {
  const at = line.indexOf('|');
  return { name: line.slice(0, at).trim(), [key]: line.slice(at + 1).trim(), ok: at > 0 };
}).filter((x) => x.ok);

function settingsPanel(config) {
  const edge = el('select', {}, ['bottom', 'top'].map((v) => el('option', { value: v, textContent: v })));
  edge.value = config.edge;
  const city = el('input', { value: config.city });
  const apps = el('textarea', { value: toLines(config.apps, 'command'), rows: 4 });
  const servers = el('textarea', { value: toLines(config.servers, 'target'), rows: 4 });
  const autostart = el('input', { type: 'checkbox', checked: config.autostart });

  // Enabled widgets first (in dock order), then the rest.
  const order = [...config.widgets, ...Object.keys(WIDGETS).filter((id) => !config.widgets.includes(id))];
  const on = new Set(config.widgets);
  const list = el('div');
  const draw = () => list.replaceChildren(...order.map((id, i) => {
    const swap = (j) => { [order[i], order[j]] = [order[j], order[i]]; draw(); };
    return el('div', { className: 'widget-row' },
      el('label', {}, el('input', { type: 'checkbox', checked: on.has(id), onchange: (e) => on[e.target.checked ? 'add' : 'delete'](id) }), ` ${WIDGETS[id].title}`),
      button('▲', () => swap(i - 1), { disabled: i === 0, title: 'Move earlier' }),
      button('▼', () => swap(i + 1), { disabled: i === order.length - 1, title: 'Move later' }));
  }));
  draw();

  const save = async () => {
    await window.dock.saveConfig({
      edge: edge.value, city: city.value, autostart: autostart.checked,
      apps: fromLines(apps.value, 'command'), servers: fromLines(servers.value, 'target'),
      widgets: order.filter((id) => on.has(id))
    });
    window.dock.close();
  };
  const field = (label, node) => el('label', { className: 'field' }, el('span', { textContent: label }), node);
  return [
    field('Screen edge', edge), field('Weather city', city),
    field('Pinned apps (Name | command)', apps), field('Servers (Name | URL or host:port)', servers),
    el('label', {}, autostart, ' Start when I log in (installed builds)'),
    el('h2', { textContent: 'Widgets' }), list,
    button('Save', save, { className: 'primary' })
  ];
}
