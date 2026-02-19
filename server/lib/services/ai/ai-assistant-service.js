"use strict";

const crypto = require("node:crypto");
const { includesAny, nowIso, sanitizeText } = require("../../helpers");

class AiAssistantService {
  constructor(config) {
    this.tableStore = config.tableStore;
    this.geminiClient = config.geminiClient;
    this.contextCacheMs = Math.max(0, Number(config.contextCacheMs || 0));
    this.maxPromptChars = Math.max(1, Number(config.maxPromptChars || 2000));
    this.contextCache = null;
    this.contextCacheExpiresAt = 0;
    this.contextCachePromise = null;
  }

  async readRows(alias) {
    try {
      const loaded = await this.tableStore.loadTable(alias);
      return loaded.rows;
    } catch {
      return [];
    }
  }

  safeNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return num;
  }

  normalizeText(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  normalizeGender(value) {
    const text = this.normalizeText(value);
    if (text.includes("หญิง")) return "female";
    if (text.includes("ชาย")) return "male";
    return "unknown";
  }

  normalizeTai(value) {
    return String(value || "")
      .trim()
      .toUpperCase();
  }

  thaiYearToGregorian(yearValue) {
    const year = Number(yearValue);
    if (!Number.isFinite(year)) return null;
    if (year > 2200) return year - 543;
    if (year < 1900 || year > 2600) return null;
    return year;
  }

  formatMonthLabel(monthKey) {
    const [year, month] = String(monthKey || "").split("-");
    if (!year || !month) return "-";
    return `${month}/${year}`;
  }

  extractFinanceMonth(row) {
    const dateCandidates = [row?.exdate, row?.outdate, row?.date, row?.["วันที่"], row?.["วันเดือนปี"]];
    for (const item of dateCandidates) {
      const text = String(item || "").trim();
      if (!text) continue;
      const ts = new Date(text).getTime();
      if (Number.isNaN(ts)) continue;
      const date = new Date(ts);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      return `${year}-${month}`;
    }

    const year = this.thaiYearToGregorian(row?.["ปี"] || row?.year || row?.Year);
    if (!year) return null;

    const monthRaw = Number(row?.["เดือน"] || row?.month || row?.["รอบ"] || row?.round || 1);
    const month = Number.isFinite(monthRaw) && monthRaw >= 1 && monthRaw <= 12 ? monthRaw : 1;
    return `${year}-${String(month).padStart(2, "0")}`;
  }

  summarizeFinance(rows) {
    const income = [0, 0, 0, 0];
    const expense = [0, 0, 0, 0];

    for (const row of rows) {
      income[0] += this.safeNumber(row["รายรับ1"]);
      income[1] += this.safeNumber(row["รายรับ2"]);
      income[2] += this.safeNumber(row["รายรับ3"]);
      income[3] += this.safeNumber(row["รายรับ4"]);

      expense[0] += this.safeNumber(row["รายจ่าย1"]);
      expense[1] += this.safeNumber(row["รายจ่าย2"]);
      expense[2] += this.safeNumber(row["รายจ่าย3"]);
      expense[3] += this.safeNumber(row["รายจ่าย4"]);
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

  buildFinanceTimeline(rows) {
    const monthMap = new Map();

    for (const row of rows) {
      const key = this.extractFinanceMonth(row);
      if (!key) continue;

      const income =
        this.safeNumber(row["รายรับ1"]) +
        this.safeNumber(row["รายรับ2"]) +
        this.safeNumber(row["รายรับ3"]) +
        this.safeNumber(row["รายรับ4"]);
      const expense =
        this.safeNumber(row["รายจ่าย1"]) +
        this.safeNumber(row["รายจ่าย2"]) +
        this.safeNumber(row["รายจ่าย3"]) +
        this.safeNumber(row["รายจ่าย4"]);

      const item = monthMap.get(key) || { month: key, income: 0, expense: 0, count: 0 };
      item.income += income;
      item.expense += expense;
      item.count += 1;
      monthMap.set(key, item);
    }

    const months = [...monthMap.values()]
      .map((row) => ({ ...row, net: row.income - row.expense }))
      .sort((a, b) => String(a.month).localeCompare(String(b.month)));

    const recent = months.slice(-6);
    const latest = recent[recent.length - 1] || null;
    const previous = recent[recent.length - 2] || null;

    return {
      months: recent,
      latest,
      previous,
      netDelta: latest && previous ? latest.net - previous.net : null
    };
  }

  buildCareStats(dependents) {
    const taiCounts = {
      I1: 0,
      I2: 0,
      I3: 0,
      B3: 0,
      C2: 0,
      C3: 0,
      OTHER: 0
    };

    let male = 0;
    let female = 0;
    let unknown = 0;

    for (const row of dependents) {
      const tai = this.normalizeTai(row?.TAI);
      if (taiCounts[tai] != null) taiCounts[tai] += 1;
      else taiCounts.OTHER += 1;

      const gender = this.normalizeGender(row?.["เพศ"]);
      if (gender === "male") male += 1;
      else if (gender === "female") female += 1;
      else unknown += 1;
    }

    const highCount = taiCounts.I3 + taiCounts.B3 + taiCounts.C2 + taiCounts.C3;

    return {
      taiCounts,
      highCount,
      male,
      female,
      unknown
    };
  }

  fullNameFromDependentRow(row) {
    const prefix = String(row?.["นาม"] || "").trim();
    const firstName = String(row?.["ชื่อ"] || "").trim();
    const lastName = String(row?.["สกุล"] || "").trim();
    const fullName = `${prefix}${firstName} ${lastName}`.replace(/\s+/g, " ").trim();
    return fullName || "-";
  }

  formatDateCompact(value) {
    const text = String(value || "").trim();
    if (!text) return "-";
    const ts = new Date(text).getTime();
    if (Number.isNaN(ts)) return text.slice(0, 10);
    const date = new Date(ts);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear());
    return `${day}/${month}/${year}`;
  }

  buildDispenseHistory(products, outRows, dependents) {
    const productById = {};
    for (const row of products) {
      const productID = String(row.productID || "").trim();
      if (!productID) continue;
      productById[productID] = row;
    }

    const recipientByCode = {};
    for (const row of dependents) {
      const citizenId = String(row?.["เลขประชาชน"] || "").trim();
      if (!citizenId) continue;
      recipientByCode[citizenId] = this.fullNameFromDependentRow(row);
    }

    const rows = [];
    const productAgg = {};
    const recipientAgg = {};
    let totalQuantity = 0;

    for (const row of outRows) {
      const quantity = this.safeNumber(row.quantity);
      const productID = String(row.productID || "").trim();
      const product = productById[productID] || {};
      const recipientCode = String(row["รหัสltc"] || row.ltcCode || "").trim();
      const recipientName = String(row.recipientName || recipientByCode[recipientCode] || "-").trim() || "-";
      const productName = String(row.productName || product.productName || "-");
      const unit = String(product.unit || row.unit || "ชิ้น");
      const brand = String(row.brand || product.brand || "-");
      const machineCode = String(row.machineCode || product.machineCode || "-");

      rows.push({
        outdate: row.outdate || null,
        outno: this.safeNumber(row.outno),
        outtype: String(row.outtype || "-"),
        productID,
        productName,
        brand,
        machineCode,
        quantity,
        unit,
        recipientCode: recipientCode || "-",
        recipientName,
        round: String(row.round || "-"),
        note: String(row.note || ""),
        reference: String(row.reference || "")
      });

      totalQuantity += quantity;

      const productKey = `${productID}|${productName}`;
      const productItem = productAgg[productKey] || {
        productID,
        productName,
        quantity: 0,
        count: 0,
        unit
      };
      productItem.quantity += quantity;
      productItem.count += 1;
      productAgg[productKey] = productItem;

      const recipientKey = `${recipientCode}|${recipientName}`;
      const recipientItem = recipientAgg[recipientKey] || {
        recipientCode: recipientCode || "-",
        recipientName,
        quantity: 0,
        count: 0
      };
      recipientItem.quantity += quantity;
      recipientItem.count += 1;
      recipientAgg[recipientKey] = recipientItem;
    }

    rows.sort((a, b) => {
      const dateDiff = new Date(b.outdate || 0).getTime() - new Date(a.outdate || 0).getTime();
      if (dateDiff !== 0) return dateDiff;
      return this.safeNumber(b.outno) - this.safeNumber(a.outno);
    });

    const topProducts = Object.values(productAgg)
      .sort((a, b) => this.safeNumber(b.quantity) - this.safeNumber(a.quantity) || this.safeNumber(b.count) - this.safeNumber(a.count))
      .slice(0, 8);

    const topRecipients = Object.values(recipientAgg)
      .sort((a, b) => this.safeNumber(b.quantity) - this.safeNumber(a.quantity) || this.safeNumber(b.count) - this.safeNumber(a.count))
      .slice(0, 8);

    return {
      rows,
      totalRows: rows.length,
      totalQuantity,
      recentRows: rows.slice(0, 12),
      topProducts,
      topRecipients
    };
  }

  computeStockAlerts(products, inRows, outRows) {
    const inMap = {};
    const outMap = {};

    for (const row of inRows) {
      const key = String(row.productID || "");
      inMap[key] = (inMap[key] || 0) + this.safeNumber(row.quantity);
    }

    for (const row of outRows) {
      const key = String(row.productID || "");
      outMap[key] = (outMap[key] || 0) + this.safeNumber(row.quantity);
    }

    const result = [];
    for (const row of products) {
      const productID = String(row.productID || "");
      const inQty = inMap[productID] || 0;
      const outQty = outMap[productID] || 0;
      const balance = inQty - outQty;
      const reorderPoint = Math.max(1, this.safeNumber(row.reorderPoint || row.threshold || 10));
      if (balance > reorderPoint) continue;

      result.push({
        productID,
        productName: String(row.productName || "-"),
        unit: String(row.unit || "ชิ้น"),
        price: this.safeNumber(row.price),
        balance,
        reorderPoint,
        status: balance <= 0 ? "หมดคลัง" : "ใกล้หมด"
      });
    }

    return result.sort((a, b) => {
      const severityA = a.status === "หมดคลัง" ? 0 : 1;
      const severityB = b.status === "หมดคลัง" ? 0 : 1;
      if (severityA !== severityB) return severityA - severityB;
      return this.safeNumber(a.balance) - this.safeNumber(b.balance);
    });
  }

  buildWorkforceByUnit(unitRows, cmRows, cgRows, dependents) {
    const unitNameByCode = {};
    const unitCodes = new Set();

    for (const row of unitRows) {
      const unitCode = String(row["รหัสหน่วย"] || "").trim();
      if (!unitCode) continue;
      unitCodes.add(unitCode);
      unitNameByCode[unitCode] = String(row["หน่วย"] || "-");
    }

    const cmByUnit = {};
    const cgByUnit = {};
    const dependentsByUnit = {};
    const cmCodeToUnit = {};

    for (const row of cmRows) {
      const cmCode = String(row["รหัสcm"] || "").trim();
      const unitCode = String(row["รหัสหน่วย"] || "").trim();
      if (!unitCode) continue;
      unitCodes.add(unitCode);
      cmByUnit[unitCode] = (cmByUnit[unitCode] || 0) + 1;
      if (cmCode) cmCodeToUnit[cmCode] = unitCode;
    }

    for (const row of cgRows) {
      const cmCode = String(row["รหัสcm"] || "").trim();
      const unitCode = cmCodeToUnit[cmCode] || "";
      if (!unitCode) continue;
      unitCodes.add(unitCode);
      cgByUnit[unitCode] = (cgByUnit[unitCode] || 0) + 1;
    }

    for (const row of dependents) {
      const unitCode = String(row["รหัสหน่วย"] || "").trim();
      if (!unitCode) continue;
      unitCodes.add(unitCode);
      dependentsByUnit[unitCode] = (dependentsByUnit[unitCode] || 0) + 1;
    }

    const rows = [...unitCodes].map((unitCode) => {
      const cmCount = this.safeNumber(cmByUnit[unitCode]);
      const cgCount = this.safeNumber(cgByUnit[unitCode]);
      const dependentCount = this.safeNumber(dependentsByUnit[unitCode]);

      return {
        unitCode,
        unitName: unitNameByCode[unitCode] || "-",
        cmCount,
        cgCount,
        dependentCount,
        dependentsPerCm: cmCount > 0 ? dependentCount / cmCount : null,
        cgPerCm: cmCount > 0 ? cgCount / cmCount : null
      };
    });

    rows.sort((a, b) => b.dependentCount - a.dependentCount || b.cgCount - a.cgCount || String(a.unitCode).localeCompare(String(b.unitCode)));

    return {
      rows,
      topUnit: rows[0] || null,
      coverageGap: rows.filter((row) => row.cmCount === 0 && row.dependentCount > 0)
    };
  }

  maxIndex(values) {
    if (!Array.isArray(values) || !values.length) return 0;
    let bestIndex = 0;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < values.length; i += 1) {
      const value = this.safeNumber(values[i]);
      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  ratioPercent(numerator, denominator) {
    if (!denominator) return 0;
    return (this.safeNumber(numerator) / this.safeNumber(denominator)) * 100;
  }

  buildGeneralAnswer(ctx) {
    const highPercent = this.ratioPercent(ctx.careStats.highCount, ctx.dependents.length);
    const topUnit = ctx.workforce.topUnit;
    const stockText =
      ctx.stockAlerts.length > 0
        ? ctx.stockAlerts
            .slice(0, 3)
            .map((row) => `${row.productName} (${row.balance})`)
            .join(", ")
        : "ไม่พบรายการใกล้หมด";

    const latestMonth = ctx.financeTimeline.latest;
    const monthText = latestMonth
      ? `เดือนล่าสุด ${this.formatMonthLabel(latestMonth.month)} คงเหลือสุทธิ ${latestMonth.net.toLocaleString("th-TH")} บาท`
      : "ไม่มีข้อมูลแนวโน้มรายเดือนเพียงพอ";

    return [
      "สรุปภาพรวม LTC ล่าสุด",
      `- ผู้รับบริการ ${ctx.dependents.length} ราย (พึ่งพิงสูง ${ctx.careStats.highCount} ราย, ${highPercent.toFixed(1)}%)`,
      `- CG ${ctx.cgRows.length} คน | CM ${ctx.cmRows.length} คน | หน่วยงาน ${ctx.unitRows.length} หน่วย`,
      `- การเงิน รายรับ ${ctx.finance.totalIncome.toLocaleString("th-TH")} บาท | รายจ่าย ${ctx.finance.totalExpense.toLocaleString("th-TH")} บาท | คงเหลือ ${ctx.finance.net.toLocaleString("th-TH")} บาท`,
      `- ${monthText}`,
      `- เบิกจ่ายสะสม ${ctx.dispenseHistory.totalRows.toLocaleString("th-TH")} รายการ (${ctx.dispenseHistory.totalQuantity.toLocaleString(
        "th-TH"
      )} หน่วย)`,
      `- วัสดุที่ต้องติดตาม: ${stockText}`,
      topUnit
        ? `- หน่วยที่มีผู้รับบริการสูงสุด: ${topUnit.unitName} (${topUnit.unitCode}) ${topUnit.dependentCount} ราย`
        : "- ไม่มีข้อมูลภาระงานรายหน่วย"
    ].join("\n");
  }

  buildDependentsAnswer(ctx) {
    if (!ctx.dependents.length) {
      return [
        "สรุปผู้รับบริการ",
        "- ยังไม่พบข้อมูลผู้รับบริการในระบบ",
        "- เพิ่มข้อมูลผู้รับบริการก่อน แล้วผมจะสรุปกลุ่มพึ่งพิงและแนวโน้มให้ทันที"
      ].join("\n");
    }

    const tai = ctx.careStats.taiCounts;
    const total = Math.max(1, ctx.dependents.length);
    const highPercent = this.ratioPercent(ctx.careStats.highCount, total);

    return [
      "สรุปผู้รับบริการ",
      `- ทั้งหมด ${ctx.dependents.length} ราย`,
      `- กลุ่มพึ่งพิงสูง (I3/B3/C2/C3) ${ctx.careStats.highCount} ราย (${highPercent.toFixed(1)}%)`,
      `- กระจาย TAI: I1 ${tai.I1} | I2 ${tai.I2} | I3 ${tai.I3} | B3 ${tai.B3} | C2 ${tai.C2} | C3 ${tai.C3}`,
      `- เพศ: ชาย ${ctx.careStats.male} | หญิง ${ctx.careStats.female} | ไม่ระบุ ${ctx.careStats.unknown}`
    ].join("\n");
  }

  buildFinanceAnswer(ctx) {
    if (!ctx.financeRows.length) {
      return [
        "สรุปการเงิน",
        "- ยังไม่มีข้อมูลรายรับ/รายจ่ายในระบบ",
        "- เพิ่มรายการการเงินก่อน แล้วผมจะวิเคราะห์สัดส่วนและแนวโน้มให้อัตโนมัติ"
      ].join("\n");
    }

    const highestIncomeCategory = this.maxIndex(ctx.finance.income) + 1;
    const highestExpenseCategory = this.maxIndex(ctx.finance.expense) + 1;
    const expenseRatio = this.ratioPercent(ctx.finance.totalExpense, ctx.finance.totalIncome);

    const latest = ctx.financeTimeline.latest;
    const previous = ctx.financeTimeline.previous;
    const trendText =
      latest && previous
        ? `แนวโน้มสุทธิเดือนล่าสุด (${this.formatMonthLabel(latest.month)}) ${ctx.financeTimeline.netDelta >= 0 ? "ดีขึ้น" : "ลดลง"} ${Math.abs(
            this.safeNumber(ctx.financeTimeline.netDelta)
          ).toLocaleString("th-TH")} บาท เทียบเดือนก่อน (${this.formatMonthLabel(previous.month)})`
        : "แนวโน้มรายเดือนยังไม่พอสำหรับเปรียบเทียบ";

    return [
      "สรุปการเงิน",
      `- รายรับรวม ${ctx.finance.totalIncome.toLocaleString("th-TH")} บาท`,
      `- รายจ่ายรวม ${ctx.finance.totalExpense.toLocaleString("th-TH")} บาท`,
      `- คงเหลือสุทธิ ${ctx.finance.net.toLocaleString("th-TH")} บาท`,
      `- รายจ่ายต่อรายรับ ${expenseRatio.toFixed(2)}%`,
      `- หมวดรายรับสูงสุด: ประเภท ${highestIncomeCategory} | หมวดรายจ่ายสูงสุด: ประเภท ${highestExpenseCategory}`,
      `- ${trendText}`
    ].join("\n");
  }

  buildStockAnswer(ctx) {
    if (!ctx.stockAlerts.length) {
      return "คลังวัสดุ\n- ไม่พบรายการใกล้หมดหรือหมดคลังในข้อมูลล่าสุด";
    }

    const list = ctx.stockAlerts
      .slice(0, 6)
      .map(
        (row) => `- ${row.productName} (${row.productID}) คงเหลือ ${row.balance} ${row.unit} | เกณฑ์ ${row.reorderPoint} | ${row.status}`
      )
      .join("\n");

    return ["คลังวัสดุที่ต้องติดตาม", `- พบ ${ctx.stockAlerts.length} รายการ`, list].join("\n");
  }

  matchPromptValue(promptLower, promptCompact, rawValue) {
    const value = this.normalizeText(rawValue);
    if (!value || value === "-") return false;
    if (value.length <= 1) return false;
    if (promptLower.includes(value)) return true;

    const compactValue = value.replace(/\s+/g, "");
    if (!compactValue || compactValue.length <= 1) return false;
    return promptCompact.includes(compactValue);
  }

  extractDispenseQueryFilter(history, promptLower) {
    const prompt = this.normalizeText(promptLower);
    const promptCompact = prompt.replace(/\s+/g, "");
    const filter = {
      productIDs: new Set(),
      productNames: new Set(),
      recipientCodes: new Set(),
      recipientNames: new Set(),
      brands: new Set(),
      machineCodes: new Set(),
      labels: []
    };

    for (const row of history.rows) {
      if (this.matchPromptValue(prompt, promptCompact, row.productID)) {
        filter.productIDs.add(String(row.productID || "").trim());
      }
      if (this.matchPromptValue(prompt, promptCompact, row.productName)) {
        filter.productNames.add(String(row.productName || "").trim());
      }
      if (this.matchPromptValue(prompt, promptCompact, row.recipientCode)) {
        filter.recipientCodes.add(String(row.recipientCode || "").trim());
      }
      if (this.matchPromptValue(prompt, promptCompact, row.recipientName)) {
        filter.recipientNames.add(String(row.recipientName || "").trim());
      }
      if (this.matchPromptValue(prompt, promptCompact, row.brand)) {
        filter.brands.add(String(row.brand || "").trim());
      }
      if (this.matchPromptValue(prompt, promptCompact, row.machineCode)) {
        filter.machineCodes.add(String(row.machineCode || "").trim());
      }
    }

    filter.labels = [
      ...[...filter.productNames].slice(0, 2),
      ...[...filter.productIDs].slice(0, 2),
      ...[...filter.recipientNames].slice(0, 2),
      ...[...filter.recipientCodes].slice(0, 2),
      ...[...filter.brands].slice(0, 2),
      ...[...filter.machineCodes].slice(0, 2)
    ].filter(Boolean);

    filter.hasFilter =
      filter.productIDs.size > 0 ||
      filter.productNames.size > 0 ||
      filter.recipientCodes.size > 0 ||
      filter.recipientNames.size > 0 ||
      filter.brands.size > 0 ||
      filter.machineCodes.size > 0;

    return filter;
  }

  filterDispenseRows(rows, filter) {
    if (!filter?.hasFilter) return rows;

    return rows.filter((row) => {
      const productID = String(row.productID || "").trim();
      const productName = String(row.productName || "").trim();
      const recipientCode = String(row.recipientCode || "").trim();
      const recipientName = String(row.recipientName || "").trim();
      const brand = String(row.brand || "").trim();
      const machineCode = String(row.machineCode || "").trim();

      return (
        filter.productIDs.has(productID) ||
        filter.productNames.has(productName) ||
        filter.recipientCodes.has(recipientCode) ||
        filter.recipientNames.has(recipientName) ||
        filter.brands.has(brand) ||
        filter.machineCodes.has(machineCode)
      );
    });
  }

  summarizeDispenseRows(rows) {
    const productAgg = {};
    const recipientAgg = {};
    let totalQuantity = 0;

    for (const row of rows) {
      const quantity = this.safeNumber(row.quantity);
      totalQuantity += quantity;

      const productKey = `${row.productID || "-"}|${row.productName || "-"}`;
      const productItem = productAgg[productKey] || {
        productID: String(row.productID || "-"),
        productName: String(row.productName || "-"),
        quantity: 0,
        count: 0,
        unit: String(row.unit || "ชิ้น")
      };
      productItem.quantity += quantity;
      productItem.count += 1;
      productAgg[productKey] = productItem;

      const recipientKey = `${row.recipientCode || "-"}|${row.recipientName || "-"}`;
      const recipientItem = recipientAgg[recipientKey] || {
        recipientCode: String(row.recipientCode || "-"),
        recipientName: String(row.recipientName || "-"),
        quantity: 0,
        count: 0
      };
      recipientItem.quantity += quantity;
      recipientItem.count += 1;
      recipientAgg[recipientKey] = recipientItem;
    }

    const topProducts = Object.values(productAgg)
      .sort((a, b) => this.safeNumber(b.quantity) - this.safeNumber(a.quantity) || this.safeNumber(b.count) - this.safeNumber(a.count))
      .slice(0, 8);

    const topRecipients = Object.values(recipientAgg)
      .sort((a, b) => this.safeNumber(b.quantity) - this.safeNumber(a.quantity) || this.safeNumber(b.count) - this.safeNumber(a.count))
      .slice(0, 8);

    return {
      totalRows: rows.length,
      totalQuantity,
      topProducts,
      topRecipients,
      recentRows: rows.slice(0, 12)
    };
  }

  buildDispenseAnswer(ctx, promptLower = "") {
    const history = ctx.dispenseHistory;
    if (!history?.totalRows) {
      return [
        "ประวัติเบิกจ่าย",
        "- ยังไม่พบรายการเบิกจ่ายในข้อมูลล่าสุด",
        "- เมื่อบันทึกเบิกจ่ายแล้ว คุณจะดูได้ว่าเครื่องไหนจ่ายให้ใคร พร้อมวันที่และจำนวน"
      ].join("\n");
    }

    const lines = [
      "ประวัติเบิกจ่าย",
      `- ทั้งหมด ${history.totalRows.toLocaleString("th-TH")} รายการ | จำนวนจ่ายรวม ${history.totalQuantity.toLocaleString("th-TH")} หน่วย`
    ];

    const queryFilter = this.extractDispenseQueryFilter(history, promptLower);
    const filteredRows = this.filterDispenseRows(history.rows, queryFilter);
    const data = queryFilter.hasFilter ? this.summarizeDispenseRows(filteredRows) : history;

    if (queryFilter.hasFilter) {
      if (!data.totalRows) {
        const queryText = queryFilter.labels.length ? queryFilter.labels.join(", ") : promptLower;
        return [
          "ประวัติเบิกจ่าย",
          `- ไม่พบรายการที่ตรงกับ "${queryText}" ในข้อมูลล่าสุด`,
          "- ลองค้นใหม่ด้วยชื่อวัสดุ/รหัสวัสดุ/ชื่อผู้รับเบิก"
        ].join("\n");
      }
      lines.push(
        `- ตรงเงื่อนไข ${data.totalRows.toLocaleString("th-TH")} รายการ | จำนวนจ่าย ${data.totalQuantity.toLocaleString("th-TH")} หน่วย`
      );
      if (queryFilter.labels.length) {
        lines.push(`- ค้นหา: ${queryFilter.labels.join(", ")}`);
      }
    }

    if (data.recentRows.length) {
      const latestRows = data.recentRows
        .slice(0, 8)
        .map(
          (row) =>
            `- ${this.formatDateCompact(row.outdate)} | ${row.productName} (${row.productID || "-"}) | ${row.quantity.toLocaleString(
              "th-TH"
            )} ${row.unit} | ผู้รับ ${row.recipientName} (${row.recipientCode})`
        )
        .join("\n");
      lines.push("- รายการล่าสุด", latestRows);
    }

    const wantsRecipient = includesAny(promptLower, ["ใคร", "ผู้รับ", "คนไหน"]);
    if (wantsRecipient && data.topRecipients.length) {
      const topRecipient = data.topRecipients
        .slice(0, 5)
        .map((row) => `- ${row.recipientName} (${row.recipientCode}) รับไป ${row.quantity.toLocaleString("th-TH")} หน่วย (${row.count} รายการ)`)
        .join("\n");
      lines.push("- ผู้รับเบิกสูงสุด", topRecipient);
    }

    const wantsProduct = includesAny(promptLower, ["เครื่อง", "วัสดุ", "อะไร"]);
    if (wantsProduct && data.topProducts.length) {
      const topProducts = data.topProducts
        .slice(0, 5)
        .map((row) => `- ${row.productName} (${row.productID || "-"}) จ่ายรวม ${row.quantity.toLocaleString("th-TH")} ${row.unit}`)
        .join("\n");
      lines.push("- เครื่อง/วัสดุที่เบิกมากสุด", topProducts);
    }

    return lines.join("\n");
  }

  buildWorkforceAnswer(ctx) {
    const topUnit = ctx.workforce.topUnit;
    const coverageGapCount = ctx.workforce.coverageGap.length;

    const lines = [
      "สรุปกำลังคนและหน่วยงาน",
      `- CG ${ctx.cgRows.length} คน | CM ${ctx.cmRows.length} คน | หน่วยงาน ${ctx.unitRows.length} หน่วย`,
      `- ผู้รับบริการทั้งหมด ${ctx.dependents.length} ราย`
    ];

    if (topUnit) {
      const ratioText = topUnit.dependentsPerCm == null ? "ไม่มี CM" : `${topUnit.dependentsPerCm.toFixed(2)} ราย/CM`;
      lines.push(
        `- หน่วยที่มีภาระสูงสุด: ${topUnit.unitName} (${topUnit.unitCode}) ผู้รับบริการ ${topUnit.dependentCount} ราย, CM ${topUnit.cmCount} คน (${ratioText})`
      );
    }

    if (coverageGapCount > 0) {
      lines.push(`- หน่วยที่มีผู้รับบริการแต่ยังไม่มี CM: ${coverageGapCount} หน่วย`);
    }

    return lines.join("\n");
  }

  buildAdviceAnswer(ctx) {
    if (!ctx.dependents.length && !ctx.financeRows.length && !ctx.stockAlerts.length) {
      return [
        "ข้อเสนอแนะเชิงปฏิบัติ",
        "- ตอนนี้ฐานข้อมูลยังว่าง จึงยังวิเคราะห์เชิงปฏิบัติการไม่ได้",
        "- เริ่มจากเพิ่มข้อมูลผู้รับบริการ, การเงิน และวัสดุอย่างน้อยอย่างละบางส่วนก่อน"
      ].join("\n");
    }

    const points = [];

    if (ctx.finance.net < 0) {
      points.push(
        `ควบคุมรายจ่ายเร่งด่วน เพราะงบสุทธิติดลบ ${Math.abs(ctx.finance.net).toLocaleString("th-TH")} บาท`
      );
    }

    if (ctx.stockAlerts.length > 0) {
      const critical = ctx.stockAlerts.filter((item) => item.status === "หมดคลัง").length;
      points.push(
        critical > 0
          ? `เติมสต็อกทันที: มีรายการหมดคลัง ${critical} รายการ และใกล้หมดรวม ${ctx.stockAlerts.length} รายการ`
          : `วางแผนสั่งซื้อ: มีรายการใกล้หมด ${ctx.stockAlerts.length} รายการ`
      );
    }

    const highPercent = this.ratioPercent(ctx.careStats.highCount, ctx.dependents.length);
    if (highPercent >= 35) {
      points.push(`เพิ่มการติดตามกลุ่มพึ่งพิงสูง เพราะมีสัดส่วน ${highPercent.toFixed(1)}% ของผู้รับบริการทั้งหมด`);
    }

    const topUnit = ctx.workforce.topUnit;
    if (topUnit && topUnit.dependentsPerCm != null && topUnit.dependentsPerCm > 20) {
      points.push(
        `ทบทวนการกระจาย CM ในหน่วย ${topUnit.unitName} (${topUnit.unitCode}) ซึ่งมีภาระสูง ${topUnit.dependentsPerCm.toFixed(1)} ราย/CM`
      );
    }

    if (!points.length) {
      points.push("ภาพรวมอยู่ในเกณฑ์ค่อนข้างสมดุล แนะนำติดตามแนวโน้มรายเดือนและเติมสต็อกเชิงป้องกันอย่างต่อเนื่อง");
    }

    return ["ข้อเสนอแนะเชิงปฏิบัติ", ...points.map((item) => `- ${item}`)].join("\n");
  }

  isGreetingPrompt(promptLower) {
    return includesAny(promptLower, ["สวัสดี", "hello", "hi", "หวัดดี"]);
  }

  isSmallTalkPrompt(promptLower) {
    return includesAny(promptLower, [
      "คุยเล่น",
      "คุยกัน",
      "คุยได้ไหม",
      "คุยไม่ได้",
      "ทำไมคุณคุยไม่ได้",
      "ทำไมคุยไม่ได้",
      "ช่วยอะไรได้บ้าง",
      "ทำอะไรได้บ้าง",
      "คุณทำอะไรได้",
      "คุยเรื่องชีวิต",
      "อยากคุย",
      "ชีวิต",
      "เป็นไง",
      "สบายดีไหม",
      "ขอบคุณ",
      "thank you"
    ]);
  }

  isEmotionalSupportPrompt(promptLower) {
    return includesAny(promptLower, [
      "ชีวิตผมแย่",
      "ชีวิตหนูแย่",
      "ชีวิตแย่",
      "เครียด",
      "ท้อ",
      "หมดไฟ",
      "เหนื่อยใจ",
      "เศร้า",
      "แย่มาก",
      "ไม่มีแรง",
      "อยากระบาย",
      "รู้สึกแย่",
      "ไม่ไหว"
    ]);
  }

  isCrisisPrompt(promptLower) {
    return includesAny(promptLower, ["อยากตาย", "ฆ่าตัวตาย", "ไม่อยากมีชีวิต", "ทำร้ายตัวเอง"]);
  }

  buildEmotionalSupportAnswer(promptLower) {
    if (this.isCrisisPrompt(promptLower)) {
      return [
        "ผมอยู่ข้างคุณนะ และเรื่องนี้สำคัญมาก",
        "- ตอนนี้ขอให้คุณติดต่อคนที่ไว้ใจได้ใกล้ตัวทันที",
        "- ถ้าไม่ปลอดภัย ให้โทร 1669 (ฉุกเฉิน) หรือสายด่วนสุขภาพจิต 1323 ทันที",
        "- ถ้าคุณอยาก ผมช่วยวางแผน 3 ขั้นตอนสั้นๆ เพื่อพาคุณผ่านคืนนี้ไปก่อน"
      ].join("\n");
    }

    return [
      "ขอบคุณที่บอกผมนะ ผมรับฟังอยู่",
      "- ถ้าตอนนี้หนักมาก ลองหายใจลึกช้าๆ 5 รอบก่อน",
      "- ถ้าอยาก ผมช่วยคุยเป็นขั้นตอน: ระบายสิ่งที่หนักสุดตอนนี้ > แยกสิ่งที่คุมได้ > วางแผนเล็กๆ ภายในวันนี้",
      "- ถ้าความเครียดรุนแรงต่อเนื่อง โทรสายด่วนสุขภาพจิต 1323 ได้ตลอด 24 ชั่วโมง"
    ].join("\n");
  }

  buildSmallTalkAnswer(promptLower) {
    if (this.isEmotionalSupportPrompt(promptLower) || this.isCrisisPrompt(promptLower)) {
      return this.buildEmotionalSupportAnswer(promptLower);
    }

    if (includesAny(promptLower, ["คุยไม่ได้", "ทำไมคุณคุยไม่ได้", "ทำไมคุยไม่ได้"])) {
      return [
        "คุยได้ครับ ตอนนี้ผมถูกตั้งให้โฟกัสงานวิเคราะห์ข้อมูล LTC เป็นหลัก",
        "- ถ้าต้องการคุยเล่นก็ได้ แต่คำตอบที่แม่นที่สุดจะเป็นเรื่องข้อมูลในระบบ",
        "- ลองพิมพ์: สรุปผู้รับบริการ / วิเคราะห์การเงิน / ตรวจสต็อกใกล้หมด"
      ].join("\n");
    }

    if (includesAny(promptLower, ["ขอบคุณ", "thank you"])) {
      return "ยินดีครับ ถ้าพร้อม ผมช่วยวิเคราะห์ข้อมูล LTC ต่อได้เลย";
    }

    return [
      "คุยได้ครับ เรื่องชีวิตหรือความรู้สึกก็คุยกันได้",
      "- ถ้าอยากระบาย ลองเล่าเรื่องที่หนักที่สุดตอนนี้มาได้เลย ผมจะช่วยค่อยๆแยกทีละส่วน",
      "- ถ้าต้องการกลับมางาน LTC เมื่อไหร่ ผมพร้อมสลับไปวิเคราะห์ข้อมูลให้ทันที"
    ].join("\n");
  }

  detectIntents(promptLower) {
    const intents = new Set();

    const hasDispenseVerb = includesAny(promptLower, ["เบิก", "เบิกจ่าย", "จ่าย", "รับเบิก", "เบิกไปใช้", "จ่ายให้", "จ่ายไป"]);
    const hasDispenseSubject = includesAny(promptLower, ["วัสดุ", "เวชภัณฑ์", "เครื่อง", "อุปกรณ์", "ผู้รับ", "ใคร", "คนไหน"]);
    const looksLikeDispense = hasDispenseVerb && hasDispenseSubject;

    if (includesAny(promptLower, ["ผู้รับบริการ", "ผู้ป่วย", "ภาวะพึ่งพิง", "tai", "adl"])) intents.add("dependents");
    if (includesAny(promptLower, ["รายรับ", "รายจ่าย", "การเงิน", "งบ", "budget", "คงเหลือ"])) intents.add("finance");
    if (includesAny(promptLower, ["คลัง", "วัสดุ", "สต็อก", "stock", "ใกล้หมด", "หมดคลัง", "คงคลัง", "คงเหลือวัสดุ"])) intents.add("stock");
    if (
      looksLikeDispense ||
      includesAny(promptLower, [
        "เบิกจ่าย",
        "ผู้รับเบิก",
        "ประวัติเบิก",
        "จ่ายให้ใคร",
        "เบิกอะไร",
        "เครื่องอะไรไปแล้ว",
        "ใครรับ",
        "ใครเบิก",
        "มีใครเบิก",
        "เบิกไปใช้",
        "เบิกไปแล้ว",
        "เบิกให้",
        "เบิกวัสดุ",
        "เบิกเครื่อง"
      ])
    ) {
      intents.add("dispense");
    }
    if (includesAny(promptLower, ["cg", "cm", "กำลังคน", "บุคลากร", "ทีมดูแล"])) intents.add("workforce");
    if (includesAny(promptLower, ["หน่วย", "unit", "รพ.", "โรงพยาบาล", "รพสต"])) intents.add("unit");

    if (includesAny(promptLower, ["แนวโน้ม", "trend", "เปรียบเทียบ", "เทียบ", "เดือน", "ไตรมาส"])) intents.add("trend");
    if (includesAny(promptLower, ["แนะนำ", "ควร", "ปรับปรุง", "action", "แผน", "risk", "ความเสี่ยง", "ทำอย่างไร", "what should"])) {
      intents.add("advice");
    }

    if (includesAny(promptLower, ["กราฟ", "แผนภูมิ", "chart", "visual", "plot"])) intents.add("chart");
    if (includesAny(promptLower, ["ไฟล์", "export", "ดาวน์โหลด", "download", "csv", "json", "markdown", "รายงาน", "report"])) {
      intents.add("artifact");
    }
    if (includesAny(promptLower, ["สรุป", "overview", "snapshot", "ภาพรวม"])) intents.add("summary");
    if (this.isSmallTalkPrompt(promptLower) || this.isGreetingPrompt(promptLower) || this.isEmotionalSupportPrompt(promptLower)) {
      intents.add("smalltalk");
    }

    return intents;
  }

  shouldUseGemini(promptLower, intents) {
    if (!this.geminiClient || !this.geminiClient.isEnabled()) return false;
    // Keep deterministic local response for crisis/safety prompts.
    if (this.isCrisisPrompt(promptLower)) return false;
    // Keep transactional answers deterministic to avoid drifting from database facts.
    if (intents.has("dispense")) return false;

    return true;
  }

  buildLocalAnswer(promptLower, ctx, intents) {
    if (this.isGreetingPrompt(promptLower)) {
      return [
        "สวัสดีครับ ผมพร้อมช่วยวิเคราะห์ข้อมูล LTC ให้ทันที",
        "- ลองพิมพ์: สรุปผู้รับบริการ, วิเคราะห์การเงิน, ตรวจสต็อกใกล้หมด, แนะนำแผนปรับปรุง"
      ].join("\n");
    }

    if (intents.has("smalltalk")) {
      return this.buildSmallTalkAnswer(promptLower);
    }

    const wantsOverview = intents.has("summary");
    const sections = [];

    if (intents.has("dependents") || wantsOverview) sections.push(this.buildDependentsAnswer(ctx));
    if (intents.has("finance") || (wantsOverview && includesAny(promptLower, ["การเงิน", "งบ", "รายรับ", "รายจ่าย"]))) {
      sections.push(this.buildFinanceAnswer(ctx));
    }
    if (intents.has("dispense")) {
      sections.push(this.buildDispenseAnswer(ctx, promptLower));
    }

    const asksStockAlert = includesAny(promptLower, ["ใกล้หมด", "หมดคลัง", "คงคลัง", "เติมสต็อก"]);
    const includeStockSection =
      asksStockAlert || (intents.has("stock") && !intents.has("dispense")) || (wantsOverview && includesAny(promptLower, ["คลัง", "สต็อก", "วัสดุ"]));
    if (includeStockSection) {
      sections.push(this.buildStockAnswer(ctx));
    }
    if (intents.has("workforce") || intents.has("unit") || (wantsOverview && includesAny(promptLower, ["cg", "cm", "หน่วย"]))) {
      sections.push(this.buildWorkforceAnswer(ctx));
    }

    if (!sections.length) {
      if (wantsOverview || intents.has("advice")) sections.push(this.buildGeneralAnswer(ctx));
      else {
        return [
          "ผมคุยได้ครับ แต่ตอนนี้คำถามนี้ยังไม่ชัดว่าอยากดูข้อมูลด้านไหน",
          "- ลองระบุเพิ่ม เช่น ผู้รับบริการ / การเงิน / คลังวัสดุ / หน่วยงาน"
        ].join("\n");
      }
    }

    if (intents.has("advice")) {
      sections.push(this.buildAdviceAnswer(ctx));
    }

    return sections.join("\n\n");
  }

  cleanModelAnswer(text) {
    const cleaned = String(text || "")
      .replace(/\r/g, "")
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
      .trim();

    if (!cleaned) return "";
    return cleaned.slice(0, 3000);
  }

  buildGeminiPrompt(input) {
    const stockLines = input.ctx.stockAlerts
      .slice(0, 10)
      .map((row) => `- ${row.productName} (${row.productID}) คงเหลือ ${row.balance} ${row.unit} | เกณฑ์ ${row.reorderPoint} | ${row.status}`)
      .join("\n");

    const workloadLines = input.ctx.workforce.rows
      .slice(0, 8)
      .map((row) => {
        const ratio = row.dependentsPerCm == null ? "ไม่มี CM" : `${row.dependentsPerCm.toFixed(2)} ราย/CM`;
        return `- ${row.unitName} (${row.unitCode}) ผู้รับบริการ ${row.dependentCount}, CM ${row.cmCount}, CG ${row.cgCount}, ภาระ ${ratio}`;
      })
      .join("\n");

    const trendLines = input.ctx.financeTimeline.months
      .slice(-6)
      .map((row) => `- ${this.formatMonthLabel(row.month)} รายรับ ${row.income.toLocaleString("th-TH")} | รายจ่าย ${row.expense.toLocaleString("th-TH")} | สุทธิ ${row.net.toLocaleString("th-TH")}`)
      .join("\n");

    const dispenseLines = input.ctx.dispenseHistory.recentRows
      .slice(0, 10)
      .map(
        (row) =>
          `- ${this.formatDateCompact(row.outdate)} | ${row.productName} (${row.productID || "-"}) | ${row.quantity.toLocaleString("th-TH")} ${row.unit} | ผู้รับ ${row.recipientName} (${row.recipientCode})`
      )
      .join("\n");

    const historyLines = (Array.isArray(input.history) ? input.history : [])
      .slice(-8)
      .map((item) => {
        const role = String(item?.role || "").toLowerCase() === "assistant" ? "assistant" : "user";
        const text = sanitizeText(item?.text || "", 500);
        return `${role}: ${text}`;
      })
      .filter(Boolean)
      .join("\n");

    const facts = [
      `FACT total_dependents=${input.ctx.dependents.length}`,
      `FACT high_dependents=${input.ctx.careStats.highCount}`,
      `FACT cg=${input.ctx.cgRows.length}`,
      `FACT cm=${input.ctx.cmRows.length}`,
      `FACT units=${input.ctx.unitRows.length}`,
      `FACT total_income=${input.ctx.finance.totalIncome}`,
      `FACT total_expense=${input.ctx.finance.totalExpense}`,
      `FACT net=${input.ctx.finance.net}`,
      `FACT stock_alerts=${input.ctx.stockAlerts.length}`,
      `FACT total_dispense_rows=${input.ctx.dispenseHistory.totalRows}`,
      `FACT total_dispense_qty=${input.ctx.dispenseHistory.totalQuantity}`
    ].join("\n");

    return [
      "บทบาท: คุณคือผู้ช่วยวิเคราะห์ข้อมูล LTC ภาษาไทย",
      "กติกา:",
      "1) ใช้เฉพาะข้อมูลใน FACT และ CONTEXT ด้านล่างเท่านั้น",
      "2) ห้ามสร้างตัวเลขใหม่ หรือเดาข้อมูลที่ไม่มี",
      "3) ถ้าข้อมูลไม่พอ ให้บอกตรงๆว่าไม่พอ",
      "4) ตอบเป็นภาษาไทย กระชับ อ่านง่าย เป็น bullet ได้",
      "",
      `คำถามผู้ใช้: ${input.prompt}`,
      historyLines ? `บทสนทนาล่าสุด:\n${historyLines}` : "บทสนทนาล่าสุด: ไม่มี",
      "",
      facts,
      "",
      "CONTEXT-CARE:",
      `- TAI I1=${input.ctx.careStats.taiCounts.I1} I2=${input.ctx.careStats.taiCounts.I2} I3=${input.ctx.careStats.taiCounts.I3} B3=${input.ctx.careStats.taiCounts.B3} C2=${input.ctx.careStats.taiCounts.C2} C3=${input.ctx.careStats.taiCounts.C3}`,
      `- เพศ ชาย=${input.ctx.careStats.male} หญิง=${input.ctx.careStats.female} ไม่ระบุ=${input.ctx.careStats.unknown}`,
      "",
      "CONTEXT-FINANCE-TREND:",
      trendLines || "- ไม่มีข้อมูลรายเดือน",
      "",
      "CONTEXT-STOCK-ALERTS:",
      stockLines || "- ไม่พบรายการ",
      "",
      "CONTEXT-WORKFORCE-BY-UNIT:",
      workloadLines || "- ไม่พบข้อมูล",
      "",
      "CONTEXT-DISPENSE-LATEST:",
      dispenseLines || "- ไม่พบรายการ",
      "",
      `คำตอบพื้นฐานจากระบบ (fallback):\n${input.localAnswer}`,
      "",
      "ให้ตอบโดยอ้างอิง FACT เป็นหลัก และขยายความเชิงวิเคราะห์เฉพาะที่ข้อมูลรองรับได้"
    ].join("\n");
  }

  async refineWithGemini(prompt, promptLower, intents, ctx, localAnswer, history = []) {
    if (!this.shouldUseGemini(promptLower, intents)) {
      return {
        answer: localAnswer,
        source: "local-rule-based"
      };
    }

    try {
      const geminiPrompt = this.buildGeminiPrompt({ prompt, ctx, localAnswer, history });
      const answer = await this.geminiClient.generate(geminiPrompt);
      const cleaned = this.cleanModelAnswer(answer);
      if (!cleaned) {
        return { answer: localAnswer, source: "local-fallback-empty" };
      }
      return { answer: cleaned, source: "gemini" };
    } catch {
      return { answer: localAnswer, source: "local-fallback-error" };
    }
  }

  buildCareDistributionChart(ctx) {
    const keys = ["I1", "I2", "I3", "B3", "C2", "C3"];
    return {
      title: "การกระจายระดับการดูแล (TAI)",
      type: "bar",
      unit: "ราย",
      labels: keys,
      datasets: [
        {
          label: "ผู้รับบริการ",
          color: "#2f7fc2",
          data: keys.map((key) => this.safeNumber(ctx.careStats.taiCounts[key]))
        }
      ]
    };
  }

  buildFinanceChart(ctx) {
    return {
      title: "รายรับ-รายจ่ายภาพรวม",
      type: "bar",
      unit: "บาท",
      labels: ["รายรับรวม", "รายจ่ายรวม", "คงเหลือสุทธิ"],
      datasets: [
        {
          label: "งบประมาณ",
          color: "#1f8b4d",
          data: [ctx.finance.totalIncome, ctx.finance.totalExpense, ctx.finance.net]
        }
      ]
    };
  }

  buildFinanceTrendChart(ctx) {
    const rows = ctx.financeTimeline.months;
    if (!rows.length) return null;

    return {
      title: "แนวโน้มการเงิน 6 เดือนล่าสุด",
      type: "bar",
      unit: "บาท",
      labels: rows.map((row) => this.formatMonthLabel(row.month)),
      datasets: [
        {
          label: "รายรับ",
          color: "#0ea5e9",
          data: rows.map((row) => this.safeNumber(row.income))
        },
        {
          label: "รายจ่าย",
          color: "#ef4444",
          data: rows.map((row) => this.safeNumber(row.expense))
        },
        {
          label: "สุทธิ",
          color: "#16a34a",
          data: rows.map((row) => this.safeNumber(row.net))
        }
      ]
    };
  }

  buildWorkforceChart(ctx) {
    return {
      title: "กำลังคนและหน่วยงาน",
      type: "bar",
      unit: "จำนวน",
      labels: ["ผู้รับบริการ", "CG", "CM", "หน่วยงาน"],
      datasets: [
        {
          label: "จำนวน",
          color: "#7a5af5",
          data: [ctx.dependents.length, ctx.cgRows.length, ctx.cmRows.length, ctx.unitRows.length]
        }
      ]
    };
  }

  buildUnitLoadChart(ctx) {
    const rows = ctx.workforce.rows.slice(0, 6);
    if (!rows.length) return null;

    return {
      title: "ภาระงานต่อหน่วย (Top 6)",
      type: "bar",
      unit: "ราย",
      labels: rows.map((row) => `${row.unitName} (${row.unitCode})`),
      datasets: [
        {
          label: "ผู้รับบริการ",
          color: "#f97316",
          data: rows.map((row) => this.safeNumber(row.dependentCount))
        },
        {
          label: "CM",
          color: "#2563eb",
          data: rows.map((row) => this.safeNumber(row.cmCount))
        },
        {
          label: "CG",
          color: "#a855f7",
          data: rows.map((row) => this.safeNumber(row.cgCount))
        }
      ]
    };
  }

  buildStockAlertsChart(ctx) {
    const rows = [...ctx.stockAlerts]
      .sort((a, b) => this.safeNumber(a.balance) - this.safeNumber(b.balance))
      .slice(0, 8);
    if (!rows.length) return null;

    return {
      title: "วัสดุใกล้หมด/หมดคลัง",
      type: "bar",
      unit: "ชิ้น",
      labels: rows.map((row) => String(row.productName || row.productID || "-")),
      datasets: [
        {
          label: "คงเหลือ",
          color: "#d64d4d",
          data: rows.map((row) => this.safeNumber(row.balance))
        },
        {
          label: "เกณฑ์สั่งซื้อ",
          color: "#f59e0b",
          data: rows.map((row) => this.safeNumber(row.reorderPoint))
        }
      ]
    };
  }

  buildDispenseChart(ctx) {
    const rows = ctx.dispenseHistory.topProducts.slice(0, 8);
    if (!rows.length) return null;

    return {
      title: "รายการเบิกจ่ายสูงสุด",
      type: "bar",
      unit: "หน่วย",
      labels: rows.map((row) => `${row.productName} (${row.productID || "-"})`),
      datasets: [
        {
          label: "จำนวนเบิกจ่าย",
          color: "#2563eb",
          data: rows.map((row) => this.safeNumber(row.quantity))
        }
      ]
    };
  }

  normalizeChart(chart) {
    if (!chart || !Array.isArray(chart.labels) || !Array.isArray(chart.datasets)) return null;
    const labels = chart.labels.map((item) => sanitizeText(item, 80)).filter(Boolean);
    if (!labels.length) return null;

    const datasets = chart.datasets
      .map((set) => {
        const data = Array.isArray(set?.data) ? set.data.map((item) => this.safeNumber(item)) : [];
        if (!data.length) return null;
        return {
          label: sanitizeText(set?.label || "-", 80) || "-",
          color: sanitizeText(set?.color || "#2f7fc2", 30) || "#2f7fc2",
          data: data.slice(0, labels.length)
        };
      })
      .filter(Boolean);

    if (!datasets.length) return null;

    return {
      title: sanitizeText(chart.title || "กราฟสรุปข้อมูล", 120),
      type: sanitizeText(chart.type || "bar", 20) || "bar",
      unit: sanitizeText(chart.unit || "", 40),
      labels,
      datasets
    };
  }

  buildCharts(promptLower, ctx, intents) {
    const wantsChart = intents.has("chart") || includesAny(promptLower, ["กราฟ", "แผนภูมิ", "chart", "plot", "visual"]);
    if (!wantsChart) return [];

    const charts = [];

    if (intents.has("finance")) {
      charts.push(this.buildFinanceChart(ctx));
      if (intents.has("trend") || includesAny(promptLower, ["trend", "แนวโน้ม", "เดือน", "เปรียบเทียบ"])) {
        charts.push(this.buildFinanceTrendChart(ctx));
      }
    }

    if (intents.has("stock")) {
      charts.push(this.buildStockAlertsChart(ctx));
    }
    if (intents.has("dispense")) {
      charts.push(this.buildDispenseChart(ctx));
    }

    if (intents.has("dependents")) {
      charts.push(this.buildCareDistributionChart(ctx));
    }

    if (intents.has("workforce") || intents.has("unit")) {
      charts.push(this.buildWorkforceChart(ctx), this.buildUnitLoadChart(ctx));
    }

    if (!charts.length) {
      charts.push(this.buildFinanceChart(ctx), this.buildWorkforceChart(ctx));
    }

    return charts.map((item) => this.normalizeChart(item)).filter(Boolean).slice(0, 3);
  }

  sanitizeFileName(name) {
    const cleaned = String(name || "")
      .replace(/[\/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 80);
    return cleaned || `ltc-report-${Date.now()}`;
  }

  makeArtifact(fileName, mimeType, contentText) {
    const content = String(contentText || "");
    return {
      id: crypto.randomUUID(),
      fileName: this.sanitizeFileName(fileName),
      mimeType: String(mimeType || "text/plain"),
      size: Buffer.byteLength(content, "utf8"),
      contentBase64: Buffer.from(content, "utf8").toString("base64")
    };
  }

  buildFinanceCsv(ctx) {
    const lines = [
      "metric,value",
      `total_income,${this.safeNumber(ctx.finance.totalIncome)}`,
      `total_expense,${this.safeNumber(ctx.finance.totalExpense)}`,
      `net,${this.safeNumber(ctx.finance.net)}`,
      `dependents,${ctx.dependents.length}`,
      `cg,${ctx.cgRows.length}`,
      `cm,${ctx.cmRows.length}`,
      `units,${ctx.unitRows.length}`
    ];
    return lines.join("\n");
  }

  buildStockCsv(ctx) {
    const header = "product_id,product_name,balance,reorder_point,status";
    const rows = ctx.stockAlerts
      .slice(0, 100)
      .map(
        (row) =>
          `${String(row.productID || "").replaceAll(",", " ")},${String(row.productName || "").replaceAll(",", " ")},${this.safeNumber(
            row.balance
          )},${this.safeNumber(row.reorderPoint)},${String(row.status || "")}`
      );
    return [header, ...rows].join("\n");
  }

  buildDispenseCsv(ctx) {
    const header = "date,product_id,product_name,brand,machine_code,quantity,unit,recipient_code,recipient_name,round,reference,note";
    const rows = ctx.dispenseHistory.rows.slice(0, 300).map((row) => {
      const safe = (value) => String(value || "").replaceAll(",", " ");
      return [
        safe(this.formatDateCompact(row.outdate)),
        safe(row.productID),
        safe(row.productName),
        safe(row.brand),
        safe(row.machineCode),
        this.safeNumber(row.quantity),
        safe(row.unit),
        safe(row.recipientCode),
        safe(row.recipientName),
        safe(row.round),
        safe(row.reference),
        safe(row.note)
      ].join(",");
    });
    return [header, ...rows].join("\n");
  }

  buildWorkforceCsv(ctx) {
    const header = "unit_code,unit_name,dependents,cm,cg,dependents_per_cm";
    const rows = ctx.workforce.rows.slice(0, 100).map((row) => {
      const ratio = row.dependentsPerCm == null ? "" : row.dependentsPerCm.toFixed(2);
      return `${String(row.unitCode || "")},${String(row.unitName || "").replaceAll(",", " ")},${this.safeNumber(
        row.dependentCount
      )},${this.safeNumber(row.cmCount)},${this.safeNumber(row.cgCount)},${ratio}`;
    });
    return [header, ...rows].join("\n");
  }

  buildCareCsv(ctx) {
    const tai = ctx.careStats.taiCounts;
    const lines = [
      "metric,value",
      `I1,${tai.I1}`,
      `I2,${tai.I2}`,
      `I3,${tai.I3}`,
      `B3,${tai.B3}`,
      `C2,${tai.C2}`,
      `C3,${tai.C3}`,
      `high_dependency,${ctx.careStats.highCount}`,
      `male,${ctx.careStats.male}`,
      `female,${ctx.careStats.female}`,
      `unknown_gender,${ctx.careStats.unknown}`
    ];
    return lines.join("\n");
  }

  buildMarkdownSummary(prompt, ctx, answer) {
    const latestMonth = ctx.financeTimeline.latest;
    const lines = [
      "# LTC AI Report",
      "",
      `- generated_at: ${nowIso()}`,
      `- prompt: ${prompt}`,
      "",
      "## Summary",
      "",
      answer,
      "",
      "## Snapshot",
      "",
      `- ผู้รับบริการ: ${ctx.dependents.length}`,
      `- พึ่งพิงสูง: ${ctx.careStats.highCount}`,
      `- CG: ${ctx.cgRows.length}`,
      `- CM: ${ctx.cmRows.length}`,
      `- หน่วยงาน: ${ctx.unitRows.length}`,
      `- รายรับรวม: ${ctx.finance.totalIncome.toLocaleString("th-TH")} บาท`,
      `- รายจ่ายรวม: ${ctx.finance.totalExpense.toLocaleString("th-TH")} บาท`,
      `- คงเหลือสุทธิ: ${ctx.finance.net.toLocaleString("th-TH")} บาท`,
      `- เบิกจ่ายรวม: ${ctx.dispenseHistory.totalRows.toLocaleString("th-TH")} รายการ (${ctx.dispenseHistory.totalQuantity.toLocaleString(
        "th-TH"
      )} หน่วย)`,
      latestMonth
        ? `- เดือนล่าสุด (${this.formatMonthLabel(latestMonth.month)}) สุทธิ: ${latestMonth.net.toLocaleString("th-TH")} บาท`
        : "- เดือนล่าสุด: ไม่มีข้อมูล"
    ];
    return lines.join("\n");
  }

  buildJsonSnapshot(ctx) {
    const payload = {
      generatedAt: nowIso(),
      totals: {
        dependents: ctx.dependents.length,
        highDependents: ctx.careStats.highCount,
        cg: ctx.cgRows.length,
        cm: ctx.cmRows.length,
        units: ctx.unitRows.length
      },
      finance: ctx.finance,
      financeTimeline: ctx.financeTimeline,
      care: ctx.careStats,
      workforceTop: ctx.workforce.rows.slice(0, 10),
      stockAlerts: ctx.stockAlerts.slice(0, 30),
      dispenseHistory: {
        totalRows: ctx.dispenseHistory.totalRows,
        totalQuantity: ctx.dispenseHistory.totalQuantity,
        recentRows: ctx.dispenseHistory.recentRows.slice(0, 20)
      }
    };
    return JSON.stringify(payload, null, 2);
  }

  buildArtifacts(promptLower, prompt, ctx, answer, intents) {
    const wantsFile =
      intents.has("artifact") || includesAny(promptLower, ["ไฟล์", "export", "ดาวน์โหลด", "download", "csv", "json", "markdown", "รายงาน", "report"]);
    if (!wantsFile) return [];

    const artifacts = [];
    const timeKey = new Date().toISOString().slice(0, 10);
    const wantsCsv = includesAny(promptLower, ["csv"]);
    const hasDomainIntent =
      intents.has("finance") ||
      intents.has("stock") ||
      intents.has("workforce") ||
      intents.has("unit") ||
      intents.has("dependents") ||
      intents.has("dispense");

    if (intents.has("finance") || includesAny(promptLower, ["รายรับ", "รายจ่าย", "งบ", "การเงิน"])) {
      artifacts.push(this.makeArtifact(`finance-summary-${timeKey}.csv`, "text/csv;charset=utf-8", this.buildFinanceCsv(ctx)));
    }

    if (intents.has("stock") || includesAny(promptLower, ["วัสดุ", "สต็อก", "คลัง", "ใกล้หมด"])) {
      artifacts.push(this.makeArtifact(`stock-alerts-${timeKey}.csv`, "text/csv;charset=utf-8", this.buildStockCsv(ctx)));
    }

    if (intents.has("dispense") || includesAny(promptLower, ["เบิกจ่าย", "ผู้รับเบิก", "จ่ายให้ใคร", "ประวัติเบิก"])) {
      artifacts.push(this.makeArtifact(`dispense-history-${timeKey}.csv`, "text/csv;charset=utf-8", this.buildDispenseCsv(ctx)));
    }

    if (intents.has("workforce") || intents.has("unit") || includesAny(promptLower, ["หน่วย", "cg", "cm", "กำลังคน"])) {
      artifacts.push(this.makeArtifact(`workforce-summary-${timeKey}.csv`, "text/csv;charset=utf-8", this.buildWorkforceCsv(ctx)));
    }

    if (intents.has("dependents") || includesAny(promptLower, ["tai", "ภาวะพึ่งพิง", "ผู้รับบริการ"])) {
      artifacts.push(this.makeArtifact(`care-summary-${timeKey}.csv`, "text/csv;charset=utf-8", this.buildCareCsv(ctx)));
    }

    if (includesAny(promptLower, ["json"])) {
      artifacts.push(this.makeArtifact(`ltc-snapshot-${timeKey}.json`, "application/json", this.buildJsonSnapshot(ctx)));
    }

    if (includesAny(promptLower, ["markdown", "md", "รายงาน", "report", "ไฟล์"])) {
      artifacts.push(this.makeArtifact(`ltc-report-${timeKey}.md`, "text/markdown;charset=utf-8", this.buildMarkdownSummary(prompt, ctx, answer)));
    }

    if (wantsCsv && !hasDomainIntent && !artifacts.length) {
      artifacts.push(this.makeArtifact(`finance-summary-${timeKey}.csv`, "text/csv;charset=utf-8", this.buildFinanceCsv(ctx)));
    }

    if (!artifacts.length) {
      artifacts.push(this.makeArtifact(`ltc-report-${timeKey}.md`, "text/markdown;charset=utf-8", this.buildMarkdownSummary(prompt, ctx, answer)));
    }

    const unique = [];
    const seen = new Set();
    for (const item of artifacts) {
      const key = `${item.fileName}|${item.mimeType}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }

    return unique.slice(0, 4);
  }

  buildSuggestions(ctx, intents) {
    const suggestions = [];

    if (!intents.has("dependents")) suggestions.push("สรุปผู้รับบริการและกลุ่มพึ่งพิงสูง");
    if (!intents.has("finance")) suggestions.push("วิเคราะห์รายรับรายจ่ายและเงินคงเหลือ");
    if (!intents.has("stock")) suggestions.push("ตรวจรายการวัสดุใกล้หมด/หมดคลัง");
    if (!intents.has("dispense")) suggestions.push("เบิกจ่ายเครื่องอะไรให้ใครบ้างล่าสุด");
    if (!intents.has("workforce") && !intents.has("unit")) suggestions.push("ภาระงานต่อหน่วยและสัดส่วน CM/CG");

    if (ctx.stockAlerts.length > 0) {
      suggestions.push("แนะนำแผนเติมสต็อกเร่งด่วน");
    }
    if (ctx.financeTimeline.months.length >= 2) {
      suggestions.push("แนวโน้มการเงิน 6 เดือนล่าสุด");
    }

    const unique = [];
    const seen = new Set();
    for (const item of suggestions) {
      const key = String(item || "").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(key);
    }

    return unique.slice(0, 5);
  }

  async loadContextSnapshot() {
    const [dependents, cgRows, cmRows, financeRows, productRows, inRows, outRows, unitRows] = await Promise.all([
      this.readRows("t04_dataj"),
      this.readRows("t01_cg"),
      this.readRows("t02_cm"),
      this.readRows("t23_tbl_income_expense"),
      this.readRows("t16_product"),
      this.readRows("t09_intproduct"),
      this.readRows("t13_outproduct"),
      this.readRows("t26_unit")
    ]);

    const finance = this.summarizeFinance(financeRows);
    const financeTimeline = this.buildFinanceTimeline(financeRows);
    const careStats = this.buildCareStats(dependents);
    const stockAlerts = this.computeStockAlerts(productRows, inRows, outRows);
    const dispenseHistory = this.buildDispenseHistory(productRows, outRows, dependents);
    const workforce = this.buildWorkforceByUnit(unitRows, cmRows, cgRows, dependents);

    return {
      dependents,
      cgRows,
      cmRows,
      unitRows,
      financeRows,
      finance,
      financeTimeline,
      careStats,
      stockAlerts,
      dispenseHistory,
      workforce
    };
  }

  async getContextSnapshot(options = {}) {
    const forceFresh = options?.forceFresh === true;
    if (forceFresh) {
      return this.loadContextSnapshot();
    }

    if (this.contextCacheMs <= 0) {
      return this.loadContextSnapshot();
    }

    const now = Date.now();
    if (this.contextCache && now < this.contextCacheExpiresAt) {
      return this.contextCache;
    }

    if (this.contextCachePromise) {
      return this.contextCachePromise;
    }

    this.contextCachePromise = this.loadContextSnapshot()
      .then((ctx) => {
        this.contextCache = ctx;
        this.contextCacheExpiresAt = Date.now() + this.contextCacheMs;
        return ctx;
      })
      .finally(() => {
        this.contextCachePromise = null;
      });

    return this.contextCachePromise;
  }

  async chat(message, history = []) {
    const prompt = sanitizeText(message, this.maxPromptChars);
    if (!prompt) {
      const error = new Error("กรุณากรอกคำถาม");
      error.status = 400;
      throw error;
    }

    const lower = prompt.toLowerCase();
    const forceFresh = includesAny(lower, ["ล่าสุด", "เมื่อกี้", "เพิ่ง", "เรียลไทม์", "เบิกจ่าย", "ผู้รับเบิก", "ใครเบิก", "เบิกไปใช้"]);
    const ctx = await this.getContextSnapshot({ forceFresh });
    const intents = this.detectIntents(lower);
    const localAnswer = this.buildLocalAnswer(lower, ctx, intents);

    const refined = await this.refineWithGemini(prompt, lower, intents, ctx, localAnswer, history);
    const charts = this.buildCharts(lower, ctx, intents);
    const artifacts = this.buildArtifacts(lower, prompt, ctx, refined.answer, intents);
    const suggestions = this.buildSuggestions(ctx, intents);

    return {
      answer: refined.answer,
      source: refined.source,
      charts,
      artifacts,
      suggestions,
      context: {
        dependents: ctx.dependents.length,
        highDependents: ctx.careStats.highCount,
        cg: ctx.cgRows.length,
        cm: ctx.cmRows.length,
        units: ctx.unitRows.length,
        stockAlerts: ctx.stockAlerts.length,
        dispenseRows: ctx.dispenseHistory.totalRows,
        financeNet: ctx.finance.net
      }
    };
  }
}

module.exports = {
  AiAssistantService
};
