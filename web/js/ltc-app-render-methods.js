import { Format } from "./utils.js";
import { FINANCE_EXPENSE_LABELS, FINANCE_INCOME_LABELS, HIGH_TAI, VISIT_STATUS_LABELS } from "./config.js";
import { methodsFromPrototype } from "./mixin-utils.js";
import { renderCheckCell, renderInfoRows, selectedRowClass } from "./render-helpers.js";

class LtcAppRenderMethodCarrier {
  async renderAll() {
    await this.withPreservedActiveScroll(async () => {
      if (this.state.page === "overview") {
        await this.renderOverview();
        return;
      }
      await Promise.all([this.renderOverview(), this.renderCurrentPage()]);
    });
  }

  async renderCurrentPage() {
    const renderers = {
      dependents: () => this.renderDependents(),
      deceased: () => this.renderDeceased(),
      cg: () => this.renderCg(),
      cm: () => this.renderCm(),
      visits: () => this.renderVisits(),
      supplies: () => this.renderSupplies(),
      finance: () => this.renderFinance(),
      units: () => this.renderUnits(),
      logs: () => this.renderActivity()
    };
    const render = renderers[this.state.page];
    if (render) await render();
  }

  async renderActivity() {
    await this.activityPage.refreshAll();
  }

  renderImageThumb(dataUrl, label = "รูป") {
    const value = String(dataUrl || "").trim();
    if (!value) return `<span class="photo-placeholder" aria-label="ไม่มีรูป">-</span>`;
    const safeLabel = Format.escapeHtml(label);
    return `<img class="record-photo image-thumbnail" src="${Format.escapeHtml(value)}" alt="${safeLabel}" data-caption="${safeLabel}" tabindex="0" role="button" title="คลิกเพื่อดูรูปขนาดใหญ่">`;
  }

  async renderOverview() {
    const [dependents, cgRows, cmRows, unitRows, financeRows, inventoryRows, visitRows, groupRows] = await Promise.all([
      this.repo.getTable("t04_dataj"),
      this.repo.getTable("t01_cg"),
      this.repo.getTable("t02_cm"),
      this.repo.getTable("t26_unit"),
      this.repo.getTable("t23_tbl_income_expense"),
      this.domain.computeInventoryRows(),
      this.repo.getTable("t27_visits"),
      this.repo.getTable("t07_gro")
    ]);

    const activeDependents = this.domain.activeDependents(dependents);
    const taiCounts = this.helpers.countBy(activeDependents, (row) => String(row.TAI || "ไม่ระบุ").toUpperCase());
    const maleCount = activeDependents.filter((row) => this.helpers.normalizeGender(row["เพศ"]) === "ชาย").length;
    const femaleCount = activeDependents.filter((row) => this.helpers.normalizeGender(row["เพศ"]) === "หญิง").length;
    const highCount = activeDependents.filter((row) => HIGH_TAI.has(String(row.TAI || "").toUpperCase())).length;

    const financeSummary = this.domain.summarizeFinance(financeRows);

    this.el.statDependents.textContent = Format.number(activeDependents.length);
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

    const coverageRows = this.domain.buildVisitCoverage(activeDependents, visitRows, groupRows);
    const coverageCounts = this.helpers.countBy(coverageRows, (row) => row.statusKey);
    const completedVisits = coverageRows.reduce((sum, row) => sum + row.completedVisits, 0);
    const targetVisits = coverageRows.reduce((sum, row) => sum + (row.targetVisits || 0), 0);
    this.el.overviewCoverageRows.innerHTML = renderInfoRows([
      { label: "เยี่ยมสำเร็จ", display: `${Format.number(completedVisits)} ครั้ง` },
      { label: "เป้าหมายรวม", display: targetVisits ? `${Format.number(targetVisits)} ครั้ง` : "ไม่มีเป้าหมาย" },
      { label: "ครบแล้ว", display: `${Format.number(coverageCounts.complete || 0)} ราย` },
      { label: "ใกล้ครบ", display: `${Format.number(coverageCounts.near || 0)} ราย` },
      { label: "ยังไม่ครบ", display: `${Format.number(coverageCounts.under || 0)} ราย` }
    ]);

    const cpAlerts = this.domain.summarizeCarePlanAlerts(activeDependents);
    this.el.overviewCpAlertRows.innerHTML = renderInfoRows([
      { label: "CP หมดอายุแล้ว", display: `${Format.number(cpAlerts.expired.length)} ราย` },
      { label: "CP ใกล้หมดใน 30 วัน", display: `${Format.number(cpAlerts.expiring.length)} ราย` },
      { label: "ยังไม่ระบุวันสิ้นสุด CP", display: `${Format.number(cpAlerts.missingEnd.length)} ราย` }
    ]);

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
      : `<tr><td colspan="4" class="empty-row">ไม่พบข้อมูลคลัง</td></tr>`;
  }

