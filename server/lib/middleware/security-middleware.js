"use strict";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const { matchesPrefix } = require("../http-path");

function isStateChangingMethod(method) {
  return STATE_CHANGING_METHODS.has(String(method || "").toUpperCase());
}

function normalizeOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.host}`.toLowerCase();
  } catch {
    return "";
  }
}

function buildAllowedOrigins(req, config) {
  const declared = Array.isArray(config.ALLOWED_ORIGINS) ? config.ALLOWED_ORIGINS : [];
  const normalizedDeclared = declared.map((item) => normalizeOrigin(item)).filter(Boolean);
  if (normalizedDeclared.length) return new Set(normalizedDeclared);

  const reqHost = String(req.get("host") || "").trim();
  if (!reqHost) return new Set();
  return new Set([`http://${reqHost}`.toLowerCase(), `https://${reqHost}`.toLowerCase()]);
}

function deny(req, res, config, status, message, reason) {
  if (config.DEBUG_REQUESTS) {
    const requestId = req.requestId || "-";
    const method = String(req.method || "-");
    const target = String(req.originalUrl || req.url || "-");
    console.warn(`[guard][${requestId}] ${reason} ${method} ${target}`);
  }
  return res.status(status).json({
    error: message,
    requestId: req.requestId || null
  });
}

function applyRequestGuards(app, config) {
  const apiPrefix = String(config.API_PREFIX || "/api");

  app.use((req, res, next) => {
    if (!isStateChangingMethod(req.method)) return next();

    const path = String(req.path || "");
    const isApiLike = matchesPrefix(path, apiPrefix);
    if (!isApiLike) return next();

    const secFetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
    if (secFetchSite && !["same-origin", "same-site", "none"].includes(secFetchSite)) {
      return deny(req, res, config, 403, "คำขอนี้ถูกปฏิเสธด้วยนโยบายความปลอดภัย (fetch-site)", "fetch-site");
    }

    const rawOrigin = req.headers.origin;
    const hasOriginHeader = rawOrigin != null && String(rawOrigin).trim() !== "";
    const origin = normalizeOrigin(rawOrigin);
    if (hasOriginHeader && !origin) {
      return deny(req, res, config, 403, "คำขอนี้มี Origin ไม่ถูกต้อง", "origin-invalid");
    }
    if (origin) {
      const allowed = buildAllowedOrigins(req, config);
      if (allowed.size > 0 && !allowed.has(origin)) {
        return deny(req, res, config, 403, "คำขอนี้ถูกปฏิเสธด้วยนโยบายความปลอดภัย (origin)", "origin-deny");
      }
    }

    const requiresAjaxHeader = matchesPrefix(path, apiPrefix);
    if (requiresAjaxHeader && config.REQUIRE_AJAX_HEADER !== false) {
      const requestedWith = String(req.headers["x-requested-with"] || "").toLowerCase();
      if (requestedWith !== "xmlhttprequest") {
        return deny(req, res, config, 403, "คำขอนี้ต้องส่งผ่าน AJAX เท่านั้น", "ajax-header");
      }
    }

    const expectsJson = matchesPrefix(path, apiPrefix);
    if (expectsJson) {
      const contentType = String(req.headers["content-type"] || "").toLowerCase();
      if (!contentType.includes("application/json")) {
        return deny(req, res, config, 415, "รองรับเฉพาะ Content-Type: application/json", "content-type");
      }
    }

    return next();
  });
}

function applySecurityHeaders(app, config) {
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=(), usb=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; frame-src 'none'; manifest-src 'self'"
    );
    if (config.ENABLE_HSTS) {
      res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
    }
    next();
  });

  app.use((req, res, next) => {
    if (matchesPrefix(req.path, config.API_PREFIX || "/api") || matchesPrefix(req.path, "/auth")) {
      res.setHeader("Cache-Control", "no-store");
    }
    next();
  });
}

function noStore(_req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  return next();
}

module.exports = {
  applySecurityHeaders,
  applyRequestGuards,
  noStore
};
