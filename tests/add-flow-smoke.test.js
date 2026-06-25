"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const rootDir = path.resolve(__dirname, "..");
const sampleImageDataUrl = "data:image/png;base64,iVBORw0KGgo=";

async function importModule(relativePath) {
  return import(pathToFileURL(path.join(rootDir, relativePath)).href);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class FakeRepo {
  constructor(initialTables = {}) {
    this.tables = new Map(Object.entries(initialTables).map(([alias, rows]) => [alias, clone(rows)]));
    this.rowCounter = 1;
  }

  async cloneTable(alias) {
    return clone(this.tables.get(alias) || []);
  }

  async getTable(alias) {
    return this.cloneTable(alias);
  }

  async saveTable(alias, rows) {
    const savedRows = rows.map((row) => ({ ...row, __rowid: row.__rowid || this.createRowId(alias) }));
    this.tables.set(alias, clone(savedRows));
    return clone(savedRows);
  }

  createRowId(alias) {
    return `${alias}:row:${this.rowCounter++}`;
  }

  getNextNumeric(rows, field) {
    const max = rows.reduce((highest, row) => Math.max(highest, Number(row[field]) || 0), 0);
    return max + 1;
  }
}

async function createApp({ dialogs, initialTables = {} }) {
  const [{ ltcAppActionMethods }, { DomainService }] = await Promise.all([
    importModule("web/js/ltc-app-action-methods.js"),
    importModule("web/js/domain-service.js")
  ]);
  const repo = new FakeRepo(initialTables);
  return {
    ...ltcAppActionMethods,
    repo,
    dialogs,
    domain: new DomainService(repo),
    state: {
      selected: {
        dependents: null,
        cg: null,
        supplies: null,
        finance: null
      }
    },
    renderAllCalls: 0,
    async renderAll() {
      this.renderAllCalls += 1;
    }
  };
}

test("dependent, CG, supply, and finance add handlers save new rows and select saved rows", async () => {
  const dialogs = {
    async openDependentDialog() {
      return {
        citizenId: "1111111111111",
        prefix: "นาย",
        firstName: "Test",
        lastName: "Person",
        adl: 5,
        tai: "I1",
        birthDate: "2026-06-25",
        gender: "ชาย",
        address: "1",
        moo: "1",
        road: "",
        subdistrict: "ชำราก",
        district: "เมือง",
        province: "ตราด",
        unitCode: "UNIT01",
        cmCode: "UNIT01cm1",
        cgCode: "UNIT01cg1",
        careStart: "2026-06-25",
        careEnd: "",
        photoDataUrl: sampleImageDataUrl
      };
    },
    async openCgDialog() {
      return {
        cgCode: "",
        prefix: "นางสาว",
        firstName: "Care",
        lastName: "Giver",
        birthDate: "2026-06-25",
        phone: "0999999999",
        address: "1",
        moo: "1",
        subdistrict: "ชำราก",
        district: "เมือง",
        province: "ตราด",
        cmCode: "UNIT01cm1",
        photoDataUrl: sampleImageDataUrl
      };
    },
    async openProductDialog() {
      return {
        productID: "SUP-001",
        productName: "Gloves",
        brand: "",
        machineCode: "SN-001",
        price: 10,
        unit: "ชิ้น",
        reorderPoint: 10,
        imageDataUrl: sampleImageDataUrl
      };
    },
    async openFinanceDialog() {
      return {
        date: "2026-06-25",
        type: "income",
        category: "1",
        amount: 100,
        year: 2569,
        note: "smoke test"
      };
    }
  };
  const app = await createApp({
    dialogs,
    initialTables: {
      t01_cg: [],
      t04_dataj: [],
      t16_product: [],
      t23_tbl_income_expense: []
    }
  });

  await app.handleAddDependent();
  await app.handleAddCg();
  await app.handleAddProduct();
  await app.handleAddFinance();

  const dependents = app.repo.tables.get("t04_dataj");
  const cgRows = app.repo.tables.get("t01_cg");
  const products = app.repo.tables.get("t16_product");
  const financeRows = app.repo.tables.get("t23_tbl_income_expense");

  assert.equal(dependents.length, 1);
  assert.equal(cgRows.length, 1);
  assert.equal(products.length, 1);
  assert.equal(financeRows.length, 1);

  assert.equal(dependents[0].photoDataUrl, sampleImageDataUrl);
  assert.equal(cgRows[0].photoDataUrl, sampleImageDataUrl);
  assert.equal(products[0].imageDataUrl, sampleImageDataUrl);
  assert.equal(financeRows[0].ID, 1);

  assert.equal(app.state.selected.dependents, dependents[0].__rowid);
  assert.equal(app.state.selected.cg, cgRows[0].__rowid);
  assert.equal(app.state.selected.supplies, products[0].__rowid);
  assert.equal(app.state.selected.finance, financeRows[0].__rowid);
  assert.equal(app.renderAllCalls, 4);
});
