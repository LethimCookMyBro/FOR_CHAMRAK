# runtime_data

This folder documents the mutable JSON data used by the app in web/dev mode.

Web/dev mode writes here:

- `overrides/<table_alias>.json`
- `activity_logs.jsonl`
- `trash_items.json`

The backend always reads seed data from `chamrak_export/data/*.json` first, then applies override files without mutating the bundled source export.

The bundled seed files are intentionally empty starter tables. Any records, including local photo data for people or supplies, live in runtime JSON files on the current machine only.

Desktop mode is different:

- seed data still comes from bundled `chamrak_export/data/*.json`
- mutable files move to Electron local user data
- expected paths are:
  - `<userData>/runtime_data/overrides/*.json`
  - `<userData>/runtime_data/logs/activity_logs.jsonl`
  - `<userData>/runtime_data/trash/trash_items.json`

Do not rely on packaged app directories for runtime writes after desktop build. The desktop app has no login layer and no shared database; each machine's Electron user-data folder is the data boundary.
