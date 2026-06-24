"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("entity dialog exposes local image picker fields", async () => {
  const source = await fs.readFile(path.join(repoRoot, "web", "js", "entity-dialog-service.js"), "utf8");

  assert.match(source, /field\.type === "image"/);
  assert.match(source, /accept = "image\/\*"/);
  assert.match(source, /compressImageFile/);
});

test("main tables render image thumbnails for people and supplies", async () => {
  const source = await fs.readFile(path.join(repoRoot, "web", "js", "ltc-app-render-methods.js"), "utf8");

  assert.match(source, /renderImageThumb/);
  assert.match(source, /photoDataUrl/);
  assert.match(source, /imageDataUrl/);
});
