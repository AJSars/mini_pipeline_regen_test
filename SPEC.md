# Mini Pipeline Diagram Maker — canonical specification

This document is **self-contained** for **behavior**: every rule needed to reimplement user-visible logic, persistence, and layout is stated here. **`DESIGN.md`** adds architecture, rendering strategy, and visual design; it does not define additional behavioral requirements.

**How to use this document**

1. Read **§1–3** for the model and coordinate system.  
2. Use **§4 (JSON)** as the single source of truth for file format, including **stored positions** (`x`, `y`).  
3. Use **§5–9** for algorithms and viewport math.  
4. Use **§10** as the **acceptance-test catalog** (**S-001** through **S-034**): each **Scenario** is an explicit **Given / When / Then** check a regenerated app should satisfy.

**Glossary**

| Term | Meaning |
|------|---------|
| **Process** | Node kind; drawn as a circle. Stored in array `processes`. |
| **File** | Node kind; drawn as a rounded rectangle. Stored in `files`. |
| **Link** | Edge from one Process to one File; never same-kind endpoints. |
| **Diagram data** | `processes`, `files`, `links` only (no positions). |
| **Position maps** | `posProcess[id] → {x,y}`, `posFile[id] → {x,y}` in SVG user units. |
| **Selection** | At most one of: process, file, or link, or none. |
| **Viewport** | SVG `viewBox` rectangle `(x, y, width, height)`. |
| **userAdjusted** | Flag: if true, viewport was changed by user zoom; auto-fit is suspended until reset. |

---

## 1. Purpose and scope

- **Purpose:** Edit a **bipartite** multigraph: only **Process ↔ File** links exist.
- **Out of scope:** Pipeline execution, authentication, servers, databases, cloud sync, multi-user editing.
- **Runtime:** Single-page web app; diagram state lives in memory unless the user **loads** a file or **saves** (download) JSON.

---

## 2. Logical data model

### 2.1 Process (diagram fields)

| Field | Type | Required | Rules |
|-------|------|----------|--------|
| `id` | string | yes | Non-empty; **globally unique** with every File id. |
| `label` | string | yes | Display name. |
| `detail` | string | if omitted on load | Treated as `""` after normalization. |

### 2.2 File (diagram fields)

Same rules as Process. No `id` may appear in both `processes` and `files`.

### 2.3 Link (diagram fields)

| Field | Type | Required | Rules |
|-------|------|----------|--------|
| `processId` | string | yes | Must be an existing Process `id`; must **not** be a File id. |
| `fileId` | string | yes | Must be an existing File `id`; must **not** be a Process id. |
| `id` | string | no | If present: non-empty, unique among all links. If absent on load: assign synthetic id (§4.3). |

**Structural constraints**

- No duplicate **pair** `(processId, fileId)`.
- No duplicate Process `id`; no duplicate File `id`.

**Deletion semantics**

- Delete **link:** remove that link only.
- Delete **Process:** remove the Process, remove all links with that `processId`, remove its position entry.
- Delete **File:** remove the File, remove all links with that `fileId`, remove its position entry.

### 2.4 Selection (session state)

Exactly zero or one:

- `{ kind: 'process', id }`, `{ kind: 'file', id }`, `{ kind: 'link', id }`.

Selection drives the inspector, enables **Delete selection**, and interacts with link dropdowns (§10).

---

## 3. Geometric model and constants

Coordinates are **SVG user units** (unitless numbers), one shared space for all nodes and edges.

### 3.1 Constants

| Symbol | Value | Role |
|--------|------:|------|
| `PAD` | 48 | Padding in bounds and cleanup origin columns. |
| `ROW_H` | 100 | Vertical pitch between rows in cleanup. |
| `NODE_R` | 28 | **Radius** of Process circle. |
| `FILE_W` | 120 | File rectangle width. |
| `FILE_H` | 48 | File rectangle height. |
| `GAP_X` | 300 | Horizontal spacing between cleanup **layers**. |

### 3.2 Process geometry

