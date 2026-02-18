import { API_BASE, DATA_ROOT, HIGH_TAI, STORAGE_PREFIX } from "./config.js";
import { Format, NameUtils, Validate } from "./utils.js";
import { DataRepository } from "./data-repository.js";
import { SecurityManager } from "./security-manager.js";
import { DomainService } from "./domain-service.js";

class LtcApp {
  constructor() {
    this.repo = new DataRepository(API_BASE, DATA_ROOT, STORAGE_PREFIX);
    this.domain = new DomainService(this.repo);

    this.state = {
      page: "overview",
      queries: {
        dependents: "",
        cg: ""
      },
      selected: {
        dependents: null,
        cg: null,
        cm: null,
        supplies: null,
        finance: null,
        units: null
      },
      checked: {
        dependents: new Set(),
        cg: new Set(),
        cm: new Set(),
        supplies: new Set(),
        finance: new Set(),
        units: new Set()
      }
    };

    this.el = {
      statusText: document.getElementById("statusText"),
      securityToggleBtn: document.getElementById("securityToggleBtn"),
      navButtons: [...document.querySelectorAll(".nav-btn")],
      pages: [...document.querySelectorAll(".page")],

      statDependents: document.getElementById("statDependents"),
      statCg: document.getElementById("statCg"),
      statCm: document.getElementById("statCm"),
      statHigh: document.getElementById("statHigh"),
      statUnits: document.getElementById("statUnits"),
      overviewCareRows: document.getElementById("overviewCareRows"),
      overviewIncomeTotal: document.getElementById("overviewIncomeTotal"),
      overviewExpenseTotal: document.getElementById("overviewExpenseTotal"),
      overviewNetTotal: document.getElementById("overviewNetTotal"),
      overviewStockBody: document.getElementById("overviewStockBody"),

      dependentsSearch: document.getElementById("dependentsSearch"),
      dependentsBody: document.getElementById("dependentsBody"),
      dependentsAddBtn: document.getElementById("dependentsAddBtn"),
      dependentsEditBtn: document.getElementById("dependentsEditBtn"),
      dependentsDeleteBtn: document.getElementById("dependentsDeleteBtn"),
      dependentsDeleteBatchBtn: document.getElementById("dependentsDeleteBatchBtn"),
      dependentsSelectAll: document.getElementById("dependentsSelectAll"),

      cgSearch: document.getElementById("cgSearch"),
      cgBody: document.getElementById("cgBody"),
      cgAddBtn: document.getElementById("cgAddBtn"),
      cgEditBtn: document.getElementById("cgEditBtn"),
      cgDeleteBtn: document.getElementById("cgDeleteBtn"),
      cgDeleteBatchBtn: document.getElementById("cgDeleteBatchBtn"),
      cgSelectAll: document.getElementById("cgSelectAll"),

      cmBody: document.getElementById("cmBody"),
      cmRateBody: document.getElementById("cmRateBody"),
      cmAddBtn: document.getElementById("cmAddBtn"),
      cmEditBtn: document.getElementById("cmEditBtn"),
      cmDeleteBtn: document.getElementById("cmDeleteBtn"),
      cmDeleteBatchBtn: document.getElementById("cmDeleteBatchBtn"),
      cmSelectAll: document.getElementById("cmSelectAll"),

      suppliesBody: document.getElementById("suppliesBody"),
      supplyTxnBody: document.getElementById("supplyTxnBody"),
      supplyAddProductBtn: document.getElementById("supplyAddProductBtn"),
      supplyEditProductBtn: document.getElementById("supplyEditProductBtn"),
      supplyDeleteProductBtn: document.getElementById("supplyDeleteProductBtn"),
      supplyDeleteBatchBtn: document.getElementById("supplyDeleteBatchBtn"),
      supplyInBtn: document.getElementById("supplyInBtn"),
      supplyOutBtn: document.getElementById("supplyOutBtn"),
      suppliesSelectAll: document.getElementById("suppliesSelectAll"),

      financeIncomeCard: document.getElementById("financeIncomeCard"),
      financeExpenseCard: document.getElementById("financeExpenseCard"),
      financeNetCard: document.getElementById("financeNetCard"),
      financeIncomeRows: document.getElementById("financeIncomeRows"),
      financeExpenseRows: document.getElementById("financeExpenseRows"),
      financeAnalysisRows: document.getElementById("financeAnalysisRows"),
      financeBody: document.getElementById("financeBody"),
      financeAddBtn: document.getElementById("financeAddBtn"),
      financeEditBtn: document.getElementById("financeEditBtn"),
      financeDeleteBtn: document.getElementById("financeDeleteBtn"),
      financeDeleteBatchBtn: document.getElementById("financeDeleteBatchBtn"),
      financeSelectAll: document.getElementById("financeSelectAll"),

      unitBody: document.getElementById("unitBody"),
      unitAddBtn: document.getElementById("unitAddBtn"),
      unitEditBtn: document.getElementById("unitEditBtn"),
      unitDeleteBtn: document.getElementById("unitDeleteBtn"),
      unitDeleteBatchBtn: document.getElementById("unitDeleteBatchBtn"),
      unitsSelectAll: document.getElementById("unitsSelectAll"),

      entityDialog: document.getElementById("entityDialog"),
      entityForm: document.getElementById("entityForm"),
      entityDialogTitle: document.getElementById("entityDialogTitle"),
      entityDialogHint: document.getElementById("entityDialogHint"),
      entityFormFields: document.getElementById("entityFormFields"),
      entityCancelBtn: document.getElementById("entityCancelBtn"),
      entitySubmitBtn: document.getElementById("entitySubmitBtn")
    };

    this.security = new SecurityManager(
      this.el.securityToggleBtn,
      () => {
        this.refreshStorageStatus().catch(() => {
          this.setStatus(this.security.isUnlocked() ? "ระบบออนไลน์ | แก้ไขได้" : "ระบบออนไลน์ | โหมดอ่านอย่างเดียว");
        });
      },
      {
        requestPin: (config) => this.requestPinDialog(config),
        notify: (message) => alert(message)
      }
    );
  }

  async init() {
    try {
      this.bindEvents();
      this.setPage(this.state.page);
      await this.security.init();
      this.setStatus("กำลังโหลดข้อมูล...");
      await this.renderAll();
      await this.refreshStorageStatus();
    } catch (error) {
      console.error(error);
      this.setStatus("โหลดข้อมูลไม่สำเร็จ");
      alert(`เกิดข้อผิดพลาด: ${error.message}`);
    }
  }

  bindEvents() {
    for (const button of this.el.navButtons) {
      button.addEventListener("click", () => this.setPage(button.dataset.page));
    }

    this.el.securityToggleBtn.addEventListener("click", async () => {
      await this.security.toggle();
      await this.refreshStorageStatus();
    });

    this.el.dependentsSearch.addEventListener("input", (event) => {
      this.state.queries.dependents = Format.toText(event.target.value).toLowerCase();
      this.renderDependents().catch(this.handleError);
    });

    this.el.cgSearch.addEventListener("input", (event) => {
      this.state.queries.cg = Format.toText(event.target.value).toLowerCase();
      this.renderCg().catch(this.handleError);
    });

    this.bindSelectableTable(this.el.dependentsBody, "dependents", this.el.dependentsSelectAll);
    this.bindSelectableTable(this.el.cgBody, "cg", this.el.cgSelectAll);
    this.bindSelectableTable(this.el.cmBody, "cm", this.el.cmSelectAll);
    this.bindSelectableTable(this.el.suppliesBody, "supplies", this.el.suppliesSelectAll);
    this.bindSelectableTable(this.el.financeBody, "finance", this.el.financeSelectAll);
    this.bindSelectableTable(this.el.unitBody, "units", this.el.unitsSelectAll);

    this.el.dependentsAddBtn.addEventListener("click", () => this.handleAddDependent().catch(this.handleError));
    this.el.dependentsEditBtn.addEventListener("click", () => this.handleEditDependent().catch(this.handleError));
    this.el.dependentsDeleteBtn.addEventListener("click", () => this.handleDeleteDependent().catch(this.handleError));
    this.el.dependentsDeleteBatchBtn.addEventListener("click", () => this.handleDeleteDependentBatch().catch(this.handleError));

    this.el.cgAddBtn.addEventListener("click", () => this.handleAddCg().catch(this.handleError));
    this.el.cgEditBtn.addEventListener("click", () => this.handleEditCg().catch(this.handleError));
    this.el.cgDeleteBtn.addEventListener("click", () => this.handleDeleteCg().catch(this.handleError));
    this.el.cgDeleteBatchBtn.addEventListener("click", () => this.handleDeleteCgBatch().catch(this.handleError));

    this.el.cmAddBtn.addEventListener("click", () => this.handleAddCm().catch(this.handleError));
    this.el.cmEditBtn.addEventListener("click", () => this.handleEditCm().catch(this.handleError));
    this.el.cmDeleteBtn.addEventListener("click", () => this.handleDeleteCm().catch(this.handleError));
    this.el.cmDeleteBatchBtn.addEventListener("click", () => this.handleDeleteCmBatch().catch(this.handleError));

    this.el.supplyAddProductBtn.addEventListener("click", () => this.handleAddProduct().catch(this.handleError));
    this.el.supplyEditProductBtn.addEventListener("click", () => this.handleEditProduct().catch(this.handleError));
    this.el.supplyDeleteProductBtn.addEventListener("click", () => this.handleDeleteProduct().catch(this.handleError));
    this.el.supplyDeleteBatchBtn.addEventListener("click", () => this.handleDeleteProductBatch().catch(this.handleError));
    this.el.supplyInBtn.addEventListener("click", () => this.handleSupplyIn().catch(this.handleError));
    this.el.supplyOutBtn.addEventListener("click", () => this.handleSupplyOut().catch(this.handleError));

    this.el.financeAddBtn.addEventListener("click", () => this.handleAddFinance().catch(this.handleError));
    this.el.financeEditBtn.addEventListener("click", () => this.handleEditFinance().catch(this.handleError));
    this.el.financeDeleteBtn.addEventListener("click", () => this.handleDeleteFinance().catch(this.handleError));
    this.el.financeDeleteBatchBtn.addEventListener("click", () => this.handleDeleteFinanceBatch().catch(this.handleError));

    this.el.unitAddBtn.addEventListener("click", () => this.handleAddUnit().catch(this.handleError));
    this.el.unitEditBtn.addEventListener("click", () => this.handleEditUnit().catch(this.handleError));
    this.el.unitDeleteBtn.addEventListener("click", () => this.handleDeleteUnit().catch(this.handleError));
    this.el.unitDeleteBatchBtn.addEventListener("click", () => this.handleDeleteUnitBatch().catch(this.handleError));
  }

