"use strict";

const crypto = require("node:crypto");
const express = require("express");
const config = require("./lib/runtime-config");
const { createDependencies } = require("./lib/dependencies");
const { createRequestUtils } = require("./lib/request-utils");
const { applySecurityHeaders, applyRequestGuards, noStore } = require("./lib/middleware/security-middleware");
const { createAuthMiddleware } = require("./lib/middleware/auth-middleware");
const { registerAuthRoutes } = require("./lib/routes/auth-routes");
const { registerPageRoutes } = require("./lib/routes/page-routes");
const { registerApiRoutes } = require("./lib/routes/api-routes");
const { registerErrorRoutes } = require("./lib/routes/error-routes");
const { matchesPrefix, routePath } = require("./lib/http-path");

const services = createDependencies(config);
const requestUtils = createRequestUtils(services.activityLogs);
const authMiddleware = createAuthMiddleware(services.auth);

const app = express();
app.disable("x-powered-by");

if (config.TRUST_PROXY_HOPS > 0) {
  app.set("trust proxy", config.TRUST_PROXY_HOPS);
}

app.use((req, res, next) => {
  const inboundRequestId = String(req.headers["x-request-id"] || "").trim();
  const safeInbound = /^[A-Za-z0-9._:-]{8,120}$/.test(inboundRequestId) ? inboundRequestId : "";
  const generated =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const requestId = safeInbound || generated;
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  if (config.DEBUG_REQUESTS) {
    const startedAt = Date.now();
    res.on("finish", () => {
      const elapsedMs = Date.now() - startedAt;
      console.log(`[req][${requestId}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${elapsedMs}ms)`);
    });
  }

  next();
});

app.use((req, res, next) => {
  const isProtectedPath = matchesPrefix(req.path, config.API_PREFIX) || matchesPrefix(req.path, config.AUTH_PREFIX);
  if (!isProtectedPath) return next();

  // Count only sensitive traffic for IP blocking to avoid false positives
  // when many users behind the same NAT browse/read data simultaneously.
  const method = String(req.method || "").toUpperCase();
  const isMutating = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
  const isLogin = req.path === routePath(config.AUTH_PREFIX, "/login");
  const isAiChat = req.path === routePath(config.API_PREFIX, "/ai/chat");
  if (!(isMutating || isLogin || isAiChat)) return next();

  const verdict = services.ipSpamBlocker.consume(req);
  if (!verdict.blocked) return next();

  const actor = requestUtils.getActor(req);
  void requestUtils.writeAudit({
    type: "security",
    action: verdict.justBlocked ? "IP_BLOCK_TRIGGERED" : "IP_BLOCK_REJECT",
    resource: req.path,
    user: actor.username,
    ip: actor.ip,
    detail: `rid=${req.requestId || "-"}, clientIp=${verdict.clientIp}, retryAfter=${verdict.retryAfterSeconds}s`,
    status: "blocked"
  });

  res.setHeader("Retry-After", String(verdict.retryAfterSeconds));
  return res.status(429).json({
    error: "ตรวจพบการส่งคำขอถี่เกินกำหนด IP นี้ถูกบล็อกชั่วคราว",
    retryAfter: verdict.retryAfterSeconds,
    requestId: req.requestId || null
  });
});

app.use(express.json({ limit: config.REQUEST_BODY_LIMIT }));
applySecurityHeaders(app, config);
applyRequestGuards(app, config);

registerAuthRoutes(app, {
  auth: services.auth,
  loginLimiter: services.loginLimiter,
  writeAudit: requestUtils.writeAudit,
  authPrefix: config.AUTH_PREFIX
});

registerPageRoutes(app, {
  ROOT_DIR: config.ROOT_DIR,
  requirePageAuth: authMiddleware.requirePageAuth,
  redirectAuthenticated: authMiddleware.redirectAuthenticated,
  noStore,
  apiPrefix: config.API_PREFIX,
  authPrefix: config.AUTH_PREFIX
});

registerApiRoutes(app, {
  config,
  apiPrefix: config.API_PREFIX,
  requireApiAuth: authMiddleware.requireApiAuth,
  tableStore: services.tableStore,
  activityLogs: services.activityLogs,
  trashStore: services.trashStore,
  geminiClient: services.geminiClient,
  aiCoordinator: services.aiCoordinator,
  ipSpamBlocker: services.ipSpamBlocker,
  aiAssistant: services.aiAssistant,
  securityAudit: services.securityAudit,
  getActor: requestUtils.getActor,
  writeAudit: requestUtils.writeAudit
});

registerErrorRoutes(app, {
  apiPrefix: config.API_PREFIX,
  authPrefix: config.AUTH_PREFIX
});

async function start() {
  if (config.IS_PRODUCTION && config.TOKEN_SECRET === "change-me-in-production") {
    throw new Error("ต้องตั้งค่า LTC_TOKEN_SECRET ก่อนรัน production");
  }

  if (config.ADMIN_PASSWORD === "admin123456") {
    console.warn("[ltc-backend] warning: กำลังใช้รหัสผ่านค่าเริ่มต้นของระบบ");
  }

  await services.tableStore.ensureDirectories();
  await services.activityLogs.ensure();
  await services.trashStore.ensure();
  await services.trashStore.purgeExpired();

  app.listen(config.PORT, () => {
    console.log(`[ltc-backend] running on http://localhost:${config.PORT}`);
    console.log(
      `[ltc-backend] routes: api=${config.API_PREFIX}, auth=${config.AUTH_PREFIX}, trustProxyHops=${config.TRUST_PROXY_HOPS}, debugRequests=${config.DEBUG_REQUESTS ? "on" : "off"}`
    );
    console.log(
      `[ltc-backend] ip-block: enabled=${config.IP_BLOCK_ENABLED ? "yes" : "no"}, window=${config.IP_BLOCK_WINDOW_MS}ms, maxHits=${config.IP_BLOCK_MAX_HITS}, block=${config.IP_BLOCK_DURATION_MS}ms`
    );
    console.log(`[ltc-backend] source: ${config.SOURCE_DATA_DIR}`);
    console.log(`[ltc-backend] overrides: ${config.OVERRIDE_DIR}`);
    console.log(`[ltc-backend] logs: ${config.ACTIVITY_LOG_FILE}`);
    console.log(`[ltc-backend] trash: ${config.TRASH_FILE} (${config.TRASH_RETENTION_DAYS} days)`);
    console.log(
      `[ltc-backend] ai: concurrent=${config.AI_MAX_CONCURRENT}, per-client=${config.AI_MAX_CONCURRENT_PER_CLIENT}, queue=${config.AI_MAX_QUEUE}, timeout=${config.AI_QUEUE_TIMEOUT_MS}ms, cache=${config.AI_CONTEXT_CACHE_MS}ms`
    );
  });
}

start().catch((error) => {
  console.error("start server failed", error);
  process.exit(1);
});

module.exports = app;
