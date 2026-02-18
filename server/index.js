const express = require("express");
const fs = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = path.resolve(__dirname, "..");
const SOURCE_DATA_DIR = path.join(ROOT_DIR, "chamrak_export", "data");
const OVERRIDE_DIR = path.join(ROOT_DIR, "runtime_data", "overrides");
const INTERNAL_KEYS = new Set(["__rowid"]);

const app = express();

app.use(express.json({ limit: "5mb" }));

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});

function isSafeAlias(alias) {
  return /^[A-Za-z0-9_]+$/.test(String(alias || ""));
}

function sourceFilePath(alias) {
  return path.join(SOURCE_DATA_DIR, `${alias}.json`);
}

function overrideFilePath(alias) {
  return path.join(OVERRIDE_DIR, `${alias}.json`);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") return [parsed];
  return [];
}

function stripInternalKeysDeep(value) {
  if (Array.isArray(value)) return value.map(stripInternalKeysDeep);
  if (!value || typeof value !== "object") return value;

  const next = {};
  for (const [key, nested] of Object.entries(value)) {
    if (INTERNAL_KEYS.has(key)) continue;
    next[key] = stripInternalKeysDeep(nested);
  }
  return next;
}

async function ensureOverrideDir() {
  await fs.mkdir(OVERRIDE_DIR, { recursive: true });
}

async function loadTable(alias) {
  const sourcePath = sourceFilePath(alias);
  const overridePath = overrideFilePath(alias);

  const hasSource = await fileExists(sourcePath);
  if (!hasSource) {
    const error = new Error(`ไม่พบตาราง ${alias}`);
    error.status = 404;
    throw error;
  }

  if (await fileExists(overridePath)) {
    return {
      source: "override",
      rows: await readJson(overridePath)
    };
  }

  return {
    source: "source",
    rows: await readJson(sourcePath)
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "ltc-backend" });
});

app.get("/api/storage", (_req, res) => {
  res.json({
    mode: "backend",
    sourceDataDir: SOURCE_DATA_DIR,
    overrideDir: OVERRIDE_DIR,
    description: "แก้ไขจะถูกเก็บใน runtime_data/overrides/*.json โดยไม่ทับไฟล์ต้นฉบับ"
  });
});

app.get("/api/tables", async (_req, res, next) => {
  try {
    const entries = await fs.readdir(SOURCE_DATA_DIR, { withFileTypes: true });
    const aliases = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name.replace(/\.json$/i, ""))
      .sort((a, b) => a.localeCompare(b));

    res.json({ count: aliases.length, aliases });
  } catch (error) {
    next(error);
  }
});

app.get("/api/tables/:alias", async (req, res, next) => {
  try {
    const alias = String(req.params.alias || "");
    if (!isSafeAlias(alias)) {
      return res.status(400).json({ error: "alias ไม่ถูกต้อง" });
    }

    const loaded = await loadTable(alias);
    return res.json({ alias, source: loaded.source, rows: loaded.rows });
  } catch (error) {
    return next(error);
  }
});

app.put("/api/tables/:alias", async (req, res, next) => {
  try {
    const alias = String(req.params.alias || "");
    if (!isSafeAlias(alias)) {
      return res.status(400).json({ error: "alias ไม่ถูกต้อง" });
    }

    const sourcePath = sourceFilePath(alias);
    if (!(await fileExists(sourcePath))) {
      return res.status(404).json({ error: `ไม่พบตาราง ${alias}` });
    }

    const incoming = Array.isArray(req.body) ? req.body : req.body?.rows;
    if (!Array.isArray(incoming)) {
      return res.status(400).json({ error: "body ต้องเป็น array หรือ { rows: array }" });
    }

    const cleanRows = stripInternalKeysDeep(incoming);
    await ensureOverrideDir();
    const targetPath = overrideFilePath(alias);
    await fs.writeFile(targetPath, `${JSON.stringify(cleanRows, null, 2)}\n`, "utf8");

    return res.json({
      ok: true,
      alias,
      storedAt: targetPath,
      rows: cleanRows.length
    });
  } catch (error) {
    return next(error);
  }
});

app.delete("/api/tables/:alias/override", async (req, res, next) => {
  try {
    const alias = String(req.params.alias || "");
    if (!isSafeAlias(alias)) {
      return res.status(400).json({ error: "alias ไม่ถูกต้อง" });
    }

    const overridePath = overrideFilePath(alias);
    if (!(await fileExists(overridePath))) {
      return res.status(404).json({ error: "ไม่พบไฟล์ override" });
    }

    await fs.unlink(overridePath);
    return res.json({ ok: true, alias });
  } catch (error) {
    return next(error);
  }
});

app.use(express.static(ROOT_DIR, { index: false }));

app.get("/", (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, "index.html"));
});

app.use((req, res) => {
  res.status(404).json({ error: "ไม่พบ endpoint" });
});

app.use((error, _req, res, _next) => {
  const status = Number(error.status || 500);
  const message = error.message || "เกิดข้อผิดพลาดในเซิร์ฟเวอร์";
  console.error(error);
  res.status(status).json({ error: message });
});

async function start() {
  await ensureOverrideDir();
  app.listen(PORT, () => {
    console.log(`[ltc-backend] running on http://localhost:${PORT}`);
    console.log(`[ltc-backend] source: ${SOURCE_DATA_DIR}`);
    console.log(`[ltc-backend] overrides: ${OVERRIDE_DIR}`);
  });
}

start().catch((error) => {
  console.error("start server failed", error);
  process.exit(1);
});