  bindSelectableTable(tbody, key, selectAllControl) {
    if (selectAllControl) {
      selectAllControl.addEventListener("change", (event) => {
        this.toggleCheckAllVisibleRows(tbody, key, event.target.checked);
        this.syncSelectAllCheckbox(tbody, key, selectAllControl);
      });
    }

    tbody.addEventListener("change", (event) => {
      const checkbox = event.target.closest("input.row-check");
      if (!checkbox) return;
      const tr = checkbox.closest("tr[data-rowid]");
      if (!tr) return;
      const rowId = tr.dataset.rowid;
      this.toggleChecked(key, rowId, checkbox.checked);
      this.syncSelectAllCheckbox(tbody, key, selectAllControl);
      event.stopPropagation();
    });

    tbody.addEventListener("click", (event) => {
      if (event.target.closest("input.row-check")) return;
      const tr = event.target.closest("tr[data-rowid]");
      if (!tr) return;
      this.state.selected[key] = tr.dataset.rowid;
      this.paintSelection(tbody, this.state.selected[key]);
    });
  }

  paintSelection(tbody, selectedRowId) {
    const rows = [...tbody.querySelectorAll("tr[data-rowid]")];
    for (const row of rows) {
      row.classList.toggle("is-selected", row.dataset.rowid === selectedRowId);
    }
  }

  getCheckedSet(key) {
    return this.state.checked[key];
  }

  toggleChecked(key, rowId, checked) {
    const set = this.getCheckedSet(key);
    if (!set) return;
    if (checked) set.add(rowId);
    else set.delete(rowId);
  }

  clearChecked(key) {
    const set = this.getCheckedSet(key);
    if (!set) return;
    set.clear();
  }

  reconcileChecked(key, validRowIds) {
    const set = this.getCheckedSet(key);
    if (!set) return;
    const valid = new Set(validRowIds);
    for (const rowId of [...set]) {
      if (!valid.has(rowId)) set.delete(rowId);
    }
  }

  syncSelectAllCheckbox(tbody, key, selectAllControl) {
    if (!selectAllControl) return;
    const rowIds = [...tbody.querySelectorAll("tr[data-rowid]")].map((row) => row.dataset.rowid);
    if (!rowIds.length) {
      selectAllControl.checked = false;
      selectAllControl.indeterminate = false;
      return;
    }
    const checkedSet = this.getCheckedSet(key);
    const checkedCount = rowIds.filter((rowId) => checkedSet.has(rowId)).length;
    selectAllControl.checked = checkedCount > 0 && checkedCount === rowIds.length;
    selectAllControl.indeterminate = checkedCount > 0 && checkedCount < rowIds.length;
  }

  toggleCheckAllVisibleRows(tbody, key, checked) {
    const checkboxes = [...tbody.querySelectorAll("input.row-check")];
    for (const checkbox of checkboxes) {
      checkbox.checked = checked;
      const row = checkbox.closest("tr[data-rowid]");
      if (!row) continue;
      this.toggleChecked(key, row.dataset.rowid, checked);
    }
  }

  checkedCount(key) {
    const set = this.getCheckedSet(key);
    return set ? set.size : 0;
  }

  setStatus(text) {
    this.el.statusText.textContent = text;
  }

  async refreshStorageStatus() {
    const storageInfo = await this.repo.getStorageInfo();
    const lockState = this.security.isUnlocked() ? "แก้ไขได้" : "โหมดอ่านอย่างเดียว";
    const storageState = storageInfo.mode === "backend" ? "Backend" : "Local";
    this.setStatus(`ระบบออนไลน์ | ${lockState} | เก็บข้อมูล: ${storageState}`);
  }

  setPage(page) {
    this.state.page = page;
    for (const button of this.el.navButtons) {
      button.classList.toggle("active", button.dataset.page === page);
    }
    for (const section of this.el.pages) {
      section.classList.toggle("show", section.id === `page-${page}`);
    }
  }

