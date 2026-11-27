'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');

// The layout maths is pure, so load it with a stand-in for Electron.
const load = Module._load;
Module._load = (request, ...rest) => (request === 'electron' ? {} : load(request, ...rest));
const { dockBounds, popoverBounds, strutValues } = require('../src/main/dock-window');
Module._load = load;

const screen = { width: 1920, height: 1080 };
const display = { bounds: { x: 0, y: 0, ...screen }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };

test('vertical docks hug the side and clear the system panel', () => {
  assert.deepStrictEqual(dockBounds('left', display, 'linux'), { x: 0, y: 0, width: 108, height: 1040 });
  assert.strictEqual(dockBounds('right', display, 'linux').x, 1812);
});

test('struts reserve the matching side', () => {
  const reserve = (edge) => strutValues(edge, dockBounds(edge, display, 'linux'), 1, screen);
  assert.deepStrictEqual(reserve('left'), [108, 0, 0, 0, 0, 1039, 0, 0, 0, 0, 0, 0]);
  assert.deepStrictEqual(reserve('right'), [0, 108, 0, 0, 0, 0, 0, 1039, 0, 0, 0, 0]);
  assert.deepStrictEqual(reserve('top'), [0, 0, 64, 0, 0, 0, 0, 0, 0, 1919, 0, 0]);
  assert.deepStrictEqual(reserve('bottom'), [0, 0, 0, 64, 0, 0, 0, 0, 0, 0, 0, 1919]);
});

test('popovers open beside the dock and stay on screen', () => {
  for (const edge of ['left', 'right', 'top', 'bottom']) {
    const dock = dockBounds(edge, display, 'linux');
    for (const anchor of [0, 500, 5000]) {
      const p = popoverBounds(edge, anchor, dock, display.workArea);
      assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.width <= screen.width && p.y + p.height <= screen.height, `${edge} ${anchor}`);
      const apart = p.x >= dock.x + dock.width || p.x + p.width <= dock.x || p.y >= dock.y + dock.height || p.y + p.height <= dock.y;
      assert.ok(apart, `${edge} overlaps`);
    }
  }
});
