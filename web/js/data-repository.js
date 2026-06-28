import { INTERNAL_KEYS } from "./config.js";

class DataRepository {
  constructor(apiBase, dataRoot, storagePrefix) {
    this.apiBase = apiBase;
    this.dataRoot = dataRoot;
    this.storagePrefix = storagePrefix;
    this.workingCache = new Map();
    this.tableVersions = new Map();
    this.mode = "unknown";
  }

  sanitizeAlias(alias) {
    const text = String(alias || "").trim();
    if (!/^[A-Za-z0-9_]+$/.test(text)) {
      throw new Error("alias ไม่ถูกต้อง ใช้ได้เฉพาะตัวอักษรภาษาอังกฤษ ตัวเลข และขีดล่าง");
    }
    return text;
  }

  buildRequestError(response, payload) {
    const message = String(payload?.error || `request error ${response.status}`);
    const error = new Error(message);
    error.status = response.status;
    const requestIdFromHeader = response?.headers?.get?.("x-request-id");

    if (payload && typeof payload === "object") {
      if (payload.code) error.code = String(payload.code);
      if (payload.currentVersion) error.currentVersion = String(payload.currentVersion);
      if (payload.retryAfter) error.retryAfter = Number(payload.retryAfter) || 0;
      if (payload.requestId) error.requestId = String(payload.requestId);
    }
    if (!error.requestId && requestIdFromHeader) {
      error.requestId = String(requestIdFromHeader);
    }

    if (response.status === 409 && error.code === "VERSION_CONFLICT") {
      error.versionConflict = true;
    }

    return error;
  }

  async requestJson(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (!headers.has("X-Requested-With")) {
      headers.set("X-Requested-With", "XMLHttpRequest");
    }

    let response;
    try {
      response = await fetch(url, {
        cache: "no-store",
        credentials: "same-origin",
        ...options,
        headers
      });
    } catch {
      const error = new Error("เชื่อมต่อระบบบันทึกข้อมูลไม่ได้ (network error)");
      error.networkError = true;
      throw error;
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw this.buildRequestError(response, payload);
    }

    return payload;
  }

  async getTable(alias) {
    alias = this.sanitizeAlias(alias);
    if (this.workingCache.has(alias)) return this.workingCache.get(alias);

    try {
      const remote = await this.fetchRemoteTable(alias);
      this.mode = "backend";

      if (remote.version) this.tableVersions.set(alias, remote.version);
      else this.tableVersions.delete(alias);

      const attached = this.attachRowIds(alias, remote.rows);
      this.workingCache.set(alias, attached);
      return attached;
    } catch (error) {
      throw error;
    }
  }

  async saveTable(alias, rows) {
    alias = this.sanitizeAlias(alias);
    const cleanRows = this.normalizeRows(rows).map((row) => this.stripInternalKeys(row));
    const ifVersion = String(this.tableVersions.get(alias) || "");

    try {
      const payload = await this.saveRemoteTable(alias, cleanRows, ifVersion);
      this.mode = "backend";

      const nextRows = Array.isArray(payload?.data) ? payload.data : cleanRows;
      const nextVersion = String(payload?.version || "");
      if (nextVersion) this.tableVersions.set(alias, nextVersion);
      else this.tableVersions.delete(alias);

      const attached = this.attachRowIds(alias, nextRows);
      this.workingCache.set(alias, attached);
      return attached;
    } catch (error) {
      if (error?.versionConflict) {
        this.workingCache.delete(alias);
        if (error.currentVersion) this.tableVersions.set(alias, String(error.currentVersion));
      }

      throw error;
    }
  }

