# Archive: final pipe diagram app

Snapshot label: **final pipe diagram app**

This folder documents the frozen deliverable for **Mini Pipeline Diagram Maker** (bipartite Process ↔ File editor, single-page local app).

## Contents in the zip

The zip `final-pipe-diagram-app.zip` in this folder includes the full application source and specification, excluding `.git` and the `archive/` directory (so unpacking yields a clean project root):

- Shell: `index.html`, `styles.css`, `app.js`, `graph-geometry.js`
- Modules: `bipartite-rules.mjs`, `export-v2.mjs`, `view-fit.mjs`
- Spec & design: `SPEC.md`, `DESIGN.md`, `README.md`
- Sample: `sample-pipeline.json`
- Tooling: `package.json`, `.gitignore`, `tests/`

## Run

Serve the project root over HTTP (ES modules), then open `index.html`. Example:

```bash
npx --yes serve .
```

Tests: `npm test`

## Authority

Behavior and acceptance tests: **`SPEC.md`**. Architecture and UI structure: **`DESIGN.md`**.
