"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const rootDir = path.resolve(__dirname, "..");

async function importModule(relativePath) {
  return import(`${pathToFileURL(path.join(rootDir, relativePath)).href}?test=${Date.now()}`);
}

test("todayDateInput formats the local calendar date instead of UTC", async () => {
  const { Format } = await importModule("web/js/utils.js");
  const RealDate = global.Date;

  global.Date = class {
    getFullYear() {
      return 2026;
    }

    getMonth() {
      return 0;
    }

    getDate() {
      return 5;
    }
  };

  try {
    assert.equal(Format.todayDateInput(), "2026-01-05");
  } finally {
    global.Date = RealDate;
  }
});
