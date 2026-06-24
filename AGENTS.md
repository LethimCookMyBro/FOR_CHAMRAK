# AGENTS.md

## Project Snapshot

This repository is the LTC Chamrak municipality app.

Current reality:

- Backend: Node.js + Express in `server/`
- Frontend: static HTML + vanilla ES modules in `web/` and `index.html`
- Source seed data: `chamrak_export/`
- Mutable runtime data: `runtime_data/`
- Storage model: JSON files only, no database server
- Build model: no bundler, no React, no TypeScript

Important: this repo is in the middle of a desktop migration. The app now targets local no-login desktop usage, with Electron-style startup and local runtime path control.

## Current Run Commands

Install:

```powershell
npm install
```

Development:

```powershell
npm run dev
```

Web-mode local run:

```powershell
npm start
```

Electron desktop run:

```powershell
npm run electron:dev
```

Windows packaging:

```powershell
npm run electron:build
```

Keep the web and desktop scripts aligned with actual runtime behavior.

## Architecture Map

### Backend

- `server/index.js`
  - thin CLI/bootstrap entry
- `server/app.js`
  - exports reusable startup helpers
  - use `createApp(...)` when wiring middleware/routes only
  - use `startServer(...)` when you need a listening HTTP server
- `server/lib/runtime-config.js`
  - builds runtime config from `.env` and optional overrides
  - defaults host binding to `127.0.0.1`
  - supports `RUNTIME_MODE` values `web` and `desktop`
- `server/lib/runtime-paths.js`
  - central resolver for source-data and runtime-data paths
- `server/lib/routes/`
  - `page-routes.js`
  - `api-routes.js`
  - `error-routes.js`
- `server/lib/stores/`
  - `table-store.js`: load/save table JSON and override files
  - `trash-store.js`: soft-delete restore/purge flow
  - `activity-log-store.js`: audit log query/export
- `server/lib/services/`
  - security audit and IP blocking

### Frontend

- `web/app.js`
  - boots `LtcApp` directly; there is no login/session gate
- `web/js/ltc-app.js`
  - main controller and shared app state
- `web/js/ltc-app-render-methods.js`
  - render layer mixed into `LtcApp`
- `web/js/ltc-app-action-methods.js`
  - action/mutation handlers mixed into `LtcApp`
- `web/js/data-repository.js`
  - frontend API access layer
  - this is the correct place for HTTP request changes
- `web/js/domain-service.js`
  - domain shaping and table-specific logic
- `web/js/entity-dialog-service.js`
  - dialog/form behavior
- `web/js/activity-log-page.js`
  - logs/trash UI
- `web/js/config.js`
  - shared frontend constants and path prefixes

### Static Pages

- `index.html`
  - main app shell

## Data Model And Persistence Rules

Treat these rules as non-negotiable unless the user explicitly asks to change storage design.

1. `chamrak_export/` is bundled source input, not the normal write target.
2. Mutable edits must go through backend APIs and land in runtime data, not by editing export files in place.
3. Do not bypass `TableStore` for table persistence changes.
4. Preserve soft-delete, trash restore, and audit logging behavior when touching delete flows.
5. Preserve alias validation. Table aliases are expected to match `^[A-Za-z0-9_]+$`.
6. Treat `__rowid` as an internal runtime/UI key, not canonical source data.

Current runtime layout in web mode:

- `runtime_data/overrides/*.json`
- `runtime_data/activity_logs.jsonl`
- `runtime_data/trash_items.json`

The new path resolver also supports desktop-style layout:

- `<runtime root>/overrides/*.json`
- `<runtime root>/logs/activity_logs.jsonl`
- `<runtime root>/trash/trash_items.json`
- `<userData>/config/*.json`

If you work on desktop migration, keep packaged seed data read-only and keep all mutable files outside the packaged app directory.

## Routing And Security Rules

- The desktop app intentionally has no login system. Do not add admin passwords, session cookies, token secrets, or login pages back unless the user explicitly changes this product requirement.
- Keep frontend and backend prefixes in sync:
  - backend config: `API_PREFIX`
  - frontend runtime config: `/public/runtime-config.js`