`posProcess[id] = { x, y }` is the **top-left** of the square **bounding** the circle with side `2 × NODE_R`.

- Circle center: `(cx, cy) = (x + NODE_R, y + NODE_R)`  
- Radius: `NODE_R`

### 3.3 File geometry

`posFile[id] = { x, y }` is the **top-left** of the rectangle **`FILE_W` × `FILE_H`**.

### 3.4 Link segment (straight line)

Let `pc = (px + NODE_R, py + NODE_R)` be the process center and `fc = (fx + FILE_W/2, fy + FILE_H/2)` the file center.

1. **Process endpoint:** from `pc`, step toward `fc` by distance `NODE_R` along the unit vector `(fc - pc) / |fc - pc|` (if length 0, implementation uses degenerate handling consistent with unit tests).
2. **File endpoint:** from `fc`, step toward `pc` until the ray hits the **rectangle border** (first intersection with the axis-aligned rectangle half-extents `FILE_W/2`, `FILE_H/2` from center).

The drawn edge is the line between these two endpoints. **Pick target:** a wider, transparent stroke along the same path.

### 3.5 Intrinsic SVG document size

For each Process, bounding box spans `[px, py]` to `[px + 2·NODE_R, py + 2·NODE_R]`. For each File, `[fx, fy]` to `[fx + FILE_W, fy + FILE_H]`.

Let `maxX`, `maxY` be max corners over all such boxes (initialize `maxX = maxY = PAD`). Then:

- `svgWidth = max(480, maxX + PAD)`
- `svgHeight = max(320, maxY + PAD)`

The root `<svg>` **width** and **height** attributes use `svgWidth` and `svgHeight` on each render.

---

## 4. JSON v2 — normative format and schema

### 4.1 Semantics overview

- Top level **`version`** must be `2`.  
- **`processes`** and **`files`** are arrays of node records.  
- **`links`** connect `processId` ↔ `fileId`.  
- **Stored layout:** each Process and each File **may** include **`x`** and **`y`** (numbers). Rules:
  - For each node, **`x` and `y` are both absent** (keys not present) **or both present** with finite numbers.
  - If **any** node object has **`x` or `y` present** (key defined, including `null` as present in JSON), then **every** Process and **every** File must have **finite numeric** `x` and `y` (see validation note on `null` below).

**Full layout on load** when: at least one Process or File exists, and **every** Process and File has finite `x` and `y`. Then positions are read from JSON.

Otherwise (no coordinates, or partial/missing layout): after load, run **`rebuildBipartiteCleanup`** (§7) to compute `posProcess` / `posFile`.

**Export (save):** always emits **`x` and `y`** for **every** Process and File in array order; uses current position maps, defaulting missing entries to `(0, 0)`. Every link includes `id`.

Download filename: **`mini-pipeline.json`**.

### 4.2 Normative JSON Schema (structure + positions)

