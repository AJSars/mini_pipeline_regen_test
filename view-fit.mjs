/**
 * Viewport fit-to-content — SPEC.md §5.2 (no imports).
 */

const NODE_R = 28;
const FILE_W = 120;
const FILE_H = 48;
const PAD = 48;

function linkSegmentBBoxEndpoints(px, py, fx, fy) {
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

/**
 * @param {{
 *   processes: Array<{ id: string }>,
 *   files: Array<{ id: string }>,
 *   links: Array<{ processId: string, fileId: string }>,
 *   posProcess: Record<string, { x: number, y: number }>,
 *   posFile: Record<string, { x: number, y: number }>,
 * }} params
 */
export function computeViewBoxFit(params) {
  const {
    processes,
    files,
    links,
    posProcess,
    posFile,
    margin = PAD,
    strokePad = 3,
    emptyWidth = 400,
    emptyHeight = 300,
    minInnerWidth = 120,
    minInnerHeight = 80,
  } = params;

  if (processes.length === 0 && files.length === 0) {
    return { x: 0, y: 0, w: emptyWidth, h: emptyHeight };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function expandPoint(x, y, pad) {
    minX = Math.min(minX, x - pad);
    minY = Math.min(minY, y - pad);
    maxX = Math.max(maxX, x + pad);
    maxY = Math.max(maxY, y + pad);
  }

  for (const p of processes) {
    const pos = posProcess[p.id];
    if (!pos) continue;
    const px = pos.x;
    const py = pos.y;
    expandPoint(px, py, 0);
    expandPoint(px + 2 * NODE_R, py + 2 * NODE_R, 0);
  }
  for (const f of files) {
    const pos = posFile[f.id];
    if (!pos) continue;
    const fx = pos.x;
    const fy = pos.y;
    expandPoint(fx, fy, 0);
    expandPoint(fx + FILE_W, fy + FILE_H, 0);
  }

  const processSet = new Set(processes.map((p) => p.id));
  const fileSet = new Set(files.map((f) => f.id));

  for (const link of links) {
    if (!processSet.has(link.processId) || !fileSet.has(link.fileId)) continue;
    const pp = posProcess[link.processId];
    const fp = posFile[link.fileId];
    if (!pp || !fp) continue;
    const { p1, p2 } = linkSegmentBBoxEndpoints(pp.x, pp.y, fp.x, fp.y);
    expandPoint(p1.x, p1.y, strokePad);
    expandPoint(p2.x, p2.y, strokePad);
  }

  const spanW = Math.max(maxX - minX, minInnerWidth);
  const spanH = Math.max(maxY - minY, minInnerHeight);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  return {
    x: cx - spanW / 2 - margin,
    y: cy - spanH / 2 - margin,
    w: spanW + 2 * margin,
    h: spanH + 2 * margin,
  };
}