  async renderDependents() {
    const [rows, visitRows, groupRows] = await Promise.all([
      this.repo.getTable("t04_dataj"),
      this.repo.getTable("t27_visits"),
      this.repo.getTable("t07_gro")
    ]);
    const activeRows = this.domain.activeDependents(rows);
    if (!activeRows.some((row) => row.__rowid === this.state.selected.dependents)) {
      this.state.selected.dependents = null;
    }
    this.reconcileChecked(
      "dependents",
      activeRows.map((row) => row.__rowid)
    );

    const filtered = this.helpers.filterRows(activeRows, this.state.queries.dependents, [
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
            const group = row.G || this.domain.getTaiGroup(tai);
            const address = `${row["ที่อยู่"] || "-"} หมู่ ${row["หมู่"] || "-"} ตำบล ${row["ตำบล"] || "-"}`;
            const selectedClass = selectedRowClass(row.__rowid, this.state.selected.dependents);
            return `
              <tr data-rowid="${Format.escapeHtml(row.__rowid)}" class="${selectedClass}">
                ${renderCheckCell(this.getCheckedSet("dependents").has(row.__rowid))}
                <td>${index + 1}</td>
                <td class="image-cell">${this.renderImageThumb(row.photoDataUrl, fullName)}</td>
                <td>${Format.escapeHtml(row["เลขประชาชน"] || "-")}</td>
                <td>${Format.escapeHtml(fullName)}</td>
                <td><span class="tag ${genderTag}">${Format.escapeHtml(gender)}</span></td>
                <td>${Format.number(row.ADL || 0)}</td>
                <td>${Format.escapeHtml(String(group || "-"))}</td>
                <td><span class="tag ${taiTag}">${Format.escapeHtml(tai)}</span></td>
                <td>${Format.escapeHtml(address)}</td>
                <td>${Format.escapeHtml(row["อำเภอ"] || "-")}</td>
                <td><span class="unit-badge">${Format.escapeHtml(row["รหัสหน่วย"] || "-")}</span></td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="13" class="empty-row">ไม่พบข้อมูลผู้รับบริการ</td></tr>`;

    this.paintSelection(this.el.dependentsBody, this.state.selected.dependents);
    this.syncSelectAllCheckbox(this.el.dependentsBody, "dependents", this.el.dependentsSelectAll);
  }

  async renderDeceased() {
    const rows = this.domain.deceasedDependents(await this.repo.getTable("t04_dataj"));
    if (!rows.some((row) => row.__rowid === this.state.selected.deceased)) this.state.selected.deceased = null;

    this.el.deceasedBody.innerHTML = rows.length
      ? rows
          .map((row, index) => {
            const address = `${row["ที่อยู่"] || "-"} หมู่ ${row["หมู่"] || "-"} ตำบล ${row["ตำบล"] || "-"}`;
            const group = row.G || this.domain.getTaiGroup(row.TAI);
            return `<tr data-rowid="${Format.escapeHtml(row.__rowid)}" class="${selectedRowClass(row.__rowid, this.state.selected.deceased)}"><td>${index + 1}</td><td>${Format.escapeHtml(row["เลขประชาชน"] || "-")}</td><td>${Format.escapeHtml(this.helpers.fullNameFromDependent(row))}</td><td>${Format.number(row.ADL || 0)}</td><td>${Format.escapeHtml(String(group || "-"))}</td><td>${Format.escapeHtml(String(row.TAI || "-"))}</td><td>${Format.escapeHtml(address)}</td><td>${Format.escapeHtml(Format.formatDateCompact(row["วันที่เสียชีวิต"]) || "-")}</td></tr>`;
          })
          .join("")
      : `<tr><td colspan="8" class="empty-row">ยังไม่มีข้อมูลผู้เสียชีวิต</td></tr>`;
    this.paintSelection(this.el.deceasedBody, this.state.selected.deceased);
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
            const selectedClass = selectedRowClass(row.__rowid, this.state.selected.cg);
            return `
              <tr data-rowid="${Format.escapeHtml(row.__rowid)}" class="${selectedClass}">
                ${renderCheckCell(this.getCheckedSet("cg").has(row.__rowid))}
                <td>${index + 1}</td>
                <td class="image-cell">${this.renderImageThumb(row.photoDataUrl, fullName)}</td>
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
      : `<tr><td colspan="10" class="empty-row">ไม่พบข้อมูล CG</td></tr>`;

    this.paintSelection(this.el.cgBody, this.state.selected.cg);
    this.syncSelectAllCheckbox(this.el.cgBody, "cg", this.el.cgSelectAll);
  }

  async renderCm() {
    const [cmRows, cgRows, allDependentRows, groupRows] = await Promise.all([
      this.repo.getTable("t02_cm"),
      this.repo.getTable("t01_cg"),
      this.repo.getTable("t04_dataj"),
      this.repo.getTable("t07_gro")
    ]);
    const dependentRows = this.domain.activeDependents(allDependentRows);

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
            const selectedClass = selectedRowClass(row.__rowid, this.state.selected.cm);
            const cmCode = String(row["รหัสcm"] || "");
            const fullName = Format.expandFemalePrefixInText(row["ชื่อสกุล"] || "-");
            return `
              <tr data-rowid="${Format.escapeHtml(row.__rowid)}" class="${selectedClass}">
                ${renderCheckCell(this.getCheckedSet("cm").has(row.__rowid))}
                <td>${index + 1}</td>
                <td class="image-cell">${this.renderImageThumb(row.photoDataUrl, fullName)}</td>
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
      : `<tr><td colspan="9" class="empty-row">ไม่พบข้อมูล CM</td></tr>`;

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

  renderCompactRows(rows, emptyText = "ยังไม่มีข้อมูล") {
    return rows.length
      ? rows
          .map(
            (row) =>
              `<div class="info-row"><span>${Format.escapeHtml(row.label)}</span><span>${Format.escapeHtml(row.value)}</span></div>`
          )
          .join("")
      : `<div class="empty-row">${Format.escapeHtml(emptyText)}</div>`;
  }

  visitStatusLabel(status) {
    const key = String(status || "").toLowerCase().replace(/[\s-]+/g, "_");
    return VISIT_STATUS_LABELS[key] || "ไม่ระบุ";
  }

  visitStatusClass(status) {
    const key = String(status || "").toLowerCase().replace(/[\s-]+/g, "_");
    if (key === "completed") return "tag-ok";
    if (key === "postponed") return "tag-warn";
    if (key === "not_found") return "tag-low";
    if (key === "cancelled") return "tag-critical";
    return "tag-mixed";
  }

  async renderVisits() {
    const [visitRows, allDependentRows, groupRows] = await Promise.all([
      this.repo.getTable("t27_visits"),
      this.repo.getTable("t04_dataj"),
      this.repo.getTable("t07_gro")
    ]);
    const dependentRows = this.domain.activeDependents(allDependentRows);

    if (!visitRows.some((row) => row.__rowid === this.state.selected.visits)) {
      this.state.selected.visits = null;
    }
    this.reconcileChecked(
      "visits",
      visitRows.map((row) => row.__rowid)
    );

    const query = String(this.state.queries.visits || "").trim().toLowerCase();
    const statusFilter = String(this.state.queries.visitStatus || "").trim();
    const monthFrom = String(this.state.queries.visitMonthFrom || "").trim();
    const monthTo = String(this.state.queries.visitMonthTo || "").trim();
    const hasMonthFilter = Boolean(monthFrom || monthTo);
    const monthRange = this.domain.visitMonthRange({ fromMonth: monthFrom, toMonth: monthTo });
    const prepared = visitRows
      .map((row) => ({
        row,
        statusKey: String(row.status || "").toLowerCase().replace(/[\s-]+/g, "_"),
        visitTs: this.domain.dateTs(row.visitDate),
        dateText: Format.formatDateCompact(row.visitDate),
        searchText: [
          row.beneficiaryName,
          row.beneficiaryId,
          row.visitorName,
          row.responsibleCgName,
          row.responsibleCgId,
          row.responsibleCmName,
          row.responsibleCmId,
          row.activityType,
          row.status,
          row.note
        ]
          .join(" ")
          .toLowerCase()
      }))
      .filter(
        (entry) =>
          (!query || entry.searchText.includes(query)) &&
          (!statusFilter || entry.statusKey === statusFilter) &&
          (!hasMonthFilter || (entry.visitTs != null && entry.visitTs >= monthRange.startTs && entry.visitTs <= monthRange.endTs))
      )
      .sort((a, b) => new Date(b.row.visitDate || 0).getTime() - new Date(a.row.visitDate || 0).getTime());

    this.el.visitBody.innerHTML = prepared.length
      ? prepared
          .map((entry) => {
            const row = entry.row;
            return `
              <tr data-rowid="${Format.escapeHtml(row.__rowid)}" class="${selectedRowClass(row.__rowid, this.state.selected.visits)}" tabindex="0">
                ${renderCheckCell(this.getCheckedSet("visits").has(row.__rowid))}
                <td>${Format.escapeHtml(entry.dateText)}</td>
                <td>${Format.escapeHtml(row.beneficiaryName || row.beneficiaryId || "-")}</td>
                <td>${Format.escapeHtml(row.visitorName || "-")}</td>
                <td>${Format.escapeHtml(row.responsibleCgName || row.responsibleCgId || "-")}</td>
                <td>${Format.escapeHtml(row.responsibleCmName || row.responsibleCmId || "-")}</td>
                <td>${Format.escapeHtml(row.activityType || "-")}</td>
                <td><span class="tag ${this.visitStatusClass(row.status)}">${Format.escapeHtml(this.visitStatusLabel(row.status))}</span></td>
                <td>${Format.escapeHtml(row.note || "-")}</td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="9" class="empty-row">ยังไม่มีบันทึกเยี่ยมบ้าน กด "เพิ่มบันทึกเยี่ยม" เพื่อเริ่มใช้งาน</td></tr>`;

    if (this.el.visitStatusText) {
      this.el.visitStatusText.textContent = `แสดง ${Format.number(prepared.length)} จาก ${Format.number(visitRows.length)} รายการ`;
    }

    this.paintSelection(this.el.visitBody, this.state.selected.visits);
    this.syncSelectAllCheckbox(this.el.visitBody, "visits", this.el.visitSelectAll);

    const monthlySummary = this.domain.buildVisitMonthSummary(visitRows, { fromMonth: monthFrom, toMonth: monthTo });
    this.el.visitPersonMonthRows.innerHTML = this.renderCompactRows(
      monthlySummary.map((row) => ({
        label: row.beneficiaryName || row.beneficiaryId || "-",
        value: `${Format.number(row.count)} ครั้ง: ${row.dates.map((date) => Format.formatDateCompact(date)).join(", ")}`
      })),
      "ยังไม่มีบันทึกเยี่ยมสำเร็จในช่วงเดือนนี้"
    );

    const workloads = this.domain.summarizeStaffWorkloads(dependentRows, visitRows, groupRows);
    const toWorkloadRows = (rows) =>
      rows
        .sort((a, b) => b.assignedBeneficiaries - a.assignedBeneficiaries || a.staffId.localeCompare(b.staffId))
        .slice(0, 8)
        .map((row) => ({
          label: row.staffId || "-",
          value: `${Format.number(row.assignedBeneficiaries)} ราย / เยี่ยม ${Format.number(row.completedVisits)}/${Format.number(row.targetVisits)}`
        }));
    this.el.visitCgWorkloadRows.innerHTML = this.renderCompactRows(toWorkloadRows(workloads.cg), "ยังไม่มีข้อมูล CG");
    this.el.visitCmWorkloadRows.innerHTML = this.renderCompactRows(toWorkloadRows(workloads.cm), "ยังไม่มีข้อมูล CM");

    const reports = this.domain.summarizeAreaReports(dependentRows, visitRows, groupRows);
    this.el.visitAreaReportRows.innerHTML = this.renderCompactRows(
      reports.bySubdistrict.slice(0, 8).map((row) => ({ label: row.key, value: `${Format.number(row.count)} ราย` })),
      "ยังไม่มีข้อมูลพื้นที่"
    );
    this.el.visitDependencyReportRows.innerHTML = this.renderCompactRows(
      reports.byDependency.map((row) => ({ label: row.key, value: `${Format.number(row.count)} ราย` })),
      "ยังไม่มีข้อมูล TAI"
    );
    const coverageLabel = { complete: "ครบแล้ว", near: "ใกล้ครบ", under: "ยังไม่ครบ", "no-target": "ไม่มีเป้าหมาย" };
    this.el.visitCoverageReportRows.innerHTML = this.renderCompactRows(
      reports.byCoverageStatus.map((row) => ({ label: coverageLabel[row.key] || row.key, value: `${Format.number(row.count)} ราย` })),
      "ยังไม่มีข้อมูลความครอบคลุม"
    );
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

    const sorted = [...inventoryRows].sort((a, b) =>
      String(a.productID || "").localeCompare(String(b.productID || ""), undefined, { numeric: true, sensitivity: "base" })
    );

    this.el.suppliesBody.innerHTML = sorted.length
      ? sorted
          .map((row) => {
            const selectedClass = selectedRowClass(row.rowId, this.state.selected.supplies);
            const statusClass = this.domain.statusClass(row.status);
            return `
              <tr data-rowid="${Format.escapeHtml(row.rowId)}" class="${selectedClass}">
                ${renderCheckCell(this.getCheckedSet("supplies").has(row.rowId))}
                <td class="image-cell">${this.renderImageThumb(row.product?.imageDataUrl || row.imageDataUrl, row.productName)}</td>
                <td><span class="unit-badge">${Format.escapeHtml(row.productID || "-")}</span></td>
                <td>${Format.escapeHtml(row.productName)}</td>
                <td>${Format.escapeHtml(row.brand || "-")}</td>
                <td>${Format.escapeHtml(row.machineCode || "-")}</td>
                <td>${Format.escapeHtml(row.unit)}</td>
                <td>${Format.number(row.inQty)}</td>
                <td>${Format.number(row.outQty)}</td>
                <td>${Format.number(row.balance)}</td>
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
      .map((row, index) => {
        const productID = String(row.productID || "").trim();
        const product = productByCode[productID] || {};
        const recipientCode = String(row["รหัสltc"] || "").trim();
        const recipientName = String(row.recipientName || dependentNameByCode[recipientCode] || "-").trim();
        return {
          rowId: String(row.__rowid || `issue_${index}`),
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
    if (!issues.some((row) => row.rowId === this.state.selected.supplyIssues)) {
      this.state.selected.supplyIssues = null;
    }
    this.reconcileChecked(
      "supplyIssues",
      issues.map((row) => row.rowId)
    );

    const query = Format.toText(this.state.queries.supplyIssues || "").toLowerCase();
    const filteredIssues = query
      ? issues.filter((row) => {
          const searchable = [
            Format.formatDateCompact(row.outdate),
            row.productID,
            row.productName,
            row.brand,
            row.machineCode,
            row.quantity,
            row.unit,
            row.recipientCode,
            row.recipientName,
            row.round,
            row.reference,
            row.note
          ]
            .join(" ")
            .toLowerCase();
          return searchable.includes(query);
        })
      : issues;

    const filteredIssueQty = filteredIssues.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
    if (this.el.suppliesIssueSummary) {
      const left = query
        ? `ประวัติเบิกจ่ายแสดงผล ${Format.number(filteredIssues.length)} จาก ${Format.number(issues.length)} รายการ`
        : `ประวัติเบิกจ่ายล่าสุด ${Format.number(issues.length)} รายการ`;
      const right = query
        ? `รวมจ่ายที่แสดง ${Format.number(filteredIssueQty)} หน่วย (รวมทั้งหมด ${Format.number(totalIssueQty)} หน่วย)`
        : `รวมจ่าย ${Format.number(totalIssueQty)} หน่วย`;
      this.el.suppliesIssueSummary.textContent = `${left} | ${right}`;
    }

    if (this.el.suppliesIssueBody) {
      const emptyText = query ? "ยังไม่พบประวัติเบิกจ่ายที่ตรงกับคำค้น" : "ยังไม่พบประวัติเบิกจ่าย";
      this.el.suppliesIssueBody.innerHTML = filteredIssues.length
        ? filteredIssues
            .map(
              (row) => `
                <tr data-rowid="${Format.escapeHtml(row.rowId)}" class="${selectedRowClass(row.rowId, this.state.selected.supplyIssues)}">
                  ${renderCheckCell(this.getCheckedSet("supplyIssues").has(row.rowId))}
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
        : `<tr><td colspan="11" class="empty-row">${emptyText}</td></tr>`;
      this.paintSelection(this.el.suppliesIssueBody, this.state.selected.supplyIssues);
      this.syncSelectAllCheckbox(this.el.suppliesIssueBody, "supplyIssues", this.el.suppliesIssueSelectAll);
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
      ...FINANCE_INCOME_LABELS.map((label, index) => ({ label, value: summary.income[index] || 0 })),
      { label: "รวมรายรับ", value: summary.totalIncome, strong: true }
    ];

    this.el.financeIncomeRows.innerHTML = renderInfoRows(incomeRows);

    const expenseRows = [
      ...FINANCE_EXPENSE_LABELS.map((label, index) => ({ label, value: summary.expense[index] || 0 })),
      { label: "รวมรายจ่าย", value: summary.totalExpense, strong: true }
    ];

    this.el.financeExpenseRows.innerHTML = renderInfoRows(expenseRows);

    const highestIncomeCategory = this.helpers.maxIndex(summary.income) + 1;
    const highestExpenseCategory = this.helpers.maxIndex(summary.expense) + 1;
    const expenseRatio = summary.totalIncome > 0 ? (summary.totalExpense / summary.totalIncome) * 100 : 0;
    const savingsRate = summary.totalIncome > 0 ? (summary.net / summary.totalIncome) * 100 : 0;

    const analysisRows = [
      { label: "จำนวนรายการทั้งหมด", value: `${Format.number(rows.length)} รายการ` },
      { label: "รายจ่ายต่อรายรับ", value: `${expenseRatio.toFixed(2)}%` },
      { label: "หมวดรายรับสูงสุด", value: FINANCE_INCOME_LABELS[highestIncomeCategory - 1] || `ประเภท ${highestIncomeCategory}` },
      { label: "หมวดรายจ่ายสูงสุด", value: FINANCE_EXPENSE_LABELS[highestExpenseCategory - 1] || `ประเภท ${highestExpenseCategory}` },
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
    const categoryLabel = (entry) => {
      const label =
        entry.type === "income"
          ? FINANCE_INCOME_LABELS[entry.category - 1] || entry.category
          : entry.type === "expense"
            ? FINANCE_EXPENSE_LABELS[entry.category - 1] || entry.category
            : entry.category;
      return entry.legacyNeedsReview ? `${label} (ข้อมูลเดิม โปรดตรวจสอบ)` : label;
    };

    this.el.financeBody.innerHTML = parsedRows.length
      ? parsedRows
          .map((entry) => {
            const selectedClass = selectedRowClass(entry.row.__rowid, this.state.selected.finance);
            const tagClass = entry.type === "income" ? "tag-income" : entry.type === "expense" ? "tag-expense" : "tag-mixed";
            const typeLabel = entry.type === "income" ? "รายรับ" : entry.type === "expense" ? "รายจ่าย" : "ผสม/อื่นๆ";
            return `
              <tr data-rowid="${Format.escapeHtml(entry.row.__rowid)}" class="${selectedClass}">
                ${renderCheckCell(this.getCheckedSet("finance").has(entry.row.__rowid))}
                <td>${Format.escapeHtml(Format.formatDateCompact(entry.date))}</td>
                <td>${Format.escapeHtml(entry.year)}</td>
                <td><span class="tag ${tagClass}">${Format.escapeHtml(typeLabel)}</span></td>
                <td>${Format.escapeHtml(categoryLabel(entry))}</td>
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
            const selectedClass = selectedRowClass(row.__rowid, this.state.selected.units);
            return `
              <tr data-rowid="${Format.escapeHtml(row.__rowid)}" class="${selectedClass}">
                ${renderCheckCell(this.getCheckedSet("units").has(row.__rowid))}
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

const ltcAppRenderMethods = methodsFromPrototype(LtcAppRenderMethodCarrier.prototype);

export { ltcAppRenderMethods };
