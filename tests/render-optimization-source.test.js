"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

async function readSource(filePath) {
  return fs.readFile(path.join(repoRoot, filePath), "utf8");
}

function methodBody(source, methodName) {
  const start = source.indexOf(`async ${methodName}()`);
  assert.notEqual(start, -1, `expected ${methodName} method`);
  const nextMethod = source.indexOf("\n  async ", start + 1);
  return source.slice(start, nextMethod === -1 ? undefined : nextMethod);
}

test("renderAll only renders overview plus the active page", async () => {
  const source = await readSource("web/js/ltc-app-render-methods.js");
  const body = methodBody(source, "renderAll");

  assert.match(body, /renderOverview\(\)/);
  assert.match(body, /renderCurrentPage\(\)/);
  assert.doesNotMatch(body, /renderActivity\(\)/);
  assert.doesNotMatch(body, /renderDependents\(\),\s*this\.renderCg\(\),\s*this\.renderCm\(\)/);
});

test("page switches lazy render the selected page", async () => {
  const source = await readSource("web/js/ltc-app.js");
  const start = source.indexOf("setPage(page)");
  const end = source.indexOf("\n  captureActiveScrollState", start);
  const body = source.slice(start, end);

  assert.match(body, /this\.renderCurrentPage\(\)\.catch\(this\.handleError\)/);
  assert.doesNotMatch(body, /page === "logs"/);
});
