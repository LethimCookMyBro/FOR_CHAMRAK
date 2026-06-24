# LTC Chamrak

LTC Chamrak is a desktop-first Electron app for the LTC Chamrak municipality workflow. It keeps the existing Express backend and vanilla JS frontend, but users open it as a Windows app window instead of opening Chrome, Edge, Firefox, or any external browser.

## Current Architecture

- `desktop/main.js`: Electron main process
- `desktop/runtime-bootstrap.js`: prepares local desktop runtime paths
- `server/`: internal Express backend
- `web/`, `index.html`: frontend
- `chamrak_export/data/*.json`: bundled read-only empty starter data
- `runtime_data/`: web/dev-mode local runtime data

There is no login system in the desktop app. The app is designed for local machine use, with safety coming from loopback-only hosting, Electron navigation blocking, request guards, JSON payload limits, alias validation, trash restore, and audit logging.

The AI Assistant has also been removed. There is no active AI page, no `/api/ai/chat`, and no Gemini dependency requirement.

The distributed app starts without prefilled people, finance, unit, or stock rows. Users add their own local records on each computer.

## Install Dependencies

```powershell
npm install
```

## Run In Web/Dev Mode

```powershell
npm run dev
```

Useful URLs:

- App: `http://127.0.0.1:3000/`
- Health: `http://127.0.0.1:3000/api/health`
- Storage info: `http://127.0.0.1:3000/api/storage`

## Run In Electron Dev Mode

```powershell
npm run electron:dev
```

What this does:

- starts the Express backend internally from Electron
- binds backend to loopback only
- opens the UI in an Electron `BrowserWindow`
- keeps runtime writes out of the packaged source tree
- does not require internet access, cloud sync, or any shared database

Development desktop migration behavior:

- if local Electron user-data runtime is still empty
- and project-root `runtime_data/` already contains local edits
- the app performs a one-time copy into the Electron user-data runtime

This copy is for development convenience only and does not overwrite existing user-data runtime content.

## Build Windows Desktop App

```powershell
npm run electron:build
```

Expected output:

- installer `.exe`
- portable `.exe`

Build artifacts are written to `dist/`. The portable `.exe` or installer can be placed in Google Drive for people to download and run locally. Each computer keeps its own data.

## Data Behavior

Bundled source data is read-only:

- `chamrak_export/data/*.json`

These bundled table files intentionally ship as empty arrays. They provide the table aliases and structure only, not sample or shared records.

Mutable local data stays per machine and does not sync:

- no cloud sync
- no shared central database
- no cross-machine runtime sharing

Photo fields for dependents, CG, CM, and medical supplies are stored inside the same local JSON records as compact image data URLs. They are not uploaded anywhere and remain in that machine's runtime data.

Desktop runtime paths:

- `<userData>/runtime_data/overrides/*.json`
- `<userData>/runtime_data/logs/activity_logs.jsonl`
- `<userData>/runtime_data/trash/trash_items.json`

Example: User A on Computer A and User B on Computer B have completely separate local runtime folders. They cannot see or edit each other's data unless someone manually copies files between machines.

## Security Notes

- backend host is restricted to `127.0.0.1` / `localhost`
- Electron blocks unexpected new windows
- Electron blocks unexpected navigation away from the local app origin
- API writes still use request guards and payload limits
- local image fields accept PNG, JPEG, and WebP data URLs only, with a size limit
- table aliases are validated before filesystem access
- edits, deletes, restores, and security scans are audit logged
- packaged desktop mode does not require Gemini keys, admin passwords, or token secrets

## Known Limitations

- Windows packaging has priority; other platforms are not configured or verified yet.
- Web/dev mode still exists for development and verification, even though the target user experience is desktop-first.
- Generated `graphify-out/` artifacts may mention old login or AI nodes until refreshed.
