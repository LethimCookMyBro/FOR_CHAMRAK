function normalizeBasePath(value, fallback) {
  const raw = String(value || "").trim();
  const withSlash = raw ? (raw.startsWith("/") ? raw : `/${raw}`) : fallback;
  const normalized = withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
  if (!/^\/[A-Za-z0-9/_-]*$/.test(normalized)) return fallback;
  return normalized || fallback;
}

const runtimeConfig = globalThis.__LTC_RUNTIME_CONFIG__ || {};

export const API_BASE = normalizeBasePath(runtimeConfig.apiBase, "/api");
export const AUTH_BASE = normalizeBasePath(runtimeConfig.authBase, "/auth");
export const DATA_ROOT = "./chamrak_export";
export const STORAGE_PREFIX = "chamrak_edit_";
export const INTERNAL_KEYS = new Set(["__rowid"]);
export const SESSION_UNLOCK_MINUTES = 30;

export const FINANCE_INCOME_FIELDS = ["รายรับ1", "รายรับ2", "รายรับ3", "รายรับ4"];
export const FINANCE_EXPENSE_FIELDS = ["รายจ่าย1", "รายจ่าย2", "รายจ่าย3", "รายจ่าย4"];
export const HIGH_TAI = new Set(["I3", "B3", "C2", "C3"]);
export const NAME_PREFIXES = ["นางสาว", "น.ส.", "นาย", "นาง", "ด.ช.", "ด.ญ.", "พ.จ.อ.", "จ.ส.อ.", "คุณ"];
export const SORTED_PREFIXES = [...NAME_PREFIXES].sort((a, b) => b.length - a.length);
