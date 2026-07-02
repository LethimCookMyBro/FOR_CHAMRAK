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

  async deleteRows(alias, rowIds) {
    const ids = new Set(Array.isArray(rowIds) ? rowIds : []);
    const rows = (this.tables.get(alias) || []).filter((row) => !ids.has(row.__rowid));
    this.tables.set(alias, clone(rows));
    return { ok: true, deleted: ids.size };
  }

  clearTableCache() {}

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
  const checked = {
    dependents: new Set(),
    cg: new Set(),
    cm: new Set(),
    supplies: new Set(),
    supplyIssues: new Set(),
    visits: new Set(),
    finance: new Set(),
    units: new Set()
  };
  return {
    ...ltcAppActionMethods,
    repo,
    dialogs,
    domain: new DomainService(repo),
    state: {
      selected: {
        dependents: null,
        cg: null,
        cm: null,
        supplies: null,
        supplyIssues: null,
        visits: null,
        finance: null,
        units: null
      }
    },
    helpers: {
      fullNameFromDependent(row) {
        return [row?.["ชื่อ"], row?.["สกุล"]].filter(Boolean).join(" ") || row?.beneficiaryName || row?.name || "-";
      }
    },
    el: {
      visitStatusText: { textContent: "" }
    },
    getCheckedSet(key) {
      return checked[key];
    },
    clearChecked(key) {
      checked[key]?.clear();
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
        category: "5",
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
  assert.equal(products[0].reorderPoint, undefined);
  assert.equal(dependents[0].G, 1);
  assert.equal(financeRows[0].ID, 1);
  assert.equal(financeRows[0]["รายรับ5"], 100);
  assert.equal(financeRows[0]["รายรับ1"], null);

  assert.equal(app.state.selected.dependents, dependents[0].__rowid);
  assert.equal(app.state.selected.cg, cgRows[0].__rowid);
  assert.equal(app.state.selected.supplies, products[0].__rowid);
  assert.equal(app.state.selected.finance, financeRows[0].__rowid);
  assert.equal(app.renderAllCalls, 4);
});

test("dependent and supply edit/delete paths keep new fields stable", async () => {
  const dialogs = {
    async openDependentDialog() {
      return {
        citizenId: "1111111111111",
        prefix: "นาย",
        firstName: "Edited",
        lastName: "Person",
        adl: 7,
        group: "3",
        tai: "I2",
        birthDate: "1917-01-01",
        gender: "ชาย",
        address: "2",
        moo: "2",
        road: "",
        subdistrict: "ชำราก",
        district: "เมือง",
        province: "ตราด",
        unitCode: "UNIT01",
        cmCode: "CM1",
        cgCode: "CG1",
        careStart: "2026-06-25",
        careEnd: "",
        photoDataUrl: sampleImageDataUrl
      };
    },
    async openProductDialog() {
      return {
        productID: "SUP-EDIT",
        productName: "Edited supply",
        brand: "Brand",
        machineCode: "SN-EDIT",
        price: 25,
        unit: "ชิ้น",
        reorderPoint: 999,
        imageDataUrl: sampleImageDataUrl
      };
    }
  };
  const app = await createApp({
    dialogs,
    initialTables: {
      t04_dataj: [
        {
          __rowid: "dep-1",
          ID: 1,
          "เลขประชาชน": "1111111111111",
          "นาม": "นาย",
          "ชื่อ": "Old",
          "สกุล": "Person",
          ADL: 5,
          G: 1,
          TAI: "I1",
          "รหัสcm": "CM1",
          "รหัสcg": "CG1"
        }
      ],
      t16_product: [
        {
          __rowid: "product-1",
          id: 1,
          productID: "SUP-OLD",
          productName: "Old supply",
          price: 10,
          unit: "ชิ้น",
          reorderPoint: 10
        }
      ],
      t09_intproduct: [],
      t13_outproduct: []
    }
  });
  global.confirm = () => true;

  app.state.selected.dependents = "dep-1";
  await app.handleEditDependent();
  const editedDependent = app.repo.tables.get("t04_dataj")[0];
  assert.equal(editedDependent["ชื่อ"], "Edited");
  assert.equal(editedDependent.G, 3);
  assert.equal(editedDependent["วันเดือนปีเกิด"], "1917-01-01");

  app.state.selected.supplies = "product-1";
  await app.handleEditProduct();
  const editedProduct = app.repo.tables.get("t16_product")[0];
  assert.equal(editedProduct.productID, "SUP-EDIT");
  assert.equal(editedProduct.productName, "Edited supply");
  assert.equal(editedProduct.reorderPoint, 10, "editing must not overwrite hidden reorderPoint from dialog data");

  await app.handleDeleteProduct();
  assert.equal(app.repo.tables.get("t16_product").length, 0);
  assert.equal(app.state.selected.supplies, null);

  await app.handleDeleteDependent();
  assert.equal(app.repo.tables.get("t04_dataj").length, 0);
  assert.equal(app.state.selected.dependents, null);
});

