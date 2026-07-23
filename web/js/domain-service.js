import {
  FINANCE_CATEGORY_SCHEMA_VERSION,
  FINANCE_EXPENSE_FIELDS,
  FINANCE_INCOME_FIELDS,
  FINANCE_LEGACY_REVIEW_CATEGORIES
} from "./config.js";
import { Format } from "./utils.js";

class DomainService {
  constructor(repo) {
    this.repo = repo;
    this.inventoryRows = null;
    this.inventoryRowsPromise = null;
    this.inventoryCacheVersion = 0;
  }

  summarizeFinance(rows) {
    const income = FINANCE_INCOME_FIELDS.map(() => 0);
    const expense = FINANCE_EXPENSE_FIELDS.map(() => 0);

    for (const row of rows) {
      for (let i = 0; i < FINANCE_INCOME_FIELDS.length; i += 1) {
        income[i] += Number(row[FINANCE_INCOME_FIELDS[i]]) || 0;
      }
      for (let i = 0; i < FINANCE_EXPENSE_FIELDS.length; i += 1) {
        expense[i] += Number(row[FINANCE_EXPENSE_FIELDS[i]]) || 0;
      }
    }

    const totalIncome = income.reduce((sum, value) => sum + value, 0);
    const totalExpense = expense.reduce((sum, value) => sum + value, 0);

    return {
      income,
      expense,
      totalIncome,
      totalExpense,
      net: totalIncome - totalExpense
    };
  }

  getTaiGroup(taiValue) {
    const tai = String(taiValue ?? "").toUpperCase();
    if (tai === "I1") return 1;
    if (tai === "I2") return 2;
    if (tai === "I3") return 3;
    return 4;
  }

  isDeceased(row) {
    const status = row?.["สถานะ"];
    return status === true || status === 1 || String(status || "").toLowerCase() === "true";
  }

  activeDependents(rows) {
    return (Array.isArray(rows) ? rows : []).filter((row) => !this.isDeceased(row));
  }

  deceasedDependents(rows) {
    return (Array.isArray(rows) ? rows : []).filter((row) => this.isDeceased(row));
  }

  firstValue(row, keys) {
    for (const key of keys) {
      const value = row?.[key];
      if (value == null) continue;
      const text = String(value).trim();
      if (text) return value;
    }
    return null;
  }

  dateTs(value) {
    const text = Format.toText(value);
    if (!text) return null;
    const date = new Date(text.length <= 10 ? `${text}T00:00:00` : text);
    const ts = date.getTime();
    return Number.isNaN(ts) ? null : ts;
  }

  currentYearPeriod(today = new Date()) {
    const date = today instanceof Date ? today : new Date(today);
    const year = Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
    return {
      startTs: new Date(year, 0, 1).getTime(),
      endTs: new Date(year, 11, 31, 23, 59, 59, 999).getTime()
    };
  }

