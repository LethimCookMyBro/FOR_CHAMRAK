# LTC Chamrak Desktop Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the LTC Chamrak web app into a Windows-first no-login Electron desktop application that opens in its own app window, stores runtime data in local per-machine user data, and removes the AI Assistant completely.

**Architecture:** Keep the existing Express backend and static frontend, but refactor backend startup so it can run in two modes: classic web/dev mode and Electron desktop mode. In desktop mode, Electron starts the backend internally on `127.0.0.1`, serves the bundled frontend from the app package, points all mutable runtime paths to Electron `userData` instead of the packaged app directory, and does not expose login/session endpoints.

**Tech Stack:** Node.js, Express, vanilla ES modules, Electron, electron-builder, JSON file storage

---

### Task 1: Inventory Current Runtime, Path, And AI Touchpoints

**Files:**
- Inspect: `server/app.js`
- Inspect: `server/lib/runtime-config.js`
- Inspect: `server/lib/dependencies.js`
- Inspect: `server/lib/routes/api-routes.js`
- Inspect: `server/lib/routes/page-routes.js`
- Inspect: `server/lib/stores/table-store.js`
- Inspect: `server/lib/stores/trash-store.js`
- Inspect: `server/lib/stores/activity-log-store.js`
- Inspect: `web/js/ltc-app.js`
- Inspect: `web/js/data-repository.js`
- Inspect: `web/js/ai-assistant-page.js`
- Inspect: `index.html`
- Inspect: `web/styles.css`
- Inspect: `web/styles/ai-logs.css`
- Inspect: `README.md`

- [ ] Confirm backend currently reads seed data from `chamrak_export/data/*.json`
- [ ] Confirm backend currently writes runtime data under project-root `runtime_data`
- [ ] Confirm backend currently exposes `/api/ai/chat` and AI-related config/services
- [ ] Confirm frontend still renders AI menu/page and imports AI controller
- [ ] Confirm current startup path still uses `app.listen(...)` directly from `server/app.js`

### Task 2: Refactor Backend Startup Into Reusable App/Server Factories

**Files:**
- Modify: `server/app.js`
- Modify: `server/index.js`
- Modify: `server/lib/runtime-config.js`
- Create: `server/lib/runtime-paths.js`

- [ ] Introduce a central runtime/path resolver that can produce:
  - bundled/source data path
  - runtime data root
  - overrides path
  - logs path
  - trash path
  - optional config path
- [ ] Change backend config creation so it can accept mode-specific overrides
- [ ] Export reusable server startup helpers from `server/app.js` instead of only side-effect startup
- [ ] Keep CLI/web development startup working via `node server/index.js`
- [ ] Lock backend host binding to `127.0.0.1` or `localhost`, never `0.0.0.0`

### Task 3: Move Desktop Runtime Data To Electron `userData`

**Files:**
- Modify: `server/lib/runtime-config.js`
- Modify: `server/lib/dependencies.js`
- Modify: `runtime_data/README.md`
- Create: `desktop/runtime-bootstrap.js`

- [ ] Define desktop runtime layout under Electron `app.getPath("userData")`
- [ ] Use bundled `chamrak_export` as read-only seed data
- [ ] Route mutable files to local machine paths such as:
  - `<userData>/runtime_data/overrides/*.json`
  - `<userData>/runtime_data/logs/activity_logs.jsonl`
  - `<userData>/runtime_data/trash/trash_items.json`
- [ ] Create required runtime directories automatically on first desktop launch
- [ ] In Electron development mode only, support one-time migration/copy from project-root `runtime_data` into `userData` if local desktop runtime is still empty
- [ ] Never overwrite existing `userData` runtime content after first setup

### Task 4: Remove AI Assistant End-To-End

**Files:**
- Modify: `index.html`
- Modify: `web/app.js`
- Modify: `web/js/ltc-app.js`
- Modify: `web/js/data-repository.js`
- Delete or stop importing: `web/js/ai-assistant-page.js`
- Modify: `web/styles.css`
- Modify: `server/lib/dependencies.js`
- Modify: `server/lib/routes/api-routes.js`
- Modify: `server/lib/services/security-audit-service.js`
- Delete: `server/lib/services/ai/ai-assistant-service.js`
- Delete: `server/lib/services/ai/ai-request-coordinator.js`
- Delete: `server/lib/services/ai/gemini-client.js`
- Modify: `.env.example`
- Modify: `README.md`

