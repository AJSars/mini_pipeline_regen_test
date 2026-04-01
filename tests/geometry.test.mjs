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

test('cleanup aligns two processes sharing one file on the same row index (same y)', () => {
  const processes = [
    { id: 'a', label: '', detail: '' },
    { id: 'b', label: '', detail: '' },
  ];
  const files = [{ id: 'f', label: '', detail: '' }];
  const links = [
    { id: 'l1', processId: 'a', fileId: 'f' },
    { id: 'l2', processId: 'b', fileId: 'f' },
  ];
  const { posProcess, posFile } = G.rebuildBipartiteCleanup(processes, files, links);
  assert.equal(posProcess.a.y, posProcess.b.y);
  const fileCenterY = posFile.f.y + G.FILE_H / 2;
  const midProcY = (posProcess.a.y + G.NODE_R + posProcess.b.y + G.NODE_R) / 2;
  assert.ok(Math.abs(midProcY - fileCenterY) <= G.ROW_H / 2 + 1);
});

test('cleanup stacks co-layer processes that share the same file on the right', () => {
  const processes = [
    { id: 'p1', label: '', detail: '' },
    { id: 'p2', label: '', detail: '' },
    { id: 'p3', label: '', detail: '' },
  ];
  const files = [
    { id: 'fleft', label: '', detail: '' },
    { id: 'fshared', label: '', detail: '' },
  ];
  const links = [
    { id: 'l1', processId: 'p1', fileId: 'fleft' },
    { id: 'l2', processId: 'p2', fileId: 'fshared' },
    { id: 'l3', processId: 'p3', fileId: 'fshared' },
    { id: 'l4', processId: 'p1', fileId: 'fshared' },
  ];
  const { posProcess } = G.rebuildBipartiteCleanup(processes, files, links);
  const dy23 = Math.abs(posProcess.p2.y - posProcess.p3.y);
  assert.equal(dy23, G.ROW_H);
});

test('cleanup vertical stack for three processes sharing one file (co-layer)', () => {
  const processes = [
    { id: 'a', label: '', detail: '' },
    { id: 'b', label: '', detail: '' },
    { id: 'c', label: '', detail: '' },
    { id: 'd', label: '', detail: '' },
  ];
  const files = [{ id: 'f', label: '', detail: '' }];
  const links = [
    { id: 'l1', processId: 'a', fileId: 'f' },
    { id: 'l2', processId: 'b', fileId: 'f' },
    { id: 'l3', processId: 'c', fileId: 'f' },
    { id: 'l4', processId: 'd', fileId: 'f' },
  ];
  const { posProcess } = G.rebuildBipartiteCleanup(processes, files, links);
  const ys = ['b', 'c', 'd'].map((id) => posProcess[id].y).sort((x, y) => x - y);
  assert.equal(ys[1] - ys[0], G.ROW_H);
  assert.equal(ys[2] - ys[1], G.ROW_H);
});

test('cleanup horizontal arrangement for two files sharing one process (symmetric hub)', () => {
  const processes = [
    { id: 'p1', label: '', detail: '' },
    { id: 'p2', label: '', detail: '' },
  ];
  const files = [
    { id: 'f1', label: '', detail: '' },
    { id: 'f2', label: '', detail: '' },
  ];
  const links = [
    { id: 'l1', processId: 'p1', fileId: 'f1' },
    { id: 'l2', processId: 'p1', fileId: 'f2' },
    { id: 'l3', processId: 'p2', fileId: 'f2' },
  ];
  const { posFile } = G.rebuildBipartiteCleanup(processes, files, links);
  const dy = Math.abs(posFile.f1.y - posFile.f2.y);
  assert.equal(dy, G.ROW_H);
});
