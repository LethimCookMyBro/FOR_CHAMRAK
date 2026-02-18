"use strict";

function registerErrorRoutes(app) {
  app.use((req, res) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/auth/")) {
      return res.status(404).json({ error: "ไม่พบ endpoint" });
    }
    return res.redirect("/login.html");
  });

  app.use((error, _req, res, _next) => {
    const status = Number(error.status || 500);
    const message = error.message || "เกิดข้อผิดพลาดในเซิร์ฟเวอร์";
    if (status >= 500) {
      console.error(error);
    } else {
      console.warn(`[ltc-backend] ${status} ${error.code || "ERROR"}: ${message}`);
    }

    const payload = { error: message };
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
