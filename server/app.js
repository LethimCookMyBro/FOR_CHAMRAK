"use strict";

const express = require("express");
const config = require("./lib/runtime-config");
const { createDependencies } = require("./lib/dependencies");
const { createRequestUtils } = require("./lib/request-utils");
const { applySecurityHeaders, noStore } = require("./lib/middleware/security-middleware");
const { createAuthMiddleware } = require("./lib/middleware/auth-middleware");
const { registerAuthRoutes } = require("./lib/routes/auth-routes");
const { registerPageRoutes } = require("./lib/routes/page-routes");
const { registerApiRoutes } = require("./lib/routes/api-routes");
const { registerErrorRoutes } = require("./lib/routes/error-routes");

const services = createDependencies(config);
const requestUtils = createRequestUtils(services.activityLogs);
const authMiddleware = createAuthMiddleware(services.auth);

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "5mb" }));
applySecurityHeaders(app, config);

registerAuthRoutes(app, {
  auth: services.auth,
  loginLimiter: services.loginLimiter,
  writeAudit: requestUtils.writeAudit
});

registerPageRoutes(app, {
  ROOT_DIR: config.ROOT_DIR,
  requirePageAuth: authMiddleware.requirePageAuth,
  redirectAuthenticated: authMiddleware.redirectAuthenticated,
  noStore
});

registerApiRoutes(app, {
  config,
  requireApiAuth: authMiddleware.requireApiAuth,
  tableStore: services.tableStore,
  activityLogs: services.activityLogs,
  trashStore: services.trashStore,
  geminiClient: services.geminiClient,
  aiCoordinator: services.aiCoordinator,
  aiAssistant: services.aiAssistant,
  securityAudit: services.securityAudit,
  getActor: requestUtils.getActor,
  writeAudit: requestUtils.writeAudit
});

registerErrorRoutes(app);

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
