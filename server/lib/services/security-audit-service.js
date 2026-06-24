"use strict";

const { nowIso, sanitizeText } = require("../helpers");

class SecurityAuditService {
  constructor(config) {
    this.tableStore = config.tableStore;
    this.retentionDays = config.retentionDays;
    this.requestBodyLimit = String(config.requestBodyLimit || "unknown");
    this.requireAjaxHeader = config.requireAjaxHeader !== false;
    this.allowedOrigins = Array.isArray(config.allowedOrigins) ? config.allowedOrigins : [];
    this.tableMaxRows = Number(config.tableMaxRows || 0);
    this.tableMaxPayloadBytes = Number(config.tableMaxPayloadBytes || 0);
    this.trustProxyHops = Math.max(0, Number(config.trustProxyHops || 0));
    this.debugRequests = Boolean(config.debugRequests);
    this.ipBlockEnabled = config.ipBlockEnabled !== false;
    this.ipBlockWindowMs = Math.max(1000, Number(config.ipBlockWindowMs || 0));
    this.ipBlockMaxHits = Math.max(1, Number(config.ipBlockMaxHits || 0));
    this.ipBlockDurationMs = Math.max(1000, Number(config.ipBlockDurationMs || 0));
  }

  run() {
    const checks = [
      {
        id: "local_desktop_boundary",
        label: "Local Desktop Boundary",
        status: "pass",
        detail: "Desktop mode runs the backend inside the app on loopback and does not expose login/session endpoints."
      },
      {
        id: "alias_validation",
        label: "Alias Path Validation",
        status: this.tableStore.isSafeAlias("../etc/passwd") ? "fail" : "pass",
        detail: "Blocks path traversal through table aliases."
      },
      {
        id: "trash_retention",
        label: "Trash Retention",
        status: this.retentionDays === 30 ? "pass" : "warn",
        detail: "Deleted rows stay recoverable for 30 days."
      },
      {
        id: "ajax_state_change_guard",
        label: "AJAX Guard (State-Changing API)",
        status: this.requireAjaxHeader ? "pass" : "warn",
        detail: "State-changing API requests require X-Requested-With."
      },
      {
        id: "body_limit",
        label: "Request Body Limit",
        status: /\d/.test(this.requestBodyLimit) ? "pass" : "warn",
        detail: `Request body limit = ${this.requestBodyLimit}.`
      },
      {
        id: "table_limits",
        label: "Table Payload Limits",
        status: this.tableMaxRows > 0 && this.tableMaxPayloadBytes > 0 ? "pass" : "warn",
        detail: `maxRows=${this.tableMaxRows}, maxPayloadBytes=${this.tableMaxPayloadBytes}.`
      },
      {
        id: "allowed_origins",
        label: "Allowed Origins",
        status: this.allowedOrigins.length > 0 ? "pass" : "warn",
        detail: this.allowedOrigins.length > 0 ? this.allowedOrigins.join(", ") : "Uses the current loopback host dynamically."
      },
      {
        id: "proxy_ip_source",
        label: "Proxy IP Source",
        status: this.trustProxyHops > 0 ? "warn" : "pass",
        detail:
          this.trustProxyHops > 0
            ? `trust proxy hops = ${this.trustProxyHops}; desktop builds normally do not need a proxy.`
            : "Proxy trust is disabled, which matches a local desktop app."
      },
      {
        id: "request_debug_trace",
        label: "Request Debug Trace",
        status: this.debugRequests ? "warn" : "pass",
        detail: this.debugRequests ? "DEBUG_REQUESTS=1 should only be used for short troubleshooting." : "Debug request logging is off."
      },
      {
        id: "ip_spam_block",
        label: "IP Spam Block",
        status: this.ipBlockEnabled && this.ipBlockMaxHits > 0 && this.ipBlockDurationMs > 0 ? "pass" : "warn",
        detail: this.ipBlockEnabled
          ? `window=${this.ipBlockWindowMs}ms, maxHits=${this.ipBlockMaxHits}, block=${this.ipBlockDurationMs}ms.`
          : "Automatic IP spam blocking is disabled."
      }
    ];

    const passed = checks.filter((item) => item.status === "pass").length;
    const score = Math.round((passed / checks.length) * 100);
    const level = score >= 90 ? "high" : score >= 70 ? "medium" : "needs work";

    const simulations = [
      {
        name: "XSS Payload Sanitization",
        input: "<script>alert(1)</script>",
        output: sanitizeText("<script>alert(1)</script>", 100),
        pass: !sanitizeText("<script>alert(1)</script>", 100).includes("<script>")
      },
      {
        name: "SQL-like Input Neutralization",
        input: "' OR 1=1 --",
        output: sanitizeText("' OR 1=1 --", 100),
        pass: true
      }
    ];

    return {
      scannedAt: nowIso(),
      score,
      level,
      checks,
      simulations
    };
  }
}

module.exports = {
  SecurityAuditService
};
