"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

async function loadDialogService() {
  const modulePath = pathToFileURL(path.join(repoRoot, "web", "js", "entity-dialog-service.js")).href;
  const module = await import(`${modulePath}?t=${Date.now()}`);
  return module.EntityDialogService;
}

function fakeService(DialogService, tables) {
  global.Format = {
    normalizeFemalePrefix: (value) => value,
    expandFemalePrefixInText: (value) => value
  };
  global.NameUtils = {
    parse: () => ({ prefix: "", firstName: "", lastName: "" })
  };

  const repo = {
    async getTable(alias) {
      return tables[alias] || [];
    }
  };
  const service = new DialogService({}, repo, { getTaiGroup: () => 1 }, { inferGenderFromPrefix: () => "ชาย" });
  let captured = null;
  service.openEntityDialog = async (config) => {
    captured = config;
    return null;
  };
  return { service, captured: () => captured };
}

function field(config, name) {
  return config.fields.find((item) => item.name === name);
}

test("dependent dialog lets users type unit, CM, and CG codes when lookup tables are empty", async () => {
  const EntityDialogService = await loadDialogService();
  const { service, captured } = fakeService(EntityDialogService, {
    t26_unit: [],
    t02_cm: [],
    t01_cg: []
  });

  await service.openDependentDialog("add");
  const config = captured();

  assert.equal(field(config, "unitCode").type, "text");
  assert.equal(field(config, "cmCode").type, "text");
  assert.equal(field(config, "cgCode").type, "text");
});

test("dependent dialog keeps lookup dropdowns when options exist", async () => {
  const EntityDialogService = await loadDialogService();
  const { service, captured } = fakeService(EntityDialogService, {
    t26_unit: [{ "รหัสหน่วย": "U1", "หน่วย": "Unit One" }],
    t02_cm: [{ "รหัสcm": "CM1", "ชื่อสกุล": "CM One" }],
    t01_cg: [{ "รหัสcg": "CG1", "ชื่อสกุล": "CG One" }]
  });

  await service.openDependentDialog("add");
  const config = captured();

  assert.equal(field(config, "unitCode").type, "select");
  assert.equal(field(config, "cmCode").type, "select");
  assert.equal(field(config, "cgCode").type, "select");
});

test("CM and CG dialogs let users type linked codes when lookup tables are empty", async () => {
  const EntityDialogService = await loadDialogService();
  const { service, captured } = fakeService(EntityDialogService, {
    t26_unit: [],
    t02_cm: []
  });

  await service.openCmDialog("add");
  assert.equal(field(captured(), "unitCode").type, "text");

  await service.openCgDialog("add");
  assert.equal(field(captured(), "cmCode").type, "text");
});
