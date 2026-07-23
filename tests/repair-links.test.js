"use strict";

// Verifies the legacy-link repair: a code field holding a *name* is swapped to
// the entity's *code*; valid codes are left alone; unknown values are flagged.

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const rootDir = path.resolve(__dirname, "..");
const importRepair = () => import(pathToFileURL(path.join(rootDir, "scripts/repair-links.mjs")).href);

test("swaps a CM name stored in รหัสcm for the CM code", async () => {
  const { repairTables } = await importRepair();
  const cm = [{ "รหัสcm": "ศูนย์ฯชำรากcm1", "ชื่อสกุล": "นางชัชฎาพร รัตนวาร" }];
  const cg = [{ "รหัสcg": "ศูนย์ฯชำรากcg1", "รหัสcm": "นางชัชฎาพร รัตนวาร" }];
  const { report } = repairTables({ cm, cg, dependents: [] });
  assert.equal(cg[0]["รหัสcm"], "ศูนย์ฯชำรากcm1");
  assert.equal(report.cgCmFixed, 1);
});

test("normalizes น.ส. ↔ นางสาว when matching names", async () => {
  const { repairTables } = await importRepair();
  const cm = [{ "รหัสcm": "Ucm1", "ชื่อสกุล": "นางสาวพร ดี" }];
  const cg = [{ "รหัสcg": "Ucg1", "รหัสcm": "น.ส.พร ดี" }];
  repairTables({ cm, cg, dependents: [] });
  assert.equal(cg[0]["รหัสcm"], "Ucm1");
});

test("leaves a correct code untouched and flags unknown values", async () => {
  const { repairTables } = await importRepair();
  const cm = [{ "รหัสcm": "Ucm1", "ชื่อสกุล": "นางเอ บี" }];
  const cg = [
    { "รหัสcg": "Ucg1", "รหัสcm": "Ucm1" },
    { "รหัสcg": "Ucg2", "รหัสcm": "คนที่ไม่มีในระบบ" }
  ];
  const { report } = repairTables({ cm, cg, dependents: [] });
  assert.equal(cg[0]["รหัสcm"], "Ucm1");
  assert.equal(cg[1]["รหัสcm"], "คนที่ไม่มีในระบบ");
  assert.equal(report.cgCmFixed, 0);
  assert.equal(report.unresolved.length, 1);
});

test("repairs dependent รหัสcg from a CG name", async () => {
  const { repairTables } = await importRepair();
  const cg = [{ "รหัสcg": "Ucg1", "ชื่อสกุล": "นางสาวพิกุล อัมกุล" }];
  const dependents = [{ "เลขประชาชน": "x", "รหัสcg": "นางสาวพิกุล อัมกุล", "รหัสcm": "" }];
  const { report } = repairTables({ cm: [], cg, dependents });
  assert.equal(dependents[0]["รหัสcg"], "Ucg1");
  assert.equal(report.depCgFixed, 1);
});
