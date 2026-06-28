"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const rootDir = path.resolve(__dirname, "..");

async function importModule(relativePath) {
  return import(pathToFileURL(path.join(rootDir, relativePath)).href);
}

class CountingRepo {
  constructor(tables) {
    this.tables = tables;
    this.calls = new Map();
  }

  async getTable(alias) {
    this.calls.set(alias, (this.calls.get(alias) || 0) + 1);
    return this.tables[alias].map((row) => ({ ...row }));
  }
}

function createDeferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

class DeferredRepo {
  constructor() {
    this.pending = null;
    this.tables = {
      t16_product: [],
      t09_intproduct: [],
      t13_outproduct: []
    };
  }

  beginDeferredRead() {
    this.pending = {
      t16_product: createDeferred(),
      t09_intproduct: createDeferred(),
      t13_outproduct: createDeferred()
    };
  }

  resolveDeferredRead(tables) {
    for (const [alias, rows] of Object.entries(tables)) {
      this.pending[alias].resolve(rows.map((row) => ({ ...row })));
    }
    this.pending = null;
  }

  async getTable(alias) {
    if (this.pending?.[alias]) return this.pending[alias].promise;
    return this.tables[alias].map((row) => ({ ...row }));
  }
}

test("inventory rows are cached until explicitly invalidated", async () => {
  const { DomainService } = await importModule("web/js/domain-service.js");
  const repo = new CountingRepo({
    t16_product: [{ __rowid: "p1", productID: "P1", productName: "Gloves", price: 2, unit: "box" }],
    t09_intproduct: [{ productID: "P1", quantity: 10 }],
    t13_outproduct: [{ productID: "P1", quantity: 3 }]
  });
  const domain = new DomainService(repo);

  const first = await domain.computeInventoryRows();
  const second = await domain.computeInventoryRows();

  assert.equal(first, second);
  assert.equal(repo.calls.get("t16_product"), 1);
  assert.equal(repo.calls.get("t09_intproduct"), 1);
  assert.equal(repo.calls.get("t13_outproduct"), 1);

  domain.clearInventoryCache();
  const third = await domain.computeInventoryRows();

  assert.notEqual(third, first);
  assert.equal(repo.calls.get("t16_product"), 2);
});

test("inventory cache ignores stale builds that finish after invalidation", async () => {
  const { DomainService } = await importModule("web/js/domain-service.js");
  const repo = new DeferredRepo();
  const domain = new DomainService(repo);

  repo.beginDeferredRead();
  const staleBuild = domain.computeInventoryRows();
  domain.clearInventoryCache();

  repo.resolveDeferredRead({
    t16_product: [{ __rowid: "old-row", productID: "P1", productName: "Old", price: 1, unit: "box" }],
    t09_intproduct: [{ productID: "P1", quantity: 10 }],
    t13_outproduct: []
  });

  const staleRows = await staleBuild;
  assert.equal(staleRows[0].productName, "Old");

  repo.tables.t16_product = [{ __rowid: "new-row", productID: "P1", productName: "New", price: 1, unit: "box" }];
  repo.tables.t09_intproduct = [{ productID: "P1", quantity: 7 }];
  repo.tables.t13_outproduct = [];

  const nextRows = await domain.computeInventoryRows();
  assert.equal(nextRows[0].productName, "New");
  assert.notEqual(nextRows, staleRows);
});
