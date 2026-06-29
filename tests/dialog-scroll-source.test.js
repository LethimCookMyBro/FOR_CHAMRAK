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
