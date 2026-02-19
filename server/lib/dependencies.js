"use strict";

const { AuthService } = require("./services/auth-service");
const { LoginAttemptLimiter } = require("./services/login-attempt-limiter");
const { ActivityLogStore } = require("./stores/activity-log-store");
const { TableStore } = require("./stores/table-store");
const { TrashStore } = require("./stores/trash-store");
const { GeminiClient } = require("./services/ai/gemini-client");
const { AiRequestCoordinator } = require("./services/ai/ai-request-coordinator");
const { AiAssistantService } = require("./services/ai/ai-assistant-service");
const { SecurityAuditService } = require("./services/security-audit-service");
const { IpSpamBlocker } = require("./services/ip-spam-blocker");

function createDependencies(config) {
  const auth = new AuthService({
    cookieName: config.AUTH_COOKIE_NAME,
    username: config.ADMIN_USERNAME,
    password: config.ADMIN_PASSWORD,
    secret: config.TOKEN_SECRET,
    ttlSeconds: config.AUTH_TTL_SECONDS,
    rememberTtlSeconds: config.AUTH_TTL_REMEMBER_SECONDS,
    secureCookies: config.IS_PRODUCTION
  });

  const loginLimiter = new LoginAttemptLimiter({
    windowMs: config.LOGIN_ATTEMPT_WINDOW_MS,
    maxAttempts: config.LOGIN_ATTEMPT_MAX
  });
  const ipSpamBlocker = new IpSpamBlocker({
    enabled: config.IP_BLOCK_ENABLED,
    windowMs: config.IP_BLOCK_WINDOW_MS,
    maxHits: config.IP_BLOCK_MAX_HITS,
    blockMs: config.IP_BLOCK_DURATION_MS
  });

  const tableStore = new TableStore(config.SOURCE_DATA_DIR, config.OVERRIDE_DIR, {
    maxRows: config.TABLE_MAX_ROWS,
    maxPayloadBytes: config.TABLE_MAX_PAYLOAD_BYTES,
    maxDepth: config.TABLE_MAX_DEPTH
  });
  const activityLogs = new ActivityLogStore(config.ACTIVITY_LOG_FILE);
  const trashStore = new TrashStore(config.TRASH_FILE, config.TRASH_RETENTION_DAYS, tableStore);

  const geminiClient = new GeminiClient({
    apiKey: config.GEMINI_API_KEY,
    model: config.GEMINI_MODEL,
    timeoutMs: config.GEMINI_TIMEOUT_MS
  });

  const aiCoordinator = new AiRequestCoordinator({
    maxConcurrent: config.AI_MAX_CONCURRENT,
    maxPerClient: config.AI_MAX_CONCURRENT_PER_CLIENT,
    maxQueue: config.AI_MAX_QUEUE,
    queueTimeoutMs: config.AI_QUEUE_TIMEOUT_MS
  });

  const aiAssistant = new AiAssistantService({
    tableStore,
    geminiClient,
    contextCacheMs: config.AI_CONTEXT_CACHE_MS,
    maxPromptChars: config.AI_MAX_PROMPT_CHARS
  });

  const securityAudit = new SecurityAuditService({
    tableStore,
    loginLimiter,
    retentionDays: config.TRASH_RETENTION_DAYS,
    tokenSecret: config.TOKEN_SECRET,
    adminPassword: config.ADMIN_PASSWORD,
    geminiEnabled: geminiClient.isEnabled(),
    aiCoordinator,
    requestBodyLimit: config.REQUEST_BODY_LIMIT,
    requireAjaxHeader: config.REQUIRE_AJAX_HEADER,
    allowedOrigins: config.ALLOWED_ORIGINS,
    tableMaxRows: config.TABLE_MAX_ROWS,
    tableMaxPayloadBytes: config.TABLE_MAX_PAYLOAD_BYTES,
    trustProxyHops: config.TRUST_PROXY_HOPS,
    debugRequests: config.DEBUG_REQUESTS,
    ipBlockEnabled: config.IP_BLOCK_ENABLED,
    ipBlockWindowMs: config.IP_BLOCK_WINDOW_MS,
    ipBlockMaxHits: config.IP_BLOCK_MAX_HITS,
    ipBlockDurationMs: config.IP_BLOCK_DURATION_MS
  });

  return {
    auth,
    loginLimiter,
    ipSpamBlocker,
    tableStore,
    activityLogs,
    trashStore,
    geminiClient,
    aiCoordinator,
    aiAssistant,
    securityAudit
  };
}

module.exports = {
  createDependencies
};
