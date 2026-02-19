import { INTERNAL_KEYS } from "./config.js";

class DataRepository {
  constructor(apiBase, dataRoot, storagePrefix) {
    this.apiBase = apiBase;
    this.dataRoot = dataRoot;
    this.storagePrefix = storagePrefix;
    this.workingCache = new Map();
    this.tableVersions = new Map();
    this.mode = "unknown";
    this.runtimeApiBaseCache = "";
    this.runtimeApiBaseCacheAt = 0;
  }

  redirectToLogin() {
    if (typeof window === "undefined") return;
    const currentPath = String(window.location.pathname || "");
    if (currentPath === "/login.html") return;
    window.location.replace("/login.html");
  }

  sanitizeAlias(alias) {
    const text = String(alias || "").trim();
    if (!/^[A-Za-z0-9_]+$/.test(text)) {
      throw new Error("alias ไม่ถูกต้อง");
    }
    return text;
  }

  normalizeBasePath(value, fallback = "") {
    const raw = String(value || "").trim();
    const withSlash = raw ? (raw.startsWith("/") ? raw : `/${raw}`) : fallback;
    const normalized = withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
    if (!normalized) return "";
    if (!/^\/[A-Za-z0-9/_-]*$/.test(normalized)) return fallback || "";
    return normalized;
  }

  parseRuntimeApiBase(scriptText) {
    const script = String(scriptText || "");
    const match = script.match(/__LTC_RUNTIME_CONFIG__\s*=\s*(\{[\s\S]*?\})\s*;/);
    if (!match) return "";

    try {
      const parsed = JSON.parse(match[1]);
      return this.normalizeBasePath(parsed?.apiBase, "");
    } catch {
      return "";
    }
  }

  async getRuntimeApiBase() {
    if (typeof window === "undefined") return "";

    const fromWindow = this.normalizeBasePath(window.__LTC_RUNTIME_CONFIG__?.apiBase, "");
    if (fromWindow) return fromWindow;

    const now = Date.now();
    if (this.runtimeApiBaseCache && now - this.runtimeApiBaseCacheAt < 60 * 1000) {
      return this.runtimeApiBaseCache;
    }

    try {
      const response = await fetch("/public/runtime-config.js", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { "X-Requested-With": "XMLHttpRequest" }
      });
      if (!response.ok) return this.runtimeApiBaseCache;
      const script = await response.text();
      const parsed = this.parseRuntimeApiBase(script);
      if (parsed) {
        this.runtimeApiBaseCache = parsed;
        this.runtimeApiBaseCacheAt = now;
      }
      return parsed || this.runtimeApiBaseCache;
    } catch {
      return this.runtimeApiBaseCache;
    }
  }

  buildAiApiCandidates(runtimeApiBase) {
    const candidates = [
      this.normalizeBasePath(this.apiBase, ""),
      this.normalizeBasePath(runtimeApiBase, ""),
      "/api"
    ];
    return [...new Set(candidates.filter(Boolean))];
  }

  requestAiChat(apiBase, text, safeHistory) {
    return this.requestJson(`${apiBase}/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history: safeHistory })
    });
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

    if (response.status === 401) {
      error.authRequired = true;
    }

    if (response.status === 409 && error.code === "VERSION_CONFLICT") {
      error.versionConflict = true;
    }
    if (response.status === 503 && String(error.code || "").startsWith("AI_QUEUE_")) {
      error.aiBusy = true;
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
      const error = new Error("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ (network error)");
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
      if (error?.authRequired) {
        this.redirectToLogin();
      }
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
      if (error?.authRequired) {
        this.redirectToLogin();
        throw error;
      }

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
      if (error?.authRequired) {
        this.redirectToLogin();
        throw error;
      }

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

  async getStorageInfo() {
    try {
      const payload = await this.requestJson(`${this.apiBase}/storage`);
      return {
        mode: "backend",
        storage: payload
      };
    } catch (error) {
      if (error?.authRequired) {
        this.redirectToLogin();
        throw error;
      }
      return {
        mode: "local",
        storage: {
          source: "backend unavailable",
          edits: "ไม่สามารถเชื่อมต่อ backend ได้"
        }
      };
    }
  }

  async askAi(message, history = []) {
    const text = String(message || "").trim();
    if (!text) throw new Error("กรุณากรอกข้อความ");

    const safeHistory = (Array.isArray(history) ? history : [])
      .slice(-10)
      .map((item) => ({
        role: String(item?.role || "").toLowerCase() === "assistant" ? "assistant" : "user",
        text: String(item?.text || "").slice(0, 800)
      }));

    const requestWithRetry = async (apiBase) => {
      try {
        return await this.requestAiChat(apiBase, text, safeHistory);
      } catch (error) {
        if (!error?.networkError) throw error;
        // Retry once for transient browser/proxy network issues.
        await new Promise((resolve) => setTimeout(resolve, 350));
        return this.requestAiChat(apiBase, text, safeHistory);
      }
    };

    const runtimeApiBase = await this.getRuntimeApiBase();
    const candidates = this.buildAiApiCandidates(runtimeApiBase);
    let lastError = null;

    for (let i = 0; i < candidates.length; i += 1) {
      const apiBase = candidates[i];
      try {
        const payload = await requestWithRetry(apiBase);
        this.apiBase = apiBase;
        return payload;
      } catch (error) {
        if (error?.authRequired) {
          this.redirectToLogin();
          throw error;
        }

        lastError = error;
        const shouldTryNext = (error?.status === 404 || error?.networkError) && i < candidates.length - 1;
        if (!shouldTryNext) throw error;
      }
    }

    throw lastError || new Error("ไม่สามารถเชื่อมต่อ AI endpoint ได้");
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
    const params = new URLSearchParams();
    if (filters.from) params.set("from", String(filters.from));
    if (filters.to) params.set("to", String(filters.to));
    if (filters.user) params.set("user", String(filters.user));
    if (filters.type) params.set("type", String(filters.type));
    if (filters.action) params.set("action", String(filters.action));
    if (filters.page) params.set("page", String(filters.page));
    if (filters.pageSize) params.set("pageSize", String(filters.pageSize));

    const query = params.toString();
    return this.requestJson(`${this.apiBase}/logs${query ? `?${query}` : ""}`);
  }

  async exportActivityLogs(filters = {}) {
    const params = new URLSearchParams();
    if (filters.from) params.set("from", String(filters.from));
    if (filters.to) params.set("to", String(filters.to));
    if (filters.user) params.set("user", String(filters.user));
    if (filters.type) params.set("type", String(filters.type));
    if (filters.action) params.set("action", String(filters.action));

    const query = params.toString();
    const response = await fetch(`${this.apiBase}/logs/export${query ? `?${query}` : ""}`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { "X-Requested-With": "XMLHttpRequest" }
    });
    if (response.status === 401) {
      const error = new Error("ต้องเข้าสู่ระบบใหม่");
      error.authRequired = true;
      throw error;
    }
    if (!response.ok) {
      throw new Error(`export logs failed ${response.status}`);
    }
    return response.text();
  }

  async listTrash(options = {}) {
    const params = new URLSearchParams();
    if (options.alias) params.set("alias", String(options.alias));
    if (options.includeRestored) params.set("includeRestored", "1");

    const query = params.toString();
    return this.requestJson(`${this.apiBase}/trash${query ? `?${query}` : ""}`);
  }

  async restoreTrash(trashIds) {
    const ids = Array.isArray(trashIds) ? trashIds.map((item) => String(item || "")).filter(Boolean) : [];
    if (!ids.length) throw new Error("กรุณาเลือกข้อมูลที่ต้องการกู้คืน");

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