test("CM and CG add/edit/delete paths keep names and links working", async () => {
  const dialogs = {
    async openCmDialog(mode) {
      return mode === "add"
        ? {
            cmCode: "CM1",
            prefix: "นางสาว",
            firstName: "Care",
            lastName: "Manager",
            unitCode: "UNIT01",
            phone: "0999999999",
            birthDate: "1917-01-01",
            address: "1",
            moo: "1",
            subdistrict: "ชำราก",
            district: "เมือง",
            province: "ตราด",
            photoDataUrl: sampleImageDataUrl
          }
        : {
            cmCode: "CM2",
            prefix: "นางสาว",
            firstName: "Care",
            lastName: "Manager Two",
            unitCode: "UNIT01",
            phone: "0888888888",
            birthDate: "1918-01-01",
            address: "2",
            moo: "2",
            subdistrict: "ชำราก",
            district: "เมือง",
            province: "ตราด",
            photoDataUrl: sampleImageDataUrl
          };
    },
    async openCgDialog(mode) {
      return mode === "add"
        ? {
            cgCode: "CG1",
            prefix: "นางสาว",
            firstName: "Care",
            lastName: "Giver",
            birthDate: "1917-01-01",
            phone: "0777777777",
            address: "1",
            moo: "1",
            subdistrict: "ชำราก",
            district: "เมือง",
            province: "ตราด",
            cmCode: "CM1",
            photoDataUrl: sampleImageDataUrl
          }
        : {
            cgCode: "CG2",
            prefix: "นางสาว",
            firstName: "Care",
            lastName: "Giver Two",
            birthDate: "1918-01-01",
            phone: "0666666666",
            address: "2",
            moo: "2",
            subdistrict: "ชำราก",
            district: "เมือง",
            province: "ตราด",
            cmCode: "CM2",
            photoDataUrl: sampleImageDataUrl
          };
    }
  };
  const app = await createApp({
    dialogs,
    initialTables: {
      t01_cg: [],
      t02_cm: [],
      t04_dataj: []
    }
  });
  global.confirm = () => true;

  await app.handleAddCm();
  await app.handleAddCg();
  assert.equal(app.repo.tables.get("t02_cm")[0]["รหัสcm"], "CM1");
  assert.match(app.repo.tables.get("t02_cm")[0]["ชื่อสกุล"], /Manager/);
  assert.equal(app.repo.tables.get("t01_cg")[0]["รหัสcm"], "CM1");

  app.state.selected.cm = app.repo.tables.get("t02_cm")[0].__rowid;
  app.state.selected.cg = app.repo.tables.get("t01_cg")[0].__rowid;
  await app.handleEditCm();
  await app.handleEditCg();
  assert.equal(app.repo.tables.get("t02_cm")[0]["รหัสcm"], "CM2");
  assert.equal(app.repo.tables.get("t01_cg")[0]["รหัสcm"], "CM2");
  assert.equal(app.repo.tables.get("t01_cg")[0]["รหัสcg"], "CG2");

  await app.handleDeleteCg();
  await app.handleDeleteCm();
  assert.equal(app.repo.tables.get("t01_cg").length, 0);
  assert.equal(app.repo.tables.get("t02_cm").length, 0);
});

