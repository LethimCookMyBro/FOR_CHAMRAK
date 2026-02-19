"use strict";

const { sanitizeText } = require("../helpers");
const { routePath } = require("../http-path");

function registerApiRoutes(app, deps) {
  const {
    config,
    apiPrefix = "/api",
    requireApiAuth,
    tableStore,
    activityLogs,
    trashStore,
    geminiClient,
    aiCoordinator,
    ipSpamBlocker,
    aiAssistant,
    securityAudit,
    getActor,
    writeAudit
  } = deps;
  const MAX_BULK_IDS = Math.max(100, Math.min(config.TABLE_MAX_ROWS || 50000, 10000));

  function parseAlias(rawAlias) {
    const alias = sanitizeText(rawAlias || "", 80);
    if (!/^[A-Za-z0-9_]+$/.test(alias)) {
      const error = new Error("alias ไม่ถูกต้อง");
      error.status = 400;
      throw error;
    }
    return alias;
  }

  function parseIds(raw, fieldName) {
    const ids = Array.isArray(raw) ? raw.map((item) => sanitizeText(item || "", 120)).filter(Boolean) : [];
    if (!ids.length) {
      const error = new Error(`${fieldName} ต้องเป็น array ที่มีค่าอย่างน้อย 1 รายการ`);
      error.status = 400;
      throw error;
    }
    if (ids.length > MAX_BULK_IDS) {
      const error = new Error(`${fieldName} มากเกินกำหนด (${ids.length}/${MAX_BULK_IDS})`);
      error.status = 413;
      throw error;
    }
    return ids;
  }

  function requestTag(req) {
    return `rid=${sanitizeText(req.requestId || "-", 80)}`;
  }

  const prefix = String(apiPrefix || "/api").replace(/\/+$/, "") || "/api";

  app.use(prefix, requireApiAuth);

  app.get(routePath(prefix, "/storage"), async (_req, res) => {
    const trash = await trashStore.list({ includeRestored: false });
    const aiMetrics = aiCoordinator.metrics();
    const ipBlockMetrics = ipSpamBlocker?.metrics?.() || null;
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
      ipBlock: ipBlockMetrics,
      description: "แก้ไขจะถูกเก็บใน runtime_data/overrides/*.json โดยไม่ทับไฟล์ต้นฉบับ"
    });
  });

  app.post(routePath(prefix, "/security/scan"), async (req, res) => {
    const result = securityAudit.run();
    const actor = getActor(req);

    await writeAudit({
      type: "security",
      action: "SECURITY_SCAN",
      resource: routePath(prefix, "/security/scan"),
      user: actor.username,
      ip: actor.ip,
      detail: `${requestTag(req)}, score=${result.score}`,
      status: result.score >= 70 ? "ok" : "warn"
    });

    res.json({ ok: true, ...result });
  });

  app.post(routePath(prefix, "/ai/chat"), async (req, res, next) => {
    try {
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({ error: "รูปแบบคำขอไม่ถูกต้อง" });
      }
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
        resource: routePath(prefix, "/ai/chat"),
        user: actor.username,
        ip: actor.ip,
        detail: `${requestTag(req)}, source=${reply?.source || "unknown"}, waitMs=${execution.waitedMs}, queue=${aiMetrics.queued}, charts=${Array.isArray(reply?.charts) ? reply.charts.length : 0}, files=${Array.isArray(reply?.artifacts) ? reply.artifacts.length : 0}, prompt=${prompt.slice(0, 120)}`,
        status: "ok"
      });

      return res.json({ ok: true, ...reply });
    } catch (error) {
      return next(error);
    }
  });

  app.get(routePath(prefix, "/logs/export"), async (req, res, next) => {
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

  app.get(routePath(prefix, "/logs"), async (req, res, next) => {
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

  app.get(routePath(prefix, "/trash"), async (req, res, next) => {
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

  app.post(routePath(prefix, "/trash/restore"), async (req, res, next) => {
    try {
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({ error: "รูปแบบคำขอไม่ถูกต้อง" });
      }
      const actor = getActor(req);
      const trashIds = parseIds(req.body?.trashIds, "trashIds");
      const result = await trashStore.restore(trashIds, actor);

      await writeAudit({
        type: "trash",
        action: "RESTORE_ROWS",
        resource: routePath(prefix, "/trash/restore"),
        user: actor.username,
        ip: actor.ip,
        detail: `${requestTag(req)}, requested=${result.requested}, restored=${result.restored}, skipped=${result.skipped}`,
        status: result.restored > 0 ? "ok" : "warn"
      });

      return res.json({ ok: true, ...result });
    } catch (error) {
      return next(error);
    }
  });

  app.post(routePath(prefix, "/trash/purge-expired"), async (req, res, next) => {
    try {
      const result = await trashStore.purgeExpired();
      const actor = getActor(req);

      await writeAudit({
        type: "trash",
        action: "PURGE_EXPIRED_TRASH",
        resource: routePath(prefix, "/trash/purge-expired"),
        user: actor.username,
        ip: actor.ip,
        detail: `${requestTag(req)}, removed=${result.removed}`,
        status: "ok"
      });

      return res.json({ ok: true, ...result });
    } catch (error) {
      return next(error);
    }
  });

  app.post(routePath(prefix, "/trash/purge-all"), async (req, res, next) => {
    try {
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({ error: "รูปแบบคำขอไม่ถูกต้อง" });
      }
      const actor = getActor(req);
      const aliasRaw = sanitizeText(req.body?.alias || "", 80);
      const result = await trashStore.purgeAll({
        alias: aliasRaw ? parseAlias(aliasRaw) : "",
        includeRestored: req.body?.includeRestored !== false
      });

      await writeAudit({
        type: "trash",
        action: "PURGE_ALL_TRASH",
        resource: routePath(prefix, "/trash/purge-all"),
        user: actor.username,
        ip: actor.ip,
        detail: `${requestTag(req)}, removed=${result.removed}, remaining=${result.remaining}`,
        status: "ok"
      });

      return res.json({ ok: true, ...result });
    } catch (error) {
      return next(error);
    }
  });

  app.get(routePath(prefix, "/tables"), async (_req, res, next) => {
    try {
      const aliases = await tableStore.listAliases();
      res.json({ count: aliases.length, aliases });
    } catch (error) {
      next(error);
    }
  });

  app.get(routePath(prefix, "/tables/:alias"), async (req, res, next) => {
    try {
      const alias = parseAlias(req.params.alias);
      const loaded = await tableStore.loadTable(alias);
      res.json({ alias, source: loaded.source, version: loaded.version, rows: loaded.rows });
    } catch (error) {
      next(error);
    }
  });

  app.put(routePath(prefix, "/tables/:alias"), async (req, res, next) => {
    try {
      const alias = parseAlias(req.params.alias);
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
        detail: `${requestTag(req)}, rows=${saved.rows}`,
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

  app.post(routePath(prefix, "/tables/:alias/delete"), async (req, res, next) => {
    try {
      const alias = parseAlias(req.params.alias);
      const rowIds = parseIds(req.body?.rowIds, "rowIds");
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
        detail: `${requestTag(req)}, deleted=${result.deleted}, trashSaved=${result.trashSaved}`,
        status: result.deleted > 0 ? "ok" : "warn"
      });

      return res.json({ ok: true, ...result });
    } catch (error) {
      return next(error);
    }
  });

  app.delete(routePath(prefix, "/tables/:alias/override"), async (req, res, next) => {
    try {
      const alias = parseAlias(req.params.alias);
      await tableStore.deleteOverride(alias);
      const actor = getActor(req);

      await writeAudit({
        type: "data",
        action: "DELETE_OVERRIDE",
        resource: alias,
        user: actor.username,
        ip: actor.ip,
        detail: `${requestTag(req)}, removed override file`,
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
