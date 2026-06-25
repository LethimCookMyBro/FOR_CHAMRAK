"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const updateApi = {
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  downloadUpdate: () => ipcRenderer.invoke("updates:download"),
  getState: () => ipcRenderer.invoke("updates:get-state"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  onEvent: (handler) => {
    if (typeof handler !== "function") return () => {};
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("updates:event", listener);
    return () => ipcRenderer.removeListener("updates:event", listener);
  }
};

contextBridge.exposeInMainWorld("ltcUpdater", updateApi);
