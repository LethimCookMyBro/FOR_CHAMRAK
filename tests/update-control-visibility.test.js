"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function createElementMock(extra = {}) {
  const classes = new Set();
  const attributes = {};
  return {
    hidden: true,
    attributes,
    listeners: {},
    title: "",
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
      contains: (name) => classes.has(name)
    },
    setAttribute(name, value) {
      attributes[name] = value;
    },
    getAttribute(name) {
      return name in attributes ? attributes[name] : null;
    },
    replaceChildren() {},
    append() {},
    addEventListener(event, handler) {
      this.listeners[event] = handler;
    },
    ...extra
  };
}

async function loadUpdateController() {
  const modulePath = pathToFileURL(path.join(repoRoot, "web", "js", "update-ui.js")).href;
  return import(`${modulePath}?test=${Date.now()}`);
}

test("update control wrapper hides until a real update exists, then carries an honest tooltip", async () => {
  const { UpdateController } = await loadUpdateController();

  const updateControl = createElementMock();
  const updateButton = createElementMock({ style: {} });

  global.window = {
    ltcUpdater: {
      getState: async () => ({ enabled: true, status: "idle", available: false, downloaded: false }),
      onEvent: () => () => {},
      checkForUpdates: async () => ({ enabled: true, status: "not-available", available: false, downloaded: false })
    }
  };
  global.document = { createElement: () => createElementMock() };

  const controller = new UpdateController({
    updateControl,
    updateButton,
    updateDialog: { open: false, showModal() {} },
    updateDialogTitle: createElementMock({ style: {} }),
    updateStatusText: createElementMock({ style: {} }),
    updateVersionText: createElementMock({ style: {} }),
    updateProgressBar: createElementMock({ style: {} }),
    updateProgressText: createElementMock({ style: {} }),
    updateNotes: createElementMock({ style: {} }),
    updateDownloadBtn: createElementMock({ style: {} }),
    updateInstallBtn: createElementMock({ style: {} }),
    updateCloseBtn: createElementMock({ style: {} })
  });

  controller.init();
  await new Promise((resolve) => setImmediate(resolve));

  // App start + "no update" check → both the wrapper and the button stay hidden.
  assert.equal(updateControl.hidden, true);
  assert.equal(updateButton.hidden, true);

  // A real available update reveals the wrapper with the "press to update" tooltip.
  controller.render({ enabled: true, status: "available", available: true, downloaded: false });
  assert.equal(updateControl.hidden, false);
  assert.equal(updateButton.hidden, false);
  assert.equal(updateControl.getAttribute("data-tooltip"), "กดเพื่ออัปเดต");

  // A downloaded update keeps it visible with a "ready to install" tooltip.
  controller.render({ enabled: true, status: "downloaded", available: true, downloaded: true });
  assert.equal(updateControl.hidden, false);
  assert.equal(updateControl.getAttribute("data-tooltip"), "พร้อมติดตั้งอัปเดต");
});
