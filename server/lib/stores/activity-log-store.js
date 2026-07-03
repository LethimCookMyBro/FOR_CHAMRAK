"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { nowIso, sanitizeText, toDateTs } = require("../helpers");

const DAY_MS = 24 * 60 * 60 * 1000;

class ActivityLogStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async ensure() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch {
      await fs.writeFile(this.filePath, "", "utf8");
    }
  }

  createEntry(payload) {
    return {
      id: crypto.randomUUID(),
      timestamp: nowIso(),
      type: sanitizeText(payload.type || "system", 48),
      action: sanitizeText(payload.action || "UNKNOWN", 64),
      resource: sanitizeText(payload.resource || "-", 160),
      user: sanitizeText(payload.user || "anonymous", 80),
      ip: sanitizeText(payload.ip || "-", 120),
      detail: sanitizeText(payload.detail || "", 600),
      status: sanitizeText(payload.status || "ok", 24)
    };
  }

  async append(payload) {
    await this.ensure();
    const entry = this.createEntry(payload);
    await fs.appendFile(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
    return entry;
  }

  async readAll() {
    await this.ensure();
    const raw = await fs.readFile(this.filePath, "utf8");
    const lines = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const rows = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed && typeof parsed === "object") rows.push(parsed);
      } catch {
        // Skip broken lines to avoid blocking the app.
      }
    }
    return rows;
  }

  filterRows(rows, filters) {
    const fromTs = toDateTs(filters.from);
    const toTs = toDateTs(filters.to);
    const user = sanitizeText(filters.user || "", 80).toLowerCase();
    const type = sanitizeText(filters.type || "", 48).toLowerCase();
    const action = sanitizeText(filters.action || "", 64).toLowerCase();

    return rows.filter((row) => {
      const ts = toDateTs(row.timestamp);
      if (fromTs && (!ts || ts < fromTs)) return false;
      if (toTs && (!ts || ts > toTs + DAY_MS - 1)) return false;
      if (user && !String(row.user || "").toLowerCase().includes(user)) return false;
      if (type && !String(row.type || "").toLowerCase().includes(type)) return false;
      if (action && !String(row.action || "").toLowerCase().includes(action)) return false;
      return true;
    });
  }

  async query(filters = {}) {
    const page = Math.max(1, Number(filters.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(filters.pageSize) || 40));

    const rows = await this.readAll();
    const filtered = this.filterRows(rows, filters).sort((a, b) => {
      const bt = toDateTs(b.timestamp) || 0;
      const at = toDateTs(a.timestamp) || 0;
      return bt - at;
    });

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);

    return {
      total,
      page,
      pageSize,
      items
    };
  }

  escapeCsv(value) {
    const text = String(value ?? "").replaceAll('"', '""');
    return `"${text}"`;
  }

  async exportCsv(filters = {}) {
    const rows = this.filterRows(await this.readAll(), filters).sort((a, b) => {
      const bt = toDateTs(b.timestamp) || 0;
      const at = toDateTs(a.timestamp) || 0;
      return bt - at;
    });
    const header = ["timestamp", "user", "type", "action", "resource", "detail", "status", "ip"].join(",");
    const body = rows
      .map((row) =>
        [
          this.escapeCsv(row.timestamp),
          this.escapeCsv(row.user),
          this.escapeCsv(row.type),
          this.escapeCsv(row.action),
          this.escapeCsv(row.resource),
          this.escapeCsv(row.detail),
          this.escapeCsv(row.status),
          this.escapeCsv(row.ip)
        ].join(",")
      )
      .join("\n");
    return `${header}\n${body}\n`;
  }
}

module.exports = {
  ActivityLogStore
};
