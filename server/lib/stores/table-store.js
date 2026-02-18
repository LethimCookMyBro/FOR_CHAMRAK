"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { canonicalize, sha1 } = require("../helpers");

const INTERNAL_KEYS = new Set(["__rowid"]);

class TableStore {
  constructor(sourceDir, overrideDir) {
    this.sourceDir = sourceDir;
    this.overrideDir = overrideDir;
    this.writeChains = new Map();
    this.candidateIdentityKeys = [
      "ID",
      "id",
      "เลขประชาชน",
      "รหัสcg",
      "รหัสcm",
      "รหัสหน่วย",
      "productID",
      "inid",
      "outid",
      "เลขที่",
      "no"
    ];
  }

  isSafeAlias(alias) {
    return /^[A-Za-z0-9_]+$/.test(String(alias || ""));
  }

  sourceFile(alias) {
    return path.join(this.sourceDir, `${alias}.json`);
  }

  overrideFile(alias) {
    return path.join(this.overrideDir, `${alias}.json`);
  }

  async ensureDirectories() {
    await fs.mkdir(this.overrideDir, { recursive: true });
  }

  async runExclusive(alias, handler) {
    const key = String(alias || "");
    const previous = this.writeChains.get(key) || Promise.resolve();
    let release = null;
    const current = new Promise((resolve) => {
      release = resolve;
    });
    this.writeChains.set(key, previous.then(() => current));

    await previous;
    try {
      return await handler();
    } finally {
      release();
    }
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  normalizeRows(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return [value];
    return [];
  }

  stripInternalKeysDeep(value) {
    if (Array.isArray(value)) return value.map((item) => this.stripInternalKeysDeep(item));
    if (!value || typeof value !== "object") return value;

    const next = {};
    for (const [key, nested] of Object.entries(value)) {
      if (INTERNAL_KEYS.has(key)) continue;
      next[key] = this.stripInternalKeysDeep(nested);
    }
    return next;
  }

  cleanRow(row) {
    return this.stripInternalKeysDeep(row || {});
  }

  rowIdentityKey(alias, row) {
    const clean = this.cleanRow(row);
    for (const key of this.candidateIdentityKeys) {
      const value = clean[key];
      if (value == null) continue;
      const text = String(value).trim();
      if (!text) continue;
      return `${alias}|${key}|${text}`;
    }
    const canonical = JSON.stringify(canonicalize(clean));
    return `${alias}|hash|${sha1(canonical)}`;
  }

  makeRowId(alias, row, occurrence) {
    const baseKey = this.rowIdentityKey(alias, row);
    const digest = sha1(baseKey).slice(0, 14);
    return occurrence > 1 ? `${alias}_${digest}_${occurrence}` : `${alias}_${digest}`;
  }

  attachRowIds(alias, rows) {
    const counts = new Map();
    return rows.map((row) => {
      const clean = this.cleanRow(row);
      const baseKey = this.rowIdentityKey(alias, clean);
      const occ = (counts.get(baseKey) || 0) + 1;
      counts.set(baseKey, occ);
      return {
        ...clean,
        __rowid: this.makeRowId(alias, clean, occ)
      };
    });
  }

  createVersion(rows) {
    const normalized = this.normalizeRows(rows).map((row) => this.cleanRow(row));
    const canonical = JSON.stringify(canonicalize(normalized));
    return sha1(canonical);
  }

  async readJson(filePath) {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return this.normalizeRows(parsed);
  }

  async listAliases() {
    const entries = await fs.readdir(this.sourceDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name.replace(/\.json$/i, ""))
      .sort((a, b) => a.localeCompare(b));
  }

  async loadRaw(alias) {
    if (!this.isSafeAlias(alias)) {
      const error = new Error("alias ไม่ถูกต้อง");
      error.status = 400;
      throw error;
    }

    const sourcePath = this.sourceFile(alias);
    const overridePath = this.overrideFile(alias);

    if (!(await this.fileExists(sourcePath))) {
      const error = new Error(`ไม่พบตาราง ${alias}`);
      error.status = 404;
      throw error;
    }

    if (await this.fileExists(overridePath)) {
      return {
        source: "override",
        rows: await this.readJson(overridePath)
      };
    }

    return {
      source: "source",
      rows: await this.readJson(sourcePath)
    };
  }

  async loadTable(alias) {
    const loaded = await this.loadRaw(alias);
    const cleanRows = loaded.rows.map((row) => this.cleanRow(row));
    return {
      source: loaded.source,
      version: this.createVersion(cleanRows),
      rows: this.attachRowIds(alias, cleanRows)
    };
  }

  async saveTable(alias, incomingRows, options = {}) {
    return this.runExclusive(alias, async () => {
      if (!this.isSafeAlias(alias)) {
        const error = new Error("alias ไม่ถูกต้อง");
        error.status = 400;
        throw error;
      }

      const sourcePath = this.sourceFile(alias);
      if (!(await this.fileExists(sourcePath))) {
        const error = new Error(`ไม่พบตาราง ${alias}`);
        error.status = 404;
        throw error;
      }

      const expectedVersion = String(options.expectedVersion || "").trim();
      if (expectedVersion) {
        const current = await this.loadTable(alias);
        if (current.version !== expectedVersion) {
          const error = new Error("ข้อมูลถูกแก้ไขโดยผู้ใช้อื่น กรุณารีเฟรชแล้วลองใหม่อีกครั้ง");
          error.status = 409;
          error.code = "VERSION_CONFLICT";
          error.currentVersion = current.version;
          throw error;
        }
      }

      const rows = this.normalizeRows(incomingRows);
      const cleaned = rows.map((row) => this.cleanRow(row));

      await this.ensureDirectories();
      const targetPath = this.overrideFile(alias);
      await fs.writeFile(targetPath, `${JSON.stringify(cleaned, null, 2)}\n`, "utf8");

      return {
        storedAt: targetPath,
        rows: cleaned.length,
        version: this.createVersion(cleaned)
      };
    });
  }

  async deleteRows(alias, rowIds, trashStore, actor, options = {}) {
    const idSet = new Set((Array.isArray(rowIds) ? rowIds : []).map((item) => String(item || "")).filter(Boolean));
    if (!idSet.size) {
      const error = new Error("rowIds ต้องเป็น array ที่มีค่าอย่างน้อย 1 รายการ");
      error.status = 400;
      throw error;
    }

    return this.runExclusive(alias, async () => {
      const loaded = await this.loadTable(alias);
      const expectedVersion = String(options.expectedVersion || "").trim();
      if (expectedVersion && loaded.version !== expectedVersion) {
        const error = new Error("ข้อมูลถูกแก้ไขโดยผู้ใช้อื่น กรุณารีเฟรชแล้วลองใหม่อีกครั้ง");
        error.status = 409;
        error.code = "VERSION_CONFLICT";
        error.currentVersion = loaded.version;
        throw error;
      }
      const keptRows = [];
      const removedRows = [];

      for (const row of loaded.rows) {
        if (idSet.has(String(row.__rowid || ""))) {
          removedRows.push(row);
        } else {
          keptRows.push(row);
        }
      }

      if (!removedRows.length) {
        return {
          alias,
          deleted: 0,
          kept: keptRows.length,
          trashSaved: 0,
          version: loaded.version
        };
      }

      const cleaned = keptRows.map((row) => this.cleanRow(row));
      await this.ensureDirectories();
      const targetPath = this.overrideFile(alias);
      await fs.writeFile(targetPath, `${JSON.stringify(cleaned, null, 2)}\n`, "utf8");

      const trashed = await trashStore.addDeletedRows(alias, removedRows, actor);

      return {
        alias,
        deleted: removedRows.length,
        kept: keptRows.length,
        trashSaved: trashed.length,
        version: this.createVersion(cleaned)
      };
    });
  }

  async deleteOverride(alias) {
    if (!this.isSafeAlias(alias)) {
      const error = new Error("alias ไม่ถูกต้อง");
      error.status = 400;
      throw error;
    }

    const target = this.overrideFile(alias);
    if (!(await this.fileExists(target))) {
      const error = new Error("ไม่พบไฟล์ override");
      error.status = 404;
      throw error;
    }

    await fs.unlink(target);
  }
}

module.exports = {
  TableStore
};
