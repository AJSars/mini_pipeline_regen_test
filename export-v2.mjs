/**
 * Build v2 export payload — SPEC.md §4.4
 */

/**
 * @param {{
 *   processes: Array<{ id: string, label: string, detail: string }>,
 *   files: Array<{ id: string, label: string, detail: string }>,
 *   links: Array<{ id: string, processId: string, fileId: string }>,
 *   posProcess: Record<string, { x: number, y: number }>,
 *   posFile: Record<string, { x: number, y: number }>,
 * }} doc
 */
export function buildV2Export(doc) {
  const { processes, files, links, posProcess, posFile } = doc;
  return {
    version: 2,
    processes: processes.map((p) => ({
      id: p.id,
      label: p.label,
      detail: p.detail,
      x: posProcess[p.id]?.x ?? 0,
      y: posProcess[p.id]?.y ?? 0,
    })),
    files: files.map((f) => ({
      id: f.id,
      label: f.label,
      detail: f.detail,
      x: posFile[f.id]?.x ?? 0,
      y: posFile[f.id]?.y ?? 0,
    })),
    links: links.map((L) => ({
      id: L.id,
      processId: L.processId,
      fileId: L.fileId,
    })),
  };
}
