import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateV2Payload,
  normalizeV2Diagram,
  hasFullLayoutOnLoad,
  extractPositionsFromPayload,
} from '../bipartite-rules.mjs';

test('validate accepts minimal v2', () => {
  const r = validateV2Payload({
    version: 2,
    processes: [{ id: 'a', label: 'A' }],
    files: [{ id: 'f', label: 'F' }],
    links: [{ processId: 'a', fileId: 'f' }],
  });
  assert.equal(r.ok, true);
});

test('validate rejects v1', () => {
  const r = validateV2Payload({
    version: 1,
    processes: [],
    files: [],
    links: [],
  });
  assert.equal(r.ok, false);
});

test('validate rejects nodes array style', () => {
  const r = validateV2Payload({
    version: 2,
    nodes: [],
    processes: [],
    files: [],
    links: [],
  });
  assert.equal(r.ok, false);
  assert.ok(String(r.error).includes('nodes'));
});

test('validate rejects id in both partitions', () => {
  const r = validateV2Payload({
    version: 2,
    processes: [{ id: 'x', label: 'P' }],
    files: [{ id: 'x', label: 'F' }],
    links: [],
  });
  assert.equal(r.ok, false);
});

test('validate rejects duplicate link pair', () => {
  const r = validateV2Payload({
    version: 2,
    processes: [{ id: 'a', label: 'A' }],
    files: [{ id: 'f', label: 'F' }],
    links: [
      { processId: 'a', fileId: 'f', id: 'l1' },
      { processId: 'a', fileId: 'f', id: 'l2' },
    ],
  });
  assert.equal(r.ok, false);
});

test('normalize assigns synthetic link id', () => {
  const raw = {
    version: 2,
    processes: [{ id: 'a', label: 'A' }],
    files: [{ id: 'f', label: 'F' }],
    links: [{ processId: 'a', fileId: 'f' }],
  };
  const v = validateV2Payload(raw);
  assert(v.ok);
  const n = normalizeV2Diagram(v.value);
  assert.match(n.links[0].id, /^link-0-a-f$/);
});

test('hasFullLayout false when no coords', () => {
  const raw = {
    version: 2,
    processes: [{ id: 'a', label: 'A' }],
    files: [{ id: 'f', label: 'F' }],
    links: [],
  };
  const v = validateV2Payload(raw);
  assert(v.ok);
  const n = normalizeV2Diagram(v.value);
  assert.equal(hasFullLayoutOnLoad(n.processes, n.files, v.value), false);
});

test('hasFullLayout true when all coords', () => {
  const raw = {
    version: 2,
    processes: [{ id: 'a', label: 'A', x: 1, y: 2 }],
    files: [{ id: 'f', label: 'F', x: 3, y: 4 }],
    links: [],
  };
  const v = validateV2Payload(raw);
  assert(v.ok);
  const n = normalizeV2Diagram(v.value);
  assert.equal(hasFullLayoutOnLoad(n.processes, n.files, v.value), true);
  const { posProcess, posFile } = extractPositionsFromPayload(v.value, n.processes, n.files);
  assert.deepEqual(posProcess.a, { x: 1, y: 2 });
  assert.deepEqual(posFile.f, { x: 3, y: 4 });
});
