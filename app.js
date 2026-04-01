/**
 * Mini Pipeline Diagram Maker — application shell (SPEC.md + DESIGN.md).
 */

import {
  validateV2Payload,
  normalizeV2Diagram,
  hasFullLayoutOnLoad,
  extractPositionsFromPayload,
} from './bipartite-rules.mjs';
import { buildV2Export } from './export-v2.mjs';
import { computeViewBoxFit } from './view-fit.mjs';

if (typeof globalThis.MPDMGeometry === 'undefined') {
  throw new Error('MPDMGeometry must be loaded before the app module (graph-geometry.js).');
}

const G = globalThis.MPDMGeometry;

/** Canonical sample graph (no stored coordinates) — matches repository sample-pipeline.json topology. */
const SAMPLE_V2 = {
  version: 2,
  processes: [
    { id: 'ingest', label: 'Raw ingest', detail: 'Landing zone' },
    { id: 'clean', label: 'Clean & validate', detail: 'Schema checks' },
    { id: 'features', label: 'Feature build', detail: 'Derived columns' },
    { id: 'train', label: 'Train model', detail: 'Offline job' },
    { id: 'report', label: 'Report', detail: 'Summary artifact' },
  ],
  files: [
    { id: 'f-events', label: 'events.jsonl', detail: '' },
    { id: 'f-feat', label: 'features.parquet', detail: '' },
    { id: 'f-train', label: 'training_set.parquet', detail: '' },
    { id: 'f-out', label: 'model.pkl + metrics.json', detail: '' },
    { id: 'file-lruzo3l', label: 'My Asset', detail: '' },
  ],
  links: [
    { id: 'link-0-ingest-f-events', processId: 'ingest', fileId: 'f-events' },
    { id: 'link-1-clean-f-events', processId: 'clean', fileId: 'f-events' },
    { id: 'link-2-clean-f-feat', processId: 'clean', fileId: 'f-feat' },
    { id: 'link-3-features-f-feat', processId: 'features', fileId: 'f-feat' },
    { id: 'link-4-features-f-train', processId: 'features', fileId: 'f-train' },
    { id: 'link-5-train-f-train', processId: 'train', fileId: 'f-train' },
    { id: 'link-6-train-f-out', processId: 'train', fileId: 'f-out' },
    { id: 'link-7-report-f-out', processId: 'report', fileId: 'f-out' },
    { id: 'link-bcq594f', processId: 'ingest', fileId: 'file-lruzo3l' },
    { id: 'link-zfbneye', processId: 'features', fileId: 'file-lruzo3l' },
  ],
};

function randomBase36(n) {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let s = '';
  for (let i = 0; i < n; i += 1) {
    s += chars[Math.floor(Math.random() * 36)];
  }
  return s;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function truncateProcessLabel(s) {
  if (s.length <= 16) return s;
  return `${s.slice(0, 15)}…`;
}

function truncateFileLabel(s) {
  if (s.length <= 18) return s;
  return `${s.slice(0, 17)}…`;
}

function isTextEntryTarget(el) {
  if (!el || !(el instanceof Element)) return false;
  const tag = el.tagName;
  if (el.isContentEditable) return true;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const t = el.type;
    if (t === 'button' || t === 'submit' || t === 'reset' || t === 'checkbox' || t === 'radio' || t === 'file') {
      return false;
    }
    return true;
  }
  return false;
}

/** @type {Array<{ id: string, label: string, detail: string }>} */
let processes = [];
/** @type {Array<{ id: string, label: string, detail: string }>} */
let files = [];
/** @type {Array<{ id: string, processId: string, fileId: string }>} */
let links = [];
/** @type {Record<string, { x: number, y: number }>} */
let posProcess = Object.create(null);
/** @type {Record<string, { x: number, y: number }>} */
let posFile = Object.create(null);

/** @type {{ kind: 'process'|'file'|'link', id: string } | null} */
let selection = null;