The language below is **JSON Schema 2020-12**. It expresses **shape**; **Additional constraints** after the schema are **normative** (bipartite endpoints, global id uniqueness, no duplicate link pairs).

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/mini-pipeline/v2.schema.json",
  "title": "Mini Pipeline Diagram v2",
  "type": "object",
  "additionalProperties": false,
  "required": ["version", "processes", "files", "links"],
  "properties": {
    "version": { "type": "integer", "const": 2 },
    "processes": {
      "type": "array",
      "items": { "$ref": "#/$defs/node" }
    },
    "files": {
      "type": "array",
      "items": { "$ref": "#/$defs/node" }
    },
    "links": {
      "type": "array",
      "items": { "$ref": "#/$defs/link" }
    }
  },
  "$defs": {
    "node": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "label"],
      "properties": {
        "id": { "type": "string", "minLength": 1 },
        "label": { "type": "string" },
        "detail": { "type": "string" },
        "x": { "type": "number" },
        "y": { "type": "number" }
      },
      "oneOf": [
        {
          "title": "No stored position",
          "not": { "anyOf": [{ "required": ["x"] }, { "required": ["y"] }] }
        },
        {
          "title": "Stored position",
          "required": ["x", "y"]
        }
      ]
    },
    "link": {
      "type": "object",
      "additionalProperties": false,
      "required": ["processId", "fileId"],
      "properties": {
        "id": { "type": "string", "minLength": 1 },
        "processId": { "type": "string", "minLength": 1 },
        "fileId": { "type": "string", "minLength": 1 }
      }
    }
  }
}
```

**Validation implementation note (TypeScript-like):** For each node, if `x` is defined OR `y` is defined (`"x" in obj` / `"y" in obj`), the other key MUST be present; both MUST satisfy `typeof n === 'number' && Number.isFinite(n)`. Values such as JSON **`null`** for one axis count as “present” and MUST pair with a finite number or fail validation.

### 4.3 Load pipeline (normative)

1. **Parse** JSON text to a value; parse failure → error, no state change.  
2. **validateV2Payload** (reject if error):  
   - Root object; `version === 2`. If `version === 1` **or** root has **`nodes` as array**, reject with “v2 required / v1 not supported”.  
   - Arrays `processes`, `files`, `links` exist.  
   - Node and link field rules above; **partition** disjoint; **duplicate** ids and link pairs; **bipartite** links (§2.3).  
3. **normalizeV2Diagram:** copy `id`, `label`, `detail` → `""` if null/undefined; links without `id` get `link-${index}-${processId}-${fileId}`.  
4. Replace diagram data in memory; **selection = none**.  
5. **Positions:** if full layout (§4.1), copy `x`,`y` into `posProcess` / `posFile`; else **`rebuildBipartiteCleanup`**.  
6. **Viewport:** clear `userAdjusted` (auto-fit on next render).

**Failed load after step 2:** restore **entire** prior session snapshot (diagram + positions + selection + viewport), unchanged.

### 4.4 Export shape (normative)

Output object matching §4.2 with:

- `version: 2`  
- Each Process/File: `id`, `label`, `detail` (string), `x`, `y` (finite numbers from maps)  
- Each link: `id`, `processId`, `fileId`

### 4.5 Minimal examples

**No stored positions (layout computed on load):**

```json
{
  "version": 2,
  "processes": [{ "id": "a", "label": "Step A" }],
  "files": [{ "id": "f1", "label": "data.csv" }],
  "links": [{ "processId": "a", "fileId": "f1" }]
}
```

**Full stored layout (every node has `x`, `y`):**

```json
{
  "version": 2,
  "processes": [{ "id": "a", "label": "Step A", "detail": "", "x": 48, "y": 48 }],
  "files": [{ "id": "f1", "label": "data.csv", "detail": "", "x": 348, "y": 48 }],
  "links": [{ "id": "link-0-a-f1", "processId": "a", "fileId": "f1" }]
}
```

---

## 5. Viewport (zoom and framing)

### 5.1 Auto-fit vs userAdjusted

- **`userAdjusted === false`:** On each full render, set `viewBox` from **fit-to-content** (§5.2).  
- **`userAdjusted === true`:** Keep stored `viewBox` from wheel zoom, but clamp sizes (§5.3).  
- **Reset zoom:** set `userAdjusted = false`; next render applies §5.2.

### 5.2 Fit-to-content `computeViewBoxFit`

**Parameters:** `processes`, `files`, `links`, `posProcess`, `posFile`, `NODE_R`, `FILE_W`, `FILE_H`, `margin = PAD`, `strokePad = 3`, `emptyWidth = 400`, `emptyHeight = 300`, `minInnerWidth = 120`, `minInnerHeight = 80`.

- If no Processes and no Files: `{ x: 0, y: 0, w: emptyWidth, h: emptyHeight }`.  
- Else: union bounding box of all node boxes (§3.5) plus, for each link with both endpoints, the segment endpoints from §3.4 padded by `strokePad` in x and y.  
- `spanW = max(maxX-minX, minInnerWidth)`, `spanH = max(maxY-minY, minInnerHeight)`.  
- Center `(cx, cy)` of that box; return:

  `x = cx - spanW/2 - margin`, `y = cy - spanH/2 - margin`, `w = spanW + 2·margin`, `h = spanH + 2·margin`.

### 5.3 Wheel zoom (Ctrl + scroll)

- **Without Ctrl:** do not hijack wheel for zoom (page/surface may scroll).  
- **With Ctrl:** prevent default; set `userAdjusted = true`. Compute proposed `viewBox` by scaling width/height about cursor in SVG space (`deltaY` drives zoom direction and speed per implementation constants in §9 table). Then clamp `w`/`h` using `svgWidth`/`svgHeight` from §3.5:  
  - `cw = max(400, svgWidth)`, `ch = max(300, svgHeight)`  
  - `minW = max(60, cw * 0.04)`, `maxW = max(minW + 1, cw * 10)`  
  - Same for height with `ch`.

---

## 6. New entities (toolbar)

### 6.1 Process

- Label = trimmed text field, or `"Process"` if empty.  
- `id = "proc-"` + seven random base-36 alphanumeric characters.  
- `detail = ""`.  
- `posProcess[id]`: `x = PAD`; `y =` max over other processes of `(y + 2·NODE_R + 24)`, else start at `PAD`.

### 6.2 File

- Label trimmed or `"File"`.  
- `id = "file-"` + same random pattern.  
- `detail = ""`.  
- `posFile[id]`: `x = PAD + GAP_X`; `y =` max over other files of `(y + FILE_H + 24)`, else `PAD`.

### 6.3 Link

- Both dropdowns must have non-empty value; else error status.  
- Validate bipartite membership; reject duplicate `(processId, fileId)`.  
- `id = "link-"` + random fragment.

---

## 7. Cleanup layout `rebuildBipartiteCleanup`

**Must not** mutate `processes` / `files` / `links` **array contents** or list membership. **Only** returns new position maps.

**Steps (summary):**

1. Build undirected adjacency: Process ↔ File for each valid link.  
2. **Connected components** over all Process and File ids that appear in the diagram.  
3. For each component **without** any internal link: Processes in column `x = PAD`, Files in column `x = PAD + GAP_X`, rows spaced by `ROW_H`, lexicographic order within kind, advance vertical `yOffset`.  
4. For each component **with** a link: seed = smallest Process id in component, else smallest File id; **BFS** distances → **layers**; **barycenter** refinement for **2** outer iterations (forward layer sweeps + backward sweeps using neighbor **median** index, tie-break by id); assign `x = PAD + layerIndex * GAP_X`, `y = PAD + yOffset + rowIndex * ROW_H`; advance `yOffset`.

**Before Cleanup in the UI:** run the same structural validation as load. If it fails, show error and **do not** change positions.

**After success:** set `userAdjusted = false`.

---

## 8. Inspector (selection panel)

| Selection | Kind / Id / Label / Detail | Connections block |
|-----------|----------------------------|-------------------|
| None | Hidden; empty-state message | — |
| Process | Kind `Process`; label from node; detail or `—` if empty string | List **Files** touched by links from this process + link id |
| File | Kind `File`; same | List **Processes** + link id |
| Link | Kind `Link`; id = link id; label = `processLabel ↔ fileLabel` (fallback ids); detail `—` | **Hidden** |

---

## 9. Constants table (interaction detail)

| Behavior | Detail |
|----------|--------|
| Process label in SVG | Max **16** characters displayed; longer → first **15** + `…` |
| File label in SVG | Max **18**; longer → first **17** + `…` |
| Link pickers | Leading option `—` with empty value; repopulate on sync; restore previous selection if ids still exist |
| Delete / Backspace | Delete selection only if **not** in a text-entry control: `textarea`, `select`, `input` except `button`/`submit`/`reset`/`checkbox`/`radio`/`file`, or `contentEditable` |
| Drag | `mousedown` on node hit: `preventDefault`, select, track `mousemove`/`mouseup` on **window**; move by SVG delta |

---

## 10. Acceptance scenarios (Given / When / Then)

Each scenario is independent unless **Depends on** references another id. A regenerated implementation **must** satisfy all scenarios.

### Scenario index

| Id | Title |
|----|--------|
| **S-001** | Empty startup (no nodes, no selection, default 400×300 fit) |
| **S-002** | Add Process (label, id prefix `proc-`, placement §6.1, field clears) |
| **S-003** | Add File (label, id prefix `file-`, placement §6.2, field clears) |
| **S-004** | Add link success (new edge, id prefix `link-`, geometry §3.4) |
| **S-005** | Add link requires both pickers (error, no link) |
| **S-006** | Add link rejects duplicate `(processId, fileId)` |
| **S-007** | Delete link (link removed, endpoints kept, selection cleared) |
| **S-008** | Delete Process cascades incident links and position |
| **S-009** | Delete File cascades incident links and position |
| **S-010** | Canvas background click clears selection |
| **S-011** | Select link — inspector shows link row, hides Connections |
| **S-012** | Drag node updates positions and attached link geometry |
| **S-013** | Backspace in text field does not delete graph selection |
| **S-014** | Delete / Backspace deletes selection when not typing |
| **S-015** | Cleanup changes only positions; data arrays unchanged; refit |
| **S-016** | Cleanup on failed validation does not move layout |
| **S-017** | Reset zoom clears user zoom and reframes (positions unchanged) |
| **S-018** | Ctrl + wheel zoom updates viewBox toward cursor |
| **S-019** | Wheel without Ctrl does not force zoom preventDefault |
| **S-020** | Load JSON with full `x`/`y` restores positions (no Cleanup) |
| **S-021** | Load JSON without coordinates runs Cleanup for layout |
| **S-022** | Failed load leaves diagram + positions + selection unchanged |
| **S-023** | Load sample applies canonical graph and Cleanup layout |
| **S-024** | Export then reload preserves node coordinates and links |
| **S-025** | Export includes `x`/`y` on every node when graph non-empty |
| **S-026** | Reject v1 JSON (`version: 1` or `nodes` array style) |
| **S-027** | Reject same `id` in both `processes` and `files` |
| **S-028** | Reject duplicate link pair in JSON |
| **S-029** | Process / File label truncation in SVG (16 / 18 chars) |
| **S-030** | Link pickers keep prior selection after refresh if ids exist |
| **S-031** | Inspector lists neighbor Files/Processes with link ids |
| **S-032** | Missing `MPDMGeometry` before app module → fail fast |
| **S-033** | Export empty diagram yields valid empty v2 JSON |
| **S-034** | Reject duplicate Process `id` inside `processes` |

---

**Scenario S-001 — Empty startup**  
**Given** the app has just loaded with no prior file.  
**When** the user has not added any nodes.  
**Then** `processes` and `files` are empty; no selection; **Delete selection** is disabled; fit `viewBox` uses **400×300** at origin `(0,0)` (§5.2 empty case).

---

**Scenario S-002 — Add Process**  
**Given** an empty or non-empty diagram.  
**When** the user enters optional text in “New Process label” and clicks **Add Process**.  
**Then** a new Process exists with trimmed label or default `"Process"`; `detail` is `""`; `id` starts with `proc-`; the label field clears; position matches §6.1 (stack below existing Processes on the left column).

---

**Scenario S-003 — Add File**  
**Given** any diagram.  
**When** the user clicks **Add File** with optional label text.  
**Then** a new File exists with trimmed label or `"File"`; `id` starts with `file-`; field clears; position matches §6.2 (right column, stacked).

---

**Scenario S-004 — Add link success**  
**Given** at least one Process **P** and one File **F**, pickers set to **P** and **F**, and no existing link for pair `(P,F)`.  
**When** the user clicks **Add link**.  
**Then** a new link connects **P** and **F**; link `id` starts with `link-`; incident edge draws between correct anchors (§3.4).

---

**Scenario S-005 — Add link requires endpoints**  
**Given** the Process or File picker is left at **—**.  
**When** the user clicks **Add link**.  
**Then** no link is added; an **error** status explains both endpoints must be chosen.

---

**Scenario S-006 — Add link duplicate pair**  
**Given** link `(P,F)` already exists.  
**When** the user attempts **Add link** for the same **P** and **F**.  
**Then** no second link; **error** status indicates duplicate.

---

**Scenario S-007 — Delete link**  
**Given** a selected link **L** between **P** and **F**.  
**When** the user clicks **Delete selection** or presses **Delete**/**Backspace** (not in a text field).  
**Then** **L** is removed; **P** and **F** remain; selection is **cleared**; **Delete selection** is disabled.

---

**Scenario S-008 — Delete Process cascades links**  
**Given** Process **P** with one or more incident links.  
**When** the user deletes **P**.  
**Then** **P** and **all** links with `processId === P.id` are removed; `posProcess[P.id]` removed.

---

**Scenario S-009 — Delete File cascades links**  
**Given** File **F** with incident links.  
**When** the user deletes **F**.  
**Then** **F** and **all** links with `fileId === F.id` are removed; `posFile[F.id]` removed.

---

**Scenario S-010 — Canvas click clears selection**  
**Given** a non-empty selection.  
**When** the user clicks the SVG background (not on a hit target).  
**Then** selection is **none**; inspector shows empty state; **Delete selection** disabled.

---

**Scenario S-011 — Select link inspector**  
**Given** a link **L** between **P** and **F**.  
**When** the user clicks the link’s hit target.  
**Then** selection is link **L**; inspector shows kind **Link**, link id, combined label `P.label ↔ F.label`; **Connections** section is **not** shown.

---

**Scenario S-012 — Drag updates geometry**  
**Given** a Process or File with incident links.  
**When** the user drags the node.  
**Then** its `pos` map entries change by the pointer delta in SVG space; link endpoints **follow** (§3.4); no change to diagram `id`/`label`/link list until release (data unchanged).

---

**Scenario S-013 — Backspace in text field**  
**Given** focus in “New Process label” (or any text-entry control per §9).  
**When** the user presses **Backspace**.  
**Then** **no** diagram entity is deleted; text edits normally.

---

**Scenario S-014 — Keyboard delete selection**  
**Given** focus is **not** in a text-entry control and something is selected.  
**When** the user presses **Delete** or **Backspace**.  
**Then** same outcome as **Delete selection** button (see S-007–S-009).

---

**Scenario S-015 — Cleanup only moves nodes**  
**Given** a valid diagram (passes load validation).  
**When** the user clicks **Cleanup**.  
**Then** `processes`, `files`, and `links` arrays are **byte-for-byte unchanged** in membership and fields; only `posProcess`/`posFile` may change; `userAdjusted` becomes false; status confirms data unchanged.

---

**Scenario S-016 — Cleanup rejects invalid graph**  
**Given** an impossible state is **not** required (reference app keeps data valid). If validation is exposed or fails internally:  
**When** Cleanup validation fails.  
**Then** positions must **not** update; user sees error. *(Reference: validate before applying layout.)*

---

**Scenario S-017 — Reset zoom reframes**  
**Given** the user previously zoomed with Ctrl-wheel (`userAdjusted true`).  
**When** the user clicks **Reset zoom**.  
**Then** `userAdjusted` is false; next render applies §5.2 including links in bbox; **diagram positions** unchanged.

---

**Scenario S-018 — Ctrl wheel zoom**  
**Given** pointer over the SVG.  
**When** the user holds **Ctrl** and scrolls.  
**Then** default scroll is prevented on the SVG; `userAdjusted` true; `viewBox` changes; zoom center follows pointer in SVG coordinates (§5.3).

---

**Scenario S-019 — Wheel without Ctrl**  
**Given** pointer over the SVG.  
**When** the user scrolls **without** Ctrl.  
**Then** the app **does not** require Ctrl-wheel to call `preventDefault` for zoom (browser may scroll container).

---

**Scenario S-020 — Load JSON with full layout**  
**Given** a valid v2 file where every Process and File has finite `x` and `y`.  
**When** the user loads it.  
**Then** `posProcess`/`posFile` equal those numbers; **Cleanup is not** applied to positions.

---

**Scenario S-021 — Load JSON without coordinates**  
**Given** a valid v2 file where no node has `x`/`y` keys.  
**When** the user loads it.  
**Then** positions come **only** from `rebuildBipartiteCleanup` (§7), not from file.

---

**Scenario S-022 — Load JSON failure leaves state unchanged**  
**Given** a diagram **D0** with position maps and selection **S0** is currently displayed.  
**When** the user picks a file that is invalid JSON or fails §4.3 validation **before** any successful load commits.  
**Then** `processes`, `files`, `links`, `posProcess`, `posFile`, and `selection` match **D0** / **S0**. *(Reference app: validation runs before mutating diagram state; viewport is not part of the rollback snapshot and is unchanged on validation failure.)*

---

**Scenario S-023 — Load sample**  
**When** the user clicks **Load sample**.  
**Then** the diagram matches the canonical sample content (multiple processes/files/links as in repository `sample-pipeline.json`); no coordinates in payload → layout from Cleanup.

---

**Scenario S-024 — Export round-trip positions**  
**Given** a diagram with known positions after drags or Cleanup.  
**When** the user exports JSON and reloads that file.  
**Then** every Process and File has the same `x`,`y` as exported; links preserve `id`/`processId`/`fileId`.

---

**Scenario S-025 — Export always includes coordinates**  
**Given** any diagram with at least one node.  
**When** the user exports.  
**Then** **every** Process and File object in JSON includes numeric **`x`** and **`y`**.

---

**Scenario S-026 — Reject v1 JSON**  
**Given** a file with `"version": 1` or top-level `nodes` array in v1 style.  
**When** load is attempted.  
**Then** error; prior state preserved (S-022).

---

**Scenario S-027 — Reject partition collision**  
**Given** JSON where the same `id` appears in both `processes` and `files`.  
**When** load is attempted.  
**Then** error; prior state preserved.

---

**Scenario S-028 — Reject duplicate link pair**  
**Given** JSON with two links with the same `(processId, fileId)`.  
**When** load is attempted.  
**Then** error.

---

**Scenario S-029 — Label truncation**  
**Given** a Process with a label longer than 16 characters and a File with label longer than 18.  
**When** rendered.  
**Then** SVG shows truncated forms per §9.

---

**Scenario S-030 — Link picker stability**  
**Given** user had **P** and **F** selected in pickers.  
**When** a new Process is added (picker lists refresh).  
**Then** if **P** and **F** still exist, pickers still show **P** and **F**.

---

**Scenario S-031 — Inspector lists connections**  
**Given** Process **P** linked to files **F1**, **F2**.  
**When** **P** is selected.  
**Then** inspector lists both files and cites each link id.

---

**Scenario S-032 — Startup bootstrap**  
**Given** the HTML loads `graph-geometry.js` then module `app.js`.  
**When** `MPDMGeometry` is missing.  
**Then** the app throws before running (fail fast).

---

**Scenario S-033 — Export empty diagram**  
**Given** `processes` and `files` are both empty (and `links` empty).  
**When** the user triggers **Save / Export JSON…**.  
**Then** the downloaded JSON has `"version": 2`, empty `processes`, `files`, and `links` arrays; export does not error.

---

**Scenario S-034 — Reject duplicate Process id in file**  
**Given** JSON where two entries in `processes` share the same `id`.  
**When** load is attempted.  
**Then** validation error; diagram state unchanged (S-022).

---

## 11. Reference implementation hooks

Repository tests (`npm test`) cover helpers for geometry, validation, export, and view fit; they align with this spec. Scenario **S-001–S-034** are the **human-readable acceptance layer** for a full UI rewrite.
