import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { monitorBounds, snapPlacement } = require('../desktop/float-layout.cjs');
const area = { x: 0, y: 0, width: 1280, height: 720 };

test('compact monitor stays narrow and caps its height for many models', () => {
  assert.equal(monitorBounds(area, {}, 2, false).width, 300);
  assert.equal(monitorBounds(area, {}, 2, false).height, 190);
  assert.equal(monitorBounds(area, {}, 20, false).height, 318);
});

test('expanded monitor preserves user size while staying inside the display', () => {
  assert.deepEqual(monitorBounds(area, { x: 1200, y: 700, detailWidth: 500, detailHeight: 600 }, 2, true), {
    x: 780, y: 120, width: 500, height: 600,
  });
  assert.equal(monitorBounds(area, {}, 2, true).width, 460);
});

test('display bounds clamp stale placement on a monitor with negative coordinates', () => {
  const secondary = { x: -1024, y: -100, width: 1024, height: 700 };
  assert.deepEqual(monitorBounds(secondary, { x: 9999, y: -9999 }, 1, false), {
    x: -300, y: -100, width: 300, height: 126,
  });
});

test('nearby work-area edges snap without moving a freely placed monitor', () => {
  assert.deepEqual(snapPlacement({ x: 7, y: 519, width: 300, height: 190 }, area), { x: 0, y: 530 });
  assert.deepEqual(snapPlacement({ x: 974, y: 6, width: 300, height: 190 }, area), { x: 980, y: 0 });
  assert.deepEqual(snapPlacement({ x: 250, y: 300, width: 300, height: 190 }, area), { x: 250, y: 300 });
});

test('dragged monitors are pulled completely into the work area before placement is saved', () => {
  assert.deepEqual(snapPlacement({ x: -80, y: -80, width: 300, height: 190 }, area), { x: 0, y: 0 });
  assert.deepEqual(snapPlacement({ x: 1200, y: 700, width: 300, height: 190 }, area), { x: 980, y: 530 });
  assert.deepEqual(snapPlacement({ x: -1200, y: 800, width: 300, height: 190 }, { x: -1024, y: -100, width: 1024, height: 700 }), { x: -1024, y: 410 });
});
