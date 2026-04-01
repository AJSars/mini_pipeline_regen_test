/**
 * Mini Pipeline Diagram Maker — geometry & cleanup (global MPDMGeometry).
 * Normative behavior: SPEC.md §3, §6.1–6.2, §7.
 */
(function attachMPDMGeometry(global) {
  'use strict';

  const PAD = 48;
  const ROW_H = 100;
  const NODE_R = 28;
  const FILE_W = 120;
  const FILE_H = 48;
  const GAP_X = 300;

  function lexCmp(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  /** @returns {{ x: number, y: number }} */
  function defaultNewProcessPosition(processes, posProcess) {
    let y = PAD;
    for (const p of processes) {
      const pos = posProcess[p.id];
      if (!pos) continue;
      const bottom = pos.y + 2 * NODE_R + 24;
      if (bottom > y) y = bottom;
    }
    return { x: PAD, y };
  }

  /** @returns {{ x: number, y: number }} */
  function defaultNewFilePosition(files, posFile) {
    let y = PAD;
    for (const f of files) {
      const pos = posFile[f.id];
      if (!pos) continue;
      const bottom = pos.y + FILE_H + 24;
      if (bottom > y) y = bottom;
    }
    return { x: PAD + GAP_X, y };
  }

  /**
   * Process top-left (px,py), file top-left (fx,fy).
   * @returns {{ p1: {x:number,y:number}, p2: {x:number,y:number} }}
   */
  function linkSegmentEndpoints(px, py, fx, fy) {
    const pcx = px + NODE_R;
    const pcy = py + NODE_R;
    const fcx = fx + FILE_W / 2;
    const fcy = fy + FILE_H / 2;
    let vx = fcx - pcx;
    let vy = fcy - pcy;
    const vlen = Math.hypot(vx, vy);
    if (vlen < 1e-9) {
      return {
        p1: { x: pcx, y: pcy },
        p2: { x: fcx, y: fcy },
      };
    }
    vx /= vlen;
    vy /= vlen;
    const p1 = { x: pcx + vx * NODE_R, y: pcy + vy * NODE_R };

    const rx = pcx - fcx;
    const ry = pcy - fcy;
    const rlen = Math.hypot(rx, ry);
    if (rlen < 1e-9) {
      return { p1, p2: { x: fcx, y: fcy } };
    }
    const ux = rx / rlen;
    const uy = ry / rlen;

    const xmin = fx;
    const xmax = fx + FILE_W;
    const ymin = fy;
    const ymax = fy + FILE_H;

    let tHit = Infinity;
    function consider(t) {
      if (!(t > 1e-9)) return;
      const x = fcx + ux * t;
      const y = fcy + uy * t;
      if (x >= xmin - 1e-9 && x <= xmax + 1e-9 && y >= ymin - 1e-9 && y <= ymax + 1e-9) {
        tHit = Math.min(tHit, t);
      }
    }
    if (Math.abs(ux) > 1e-12) {
      consider((xmin - fcx) / ux);
      consider((xmax - fcx) / ux);
    }
    if (Math.abs(uy) > 1e-12) {
      consider((ymin - fcy) / uy);
      consider((ymax - fcy) / uy);
    }
    if (!Number.isFinite(tHit)) {
      tHit = 0;
    }
    const p2 = { x: fcx + ux * tHit, y: fcy + uy * tHit };
    return { p1, p2 };
  }

  function rebuildBipartiteCleanup(processes, files, links) {
    const posProcess = Object.create(null);
    const posFile = Object.create(null);

    const processSet = new Set(processes.map((p) => p.id));
    const fileSet = new Set(files.map((f) => f.id));

    const adj = new Map();
    function addEdge(a, b) {
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      adj.get(a).push(b);
      adj.get(b).push(a);
    }

    for (const link of links) {
      if (processSet.has(link.processId) && fileSet.has(link.fileId)) {
        addEdge(link.processId, link.fileId);
      }
    }

    const allNodes = [...processSet, ...fileSet];
    for (const id of allNodes) {
      if (!adj.has(id)) adj.set(id, []);
    }

    const visited = new Set();
    let yOffset = 0;

    function componentOf(start) {
      const comp = [];
      const stack = [start];
      visited.add(start);
      while (stack.length) {
        const u = stack.pop();
        comp.push(u);
        for (const v of adj.get(u) || []) {
          if (!visited.has(v)) {
            visited.add(v);
            stack.push(v);
          }
        }
      }
      return comp;
    }

    function isProcess(id) {
      return processSet.has(id);
    }

    function hasInternalLink(comp) {
      const set = new Set(comp);
      for (const link of links) {
        if (set.has(link.processId) && set.has(link.fileId)) return true;
      }
      return false;
    }

    function placeDisconnected(comp) {
      const procs = comp.filter(isProcess).sort(lexCmp);
      const fils = comp.filter((id) => !isProcess(id)).sort(lexCmp);
      let row = 0;
      for (const pid of procs) {
        posProcess[pid] = { x: PAD, y: PAD + yOffset + row * ROW_H };
        row += 1;
      }
      for (const fid of fils) {
        posFile[fid] = { x: PAD + GAP_X, y: PAD + yOffset + row * ROW_H };
        row += 1;
      }
      yOffset += row * ROW_H + (row > 0 ? 24 : 0);
    }

    function bfsLayers(seed, compSet) {
      const layerOf = new Map();
      const queue = [seed];
      layerOf.set(seed, 0);
      const orderVisit = [seed];
      while (queue.length) {
        const u = queue.shift();
        const L = layerOf.get(u);
        for (const v of adj.get(u) || []) {
          if (!compSet.has(v)) continue;
          if (!layerOf.has(v)) {
            layerOf.set(v, L + 1);
            queue.push(v);
            orderVisit.push(v);
          }
        }
      }
      const maxL = Math.max(0, ...layerOf.values());
      const layers = [];
      for (let i = 0; i <= maxL; i++) layers.push([]);
      for (const id of orderVisit) {
        layers[layerOf.get(id)].push(id);
      }
      for (const layer of layers) {
        layer.sort(lexCmp);
      }
      return { layerOf, layers, maxL };
    }

    function medianIndex(neighborIds, orderIndex) {
      const idxs = neighborIds
        .map((n) => orderIndex.get(n))
        .filter((i) => i !== undefined)
        .sort((a, b) => a - b);
      if (idxs.length === 0) return 0;
      const mid = Math.floor((idxs.length - 1) / 2);
      return idxs[mid];
    }

    function refineLayers(layers) {
      const maxL = layers.length - 1;
      for (let outer = 0; outer < 2; outer++) {
        for (let L = 1; L <= maxL; L++) {
          const prevOrder = layers[L - 1];
          const orderIndex = new Map();
          prevOrder.forEach((id, i) => orderIndex.set(id, i));
          layers[L].sort((a, b) => {
            const ma = medianIndex(adj.get(a) || [], orderIndex);
            const mb = medianIndex(adj.get(b) || [], orderIndex);
            const c = ma - mb;
            return c !== 0 ? c : lexCmp(a, b);
          });
        }
        for (let L = maxL - 1; L >= 0; L--) {
          const nextOrder = layers[L + 1];
          const orderIndex = new Map();
          nextOrder.forEach((id, i) => orderIndex.set(id, i));
          layers[L].sort((a, b) => {
            const ma = medianIndex(adj.get(a) || [], orderIndex);
            const mb = medianIndex(adj.get(b) || [], orderIndex);
            const c = ma - mb;
            return c !== 0 ? c : lexCmp(a, b);
          });
        }
      }
    }

    function placeConnected(comp) {
      const compSet = new Set(comp);
      const procIds = comp.filter(isProcess).sort(lexCmp);
      const fileIds = comp.filter((id) => !isProcess(id)).sort(lexCmp);
      let seed;
      if (procIds.length) seed = procIds[0];
      else seed = fileIds[0];

      const { layers, maxL } = bfsLayers(seed, compSet);
      refineLayers(layers);

      let maxRows = 0;
      for (let layerIndex = 0; layerIndex <= maxL; layerIndex++) {
        const layer = layers[layerIndex];
        maxRows = Math.max(maxRows, layer.length);
        layer.forEach((id, rowIndex) => {
          const x = PAD + layerIndex * GAP_X;
          const y = PAD + yOffset + rowIndex * ROW_H;
          if (isProcess(id)) posProcess[id] = { x, y };
          else posFile[id] = { x, y };
        });
      }
      yOffset += maxRows * ROW_H + 24;
    }

    for (const id of allNodes.sort(lexCmp)) {
      if (visited.has(id)) continue;
      const comp = componentOf(id);
      if (!hasInternalLink(comp)) placeDisconnected(comp);
      else placeConnected(comp);
    }

    return { posProcess, posFile };
  }

  global.MPDMGeometry = {
    PAD,
    ROW_H,
    NODE_R,
    FILE_W,
    FILE_H,
    GAP_X,
    defaultNewProcessPosition,
    defaultNewFilePosition,
    linkSegmentEndpoints,
    rebuildBipartiteCleanup,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
