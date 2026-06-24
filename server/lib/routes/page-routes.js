"use strict";

const express = require("express");
const path = require("node:path");
const { routePath } = require("../http-path");

function registerPageRoutes(app, deps) {
  const { ROOT_DIR, noStore, apiPrefix = "/api" } = deps;

  app.get("/public/runtime-config.js", noStore, (_req, res) => {
    const payload = {
      apiBase: String(apiPrefix || "/api")
    };
    res.type("application/javascript; charset=utf-8");
    res.send(`window.__LTC_RUNTIME_CONFIG__ = ${JSON.stringify(payload)};\n`);
  });

  app.use("/public", noStore, express.static(path.join(ROOT_DIR, "web", "public")));
  app.use("/web", noStore, express.static(path.join(ROOT_DIR, "web")));
  app.use("/chamrak_export", noStore, express.static(path.join(ROOT_DIR, "chamrak_export")));

  app.get(["/", "/index.html"], noStore, (_req, res) => {
    res.sendFile(path.join(ROOT_DIR, "index.html"));
  });

  app.get(routePath(apiPrefix, "/health"), (_req, res) => {
    res.json({ ok: true, service: "ltc-backend" });
  });
}

module.exports = {
  registerPageRoutes
};
