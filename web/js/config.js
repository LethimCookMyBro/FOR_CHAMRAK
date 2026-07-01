function normalizeBasePath(value, fallback) {
  const raw = String(value || "").trim();
  const withSlash = raw ? (raw.startsWith("/") ? raw : `/${raw}`) : fallback;
  const normalized = withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
  if (!/^\/[A-Za-z0-9/_-]*$/.test(normalized)) return fallback;
  return normalized || fallback;
}

const runtimeConfig = globalThis.__LTC_RUNTIME_CONFIG__ || {};

export const API_BASE = normalizeBasePath(runtimeConfig.apiBase, "/api");
export const DATA_ROOT = "./chamrak_export";
export const STORAGE_PREFIX = "chamrak_edit_";
export const INTERNAL_KEYS = new Set(["__rowid"]);
export const FINANCE_INCOME_FIELDS = ["รายรับ1", "รายรับ2", "รายรับ3", "รายรับ4", "รายรับ5"];
export const FINANCE_EXPENSE_FIELDS = ["รายจ่าย1", "รายจ่าย2", "รายจ่าย3", "รายจ่าย4", "รายจ่าย5"];
export const FINANCE_CATEGORY_SCHEMA_VERSION = 2;
export const FINANCE_LEGACY_REVIEW_CATEGORIES = {
  income: new Set(["1", "3", "4"]),
  expense: new Set(["1", "2", "3", "4"])
};
// Finance category display labels, split by type. Category is stored POSITIONALLY
// (the amount lands in รายรับ1..5 / รายจ่าย1..5), so the array index = category
// number 1-5 and income/expense are already separate storage columns. Editing
// these labels is display-only — it never changes stored data, and old rows
// simply pick up the new label for their existing positional category.
export const FINANCE_INCOME_LABELS = [
  "แผนงาน/โครงการ LTC",
  "แผนงาน/โครงการ กองทุนฯ ทต. ชำราก",
  "เงินบริจาค",
  "ดอกเบี้ยเงินฝาก",
  "อื่นๆ"
];
export const FINANCE_EXPENSE_LABELS = [
  "ค่าตอบแทน CM",
  "ค่าตอบแทน CG",
  "ค่าวัสดุอุปกรณ์",
  "ค่าบริหารจัดการศูนย์ฯ",
  "อื่นๆ"
];
// Visit status: internal values stay English (completed/postponed/not_found/
// cancelled) for backend/data compatibility; only the Thai label is shown.
// Single source for the filter dropdown, the add/edit dialog, and the table chip.
export const VISIT_STATUS_OPTIONS = [
  { value: "completed", label: "เยี่ยมสำเร็จ" },
  { value: "postponed", label: "เลื่อนนัด" },
  { value: "not_found", label: "ไม่พบ / ไม่สะดวก" },
  { value: "cancelled", label: "ยกเลิก" }
];
export const VISIT_STATUS_LABELS = Object.fromEntries(
  VISIT_STATUS_OPTIONS.map((option) => [option.value, option.label])
);
export const HIGH_TAI = new Set(["I3", "B3", "C2", "C3"]);
export const NAME_PREFIXES = ["นางสาว", "น.ส.", "นาย", "นาง", "ด.ช.", "ด.ญ.", "พ.จ.อ.", "จ.ส.อ.", "คุณ"];
export const SORTED_PREFIXES = [...NAME_PREFIXES].sort((a, b) => b.length - a.length);
