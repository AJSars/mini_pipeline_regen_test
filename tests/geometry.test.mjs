import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMPDMGeometry } from './load-geometry.mjs';

const G = loadMPDMGeometry();

test('MPDMGeometry exposes constants', () => {
  assert.equal(G.PAD, 48);
  assert.equal(G.NODE_R, 28);
  assert.equal(G.FILE_W, 120);
  assert.equal(G.FILE_H, 48);
});

test('rebuildBipartiteCleanup places simple chain', () => {
  const processes = [
    { id: 'a', label: 'A', detail: '' },
    { id: 'b', label: 'B', detail: '' },
  ];
  const files = [{ id: 'f', label: 'F', detail: '' }];
  const links = [
    { id: 'l1', processId: 'a', fileId: 'f' },
    { id: 'l2', processId: 'b', fileId: 'f' },
  ];
  const { posProcess, posFile } = G.rebuildBipartiteCleanup(processes, files, links);
  assert.ok(Number.isFinite(posProcess.a.x));
  assert.ok(Number.isFinite(posFile.f.x));
});

test('defaultNewProcessPosition stacks', () => {
  const processes = [
    { id: 'p1', label: 'A', detail: '' },
    { id: 'p2', label: 'B', detail: '' },
  ];
  const posProcess = { p1: { x: 48, y: 48 } };
  const p = G.defaultNewProcessPosition(processes, posProcess);
  assert.equal(p.x, 48);
  assert.equal(p.y, 48 + 2 * G.NODE_R + 24);
});