/** @type {{ x: number, y: number, w: number, h: number }} */
let viewBox = { x: 0, y: 0, w: 400, h: 300 };
let userAdjusted = false;

let dragState = null;

/** True while Space is held (navigation mode); pans view on drag without moving nodes. */
let spaceNavHeld = false;

/**
 * Active Space+drag pan session (so we can tear down on Space keyup, blur, or pointer end). §5.4 SPEC.
 * @type {null | { svg: SVGSVGElement, pointerId: number, onMove: (ev: PointerEvent) => void, onEnd: (ev: PointerEvent) => void }}
 */
let spacePanActive = null;

function stopSpacePanGesture() {
  if (!spacePanActive) return;
  const { svg, pointerId, onMove, onEnd } = spacePanActive;
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onEnd);
  window.removeEventListener('pointercancel', onEnd);
  try {
    svg.releasePointerCapture(pointerId);
  } catch {
    /* already released */
  }
  svg.classList.remove('nav-panning');
  spacePanActive = null;
}

const els = {
  newProcessLabel: document.getElementById('new-process-label'),
  newFileLabel: document.getElementById('new-file-label'),
  linkProcess: document.getElementById('link-process'),
  linkFile: document.getElementById('link-file'),
  btnAddProcess: document.getElementById('btn-add-process'),
  btnAddFile: document.getElementById('btn-add-file'),
  btnAddLink: document.getElementById('btn-add-link'),
  btnDelete: document.getElementById('btn-delete-selection'),
  btnLoad: document.getElementById('btn-load'),
  fileLoad: document.getElementById('file-load'),
  btnSave: document.getElementById('btn-save'),
  btnSample: document.getElementById('btn-load-sample'),
  btnResetZoom: document.getElementById('btn-reset-zoom'),
  btnCleanup: document.getElementById('btn-cleanup'),
  status: document.getElementById('status'),
  svg: document.getElementById('graph-svg'),
  inspector: document.getElementById('inspector-body'),
};

function setStatus(msg, isError = false) {
  els.status.textContent = msg || '';
  els.status.classList.toggle('error', Boolean(isError && msg));
}

function snapshotSession() {
  return {
    processes: deepClone(processes),
    files: deepClone(files),
    links: deepClone(links),
    posProcess: deepClone(posProcess),
    posFile: deepClone(posFile),
    selection: selection ? { ...selection } : null,
  };
}

function restoreSession(snap) {
  processes = snap.processes;
  files = snap.files;
  links = snap.links;
  posProcess = snap.posProcess;
  posFile = snap.posFile;
  selection = snap.selection;
}

function computeIntrinsicSvgSize() {
  let maxX = G.PAD;
  let maxY = G.PAD;
  for (const p of processes) {
    const pos = posProcess[p.id] || { x: 0, y: 0 };
    maxX = Math.max(maxX, pos.x + 2 * G.NODE_R);
    maxY = Math.max(maxY, pos.y + 2 * G.NODE_R);
  }
  for (const f of files) {
    const pos = posFile[f.id] || { x: 0, y: 0 };
    maxX = Math.max(maxX, pos.x + G.FILE_W);
    maxY = Math.max(maxY, pos.y + G.FILE_H);
  }
  const svgWidth = Math.max(480, maxX + G.PAD);
  const svgHeight = Math.max(320, maxY + G.PAD);
  return { svgWidth, svgHeight };
}

function applyViewBoxForRender(svgWidth, svgHeight) {
  if (!userAdjusted) {
    viewBox = computeViewBoxFit({
      processes,
      files,
      links,
      posProcess,
      posFile,
    });
  } else {
    const cw = Math.max(400, svgWidth);
    const ch = Math.max(300, svgHeight);
    const minW = Math.max(60, cw * 0.04);
    const maxW = Math.max(minW + 1, cw * 10);
    const minH = Math.max(60, ch * 0.04);
    const maxH = Math.max(minH + 1, ch * 10);
    viewBox.w = Math.min(maxW, Math.max(minW, viewBox.w));
    viewBox.h = Math.min(maxH, Math.max(minH, viewBox.h));
  }
}

