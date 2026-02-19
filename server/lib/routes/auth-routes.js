"use strict";

const { sanitizeText } = require("../helpers");
const { routePath } = require("../http-path");

function registerAuthRoutes(app, deps) {
  const { auth, loginLimiter, writeAudit, authPrefix = "/auth" } = deps;
  const loginPath = routePath(authPrefix, "/login");
  const logoutPath = routePath(authPrefix, "/logout");
  const mePath = routePath(authPrefix, "/me");

  app.post(loginPath, async (req, res) => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ error: "รูปแบบคำขอไม่ถูกต้อง" });
    }

    const limitStatus = loginLimiter.check(req);
    if (limitStatus.blocked) {
      await writeAudit({
        type: "auth",
        action: "LOGIN_BLOCKED",
        resource: loginPath,
        user: sanitizeText(req.body?.username || "unknown", 80),
        ip: req.ip,
        detail: `rid=${req.requestId || "-"}, rate limited (${limitStatus.retryAfterSeconds}s)`,
        status: "blocked"
      });

      res.setHeader("Retry-After", String(limitStatus.retryAfterSeconds));
      return res.status(429).json({
        error: `พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอ ${limitStatus.retryAfterSeconds} วินาที`
      });
    }

    const username = sanitizeText(req.body?.username || "", 80);
    const password = String(req.body?.password || "");
    const remember = Boolean(req.body?.remember);

    if (!username || !password) {
      return res.status(400).json({ error: "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน" });
    }
    if (password.length > 256) {
      return res.status(400).json({ error: "รหัสผ่านยาวเกินกำหนด" });
    }

    if (!auth.validateCredentials(username, password)) {
      loginLimiter.registerFailure(req);
      await writeAudit({
        type: "auth",
        action: "LOGIN_FAIL",
        resource: loginPath,
        user: username || "unknown",
        ip: req.ip,
        detail: `rid=${req.requestId || "-"}, invalid credentials`,
        status: "fail"
      });
      return res.status(401).json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    }

    loginLimiter.clear(req);
    const issued = auth.issueToken(username, remember);
    auth.setAuthCookie(res, issued.token, issued.ttlSeconds);

    await writeAudit({
      type: "auth",
      action: "LOGIN_SUCCESS",
      resource: loginPath,
      user: username,
      ip: req.ip,
      detail: `rid=${req.requestId || "-"}, ${remember ? "remember session" : "normal session"}`,
      status: "ok"
    });

    return res.json({
      ok: true,
      user: {
        username,
        expiresAt: issued.exp
      }
    });
  });

  app.post(logoutPath, async (req, res) => {
    const session = auth.getSession(req);
    auth.clearAuthCookie(res);

    await writeAudit({
      type: "auth",
      action: "LOGOUT",
      resource: logoutPath,
      user: session?.username || "anonymous",
      ip: req.ip,
      detail: `rid=${req.requestId || "-"}, logout`,
      status: "ok"
    });

    return res.json({ ok: true });
  });

  app.get(mePath, (req, res) => {
    const session = auth.getSession(req);
    if (!session) return res.status(401).json({ error: "unauthorized" });
    return res.json({ ok: true, user: session });
  });
}

module.exports = {
  registerAuthRoutes
};
