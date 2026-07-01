"use strict";

// The finance "หมวด" dropdown must be per-type: income and expense get their own
// category list, an unchosen type shows a "เลือกประเภทก่อน" placeholder, and
// category values stay 1-5 (positional storage, display-only relabel).

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const rootDir = path.resolve(__dirname, "..");
const importModule = (rel) => import(pathToFileURL(path.join(rootDir, rel)).href);

test("finance category view splits income vs expense with placeholder before type", async () => {
  const { financeCategoryView } = await importModule("web/js/entity-dialog-service.js");

  const none = financeCategoryView("");
  assert.equal(none.disabled, true);
  assert.deepEqual(none.options.map((o) => o.text), ["เลือกประเภทก่อน"]);

  const income = financeCategoryView("income");
  assert.equal(income.disabled, false);
  assert.equal(income.label, "หมวดรายรับ");
  assert.equal(income.options[0].text, "เลือกหมวด");
  assert.equal(income.options.length, 6, "placeholder + 5 categories");
  assert.equal(income.options[1].text, "1. แผนงาน LTC / CM");
  assert.equal(income.options[2].text, "2. แผนงานกองทุนฯ ทต. ชำราก");

  const expense = financeCategoryView("expense");
  assert.equal(expense.label, "หมวดรายจ่าย");
  assert.equal(expense.options[1].text, "1. ค่าตอบแทน CG / CM");
  assert.equal(expense.options[2].text, "2. แผนงานกองทุนฯ ทต. ชำราก");

  // Values are positional 1-5 for both types (no schema/id change).
  assert.deepEqual(income.options.slice(1).map((o) => o.value), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(expense.options.slice(1).map((o) => o.value), ["1", "2", "3", "4", "5"]);
  // Lists are genuinely different per type (this was the reported confusion).
  assert.notEqual(income.options[1].text, expense.options[1].text);
});