- Do not hardcode credentials or secrets.
- Backend now assumes loopback-only hosting by default. Do not casually widen host binding to `0.0.0.0`.
- Preserve request ID propagation and audit logging when changing request flow.
- Preserve IP spam blocking, same-origin/origin guards, JSON content-type checks, and `X-Requested-With` guards for mutating API routes.

Useful read endpoints for verification:

- `GET /api/health`
- `GET /api/storage`
- `GET /api/tables`
- `GET /api/logs`
- `GET /api/trash`

## AI Removal Status

AI is being removed from this project.

What is true right now:

- backend AI services and routes have been removed
- `index.html` no longer renders the AI menu or AI page
- `web/js/data-repository.js` no longer contains AI request helpers
- `README.md` and `.env.example` no longer require Gemini settings

What can still look stale:

- generated graph artifacts may still reference old AI nodes until graph outputs are refreshed

Do not add new AI features. If a task touches these areas, prefer continuing the removal and cleanup.

## Desktop Migration Status

There is an active migration plan at:

- `docs/superpowers/plans/2026-06-24-desktop-electron-migration.md`

Current code already supports some of that direction:

- `desktop/main.js` starts the backend internally and opens a `BrowserWindow`
- `desktop/runtime-bootstrap.js` prepares local runtime/config paths and development migration
- `server/app.js` no longer has to self-start as a side effect
- runtime config distinguishes `web` vs `desktop`
- runtime path resolution is centralized

Still missing or incomplete:

- any cross-platform packaging beyond Windows
- refreshing generated graph artifacts if the user wants them updated

If you continue the desktop work, keep the backend internal to the app window and bind it only to `127.0.0.1` or `localhost`.

## Frontend Editing Conventions

- Stay in vanilla JS and ES modules.
- Keep API calls inside `DataRepository`.
- Keep orchestration/state in `LtcApp`.
- Keep rendering in render-method modules.
- Keep table/domain transformations in `DomainService` or focused helpers.
- Reuse constants from `web/js/config.js` instead of scattering aliases or prefixes.
- Avoid introducing a build pipeline unless the user explicitly wants one.

## Backend Editing Conventions

- Keep `server/index.js` thin.
- Prefer route changes inside the existing route modules.
- Reuse helpers for path normalization, sanitization, and middleware.
- For write-path changes, verify both filesystem results and API behavior.
- When adding a new mutating action, consider whether it needs audit logging.

## Graphify Guidance

`graphify-out/` already exists in this repo.

Use it for orientation on cross-cutting questions before broad file spelunking, especially when tracing architecture or feature relationships. Treat it as a helpful map, not the source of truth over the real code.

Do not include `graphify-out/` in normal source changes unless the user explicitly asks to refresh graph artifacts.

## Verification Expectations

There is no established automated test suite in the repo right now.

For most changes, verify with a targeted smoke test:

1. Run `npm run dev`
2. Confirm `http://127.0.0.1:3000/api/health` responds
3. Confirm the app shell opens directly at `http://127.0.0.1:3000/` without a login redirect
4. Exercise the affected screen or API
5. If persistence changed, confirm writes land in runtime data and not in `chamrak_export/`
6. If delete/restore/logging changed, verify trash and activity logs too
7. If runtime-path logic changed, inspect `GET /api/storage`

If you add Electron support, also verify:

1. the app opens in an Electron window rather than an external browser
2. the backend binds only to loopback
3. desktop runtime writes land in the local user-data area
4. offline startup does not depend on remote fonts or AI services

## Practical Notes

- `graphify-out/` is generated and currently untracked.
- `docs/` currently contains the migration plan and is also untracked.
- `.gitignore` ignores `.env` and runtime write artifacts, but not every generated folder.
- Some Thai strings may look garbled in terminals with the wrong encoding. Do not mass-rewrite text just because the terminal display is ugly.
- The repo does not currently include a local `.agents/` folder. Do not assume project-local custom skills exist here.
- Prefer small, localized edits. This codebase is modular enough that most changes do not require broad rewrites.