  async deleteRows(alias, rowIds) {
    alias = this.sanitizeAlias(alias);
    const ids = Array.isArray(rowIds) ? rowIds.map((item) => String(item || "")).filter(Boolean) : [];
    if (!ids.length) {
      throw new Error("rowIds ต้องมีอย่างน้อย 1 รายการ");
    }

    const ifVersion = String(this.tableVersions.get(alias) || "");

    try {
      const payload = await this.requestJson(`${this.apiBase}/tables/${encodeURIComponent(alias)}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowIds: ids, ifVersion })
      });
      this.mode = "backend";
      this.workingCache.delete(alias);

      const nextVersion = String(payload?.version || "");
      if (nextVersion) this.tableVersions.set(alias, nextVersion);
      else this.tableVersions.delete(alias);

      return payload;
    } catch (error) {
      if (error?.versionConflict) {
        this.workingCache.delete(alias);
        if (error.currentVersion) this.tableVersions.set(alias, String(error.currentVersion));
      }

      throw error;
    }
  }

  async cloneTable(alias) {
    const rows = await this.getTable(alias);
    return rows.map((row) => ({ ...row }));
  }

  clearTableCache(alias, options = {}) {
    const includeVersion = options.includeVersion !== false;
    if (!alias) {
      this.workingCache.clear();
      if (includeVersion) this.tableVersions.clear();
      return;
    }

    const key = String(alias);
    this.workingCache.delete(key);
    if (includeVersion) this.tableVersions.delete(key);
  }

  buildQueryString(source, fields) {
    const params = new URLSearchParams();
    for (const field of fields) {
      if (source?.[field]) params.set(field, String(source[field]));
    }
    const query = params.toString();
    return query ? `?${query}` : "";
  }

  async getStorageInfo() {
    try {
      const payload = await this.requestJson(`${this.apiBase}/storage`);
      return {
        mode: "backend",
        storage: payload
      };
    } catch (error) {
      return {
        mode: "local",
        storage: {
          source: "backend unavailable",
          edits: "เชื่อมต่อ backend ไม่ได้"
        }
      };
    }
  }

  async runSecurityScan() {
    const payload = await this.requestJson(`${this.apiBase}/security/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ simulate: true })
    });
    return payload;
  }

  async listActivityLogs(filters = {}) {
    const query = this.buildQueryString(filters, ["from", "to", "user", "type", "action", "page", "pageSize"]);
    return this.requestJson(`${this.apiBase}/logs${query}`);
  }

  async exportActivityLogs(filters = {}) {
    const query = this.buildQueryString(filters, ["from", "to", "user", "type", "action"]);
    const response = await fetch(`${this.apiBase}/logs/export${query}`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { "X-Requested-With": "XMLHttpRequest" }
    });
    if (!response.ok) {
      throw new Error(`export logs failed ${response.status}`);
    }
    return response.text();
  }

  async listTrash(options = {}) {
    const query = this.buildQueryString(
      {
        alias: options.alias,
        includeRestored: options.includeRestored ? "1" : ""
      },
      ["alias", "includeRestored"]
    );
    return this.requestJson(`${this.apiBase}/trash${query}`);
  }

  async restoreTrash(trashIds) {
    const ids = Array.isArray(trashIds) ? trashIds.map((item) => String(item || "")).filter(Boolean) : [];
    if (!ids.length) throw new Error("กรุณาเลือกรายการที่ต้องการกู้คืน");

    const payload = await this.requestJson(`${this.apiBase}/trash/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashIds: ids })
    });

    const restoredAliases = Array.isArray(payload?.restoredAliases) ? payload.restoredAliases : [];
    for (const alias of restoredAliases) {
      this.clearTableCache(alias);
    }

    return payload;
  }

  async purgeExpiredTrash() {
    return this.requestJson(`${this.apiBase}/trash/purge-expired`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
  }

  async purgeAllTrash(options = {}) {
    return this.requestJson(`${this.apiBase}/trash/purge-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alias: options.alias ? String(options.alias) : "",
        includeRestored: options.includeRestored !== false
      })
    });
  }

  createRowId(alias) {
    return `${alias}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  normalizeRows(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return [value];
    return [];
  }

  attachRowIds(alias, rows) {
    return rows.map((row, index) => {
      const next = { ...row };
      if (!next.__rowid) {
        next.__rowid = `${alias}_${index + 1}_${Math.random().toString(36).slice(2, 9)}`;
      }
      return next;
    });
  }

  getNextNumeric(rows, key) {
    let max = 0;
    for (const row of rows) {
      const value = Number(row[key]);
      if (Number.isFinite(value) && value > max) max = value;
    }
    return max + 1;
  }

  stripInternalKeys(row) {
    const clean = {};
    for (const [key, value] of Object.entries(row)) {
      if (!INTERNAL_KEYS.has(key)) clean[key] = value;
    }
    return clean;
  }

  async fetchRemoteTable(alias) {
    const payload = await this.requestJson(`${this.apiBase}/tables/${encodeURIComponent(alias)}`);
    if (Array.isArray(payload)) {
      return {
        rows: this.normalizeRows(payload),
        version: ""
      };
    }

    return {
      rows: this.normalizeRows(payload?.rows),
      version: String(payload?.version || "")
    };
  }

  async saveRemoteTable(alias, rows, ifVersion = "") {
    const body = { rows };
    if (ifVersion) body.ifVersion = ifVersion;

    return this.requestJson(`${this.apiBase}/tables/${encodeURIComponent(alias)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }
}

export { DataRepository };
