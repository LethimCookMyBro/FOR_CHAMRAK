"use strict";

const path = require("node:path");

function resolveRuntimePaths(options = {}) {
  const appRoot = path.resolve(String(options.appRoot || path.resolve(__dirname, "..", "..")));
  const runtimeRoot = path.resolve(String(options.runtimeRoot || path.join(appRoot, "runtime_data")));
  const sourceDataRoot = path.resolve(String(options.sourceDataRoot || path.join(appRoot, "chamrak_export")));
  const configRoot = path.resolve(String(options.configRoot || path.join(runtimeRoot, "config")));
  const structure = options.structure === "desktop" ? "desktop" : "legacy";

  const overrideDir = path.join(runtimeRoot, "overrides");
  const logDir = structure === "desktop" ? path.join(runtimeRoot, "logs") : runtimeRoot;
  const trashDir = structure === "desktop" ? path.join(runtimeRoot, "trash") : runtimeRoot;

  return {
    APP_ROOT: appRoot,
    RUNTIME_ROOT: runtimeRoot,
    SOURCE_DATA_ROOT: sourceDataRoot,
    SOURCE_DATA_DIR: path.join(sourceDataRoot, "data"),
    OVERRIDE_DIR: overrideDir,
    LOG_DIR: logDir,
    TRASH_DIR: trashDir,
    CONFIG_DIR: configRoot,
    ACTIVITY_LOG_FILE: path.join(logDir, "activity_logs.jsonl"),
    TRASH_FILE: path.join(trashDir, "trash_items.json")
  };
}

module.exports = {
  resolveRuntimePaths
};
