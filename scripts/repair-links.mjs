// One-time repair for legacy data where a CG's / dependent's code field
// (รหัสcm, รหัสcg) accidentally stored the *name* of the CM/CG instead of its
// *code*. That mismatch shows a name in the "รหัส CM" column and makes the CM
// "CG/LTC ที่ดูแล" counts read 0.
//
// SAFE BY DESIGN:
//   • Dry-run by default — prints what it *would* change. Pass --apply to write.
//   • Backs every changed file up to <file>.bak-<timestamp> before writing.
//   • Writes atomically (temp file + rename).
//   • Only fixes a value it can resolve with certainty (matches a known name);
//     anything else is reported, never guessed.
//   • Never changes on-disk column names or any other field.
//
// USAGE (close the app first):
//   node scripts/repair-links.mjs                 # dry-run, auto-detect data dir
//   node scripts/repair-links.mjs --apply         # apply the fixes
//   node scripts/repair-links.mjs "<dir>" --apply # explicit overrides dir

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CM = "t02_cm";
const CG = "t01_cg";
const DEP = "t04_dataj";
const CM_CODE = "รหัสcm";
const CG_CODE = "รหัสcg";
const FULL_NAME = "ชื่อสกุล";

// ---- pure logic (unit-tested) ---------------------------------------------

export function normalizeName(value) {
  return String(value ?? "")
    .replaceAll("น.ส.", "นางสาว")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildLookup(rows, codeKey, nameKey) {
  const codes = new Set();
  const byName = new Map();
  for (const row of rows) {
    const code = String(row[codeKey] ?? "").trim();
    if (code) codes.add(code);
    const name = normalizeName(row[nameKey]);
    if (name && code) byName.set(name, code);
  }
  return { codes, byName };
}

export function resolveCode(current, lookup) {
  const cur = String(current ?? "").trim();
  if (!cur) return { value: current, changed: false };
  if (lookup.codes.has(cur)) return { value: current, changed: false };
  const code = lookup.byName.get(normalizeName(cur));
  if (code) return { value: code, changed: true };
  return { value: current, changed: false, unresolved: true };
}

export function repairTables({ cm = [], cg = [], dependents = [] }) {
  const cmLookup = buildLookup(cm, CM_CODE, FULL_NAME);
  const cgLookup = buildLookup(cg, CG_CODE, FULL_NAME);
  const report = { cgCmFixed: 0, depCmFixed: 0, depCgFixed: 0, unresolved: [] };

  const fix = (row, field, lookup, counter) => {
    const res = resolveCode(row[field], lookup);
    if (res.changed) {
      row[field] = res.value;
      report[counter] += 1;
    } else if (res.unresolved) {
      report.unresolved.push({ field, value: String(row[field]) });
    }
  };

  for (const row of cg) fix(row, CM_CODE, cmLookup, "cgCmFixed");
  for (const row of dependents) {
    fix(row, CM_CODE, cmLookup, "depCmFixed");
    fix(row, CG_CODE, cgLookup, "depCgFixed");
  }
  return { cm, cg, dependents, report };
}

// ---- CLI ------------------------------------------------------------------

function findOverridesDir(explicit) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    explicit,
    process.env.APPDATA && path.join(process.env.APPDATA, "LTC Chamrak", "runtime_data", "overrides"),
    process.env.APPDATA && path.join(process.env.APPDATA, "ltc-chamrak", "runtime_data", "overrides"),
    path.join(here, "..", "runtime_data", "overrides")
  ].filter(Boolean);
  return candidates.find((dir) => fs.existsSync(dir));
}

function readTable(dir, alias) {
  const file = path.join(dir, `${alias}.json`);
  if (!fs.existsSync(file)) return { file, rows: null };
  const rows = JSON.parse(fs.readFileSync(file, "utf8"));
  return { file, rows: Array.isArray(rows) ? rows : [] };
}

function writeAtomicWithBackup(file, rows) {
  const backup = `${file}.bak-${Date.now()}`;
  fs.copyFileSync(file, backup);
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
  return backup;
}

function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const explicit = args.find((a) => !a.startsWith("--"));

  const dir = findOverridesDir(explicit);
  if (!dir) {
    console.error('❌ หา overrides dir ไม่เจอ — ระบุ path เอง: node scripts/repair-links.mjs "<dir>"');
    process.exit(1);
  }
  console.log(`📁 ใช้ข้อมูลจาก: ${dir}`);
  console.log(apply ? "⚙️  โหมด: APPLY (จะเขียนไฟล์ + สำรอง .bak)" : "🔍 โหมด: DRY-RUN (ดูอย่างเดียว — เพิ่ม --apply เพื่อแก้จริง)");

  const cm = readTable(dir, CM);
  const cg = readTable(dir, CG);
  const dep = readTable(dir, DEP);

  if (!cm.rows) {
    console.error(`❌ ไม่พบข้อมูล CM (${CM}.json) — ซ่อมไม่ได้ถ้าไม่มีรายชื่อ CM ไว้เทียบ`);
    process.exit(1);
  }

  const { report } = repairTables({ cm: cm.rows, cg: cg.rows || [], dependents: dep.rows || [] });

  console.log("\n=== ผลการตรวจ/ซ่อม ===");
  console.log(`  CG → รหัส CM แก้:        ${report.cgCmFixed}`);
  console.log(`  ผู้รับบริการ → รหัส CM แก้: ${report.depCmFixed}`);
  console.log(`  ผู้รับบริการ → รหัส CG แก้: ${report.depCgFixed}`);
  if (report.unresolved.length) {
    console.log(`  ⚠️ แก้อัตโนมัติไม่ได้ ${report.unresolved.length} จุด — ต้องแก้มือ:`);
    for (const u of report.unresolved) console.log(`     - ${u.field} = "${u.value}"`);
  }

  const totalFixed = report.cgCmFixed + report.depCmFixed + report.depCgFixed;
  if (totalFixed === 0) {
    console.log("\n✅ ไม่พบข้อมูลที่ต้องซ่อม (หรือถูกต้องอยู่แล้ว)");
    return;
  }
  if (!apply) {
    console.log(`\nℹ️ พบ ${totalFixed} จุดที่ซ่อมได้ — รันซ้ำด้วย --apply เพื่อแก้จริง`);
    return;
  }
  if (report.cgCmFixed && cg.rows) console.log(`💾 ${cg.file}\n   สำรอง: ${writeAtomicWithBackup(cg.file, cg.rows)}`);
  if ((report.depCmFixed || report.depCgFixed) && dep.rows) console.log(`💾 ${dep.file}\n   สำรอง: ${writeAtomicWithBackup(dep.file, dep.rows)}`);
  console.log(`\n✅ ซ่อมเสร็จ ${totalFixed} จุด — เปิดแอปแล้วตรวจหน้า CG/CM ได้เลย`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
