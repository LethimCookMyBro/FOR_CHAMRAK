"use strict";

// Regression guard for the entity add/edit dialog scroll layout.
//
// Bug: the dialog used a NESTED scroll — `.row-form-fields` had its own
// `max-height` + `overflow: auto` inside the already-scrolling `.row-form`.
// On scaled/small displays (e.g. a Windows laptop at 150% scaling) lower
// fields were trapped below an easy-to-miss inner scrollbar while the Save
// button stayed pinned outside it. Users could not reach/type some fields,
// and "Save" appeared broken because validation failed on a required field
// that was scrolled out of sight.
//
// Fix: a single scroll container (`.row-form`), no nested scroll on
// `.row-form-fields`, a sticky actions footer, and validation that scrolls
// the offending field into view.

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function ruleBody(css, selector) {
  // Grab the declaration block for an exact selector line `selector {  ... }`.
  const re = new RegExp(`(?:^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`);
  const match = css.match(re);
  assert.ok(match, `expected to find a CSS rule for ${selector}`);
  return match[1];
}

test("entity dialog fields have no nested inner scroll", async () => {
  const css = await fs.readFile(path.join(repoRoot, "web", "styles", "dialog.css"), "utf8");
  const fields = ruleBody(css, ".row-form-fields");

  assert.doesNotMatch(
    fields,
    /overflow\s*:/,
    ".row-form-fields must not declare its own overflow (single scroll container)"
  );
  assert.doesNotMatch(
    fields,
    /max-height\s*:/,
    ".row-form-fields must not cap its height (would re-introduce the trapped inner scroll)"
  );
});

test("entity dialog scrolls as one container with a sticky actions footer", async () => {
  const css = await fs.readFile(path.join(repoRoot, "web", "styles", "dialog.css"), "utf8");

  const form = ruleBody(css, ".row-form");
  assert.match(form, /overflow\s*:\s*auto/, ".row-form must be the scroll container");

  const actions = ruleBody(css, ".row-dialog-actions");
  assert.match(actions, /position\s*:\s*sticky/, ".row-dialog-actions must stay visible while fields scroll");
  assert.match(actions, /bottom\s*:\s*0/, ".row-dialog-actions must be pinned to the bottom");
});

test("validation reveals the offending field instead of failing silently", async () => {
  const source = await fs.readFile(path.join(repoRoot, "web", "js", "entity-dialog-service.js"), "utf8");

  assert.match(
    source,
    /scrollIntoView/,
    "a failing required/validated field must be scrolled into view so the user sees why Save was blocked"
  );
});

test("entity date fields use Buddhist Era controls starting at 2460", async () => {
  const source = await fs.readFile(path.join(repoRoot, "web", "js", "entity-dialog-service.js"), "utf8");
  const css = await fs.readFile(path.join(repoRoot, "web", "styles", "dialog.css"), "utf8");

  assert.match(source, /createThaiDateControl/);
  assert.match(source, /field\.type === "date"[\s\S]*createThaiDateControl/);
  assert.match(source, /field\.yearStart \|\| 2460/);
  assert.match(source, /ปี พ\.ศ\./);
  assert.match(css, /\.thai-date-control/);
});

test("composite date fields get enough grid width and shrink safely", async () => {
  const source = await fs.readFile(path.join(repoRoot, "web", "js", "entity-dialog-service.js"), "utf8");
  const dialogCss = await fs.readFile(path.join(repoRoot, "web", "styles", "dialog.css"), "utf8");
  const responsiveCss = await fs.readFile(path.join(repoRoot, "web", "styles", "responsive.css"), "utf8");

  assert.match(source, /field\.type === "date"[\s\S]*fieldClasses\.push\("date-field"\)/);

  const rowField = ruleBody(dialogCss, ".row-field");
  assert.match(rowField, /min-width\s*:\s*0/, "grid children must shrink instead of overlapping neighbors");

  const dateField = ruleBody(dialogCss, ".row-field.date-field");
  assert.match(dateField, /grid-column\s*:\s*span 2/, "three-part date controls need two grid columns on desktop");

  const dateControl = ruleBody(dialogCss, ".thai-date-control");
  assert.match(dateControl, /min-width\s*:\s*0/, "date control wrapper must shrink within its field");
  assert.match(dialogCss, /\.thai-date-control select\s*\{[\s\S]*min-width\s*:\s*0/);
  assert.match(responsiveCss, /\.row-field\.date-field\s*\{[\s\S]*grid-column\s*:\s*1\s*\/\s*-1/);
});

test("finance category dropdown splits by type and resets on type change", async () => {
  const source = await fs.readFile(path.join(repoRoot, "web", "js", "entity-dialog-service.js"), "utf8");
  const config = await fs.readFile(path.join(repoRoot, "web", "js", "config.js"), "utf8");

  // Category options come from a per-type map (income vs expense), not one shared list.
  assert.match(source, /FINANCE_CATEGORY_LABELS\s*=\s*\{\s*income:\s*FINANCE_INCOME_LABELS,\s*expense:\s*FINANCE_EXPENSE_LABELS/);
  // Changing type rebuilds the category list with the selection reset.
  assert.match(source, /typeSelect\.addEventListener\("change",[\s\S]*rebuild\(typeSelect\.value,\s*0\)/);

  // Category #2 label is the requested wording, in both income and expense lists.
  const catTwo = config.match(/แผนงานกองทุนฯ ทต\. ชำราก/g) || [];
  assert.ok(catTwo.length >= 2, "หมวดข้อ 2 must read 'แผนงานกองทุนฯ ทต. ชำราก' for income and expense");
  // Compact labels only — the old long official sentences must not widen the select.
  assert.doesNotMatch(config, /เงินสนับสนุนตามแผนงาน/);
});
