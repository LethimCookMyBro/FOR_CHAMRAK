"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

async function readSource(filePath) {
  return fs.readFile(path.join(repoRoot, filePath), "utf8");
}

test("search inputs debounce table renders instead of rendering on every keystroke", async () => {
  const source = await readSource("web/js/ltc-app.js");

  assert.match(source, /scheduleRender\(key, render, delay = 120\)/);
  assert.match(source, /this\.scheduleRender\("dependents"/);
  assert.match(source, /this\.scheduleRender\("cg"/);
  assert.match(source, /this\.scheduleRender\("supplyIssues"/);
});

test("mutating action wrapper invalidates derived inventory cache before rerendering", async () => {
  const source = await readSource("web/js/ltc-app-action-methods.js");

  assert.match(source, /this\.domain\.clearInventoryCache\(\);[\s\S]*await this\.renderAll\(\)/);
});

test("shared checkbox renderer keeps the Thai screen-reader label readable", async () => {
  const source = await readSource("web/js/render-helpers.js");

  assert.match(source, /aria-label="เลือกแถว"/);
  assert.doesNotMatch(source, /aria-label="[^"]*[€\u0081\u2013]/);
});
