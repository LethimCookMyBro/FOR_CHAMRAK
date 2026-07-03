"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { nowIso, sanitizeText, toDateTs } = require("../helpers");

const DAY_MS = 24 * 60 * 60 * 1000;

class TrashStore {
  constructor(filePath, retentionDays, tableStore) {
    this.filePath = filePath;
    this.retentionDays = retentionDays;
    this.tableStore = tableStore;
    this.writeChain = Promise.resolve();
  }

  async ensure() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch {
      await fs.writeFile(this.filePath, "[]\n", "utf8");
    }
  }

  async runExclusive(handler) {
    const previous = this.writeChain || Promise.resolve();
    let release = null;
    const current = new Promise((resolve) => {
      release = resolve;
    });
    this.writeChain = previous.then(() => current);

    await previous;
    try {
      return await handler();
    } finally {
      release();
    }
  }

  sanitizeRecord(record) {
    if (!record || typeof record !== "object" || Array.isArray(record)) return null;
    return { ...record };
  }

  normalizeRecordList(value) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => this.sanitizeRecord(item)).filter(Boolean);
  }

  extractJsonChunks(text) {
    const chunks = [];
    const source = String(text || "");
    let index = 0;

    while (index < source.length) {
      while (index < source.length && /\s/.test(source[index])) index += 1;
      if (index >= source.length) break;

      const start = source[index];
      if (start !== "[" && start !== "{") break;

      const stack = [start];
      let inString = false;
      let escaped = false;
      let cursor = index + 1;

      for (; cursor < source.length; cursor += 1) {
        const ch = source[cursor];
        if (inString) {
          if (escaped) {
            escaped = false;
            continue;
          }
          if (ch === "\\") {
            escaped = true;
            continue;
          }
          if (ch === '"') inString = false;
          continue;
        }

        if (ch === '"') {
          inString = true;
          continue;
        }

        if (ch === "[" || ch === "{") {
          stack.push(ch);
          continue;
        }

        if (ch === "]") {
          if (stack[stack.length - 1] !== "[") return chunks;
          stack.pop();
          if (!stack.length) {
            cursor += 1;
            break;
          }
          continue;
        }

        if (ch === "}") {
          if (stack[stack.length - 1] !== "{") return chunks;
          stack.pop();
          if (!stack.length) {
            cursor += 1;
            break;
          }
        }
      }

      if (stack.length > 0) break;
      chunks.push(source.slice(index, cursor));
      index = cursor;
    }

    return chunks;
  }

  parseRecords(rawText) {
    const text = String(rawText || "").trim();
    if (!text) {
      return { records: [], repaired: false, reason: "" };
    }

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return {
          records: this.normalizeRecordList(parsed),
          repaired: false,
          reason: ""
        };
      }
      const single = this.sanitizeRecord(parsed);
      return {
        records: single ? [single] : [],
        repaired: true,
        reason: "wrapped-object"
      };
    } catch {
      // Fall through to salvage mode.
    }

    const chunks = this.extractJsonChunks(text);
    if (chunks.length) {
      const merged = [];
      let parsedChunks = 0;
      for (const chunk of chunks) {
        try {
          const parsed = JSON.parse(chunk);
          if (Array.isArray(parsed)) {
            merged.push(...this.normalizeRecordList(parsed));
          } else {
            const item = this.sanitizeRecord(parsed);
            if (item) merged.push(item);
          }
          parsedChunks += 1;
        } catch {
          // Skip broken chunk and continue salvage.
        }
      }
      if (parsedChunks > 0) {
        return {
          records: merged,
          repaired: true,
          reason: "chunk-salvage"
        };
      }
    }

    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const lineRecords = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (Array.isArray(parsed)) {
          lineRecords.push(...this.normalizeRecordList(parsed));
        } else {
          const item = this.sanitizeRecord(parsed);
          if (item) lineRecords.push(item);
        }
      } catch {
        // Skip broken line and continue salvage.
      }
    }
    if (lineRecords.length > 0) {
      return {
        records: lineRecords,
        repaired: true,
        reason: "line-salvage"
      };
    }

    return {
      records: [],
      repaired: true,
      reason: "reset-empty"
    };
  }

  async backupCorruptedRaw(rawText) {
    try {
      const backupPath = `${this.filePath}.corrupt-${Date.now()}.json`;
      await fs.writeFile(backupPath, String(rawText || ""), "utf8");
    } catch (error) {
      console.warn(`[trash-store] failed to write corrupted backup: ${error.message || error}`);
    }
  }

  async readAll() {
    await this.ensure();
    const raw = await fs.readFile(this.filePath, "utf8");
    const parsed = this.parseRecords(raw);
    if (!parsed.repaired) return parsed.records;

    await this.backupCorruptedRaw(raw);
    await this.writeAll(parsed.records);
    console.warn(`[trash-store] repaired malformed trash file (${parsed.reason}), records=${parsed.records.length}`);
    return parsed.records;
  }

  async writeFileAtomic(text) {
    await this.ensure();
    const tmpPath = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmpPath, text, "utf8");
    await fs.rename(tmpPath, this.filePath);
  }

  async writeAll(records) {
    const normalized = this.normalizeRecordList(records);
    await this.writeFileAtomic(`${JSON.stringify(normalized, null, 2)}\n`);
  }

  expiresAtDate() {
    return new Date(Date.now() + this.retentionDays * DAY_MS).toISOString();
  }

  isExpired(record, now = Date.now()) {
    const expires = toDateTs(record?.expiresAt);
    return Boolean(expires && expires <= now);
  }

  buildRowPreview(row) {
    const fields = [
      row["ชื่อ"] || row["ชื่อสกุล"] || row["หน่วย"] || row.productName || row.productID || "-",
      row["เลขประชาชน"] || row["รหัสcg"] || row["รหัสcm"] || row["รหัสหน่วย"] || row.ID || ""
    ]
      .map((item) => sanitizeText(item, 60))
      .filter(Boolean);
    return fields.join(" | ");
  }

  async addDeletedRows(alias, rows, actor) {
    return this.runExclusive(async () => {
      const records = await this.readAll();
      const deletedAt = nowIso();
      const expiresAt = this.expiresAtDate();

      const added = rows.map((row) => {
        const clean = this.tableStore.cleanRow(row);
        return {
          trashId: crypto.randomUUID(),
          alias,
          row: clean,
          rowIdentity: this.tableStore.rowIdentityKey(alias, clean),
          preview: this.buildRowPreview(clean),
          deletedAt,
          expiresAt,
          deletedBy: sanitizeText(actor?.username || "anonymous", 80),
          deletedByIp: sanitizeText(actor?.ip || "-", 120),
          restoredAt: null,
          restoredBy: null,
          restoreResult: null
        };
      });

      records.push(...added);
      await this.writeAll(records);
      return added;
    });
  }

  async purgeExpired() {
    return this.runExclusive(async () => {
      const now = Date.now();
      const rows = await this.readAll();
      const filtered = rows.filter((row) => !this.isExpired(row, now));
      if (filtered.length !== rows.length) {
        await this.writeAll(filtered);
      }
      return {
        removed: rows.length - filtered.length
      };
    });
  }

  async purgeAll(options = {}) {
    return this.runExclusive(async () => {
      const alias = sanitizeText(options.alias || "", 80);
      const includeRestored = options.includeRestored !== false;
      const rows = await this.readAll();

      const kept = [];
      let removed = 0;

      for (const row of rows) {
        if (alias && String(row.alias || "") !== alias) {
          kept.push(row);
          continue;
        }
        if (!includeRestored && row.restoredAt) {
          kept.push(row);
          continue;
        }

        removed += 1;
      }

      if (removed > 0) {
        await this.writeAll(kept);
      }

      return {
        removed,
        remaining: kept.length
      };
    });
  }

  getDaysLeft(record, now = Date.now()) {
    const expires = toDateTs(record?.expiresAt);
    if (!expires) return 0;
    return Math.max(0, Math.ceil((expires - now) / DAY_MS));
  }

  async list(options = {}) {
    await this.purgeExpired();
    const now = Date.now();

    const alias = sanitizeText(options.alias || "", 80);
    const includeRestored = Boolean(options.includeRestored);
    const rows = await this.readAll();

    const items = rows
      .filter((row) => {
        if (alias && String(row.alias || "") !== alias) return false;
        if (!includeRestored && row.restoredAt) return false;
        return !this.isExpired(row, now);
      })
      .sort((a, b) => (toDateTs(b.deletedAt) || 0) - (toDateTs(a.deletedAt) || 0))
      .map((row) => ({
        trashId: row.trashId,
        alias: row.alias,
        preview: row.preview,
        deletedAt: row.deletedAt,
        deletedBy: row.deletedBy,
        expiresAt: row.expiresAt,
        daysLeft: this.getDaysLeft(row, now),
        restoredAt: row.restoredAt,
        restoredBy: row.restoredBy,
        restoreResult: row.restoreResult
      }));

    return {
      count: items.length,
      items
    };
  }

  async restore(trashIds, actor) {
    const ids = new Set((Array.isArray(trashIds) ? trashIds : []).map((item) => String(item || "")).filter(Boolean));
    if (!ids.size) {
      const error = new Error("trashIds ต้องเป็น array ที่มีค่าอย่างน้อย 1 รายการ");
      error.status = 400;
      throw error;
    }

    return this.runExclusive(async () => {
      const now = Date.now();
      const restoreTimestamp = nowIso();
      const records = await this.readAll();
      const byAlias = new Map();

      for (const record of records) {
        if (this.isExpired(record, now)) continue;
        if (!ids.has(String(record.trashId || ""))) continue;
        const list = byAlias.get(record.alias) || [];
        list.push(record);
        byAlias.set(record.alias, list);
      }

      const kept = records.filter((record) => !this.isExpired(record, now));
      let restored = 0;
      let skipped = 0;
      const restoredAliases = new Set();

      for (const [alias, recordsByAlias] of byAlias.entries()) {
        let loaded = await this.tableStore.loadTable(alias);
        let pendingRows = [];
        const restoredRecords = [];
        let changed = false;

        for (const record of recordsByAlias) {
          if (record.restoredAt) {
            skipped += 1;
            continue;
          }

          // Each trash record represents one deleted copy, so restore it as its
          // own row. We intentionally do not dedupe by row identity here: rows
          // without a unique key (e.g. repeated visits, identical payments)
          // share the same identity hash, and skipping "already existing"
          // identities would silently drop every duplicate after the first.
          pendingRows.push({ ...(record.row || {}) });
          restoredRecords.push(record);
          changed = true;
        }

        if (changed) {
          // ponytail: bounded optimistic retry avoids a cross-store lock while still honoring table version conflicts.
          for (let attempt = 0; ; attempt += 1) {
            const currentRows = loaded.rows.map((row) => ({ ...row }));
            currentRows.push(...pendingRows.map((row) => ({ ...row })));
            try {
              await this.tableStore.saveTable(alias, currentRows, {
                expectedVersion: loaded.version
              });
              break;
            } catch (error) {
              if (error?.code !== "VERSION_CONFLICT" || attempt >= 2) throw error;
              loaded = await this.tableStore.loadTable(alias);
              pendingRows = restoredRecords.map((record) => ({ ...(record.row || {}) }));
            }
          }
          for (const record of restoredRecords) {
            record.restoredAt = restoreTimestamp;
            record.restoredBy = sanitizeText(actor?.username || "anonymous", 80);
            record.restoreResult = "restored";
          }
          restored += restoredRecords.length;
          await this.writeAll(kept);
          restoredAliases.add(alias);
        }
      }

      return {
        requested: ids.size,
        restored,
        skipped,
        restoredAliases: [...restoredAliases]
      };
    });
  }
}

module.exports = {
  TrashStore
};