function clientToSvg(clientX, clientY) {
  const svg = els.svg;
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

function syncLinkPickers() {
  const prevP = els.linkProcess.value;
  const prevF = els.linkFile.value;

  els.linkProcess.innerHTML = '';
  els.linkFile.innerHTML = '';

  const optP0 = document.createElement('option');
  optP0.value = '';
  optP0.textContent = '—';
  els.linkProcess.appendChild(optP0);
  const optF0 = document.createElement('option');
  optF0.value = '';
  optF0.textContent = '—';
  els.linkFile.appendChild(optF0);

  for (const p of processes) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.label || p.id;
    els.linkProcess.appendChild(o);
  }
  for (const f of files) {
    const o = document.createElement('option');
    o.value = f.id;
    o.textContent = f.label || f.id;
    els.linkFile.appendChild(o);
  }

  if (prevP && processes.some((p) => p.id === prevP)) {
    els.linkProcess.value = prevP;
  }
  if (prevF && files.some((f) => f.id === prevF)) {
    els.linkFile.value = prevF;
  }
}

function syncInspector() {
  const body = els.inspector;
  body.innerHTML = '';

  if (!selection) {
    const p = document.createElement('p');
    p.className = 'inspector-empty';
    p.textContent = 'Select a process, file, or link on the canvas.';
    body.appendChild(p);
    return;
  }

  const dl = document.createElement('dl');

  function addRow(term, def) {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = def;
    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  if (selection.kind === 'process') {
    const node = processes.find((p) => p.id === selection.id);
    if (!node) return;
    addRow('Kind', 'Process');
    addRow('Id', node.id);
    addRow('Label', node.label);
    addRow('Detail', node.detail === '' ? '—' : node.detail);

    const conn = document.createElement('div');
    conn.className = 'inspector-connections';
    const h = document.createElement('h3');
    h.textContent = 'Connections';
    conn.appendChild(h);
    const ul = document.createElement('ul');
    for (const L of links) {
      if (L.processId !== node.id) continue;
      const file = files.find((f) => f.id === L.fileId);
      const li = document.createElement('li');
      li.textContent = `${file ? file.label : L.fileId} (link ${L.id})`;
      ul.appendChild(li);
    }
    conn.appendChild(ul);
    body.appendChild(dl);
    body.appendChild(conn);
    return;
  }

  if (selection.kind === 'file') {
    const node = files.find((f) => f.id === selection.id);
    if (!node) return;
    addRow('Kind', 'File');
    addRow('Id', node.id);
    addRow('Label', node.label);
    addRow('Detail', node.detail === '' ? '—' : node.detail);

    const conn = document.createElement('div');
    conn.className = 'inspector-connections';
    const h = document.createElement('h3');
    h.textContent = 'Connections';
    conn.appendChild(h);
    const ul = document.createElement('ul');
    for (const L of links) {
      if (L.fileId !== node.id) continue;
      const proc = processes.find((p) => p.id === L.processId);
      const li = document.createElement('li');
      li.textContent = `${proc ? proc.label : L.processId} (link ${L.id})`;
      ul.appendChild(li);
    }
    conn.appendChild(ul);
    body.appendChild(dl);
    body.appendChild(conn);
    return;
  }

  if (selection.kind === 'link') {
    const L = links.find((l) => l.id === selection.id);
    if (!L) return;
    const proc = processes.find((p) => p.id === L.processId);
    const file = files.find((f) => f.id === L.fileId);
    const pl = proc ? proc.label : L.processId;
    const fl = file ? file.label : L.fileId;
    addRow('Kind', 'Link');
    addRow('Id', L.id);
    addRow('Label', `${pl} ↔ ${fl}`);
    addRow('Detail', '—');
    body.appendChild(dl);
  }
}

function renderSvg() {
  const { svgWidth, svgHeight } = computeIntrinsicSvgSize();
  applyViewBoxForRender(svgWidth, svgHeight);

  const svg = els.svg;
  svg.setAttribute('width', String(svgWidth));
  svg.setAttribute('height', String(svgHeight));
  svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);

  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }

  const docTitle = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  docTitle.textContent = 'Pipeline diagram';
  svg.appendChild(docTitle);

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', String(viewBox.x));
  bg.setAttribute('y', String(viewBox.y));
  bg.setAttribute('width', String(viewBox.w));
  bg.setAttribute('height', String(viewBox.h));
  bg.setAttribute('fill', 'transparent');
  bg.dataset.canvasBg = 'true';
  svg.appendChild(bg);

  const gLinks = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  gLinks.setAttribute('class', 'links');

  const processSet = new Set(processes.map((p) => p.id));
  const fileSet = new Set(files.map((f) => f.id));

  for (const L of links) {
    if (!processSet.has(L.processId) || !fileSet.has(L.fileId)) continue;
    const pp = posProcess[L.processId];
    const fp = posFile[L.fileId];
    if (!pp || !fp) continue;
    const { p1, p2 } = G.linkSegmentEndpoints(pp.x, pp.y, fp.x, fp.y);
    const d = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'link-group');
    if (selection && selection.kind === 'link' && selection.id === L.id) {
      g.classList.add('link-selected');
    }
    g.dataset.kind = 'link';
    g.dataset.id = L.id;

    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.setAttribute('d', d);
    hit.setAttribute('class', 'link-hit');
    hit.setAttribute('stroke-width', '14');
    hit.setAttribute('stroke-linecap', 'round');

    const vis = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    vis.setAttribute('d', d);
    vis.setAttribute('class', 'link-visible');

    g.appendChild(hit);
    g.appendChild(vis);
    gLinks.appendChild(g);
  }
  svg.appendChild(gLinks);

  const gProc = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  gProc.setAttribute('class', 'processes');

  for (const p of processes) {
    const pos = posProcess[p.id] || { x: 0, y: 0 };
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'process-node');
    if (selection && selection.kind === 'process' && selection.id === p.id) {
      g.classList.add('selected');
    }
    g.dataset.kind = 'process';
    g.dataset.id = p.id;
    g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);

    const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circ.setAttribute('class', 'shape');
    circ.setAttribute('cx', String(G.NODE_R));
    circ.setAttribute('cy', String(G.NODE_R));
    circ.setAttribute('r', String(G.NODE_R));

    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    hit.setAttribute('class', 'hit-fat');
    hit.setAttribute('cx', String(G.NODE_R));
    hit.setAttribute('cy', String(G.NODE_R));
    hit.setAttribute('r', String(G.NODE_R + 6));

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(G.NODE_R));
    text.setAttribute('y', String(G.NODE_R));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.textContent = truncateProcessLabel(p.label);

    g.appendChild(circ);
    g.appendChild(hit);
    g.appendChild(text);
    gProc.appendChild(g);
  }
  svg.appendChild(gProc);

  const gFiles = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  gFiles.setAttribute('class', 'files');

  for (const f of files) {
    const pos = posFile[f.id] || { x: 0, y: 0 };
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'file-node');
    if (selection && selection.kind === 'file' && selection.id === f.id) {
      g.classList.add('selected');
    }
    g.dataset.kind = 'file';
    g.dataset.id = f.id;
    g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('class', 'shape');
    rect.setAttribute('width', String(G.FILE_W));
    rect.setAttribute('height', String(G.FILE_H));
    rect.setAttribute('rx', '10');
    rect.setAttribute('ry', '10');

    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    hit.setAttribute('class', 'hit-fat');
    hit.setAttribute('x', '-4');
    hit.setAttribute('y', '-4');
    hit.setAttribute('width', String(G.FILE_W + 8));
    hit.setAttribute('height', String(G.FILE_H + 8));
    hit.setAttribute('rx', '12');
    hit.setAttribute('ry', '12');

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(G.FILE_W / 2));
    text.setAttribute('y', String(G.FILE_H / 2));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.textContent = truncateFileLabel(f.label);

    g.appendChild(rect);
    g.appendChild(hit);
    g.appendChild(text);
    gFiles.appendChild(g);
  }
  svg.appendChild(gFiles);
}

