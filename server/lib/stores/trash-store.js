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
  }

  async ensure() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch {
      await fs.writeFile(this.filePath, "[]\n", "utf8");
    }
  }

  async readAll() {
    await this.ensure();
    const raw = await fs.readFile(this.filePath, "utf8");
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed;
  }

  async writeAll(records) {
    await this.ensure();
    await fs.writeFile(this.filePath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
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
  }

  async purgeExpired() {
    const now = Date.now();
    const rows = await this.readAll();
    const filtered = rows.filter((row) => !this.isExpired(row, now));
    if (filtered.length !== rows.length) {
      await this.writeAll(filtered);
    }
    return {
      removed: rows.length - filtered.length
    };
  }

  async purgeAll(options = {}) {
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

    await this.purgeExpired();
    const now = Date.now();
    const restoreTimestamp = nowIso();
    const records = await this.readAll();

    const byAlias = new Map();
    for (const record of records) {
      if (!ids.has(String(record.trashId || ""))) continue;
      const list = byAlias.get(record.alias) || [];
      list.push(record);
      byAlias.set(record.alias, list);
    }

    let restored = 0;
    let skipped = 0;
    const restoredAliases = new Set();

    for (const [alias, recordsByAlias] of byAlias.entries()) {
      const loaded = await this.tableStore.loadTable(alias);
      const currentRows = loaded.rows.map((row) => ({ ...row }));
      const existingKeys = new Set(currentRows.map((row) => this.tableStore.rowIdentityKey(alias, row)));
      let changed = false;

      for (const record of recordsByAlias) {
        if (record.restoredAt) {
          skipped += 1;
          continue;
        }
        if (this.isExpired(record, now)) {
          skipped += 1;
          continue;
        }

        const rowKey = this.tableStore.rowIdentityKey(alias, record.row || {});
        if (existingKeys.has(rowKey)) {
          record.restoredAt = restoreTimestamp;
          record.restoredBy = sanitizeText(actor?.username || "anonymous", 80);
          record.restoreResult = "already_exists";
          skipped += 1;
          continue;
        }

        currentRows.push({ ...(record.row || {}) });
        existingKeys.add(rowKey);
        record.restoredAt = restoreTimestamp;
        record.restoredBy = sanitizeText(actor?.username || "anonymous", 80);
        record.restoreResult = "restored";
        restored += 1;
        changed = true;
      }

      if (changed) {
        await this.tableStore.saveTable(alias, currentRows);
        restoredAliases.add(alias);
      }
    }

    await this.writeAll(records);

    return {
      requested: ids.size,
      restored,
      skipped,
      restoredAliases: [...restoredAliases]
    };
  }
}

module.exports = {
  TrashStore
};
