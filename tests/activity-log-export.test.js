"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { ActivityLogStore } = require("../server/lib/stores/activity-log-store");

test("activity log CSV export includes every filtered row instead of silently truncating", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ltc-activity-export-"));
  const filePath = path.join(tmp, "logs", "activity_logs.jsonl");
  const store = new ActivityLogStore(filePath);

  try {
    for (let index = 0; index < 250; index += 1) {
      await store.append({
        timestamp: `2026-07-${String((index % 28) + 1).padStart(2, "0")}T08:00:00.000Z`,
        type: "data",
        action: `ACTION_${index}`,
        resource: `resource-${index}`,
        user: "tester",
        ip: "127.0.0.1",
        detail: `detail-${index}`,
        status: "ok"
      });
    }

    const csv = await store.exportCsv({});
    const lines = csv.trim().split(/\r?\n/);
    assert.equal(lines.length, 251, "250 rows plus header should be exported");
    assert.match(csv, /ACTION_0/);
    assert.match(csv, /ACTION_249/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
});