test("visit, supply issue, finance, and unit add/edit/delete paths work", async () => {
  const dialogs = {
    async openVisitDialog(mode) {
      return {
        beneficiaryId: "1",
        visitDate: mode === "add" ? "2026-07-01" : "2026-07-02",
        visitorName: mode === "add" ? "Visitor One" : "Visitor Two",
        responsibleCgId: "CG1",
        responsibleCmId: "CM1",
        activityType: "home-visit",
        status: "completed",
        note: mode
      };
    },
    async openSupplyMovementDialog(mode, _product, defaults = null) {
      if (mode === "in") {
        return { typeCode: "11", date: "2026-07-01", quantity: 10, reference: "IN", note: "" };
      }
      return {
        typeCode: "11",
        date: defaults ? "2026-07-03" : "2026-07-02",
        quantity: defaults ? 4 : 3,
        ltcCode: "",
        round: "1",
        brand: "",
        machineCode: "",
        reference: defaults ? "OUT-EDIT" : "OUT",
        note: ""
      };
    },
    async openFinanceDialog(mode) {
      return mode === "add"
        ? { date: "2026-07-01", type: "income", category: "5", amount: 100, year: 2569, note: "income" }
        : { date: "2026-07-02", type: "expense", category: "5", amount: 40, year: 2569, note: "expense" };
    },
    async openUnitDialog(mode) {
      return {
        unitCode: mode === "add" ? "UNIT-A" : "UNIT-B",
        unitName: mode === "add" ? "Unit A" : "Unit B",
        addressNo: "1",
        moo: "1",
        road: "",
        subdistrict: "ชำราก",
        district: "เมือง",
        province: "ตราด",
        postcode: "23000",
        phone: "039000000"
      };
    }
  };
  const app = await createApp({
    dialogs,
    initialTables: {
      t04_dataj: [{ __rowid: "dep-1", ID: 1, "ชื่อ": "Patient", "สกุล": "One" }],
      t01_cg: [{ __rowid: "cg-1", "รหัสcg": "CG1", "ชื่อสกุล": "CG One" }],
      t02_cm: [{ __rowid: "cm-1", "รหัสcm": "CM1", "ชื่อสกุล": "CM One" }],
      t16_product: [{ __rowid: "product-1", id: 1, productID: "SUP-001", productName: "Gloves", price: 10, unit: "ชิ้น" }],
      t09_intproduct: [],
      t13_outproduct: [],
      t23_tbl_income_expense: [],
      t26_unit: [],
      t27_visits: []
    }
  });
  global.confirm = () => true;

  await app.handleAddVisit();
  assert.equal(app.repo.tables.get("t27_visits").length, 1);
  assert.equal(app.repo.tables.get("t27_visits")[0].visitorName, "Visitor One");
  app.state.selected.visits = app.repo.tables.get("t27_visits")[0].__rowid;
  await app.handleEditVisit();
  assert.equal(app.repo.tables.get("t27_visits")[0].visitorName, "Visitor Two");
  await app.handleDeleteVisit();
  assert.equal(app.repo.tables.get("t27_visits").length, 0);

  app.state.selected.supplies = "product-1";
  await app.handleSupplyIn();
  await app.handleSupplyOut();
  assert.equal(app.repo.tables.get("t09_intproduct")[0].quantity, 10);
  assert.equal(app.repo.tables.get("t13_outproduct")[0].quantity, 3);
  app.state.selected.supplyIssues = app.repo.tables.get("t13_outproduct")[0].__rowid;
  await app.handleEditSupplyIssue();
  assert.equal(app.repo.tables.get("t13_outproduct")[0].quantity, 4);
  assert.equal(app.repo.tables.get("t13_outproduct")[0].reference, "OUT-EDIT");
  await app.handleDeleteSupplyIssue();
  assert.equal(app.repo.tables.get("t13_outproduct").length, 0);

  await app.handleAddFinance();
  assert.equal(app.repo.tables.get("t23_tbl_income_expense")[0]["รายรับ5"], 100);
  app.state.selected.finance = app.repo.tables.get("t23_tbl_income_expense")[0].__rowid;
  await app.handleEditFinance();
  assert.equal(app.repo.tables.get("t23_tbl_income_expense")[0]["รายจ่าย5"], 40);
  await app.handleDeleteFinance();
  assert.equal(app.repo.tables.get("t23_tbl_income_expense").length, 0);

  await app.handleAddUnit();
  assert.equal(app.repo.tables.get("t26_unit")[0]["รหัสหน่วย"], "UNIT-A");
  app.state.selected.units = app.repo.tables.get("t26_unit")[0].__rowid;
  await app.handleEditUnit();
  assert.equal(app.repo.tables.get("t26_unit")[0]["รหัสหน่วย"], "UNIT-B");
  await app.handleDeleteUnit();
  assert.equal(app.repo.tables.get("t26_unit").length, 0);
});

test("visit add stops before opening an empty beneficiary dropdown", async () => {
  let opened = false;
  let alertMessage = "";
  const app = await createApp({
    dialogs: {
      async openVisitDialog() {
        opened = true;
        return null;
      }
    },
    initialTables: {
      t04_dataj: [],
      t01_cg: [],
      t02_cm: [],
      t27_visits: []
    }
  });
  global.alert = (message) => {
    alertMessage = String(message || "");
  };

  await app.handleAddVisit();

  assert.equal(opened, false);
  assert.match(alertMessage, /ผู้รับบริการ/);
  assert.equal(app.repo.tables.get("t27_visits").length, 0);
});
