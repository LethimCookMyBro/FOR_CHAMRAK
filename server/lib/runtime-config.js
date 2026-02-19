"use strict";

const fsSync = require("node:fs");
const path = require("node:path");
const { normalizePrefix } = require("./http-path");

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
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const config = {
  PORT: Number(process.env.PORT || 3000),
  ROOT_DIR,
  RUNTIME_DIR,
  SOURCE_DATA_DIR: path.join(ROOT_DIR, "chamrak_export", "data"),
  OVERRIDE_DIR: path.join(RUNTIME_DIR, "overrides"),
  ACTIVITY_LOG_FILE: path.join(RUNTIME_DIR, "activity_logs.jsonl"),
  TRASH_FILE: path.join(RUNTIME_DIR, "trash_items.json"),
  IS_PRODUCTION: process.env.NODE_ENV === "production",
  REQUEST_BODY_LIMIT: process.env.REQUEST_BODY_LIMIT || "1mb",
  ALLOWED_ORIGINS,
  REQUIRE_AJAX_HEADER: process.env.REQUIRE_AJAX_HEADER !== "0",
  API_PREFIX: normalizePrefix(process.env.API_PREFIX, "/api"),
  AUTH_PREFIX: normalizePrefix(process.env.AUTH_PREFIX, "/auth"),
  TRUST_PROXY_HOPS: Math.max(0, Number(process.env.TRUST_PROXY_HOPS || 0)),
  DEBUG_REQUESTS: process.env.DEBUG_REQUESTS === "1",

  AUTH_COOKIE_NAME: "ltc_auth",
  AUTH_TTL_SECONDS: 8 * 60 * 60,
  AUTH_TTL_REMEMBER_SECONDS: 30 * 24 * 60 * 60,
  LOGIN_ATTEMPT_WINDOW_MS: 15 * 60 * 1000,
  LOGIN_ATTEMPT_MAX: 10,
  IP_BLOCK_ENABLED: process.env.IP_BLOCK_ENABLED !== "0",
  IP_BLOCK_WINDOW_MS: Math.max(1000, Number(process.env.IP_BLOCK_WINDOW_MS || 60 * 1000)),
  IP_BLOCK_MAX_HITS: Math.max(10, Number(process.env.IP_BLOCK_MAX_HITS || 240)),
  IP_BLOCK_DURATION_MS: Math.max(1000, Number(process.env.IP_BLOCK_DURATION_MS || 10 * 60 * 1000)),

  TRASH_RETENTION_DAYS: 30,

  AI_MAX_PROMPT_CHARS: 2000,
  GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  GEMINI_TIMEOUT_MS: Number(process.env.GEMINI_TIMEOUT_MS || 12000),
  AI_CONTEXT_CACHE_MS: Math.max(0, Number(process.env.AI_CONTEXT_CACHE_MS || 2000)),
  AI_MAX_CONCURRENT: Math.max(1, Number(process.env.AI_MAX_CONCURRENT || 8)),
  AI_MAX_CONCURRENT_PER_CLIENT: Math.max(1, Number(process.env.AI_MAX_CONCURRENT_PER_CLIENT || 2)),
  AI_MAX_QUEUE: Math.max(1, Number(process.env.AI_MAX_QUEUE || 100)),
  AI_QUEUE_TIMEOUT_MS: Math.max(1000, Number(process.env.AI_QUEUE_TIMEOUT_MS || 15000)),
  TABLE_MAX_ROWS: Math.max(100, Number(process.env.TABLE_MAX_ROWS || 50000)),
  TABLE_MAX_PAYLOAD_BYTES: Math.max(1024 * 100, Number(process.env.TABLE_MAX_PAYLOAD_BYTES || 8 * 1024 * 1024)),
  TABLE_MAX_DEPTH: Math.max(3, Number(process.env.TABLE_MAX_DEPTH || 40)),

  ADMIN_USERNAME: process.env.LTC_ADMIN_USER || "admin",
  ADMIN_PASSWORD: process.env.LTC_ADMIN_PASSWORD || "admin123456",
  TOKEN_SECRET: process.env.LTC_TOKEN_SECRET || "change-me-in-production"
};

module.exports = config;