- [ ] Remove AI nav item and AI page markup from `index.html`
- [ ] Remove AI controller wiring from `LtcApp`
- [ ] Remove AI request helpers from `DataRepository`
- [ ] Remove AI CSS import and dead AI styles
- [ ] Remove `/api/ai/chat` route and AI dependency wiring from backend
- [ ] Remove Gemini and AI queue settings from config/docs/examples
- [ ] Search for leftover strings:
  - `AI`
  - `Gemini`
  - `GEMINI`
  - `/api/ai`
  - `ai-assistant`
  - `AI Assistant`

### Task 5: Add Electron Desktop Shell

**Files:**
- Create: `desktop/main.js`
- Modify: `package.json`
- Create or update: `desktop/preload.js` only if needed

- [ ] Add Electron main process entry
- [ ] Start Express internally in Electron, wait for readiness, and load the app in a `BrowserWindow`
- [ ] Use a hidden local URL like `http://127.0.0.1:<port>/` only inside Electron
- [ ] Prevent external browser launch and deny unexpected navigation/window-open behavior
- [ ] Disable DevTools in packaged builds
- [ ] Ensure backend shuts down cleanly when the app exits

### Task 6: Make Offline Desktop Behavior Honest

**Files:**
- Modify: `index.html`
- Modify: `web/styles/base.css`

- [ ] Remove external Google Fonts requests from HTML
- [ ] Use local-friendly font stacks and existing CSS fallbacks
- [ ] Keep UI behavior unchanged as much as practical without network fonts

### Task 7: Add Packaging For Windows

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Optionally create: `build/` assets only if packaging requires them

- [ ] Add scripts:
  - `npm run dev`
  - `npm run electron:dev`
  - `npm run electron:build`
- [ ] Add Electron and electron-builder dependencies
- [ ] Configure Windows packaging targets for installer and/or portable output
- [ ] Include required app files:
  - `server/**`
  - `web/**`
  - `index.html`
  - `chamrak_export/**`
- [ ] Exclude non-runtime artifacts such as:
  - `graphify-out/**`
  - local runtime data
  - secrets
  - dev-only outputs

### Task 8: Update Documentation And Operator Guidance

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `runtime_data/README.md`

- [ ] Rewrite README around desktop-first behavior with no AI assistant
- [ ] Document web/dev mode and desktop/dev mode separately
- [ ] Document build output expectations for Windows
- [ ] Document local-data behavior and per-machine isolation
- [ ] Document that desktop use is no-login and protected by local loopback/runtime isolation
- [ ] Update agent notes so future edits respect desktop runtime paths and no-AI architecture

### Task 9: Verify End-To-End Behavior

**Files:**
- Verify runtime behavior from the modified workspace

- [ ] Run: `npm install`
- [ ] Run: `npm run electron:dev`
- [ ] Confirm the app opens in an Electron window, not Chrome/Edge/Firefox
- [ ] Confirm backend binds only to local loopback
- [ ] Confirm dashboard opens directly without login and CRUD/trash/logs/CSV flows still work
- [ ] Confirm runtime writes land under Electron `userData`
- [ ] Confirm offline startup does not depend on Google Fonts or Gemini keys
- [ ] Run project-wide search to confirm AI removal
- [ ] Run: `npm run electron:build`
- [ ] Confirm build artifacts are generated for Windows packaging

## Coverage Check

- Desktop app window: covered by Tasks 2, 5, 9
- Background backend: covered by Tasks 2, 5
- Localhost-only binding: covered by Tasks 2, 9
- Per-machine local data only: covered by Tasks 3, 8, 9
- No-login desktop use: covered by Tasks 5, 8, 9
- No packaged-directory runtime writes: covered by Tasks 3, 9
- AI Assistant removal: covered by Task 4
- Offline behavior: covered by Task 6 and Task 9
- Windows packaging: covered by Task 7 and Task 9
- Preserve existing CRUD/dashboard behavior: covered by Tasks 2, 3, 9

## Notes

- There is no established automated test suite in this repo, so verification will rely on startup/build checks and targeted functional smoke testing.
- The current repo already uses modular backend/frontend files, so implementation should prefer localized refactors instead of broad rewrites.
