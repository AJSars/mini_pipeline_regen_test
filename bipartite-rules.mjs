/**
 * Validation, normalization, full-layout detection — SPEC.md §4.
 */

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
export function validateV2Payload(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Root must be an object.' };
  }
  const root = /** @type {Record<string, unknown>} */ (raw);

  const allowedRootKeys = new Set(['version', 'processes', 'files', 'links']);
  for (const k of Object.keys(root)) {
    if (!allowedRootKeys.has(k)) {
      return { ok: false, error: `Unexpected root property: ${k}` };
    }
  }

  const version = root.version;
  if (version === 1) {
    return { ok: false, error: 'v2 required / v1 not supported.' };
  }
  if (version !== 2) {
    return { ok: false, error: 'version must be 2.' };
  }

  if (!Array.isArray(root.processes) || !Array.isArray(root.files) || !Array.isArray(root.links)) {
    return { ok: false, error: 'processes, files, and links must be arrays.' };
  }

  const processes = root.processes;
  const files = root.files;
  const links = root.links;

  const allowedNodeKeys = new Set(['id', 'label', 'detail', 'x', 'y']);
  const allowedLinkKeys = new Set(['id', 'processId', 'fileId']);

  const processIds = new Set();
  const fileIds = new Set();

  for (let i = 0; i < processes.length; i++) {
    const n = processes[i];
    if (n === null || typeof n !== 'object' || Array.isArray(n)) {
      return { ok: false, error: `processes[${i}] must be an object.` };
    }
    const o = /** @type {Record<string, unknown>} */ (n);
    for (const k of Object.keys(o)) {
      if (!allowedNodeKeys.has(k)) {
        return { ok: false, error: `Unexpected property on process: ${k}` };
      }
    }
    if (typeof o.id !== 'string' || o.id.length === 0) {
      return { ok: false, error: 'Each process must have a non-empty string id.' };
    }
    if (typeof o.label !== 'string') {
      return { ok: false, error: 'Each process must have a string label.' };
    }
    if ('detail' in o && o.detail !== null && typeof o.detail !== 'string') {
      return { ok: false, error: 'process.detail must be a string if present.' };
    }
    const hasX = 'x' in o;
    const hasY = 'y' in o;
    if (hasX !== hasY) {
      return { ok: false, error: 'Process x and y must both be absent or both present.' };
    }
    if (hasX) {
      if (typeof o.x !== 'number' || !Number.isFinite(o.x)) {
        return { ok: false, error: 'Process x must be a finite number.' };
      }
      if (typeof o.y !== 'number' || !Number.isFinite(o.y)) {
        return { ok: false, error: 'Process y must be a finite number.' };
      }
    }
    if (processIds.has(o.id)) {
      return { ok: false, error: `Duplicate process id: ${o.id}` };
    }
    processIds.add(o.id);
  }

  for (let i = 0; i < files.length; i++) {
    const n = files[i];
    if (n === null || typeof n !== 'object' || Array.isArray(n)) {
      return { ok: false, error: `files[${i}] must be an object.` };
    }
    const o = /** @type {Record<string, unknown>} */ (n);
    for (const k of Object.keys(o)) {
      if (!allowedNodeKeys.has(k)) {
        return { ok: false, error: `Unexpected property on file: ${k}` };
      }
    }
    if (typeof o.id !== 'string' || o.id.length === 0) {
      return { ok: false, error: 'Each file must have a non-empty string id.' };
    }
    if (typeof o.label !== 'string') {
      return { ok: false, error: 'Each file must have a string label.' };
    }
    if ('detail' in o && o.detail !== null && typeof o.detail !== 'string') {
      return { ok: false, error: 'file.detail must be a string if present.' };
    }
    const hasX = 'x' in o;
    const hasY = 'y' in o;
    if (hasX !== hasY) {
      return { ok: false, error: 'File x and y must both be absent or both present.' };
    }
    if (hasX) {
      if (typeof o.x !== 'number' || !Number.isFinite(o.x)) {
        return { ok: false, error: 'File x must be a finite number.' };
      }
      if (typeof o.y !== 'number' || !Number.isFinite(o.y)) {
        return { ok: false, error: 'File y must be a finite number.' };
      }
    }
    if (fileIds.has(o.id)) {
      return { ok: false, error: `Duplicate file id: ${o.id}` };
    }
    fileIds.add(o.id);
  }

  for (const id of processIds) {
    if (fileIds.has(id)) {
      return { ok: false, error: `id ${id} appears in both processes and files.` };
    }
  }

  const linkPairs = new Set();
  for (let i = 0; i < links.length; i++) {
    const L = links[i];
    if (L === null || typeof L !== 'object' || Array.isArray(L)) {
      return { ok: false, error: `links[${i}] must be an object.` };
    }
    const o = /** @type {Record<string, unknown>} */ (L);
    for (const k of Object.keys(o)) {
      if (!allowedLinkKeys.has(k)) {
        return { ok: false, error: `Unexpected property on link: ${k}` };
      }
    }
    if (typeof o.processId !== 'string' || o.processId.length === 0) {
      return { ok: false, error: 'Each link must have a non-empty processId.' };
    }
    if (typeof o.fileId !== 'string' || o.fileId.length === 0) {
      return { ok: false, error: 'Each link must have a non-empty fileId.' };
    }
    if ('id' in o) {
      if (typeof o.id !== 'string' || o.id.length === 0) {
        return { ok: false, error: 'Link id must be a non-empty string if present.' };
      }
    }
    const pid = o.processId;
    const fid = o.fileId;
    if (!processIds.has(pid)) {
      return { ok: false, error: `Link references unknown process: ${pid}` };
    }
    if (!fileIds.has(fid)) {
      return { ok: false, error: `Link references unknown file: ${fid}` };
    }
    if (fileIds.has(pid) || processIds.has(fid)) {
      return { ok: false, error: 'Link endpoints must be process and file (bipartite).' };
    }
    const pairKey = `${pid}\0${fid}`;
    if (linkPairs.has(pairKey)) {
      return { ok: false, error: `Duplicate link pair (${pid}, ${fid}).` };
    }
    linkPairs.add(pairKey);
  }

  return { ok: true, value: root };
}

