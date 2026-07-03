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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

test("overlapping restore and delete on the same alias do not deadlock", async () => {
  const { tmp, tableStore, trashStore } = await makeStores();
  try {
    await tableStore.saveTable(ALIAS, [
      { id: "restore-me", note: "restore me", visitDate: "2026-07-03" },
      { id: "delete-me", note: "delete me", visitDate: "2026-07-03" }
    ]);

    const seeded = await tableStore.loadTable(ALIAS);
    const restoreRow = seeded.rows.find((row) => row.id === "restore-me");
    const deleteRow = seeded.rows.find((row) => row.id === "delete-me");
    assert.ok(restoreRow && deleteRow, "seed rows missing");

    await tableStore.deleteRows(ALIAS, [restoreRow.__rowid], trashStore, ACTOR);
    const trash = await trashStore.list({ alias: ALIAS });
    const trashId = trash.items[0]?.trashId;
    assert.ok(trashId, "expected one trash record to restore");

    let hitRestoreSave = null;
    const hitRestoreSavePromise = new Promise((resolve) => {
      hitRestoreSave = resolve;
    });
    let allowRestoreSave = null;
    const allowRestoreSavePromise = new Promise((resolve) => {
      allowRestoreSave = resolve;
    });
    let hitDeleteTrash = null;
    const hitDeleteTrashPromise = new Promise((resolve) => {
      hitDeleteTrash = resolve;
    });

    const originalSaveTable = tableStore.saveTable.bind(tableStore);
    tableStore.saveTable = async (...args) => {
      hitRestoreSave();
      await allowRestoreSavePromise;
      return originalSaveTable(...args);
    };

    const originalAddDeletedRows = trashStore.addDeletedRows.bind(trashStore);
    trashStore.addDeletedRows = async (...args) => {
      hitDeleteTrash();
      return originalAddDeletedRows(...args);
    };

    const restorePromise = trashStore.restore([trashId], ACTOR);
    await hitRestoreSavePromise;

    const deletePromise = tableStore.deleteRows(ALIAS, [deleteRow.__rowid], trashStore, ACTOR);
    await hitDeleteTrashPromise;
    allowRestoreSave();

    const outcome = await Promise.race([
      Promise.all([restorePromise, deletePromise]).then((value) => ({ kind: "settled", value })),
      delay(750).then(() => ({ kind: "timeout" }))
    ]);

    assert.notEqual(outcome.kind, "timeout", "restore/delete overlap should finish instead of deadlocking");

    const [restoreResult, deleteResult] = outcome.value;
    assert.equal(restoreResult.restored, 1);
    assert.equal(deleteResult.deleted, 1);

    const after = await tableStore.loadTable(ALIAS);
    assert.deepEqual(
      after.rows.map((row) => row.id).sort(),
      ["restore-me"]
    );

    const pendingTrash = await trashStore.list({ alias: ALIAS, includeRestored: false });
    assert.equal(pendingTrash.count, 1, "only the newly deleted row should remain pending in trash");
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
});

test("restore persists completed aliases before a later alias fails", async () => {
  const { tmp, tableStore, trashStore } = await makeStores();
  try {
    const secondAlias = "t23_tbl_income_expense";
    const aliases = [ALIAS, secondAlias];

    for (const [index, alias] of aliases.entries()) {
      await tableStore.saveTable(alias, [{ id: `row-${index}`, note: alias, visitDate: "2026-07-03" }]);
      const loaded = await tableStore.loadTable(alias);
      await tableStore.deleteRows(alias, [loaded.rows[0].__rowid], trashStore, ACTOR);
    }

    const trash = await trashStore.list({ includeRestored: false });
    const trashIds = trash.items.map((item) => item.trashId);
    assert.equal(trashIds.length, 2, "expected one pending trash record per alias");

    const originalSaveTable = tableStore.saveTable.bind(tableStore);
    let saveCallCount = 0;
    tableStore.saveTable = async (...args) => {
      saveCallCount += 1;
      if (saveCallCount === 2) {
        const error = new Error("forced second-alias failure");
        error.code = "FORCED_SAVE_FAILURE";
        throw error;
      }
      return originalSaveTable(...args);
    };

    await assert.rejects(() => trashStore.restore(trashIds, ACTOR), /forced second-alias failure/);

    tableStore.saveTable = originalSaveTable;
    const retry = await trashStore.restore(trashIds, ACTOR);
    assert.equal(retry.restored, 1, "retry should restore only the alias that failed last time");
    assert.equal(retry.skipped, 1, "the alias restored before the failure must already be marked restored");

    const firstAliasRows = await tableStore.loadTable(ALIAS);
    const secondAliasRows = await tableStore.loadTable(secondAlias);
    assert.equal(firstAliasRows.rows.length, 1, "first alias must not be duplicated on retry");
    assert.equal(secondAliasRows.rows.length, 1, "second alias should be restored on retry");
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
});
