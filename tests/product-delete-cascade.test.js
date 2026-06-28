"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const rootDir = path.resolve(__dirname, "..");

async function importModule(relativePath) {
  return import(pathToFileURL(path.join(rootDir, relativePath)).href);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class CascadeRepo {
  constructor() {
    this.tables = new Map([
      [
        "t16_product",
        [{ __rowid: "product-row", productID: "P-001", productName: "Gloves" }]
      ],
      ["t09_intproduct", [{ __rowid: "in-row", productID: "P-001", quantity: 10 }]],
      ["t13_outproduct", [{ __rowid: "out-row", productID: "P-001", quantity: 2 }]]
    ]);
    this.deleteOrder = [];
  }

  async getTable(alias) {
    return clone(this.tables.get(alias) || []);
  }

  async cloneTable(alias) {
    return this.getTable(alias);
  }

  async deleteRows(alias, rowIds) {
    this.deleteOrder.push(alias);
    const ids = new Set(rowIds);
    const nextRows = (this.tables.get(alias) || []).filter((row) => !ids.has(row.__rowid));
    this.tables.set(alias, nextRows);
    return { ok: true, deleted: rowIds.length };
  }

  clearTableCache() {}
}

test("product deletion removes movement rows before the product row", async () => {
  const { ltcAppActionMethods } = await importModule("web/js/ltc-app-action-methods.js");
  const repo = new CascadeRepo();
  const originalConfirm = global.confirm;
  global.confirm = () => true;

  const app = {
    ...ltcAppActionMethods,
    repo,
    domain: {
      clearInventoryCache() {}
    },
    state: {
      selected: {
        supplies: "product-row"
      },
      checked: {
        supplies: new Set()
      }
    },
    getCheckedSet(key) {
      return this.state.checked[key];
    },
    async renderAll() {}
  };

  try {
    await app.handleDeleteProduct();
  } finally {
    global.confirm = originalConfirm;
  }

  assert.deepEqual(repo.deleteOrder, ["t09_intproduct", "t13_outproduct", "t16_product"]);
});
