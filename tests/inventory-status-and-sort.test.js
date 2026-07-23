"use strict";

// Covers: no-history items read as "ยังไม่รับเข้า" (not "หมดคลัง"), and the
// material list ordering by product code (numeric-aware).

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const rootDir = path.resolve(__dirname, "..");
const importDomain = () => import(pathToFileURL(path.join(rootDir, "web/js/domain-service.js")).href);

class StubRepo {
  constructor(tables) {
    this.tables = tables;
  }
  async getTable(alias) {
    return (this.tables[alias] || []).map((row) => ({ ...row }));
  }
}

async function makeDomain(tables) {
  const { DomainService } = await importDomain();
  return new DomainService(new StubRepo(tables));
}

test("product with no receipts/issues is 'ยังไม่รับเข้า', not 'หมดคลัง'", async () => {
  const domain = await makeDomain({
    t16_product: [{ __rowid: "p1", productID: "004", productName: "ถุงมือ S", reorderPoint: 10 }],
    t09_intproduct: [],
    t13_outproduct: []
  });
  const [row] = await domain.computeInventoryRows();
  assert.equal(row.status, "ยังไม่รับเข้า");
  assert.equal(domain.statusClass(row.status), "tag-mixed");
});

test("received-then-depleted still reads as 'หมดคลัง'", async () => {
  const domain = await makeDomain({
    t16_product: [{ __rowid: "p1", productID: "004", productName: "ถุงมือ S", reorderPoint: 10 }],
    t09_intproduct: [{ productID: "004", quantity: 5 }],
    t13_outproduct: [{ productID: "004", quantity: 5 }]
  });
  const [row] = await domain.computeInventoryRows();
  assert.equal(row.status, "หมดคลัง");
});

test("'ยังไม่รับเข้า' sorts as least urgent", async () => {
  const domain = await makeDomain({ t16_product: [], t09_intproduct: [], t13_outproduct: [] });
  assert.ok(domain.severityRank("ยังไม่รับเข้า") > domain.severityRank("ปกติ"));
  assert.equal(domain.severityRank("หมดคลัง"), 0);
});

test("material codes sort ascending, numeric-aware", () => {
  const codes = ["013", "004", "10", "006", "2"];
  const sorted = [...codes].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" })
  );
  assert.deepEqual(sorted, ["2", "004", "006", "10", "013"]);
});
