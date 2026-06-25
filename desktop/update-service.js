"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { app, ipcMain } = require("electron");
const { NsisUpdater } = require("electron-updater");

function normalizeReleaseNotes(releaseNotes) {
  if (Array.isArray(releaseNotes)) {
    return releaseNotes
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item.note === "string") return item.note;
        return "";
      })
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof releaseNotes === "string") {
    return releaseNotes
      .split(/\r?\n+/)
      .map((item) => item.replace(/^[*\-\s]+/, "").trim())
      .filter(Boolean);
  }

  return [];
}

function resolveUpdateUrl() {
  const envUrl = String(process.env.LTC_UPDATE_URL || "").trim();
  if (envUrl) return envUrl;

  const configPaths = [
    path.join(app.getPath("userData"), "config", "update.json"),
    path.join(app.getAppPath(), "desktop", "update-config.json")
  ];

  for (const configPath of configPaths) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      const url = String(config?.url || "").trim();
      if (url) return url;
    } catch {
      // Missing or invalid optional update config means updates are unconfigured.
    }
  }

  return "";
}

class DesktopUpdateService {
  constructor() {
    this.state = {
      available: false,
      busy: false,
      downloaded: false,
      enabled: false,
      error: "",
      feedUrl: "",
      notes: [],
      progress: 0,
      status: "dev",
      version: app.getVersion()
    };

    this.updater = null;
  }

  setup(windowProvider) {
    this.windowProvider = windowProvider;
    const feedUrl = resolveUpdateUrl();
    this.patchState({
      enabled: app.isPackaged && Boolean(feedUrl),
      feedUrl,
      status: app.isPackaged ? (feedUrl ? "idle" : "unconfigured") : "dev"
    });
    this.setupUpdater();
    this.registerIpc();
  }

  setupUpdater() {
    if (!app.isPackaged || !this.state.feedUrl) return;

    this.updater = new NsisUpdater({
      provider: "generic",
      url: this.state.feedUrl
    });

    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;

    this.updater.on("checking-for-update", () => {
      this.patchState({ busy: true, error: "", progress: 0, status: "checking" });
    });

    this.updater.on("update-available", (info) => {
      this.patchState({
        available: true,
        busy: false,
        downloaded: false,
        notes: normalizeReleaseNotes(info.releaseNotes),
        status: "available",
        version: info.version || this.state.version
      });
    });

    this.updater.on("update-not-available", () => {
      this.patchState({
        available: false,
        busy: false,
        downloaded: false,
        notes: [],
        progress: 0,
        status: "not-available",
        version: app.getVersion()
      });
    });

    this.updater.on("download-progress", (progress) => {
      this.patchState({
        busy: true,
        progress: Math.round(Number(progress.percent || 0)),
        status: "downloading"
      });
    });

    this.updater.on("update-downloaded", (info) => {
      this.patchState({
        available: true,
        busy: false,
        downloaded: true,
        notes: normalizeReleaseNotes(info.releaseNotes),
        progress: 100,
        status: "downloaded",
        version: info.version || this.state.version
      });
    });

    this.updater.on("error", (error) => {
      this.patchState({
        busy: false,
        error: error?.message || "ตรวจสอบอัปเดตไม่สำเร็จ",
        status: "error"
      });
    });
  }

  registerIpc() {
    ipcMain.handle("updates:get-state", () => this.state);
    ipcMain.handle("updates:check", () => this.checkForUpdates());
    ipcMain.handle("updates:download", () => this.downloadUpdate());
    ipcMain.handle("updates:install", () => this.installUpdate());
  }

  patchState(patch) {
    this.state = {
      ...this.state,
      ...patch
    };
    this.emit();
    return this.state;
  }

  emit() {
    const window = this.windowProvider?.();
    if (window && !window.isDestroyed()) {
      window.webContents.send("updates:event", this.state);
    }
  }

  ensureReady() {
    if (!this.updater) {
      const message = app.isPackaged
        ? "ยังไม่ได้ตั้งค่าแหล่งอัปเดต"
        : "ระบบอัปเดตจะใช้งานได้หลัง build เป็นโปรแกรม .exe แล้ว";
      return this.patchState({
        enabled: false,
        error: message,
        status: app.isPackaged ? "unconfigured" : "dev"
      });
    }

    return null;
  }

  async checkForUpdates() {
    const unavailable = this.ensureReady();
    if (unavailable) return unavailable;
    await this.updater.checkForUpdates();
    return this.state;
  }

  async downloadUpdate() {
    const unavailable = this.ensureReady();
    if (unavailable) return unavailable;
    this.patchState({ busy: true, error: "", status: "downloading" });
    await this.updater.downloadUpdate();
    return this.state;
  }

  installUpdate() {
    const unavailable = this.ensureReady();
    if (unavailable) return unavailable;
    if (!this.state.downloaded) {
      return this.patchState({
        error: "ยังไม่มีอัปเดตที่ดาวน์โหลดเสร็จ",
        status: "error"
      });
    }
    this.updater.quitAndInstall(false, true);
    return this.state;
  }
}

module.exports = {
  DesktopUpdateService
};