/**
 * @param {object} validatedRoot — output shape from validateV2Payload
 */
export function normalizeV2Diagram(validatedRoot) {
  const processes = validatedRoot.processes.map((n) => {
    const o = /** @type {Record<string, unknown>} */ (n);
    return {
      id: String(o.id),
      label: String(o.label),
      detail: 'detail' in o && o.detail != null ? String(o.detail) : '',
    };
  });

  const files = validatedRoot.files.map((n) => {
    const o = /** @type {Record<string, unknown>} */ (n);
    return {
      id: String(o.id),
      label: String(o.label),
      detail: 'detail' in o && o.detail != null ? String(o.detail) : '',
    };
  });

  const links = validatedRoot.links.map((L, index) => {
    const o = /** @type {Record<string, unknown>} */ (L);
    const processId = String(o.processId);
    const fileId = String(o.fileId);
    const id =
      'id' in o && typeof o.id === 'string' && o.id.length > 0
        ? String(o.id)
        : `link-${index}-${processId}-${fileId}`;
    return { id, processId, fileId };
  });

  return { processes, files, links };
}

/**
 * @param {Array<{ id: string }>} processes
 * @param {Array<{ id: string }>} files
 * @param {unknown} rawRoot — original parsed object (for x/y presence)
 */
export function hasFullLayoutOnLoad(processes, files, rawRoot) {
  if (processes.length === 0 && files.length === 0) {
    return false;
  }
  const procArr = rawRoot.processes;
  const fileArr = rawRoot.files;
  let anyCoord = false;
  for (const n of procArr) {
    const o = /** @type {Record<string, unknown>} */ (n);
    if ('x' in o || 'y' in o) anyCoord = true;
  }
  for (const n of fileArr) {
    const o = /** @type {Record<string, unknown>} */ (n);
    if ('x' in o || 'y' in o) anyCoord = true;
  }
  if (!anyCoord) {
    return false;
  }
  for (const n of procArr) {
    const o = /** @type {Record<string, unknown>} */ (n);
    if (
      typeof o.x !== 'number' ||
      !Number.isFinite(o.x) ||
      typeof o.y !== 'number' ||
      !Number.isFinite(o.y)
    ) {
      return false;
    }
  }
  for (const n of fileArr) {
    const o = /** @type {Record<string, unknown>} */ (n);
    if (
      typeof o.x !== 'number' ||
      !Number.isFinite(o.x) ||
      typeof o.y !== 'number' ||
      !Number.isFinite(o.y)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Extract positions from validated raw root (when hasFullLayoutOnLoad is true and non-empty).
 */
export function extractPositionsFromPayload(rawRoot, processes, files) {
  const posProcess = Object.create(null);
  const posFile = Object.create(null);
  const pmap = new Map(rawRoot.processes.map((n) => [String(n.id), n]));
  const fmap = new Map(rawRoot.files.map((n) => [String(n.id), n]));
  for (const p of processes) {
    const o = pmap.get(p.id);
    posProcess[p.id] = { x: Number(o.x), y: Number(o.y) };
  }
  for (const f of files) {
    const o = fmap.get(f.id);
    posFile[f.id] = { x: Number(o.x), y: Number(o.y) };
  }
  return { posProcess, posFile };
}
