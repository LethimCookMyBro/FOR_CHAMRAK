import { INTERNAL_KEYS } from "./config.js";

class DataRepository {
  constructor(apiBase, dataRoot, storagePrefix) {
    this.apiBase = apiBase;
    this.dataRoot = dataRoot;
    this.storagePrefix = storagePrefix;
    this.sourceCache = new Map();
    this.workingCache = new Map();
    this.mode = "unknown";
  }

  async getTable(alias) {
    if (this.workingCache.has(alias)) return this.workingCache.get(alias);

    let rows;
    try {
      rows = await this.fetchRemoteTable(alias);
      this.mode = "backend";
    } catch (error) {
      console.warn("โหลดจาก backend ไม่สำเร็จ ใช้ fallback", alias, error);
      rows = await this.getFallbackTable(alias);
      this.mode = "local";
    }

    const attached = this.attachRowIds(alias, rows);
    this.workingCache.set(alias, attached);
    return attached;
  }

  async saveTable(alias, rows) {
    const cleanRows = this.normalizeRows(rows).map((row) => this.stripInternalKeys(row));

    try {
      await this.saveRemoteTable(alias, cleanRows);
      this.mode = "backend";
      localStorage.removeItem(`${this.storagePrefix}${alias}`);
    } catch (error) {
      console.warn("บันทึก backend ไม่สำเร็จ ใช้ fallback localStorage", alias, error);
      this.mode = "local";
      localStorage.setItem(`${this.storagePrefix}${alias}`, JSON.stringify(cleanRows));
    }

    const attached = this.attachRowIds(alias, cleanRows);
    this.workingCache.set(alias, attached);
    return attached;
  }

  async cloneTable(alias) {
    const rows = await this.getTable(alias);
    return rows.map((row) => ({ ...row }));
  }

  async getStorageInfo() {
    try {
      const response = await fetch(`${this.apiBase}/storage`, { cache: "no-store" });
      if (!response.ok) throw new Error("status not ok");
      const payload = await response.json();
      return {
        mode: "backend",
        storage: payload
      };
    } catch {
      return {
        mode: "local",
        storage: {
          source: "chamrak_export/data/*.json",
          edits: "localStorage (key prefix: chamrak_edit_)"
        }
      };
    }
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

  async getFallbackTable(alias) {
    const saved = localStorage.getItem(`${this.storagePrefix}${alias}`);
    if (saved) {
      try {
        return this.normalizeRows(JSON.parse(saved));
      } catch (error) {
        console.warn("อ่าน localStorage ไม่สำเร็จ", alias, error);
      }
    }
    return (await this.getSourceTable(alias)).map((row) => ({ ...row }));
  }

  async getSourceTable(alias) {
    if (this.sourceCache.has(alias)) return this.sourceCache.get(alias);
    const rows = this.normalizeRows(await this.getJson(`${this.dataRoot}/data/${alias}.json`));
    this.sourceCache.set(alias, rows);
    return rows;
  }

  async fetchRemoteTable(alias) {
    const response = await fetch(`${this.apiBase}/tables/${encodeURIComponent(alias)}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`remote table error ${response.status}`);
    }
    const payload = await response.json();
    if (Array.isArray(payload)) return this.normalizeRows(payload);
    return this.normalizeRows(payload?.rows);
  }

  async saveRemoteTable(alias, rows) {
    const response = await fetch(`${this.apiBase}/tables/${encodeURIComponent(alias)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows })
    });
    if (!response.ok) {
      let detail = "";
      try {
        const payload = await response.json();
        detail = payload?.error || "";
      } catch {
        detail = "";
      }
      throw new Error(`remote save error ${response.status} ${detail}`.trim());
    }
  }

  async getJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`โหลดไฟล์ไม่สำเร็จ: ${path} (${response.status})`);
    }
    return response.json();
  }
}

export { DataRepository };
