"use strict";

const { sanitizeText } = require("../helpers");

function registerApiRoutes(app, deps) {
  const {
    config,
    requireApiAuth,
    tableStore,
    activityLogs,
    trashStore,
    geminiClient,
    aiCoordinator,
    aiAssistant,
    securityAudit,
    getActor,
    writeAudit
  } = deps;

  app.use("/api", requireApiAuth);

  app.get("/api/storage", async (_req, res) => {
    const trash = await trashStore.list({ includeRestored: false });
    const aiMetrics = aiCoordinator.metrics();
    res.json({
      mode: "backend",
      sourceDataDir: config.SOURCE_DATA_DIR,
      overrideDir: config.OVERRIDE_DIR,
      activityLogFile: config.ACTIVITY_LOG_FILE,
      trashFile: config.TRASH_FILE,
      trashRetentionDays: config.TRASH_RETENTION_DAYS,
      trashCount: trash.count,
      aiMode: geminiClient.isEnabled() ? "hybrid-gemini" : "local-rule-based",
      geminiModel: geminiClient.isEnabled() ? config.GEMINI_MODEL : null,
      aiContextCacheMs: config.AI_CONTEXT_CACHE_MS,
      aiConcurrency: aiMetrics,
      description: "แก้ไขจะถูกเก็บใน runtime_data/overrides/*.json โดยไม่ทับไฟล์ต้นฉบับ"
    });
  });

  app.post("/api/security/scan", async (req, res) => {
    const result = securityAudit.run();
    const actor = getActor(req);

    await writeAudit({
      type: "security",
      action: "SECURITY_SCAN",
      resource: "/api/security/scan",
      user: actor.username,
      ip: actor.ip,
      detail: `score=${result.score}`,
      status: result.score >= 70 ? "ok" : "warn"
    });

    res.json({ ok: true, ...result });
  });

  app.post("/api/ai/chat", async (req, res, next) => {
    try {
      const prompt = sanitizeText(req.body?.message || "", config.AI_MAX_PROMPT_CHARS);
      const actor = getActor(req);
      const clientKey = `${actor.username}|${actor.ip}`;
      const history = (Array.isArray(req.body?.history) ? req.body.history : [])
        .slice(-12)
        .map((item) => ({
          role: String(item?.role || "").toLowerCase() === "assistant" ? "assistant" : "user",
          text: sanitizeText(item?.text || "", 800)
        }));

      const execution = await aiCoordinator.run(clientKey, () => aiAssistant.chat(prompt, history));
      const reply = execution.value;
      const aiMetrics = aiCoordinator.metrics();
      res.setHeader("X-AI-Queue", `${aiMetrics.active}/${aiMetrics.queued}`);

      await writeAudit({
        type: "ai",
        action: "AI_CHAT",
        resource: "/api/ai/chat",
        user: actor.username,
        ip: actor.ip,
        detail: `source=${reply?.source || "unknown"}, waitMs=${execution.waitedMs}, queue=${aiMetrics.queued}, charts=${Array.isArray(reply?.charts) ? reply.charts.length : 0}, files=${Array.isArray(reply?.artifacts) ? reply.artifacts.length : 0}, prompt=${prompt.slice(0, 120)}`,
        status: "ok"
      });

      return res.json({ ok: true, ...reply });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/logs/export", async (req, res, next) => {
    try {
      const csv = await activityLogs.exportCsv({
        from: req.query.from,
        to: req.query.to,
        user: req.query.user,
        type: req.query.type,
        action: req.query.action
      });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="activity-logs-${Date.now()}.csv"`);
      return res.send(csv);
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/logs", async (req, res, next) => {
    try {
      const payload = await activityLogs.query({
        from: req.query.from,
        to: req.query.to,
        user: req.query.user,
        type: req.query.type,
        action: req.query.action,
        page: req.query.page,
        pageSize: req.query.pageSize
      });
      return res.json(payload);
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/trash", async (req, res, next) => {
    try {
      const payload = await trashStore.list({
        alias: req.query.alias,
        includeRestored: req.query.includeRestored === "1"
      });
      return res.json(payload);
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/trash/restore", async (req, res, next) => {
    try {
      const actor = getActor(req);
      const result = await trashStore.restore(req.body?.trashIds, actor);

      await writeAudit({
        type: "trash",
        action: "RESTORE_ROWS",
        resource: "/api/trash/restore",
        user: actor.username,
        ip: actor.ip,
        detail: `requested=${result.requested}, restored=${result.restored}, skipped=${result.skipped}`,
        status: result.restored > 0 ? "ok" : "warn"
      });

      return res.json({ ok: true, ...result });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/trash/purge-expired", async (req, res, next) => {
    try {
      const result = await trashStore.purgeExpired();
      const actor = getActor(req);

      await writeAudit({
        type: "trash",
        action: "PURGE_EXPIRED_TRASH",
        resource: "/api/trash/purge-expired",
        user: actor.username,
        ip: actor.ip,
        detail: `removed=${result.removed}`,
        status: "ok"
      });

      return res.json({ ok: true, ...result });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/tables", async (_req, res, next) => {
    try {
      const aliases = await tableStore.listAliases();
      res.json({ count: aliases.length, aliases });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tables/:alias", async (req, res, next) => {
    try {
      const alias = String(req.params.alias || "");
      const loaded = await tableStore.loadTable(alias);
      res.json({ alias, source: loaded.source, version: loaded.version, rows: loaded.rows });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/tables/:alias", async (req, res, next) => {
    try {
      const alias = String(req.params.alias || "");
      const incoming = Array.isArray(req.body) ? req.body : req.body?.rows;
      const ifVersion = sanitizeText(req.body?.ifVersion || req.headers["if-version"] || "", 120);
      if (!Array.isArray(incoming)) {
        return res.status(400).json({ error: "body ต้องเป็น array หรือ { rows: array }" });
      }

      const saved = await tableStore.saveTable(alias, incoming, {
        expectedVersion: ifVersion
      });
      const actor = getActor(req);
      await writeAudit({
        type: "data",
        action: "SAVE_TABLE",
        resource: alias,
        user: actor.username,
        ip: actor.ip,
        detail: `rows=${saved.rows}`,
        status: "ok"
      });

      const reloaded = await tableStore.loadTable(alias);
      return res.json({
        ok: true,
        alias,
        storedAt: saved.storedAt,
        rowCount: saved.rows,
        version: saved.version,
        data: reloaded.rows
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/tables/:alias/delete", async (req, res, next) => {
    try {
      const alias = String(req.params.alias || "");
      const rowIds = req.body?.rowIds;
      const ifVersion = sanitizeText(req.body?.ifVersion || req.headers["if-version"] || "", 120);
      const actor = getActor(req);

      const result = await tableStore.deleteRows(alias, rowIds, trashStore, actor, {
        expectedVersion: ifVersion
      });

      await writeAudit({
        type: "data",
        action: "DELETE_ROWS",
        resource: alias,
        user: actor.username,
        ip: actor.ip,
        detail: `deleted=${result.deleted}, trashSaved=${result.trashSaved}`,
        status: result.deleted > 0 ? "ok" : "warn"
      });

      return res.json({ ok: true, ...result });
    } catch (error) {
      return next(error);
    }
  });

  app.delete("/api/tables/:alias/override", async (req, res, next) => {
    try {
      const alias = String(req.params.alias || "");
      await tableStore.deleteOverride(alias);
      const actor = getActor(req);

      await writeAudit({
        type: "data",
        action: "DELETE_OVERRIDE",
        resource: alias,
        user: actor.username,
        ip: actor.ip,
        detail: "removed override file",
        status: "ok"
      });

      return res.json({ ok: true, alias });
    } catch (error) {
      return next(error);
    }
  });
}

module.exports = {
  registerApiRoutes
};
