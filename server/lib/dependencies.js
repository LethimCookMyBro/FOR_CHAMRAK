"use strict";

const { ActivityLogStore } = require("./stores/activity-log-store");
const { TableStore } = require("./stores/table-store");
const { TrashStore } = require("./stores/trash-store");
const { SecurityAuditService } = require("./services/security-audit-service");
const { IpSpamBlocker } = require("./services/ip-spam-blocker");

function createDependencies(config) {
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

  const securityAudit = new SecurityAuditService({
    tableStore,
    retentionDays: config.TRASH_RETENTION_DAYS,
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
    ipSpamBlocker,
    tableStore,
    activityLogs,
    trashStore,
    securityAudit
  };
}

module.exports = {
  createDependencies
};
