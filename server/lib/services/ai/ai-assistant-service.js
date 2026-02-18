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

  summarizeFinance(rows) {
    const totalIncome = rows.reduce(
      (sum, row) => sum + (Number(row["รายรับ1"]) || 0) + (Number(row["รายรับ2"]) || 0) + (Number(row["รายรับ3"]) || 0) + (Number(row["รายรับ4"]) || 0),
      0
    );
    const totalExpense = rows.reduce(
      (sum, row) => sum + (Number(row["รายจ่าย1"]) || 0) + (Number(row["รายจ่าย2"]) || 0) + (Number(row["รายจ่าย3"]) || 0) + (Number(row["รายจ่าย4"]) || 0),
      0
    );
    return {
      totalIncome,
      totalExpense,
      net: totalIncome - totalExpense
    };
  }

  computeStockAlerts(products, inRows, outRows) {
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

    const result = [];
    for (const row of products) {
      const productID = String(row.productID || "");
      const inQty = inMap[productID] || 0;
      const outQty = outMap[productID] || 0;
      const balance = inQty - outQty;
      const reorderPoint = Math.max(1, Number(row.reorderPoint || row.threshold || 10));

      if (balance <= reorderPoint) {
        result.push({
          productID,
          productName: String(row.productName || "-"),
          balance,
          reorderPoint,
          status: balance <= 0 ? "หมดคลัง" : "ใกล้หมด"
        });
      }
    }

    return result.sort((a, b) => a.balance - b.balance);
  }

  buildGeneralAnswer(ctx) {
    const stockText = ctx.stockAlerts.length
      ? ctx.stockAlerts
          .slice(0, 3)
          .map((row) => `${row.productName} (${row.balance})`)
          .join(", ")
      : "ไม่พบรายการใกล้หมด";

    return [
      `สรุปข้อมูลล่าสุด: ผู้รับบริการ ${ctx.dependents.length} ราย, CG ${ctx.cgRows.length} คน, CM ${ctx.cmRows.length} คน, หน่วยงาน ${ctx.unitRows.length} หน่วย`,
      `การเงิน: รายรับรวม ${ctx.finance.totalIncome.toLocaleString("th-TH")} บาท, รายจ่ายรวม ${ctx.finance.totalExpense.toLocaleString("th-TH")} บาท, คงเหลือ ${ctx.finance.net.toLocaleString("th-TH")} บาท`,
      `คลังวัสดุที่ต้องติดตาม: ${stockText}`
    ].join("\n");
  }

  safeNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return num;
  }

  buildCareDistributionChart(ctx) {
    const keys = ["I1", "I2", "I3", "B3", "C2", "C3"];
    const counts = {};
    for (const key of keys) counts[key] = 0;
    for (const row of ctx.dependents) {
      const key = String(row.TAI || "").toUpperCase();
      if (counts[key] != null) counts[key] += 1;
    }

    return {
      title: "กราฟการกระจายระดับการดูแล (TAI)",
      type: "bar",
      unit: "ราย",
      labels: keys,
      datasets: [
        {
          label: "จำนวนผู้รับบริการ",
          color: "#2f7fc2",
          data: keys.map((key) => counts[key] || 0)
        }
      ]
    };
  }

  buildFinanceChart(ctx) {
    return {
      title: "กราฟรายรับ-รายจ่าย",
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

  buildWorkforceChart(ctx) {
    return {
      title: "กราฟกำลังคนและหน่วยงาน",
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

  buildStockAlertsChart(ctx) {
    const rows = [...ctx.stockAlerts]
      .sort((a, b) => this.safeNumber(a.balance) - this.safeNumber(b.balance))
      .slice(0, 8);
    if (!rows.length) return null;
    return {
      title: "กราฟวัสดุใกล้หมด/หมดคลัง",
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

  buildCharts(promptLower, ctx) {
    const wantsChart = includesAny(promptLower, ["กราฟ", "แผนภูมิ", "chart", "visual", "plot"]);
    if (!wantsChart) return [];

    const charts = [];
    if (includesAny(promptLower, ["รายรับ", "รายจ่าย", "การเงิน", "งบ"])) {
      charts.push(this.buildFinanceChart(ctx));
    } else if (includesAny(promptLower, ["วัสดุ", "สต็อก", "คลัง", "ใกล้หมด", "หมดคลัง"])) {
      charts.push(this.buildStockAlertsChart(ctx));
    } else if (includesAny(promptLower, ["ผู้รับบริการ", "ภาวะพึ่งพิง", "tai"])) {
      charts.push(this.buildCareDistributionChart(ctx));
    } else if (includesAny(promptLower, ["cg", "cm", "หน่วย", "กำลังคน"])) {
      charts.push(this.buildWorkforceChart(ctx));
    } else {
      charts.push(this.buildFinanceChart(ctx), this.buildWorkforceChart(ctx));
    }

    return charts.map((item) => this.normalizeChart(item)).filter(Boolean).slice(0, 2);
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
      .slice(0, 50)
      .map(
        (row) =>
          `${String(row.productID || "").replaceAll(",", " ")},${String(row.productName || "").replaceAll(",", " ")},${this.safeNumber(row.balance)},${this.safeNumber(row.reorderPoint)},${String(row.status || "")}`
      );
    return [header, ...rows].join("\n");
  }

  buildMarkdownSummary(prompt, ctx, answer) {
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
      `- CG: ${ctx.cgRows.length}`,
      `- CM: ${ctx.cmRows.length}`,
      `- หน่วยงาน: ${ctx.unitRows.length}`,
      `- รายรับรวม: ${ctx.finance.totalIncome.toLocaleString("th-TH")} บาท`,
      `- รายจ่ายรวม: ${ctx.finance.totalExpense.toLocaleString("th-TH")} บาท`,
      `- คงเหลือสุทธิ: ${ctx.finance.net.toLocaleString("th-TH")} บาท`
    ];
    return lines.join("\n");
  }

  buildJsonSnapshot(ctx) {
    const payload = {
      generatedAt: nowIso(),
      totals: {
        dependents: ctx.dependents.length,
        cg: ctx.cgRows.length,
        cm: ctx.cmRows.length,
        units: ctx.unitRows.length
      },
      finance: ctx.finance,
      stockAlerts: ctx.stockAlerts.slice(0, 20)
    };
    return JSON.stringify(payload, null, 2);
  }

  buildArtifacts(promptLower, prompt, ctx, answer) {
    const wantsFile = includesAny(promptLower, ["ไฟล์", "export", "ดาวน์โหลด", "download", "csv", "json", "markdown", "รายงาน", "report"]);
    if (!wantsFile) return [];

    const artifacts = [];
    const timeKey = new Date().toISOString().slice(0, 10);

    if (includesAny(promptLower, ["csv", "รายรับ", "รายจ่าย", "งบ", "การเงิน"])) {
      artifacts.push(this.makeArtifact(`finance-summary-${timeKey}.csv`, "text/csv;charset=utf-8", this.buildFinanceCsv(ctx)));
    }

    if (includesAny(promptLower, ["csv", "วัสดุ", "สต็อก", "คลัง", "ใกล้หมด"])) {
      artifacts.push(this.makeArtifact(`stock-alerts-${timeKey}.csv`, "text/csv;charset=utf-8", this.buildStockCsv(ctx)));
    }

    if (includesAny(promptLower, ["json"])) {
      artifacts.push(this.makeArtifact(`ltc-snapshot-${timeKey}.json`, "application/json", this.buildJsonSnapshot(ctx)));
    }

    if (includesAny(promptLower, ["markdown", "md", "รายงาน", "report", "ไฟล์"])) {
      artifacts.push(this.makeArtifact(`ltc-report-${timeKey}.md`, "text/markdown;charset=utf-8", this.buildMarkdownSummary(prompt, ctx, answer)));
    }

    if (!artifacts.length) {
      artifacts.push(this.makeArtifact(`ltc-report-${timeKey}.md`, "text/markdown;charset=utf-8", this.buildMarkdownSummary(prompt, ctx, answer)));
    }

    return artifacts.slice(0, 3);
  }

  buildGeminiPrompt(input) {
    const stockLines = input.ctx.stockAlerts
      .slice(0, 10)
      .map((row) => `${row.productName} (${row.productID}) คงเหลือ ${row.balance} เกณฑ์ ${row.reorderPoint} สถานะ ${row.status}`)
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

    const promptLines = [
      "คุณคือผู้ช่วยวิเคราะห์ข้อมูลระบบ LTC ให้ตอบภาษาไทยอย่างกระชับ ใช้ข้อมูลจริงที่ให้เท่านั้น",
      "ถ้าข้อมูลไม่พอ ให้บอกตรงๆว่าไม่พอ",
      `คำถามผู้ใช้: ${input.prompt}`,
      historyLines ? `บริบทบทสนทนาล่าสุด:\n${historyLines}` : "บริบทบทสนทนาล่าสุด: ไม่มี",
      "สรุปข้อมูลฐานล่าสุด:",
      `- ผู้รับบริการ: ${input.ctx.dependents.length} ราย`,
      `- CG: ${input.ctx.cgRows.length} คน`,
      `- CM: ${input.ctx.cmRows.length} คน`,
      `- หน่วยงาน: ${input.ctx.unitRows.length} หน่วย`,
      `- รายรับรวม: ${input.ctx.finance.totalIncome.toLocaleString("th-TH")} บาท`,
      `- รายจ่ายรวม: ${input.ctx.finance.totalExpense.toLocaleString("th-TH")} บาท`,
      `- คงเหลือสุทธิ: ${input.ctx.finance.net.toLocaleString("th-TH")} บาท`,
      "- วัสดุใกล้หมด/หมดคลัง:",
      stockLines || "ไม่พบรายการ",
      "",
      `คำตอบพื้นฐานของระบบ (fallback): ${input.localAnswer}`,
      "",
      "ตอบแบบ bullet หรือย่อหน้าอ่านง่าย และห้ามสร้างตัวเลขใหม่เอง"
    ];

    return promptLines.join("\n");
  }

  async refineWithGemini(prompt, ctx, localAnswer, history = []) {
    if (!this.geminiClient || !this.geminiClient.isEnabled()) {
      return {
        answer: localAnswer,
        source: "local-rule-based"
      };
    }

    try {
      const geminiPrompt = this.buildGeminiPrompt({ prompt, ctx, localAnswer, history });
      const answer = await this.geminiClient.generate(geminiPrompt);
      if (!answer) {
        return { answer: localAnswer, source: "local-fallback-empty" };
      }
      return { answer, source: "gemini" };
    } catch {
      return { answer: localAnswer, source: "local-fallback-error" };
    }
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

    return {
      dependents,
      cgRows,
      cmRows,
      unitRows,
      finance: this.summarizeFinance(financeRows),
      stockAlerts: this.computeStockAlerts(productRows, inRows, outRows)
    };
  }

  async getContextSnapshot() {
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

    const ctx = await this.getContextSnapshot();
    const dependents = ctx.dependents;
    const cgRows = ctx.cgRows;
    const cmRows = ctx.cmRows;
    const unitRows = ctx.unitRows;

    const lower = prompt.toLowerCase();
    let localAnswer = "";

    if (includesAny(lower, ["ผู้รับบริการ", "ผู้ป่วย", "ภาวะพึ่งพิง", "ltc"])) {
      const high = dependents.filter((row) => ["I3", "B3", "C2", "C3"].includes(String(row.TAI || "").toUpperCase())).length;
      localAnswer = `ข้อมูลผู้รับบริการล่าสุด: ทั้งหมด ${dependents.length} ราย และเป็นกลุ่มพึ่งพิงสูง ${high} ราย`;
    } else if (includesAny(lower, ["รายรับ", "รายจ่าย", "การเงิน", "งบ", "คงเหลือ"])) {
      localAnswer = `สรุปการเงิน: รายรับรวม ${ctx.finance.totalIncome.toLocaleString("th-TH")} บาท, รายจ่ายรวม ${ctx.finance.totalExpense.toLocaleString("th-TH")} บาท, คงเหลือสุทธิ ${ctx.finance.net.toLocaleString("th-TH")} บาท`;
    } else if (includesAny(lower, ["คลัง", "วัสดุ", "สต็อก", "เบิก", "ใกล้หมด", "หมดคลัง"])) {
      if (!ctx.stockAlerts.length) {
        localAnswer = "ไม่พบรายการวัสดุที่ใกล้หมดหรือหมดคลังในข้อมูลล่าสุด";
      } else {
        const lines = ctx.stockAlerts
          .slice(0, 5)
          .map((row) => `- ${row.productName} (${row.productID}) คงเหลือ ${row.balance} | สถานะ ${row.status}`)
          .join("\n");
        localAnswer = `รายการวัสดุที่ต้องติดตาม:\n${lines}`;
      }
    } else if (includesAny(lower, ["cg", "cm", "หน่วย", "เขตรับผิดชอบ"])) {
      localAnswer = `กำลังคนและหน่วยงาน: CG ${cgRows.length} คน, CM ${cmRows.length} คน, หน่วยงาน ${unitRows.length} หน่วย`;
    } else {
      localAnswer = this.buildGeneralAnswer(ctx);
    }

    const refined = await this.refineWithGemini(prompt, ctx, localAnswer, history);
    const charts = this.buildCharts(lower, ctx);
    const artifacts = this.buildArtifacts(lower, prompt, ctx, refined.answer);

    return {
      answer: refined.answer,
      source: refined.source,
      charts,
      artifacts,
      suggestions: ["สรุปผู้รับบริการ", "วิเคราะห์รายรับรายจ่าย", "ตรวจรายการวัสดุใกล้หมด"],
      context: {
        dependents: dependents.length,
        cg: cgRows.length,
        cm: cmRows.length,
        units: unitRows.length,
        stockAlerts: ctx.stockAlerts.length
      }
    };
  }
}

module.exports = {
  AiAssistantService
};
