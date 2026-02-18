"use strict";

function createAuthMiddleware(auth) {
  function requireApiAuth(req, res, next) {
    const session = auth.getSession(req);
    if (!session) return res.status(401).json({ error: "กรุณาเข้าสู่ระบบ" });
    req.auth = session;
    return next();
  }

  function requirePageAuth(req, res, next) {
    const session = auth.getSession(req);
    if (!session) return res.redirect("/login.html");
    req.auth = session;
    return next();
  }

  function redirectAuthenticated(req, res, next) {
    const session = auth.getSession(req);
    if (session) return res.redirect("/");
    return next();
  }

  return {
    requireApiAuth,
    requirePageAuth,
    redirectAuthenticated
  };
}

module.exports = {
  createAuthMiddleware
};
