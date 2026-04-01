import test from 'node:test';
import assert from 'node:assert/strict';
import { buildV2Export } from '../export-v2.mjs';
import { computeViewBoxFit } from '../view-fit.mjs';

test('export empty diagram', () => {
  const out = buildV2Export({
    processes: [],
    files: [],
    links: [],
    posProcess: Object.create(null),
    posFile: Object.create(null),
  });
  assert.deepEqual(out, {
    version: 2,
    processes: [],
    files: [],
    links: [],
  });
});

test('export includes coordinates', () => {
  const out = buildV2Export({
    processes: [{ id: 'a', label: 'A', detail: '' }],
    files: [],
    links: [],
    posProcess: { a: { x: 10, y: 20 } },
    posFile: Object.create(null),
  });
  assert.equal(out.processes[0].x, 10);
  assert.equal(out.processes[0].y, 20);
});

test('computeViewBoxFit empty', () => {
  const vb = computeViewBoxFit({
    processes: [],
    files: [],
    links: [],
    posProcess: {},
    posFile: {},
  });
  assert.deepEqual(vb, { x: 0, y: 0, w: 400, h: 300 });
});
