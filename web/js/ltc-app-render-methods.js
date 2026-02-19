import { Format } from "./utils.js";
import { HIGH_TAI } from "./config.js";

class LtcAppRenderMethodCarrier {
  async renderAll() {
    await Promise.all([
      this.renderOverview(),
      this.renderDependents(),
      this.renderCg(),
      this.renderCm(),
      this.renderSupplies(),
      this.renderFinance(),
      this.renderUnits(),
      this.renderActivity()
    ]);
  }

  async renderActivity() {
    await this.activityPage.refreshAll();
  }

  async renderOverview() {
    const [dependents, cgRows, cmRows, unitRows, financeRows, inventoryRows] = await Promise.all([
      this.repo.getTable("t04_dataj"),
      this.repo.getTable("t01_cg"),
      this.repo.getTable("t02_cm"),
      this.repo.getTable("t26_unit"),
      this.repo.getTable("t23_tbl_income_expense"),
      this.domain.computeInventoryRows()
    ]);

    const taiCounts = this.helpers.countBy(dependents, (row) => String(row.TAI || "ไม่ระบุ").toUpperCase());
    const maleCount = dependents.filter((row) => this.helpers.normalizeGender(row["เพศ"]) === "ชาย").length;
    const femaleCount = dependents.filter((row) => this.helpers.normalizeGender(row["เพศ"]) === "หญิง").length;
    const highCount = dependents.filter((row) => HIGH_TAI.has(String(row.TAI || "").toUpperCase())).length;

    const financeSummary = this.domain.summarizeFinance(financeRows);

    this.el.statDependents.textContent = Format.number(dependents.length);
    this.el.statCg.textContent = Format.number(cgRows.length);
    this.el.statCm.textContent = Format.number(cmRows.length);
    this.el.statHigh.textContent = Format.number(highCount);
    this.el.statUnits.textContent = Format.number(unitRows.length);

    this.el.overviewIncomeTotal.textContent = Format.currency(financeSummary.totalIncome);
    this.el.overviewExpenseTotal.textContent = Format.currency(financeSummary.totalExpense);
    this.el.overviewNetTotal.textContent = Format.currency(financeSummary.net);

    const careRows = [
      { label: "กลุ่ม I1", value: taiCounts.I1 || 0, tag: "tag-I1", tagText: "I1" },
      { label: "กลุ่ม I2", value: taiCounts.I2 || 0, tag: "tag-I2", tagText: "I2" },
      { label: "กลุ่ม I3", value: taiCounts.I3 || 0, tag: "tag-I3", tagText: "I3" },
      { label: "กลุ่ม B3", value: taiCounts.B3 || 0, tag: "tag-B3", tagText: "B3" },
      { label: "กลุ่ม C2/C3", value: (taiCounts.C2 || 0) + (taiCounts.C3 || 0), tag: "tag-C3", tagText: "C2/C3" },
      { label: "เพศชาย", value: maleCount, tag: "tag-male", tagText: "ชาย" },
      { label: "เพศหญิง", value: femaleCount, tag: "tag-female", tagText: "หญิง" }
    ];

    this.el.overviewCareRows.innerHTML = careRows
      .map(
        (row) =>
          `<div class="info-row"><span>${Format.escapeHtml(row.label)}</span><span><span class="tag ${row.tag}">${row.tagText}</span> ${Format.number(row.value)} ราย</span></div>`
      )
      .join("");

    const stockRows = [...inventoryRows]
      .sort((a, b) => this.domain.severityRank(a.status) - this.domain.severityRank(b.status) || a.balance - b.balance)
      .slice(0, 8);

    this.el.overviewStockBody.innerHTML = stockRows.length
      ? stockRows
          .map((row) => {
            const tagClass = this.domain.statusClass(row.status);
            const progressClass = this.domain.progressClass(row.status);
            return `
              <tr>
                <td>${Format.escapeHtml(row.productName)}</td>
                <td>${Format.number(row.balance)} ${Format.escapeHtml(row.unit)}</td>
                <td>${Format.number(row.reorderPoint)} ${Format.escapeHtml(row.unit)}</td>
                <td><span class="tag ${tagClass}">${Format.escapeHtml(row.status)}</span></td>
                <td>
                  <div class="progress ${progressClass}">
                    <span style="width:${row.percent}%"></span>
                  </div>
                </td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="5" class="empty-row">ไม่พบข้อมูลคลัง</td></tr>`;
  }

  async renderDependents() {
    const rows = await this.repo.getTable("t04_dataj");
    if (!rows.some((row) => row.__rowid === this.state.selected.dependents)) {
      this.state.selected.dependents = null;
    }
    this.reconcileChecked(
      "dependents",
      rows.map((row) => row.__rowid)
    );

    const filtered = this.helpers.filterRows(rows, this.state.queries.dependents, [
      "เลขประชาชน",
      "นาม",
      "ชื่อ",
      "สกุล",
      "TAI",
      "เพศ",
      "ตำบล",
      "อำเภอ",
      "รหัสหน่วย"
    ]);

    this.el.dependentsBody.innerHTML = filtered.length
      ? filtered
          .map((row, index) => {
            const fullName = this.helpers.fullNameFromDependent(row);
            const gender = this.helpers.normalizeGender(row["เพศ"]);
            const genderTag = gender === "หญิง" ? "tag-female" : "tag-male";
            const tai = String(row.TAI || "ไม่ระบุ").toUpperCase();
            const taiTag = `tag-${tai}`;
            const address = `${row["ที่อยู่"] || "-"} หมู่ ${row["หมู่"] || "-"}`;
            const selectedClass = row.__rowid === this.state.selected.dependents ? "is-selected" : "";
            const checked = this.getCheckedSet("dependents").has(row.__rowid) ? "checked" : "";
            return `
              <tr data-rowid="${Format.escapeHtml(row.__rowid)}" class="${selectedClass}">
                <td class="check-col"><input class="row-check" type="checkbox" ${checked} aria-label="เลือกแถว"></td>
                <td>${index + 1}</td>
                <td>${Format.escapeHtml(row["เลขประชาชน"] || "-")}</td>
                <td>${Format.escapeHtml(fullName)}</td>
                <td><span class="tag ${genderTag}">${Format.escapeHtml(gender)}</span></td>
                <td><span class="tag ${taiTag}">${Format.escapeHtml(tai)}</span></td>
                <td>${Format.number(row.ADL || 0)}</td>
                <td>${Format.escapeHtml(address)}</td>
                <td>${Format.escapeHtml(row["ตำบล"] || "-")}</td>
                <td>${Format.escapeHtml(row["อำเภอ"] || "-")}</td>
                <td><span class="unit-badge">${Format.escapeHtml(row["รหัสหน่วย"] || "-")}</span></td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="11" class="empty-row">ไม่พบข้อมูลผู้รับบริการ</td></tr>`;

    this.paintSelection(this.el.dependentsBody, this.state.selected.dependents);
    this.syncSelectAllCheckbox(this.el.dependentsBody, "dependents", this.el.dependentsSelectAll);
  }

  async renderCg() {
    const rows = await this.repo.getTable("t01_cg");
    if (!rows.some((row) => row.__rowid === this.state.selected.cg)) {
      this.state.selected.cg = null;
    }
    this.reconcileChecked(
      "cg",
      rows.map((row) => row.__rowid)
    );

    const filtered = this.helpers.filterRows(rows, this.state.queries.cg, ["รหัสcg", "ชื่อสกุล", "โทร", "รหัสcm", "ตำบล", "อำเภอ"]);

    this.el.cgBody.innerHTML = filtered.length
      ? filtered
          .map((row, index) => {
            const fullName = Format.expandFemalePrefixInText(row["ชื่อสกุล"] || "-");
            const selectedClass = row.__rowid === this.state.selected.cg ? "is-selected" : "";
            const checked = this.getCheckedSet("cg").has(row.__rowid) ? "checked" : "";
            return `
              <tr data-rowid="${Format.escapeHtml(row.__rowid)}" class="${selectedClass}">
                <td class="check-col"><input class="row-check" type="checkbox" ${checked} aria-label="เลือกแถว"></td>
                <td>${index + 1}</td>
                <td><span class="unit-badge">${Format.escapeHtml(row["รหัสcg"] || "-")}</span></td>
                <td>${Format.escapeHtml(fullName)}</td>
                <td>${Format.escapeHtml(row["โทร"] || "-")}</td>
                <td>${Format.escapeHtml(this.helpers.buildAddress(row))}</td>
                <td>${Format.escapeHtml(row["ตำบล"] || "-")}</td>
                <td>${Format.escapeHtml(row["อำเภอ"] || "-")}</td>
                <td>${Format.escapeHtml(row["รหัสcm"] || "-")}</td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="9" class="empty-row">ไม่พบข้อมูล CG</td></tr>`;

    this.paintSelection(this.el.cgBody, this.state.selected.cg);
    this.syncSelectAllCheckbox(this.el.cgBody, "cg", this.el.cgSelectAll);
  }

  async renderCm() {
    const [cmRows, cgRows, dependentRows, groupRows] = await Promise.all([
      this.repo.getTable("t02_cm"),
      this.repo.getTable("t01_cg"),
      this.repo.getTable("t04_dataj"),
      this.repo.getTable("t07_gro")
    ]);

    if (!cmRows.some((row) => row.__rowid === this.state.selected.cm)) {
      this.state.selected.cm = null;
    }
    this.reconcileChecked(
      "cm",
      cmRows.map((row) => row.__rowid)
    );

    const cgByCm = this.helpers.countBy(cgRows, (row) => String(row["รหัสcm"] || ""));
    const depByCm = this.helpers.countBy(dependentRows, (row) => String(row["รหัสcm"] || ""));

    this.el.cmBody.innerHTML = cmRows.length
      ? cmRows
          .map((row, index) => {
            const selectedClass = row.__rowid === this.state.selected.cm ? "is-selected" : "";
            const cmCode = String(row["รหัสcm"] || "");
            const fullName = Format.expandFemalePrefixInText(row["ชื่อสกุล"] || "-");
            const checked = this.getCheckedSet("cm").has(row.__rowid) ? "checked" : "";
            return `
              <tr data-rowid="${Format.escapeHtml(row.__rowid)}" class="${selectedClass}">
                <td class="check-col"><input class="row-check" type="checkbox" ${checked} aria-label="เลือกแถว"></td>
                <td>${index + 1}</td>
                <td><span class="unit-badge">${Format.escapeHtml(cmCode || "-")}</span></td>
                <td>${Format.escapeHtml(fullName)}</td>
                <td>${Format.escapeHtml(row["รหัสหน่วย"] || "-")}</td>
                <td>${Format.escapeHtml(row["โทร"] || "-")}</td>
                <td>${Format.number(cgByCm[cmCode] || 0)} คน</td>
                <td>${Format.number(depByCm[cmCode] || 0)} ราย</td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="8" class="empty-row">ไม่พบข้อมูล CM</td></tr>`;

    this.paintSelection(this.el.cmBody, this.state.selected.cm);
    this.syncSelectAllCheckbox(this.el.cmBody, "cm", this.el.cmSelectAll);

    const groupCounts = { "1": 0, "2": 0, "3": 0, "4": 0 };
    for (const row of dependentRows) {
      const group = String(this.domain.getTaiGroup(row.TAI));
      groupCounts[group] += 1;
    }

    const groupLabel = { "1": "I1", "2": "I2", "3": "I3", "4": "B3/C2/C3" };
    this.el.cmRateBody.innerHTML = groupRows
      .sort((a, b) => Number(a.Group || 0) - Number(b.Group || 0))
      .map((row) => {
        const group = String(row.Group || "");
        const count = groupCounts[group] || 0;
        const visits = Number(row.number || 0);
        const rateCm = Number(row.rateCm || 0);
        const total = count * visits * rateCm;
        const tagClass = group === "1" ? "tag-I1" : group === "2" ? "tag-I2" : group === "3" ? "tag-I3" : "tag-B3";
        return `
          <tr data-cm-rate-rowid="${Format.escapeHtml(String(row.__rowid || ""))}" data-cm-rate-group="${Format.escapeHtml(group)}">
            <td><span class="tag ${tagClass}">${Format.escapeHtml(groupLabel[group] || group)}</span></td>
            <td>${Format.number(count)} ราย</td>
            <td>${Format.number(visits)} ครั้ง</td>
            <td class="cell-money">${Format.currency(rateCm)}</td>
            <td class="cell-money">${Format.currency(total)}</td>
            <td>
              <button
                type="button"
                class="btn btn-soft"
                data-cm-rate-rowid="${Format.escapeHtml(String(row.__rowid || ""))}"
                data-cm-rate-group="${Format.escapeHtml(group)}"
              >
                แก้ไข
              </button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  async renderSupplies() {
    const [inventoryRows, outRows, dependentRows] = await Promise.all([
      this.domain.computeInventoryRows(),
      this.repo.getTable("t13_outproduct"),
      this.repo.getTable("t04_dataj")
    ]);

    if (!inventoryRows.some((row) => row.rowId === this.state.selected.supplies)) {
      this.state.selected.supplies = null;
    }
    this.reconcileChecked(
      "supplies",
      inventoryRows.map((row) => row.rowId)
    );

    const sorted = [...inventoryRows].sort(
      (a, b) => this.domain.severityRank(a.status) - this.domain.severityRank(b.status) || a.balance - b.balance
    );

    this.el.suppliesBody.innerHTML = sorted.length
      ? sorted
          .map((row) => {
            const selectedClass = row.rowId === this.state.selected.supplies ? "is-selected" : "";
            const statusClass = this.domain.statusClass(row.status);
            const checked = this.getCheckedSet("supplies").has(row.rowId) ? "checked" : "";
            return `
              <tr data-rowid="${Format.escapeHtml(row.rowId)}" class="${selectedClass}">
                <td class="check-col"><input class="row-check" type="checkbox" ${checked} aria-label="เลือกแถว"></td>
                <td><span class="unit-badge">${Format.escapeHtml(row.productID || "-")}</span></td>
                <td>${Format.escapeHtml(row.productName)}</td>
                <td>${Format.escapeHtml(row.brand || "-")}</td>
                <td>${Format.escapeHtml(row.machineCode || "-")}</td>
                <td>${Format.escapeHtml(row.unit)}</td>
                <td>${Format.number(row.inQty)}</td>
                <td>${Format.number(row.outQty)}</td>
                <td>${Format.number(row.balance)}</td>
                <td>${Format.number(row.reorderPoint)}</td>
                <td class="cell-money">${Format.currency(row.stockValue)}</td>
                <td><span class="tag ${statusClass}">${Format.escapeHtml(row.status)}</span></td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="12" class="empty-row">ไม่พบข้อมูลวัสดุ</td></tr>`;

    this.paintSelection(this.el.suppliesBody, this.state.selected.supplies);
    this.syncSelectAllCheckbox(this.el.suppliesBody, "supplies", this.el.suppliesSelectAll);

    const dependentNameByCode = {};
    for (const row of dependentRows) {
      const citizenId = String(row["เลขประชาชน"] || "").trim();
      if (!citizenId) continue;
      dependentNameByCode[citizenId] = this.helpers.fullNameFromDependent(row) || "-";
    }

    const productByCode = {};
    for (const row of inventoryRows) {
      const code = String(row.productID || "").trim();
      if (!code) continue;
      productByCode[code] = row.product || {};
    }

    const issues = [...outRows]
      .map((row) => {
        const productID = String(row.productID || "").trim();
        const product = productByCode[productID] || {};
        const recipientCode = String(row["รหัสltc"] || "").trim();
        const recipientName = String(row.recipientName || dependentNameByCode[recipientCode] || "-").trim();
        return {
          outdate: row.outdate || null,
          productID,
          productName: String(row.productName || product.productName || "-"),
          brand: String(row.brand || product.brand || "-"),
          machineCode: String(row.machineCode || product.machineCode || "-"),
          quantity: Number(row.quantity) || 0,
          unit: String(product.unit || "ชิ้น"),
          recipientCode: recipientCode || "-",
          recipientName: recipientName || "-",
          round: String(row.round || "-"),
          reference: String(row.reference || row.outtype || "-"),
          note: String(row.note || "-"),
          outno: Number(row.outno) || 0
        };
      })
      .sort((a, b) => {
        const dateDiff = new Date(b.outdate || 0).getTime() - new Date(a.outdate || 0).getTime();
        if (dateDiff !== 0) return dateDiff;
        return b.outno - a.outno;
      });

    const totalIssueQty = issues.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
    if (this.el.suppliesIssueSummary) {
      this.el.suppliesIssueSummary.textContent = `ประวัติเบิกจ่ายล่าสุด ${Format.number(issues.length)} รายการ | รวมจ่าย ${Format.number(totalIssueQty)} หน่วย`;
    }

    if (this.el.suppliesIssueBody) {
      this.el.suppliesIssueBody.innerHTML = issues.length
        ? issues
            .slice(0, 80)
            .map(
              (row) => `
                <tr>
                  <td>${Format.escapeHtml(Format.formatDateCompact(row.outdate))}</td>
                  <td><span class="unit-badge">${Format.escapeHtml(row.productID || "-")}</span></td>
                  <td>${Format.escapeHtml(row.productName || "-")}</td>
                  <td>${Format.escapeHtml(row.brand || "-")}</td>
                  <td>${Format.escapeHtml(row.machineCode || "-")}</td>
                  <td>${Format.number(row.quantity)} ${Format.escapeHtml(row.unit)}</td>
                  <td>${Format.escapeHtml(`${row.recipientName} (${row.recipientCode})`)}</td>
                  <td>${Format.escapeHtml(row.round || "-")}</td>
                  <td>${Format.escapeHtml(row.reference || "-")}</td>
                  <td>${Format.escapeHtml(row.note || "-")}</td>
                </tr>
              `
            )
            .join("")
        : `<tr><td colspan="10" class="empty-row">ยังไม่พบประวัติเบิกจ่าย</td></tr>`;
    }
  }

  async renderFinance() {
    const rows = await this.repo.getTable("t23_tbl_income_expense");
    if (!rows.some((row) => row.__rowid === this.state.selected.finance)) {
      this.state.selected.finance = null;
    }
    this.reconcileChecked(
      "finance",
      rows.map((row) => row.__rowid)
    );

    const summary = this.domain.summarizeFinance(rows);
    this.el.financeIncomeCard.textContent = Format.currency(summary.totalIncome);
    this.el.financeExpenseCard.textContent = Format.currency(summary.totalExpense);
    this.el.financeNetCard.textContent = Format.currency(summary.net);

    const incomeRows = [
      { label: "รายรับประเภท 1", value: summary.income[0] },
      { label: "รายรับประเภท 2", value: summary.income[1] },
      { label: "รายรับประเภท 3", value: summary.income[2] },
      { label: "รายรับประเภท 4", value: summary.income[3] },
      { label: "รวมรายรับ", value: summary.totalIncome, strong: true }
    ];

    this.el.financeIncomeRows.innerHTML = incomeRows
      .map((item) => `<div class="info-row ${item.strong ? "strong" : ""}"><span>${item.label}</span><strong>${Format.currency(item.value)}</strong></div>`)
      .join("");

    const expenseRows = [
      { label: "รายจ่ายประเภท 1", value: summary.expense[0] },
      { label: "รายจ่ายประเภท 2", value: summary.expense[1] },
      { label: "รายจ่ายประเภท 3", value: summary.expense[2] },
      { label: "รายจ่ายประเภท 4", value: summary.expense[3] },
      { label: "รวมรายจ่าย", value: summary.totalExpense, strong: true }
    ];

    this.el.financeExpenseRows.innerHTML = expenseRows
      .map((item) => `<div class="info-row ${item.strong ? "strong" : ""}"><span>${item.label}</span><strong>${Format.currency(item.value)}</strong></div>`)
      .join("");

    const highestIncomeCategory = this.helpers.maxIndex(summary.income) + 1;
    const highestExpenseCategory = this.helpers.maxIndex(summary.expense) + 1;
    const expenseRatio = summary.totalIncome > 0 ? (summary.totalExpense / summary.totalIncome) * 100 : 0;
    const savingsRate = summary.totalIncome > 0 ? (summary.net / summary.totalIncome) * 100 : 0;

    const analysisRows = [
      { label: "จำนวนรายการทั้งหมด", value: `${Format.number(rows.length)} รายการ` },
      { label: "รายจ่ายต่อรายรับ", value: `${expenseRatio.toFixed(2)}%` },
      { label: "หมวดรายรับสูงสุด", value: `ประเภท ${highestIncomeCategory}` },
      { label: "หมวดรายจ่ายสูงสุด", value: `ประเภท ${highestExpenseCategory}` },
      { label: "อัตราเงินคงเหลือ", value: `${savingsRate.toFixed(2)}%` }
    ];

    this.el.financeAnalysisRows.innerHTML = analysisRows
      .map((item) => `<div class="info-row"><span>${item.label}</span><strong>${item.value}</strong></div>`)
      .join("");

    const parsedRows = rows.map((row) => this.domain.parseFinanceRow(row));
    parsedRows.sort((a, b) => {
      const dateDiff = new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
      if (dateDiff !== 0) return dateDiff;
      return (Number(b.row.ID) || 0) - (Number(a.row.ID) || 0);
    });

    this.el.financeBody.innerHTML = parsedRows.length
      ? parsedRows
          .map((entry) => {
            const selectedClass = entry.row.__rowid === this.state.selected.finance ? "is-selected" : "";
            const checked = this.getCheckedSet("finance").has(entry.row.__rowid) ? "checked" : "";
            const tagClass = entry.type === "income" ? "tag-income" : entry.type === "expense" ? "tag-expense" : "tag-mixed";
            const typeLabel = entry.type === "income" ? "รายรับ" : entry.type === "expense" ? "รายจ่าย" : "ผสม/อื่นๆ";
            return `
              <tr data-rowid="${Format.escapeHtml(entry.row.__rowid)}" class="${selectedClass}">
                <td class="check-col"><input class="row-check" type="checkbox" ${checked} aria-label="เลือกแถว"></td>
                <td>${Format.escapeHtml(Format.formatDateCompact(entry.date))}</td>
                <td>${Format.escapeHtml(entry.year)}</td>
                <td><span class="tag ${tagClass}">${Format.escapeHtml(typeLabel)}</span></td>
                <td>${Format.escapeHtml(entry.category)}</td>
                <td class="cell-money">${Format.currency(entry.amount)}</td>
                <td>${Format.escapeHtml(entry.note || "-")}</td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="7" class="empty-row">ไม่พบข้อมูลการเงิน</td></tr>`;

    this.paintSelection(this.el.financeBody, this.state.selected.finance);
    this.syncSelectAllCheckbox(this.el.financeBody, "finance", this.el.financeSelectAll);
  }

  async renderUnits() {
    const [units, cmRows, cgRows, dependentRows] = await Promise.all([
      this.repo.getTable("t26_unit"),
      this.repo.getTable("t02_cm"),
      this.repo.getTable("t01_cg"),
      this.repo.getTable("t04_dataj")
    ]);

    if (!units.some((row) => row.__rowid === this.state.selected.units)) {
      this.state.selected.units = null;
    }
    this.reconcileChecked(
      "units",
      units.map((row) => row.__rowid)
    );

    const dependentByUnit = this.helpers.countBy(dependentRows, (row) => String(row["รหัสหน่วย"] || ""));
    const cmByUnit = this.helpers.countBy(cmRows, (row) => String(row["รหัสหน่วย"] || ""));

    const cmCodeToUnit = {};
    for (const row of cmRows) {
      cmCodeToUnit[String(row["รหัสcm"] || "")] = String(row["รหัสหน่วย"] || "");
    }

    const cgByUnit = {};
    for (const row of cgRows) {
      const cmCode = String(row["รหัสcm"] || "");
      const unitCode = cmCodeToUnit[cmCode] || "";
      cgByUnit[unitCode] = (cgByUnit[unitCode] || 0) + 1;
    }

    this.el.unitBody.innerHTML = units.length
      ? units
          .map((row) => {
            const unitCode = String(row["รหัสหน่วย"] || "");
            const selectedClass = row.__rowid === this.state.selected.units ? "is-selected" : "";
            const checked = this.getCheckedSet("units").has(row.__rowid) ? "checked" : "";
            return `
              <tr data-rowid="${Format.escapeHtml(row.__rowid)}" class="${selectedClass}">
                <td class="check-col"><input class="row-check" type="checkbox" ${checked} aria-label="เลือกแถว"></td>
                <td><span class="unit-badge">${Format.escapeHtml(unitCode || "-")}</span></td>
                <td>${Format.escapeHtml(row["หน่วย"] || "-")}</td>
                <td>${Format.escapeHtml(row["ตำบล"] || "-")}</td>
                <td>${Format.escapeHtml(row["อำเภอ"] || "-")}</td>
                <td>${Format.number(cmByUnit[unitCode] || 0)} คน</td>
                <td>${Format.number(cgByUnit[unitCode] || 0)} คน</td>
                <td>${Format.number(dependentByUnit[unitCode] || 0)} ราย</td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="8" class="empty-row">ไม่พบข้อมูลหน่วยงาน</td></tr>`;

    this.paintSelection(this.el.unitBody, this.state.selected.units);
    this.syncSelectAllCheckbox(this.el.unitBody, "units", this.el.unitsSelectAll);
  }
}

const ltcAppRenderMethods = Object.fromEntries(
  Object.getOwnPropertyNames(LtcAppRenderMethodCarrier.prototype)
    .filter((name) => name !== "constructor")
    .map((name) => [name, LtcAppRenderMethodCarrier.prototype[name]])
);

export { ltcAppRenderMethods };
