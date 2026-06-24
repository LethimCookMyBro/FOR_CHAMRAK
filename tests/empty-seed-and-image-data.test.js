"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { TableStore } = require("../server/lib/stores/table-store");

const repoRoot = path.resolve(__dirname, "..");
const sourceDataDir = path.join(repoRoot, "chamrak_export", "data");

test("bundled source data ships with table aliases but no prefilled rows", async () => {
  const entries = await fs.readdir(sourceDataDir);
  const jsonFiles = entries.filter((name) => name.endsWith(".json")).sort();

  assert.ok(jsonFiles.length >= 20, "expected the app to keep bundled table files");

  for (const fileName of jsonFiles) {
    const raw = await fs.readFile(path.join(sourceDataDir, fileName), "utf8");
    const parsed = JSON.parse(raw);
    assert.ok(Array.isArray(parsed), `${fileName} should be an array`);
    assert.equal(parsed.length, 0, `${fileName} should not ship personal or operational rows`);
  }
});

test("table store accepts compact local image data urls on image fields", async () => {
  const overrideDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltc-image-ok-"));
  const store = new TableStore(sourceDataDir, overrideDir);
  const image = "data:image/png;base64,iVBORw0KGgo=";

  const result = await store.saveTable("t04_dataj", [
    {
      ID: 1,
      photoDataUrl: image
    }
  ]);
  const loaded = await store.loadTable("t04_dataj");

  await fs.rm(overrideDir, { recursive: true, force: true });

  assert.equal(result.rows, 1);
  assert.equal(loaded.rows[0].photoDataUrl, image);
});

test("table store rejects non-image data urls in image fields", async () => {
  const overrideDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltc-image-bad-"));
  const store = new TableStore(sourceDataDir, overrideDir);

  await assert.rejects(
    () =>
      store.saveTable("t04_dataj", [
        {
          ID: 1,
          photoDataUrl: "data:text/html;base64,PHNjcmlwdD4="
        }
      ]),
    /image/
  );

  await fs.rm(overrideDir, { recursive: true, force: true });
});