function syncUi() {
  els.btnDelete.disabled = selection === null;
  syncLinkPickers();
  syncInspector();
  renderSvg();
}

function deleteSelection() {
  if (!selection) return;

  if (selection.kind === 'link') {
    links = links.filter((l) => l.id !== selection.id);
    selection = null;
    setStatus('');
    syncUi();
    return;
  }

  if (selection.kind === 'process') {
    const id = selection.id;
    processes = processes.filter((p) => p.id !== id);
    links = links.filter((l) => l.processId !== id);
    delete posProcess[id];
    selection = null;
    setStatus('');
    syncUi();
    return;
  }

  if (selection.kind === 'file') {
    const id = selection.id;
    files = files.filter((f) => f.id !== id);
    links = links.filter((l) => l.fileId !== id);
    delete posFile[id];
    selection = null;
    setStatus('');
    syncUi();
  }
}

function applyLoadedPayload(rawRoot) {
  const v = validateV2Payload(rawRoot);
  if (!v.ok) {
    return v;
  }
  const norm = normalizeV2Diagram(v.value);
  processes = norm.processes;
  files = norm.files;
  links = norm.links;
  selection = null;

  if (hasFullLayoutOnLoad(processes, files, v.value)) {
    const { posProcess: pp, posFile: pf } = extractPositionsFromPayload(v.value, processes, files);
    posProcess = pp;
    posFile = pf;
  } else {
    const laid = G.rebuildBipartiteCleanup(processes, files, links);
    posProcess = laid.posProcess;
    posFile = laid.posFile;
  }
  userAdjusted = false;
  return { ok: true };
}

