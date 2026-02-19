import { API_BASE, AUTH_BASE, DATA_ROOT, STORAGE_PREFIX } from "./config.js";
import { Format } from "./utils.js";
import { DataRepository } from "./data-repository.js";
import { DomainService } from "./domain-service.js";
import { AppHelpers } from "./app-helpers.js";
import { EntityDialogService } from "./entity-dialog-service.js";
import { SecurityToolkit } from "./security.js";
import { AiAssistantPage } from "./ai-assistant-page.js";
import { ActivityLogPage } from "./activity-log-page.js";
import { ltcAppRenderMethods } from "./ltc-app-render-methods.js";
import { ltcAppActionMethods } from "./ltc-app-action-methods.js";

class LtcApp {
  constructor() {
    this.repo = new DataRepository(API_BASE, DATA_ROOT, STORAGE_PREFIX);
    this.domain = new DomainService(this.repo);
    this.helpers = new AppHelpers();

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
      authUserText: document.getElementById("authUserText"),
      logoutBtn: document.getElementById("logoutBtn"),
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

      aiChatBody: document.getElementById("aiChatBody"),
      aiInput: document.getElementById("aiInput"),
      aiSendBtn: document.getElementById("aiSendBtn"),
      aiClearBtn: document.getElementById("aiClearBtn"),
      aiTyping: document.getElementById("aiTyping"),
      aiSuggestionWrap: document.getElementById("aiSuggestionWrap"),
      aiQuickButtons: [...document.querySelectorAll(".ai-quick-btn")],

      trashSummary: document.getElementById("trashSummary"),
      trashBody: document.getElementById("trashBody"),
      trashRestoreBtn: document.getElementById("trashRestoreBtn"),
      trashPurgeAllBtn: document.getElementById("trashPurgeAllBtn"),
      trashPurgeBtn: document.getElementById("trashPurgeBtn"),

      entityDialog: document.getElementById("entityDialog"),
      entityForm: document.getElementById("entityForm"),
      entityDialogTitle: document.getElementById("entityDialogTitle"),
      entityDialogHint: document.getElementById("entityDialogHint"),
      entityFormFields: document.getElementById("entityFormFields"),
      entityCancelBtn: document.getElementById("entityCancelBtn"),
      entitySubmitBtn: document.getElementById("entitySubmitBtn")
    };

    this.dialogs = new EntityDialogService(this.el, this.repo, this.domain, this.helpers);
    this.securityToolkit = new SecurityToolkit(this.repo);
    this.aiPage = new AiAssistantPage({
      repo: this.repo,
      security: this.securityToolkit,
      elements: this.el
    });
    this.activityPage = new ActivityLogPage({
      repo: this.repo,
      elements: this.el,
      onDataRestored: (aliases) => this.handleTrashRestored(aliases)
    });
  }

  async init() {
    try {
      this.bindEvents();
      this.setPage(this.state.page);
      this.aiPage.init();
      this.activityPage.init();
      await this.loadCurrentUser();
      this.setStatus("กำลังโหลดข้อมูล...");
      await this.renderAll();
      await this.refreshStorageStatus();
    } catch (error) {
      console.error(error);
      this.setStatus("โหลดข้อมูลไม่สำเร็จ");
      const requestNote = error?.requestId ? `\nรหัสติดตาม: ${error.requestId}` : "";
      alert(`เกิดข้อผิดพลาด: ${error.message}${requestNote}`);
    }
  }

  bindEvents() {
    for (const button of this.el.navButtons) {
      button.addEventListener("click", () => this.setPage(button.dataset.page));
    }

    this.el.logoutBtn?.addEventListener("click", () => this.handleLogout().catch(this.handleError));

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
    this.el.cmRateBody.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-cm-rate-rowid], button[data-cm-rate-group]");
      if (!button) return;
      const rowId = String(button.dataset.cmRateRowid || "");
      const group = String(button.dataset.cmRateGroup || "");
      this.handleEditCmRate(rowId, group).catch(this.handleError);
    });

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

  async loadCurrentUser() {
    try {
      const response = await fetch(`${AUTH_BASE}/me`, { cache: "no-store" });
      if (response.status === 401) {
        window.location.replace("/login.html");
        return;
      }
      if (!response.ok) return;
      const payload = await response.json();
      const username = payload?.user?.username || "-";
      if (this.el.authUserText) {
        this.el.authUserText.textContent = `ผู้ใช้: ${username}`;
      }
    } catch {
      if (this.el.authUserText) {
        this.el.authUserText.textContent = "ผู้ใช้: -";
      }
    }
  }

  async handleLogout() {
    if (!confirm("ต้องการออกจากระบบใช่หรือไม่?")) return;
    await fetch(`${AUTH_BASE}/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest"
      },
      body: JSON.stringify({})
    }).catch(() => {});
    window.location.replace("/login.html");
  }

  async refreshStorageStatus() {
    const storageInfo = await this.repo.getStorageInfo();
    const storageState = storageInfo.mode === "backend" ? "Backend" : "Local";
    this.setStatus(`ระบบออนไลน์ | แก้ไขได้ | เก็บข้อมูล: ${storageState}`);
  }

  setPage(page) {
    this.state.page = page;
    for (const button of this.el.navButtons) {
      button.classList.toggle("active", button.dataset.page === page);
    }
    for (const section of this.el.pages) {
      section.classList.toggle("show", section.id === `page-${page}`);
    }

    if (page === "logs") {
      this.renderActivity().catch(this.handleError);
    }
    if (page === "ai") {
      this.el.aiInput?.focus();
    }
  }
  handleError = (error) => {
    console.error(error);
    if (error?.authRequired) return;
    if (error?.versionConflict) {
      this.repo.clearTableCache();
      this.renderAll().catch(() => {});
      alert("ข้อมูลมีการแก้ไขจากผู้ใช้อื่น กรุณาตรวจสอบข้อมูลล่าสุดแล้วลองใหม่อีกครั้ง");
      return;
    }
    const base = error?.message || "เกิดข้อผิดพลาดที่ไม่คาดคิด";
    const requestNote = error?.requestId ? `\nรหัสติดตาม: ${error.requestId}` : "";
    alert(`${base}${requestNote}`);
  };
}

Object.assign(LtcApp.prototype, ltcAppRenderMethods, ltcAppActionMethods);

export { LtcApp };
