"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("desktop updater exposes a safe preload API and configurable feed url", async () => {
  const preload = await fs.readFile(path.join(repoRoot, "desktop", "preload.js"), "utf8");
  const service = await fs.readFile(path.join(repoRoot, "desktop", "update-service.js"), "utf8");

  assert.match(preload, /contextBridge\.exposeInMainWorld\("ltcUpdater"/);
  assert.match(preload, /ipcRenderer\.invoke\("updates:check"\)/);
  assert.match(service, /"desktop", "update-config\.json"/);
  assert.match(service, /LTC_UPDATE_URL/);
  assert.doesNotMatch(service, /runtime_data/);
});

test("update button and release-notes dialog are present in the app shell", async () => {
  const index = await fs.readFile(path.join(repoRoot, "index.html"), "utf8");
  const controller = await fs.readFile(path.join(repoRoot, "web", "js", "update-ui.js"), "utf8");

  assert.match(index, /id="updateCheckBtn"/);
  assert.match(index, /id="updateDialog"/);
  assert.match(index, /id="updateNotes"/);
  assert.match(controller, /downloadUpdate/);
  assert.match(controller, /ติดตั้งตอนนี้|installUpdate/);
});