function onAddProcess() {
  const label = els.newProcessLabel.value.trim() || 'Process';
  const id = `proc-${randomBase36(7)}`;
  processes = [...processes, { id, label, detail: '' }];
  posProcess[id] = G.defaultNewProcessPosition(processes, posProcess);
  els.newProcessLabel.value = '';
  setStatus('');
  syncUi();
}

function onAddFile() {
  const label = els.newFileLabel.value.trim() || 'File';
  const id = `file-${randomBase36(7)}`;
  files = [...files, { id, label, detail: '' }];
  posFile[id] = G.defaultNewFilePosition(files, posFile);
  els.newFileLabel.value = '';
  setStatus('');
  syncUi();
}

function onAddLink() {
  const processId = els.linkProcess.value;
  const fileId = els.linkFile.value;
  if (!processId || !fileId) {
    setStatus('Choose both a Process and a File before adding a link.', true);
    return;
  }
  if (links.some((l) => l.processId === processId && l.fileId === fileId)) {
    setStatus('A link for that pair already exists.', true);
    return;
  }
  const id = `link-${randomBase36(7)}`;
  links = [...links, { id, processId, fileId }];
  setStatus('');
  syncUi();
}

function onCleanup() {
  const exportPayload = buildV2Export({
    processes,
    files,
    links,
    posProcess,
    posFile,
  });
  const v = validateV2Payload(exportPayload);
  if (!v.ok) {
    setStatus(v.error, true);
    return;
  }
  const laid = G.rebuildBipartiteCleanup(processes, files, links);
  posProcess = laid.posProcess;
  posFile = laid.posFile;
  userAdjusted = false;
  setStatus('Cleanup updated layout only; diagram data is unchanged.');
  syncUi();
}

