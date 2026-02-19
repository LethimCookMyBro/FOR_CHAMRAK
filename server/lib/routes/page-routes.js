"use strict";

const express = require("express");
const path = require("node:path");
const { routePath } = require("../http-path");

function registerPageRoutes(app, deps) {
  const { ROOT_DIR, requirePageAuth, redirectAuthenticated, noStore, apiPrefix = "/api", authPrefix = "/auth" } = deps;

  app.get("/login.html", redirectAuthenticated, noStore, (_req, res) => {
    res.sendFile(path.join(ROOT_DIR, "login.html"));
  });

  app.get("/public/runtime-config.js", noStore, (_req, res) => {
    const payload = {
      apiBase: String(apiPrefix || "/api"),
      authBase: String(authPrefix || "/auth")
    };
    res.type("application/javascript; charset=utf-8");
    res.send(`window.__LTC_RUNTIME_CONFIG__ = ${JSON.stringify(payload)};\n`);
  });

  app.use("/public", noStore, express.static(path.join(ROOT_DIR, "web", "public")));
  app.use("/web", requirePageAuth, noStore, express.static(path.join(ROOT_DIR, "web")));
  app.use("/chamrak_export", requirePageAuth, noStore, express.static(path.join(ROOT_DIR, "chamrak_export")));

  app.get(["/", "/index.html"], requirePageAuth, noStore, (_req, res) => {
    res.sendFile(path.join(ROOT_DIR, "index.html"));
  });

  app.get(routePath(apiPrefix, "/health"), (_req, res) => {
    res.json({ ok: true, service: "ltc-backend" });
  });
}

module.exports = {
  registerPageRoutes
};
