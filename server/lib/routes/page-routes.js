"use strict";

const express = require("express");
const path = require("node:path");

function registerPageRoutes(app, deps) {
  const { ROOT_DIR, requirePageAuth, redirectAuthenticated, noStore } = deps;

  app.get("/login.html", redirectAuthenticated, noStore, (_req, res) => {
    res.sendFile(path.join(ROOT_DIR, "login.html"));
  });

  app.use("/public", noStore, express.static(path.join(ROOT_DIR, "web", "public")));
  app.use("/web", requirePageAuth, noStore, express.static(path.join(ROOT_DIR, "web")));
  app.use("/chamrak_export", requirePageAuth, noStore, express.static(path.join(ROOT_DIR, "chamrak_export")));

  app.get(["/", "/index.html"], requirePageAuth, noStore, (_req, res) => {
    res.sendFile(path.join(ROOT_DIR, "index.html"));
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "ltc-backend" });
  });
}

module.exports = {
  registerPageRoutes
};