function onSave() {
  const payload = buildV2Export({
    processes,
    files,
    links,
    posProcess,
    posFile,
  });
  const text = `${JSON.stringify(payload, null, 2)}\n`;
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mini-pipeline.json';
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus('Exported mini-pipeline.json');
}

function onLoadText(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    setStatus('Invalid JSON.', true);
    return false;
  }
  const snap = snapshotSession();
  const result = applyLoadedPayload(parsed);
  if (!result.ok) {
    restoreSession(snap);
    setStatus(result.error, true);
    syncUi();
    return false;
  }
  setStatus('Loaded diagram.');
  syncUi();
  return true;
}

function attachGraphPointerHandlers() {
  const svg = els.svg;

  svg.addEventListener('pointerdown', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;

    if (spaceNavHeld && e.button === 0) {
      e.preventDefault();
      userAdjusted = true;
      const pan = {
        pointerId: e.pointerId,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
      };
      svg.setPointerCapture(e.pointerId);
      svg.classList.add('nav-panning');

      const onPanMove = (ev) => {
        if (!spaceNavHeld || ev.pointerId !== pan.pointerId) return;
        const r2 = svg.getBoundingClientRect();
        if (r2.width <= 0 || r2.height <= 0) return;
        const dx = ev.clientX - pan.lastClientX;
        const dy = ev.clientY - pan.lastClientY;
        pan.lastClientX = ev.clientX;
        pan.lastClientY = ev.clientY;
        viewBox = {
          ...viewBox,
          x: viewBox.x - (dx * viewBox.w) / r2.width,
          y: viewBox.y - (dy * viewBox.h) / r2.height,
        };
        renderSvg();
      };

      const onPanEnd = (ev) => {
        if (ev.pointerId !== pan.pointerId) return;
        stopSpacePanGesture();
      };

      spacePanActive = { svg, pointerId: pan.pointerId, onMove: onPanMove, onEnd: onPanEnd };
      window.addEventListener('pointermove', onPanMove);
      window.addEventListener('pointerup', onPanEnd);
      window.addEventListener('pointercancel', onPanEnd);
      return;
    }

    if (t.dataset.canvasBg === 'true' || t === svg) {
      selection = null;
      setStatus('');
      syncUi();
      return;
    }

    const group = t.closest('[data-kind]');
    if (!group || !(group instanceof SVGGElement)) return;
    const kind = group.dataset.kind;
    const id = group.dataset.id;
    if (!kind || !id) return;

    if (kind === 'link') {
      e.preventDefault();
      selection = { kind: 'link', id };
      setStatus('');
      syncUi();
      return;
    }

    if (kind === 'process' || kind === 'file') {
      e.preventDefault();
      selection = { kind, id };
      setStatus('');
      syncUi();

      const startSvg = clientToSvg(e.clientX, e.clientY);
      const pos = kind === 'process' ? posProcess[id] : posFile[id];
      if (!pos) return;
      dragState = {
        kind,
        id,
        startClient: { x: e.clientX, y: e.clientY },
        startSvg: startSvg,
        origin: { x: pos.x, y: pos.y },
        pointerId: e.pointerId,
      };
      svg.setPointerCapture(e.pointerId);

      const onMove = (ev) => {
        if (!dragState || ev.pointerId !== dragState.pointerId) return;
        const cur = clientToSvg(ev.clientX, ev.clientY);
        const dx = cur.x - dragState.startSvg.x;
        const dy = cur.y - dragState.startSvg.y;
        if (dragState.kind === 'process') {
          posProcess[dragState.id] = {
            x: dragState.origin.x + dx,
            y: dragState.origin.y + dy,
          };
        } else {
          posFile[dragState.id] = {
            x: dragState.origin.x + dx,
            y: dragState.origin.y + dy,
          };
        }
        renderSvg();
      };

      const onUp = (ev) => {
        if (!dragState || ev.pointerId !== dragState.pointerId) return;
        svg.releasePointerCapture(ev.pointerId);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        dragState = null;
        syncUi();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    }
  });

  svg.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      userAdjusted = true;
      const { svgWidth, svgHeight } = computeIntrinsicSvgSize();
      const cw = Math.max(400, svgWidth);
      const ch = Math.max(300, svgHeight);
      const minW = Math.max(60, cw * 0.04);
      const maxW = Math.max(minW + 1, cw * 10);
      const minH = Math.max(60, ch * 0.04);
      const maxH = Math.max(minH + 1, ch * 10);

      const pt = clientToSvg(e.clientX, e.clientY);
      const scale = Math.exp(-e.deltaY * 0.0015);
      let nw = viewBox.w * scale;
      let nh = viewBox.h * scale;
      nw = Math.min(maxW, Math.max(minW, nw));
      nh = Math.min(maxH, Math.max(minH, nh));

      const sx = (pt.x - viewBox.x) / viewBox.w;
      const sy = (pt.y - viewBox.y) / viewBox.h;
      viewBox = {
        x: pt.x - sx * nw,
        y: pt.y - sy * nh,
        w: nw,
        h: nh,
      };
      renderSvg();
    },
    { passive: false }
  );
}

