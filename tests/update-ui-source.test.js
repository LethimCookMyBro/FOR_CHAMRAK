"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function createButtonMock() {
  const classes = new Set();
  return {
    hidden: true,
    listeners: {},
    classList: {
      contains: (name) => classes.has(name),
      toggle: (name, enabled) => {
        if (enabled) {
          classes.add(name);
        } else {
          classes.delete(name);
        }
      }
    },
    addEventListener(event, handler) {
      this.listeners[event] = handler;
    }
  };
}

function createTextMock() {
  return {
    textContent: "",
    style: {},
    hidden: false,
    replaceChildren() {},
    append() {},
    addEventListener() {}
  };
}

async function loadUpdateController() {
  const modulePath = pathToFileURL(path.join(repoRoot, "web", "js", "update-ui.js")).href;
  return import(`${modulePath}?test=${Date.now()}`);
}

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

test("update button stays hidden until an update is actually available", async () => {
  const { UpdateController } = await loadUpdateController();
  const button = createButtonMock();
  const api = {
    getState: async () => ({ enabled: true, status: "idle", available: false, downloaded: false }),
    onEvent: () => () => {},
    checkForUpdates: async () => ({ enabled: true, status: "not-available", available: false, downloaded: false })
  };

  global.window = { ltcUpdater: api };
  global.document = {
    createElement: () => createTextMock()
  };
  const controller = new UpdateController({
    updateButton: button,
    updateDialog: { open: false, showModal() {} },
    updateDialogTitle: createTextMock(),
    updateStatusText: createTextMock(),
    updateVersionText: createTextMock(),
    updateProgressBar: createTextMock(),
    updateProgressText: createTextMock(),
    updateNotes: createTextMock(),
    updateInstallBtn: createTextMock(),
    updateCloseBtn: createTextMock()
  });

  controller.init();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(button.hidden, true);

  controller.render({ enabled: true, status: "available", available: true, downloaded: false });
  assert.equal(button.hidden, false);
});
