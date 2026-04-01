# Mini Pipeline Diagram Maker

Single-page, **browser-only** tool: **Processes** (circles) and **Files** (rectangles) in a **bipartite** graph — links only connect **Process ↔ File**. Lines follow shapes while you **drag**. **Cleanup** recomputes positions with a **layered, left-to-right** layout from link connectivity; it does **not** change Processes, Files, or links. **Reset zoom** fits the diagram in the viewport. No execution, login, database, or cloud.

**Full description (recreate the app from these):**

- **[SPEC.md](SPEC.md)** — Canonical specification: data model, coordinates, viewport, Cleanup algorithm, validation, JSON v2, interactions.
- **[DESIGN.md](DESIGN.md)** — Design: UI structure, visual language, technology, code map.

## Run locally

```bash
cd mini-pipeline
python3 -m http.server 8080
```

Open `http://localhost:8080`. The app uses **ES modules** (`app.js` imports `.mjs` helpers); use a static server, not only `file://`, for reliable loading.

## Automated checks

```bash
cd mini-pipeline
npm test
```

Tests use **`node --test`** only — no separate build step and **no external services**. Optional manual checklist: `tests/browser-smoke.html` in a browser.
