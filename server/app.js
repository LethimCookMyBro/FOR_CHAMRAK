"use strict";

const crypto = require("node:crypto");
const express = require("express");
const defaultConfig = require("./lib/runtime-config");
const { createRuntimeConfig } = require("./lib/runtime-config");
const { createDependencies } = require("./lib/dependencies");
const { createRequestUtils } = require("./lib/request-utils");
const { applySecurityHeaders, applyRequestGuards, noStore } = require("./lib/middleware/security-middleware");
const { registerPageRoutes } = require("./lib/routes/page-routes");
const { registerApiRoutes } = require("./lib/routes/api-routes");
const { registerErrorRoutes } = require("./lib/routes/error-routes");
const { matchesPrefix } = require("./lib/http-path");

function createApp(options = {}) {
  const config = options.config || createRuntimeConfig(options.configOverrides || {});
  const services = createDependencies(config);
  const requestUtils = createRequestUtils(services.activityLogs);

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
    const isProtectedPath = matchesPrefix(req.path, config.API_PREFIX);
    if (!isProtectedPath) return next();

    const method = String(req.method || "").toUpperCase();
    const isMutating = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
    if (!isMutating) return next();

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
      error: "ตรวจพบการส่งคำขอที่เกินกำหนด IP นี้ถูกบล็อกชั่วคราว",
      retryAfter: verdict.retryAfterSeconds,
      requestId: req.requestId || null
    });
  });

  app.use(express.json({ limit: config.REQUEST_BODY_LIMIT }));
  applySecurityHeaders(app, config);
  applyRequestGuards(app, config);

  registerPageRoutes(app, {
    ROOT_DIR: config.ROOT_DIR,
    noStore,
    apiPrefix: config.API_PREFIX
  });

  registerApiRoutes(app, {
    config,
    apiPrefix: config.API_PREFIX,
    tableStore: services.tableStore,
    activityLogs: services.activityLogs,
    trashStore: services.trashStore,
    ipSpamBlocker: services.ipSpamBlocker,
    securityAudit: services.securityAudit,
    getActor: requestUtils.getActor,
    writeAudit: requestUtils.writeAudit
  });

  registerErrorRoutes(app, {
    apiPrefix: config.API_PREFIX
  });

  return {
    app,
    config,
    services
  };
}

async function prepareServices(config, services) {
  await services.tableStore.ensureDirectories();
  await services.activityLogs.ensure();
  await services.trashStore.ensure();
  await services.trashStore.purgeExpired();
}

function logStartup(config, address) {
  const host = address?.address || config.HOST;
  const port = address?.port || config.PORT;
  console.log(`[ltc-backend] running on http://${host}:${port}`);
  console.log(
    `[ltc-backend] mode=${config.RUNTIME_MODE}, routes: api=${config.API_PREFIX}, auth=disabled, trustProxyHops=${config.TRUST_PROXY_HOPS}, debugRequests=${config.DEBUG_REQUESTS ? "on" : "off"}`
  );
  console.log(
    `[ltc-backend] ip-block: enabled=${config.IP_BLOCK_ENABLED ? "yes" : "no"}, window=${config.IP_BLOCK_WINDOW_MS}ms, maxHits=${config.IP_BLOCK_MAX_HITS}, block=${config.IP_BLOCK_DURATION_MS}ms`
  );
  console.log(`[ltc-backend] source: ${config.SOURCE_DATA_DIR}`);
  console.log(`[ltc-backend] runtime: ${config.RUNTIME_DIR}`);
  console.log(`[ltc-backend] overrides: ${config.OVERRIDE_DIR}`);
  console.log(`[ltc-backend] logs: ${config.ACTIVITY_LOG_FILE}`);
  console.log(`[ltc-backend] trash: ${config.TRASH_FILE} (${config.TRASH_RETENTION_DAYS} days)`);
}

async function startServer(options = {}) {
  const context = createApp(options);
  const { app, config, services } = context;

  await prepareServices(config, services);

  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(config.PORT, config.HOST, () => resolve(instance));
    instance.once("error", reject);
  });

  const address = server.address();
  logStartup(config, typeof address === "object" ? address : null);

  return {
    ...context,
    server,
    address,
    close: () =>
      new Promise((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      })
  };
}

async function startDefaultServer() {
  try {
    await startServer({ config: defaultConfig });
  } catch (error) {
    console.error("start server failed", error);
    process.exit(1);
  }
}

module.exports = {
  createApp,
  startServer
};

if (require.main === module) {
  void startDefaultServer();
}
