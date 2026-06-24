"use strict";

const { matchesPrefix } = require("../http-path");

function registerErrorRoutes(app, deps = {}) {
  const apiPrefix = String(deps.apiPrefix || "/api");
  const apiLikePrefixes = [...new Set([apiPrefix, "/api", "/auth"])];

  app.use((req, res) => {
    if (apiLikePrefixes.some((prefix) => matchesPrefix(req.path, prefix))) {
      return res.status(404).json({
        error: "ไม่พบ endpoint",
        requestId: req.requestId || null
      });
    }
    return res.redirect("/");
  });

  app.use((error, req, res, _next) => {
    const status = Number(error.status || 500);
    const message = error.message || "เกิดข้อผิดพลาดในเซิร์ฟเวอร์";
    const requestId = req.requestId || "-";
    if (status >= 500) {
      console.error(`[ltc-backend][${requestId}]`, error);
    } else {
      console.warn(`[ltc-backend][${requestId}] ${status} ${error.code || "ERROR"}: ${message}`);
    }

    const payload = {
      error: message,
      requestId: req.requestId || null
    };
    if (error.code) payload.code = error.code;
    if (error.currentVersion) payload.currentVersion = error.currentVersion;
    if (error.retryAfter) {
      const retryAfter = Math.max(1, Number(error.retryAfter) || 1);
      res.setHeader("Retry-After", String(retryAfter));
      payload.retryAfter = retryAfter;
    }
    res.status(status).json(payload);
  });
}

module.exports = {
  registerErrorRoutes
};
