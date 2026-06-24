"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rootDir = path.resolve(__dirname, "..");

function readSource(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), "utf8");
}

test("add handlers select the saved backend row id instead of the temporary newRow id", () => {
  const source = readSource("web/js/ltc-app-action-methods.js");
  const unsafeAssignments = [...source.matchAll(/this\.state\.selected\.(\w+)\s*=\s*newRow\.__rowid/g)].map((match) => match[0]);

  assert.deepEqual(unsafeAssignments, []);
  assert.match(source, /selectSavedRow\(/);
  assert.match(source, /const savedRows = await this\.repo\.saveTable/);
});