function onKeyDown(e) {
  if (e.code === 'Space' && !e.repeat) {
    if (!isTextEntryTarget(e.target)) {
      e.preventDefault();
      spaceNavHeld = true;
      els.svg.classList.add('nav-mode-space');
    }
    return;
  }
  if (e.key !== 'Delete' && e.key !== 'Backspace') return;
  if (isTextEntryTarget(e.target)) return;
  if (!selection) return;
  e.preventDefault();
  deleteSelection();
}

function onKeyUp(e) {
  if (e.code !== 'Space') return;
  spaceNavHeld = false;
  stopSpacePanGesture();
  els.svg.classList.remove('nav-mode-space');
  els.svg.classList.remove('nav-panning');
}

els.btnAddProcess.addEventListener('click', onAddProcess);
els.btnAddFile.addEventListener('click', onAddFile);
els.btnAddLink.addEventListener('click', onAddLink);
els.btnDelete.addEventListener('click', () => {
  deleteSelection();
});
els.btnLoad.addEventListener('click', () => els.fileLoad.click());
els.fileLoad.addEventListener('change', () => {
  const f = els.fileLoad.files?.[0];
  els.fileLoad.value = '';
  if (!f) return;
  f.text()
    .then((text) => {
      const snap = snapshotSession();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        restoreSession(snap);
        setStatus('Invalid JSON.', true);
        syncUi();
        return;
      }
      const result = applyLoadedPayload(parsed);
      if (!result.ok) {
        restoreSession(snap);
        setStatus(result.error, true);
        syncUi();
        return;
      }
      setStatus('Loaded diagram.');
      syncUi();
    })
    .catch(() => {
      setStatus('Could not read file.', true);
    });
});
els.btnSave.addEventListener('click', onSave);
els.btnSample.addEventListener('click', () => {
  const snap = snapshotSession();
  const result = applyLoadedPayload(SAMPLE_V2);
  if (!result.ok) {
    restoreSession(snap);
    setStatus(result.error, true);
    syncUi();
    return;
  }
  setStatus('Loaded sample diagram.');
  syncUi();
});
els.btnResetZoom.addEventListener('click', () => {
  userAdjusted = false;
  setStatus('Reset zoom; diagram positions unchanged.');
  syncUi();
});
els.btnCleanup.addEventListener('click', onCleanup);

document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);
window.addEventListener('blur', () => {
  spaceNavHeld = false;
  stopSpacePanGesture();
  els.svg.classList.remove('nav-mode-space');
  els.svg.classList.remove('nav-panning');
});

attachGraphPointerHandlers();

syncUi();
