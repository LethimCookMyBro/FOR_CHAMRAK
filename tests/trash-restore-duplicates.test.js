"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const rootDir = path.resolve(__dirname, "..");
const { TableStore } = require(path.join(rootDir, "server/lib/stores/table-store"));
const { TrashStore } = require(path.join(rootDir, "server/lib/stores/trash-store"));

const ALIAS = "t27_visits";
const ACTOR = { username: "tester", ip: "127.0.0.1" };

async function makeStores() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ltc-trash-test-"));
  const sourceDir = path.join(rootDir, "chamrak_export", "data");
  const overrideDir = path.join(tmp, "overrides");
  const trashFile = path.join(tmp, "trash", "trash_items.json");
  const tableStore = new TableStore(sourceDir, overrideDir);
  const trashStore = new TrashStore(trashFile, 30, tableStore);
  return { tmp, tableStore, trashStore };
}

test("restoring identical rows recovers every deleted copy, not just one", async () => {
  const { tmp, tableStore, trashStore } = await makeStores();
  try {
    const dup = { "บันทึก": "เยี่ยมบ้านซ้ำ", "วันที่": "2026-06-28" };

    // Add two byte-for-byte identical rows (no unique key -> identity is a hash).
    await tableStore.saveTable(ALIAS, [{ ...dup }, { ...dup }]);

    const loaded = await tableStore.loadTable(ALIAS);
    const rowIds = loaded.rows.map((row) => row.__rowid);
    assert.equal(rowIds.length, 2, "both duplicates should be stored");
    assert.equal(new Set(rowIds).size, 2, "each duplicate gets a distinct __rowid");

    // Soft-delete both copies into the trash.
    const del = await tableStore.deleteRows(ALIAS, rowIds, trashStore, ACTOR);
    assert.equal(del.deleted, 2);
    assert.equal(del.trashSaved, 2);

    const trash = await trashStore.list({ alias: ALIAS });
    const trashIds = trash.items.map((item) => item.trashId);
    assert.equal(trashIds.length, 2, "two trash records for two deleted copies");

    // Restore both. The bug collapsed identical rows to a single restored copy.
    const result = await trashStore.restore(trashIds, ACTOR);
    assert.equal(result.restored, 2, "both copies must be restored");
    assert.equal(result.skipped, 0);

    const after = await tableStore.loadTable(ALIAS);
    const recovered = after.rows.filter((row) => row["บันทึก"] === "เยี่ยมบ้านซ้ำ");
    assert.equal(recovered.length, 2, "table must end with both identical rows back");
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
});

test("restoring the same trash record twice does not duplicate the row", async () => {
  const { tmp, tableStore, trashStore } = await makeStores();
  try {
    await tableStore.saveTable(ALIAS, [{ "บันทึก": "เยี่ยมเดี่ยว", "วันที่": "2026-06-28" }]);
    const loaded = await tableStore.loadTable(ALIAS);
    const rowId = loaded.rows[0].__rowid;

    await tableStore.deleteRows(ALIAS, [rowId], trashStore, ACTOR);
    const trash = await trashStore.list({ alias: ALIAS });
    const trashId = trash.items[0].trashId;

    const first = await trashStore.restore([trashId], ACTOR);
    assert.equal(first.restored, 1);

    const second = await trashStore.restore([trashId], ACTOR);
    assert.equal(second.restored, 0, "an already-restored record is not restored again");
    assert.equal(second.skipped, 1);

    const after = await tableStore.loadTable(ALIAS);
    const recovered = after.rows.filter((row) => row["บันทึก"] === "เยี่ยมเดี่ยว");
    assert.equal(recovered.length, 1, "double restore must not create a duplicate");
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
});
