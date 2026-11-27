'use strict';
/* Build DOM with textContent only, so data from containers, songs or servers is never parsed as HTML. */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}
function bytes(n) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}
function clockText(ms) {
  const s = Math.ceil(ms / 1000);
  const pad = (v) => String(v).padStart(2, '0');
  return `${s >= 3600 ? `${Math.floor(s / 3600)}:` : ''}${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}
const row = (label, value, state) => el('div', { className: `row ${state || ''}` }, el('span', { textContent: label }), el('b', { textContent: value }));
const button = (label, onclick, extra = {}) => el('button', { type: 'button', textContent: label, onclick, ...extra });
