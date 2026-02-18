"use strict";

const fsSync = require("node:fs");
const path = require("node:path");

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

const ROOT_DIR = path.resolve(__dirname, "..", "..");
loadLocalEnv(ROOT_DIR);

const RUNTIME_DIR = path.join(ROOT_DIR, "runtime_data");

const config = {
  PORT: Number(process.env.PORT || 3000),
  ROOT_DIR,
  RUNTIME_DIR,
  SOURCE_DATA_DIR: path.join(ROOT_DIR, "chamrak_export", "data"),
  OVERRIDE_DIR: path.join(RUNTIME_DIR, "overrides"),
  ACTIVITY_LOG_FILE: path.join(RUNTIME_DIR, "activity_logs.jsonl"),
  TRASH_FILE: path.join(RUNTIME_DIR, "trash_items.json"),
  IS_PRODUCTION: process.env.NODE_ENV === "production",

  AUTH_COOKIE_NAME: "ltc_auth",
  AUTH_TTL_SECONDS: 8 * 60 * 60,
  AUTH_TTL_REMEMBER_SECONDS: 30 * 24 * 60 * 60,
  LOGIN_ATTEMPT_WINDOW_MS: 15 * 60 * 1000,
  LOGIN_ATTEMPT_MAX: 10,

  TRASH_RETENTION_DAYS: 30,

  AI_MAX_PROMPT_CHARS: 2000,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  GEMINI_TIMEOUT_MS: Number(process.env.GEMINI_TIMEOUT_MS || 12000),
  AI_CONTEXT_CACHE_MS: Math.max(0, Number(process.env.AI_CONTEXT_CACHE_MS || 2000)),
  AI_MAX_CONCURRENT: Math.max(1, Number(process.env.AI_MAX_CONCURRENT || 8)),
  AI_MAX_CONCURRENT_PER_CLIENT: Math.max(1, Number(process.env.AI_MAX_CONCURRENT_PER_CLIENT || 2)),
  AI_MAX_QUEUE: Math.max(1, Number(process.env.AI_MAX_QUEUE || 100)),
  AI_QUEUE_TIMEOUT_MS: Math.max(1000, Number(process.env.AI_QUEUE_TIMEOUT_MS || 15000)),

  ADMIN_USERNAME: process.env.LTC_ADMIN_USER || "admin",
  ADMIN_PASSWORD: process.env.LTC_ADMIN_PASSWORD || "admin123456",
  TOKEN_SECRET: process.env.LTC_TOKEN_SECRET || "change-me-in-production"
};

module.exports = config;
