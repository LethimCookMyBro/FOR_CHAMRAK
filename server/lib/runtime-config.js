"use strict";

const fsSync = require("node:fs");
const path = require("node:path");
const { normalizePrefix } = require("./http-path");
const { resolveRuntimePaths } = require("./runtime-paths");

function loadLocalEnv(rootDir) {
  const envPath = path.join(rootDir, ".env");
  try {
    const raw = fsSync.readFileSync(envPath, "utf8");
    const lines = raw.split(/\r?\n/);
    for (const lineRaw of lines) {
      const line = String(lineRaw || "").trim();
      if (!line || line.startsWith("#")) continue;
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;

      const key = match[1];
      let value = String(match[2] || "").trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (process.env[key] == null || process.env[key] === "") {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional
  }
}

function normalizePort(value, fallback = 3000) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) return fallback;
  return parsed;
}

function normalizeHost(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "localhost") return "localhost";
  return "127.0.0.1";
}

function createRuntimeConfig(overrides = {}) {
  const rootDir = path.resolve(String(overrides.APP_ROOT || path.resolve(__dirname, "..", "..")));
  loadLocalEnv(rootDir);

  const runtimeMode = String(overrides.RUNTIME_MODE || process.env.LTC_RUNTIME_MODE || "web").trim().toLowerCase() === "desktop"
    ? "desktop"
    : "web";
  const isProduction = overrides.IS_PRODUCTION ?? (process.env.NODE_ENV === "production");
  const runtimeRoot = overrides.RUNTIME_ROOT || process.env.LTC_RUNTIME_ROOT || path.join(rootDir, "runtime_data");
  const configRoot =
    overrides.CONFIG_ROOT ||
    process.env.LTC_CONFIG_ROOT ||
    (runtimeMode === "desktop" ? path.join(path.dirname(path.resolve(String(runtimeRoot))), "config") : path.join(path.resolve(String(runtimeRoot)), "config"));

  const resolvedPaths = resolveRuntimePaths({
    appRoot: rootDir,
    runtimeRoot,
    sourceDataRoot: overrides.SOURCE_DATA_ROOT || process.env.LTC_SOURCE_DATA_ROOT || path.join(rootDir, "chamrak_export"),
    configRoot,
    structure: runtimeMode === "desktop" ? "desktop" : "legacy"
  });

  const allowedOrigins = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const secureCookies = overrides.SECURE_COOKIES ?? (runtimeMode !== "desktop" && isProduction);
  const enableHsts = overrides.ENABLE_HSTS ?? (runtimeMode !== "desktop" && isProduction);

  return {
    PORT: normalizePort(overrides.PORT ?? process.env.PORT ?? 3000, 3000),
    HOST: normalizeHost(overrides.HOST || process.env.HOST || "127.0.0.1"),
    ROOT_DIR: resolvedPaths.APP_ROOT,
    RUNTIME_MODE: runtimeMode,
    RUNTIME_DIR: resolvedPaths.RUNTIME_ROOT,
    SOURCE_DATA_ROOT: resolvedPaths.SOURCE_DATA_ROOT,
    SOURCE_DATA_DIR: resolvedPaths.SOURCE_DATA_DIR,
    OVERRIDE_DIR: resolvedPaths.OVERRIDE_DIR,
    LOG_DIR: resolvedPaths.LOG_DIR,
    TRASH_DIR: resolvedPaths.TRASH_DIR,
    CONFIG_DIR: resolvedPaths.CONFIG_DIR,
    ACTIVITY_LOG_FILE: resolvedPaths.ACTIVITY_LOG_FILE,
    TRASH_FILE: resolvedPaths.TRASH_FILE,
    IS_PRODUCTION: isProduction,
    SECURE_COOKIES: secureCookies,
    ENABLE_HSTS: enableHsts,
    REQUEST_BODY_LIMIT: process.env.REQUEST_BODY_LIMIT || "1mb",
    ALLOWED_ORIGINS: allowedOrigins,
    REQUIRE_AJAX_HEADER: process.env.REQUIRE_AJAX_HEADER !== "0",
    API_PREFIX: normalizePrefix(process.env.API_PREFIX, "/api"),
    TRUST_PROXY_HOPS: Math.max(0, Number(process.env.TRUST_PROXY_HOPS || 0)),
    DEBUG_REQUESTS: process.env.DEBUG_REQUESTS === "1",

    IP_BLOCK_ENABLED: process.env.IP_BLOCK_ENABLED !== "0",
    IP_BLOCK_WINDOW_MS: Math.max(1000, Number(process.env.IP_BLOCK_WINDOW_MS || 60 * 1000)),
    IP_BLOCK_MAX_HITS: Math.max(10, Number(process.env.IP_BLOCK_MAX_HITS || 240)),
    IP_BLOCK_DURATION_MS: Math.max(1000, Number(process.env.IP_BLOCK_DURATION_MS || 10 * 60 * 1000)),

    TRASH_RETENTION_DAYS: 30,

    TABLE_MAX_ROWS: Math.max(100, Number(process.env.TABLE_MAX_ROWS || 50000)),
    TABLE_MAX_PAYLOAD_BYTES: Math.max(1024 * 100, Number(process.env.TABLE_MAX_PAYLOAD_BYTES || 8 * 1024 * 1024)),
    TABLE_MAX_DEPTH: Math.max(3, Number(process.env.TABLE_MAX_DEPTH || 40))
  };
}

const runtimeConfig = createRuntimeConfig();

module.exports = runtimeConfig;
module.exports.createRuntimeConfig = createRuntimeConfig;
