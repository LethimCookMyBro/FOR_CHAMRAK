"use strict";

const path = require("node:path");
const { app, BrowserWindow } = require("electron");
const { startServer } = require("../server/app");
const { ensureDesktopRuntime } = require("./runtime-bootstrap");

let mainWindow = null;
let serverContextPromise = null;
let serverClosePromise = null;

function resolveAppRoot() {
  return path.resolve(app.getAppPath());
}

function buildAppUrl(port) {
  return `http://127.0.0.1:${port}/`;
}

function isAllowedNavigation(targetUrl, appUrl) {
  try {
    const current = new URL(appUrl);
    const next = new URL(targetUrl);
    return next.origin === current.origin;
  } catch {
    return false;
  }
}

async function ensureServerContext() {
  if (serverContextPromise) return serverContextPromise;

  serverContextPromise = (async () => {
    const appRoot = resolveAppRoot();
    const userDataRoot = app.getPath("userData");
    const runtimeRoot = path.join(userDataRoot, "runtime_data");
    const configRoot = path.join(userDataRoot, "config");

    await ensureDesktopRuntime({
      configRoot,
      isPackaged: app.isPackaged,
      projectRuntimeRoot: path.join(appRoot, "runtime_data"),
      runtimeRoot
    });

    return startServer({
      configOverrides: {
        APP_ROOT: appRoot,
        CONFIG_ROOT: configRoot,
        ENABLE_HSTS: false,
        HOST: "127.0.0.1",
        IS_PRODUCTION: app.isPackaged,
        PORT: 0,
        RUNTIME_MODE: "desktop",
        RUNTIME_ROOT: runtimeRoot,
        SECURE_COOKIES: false,
        SOURCE_DATA_ROOT: path.join(appRoot, "chamrak_export")
      }
    });
  })();

  return serverContextPromise;
}

async function closeServerContext() {
  if (serverClosePromise) return serverClosePromise;

  serverClosePromise = (async () => {
    const activePromise = serverContextPromise;
    serverContextPromise = null;

    if (!activePromise) return;

    try {
      const context = await activePromise;
      await context.close();
    } catch (error) {
      console.warn("[desktop] backend shutdown warning", error);
    } finally {
      serverClosePromise = null;
    }
  })();

  return serverClosePromise;
}

async function createMainWindow() {
  const serverContext = await ensureServerContext();
  const address = serverContext.address;
  const port = typeof address === "object" && address ? address.port : serverContext.config.PORT;
  const appUrl = buildAppUrl(port);

  const window = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1100,
    minHeight: 760,
    autoHideMenuBar: true,
    show: false,
    title: "LTC Chamrak",
    webPreferences: {
      contextIsolation: true,
      devTools: !app.isPackaged,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (!isAllowedNavigation(targetUrl, appUrl)) {
      event.preventDefault();
    }
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  if (!app.isPackaged) {
    window.webContents.openDevTools({ mode: "detach" });
  }

  await window.loadURL(appUrl);
  return window;
}

app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
});

app.on("before-quit", () => {
  void closeServerContext();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createMainWindow().then((window) => {
      mainWindow = window;
    });
  }
});

app.whenReady()
  .then(async () => {
    mainWindow = await createMainWindow();
  })
  .catch((error) => {
    console.error("[desktop] startup failed", error);
    app.exit(1);
  });
