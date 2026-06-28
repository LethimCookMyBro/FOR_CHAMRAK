"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rootDir = path.resolve(__dirname, "..");

test("legacy SecurityManager module is removed from the no-login desktop app", () => {
  const legacyModule = path.join(rootDir, "web", "js", "security-manager.js");

  assert.equal(fs.existsSync(legacyModule), false);
});