  async renderAll() {
    await Promise.all([
      this.renderOverview(),
      this.renderDependents(),
      this.renderCg(),
      this.renderCm(),
      this.renderSupplies(),
      this.renderFinance(),
      this.renderUnits()
    ]);
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

    const taiCounts = this.countBy(dependents, (row) => String(row.TAI || "ไม่ระบุ").toUpperCase());
    const maleCount = dependents.filter((row) => this.normalizeGender(row["เพศ"]) === "ชาย").length;
    const femaleCount = dependents.filter((row) => this.normalizeGender(row["เพศ"]) === "หญิง").length;
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

    const filtered = this.filterRows(rows, this.state.queries.dependents, [
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
            const fullName = this.fullNameFromDependent(row);
            const gender = this.normalizeGender(row["เพศ"]);
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

    const filtered = this.filterRows(rows, this.state.queries.cg, ["รหัสcg", "ชื่อสกุล", "โทร", "รหัสcm", "ตำบล", "อำเภอ"]);

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
                <td>${Format.escapeHtml(this.buildAddress(row))}</td>
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

    const cgByCm = this.countBy(cgRows, (row) => String(row["รหัสcm"] || ""));
    const depByCm = this.countBy(dependentRows, (row) => String(row["รหัสcm"] || ""));

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
          <tr>
            <td><span class="tag ${tagClass}">${Format.escapeHtml(groupLabel[group] || group)}</span></td>
            <td>${Format.number(count)} ราย</td>
            <td>${Format.number(visits)} ครั้ง</td>
            <td class="cell-money">${Format.currency(rateCm)}</td>
            <td class="cell-money">${Format.currency(total)}</td>
          </tr>
        `;
      })
      .join("");
  }

  async renderSupplies() {
    const [inventoryRows, movements] = await Promise.all([
      this.domain.computeInventoryRows(),
      this.domain.getSupplyMovements(30)
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
      : `<tr><td colspan="10" class="empty-row">ไม่พบข้อมูลวัสดุ</td></tr>`;

    this.paintSelection(this.el.suppliesBody, this.state.selected.supplies);
    this.syncSelectAllCheckbox(this.el.suppliesBody, "supplies", this.el.suppliesSelectAll);

    this.el.supplyTxnBody.innerHTML = movements.length
      ? movements
          .map((row) => {
            const typeClass = row.type === "รับเข้า" ? "tag-income" : "tag-expense";
            return `
              <tr>
                <td>${Format.escapeHtml(Format.formatDateCompact(row.date))}</td>
                <td><span class="tag ${typeClass}">${Format.escapeHtml(row.type)}</span></td>
                <td>${Format.escapeHtml(row.productID)}</td>
                <td>${Format.escapeHtml(row.productName)}</td>
                <td>${Format.number(row.quantity)}</td>
                <td>${Format.escapeHtml(row.reference)}</td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="6" class="empty-row">ยังไม่มีการเคลื่อนไหว</td></tr>`;
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

    const highestIncomeCategory = this.maxIndex(summary.income) + 1;
    const highestExpenseCategory = this.maxIndex(summary.expense) + 1;
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

    const dependentByUnit = this.countBy(dependentRows, (row) => String(row["รหัสหน่วย"] || ""));
    const cmByUnit = this.countBy(cmRows, (row) => String(row["รหัสหน่วย"] || ""));

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

  async handleAddDependent() {
    await this.runProtected("เพิ่มผู้รับบริการ", async () => {
      const rows = await this.repo.cloneTable("t04_dataj");
      const form = await this.openDependentDialog("add");
      if (!form) return;

      const duplicated = rows.some((row) => String(row["เลขประชาชน"] || "") === form.citizenId);
      if (duplicated) throw new Error("เลขประชาชนนี้มีอยู่ในระบบแล้ว");

      const newRow = {
        __rowid: this.repo.createRowId("t04_dataj"),
        ID: this.repo.getNextNumeric(rows, "ID"),
        "เลขประชาชน": form.citizenId,
        "นาม": Format.normalizeFemalePrefix(form.prefix),
        "ชื่อ": form.firstName,
        "สกุล": form.lastName,
        ADL: Number(form.adl),
        TAI: String(form.tai || "").toUpperCase(),
        "วันเดือนปีเกิด": form.birthDate,
        "เพศ": form.gender,
        "สถานะ": false,
        "วันที่เสียชีวิต": null,
        "ที่อยู่": form.address,
        "หมู่": form.moo,
        "ถนน": form.road,
        "ตำบล": form.subdistrict,
        "อำเภอ": form.district,
        "จังหวัด": form.province,
        "รหัสหน่วย": form.unitCode,
        "รหัสcm": form.cmCode,
        "รหัสcg": form.cgCode,
        "วันเริ่ม cp": form.careStart,
        "วันสิ้นสุด cp": form.careEnd,
        G: this.domain.getTaiGroup(form.tai)
      };

      rows.push(newRow);
      await this.repo.saveTable("t04_dataj", rows);
      this.state.selected.dependents = newRow.__rowid;
    });
  }

  async handleEditDependent() {
    await this.runProtected("แก้ไขผู้รับบริการ", async () => {
      const selected = await this.getSelectedRow("t04_dataj", "dependents");
      if (!selected) {
        alert("กรุณาเลือกแถวผู้รับบริการก่อน");
        return;
      }

      const rows = await this.repo.cloneTable("t04_dataj");
      const index = rows.findIndex((row) => row.__rowid === selected.__rowid);
      if (index < 0) return;

      const form = await this.openDependentDialog("edit", rows[index]);
      if (!form) return;

      const duplicated = rows.some(
        (row, rowIndex) => rowIndex !== index && String(row["เลขประชาชน"] || "") === form.citizenId
      );
      if (duplicated) throw new Error("เลขประชาชนนี้ซ้ำกับข้อมูลอื่น");

      rows[index] = {
        ...rows[index],
        "เลขประชาชน": form.citizenId,
        "นาม": Format.normalizeFemalePrefix(form.prefix),
        "ชื่อ": form.firstName,
        "สกุล": form.lastName,
        ADL: Number(form.adl),
        TAI: String(form.tai || "").toUpperCase(),
        "วันเดือนปีเกิด": form.birthDate,
        "เพศ": form.gender,
        "ที่อยู่": form.address,
        "หมู่": form.moo,
        "ถนน": form.road,
        "ตำบล": form.subdistrict,
        "อำเภอ": form.district,
        "จังหวัด": form.province,
        "รหัสหน่วย": form.unitCode,
        "รหัสcm": form.cmCode,
        "รหัสcg": form.cgCode,
        "วันเริ่ม cp": form.careStart,
        "วันสิ้นสุด cp": form.careEnd,
        G: this.domain.getTaiGroup(form.tai)
      };

      await this.repo.saveTable("t04_dataj", rows);
    });
  }

  async handleDeleteDependent() {
    await this.runProtected("ลบผู้รับบริการ", async () => {
      const selected = await this.getSelectedRow("t04_dataj", "dependents");
      if (!selected) {
        alert("กรุณาเลือกแถวผู้รับบริการก่อน");
        return;
      }

      if (!confirm("ยืนยันการลบผู้รับบริการที่เลือก?")) return;

      const rows = await this.repo.cloneTable("t04_dataj");
      const filtered = rows.filter((row) => row.__rowid !== selected.__rowid);
      await this.repo.saveTable("t04_dataj", filtered);
      this.state.selected.dependents = null;
      this.getCheckedSet("dependents").delete(selected.__rowid);
    });
  }

  async handleDeleteDependentBatch() {
    await this.runProtected("ลบผู้รับบริการหลายรายการ", async () => {
      const rowIds = [...this.getCheckedSet("dependents")];
      if (!rowIds.length) {
        alert("กรุณาติ๊กเลือกผู้รับบริการที่ต้องการลบ");
        return;
      }
      if (!confirm(`ยืนยันการลบผู้รับบริการ ${rowIds.length} รายการ?`)) return;

      const rows = await this.repo.cloneTable("t04_dataj");
      const idSet = new Set(rowIds);
      const filtered = rows.filter((row) => !idSet.has(row.__rowid));
      await this.repo.saveTable("t04_dataj", filtered);
      this.clearChecked("dependents");
      if (this.state.selected.dependents && idSet.has(this.state.selected.dependents)) {
        this.state.selected.dependents = null;
      }
    });
  }

  async handleAddCg() {
    await this.runProtected("เพิ่ม CG", async () => {
      const rows = await this.repo.cloneTable("t01_cg");
      const form = await this.openCgDialog("add");
      if (!form) return;

      const generatedCode = form.cgCode || this.generateCgCode(form.cmCode, rows);
      const duplicated = rows.some((row) => String(row["รหัสcg"] || "") === generatedCode);
      if (duplicated) throw new Error("รหัส CG ซ้ำในระบบ");

      const newRow = {
        __rowid: this.repo.createRowId("t01_cg"),
        ID: this.repo.getNextNumeric(rows, "ID"),
        "รหัสcg": generatedCode,
        "ชื่อสกุล": NameUtils.compose(form.prefix, form.firstName, form.lastName, true),
        "วดปเกิด": form.birthDate,
        "โทร": form.phone,
        "ที่อยู่": form.address,
        "หมู่": form.moo,
        "ตำบล": form.subdistrict,
        "อำเภอ": form.district,
        "จังหวัด": form.province,
        "รหัสcm": form.cmCode
      };

      rows.push(newRow);
      await this.repo.saveTable("t01_cg", rows);
      this.state.selected.cg = newRow.__rowid;
    });
  }

  async handleEditCg() {
    await this.runProtected("แก้ไข CG", async () => {
      const selected = await this.getSelectedRow("t01_cg", "cg");
      if (!selected) {
        alert("กรุณาเลือกแถว CG ก่อน");
        return;
      }

      const rows = await this.repo.cloneTable("t01_cg");
      const index = rows.findIndex((row) => row.__rowid === selected.__rowid);
      if (index < 0) return;

      const oldCode = String(rows[index]["รหัสcg"] || "");
      const form = await this.openCgDialog("edit", rows[index]);
      if (!form) return;

      const newCode = form.cgCode || oldCode;
      const duplicated = rows.some((row, rowIndex) => rowIndex !== index && String(row["รหัสcg"] || "") === newCode);
      if (duplicated) throw new Error("รหัส CG ซ้ำในระบบ");

      rows[index] = {
        ...rows[index],
        "รหัสcg": newCode,
        "ชื่อสกุล": NameUtils.compose(form.prefix, form.firstName, form.lastName, true),
        "วดปเกิด": form.birthDate,
        "โทร": form.phone,
        "ที่อยู่": form.address,
        "หมู่": form.moo,
        "ตำบล": form.subdistrict,
        "อำเภอ": form.district,
        "จังหวัด": form.province,
        "รหัสcm": form.cmCode
      };

      await this.repo.saveTable("t01_cg", rows);

      if (oldCode !== newCode) {
        const dependentRows = await this.repo.cloneTable("t04_dataj");
        let changed = false;
        for (const row of dependentRows) {
          if (String(row["รหัสcg"] || "") === oldCode) {
            row["รหัสcg"] = newCode;
            changed = true;
          }
        }
        if (changed) await this.repo.saveTable("t04_dataj", dependentRows);
      }
    });
  }

  async handleDeleteCg() {
    await this.runProtected("ลบ CG", async () => {
      const selected = await this.getSelectedRow("t01_cg", "cg");
      if (!selected) {
        alert("กรุณาเลือกแถว CG ก่อน");
        return;
      }

      const cgCode = String(selected["รหัสcg"] || "");
      const dependentRows = await this.repo.getTable("t04_dataj");
      const linked = dependentRows.filter((row) => String(row["รหัสcg"] || "") === cgCode).length;
      if (linked > 0) {
        throw new Error(`ลบไม่ได้: มีผู้รับบริการเชื่อมกับรหัส CG นี้อยู่ ${linked} ราย`);
      }

      if (!confirm("ยืนยันการลบ CG ที่เลือก?")) return;

      const rows = await this.repo.cloneTable("t01_cg");
      const filtered = rows.filter((row) => row.__rowid !== selected.__rowid);
      await this.repo.saveTable("t01_cg", filtered);
      this.state.selected.cg = null;
      this.getCheckedSet("cg").delete(selected.__rowid);
    });
  }

  async handleDeleteCgBatch() {
    await this.runProtected("ลบ CG หลายรายการ", async () => {
      const rowIds = [...this.getCheckedSet("cg")];
      if (!rowIds.length) {
        alert("กรุณาติ๊กเลือก CG ที่ต้องการลบ");
        return;
      }

      const rows = await this.repo.cloneTable("t01_cg");
      const selectedRows = rows.filter((row) => rowIds.includes(row.__rowid));
      if (!selectedRows.length) return;

      const dependentRows = await this.repo.getTable("t04_dataj");
      const blockedCodes = selectedRows
        .map((row) => String(row["รหัสcg"] || ""))
        .filter((cgCode) => dependentRows.some((dep) => String(dep["รหัสcg"] || "") === cgCode));
      if (blockedCodes.length) {
        throw new Error(`ลบไม่ได้: มีผู้รับบริการเชื่อมกับ CG (${blockedCodes.join(", ")})`);
      }

      if (!confirm(`ยืนยันการลบ CG ${selectedRows.length} รายการ?`)) return;

      const idSet = new Set(rowIds);
      const filtered = rows.filter((row) => !idSet.has(row.__rowid));
      await this.repo.saveTable("t01_cg", filtered);
      this.clearChecked("cg");
      if (this.state.selected.cg && idSet.has(this.state.selected.cg)) {
        this.state.selected.cg = null;
      }
    });
  }

  async handleAddCm() {
    await this.runProtected("เพิ่ม CM", async () => {
      const rows = await this.repo.cloneTable("t02_cm");
      const form = await this.openCmDialog("add");
      if (!form) return;

      const generatedCode = form.cmCode || this.generateCmCode(form.unitCode, rows);
      const duplicated = rows.some((row) => String(row["รหัสcm"] || "") === generatedCode);
      if (duplicated) throw new Error("รหัส CM ซ้ำในระบบ");

      const newRow = {
        __rowid: this.repo.createRowId("t02_cm"),
        ID: this.repo.getNextNumeric(rows, "ID"),
        "รหัสcm": generatedCode,
        "ชื่อสกุล": NameUtils.compose(form.prefix, form.firstName, form.lastName, true),
        "รหัสหน่วย": form.unitCode,
        "โทร": form.phone,
        "วดปเกิด": form.birthDate,
        "ที่อยู่": form.address,
        "หมู่": form.moo,
        "ตำบล": form.subdistrict,
        "อำเภอ": form.district,
        "จังหวัด": form.province
      };

      rows.push(newRow);
      await this.repo.saveTable("t02_cm", rows);
      this.state.selected.cm = newRow.__rowid;
    });
  }

  async handleEditCm() {
    await this.runProtected("แก้ไข CM", async () => {
      const selected = await this.getSelectedRow("t02_cm", "cm");
      if (!selected) {
        alert("กรุณาเลือกแถว CM ก่อน");
        return;
      }

      const rows = await this.repo.cloneTable("t02_cm");
      const index = rows.findIndex((row) => row.__rowid === selected.__rowid);
      if (index < 0) return;

      const oldCode = String(rows[index]["รหัสcm"] || "");
      const form = await this.openCmDialog("edit", rows[index]);
      if (!form) return;

      const newCode = form.cmCode || oldCode;
      const duplicated = rows.some((row, rowIndex) => rowIndex !== index && String(row["รหัสcm"] || "") === newCode);
      if (duplicated) throw new Error("รหัส CM ซ้ำในระบบ");

      rows[index] = {
        ...rows[index],
        "รหัสcm": newCode,
        "ชื่อสกุล": NameUtils.compose(form.prefix, form.firstName, form.lastName, true),
        "รหัสหน่วย": form.unitCode,
        "โทร": form.phone,
        "วดปเกิด": form.birthDate,
        "ที่อยู่": form.address,
        "หมู่": form.moo,
        "ตำบล": form.subdistrict,
        "อำเภอ": form.district,
        "จังหวัด": form.province
      };

      await this.repo.saveTable("t02_cm", rows);

      if (oldCode !== newCode) {
        const [dependentRows, cgRows] = await Promise.all([
          this.repo.cloneTable("t04_dataj"),
          this.repo.cloneTable("t01_cg")
        ]);

        let dependentChanged = false;
        for (const row of dependentRows) {
          if (String(row["รหัสcm"] || "") === oldCode) {
            row["รหัสcm"] = newCode;
            dependentChanged = true;
          }
        }

        let cgChanged = false;
        for (const row of cgRows) {
          if (String(row["รหัสcm"] || "") === oldCode) {
            row["รหัสcm"] = newCode;
            cgChanged = true;
          }
        }

        if (dependentChanged) await this.repo.saveTable("t04_dataj", dependentRows);
        if (cgChanged) await this.repo.saveTable("t01_cg", cgRows);
      }
    });
  }

  async handleDeleteCm() {
    await this.runProtected("ลบ CM", async () => {
      const selected = await this.getSelectedRow("t02_cm", "cm");
      if (!selected) {
        alert("กรุณาเลือกแถว CM ก่อน");
        return;
      }

      const cmCode = String(selected["รหัสcm"] || "");
      const [dependentRows, cgRows] = await Promise.all([
        this.repo.getTable("t04_dataj"),
        this.repo.getTable("t01_cg")
      ]);

      const linkedDependents = dependentRows.filter((row) => String(row["รหัสcm"] || "") === cmCode).length;
      const linkedCgs = cgRows.filter((row) => String(row["รหัสcm"] || "") === cmCode).length;

      if (linkedDependents > 0 || linkedCgs > 0) {
        throw new Error(`ลบไม่ได้: มีข้อมูลเชื่อมอยู่ (ผู้รับบริการ ${linkedDependents} ราย, CG ${linkedCgs} คน)`);
      }

      if (!confirm("ยืนยันการลบ CM ที่เลือก?")) return;

      const rows = await this.repo.cloneTable("t02_cm");
      const filtered = rows.filter((row) => row.__rowid !== selected.__rowid);
      await this.repo.saveTable("t02_cm", filtered);
      this.state.selected.cm = null;
      this.getCheckedSet("cm").delete(selected.__rowid);
    });
  }

  async handleDeleteCmBatch() {
    await this.runProtected("ลบ CM หลายรายการ", async () => {
      const rowIds = [...this.getCheckedSet("cm")];
      if (!rowIds.length) {
        alert("กรุณาติ๊กเลือก CM ที่ต้องการลบ");
        return;
      }

      const rows = await this.repo.cloneTable("t02_cm");
      const selectedRows = rows.filter((row) => rowIds.includes(row.__rowid));
      if (!selectedRows.length) return;

      const cmCodeSet = new Set(selectedRows.map((row) => String(row["รหัสcm"] || "")));
      const [dependentRows, cgRows] = await Promise.all([
        this.repo.getTable("t04_dataj"),
        this.repo.getTable("t01_cg")
      ]);
      const linkedDependents = dependentRows.filter((row) => cmCodeSet.has(String(row["รหัสcm"] || ""))).length;
      const linkedCgs = cgRows.filter((row) => cmCodeSet.has(String(row["รหัสcm"] || ""))).length;
      if (linkedDependents > 0 || linkedCgs > 0) {
        throw new Error(`ลบไม่ได้: มีข้อมูลเชื่อมอยู่ (ผู้รับบริการ ${linkedDependents} ราย, CG ${linkedCgs} คน)`);
      }

      if (!confirm(`ยืนยันการลบ CM ${selectedRows.length} รายการ?`)) return;

      const idSet = new Set(rowIds);
      const filtered = rows.filter((row) => !idSet.has(row.__rowid));
      await this.repo.saveTable("t02_cm", filtered);
      this.clearChecked("cm");
      if (this.state.selected.cm && idSet.has(this.state.selected.cm)) {
        this.state.selected.cm = null;
      }
    });
  }

  async handleAddProduct() {
    await this.runProtected("เพิ่มวัสดุ", async () => {
      const rows = await this.repo.cloneTable("t16_product");
      const form = await this.openProductDialog("add");
      if (!form) return;

      const duplicated = rows.some((row) => String(row.productID || "") === form.productID);
      if (duplicated) throw new Error("รหัสวัสดุซ้ำในระบบ");

      const newRow = {
        __rowid: this.repo.createRowId("t16_product"),
        id: this.repo.getNextNumeric(rows, "id"),
        productID: form.productID,
        productName: form.productName,
        price: Number(form.price),
        unit: form.unit,
        reorderPoint: Number(form.reorderPoint)
      };

      rows.push(newRow);
      await this.repo.saveTable("t16_product", rows);
      this.state.selected.supplies = newRow.__rowid;
    });
  }

  async handleEditProduct() {
    await this.runProtected("แก้ไขวัสดุ", async () => {
      const selected = await this.getSelectedProductRow();
      if (!selected) {
        alert("กรุณาเลือกวัสดุก่อน");
        return;
      }

      const rows = await this.repo.cloneTable("t16_product");
      const index = rows.findIndex((row) => row.__rowid === selected.__rowid);
      if (index < 0) return;

      const oldProductId = String(rows[index].productID || "");
      const form = await this.openProductDialog("edit", rows[index]);
      if (!form) return;

      const duplicated = rows.some((row, rowIndex) => rowIndex !== index && String(row.productID || "") === form.productID);
      if (duplicated) throw new Error("รหัสวัสดุซ้ำในระบบ");

      rows[index] = {
        ...rows[index],
        productID: form.productID,
        productName: form.productName,
        price: Number(form.price),
        unit: form.unit,
        reorderPoint: Number(form.reorderPoint)
      };

      await this.repo.saveTable("t16_product", rows);

      const newProductId = form.productID;
      if (oldProductId !== newProductId) {
        const [inRows, outRows] = await Promise.all([
          this.repo.cloneTable("t09_intproduct"),
          this.repo.cloneTable("t13_outproduct")
        ]);

        let inChanged = false;
        for (const row of inRows) {
          if (String(row.productID || "") === oldProductId) {
            row.productID = newProductId;
            inChanged = true;
          }
        }

        let outChanged = false;
        for (const row of outRows) {
          if (String(row.productID || "") === oldProductId) {
            row.productID = newProductId;
            outChanged = true;
          }
        }

        if (inChanged) await this.repo.saveTable("t09_intproduct", inRows);
        if (outChanged) await this.repo.saveTable("t13_outproduct", outRows);
      }
    });
  }

  async handleDeleteProduct() {
    await this.runProtected("ลบวัสดุ", async () => {
      const selected = await this.getSelectedProductRow();
      if (!selected) {
        alert("กรุณาเลือกวัสดุก่อน");
        return;
      }

      const productId = String(selected.productID || "");
      const [productRows, inRows, outRows] = await Promise.all([
        this.repo.cloneTable("t16_product"),
        this.repo.cloneTable("t09_intproduct"),
        this.repo.cloneTable("t13_outproduct")
      ]);

      const inCount = inRows.filter((row) => String(row.productID || "") === productId).length;
      const outCount = outRows.filter((row) => String(row.productID || "") === productId).length;

      if (inCount > 0 || outCount > 0) {
        const cascade = confirm(
          `วัสดุนี้มีประวัติรับเข้า/เบิกจ่าย (${inCount + outCount} รายการ)\nต้องการลบพร้อมประวัติทั้งหมดหรือไม่?`
        );
        if (!cascade) return;
      } else if (!confirm("ยืนยันการลบวัสดุที่เลือก?")) {
        return;
      }

      const nextProducts = productRows.filter((row) => row.__rowid !== selected.__rowid);
      const nextInRows = inRows.filter((row) => String(row.productID || "") !== productId);
      const nextOutRows = outRows.filter((row) => String(row.productID || "") !== productId);

      await Promise.all([
        this.repo.saveTable("t16_product", nextProducts),
        this.repo.saveTable("t09_intproduct", nextInRows),
        this.repo.saveTable("t13_outproduct", nextOutRows)
      ]);

      this.state.selected.supplies = null;
      this.getCheckedSet("supplies").delete(selected.__rowid);
    });
  }

  async handleDeleteProductBatch() {
    await this.runProtected("ลบวัสดุหลายรายการ", async () => {
      const rowIds = [...this.getCheckedSet("supplies")];
      if (!rowIds.length) {
        alert("กรุณาติ๊กเลือกวัสดุที่ต้องการลบ");
        return;
      }

      const [productRows, inRows, outRows] = await Promise.all([
        this.repo.cloneTable("t16_product"),
        this.repo.cloneTable("t09_intproduct"),
        this.repo.cloneTable("t13_outproduct")
      ]);
      const selectedProducts = productRows.filter((row) => rowIds.includes(row.__rowid));
      if (!selectedProducts.length) return;

      const productCodeSet = new Set(selectedProducts.map((row) => String(row.productID || "")));
      const movementCount =
        inRows.filter((row) => productCodeSet.has(String(row.productID || ""))).length +
        outRows.filter((row) => productCodeSet.has(String(row.productID || ""))).length;

      if (movementCount > 0) {
        const cascade = confirm(
          `วัสดุที่เลือกมีประวัติรับเข้า/เบิกจ่าย ${movementCount} รายการ\nต้องการลบพร้อมประวัติทั้งหมดหรือไม่?`
        );
        if (!cascade) return;
      } else if (!confirm(`ยืนยันการลบวัสดุ ${selectedProducts.length} รายการ?`)) {
        return;
      }

      const rowIdSet = new Set(rowIds);
      const nextProducts = productRows.filter((row) => !rowIdSet.has(row.__rowid));
      const nextInRows = inRows.filter((row) => !productCodeSet.has(String(row.productID || "")));
      const nextOutRows = outRows.filter((row) => !productCodeSet.has(String(row.productID || "")));

      await Promise.all([
        this.repo.saveTable("t16_product", nextProducts),
        this.repo.saveTable("t09_intproduct", nextInRows),
        this.repo.saveTable("t13_outproduct", nextOutRows)
      ]);

      this.clearChecked("supplies");
      if (this.state.selected.supplies && rowIdSet.has(this.state.selected.supplies)) {
        this.state.selected.supplies = null;
      }
    });
  }

  async handleSupplyIn() {
    await this.runProtected("บันทึกรับเข้า", async () => {
      const selected = await this.getSelectedProductRow();
      if (!selected) {
        alert("กรุณาเลือกวัสดุก่อน");
        return;
      }

      const form = await this.openSupplyMovementDialog("in", selected);
      if (!form) return;

      const rows = await this.repo.cloneTable("t09_intproduct");
      const newRow = {
        __rowid: this.repo.createRowId("t09_intproduct"),
        inno: this.repo.getNextNumeric(rows, "inno"),
        indate: form.date,
        intype: form.typeCode,
        productID: selected.productID,
        quantity: Number(form.quantity)
      };

      rows.push(newRow);
      await this.repo.saveTable("t09_intproduct", rows);
    });
  }

  async handleSupplyOut() {
    await this.runProtected("บันทึกเบิกจ่าย", async () => {
      const selected = await this.getSelectedProductInventory();
      if (!selected) {
        alert("กรุณาเลือกวัสดุก่อน");
        return;
      }

      const form = await this.openSupplyMovementDialog("out", selected.product);
      if (!form) return;

      const quantity = Number(form.quantity);
      if (quantity > selected.balance) {
        throw new Error(`จำนวนเบิกจ่ายเกินคงเหลือ (คงเหลือ ${selected.balance})`);
      }

      const rows = await this.repo.cloneTable("t13_outproduct");
      const newRow = {
        __rowid: this.repo.createRowId("t13_outproduct"),
        outno: this.repo.getNextNumeric(rows, "outno"),
        outdate: form.date,
        outtype: form.typeCode,
        productID: selected.productID,
        quantity,
        "รหัสltc": form.ltcCode,
        Returndate: null,
        round: form.round
      };

      rows.push(newRow);
      await this.repo.saveTable("t13_outproduct", rows);
    });
  }

  async handleAddFinance() {
    await this.runProtected("เพิ่มรายการการเงิน", async () => {
      const rows = await this.repo.cloneTable("t23_tbl_income_expense");
      const form = await this.openFinanceDialog("add");
      if (!form) return;

      const newRow = this.domain.buildFinanceRow(form, {}, this.repo.getNextNumeric(rows, "ID"));
      newRow.__rowid = this.repo.createRowId("t23_tbl_income_expense");

      rows.push(newRow);
      await this.repo.saveTable("t23_tbl_income_expense", rows);
      this.state.selected.finance = newRow.__rowid;
    });
  }

  async handleEditFinance() {
    await this.runProtected("แก้ไขรายการการเงิน", async () => {
      const selected = await this.getSelectedRow("t23_tbl_income_expense", "finance");
      if (!selected) {
        alert("กรุณาเลือกรายการการเงินก่อน");
        return;
      }

      const parsed = this.domain.parseFinanceRow(selected);
      if (!parsed.editable) {
        throw new Error("รายการนี้แก้ไขแบบฟอร์มง่ายไม่ได้ (มีข้อมูลผสมหลายช่อง) ให้ลบแล้วเพิ่มใหม่");
      }

      const rows = await this.repo.cloneTable("t23_tbl_income_expense");
      const index = rows.findIndex((row) => row.__rowid === selected.__rowid);
      if (index < 0) return;

      const form = await this.openFinanceDialog("edit", parsed);
      if (!form) return;

      const updated = this.domain.buildFinanceRow(form, rows[index], rows[index].ID || this.repo.getNextNumeric(rows, "ID"));
      updated.__rowid = rows[index].__rowid;
      rows[index] = updated;

      await this.repo.saveTable("t23_tbl_income_expense", rows);
    });
  }

  async handleDeleteFinance() {
    await this.runProtected("ลบรายการการเงิน", async () => {
      const selected = await this.getSelectedRow("t23_tbl_income_expense", "finance");
      if (!selected) {
        alert("กรุณาเลือกรายการการเงินก่อน");
        return;
      }

      if (!confirm("ยืนยันการลบรายการการเงินที่เลือก?")) return;

      const rows = await this.repo.cloneTable("t23_tbl_income_expense");
      const filtered = rows.filter((row) => row.__rowid !== selected.__rowid);
      await this.repo.saveTable("t23_tbl_income_expense", filtered);
      this.state.selected.finance = null;
      this.getCheckedSet("finance").delete(selected.__rowid);
    });
  }

  async handleDeleteFinanceBatch() {
    await this.runProtected("ลบรายการการเงินหลายรายการ", async () => {
      const rowIds = [...this.getCheckedSet("finance")];
      if (!rowIds.length) {
        alert("กรุณาติ๊กเลือกรายการการเงินที่ต้องการลบ");
        return;
      }
      if (!confirm(`ยืนยันการลบรายการการเงิน ${rowIds.length} รายการ?`)) return;

      const rows = await this.repo.cloneTable("t23_tbl_income_expense");
      const idSet = new Set(rowIds);
      const filtered = rows.filter((row) => !idSet.has(row.__rowid));
      await this.repo.saveTable("t23_tbl_income_expense", filtered);
      this.clearChecked("finance");
      if (this.state.selected.finance && idSet.has(this.state.selected.finance)) {
        this.state.selected.finance = null;
      }
    });
  }

  async handleAddUnit() {
    await this.runProtected("เพิ่มหน่วยงาน", async () => {
      const rows = await this.repo.cloneTable("t26_unit");
      const form = await this.openUnitDialog("add");
      if (!form) return;

      const duplicated = rows.some((row) => String(row["รหัสหน่วย"] || "") === form.unitCode);
      if (duplicated) throw new Error("รหัสหน่วยงานซ้ำในระบบ");

      const newRow = {
        __rowid: this.repo.createRowId("t26_unit"),
        ID: this.repo.getNextNumeric(rows, "ID"),
        "รหัสหน่วย": form.unitCode,
        "หน่วย": form.unitName,
        "เลขที่": form.addressNo,
        "หมู่": form.moo,
        "ถนน": form.road,
        "ตำบล": form.subdistrict,
        "อำเภอ": form.district,
        "จังหวัด": form.province,
        "รหัส": form.postcode,
        "โทร": form.phone
      };

      rows.push(newRow);
      await this.repo.saveTable("t26_unit", rows);
      this.state.selected.units = newRow.__rowid;
    });
  }

  async handleEditUnit() {
    await this.runProtected("แก้ไขหน่วยงาน", async () => {
      const selected = await this.getSelectedRow("t26_unit", "units");
      if (!selected) {
        alert("กรุณาเลือกหน่วยงานก่อน");
        return;
      }

      const rows = await this.repo.cloneTable("t26_unit");
      const index = rows.findIndex((row) => row.__rowid === selected.__rowid);
      if (index < 0) return;

      const oldCode = String(rows[index]["รหัสหน่วย"] || "");
      const form = await this.openUnitDialog("edit", rows[index]);
      if (!form) return;

      const newCode = form.unitCode;
      const duplicated = rows.some((row, rowIndex) => rowIndex !== index && String(row["รหัสหน่วย"] || "") === newCode);
      if (duplicated) throw new Error("รหัสหน่วยงานซ้ำในระบบ");

      rows[index] = {
        ...rows[index],
        "รหัสหน่วย": newCode,
        "หน่วย": form.unitName,
        "เลขที่": form.addressNo,
        "หมู่": form.moo,
        "ถนน": form.road,
        "ตำบล": form.subdistrict,
        "อำเภอ": form.district,
        "จังหวัด": form.province,
        "รหัส": form.postcode,
        "โทร": form.phone
      };

      await this.repo.saveTable("t26_unit", rows);

      if (oldCode !== newCode) {
        const [dependentRows, cmRows] = await Promise.all([
          this.repo.cloneTable("t04_dataj"),
          this.repo.cloneTable("t02_cm")
        ]);

        let dependentChanged = false;
        for (const row of dependentRows) {
          if (String(row["รหัสหน่วย"] || "") === oldCode) {
            row["รหัสหน่วย"] = newCode;
            dependentChanged = true;
          }
        }

        let cmChanged = false;
        for (const row of cmRows) {
          if (String(row["รหัสหน่วย"] || "") === oldCode) {
            row["รหัสหน่วย"] = newCode;
            cmChanged = true;
          }
        }

        if (dependentChanged) await this.repo.saveTable("t04_dataj", dependentRows);
        if (cmChanged) await this.repo.saveTable("t02_cm", cmRows);
      }
    });
  }

  async handleDeleteUnit() {
    await this.runProtected("ลบหน่วยงาน", async () => {
      const selected = await this.getSelectedRow("t26_unit", "units");
      if (!selected) {
        alert("กรุณาเลือกหน่วยงานก่อน");
        return;
      }

      const unitCode = String(selected["รหัสหน่วย"] || "");
      const [dependentRows, cmRows] = await Promise.all([
        this.repo.getTable("t04_dataj"),
        this.repo.getTable("t02_cm")
      ]);

      const linkedDependents = dependentRows.filter((row) => String(row["รหัสหน่วย"] || "") === unitCode).length;
      const linkedCm = cmRows.filter((row) => String(row["รหัสหน่วย"] || "") === unitCode).length;

      if (linkedDependents > 0 || linkedCm > 0) {
        throw new Error(`ลบไม่ได้: มีข้อมูลเชื่อมอยู่ (CM ${linkedCm} คน, LTC ${linkedDependents} ราย)`);
      }

      if (!confirm("ยืนยันการลบหน่วยงานที่เลือก?")) return;

      const rows = await this.repo.cloneTable("t26_unit");
      const filtered = rows.filter((row) => row.__rowid !== selected.__rowid);
      await this.repo.saveTable("t26_unit", filtered);
      this.state.selected.units = null;
      this.getCheckedSet("units").delete(selected.__rowid);
    });
  }

  async handleDeleteUnitBatch() {
    await this.runProtected("ลบหน่วยงานหลายรายการ", async () => {
      const rowIds = [...this.getCheckedSet("units")];
      if (!rowIds.length) {
        alert("กรุณาติ๊กเลือกหน่วยงานที่ต้องการลบ");
        return;
      }

      const rows = await this.repo.cloneTable("t26_unit");
      const selectedUnits = rows.filter((row) => rowIds.includes(row.__rowid));
      if (!selectedUnits.length) return;

      const unitCodeSet = new Set(selectedUnits.map((row) => String(row["รหัสหน่วย"] || "")));
      const [dependentRows, cmRows] = await Promise.all([
        this.repo.getTable("t04_dataj"),
        this.repo.getTable("t02_cm")
      ]);
      const linkedDependents = dependentRows.filter((row) => unitCodeSet.has(String(row["รหัสหน่วย"] || ""))).length;
      const linkedCm = cmRows.filter((row) => unitCodeSet.has(String(row["รหัสหน่วย"] || ""))).length;
      if (linkedDependents > 0 || linkedCm > 0) {
        throw new Error(`ลบไม่ได้: มีข้อมูลเชื่อมอยู่ (CM ${linkedCm} คน, LTC ${linkedDependents} ราย)`);
      }

      if (!confirm(`ยืนยันการลบหน่วยงาน ${selectedUnits.length} รายการ?`)) return;

      const idSet = new Set(rowIds);
      const filtered = rows.filter((row) => !idSet.has(row.__rowid));
      await this.repo.saveTable("t26_unit", filtered);
      this.clearChecked("units");
      if (this.state.selected.units && idSet.has(this.state.selected.units)) {
        this.state.selected.units = null;
      }
    });
  }

  async runProtected(actionLabel, handler) {
    const unlocked = await this.security.ensureUnlocked(actionLabel);
    if (!unlocked) return;

    await handler();
    await this.renderAll();
    await this.refreshStorageStatus();
  }

  async getSelectedRow(alias, stateKey) {
    const rowId = this.state.selected[stateKey];
    if (!rowId) return null;
    const rows = await this.repo.getTable(alias);
    return rows.find((row) => row.__rowid === rowId) || null;
  }

  async getSelectedProductRow() {
    const rowId = this.state.selected.supplies;
    if (!rowId) return null;
    const rows = await this.repo.getTable("t16_product");
    return rows.find((row) => row.__rowid === rowId) || null;
  }

  async getSelectedProductInventory() {
    const rowId = this.state.selected.supplies;
    if (!rowId) return null;
    const inventoryRows = await this.domain.computeInventoryRows();
    return inventoryRows.find((row) => row.rowId === rowId) || null;
  }

  async requestPinDialog(config = {}) {
    const { title = "ยืนยัน PIN", hint = "", confirm = false } = config;
    const fields = [
      {
        name: "pin",
        label: "PIN",
        type: "password",
        required: true,
        value: "",
        placeholder: "อย่างน้อย 6 ตัวอักษร/ตัวเลข",
        validate: (value) => {
          if (String(value || "").trim().length < 1) return "กรุณากรอก PIN";
          return null;
        }
      }
    ];
    if (confirm) {
      fields.push({
        name: "pinConfirm",
        label: "ยืนยัน PIN",
        type: "password",
        required: true,
        value: ""
      });
    }
    return this.openEntityDialog({
      title,
      hint,
      fields
    });
  }

  async openDependentDialog(mode, row = null) {
    const [unitRows, cmRows, cgRows] = await Promise.all([
      this.repo.getTable("t26_unit"),
      this.repo.getTable("t02_cm"),
      this.repo.getTable("t01_cg")
    ]);

    const initial = {
      citizenId: row?.["เลขประชาชน"] || "",
      prefix: Format.normalizeFemalePrefix(row?.["นาม"] || "นาย"),
      firstName: row?.["ชื่อ"] || "",
      lastName: row?.["สกุล"] || "",
      gender: row?.["เพศ"] || this.inferGenderFromPrefix(row?.["นาม"] || "นาย"),
      adl: row?.ADL ?? 0,
      tai: String(row?.TAI || "I1").toUpperCase(),
      birthDate: row?.["วันเดือนปีเกิด"] || null,
      address: row?.["ที่อยู่"] || "",
      moo: row?.["หมู่"] || "",
      road: row?.["ถนน"] || "",
      subdistrict: row?.["ตำบล"] || "",
      district: row?.["อำเภอ"] || "",
      province: row?.["จังหวัด"] || "ตราด",
      unitCode: row?.["รหัสหน่วย"] || "",
      cmCode: row?.["รหัสcm"] || "",
      cgCode: row?.["รหัสcg"] || "",
      careStart: row?.["วันเริ่ม cp"] || null,
      careEnd: row?.["วันสิ้นสุด cp"] || null
    };

    return this.openEntityDialog({
      title: mode === "add" ? "เพิ่มผู้รับบริการ LTC" : "แก้ไขผู้รับบริการ LTC",
      hint: "กรอกข้อมูลสำคัญที่ใช้จริงในหน้างาน ข้อมูลจะเชื่อมกับภาพรวมทันที",
      fields: [
        {
          name: "citizenId",
          label: "เลขบัตรประชาชน",
          type: "text",
          required: true,
          value: initial.citizenId,
          placeholder: "13 หลัก",
          validate: (value) => {
            if (!/^\d{13}$/.test(value)) return "เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก";
            if (!Validate.thaiCitizenId(value)) return "เลขบัตรประชาชนไม่ผ่านการตรวจสอบ";
            return null;
          }
        },
        {
          name: "prefix",
          label: "คำนำหน้า",
          type: "select",
          required: true,
          value: initial.prefix,
          options: ["นาย", "นาง", "นางสาว", "ด.ช.", "ด.ญ."]
        },
        { name: "firstName", label: "ชื่อ", type: "text", required: true, value: initial.firstName },
        { name: "lastName", label: "สกุล", type: "text", required: true, value: initial.lastName },
        {
          name: "gender",
          label: "เพศ",
          type: "select",
          required: true,
          value: initial.gender,
          options: ["ชาย", "หญิง"]
        },
        {
          name: "adl",
          label: "ADL",
          type: "number",
          required: true,
          value: initial.adl,
          min: 0,
          max: 20,
          validate: (value) => (Validate.nonNegative(value) ? null : "ADL ต้องเป็นเลข 0 ขึ้นไป")
        },
        {
          name: "tai",
          label: "ระดับ TAI",
          type: "select",
          required: true,
          value: initial.tai,
          options: ["I1", "I2", "I3", "B3", "C2", "C3"]
        },
        { name: "birthDate", label: "วันเดือนปีเกิด", type: "date", value: initial.birthDate },
        { name: "address", label: "บ้านเลขที่", type: "text", required: true, value: initial.address },
        { name: "moo", label: "หมู่", type: "text", value: initial.moo },
        { name: "road", label: "ถนน", type: "text", value: initial.road },
        { name: "subdistrict", label: "ตำบล", type: "text", required: true, value: initial.subdistrict },
        { name: "district", label: "อำเภอ", type: "text", required: true, value: initial.district },
        { name: "province", label: "จังหวัด", type: "text", required: true, value: initial.province },
        {
          name: "unitCode",
          label: "รหัสหน่วย",
          type: "select",
          required: true,
          value: initial.unitCode,
          options: unitRows.map((rowItem) => ({
            value: String(rowItem["รหัสหน่วย"] || ""),
            label: `${rowItem["รหัสหน่วย"] || "-"} - ${rowItem["หน่วย"] || ""}`
          }))
        },
        {
          name: "cmCode",
          label: "รหัส CM",
          type: "select",
          value: initial.cmCode,
          options: cmRows.map((rowItem) => ({
            value: String(rowItem["รหัสcm"] || ""),
            label: `${rowItem["รหัสcm"] || "-"} - ${Format.expandFemalePrefixInText(rowItem["ชื่อสกุล"] || "")}`
          }))
        },
        {
          name: "cgCode",
          label: "รหัส CG",
          type: "select",
          value: initial.cgCode,
          options: cgRows.map((rowItem) => ({
            value: String(rowItem["รหัสcg"] || ""),
            label: `${rowItem["รหัสcg"] || "-"} - ${Format.expandFemalePrefixInText(rowItem["ชื่อสกุล"] || "")}`
          }))
        },
        { name: "careStart", label: "วันเริ่ม CP", type: "date", value: initial.careStart },
        { name: "careEnd", label: "วันสิ้นสุด CP", type: "date", value: initial.careEnd }
      ]
    });
  }

  async openCgDialog(mode, row = null) {
    const cmRows = await this.repo.getTable("t02_cm");
    const parsed = NameUtils.parse(row?.["ชื่อสกุล"] || "");

    return this.openEntityDialog({
      title: mode === "add" ? "เพิ่ม Care Giver (CG)" : "แก้ไข Care Giver (CG)",
      hint: "คำนำหน้า น.ส. จะถูกบันทึกเป็น นางสาว อัตโนมัติ",
      fields: [
        { name: "cgCode", label: "รหัส CG", type: "text", value: row?.["รหัสcg"] || "", help: "ปล่อยว่างเพื่อให้ระบบสร้างรหัสให้" },
        {
          name: "prefix",
          label: "คำนำหน้า",
          type: "select",
          required: true,
          value: parsed.prefix || "นางสาว",
          options: ["นาย", "นาง", "นางสาว", "ด.ช.", "ด.ญ.", "คุณ"]
        },
        { name: "firstName", label: "ชื่อ", type: "text", required: true, value: parsed.firstName },
        { name: "lastName", label: "สกุล", type: "text", required: true, value: parsed.lastName },
        { name: "birthDate", label: "วันเดือนปีเกิด", type: "date", value: row?.["วดปเกิด"] || null },
        {
          name: "phone",
          label: "โทรศัพท์",
          type: "text",
          value: row?.["โทร"] || "",
          validate: (value) => (Validate.phone(value) ? null : "รูปแบบเบอร์โทรไม่ถูกต้อง")
        },
        { name: "address", label: "บ้านเลขที่", type: "text", required: true, value: row?.["ที่อยู่"] || "" },
        { name: "moo", label: "หมู่", type: "text", value: row?.["หมู่"] || "" },
        { name: "subdistrict", label: "ตำบล", type: "text", required: true, value: row?.["ตำบล"] || "" },
        { name: "district", label: "อำเภอ", type: "text", required: true, value: row?.["อำเภอ"] || "" },
        { name: "province", label: "จังหวัด", type: "text", required: true, value: row?.["จังหวัด"] || "ตราด" },
        {
          name: "cmCode",
          label: "รหัส CM",
          type: "select",
          required: true,
          value: row?.["รหัสcm"] || "",
          options: cmRows.map((cm) => ({
            value: String(cm["รหัสcm"] || ""),
            label: `${cm["รหัสcm"] || "-"} - ${Format.expandFemalePrefixInText(cm["ชื่อสกุล"] || "")}`
          }))
        }
      ]
    });
  }

  async openCmDialog(mode, row = null) {
    const unitRows = await this.repo.getTable("t26_unit");
    const parsed = NameUtils.parse(row?.["ชื่อสกุล"] || "");

    return this.openEntityDialog({
      title: mode === "add" ? "เพิ่ม Care Manager (CM)" : "แก้ไข Care Manager (CM)",
      hint: "แก้ไขรหัส CM ได้ โดยระบบจะอัปเดตรหัสที่เชื่อมอยู่ให้อัตโนมัติ",
      fields: [
        { name: "cmCode", label: "รหัส CM", type: "text", value: row?.["รหัสcm"] || "", help: "ปล่อยว่างเพื่อให้ระบบสร้างรหัสให้" },
        {
          name: "prefix",
          label: "คำนำหน้า",
          type: "select",
          required: true,
          value: parsed.prefix || "นางสาว",
          options: ["นาย", "นาง", "นางสาว", "ด.ร.", "พ.จ.อ.", "จ.ส.อ.", "คุณ"]
        },
        { name: "firstName", label: "ชื่อ", type: "text", required: true, value: parsed.firstName },
        { name: "lastName", label: "สกุล", type: "text", required: true, value: parsed.lastName },
        {
          name: "unitCode",
          label: "รหัสหน่วย",
          type: "select",
          required: true,
          value: row?.["รหัสหน่วย"] || "",
          options: unitRows.map((unit) => ({
            value: String(unit["รหัสหน่วย"] || ""),
            label: `${unit["รหัสหน่วย"] || "-"} - ${unit["หน่วย"] || ""}`
          }))
        },
        {
          name: "phone",
          label: "โทรศัพท์",
          type: "text",
          value: row?.["โทร"] || "",
          validate: (value) => (Validate.phone(value) ? null : "รูปแบบเบอร์โทรไม่ถูกต้อง")
        },
        { name: "birthDate", label: "วันเดือนปีเกิด", type: "date", value: row?.["วดปเกิด"] || null },
        { name: "address", label: "บ้านเลขที่", type: "text", required: true, value: row?.["ที่อยู่"] || "" },
        { name: "moo", label: "หมู่", type: "text", value: row?.["หมู่"] || "" },
        { name: "subdistrict", label: "ตำบล", type: "text", required: true, value: row?.["ตำบล"] || "" },
        { name: "district", label: "อำเภอ", type: "text", required: true, value: row?.["อำเภอ"] || "" },
        { name: "province", label: "จังหวัด", type: "text", required: true, value: row?.["จังหวัด"] || "ตราด" }
      ]
    });
  }

  async openProductDialog(mode, row = null) {
    return this.openEntityDialog({
      title: mode === "add" ? "เพิ่มวัสดุทางการแพทย์" : "แก้ไขวัสดุทางการแพทย์",
      hint: "กำหนดจุดสั่งซื้อขั้นต่ำเพื่อช่วยวิเคราะห์สถานะคลัง",
      fields: [
        { name: "productID", label: "รหัสวัสดุ", type: "text", required: true, value: row?.productID || "" },
        { name: "productName", label: "ชื่อวัสดุ", type: "text", required: true, value: row?.productName || "" },
        { name: "unit", label: "หน่วยนับ", type: "text", required: true, value: row?.unit || "ชิ้น" },
        {
          name: "price",
          label: "ราคาต่อหน่วย",
          type: "number",
          required: true,
          value: row?.price ?? 0,
          min: 0,
          step: "0.01",
          validate: (value) => (Validate.nonNegative(value) ? null : "ราคาต้องเป็น 0 ขึ้นไป")
        },
        {
          name: "reorderPoint",
          label: "จุดสั่งซื้อขั้นต่ำ",
          type: "number",
          required: true,
          value: row?.reorderPoint ?? row?.threshold ?? 10,
          min: 0,
          validate: (value) => (Validate.nonNegative(value) ? null : "จุดสั่งซื้อขั้นต่ำต้องเป็น 0 ขึ้นไป")
        }
      ]
    });
  }

  async openSupplyMovementDialog(mode, productRow) {
    const isIn = mode === "in";
    return this.openEntityDialog({
      title: isIn ? "บันทึกรับเข้าวัสดุ" : "บันทึกเบิกจ่ายวัสดุ",
      hint: `${isIn ? "เพิ่ม" : "ลด"}สต็อกสำหรับ ${productRow.productID || "-"} - ${productRow.productName || "-"}`,
      fields: [
        {
          name: "date",
          label: "วันที่",
          type: "date",
          required: true,
          value: Format.dateInputToIso(Format.todayDateInput())
        },
        {
          name: "quantity",
          label: "จำนวน",
          type: "number",
          required: true,
          value: 1,
          min: 1,
          validate: (value) => (Validate.positive(value) ? null : "จำนวนต้องมากกว่า 0")
        },
        {
          name: "typeCode",
          label: isIn ? "ประเภทรายการรับเข้า" : "ประเภทรายการเบิกจ่าย",
          type: "text",
          required: true,
          value: "11"
        },
        {
          name: "ltcCode",
          label: "รหัส LTC (เฉพาะเบิกจ่าย)",
          type: "text",
          value: "",
          hidden: isIn
        },
        {
          name: "round",
          label: "รอบ (เฉพาะเบิกจ่าย)",
          type: "text",
          value: "",
          hidden: isIn
        }
      ]
    });
  }

  async openFinanceDialog(mode, parsed = null) {
    const todayYear = new Date().getFullYear() + 543;
    return this.openEntityDialog({
      title: mode === "add" ? "เพิ่มรายการรายรับ-รายจ่าย" : "แก้ไขรายการรายรับ-รายจ่าย",
      hint: "เพิ่ม/แก้ไขแล้วยอดรวมจะคำนวณใหม่ทันที",
      fields: [
        {
          name: "type",
          label: "ประเภท",
          type: "select",
          required: true,
          value: parsed?.type || "income",
          options: [
            { value: "income", label: "รายรับ" },
            { value: "expense", label: "รายจ่าย" }
          ]
        },
        {
          name: "category",
          label: "หมวด",
          type: "select",
          required: true,
          value: parsed?.category || "1",
          options: [
            { value: "1", label: "ประเภท 1" },
            { value: "2", label: "ประเภท 2" },
            { value: "3", label: "ประเภท 3" },
            { value: "4", label: "ประเภท 4" }
          ]
        },
        {
          name: "amount",
          label: "จำนวนเงิน",
          type: "number",
          required: true,
          value: parsed?.amount ?? 0,
          min: 0,
          step: "0.01",
          validate: (value) => (Validate.positive(value) ? null : "จำนวนเงินต้องมากกว่า 0")
        },
        {
          name: "date",
          label: "วันที่",
          type: "date",
          required: true,
          value: parsed?.date || Format.dateInputToIso(Format.todayDateInput())
        },
        {
          name: "year",
          label: "ปีงบประมาณ (พ.ศ.)",
          type: "number",
          required: true,
          value: Number(parsed?.year || todayYear),
          min: 2500,
          max: 2700,
          validate: (value) => {
            const year = Number(value);
            if (!Number.isFinite(year)) return "ปีงบประมาณไม่ถูกต้อง";
            if (year < 2500 || year > 2700) return "ปีงบประมาณต้องอยู่ในช่วง 2500-2700";
            return null;
          }
        },
        {
          name: "note",
          label: "หมายเหตุ",
          type: "textarea",
          wide: true,
          value: parsed?.note || ""
        }
      ]
    });
  }

  async openUnitDialog(mode, row = null) {
    return this.openEntityDialog({
      title: mode === "add" ? "เพิ่มหน่วยงาน" : "แก้ไขหน่วยงาน",
      hint: "แก้ไขรหัสหน่วยได้ โดยระบบจะอัปเดตข้อมูลที่เชื่อมอยู่ให้อัตโนมัติ",
      fields: [
        { name: "unitCode", label: "รหัสหน่วย", type: "text", required: true, value: row?.["รหัสหน่วย"] || "" },
        { name: "unitName", label: "ชื่อหน่วยงาน", type: "text", required: true, value: row?.["หน่วย"] || "" },
        { name: "addressNo", label: "เลขที่", type: "text", required: true, value: row?.["เลขที่"] || "" },
        { name: "moo", label: "หมู่", type: "text", value: row?.["หมู่"] || "" },
        { name: "road", label: "ถนน", type: "text", value: row?.["ถนน"] || "" },
        { name: "subdistrict", label: "ตำบล", type: "text", required: true, value: row?.["ตำบล"] || "" },
        { name: "district", label: "อำเภอ", type: "text", required: true, value: row?.["อำเภอ"] || "" },
        { name: "province", label: "จังหวัด", type: "text", required: true, value: row?.["จังหวัด"] || "ตราด" },
        { name: "postcode", label: "รหัสไปรษณีย์", type: "text", value: row?.["รหัส"] || "" },
        {
          name: "phone",
          label: "โทรศัพท์",
          type: "text",
          value: row?.["โทร"] || "",
          validate: (value) => (Validate.phone(value) ? null : "รูปแบบเบอร์โทรไม่ถูกต้อง")
        }
      ]
    });
  }

  async openEntityDialog(config) {
    const { title, hint, fields } = config;

    this.el.entityDialogTitle.textContent = title;
    this.el.entityDialogHint.textContent = hint || "";
    this.el.entityFormFields.innerHTML = "";

    const controls = {};

    for (const field of fields) {
      if (field.hidden) continue;

      const wrap = document.createElement("div");
      wrap.className = `row-field${field.wide ? " wide" : ""}`;

      const label = document.createElement("label");
      label.innerHTML = `${Format.escapeHtml(field.label)}${field.required ? ' <span class="req">*</span>' : ""}`;
      wrap.appendChild(label);

      let control;
      if (field.type === "select") {
        control = document.createElement("select");

        if (!field.required) {
          const option = document.createElement("option");
          option.value = "";
          option.textContent = "-";
          control.appendChild(option);
        }

        for (const optionData of field.options || []) {
          const option = document.createElement("option");
          if (typeof optionData === "object") {
            option.value = optionData.value;
            option.textContent = optionData.label;
          } else {
            option.value = String(optionData);
            option.textContent = String(optionData);
          }
          control.appendChild(option);
        }

        control.value = field.value == null ? "" : String(field.value);
      } else if (field.type === "textarea") {
        control = document.createElement("textarea");
        control.value = field.value == null ? "" : String(field.value);
      } else {
        control = document.createElement("input");
        control.type =
          field.type === "date"
            ? "date"
            : field.type === "number"
              ? "number"
              : field.type === "password"
                ? "password"
                : "text";
        if (field.type === "date") {
          control.value = Format.isoToDateInput(field.value);
        } else {
          control.value = field.value == null ? "" : String(field.value);
        }
        if (field.type === "password") {
          control.autocomplete = "new-password";
        }

        if (field.min != null) control.min = String(field.min);
        if (field.max != null) control.max = String(field.max);
        if (field.step != null) control.step = String(field.step);
      }

      if (field.placeholder) control.placeholder = field.placeholder;
      if (field.required) control.required = true;

      control.name = field.name;
      controls[field.name] = control;
      wrap.appendChild(control);

      if (field.help) {
        const help = document.createElement("small");
        help.textContent = field.help;
        wrap.appendChild(help);
      }

      this.el.entityFormFields.appendChild(wrap);
    }

    return new Promise((resolve) => {
      const cleanup = () => {
        this.el.entityForm.removeEventListener("submit", onSubmit);
        this.el.entityCancelBtn.removeEventListener("click", onCancel);
        this.el.entityDialog.removeEventListener("close", onClose);
      };

      const onClose = () => {
        cleanup();
        resolve(null);
      };

      const onCancel = () => {
        this.el.entityDialog.close();
      };

      const onSubmit = (event) => {
        event.preventDefault();

        const rawValues = {};
        for (const field of fields) {
          if (field.hidden) continue;
          const control = controls[field.name];
          rawValues[field.name] = control.value;
        }

        for (const field of fields) {
          if (field.hidden) continue;
          const value = Format.toText(rawValues[field.name]);
          if (field.required && !value) {
            alert(`กรุณากรอก ${field.label}`);
            controls[field.name].focus();
            return;
          }

          if (typeof field.validate === "function") {
            const error = field.validate(rawValues[field.name], rawValues);
            if (error) {
              alert(error);
              controls[field.name].focus();
              return;
            }
          }
        }

        const parsed = {};
        for (const field of fields) {
          if (field.hidden) continue;

          const raw = rawValues[field.name];
          let value = raw;
          if (field.type === "number") {
            value = raw === "" ? 0 : Number(raw);
          } else if (field.type === "date") {
            value = Format.dateInputToIso(raw);
          } else {
            value = Format.cleanWhitespace(raw);
            if (!value) value = null;
          }

          parsed[field.name] = value;
        }

        cleanup();
        this.el.entityDialog.close();
        resolve(parsed);
      };

      this.el.entityForm.addEventListener("submit", onSubmit);
      this.el.entityCancelBtn.addEventListener("click", onCancel);
      this.el.entityDialog.addEventListener("close", onClose);
      this.el.entityDialog.showModal();
    });
  }

  filterRows(rows, query, fields) {
    if (!query) return rows;
    return rows.filter((row) => {
      const text = fields.map((field) => String(row[field] ?? "")).join(" ").toLowerCase();
      return text.includes(query);
    });
  }

  countBy(rows, selector) {
    const result = {};
    for (const row of rows) {
      const key = selector(row);
      result[key] = (result[key] || 0) + 1;
    }
    return result;
  }

  maxIndex(values) {
    let index = 0;
    let max = Number(values[0]) || 0;
    for (let i = 1; i < values.length; i += 1) {
      const value = Number(values[i]) || 0;
      if (value > max) {
        max = value;
        index = i;
      }
    }
    return index;
  }

  normalizeGender(value) {
    const text = Format.toText(value);
    if (["ชาย", "นาย", "ด.ช."].includes(text)) return "ชาย";
    if (["หญิง", "นาง", "นางสาว", "น.ส.", "ด.ญ."].includes(text)) return "หญิง";
    return text || "-";
  }

  inferGenderFromPrefix(prefix) {
    const text = Format.normalizeFemalePrefix(Format.toText(prefix));
    if (["นาย", "ด.ช."].includes(text)) return "ชาย";
    if (["นาง", "นางสาว", "ด.ญ."].includes(text)) return "หญิง";
    return "หญิง";
  }

  fullNameFromDependent(row) {
    const prefix = Format.normalizeFemalePrefix(row["นาม"] || "");
    const firstName = Format.toText(row["ชื่อ"] || "");
    const lastName = Format.toText(row["สกุล"] || "");
    return `${prefix}${firstName} ${lastName}`.replace(/\s+/g, " ").trim();
  }

  buildAddress(row) {
    const home = String(row["ที่อยู่"] || "-");
    const moo = String(row["หมู่"] || "-");
    return `${home} หมู่ ${moo}`;
  }

  generateCgCode(cmCode, rows) {
    const base = Format.toText(cmCode).replace(/cm\d+$/i, "") || "CG";
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^${escaped}cg(\\d+)$`, "i");
    let max = 0;
    for (const row of rows) {
      const code = String(row["รหัสcg"] || "");
      const match = code.match(pattern);
      if (match) {
        const number = Number(match[1]);
        if (number > max) max = number;
      }
    }
    return `${base}cg${max + 1}`;
  }

  generateCmCode(unitCode, rows) {
    const base = Format.toText(unitCode) || "CM";
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^${escaped}cm(\\d+)$`, "i");
    let max = 0;
    for (const row of rows) {
      const code = String(row["รหัสcm"] || "");
      const match = code.match(pattern);
      if (match) {
        const number = Number(match[1]);
        if (number > max) max = number;
      }
    }
    return `${base}cm${max + 1}`;
  }

  handleError = (error) => {
    console.error(error);
    alert(error.message || "เกิดข้อผิดพลาดที่ไม่คาดคิด");
  };
}

export { LtcApp };