  monthBoundary(value, end = false) {
    const match = Format.toText(value).match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!Number.isInteger(year) || month < 1 || month > 12) return null;
    return end ? new Date(year, month, 0, 23, 59, 59, 999).getTime() : new Date(year, month - 1, 1).getTime();
  }

  visitMonthRange(options = {}) {
    const from = this.monthBoundary(options.fromMonth);
    const to = this.monthBoundary(options.toMonth, true);
    if (from != null && to != null && from > to) {
      return {
        startTs: this.monthBoundary(options.toMonth),
        endTs: this.monthBoundary(options.fromMonth, true)
      };
    }
    return {
      startTs: from ?? Number.NEGATIVE_INFINITY,
      endTs: to ?? Number.POSITIVE_INFINITY
    };
  }

  dependentId(row) {
    return Format.toText(
      this.firstValue(row, [
        "ID",
        "id",
        "beneficiaryId",
        "dependentId",
        "เลขประชาชน",
        "เลขบัตรประชาชน",
        "เธฅเธเธเธฃเธฐเธเธฒเธเธ",
        "เน€เธฅเธเธเธฃเธฐเธเธฒเธเธ"
      ]) ?? ""
    );
  }

  dependentName(row) {
    const snapshot = this.firstValue(row, ["beneficiaryName", "dependentName", "displayName", "name"]);
    if (snapshot) return Format.toText(snapshot);
    const prefix = Format.toText(this.firstValue(row, ["นาม", "เธเธฒเธก"]) || "");
    const first = Format.toText(this.firstValue(row, ["ชื่อ", "เธเธทเนเธญ"]) || "");
    const last = Format.toText(this.firstValue(row, ["สกุล", "เธชเธเธธเธฅ"]) || "");
    return `${prefix}${first} ${last}`.replace(/\s+/g, " ").trim() || "-";
  }

  visitBeneficiaryId(row) {
    return Format.toText(this.firstValue(row, ["beneficiaryId", "dependentId", "ID", "id"]) ?? "");
  }

  getTargetVisits(row, groupRows = []) {
    const direct = Number(
      this.firstValue(row, [
        "visitsPerYear",
        "targetVisitsPerYear",
        "targetVisits",
        "ครั้งดูแล/ปี",
        "เธเธฃเธฑเนเธเธ”เธนเนเธฅ/เธเธต"
      ])
    );
    if (Number.isFinite(direct) && direct > 0) return direct;

    const group = String(this.getTaiGroup(row?.TAI));
    const groupRow = groupRows.find((item) => String(item.Group || item.group || "") === group);
    const grouped = Number(groupRow?.number || groupRow?.visitsPerYear || 0);
    return Number.isFinite(grouped) && grouped > 0 ? grouped : 0;
  }

  carePeriod(row, options = {}) {
    const start = this.dateTs(this.firstValue(row, ["วันเริ่ม cp", "carePlanStart", "careStart", "เธงเธฑเธเน€เธฃเธดเนเธก cp"]));
    const end = this.dateTs(this.firstValue(row, ["วันสิ้นสุด cp", "carePlanEnd", "careEnd", "เธงเธฑเธเธชเธดเนเธเธชเธธเธ” cp"]));
    if (start != null && end != null) return { startTs: start, endTs: end };
    return this.currentYearPeriod(options.today);
  }

  coverageStatus(completedVisits, targetVisits) {
    if (!targetVisits) {
      return { statusKey: "no-target", statusLabel: "ไม่มีเป้าหมาย", tagClass: "tag-mixed" };
    }
    const percent = Math.round((completedVisits / targetVisits) * 100);
    if (percent >= 100) return { statusKey: "complete", statusLabel: "ครบแล้ว", tagClass: "tag-success" };
    if (percent >= 75) return { statusKey: "near", statusLabel: "ใกล้ครบ", tagClass: "tag-warn" };
    return { statusKey: "under", statusLabel: "ยังไม่ครบ", tagClass: "tag-danger" };
  }

  buildVisitCoverage(dependents, visits, groupRows = [], options = {}) {
    const visitRows = Array.isArray(visits) ? visits : [];
    return (Array.isArray(dependents) ? dependents : []).map((row) => {
      const beneficiaryId = this.dependentId(row);
      const targetVisits = this.getTargetVisits(row, groupRows);
      const period = this.carePeriod(row, options);
      const completedVisits = visitRows.filter((visit) => {
        if (String(visit.status || "").toLowerCase() !== "completed") return false;
        if (this.visitBeneficiaryId(visit) !== beneficiaryId) return false;
        const visitTs = this.dateTs(visit.visitDate);
        return visitTs != null && visitTs >= period.startTs && visitTs <= period.endTs;
      }).length;
      const coveragePercent = targetVisits > 0 ? Math.round((completedVisits / targetVisits) * 100) : null;
      const status = this.coverageStatus(completedVisits, targetVisits);
      return {
        row,
        beneficiaryId,
        beneficiaryName: this.dependentName(row),
        targetVisits,
        completedVisits,
        remainingVisits: targetVisits > 0 ? Math.max(targetVisits - completedVisits, 0) : null,
        coveragePercent,
        ...status
      };
    });
  }

  getTaiConsistency(adlValue, selectedTai) {
    const adl = Number(adlValue);
    if (!Number.isFinite(adl)) return { expected: null, allowedTai: [], consistent: true, warning: "" };

    // ponytail: ADL-only mapping is conservative; replace with owner-verified TAI rules if policy requires exact classification.
    const expected =
      adl >= 12
        ? { label: "I1", allowedTai: ["I1"] }
        : adl >= 5
          ? { label: "I2/I3", allowedTai: ["I2", "I3"] }
          : { label: "B3/C2/C3", allowedTai: ["B3", "C2", "C3"] };

    const tai = String(selectedTai || "").toUpperCase();
    const consistent = !tai || expected.allowedTai.includes(tai);
    return {
      expected: expected.label,
      allowedTai: expected.allowedTai,
      consistent,
      warning: consistent
        ? ""
        : "คะแนน ADL อาจไม่สอดคล้องกับระดับพึ่งพิงที่เลือก กรุณาตรวจสอบอีกครั้ง"
    };
  }

  summarizeCarePlanAlerts(dependents, options = {}) {
    const todayTs = this.dateTs(options.today) ?? Date.now();
    const soonTs = todayTs + 30 * 24 * 60 * 60 * 1000;
    const result = { expired: [], expiring: [], missingEnd: [] };

    for (const row of Array.isArray(dependents) ? dependents : []) {
      const endValue = this.firstValue(row, ["วันสิ้นสุด cp", "carePlanEnd", "careEnd", "เธงเธฑเธเธชเธดเนเธเธชเธธเธ” cp"]);
      const item = { row, beneficiaryId: this.dependentId(row), beneficiaryName: this.dependentName(row), careEnd: endValue || null };
      const endTs = this.dateTs(endValue);
      if (endTs == null) result.missingEnd.push(item);
      else if (endTs < todayTs) result.expired.push(item);
      else if (endTs <= soonTs) result.expiring.push(item);
    }

    return result;
  }

  carePlanStatus(row, options = {}) {
    const alerts = this.summarizeCarePlanAlerts([row], options);
    if (alerts.expired.length) return "expired";
    if (alerts.expiring.length) return "expiring";
    if (alerts.missingEnd.length) return "missingEnd";
    return "active";
  }

  staffCode(row, type) {
    return Format.toText(
      type === "cm"
        ? this.firstValue(row, ["รหัสcm", "cmCode", "responsibleCmId", "เธฃเธซเธฑเธชcm"])
        : this.firstValue(row, ["รหัสcg", "cgCode", "responsibleCgId", "เธฃเธซเธฑเธชcg"])
    );
  }

  summarizeStaffWorkloads(dependents, visits, groupRows = [], options = {}) {
    const coverage = this.buildVisitCoverage(dependents, visits, groupRows, options);
    const build = (type) => {
      const map = new Map();
      for (const item of coverage) {
        const staffId = this.staffCode(item.row, type) || "-";
        if (!map.has(staffId)) {
          map.set(staffId, {
            staffId,
            assignedBeneficiaries: 0,
            targetVisits: 0,
            completedVisits: 0,
            remainingVisits: 0,
            belowCoverageTarget: 0
          });
        }
        const summary = map.get(staffId);
        summary.assignedBeneficiaries += 1;
        summary.targetVisits += item.targetVisits || 0;
        summary.completedVisits += item.completedVisits || 0;
        summary.remainingVisits += item.remainingVisits || 0;
        if (item.statusKey === "under" || item.statusKey === "near") summary.belowCoverageTarget += 1;
      }
      return [...map.values()].map((row) => ({
        ...row,
        coveragePercent: row.targetVisits > 0 ? Math.round((row.completedVisits / row.targetVisits) * 100) : null
      }));
    };

    return { cg: build("cg"), cm: build("cm") };
  }

  summarizeAreaReports(dependents, visits, groupRows = [], options = {}) {
    const coverage = this.buildVisitCoverage(dependents, visits, groupRows, options);
    const count = (selector) => {
      const map = new Map();
      for (const item of coverage) {
        const key = Format.toText(selector(item)) || "-";
        map.set(key, (map.get(key) || 0) + 1);
      }
      return [...map.entries()].map(([key, value]) => ({ key, count: value })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
    };

    return {
      bySubdistrict: count((item) => this.firstValue(item.row, ["ตำบล", "subdistrict", "เธ•เธณเธเธฅ"])),
      byMoo: count((item) => this.firstValue(item.row, ["หมู่", "moo", "เธซเธกเธนเน"])),
      byDependency: count((item) => String(item.row.TAI || "-").toUpperCase()),
      byCarePlanStatus: count((item) => this.carePlanStatus(item.row, options)),
      byCoverageStatus: count((item) => item.statusKey)
    };
  }

  buildVisitMonthSummary(visits, options = {}) {
    const range = this.visitMonthRange(options);
    const grouped = new Map();

    for (const row of Array.isArray(visits) ? visits : []) {
      if (String(row.status || "").toLowerCase() !== "completed") continue;
      const visitTs = this.dateTs(row.visitDate);
      if (visitTs == null || visitTs < range.startTs || visitTs > range.endTs) continue;

      const beneficiaryId = this.visitBeneficiaryId(row);
      const beneficiaryName = Format.toText(row.beneficiaryName || row.dependentName || row.displayName || beneficiaryId || "-");
      const key = beneficiaryId || beneficiaryName;
      if (!grouped.has(key)) grouped.set(key, { beneficiaryId, beneficiaryName, dates: [] });
      grouped.get(key).dates.push(row.visitDate);
    }

    return [...grouped.values()]
      .map((row) => ({
        ...row,
        dates: row.dates.sort((a, b) => (this.dateTs(a) || 0) - (this.dateTs(b) || 0)),
        count: row.dates.length
      }))
      .sort((a, b) => b.count - a.count || a.beneficiaryName.localeCompare(b.beneficiaryName));
  }

  parseFinanceRow(row) {
    const incomeByCategory = FINANCE_INCOME_FIELDS.map((field) => Number(row[field]) || 0);
    const expenseByCategory = FINANCE_EXPENSE_FIELDS.map((field) => Number(row[field]) || 0);
    const incomeTotal = incomeByCategory.reduce((sum, value) => sum + value, 0);
    const expenseTotal = expenseByCategory.reduce((sum, value) => sum + value, 0);

    let type = "mixed";
    let category = "-";
    let amount = Math.abs(incomeTotal - expenseTotal);

    if (incomeTotal > 0 && expenseTotal === 0) {
      type = "income";
      const index = incomeByCategory.findIndex((value) => value > 0);
      category = index >= 0 ? String(index + 1) : "-";
      amount = incomeTotal;
    } else if (expenseTotal > 0 && incomeTotal === 0) {
      type = "expense";
      const index = expenseByCategory.findIndex((value) => value > 0);
      category = index >= 0 ? String(index + 1) : "-";
      amount = expenseTotal;
    } else if (incomeTotal === 0 && expenseTotal === 0) {
      type = "mixed";
      category = "-";
      amount = 0;
    }

    const categorySchemaVersion = Number(row.financeCategorySchemaVersion || 0) || 0;
    const legacyReviewSet = FINANCE_LEGACY_REVIEW_CATEGORIES[type];

    return {
      row,
      type,
      category,
      categorySchemaVersion,
      legacyNeedsReview: categorySchemaVersion < FINANCE_CATEGORY_SCHEMA_VERSION && Boolean(legacyReviewSet?.has(category)),
      amount,
      incomeTotal,
      expenseTotal,
      date: row.outdate || row.exdate || null,
      year: row["ปี"] || "-",
      note: row["หมายเหตุ"] || row.outlist || "",
      editable: type === "income" || type === "expense"
    };
  }

  buildFinanceRow(form, baseRow, nextId) {
    const amount = Number(form.amount);
    const categoryIndex = Number(form.category);
    const type = form.type;
    const fields = type === "income" ? FINANCE_INCOME_FIELDS : type === "expense" ? FINANCE_EXPENSE_FIELDS : null;
    if (!fields || !Number.isInteger(categoryIndex) || categoryIndex < 1 || categoryIndex > fields.length) {
      throw new Error("หมวดรายรับ/รายจ่ายไม่ถูกต้อง");
    }

    const row = {
      ...baseRow,
      ID: Number(baseRow.ID) || nextId,
      "เลขที่": baseRow["เลขที่"] ?? null,
      outdate: type === "expense" ? Format.dateInputToIso(form.date) : null,
      "ปี": String(form.year),
      "รุ่น": Number(baseRow["รุ่น"] || 1),
      "รอบ": baseRow["รอบ"] ?? null,
      "หมายเหตุ": Format.cleanWhitespace(form.note) || null,
      "สถานะ": type === "income" ? 1 : 2,
      iout: baseRow.iout ?? null,
      sheck: baseRow.sheck ?? null,
      number: baseRow.number ?? null,
      name: baseRow.name ?? null,
      exdate: Format.dateInputToIso(form.date),
      financeCategorySchemaVersion: FINANCE_CATEGORY_SCHEMA_VERSION,
      financeCategory: String(categoryIndex),
      financeCategoryType: type,
      outlist: baseRow.outlist ?? null,
      inid: baseRow.inid ?? null
    };

    for (const field of [...FINANCE_INCOME_FIELDS, ...FINANCE_EXPENSE_FIELDS]) row[field] = null;
    row[fields[categoryIndex - 1]] = amount;

    return row;
  }

  clearInventoryCache() {
    this.inventoryRows = null;
    this.inventoryRowsPromise = null;
    this.inventoryCacheVersion += 1;
  }

  async computeInventoryRows() {
    if (this.inventoryRows) return this.inventoryRows;
    if (this.inventoryRowsPromise) return this.inventoryRowsPromise;

    const cacheVersion = this.inventoryCacheVersion;
    this.inventoryRowsPromise = this.buildInventoryRows();
    try {
      const inventoryRows = await this.inventoryRowsPromise;
      if (cacheVersion === this.inventoryCacheVersion) {
        this.inventoryRows = inventoryRows;
      }
      return inventoryRows;
    } finally {
      if (cacheVersion === this.inventoryCacheVersion) {
        this.inventoryRowsPromise = null;
      }
    }
  }

  async buildInventoryRows() {
    const [products, inRows, outRows] = await Promise.all([
      this.repo.getTable("t16_product"),
      this.repo.getTable("t09_intproduct"),
      this.repo.getTable("t13_outproduct")
    ]);

    const inMap = {};
    const outMap = {};

    for (const row of inRows) {
      const key = String(row.productID || "");
      inMap[key] = (inMap[key] || 0) + (Number(row.quantity) || 0);
    }

    for (const row of outRows) {
      const key = String(row.productID || "");
      outMap[key] = (outMap[key] || 0) + (Number(row.quantity) || 0);
    }

    return products.map((product) => {
      const productID = String(product.productID || "");
      const inQty = inMap[productID] || 0;
      const outQty = outMap[productID] || 0;
      const balance = inQty - outQty;
      const reorderPointRaw = Number(product.reorderPoint ?? product.threshold ?? 0);
      const reorderPoint = reorderPointRaw > 0 ? reorderPointRaw : Math.max(10, Math.ceil(Math.max(outQty, 10) * 0.2));

      // No receipts and no issues = never stocked yet, not "out of stock".
      // Only flag หมดคลัง once stock has actually moved and is now depleted.
      const hasHistory = inQty > 0 || outQty > 0;
      let status = "ปกติ";
      if (!hasHistory) {
        status = "ยังไม่รับเข้า";
      } else if (balance <= 0) {
        status = "หมดคลัง";
      } else if (balance <= reorderPoint) {
        status = "ใกล้หมด";
      }

      const percent = hasHistory
        ? Math.max(3, Math.min(100, Math.round((Math.max(balance, 0) / Math.max(reorderPoint * 2, 1)) * 100)))
        : 0;

      return {
        rowId: product.__rowid,
        product,
        productID,
        productName: String(product.productName || "-"),
        brand: String(product.brand || ""),
        machineCode: String(product.machineCode || ""),
        unit: String(product.unit || ""),
        price: Number(product.price) || 0,
        inQty,
        outQty,
        balance,
        reorderPoint,
        status,
        percent,
        stockValue: balance * (Number(product.price) || 0)
      };
    });
  }

  severityRank(status) {
    if (status === "หมดคลัง") return 0;
    if (status === "ใกล้หมด") return 1;
    if (status === "ปกติ") return 2;
    return 3; // ยังไม่รับเข้า — least urgent
  }

  statusClass(status) {
    if (status === "หมดคลัง") return "tag-danger";
    if (status === "ใกล้หมด") return "tag-warn";
    if (status === "ยังไม่รับเข้า") return "tag-mixed";
    return "tag-success";
  }

  progressClass(status) {
    if (status === "หมดคลัง") return "danger";
    if (status === "ใกล้หมด") return "warn";
    return "success";
  }
}

export { DomainService };
