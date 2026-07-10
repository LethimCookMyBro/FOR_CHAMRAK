import { API_BASE, DATA_ROOT, STORAGE_PREFIX, VISIT_STATUS_OPTIONS } from "./config.js";
import { Format } from "./utils.js";
import { DataRepository } from "./data-repository.js";
import { DomainService } from "./domain-service.js";
import { AppHelpers } from "./app-helpers.js";
import { EntityDialogService } from "./entity-dialog-service.js";
import { SecurityToolkit } from "./security.js";
import { ActivityLogPage } from "./activity-log-page.js";
import { UpdateController } from "./update-ui.js";
import { ImageLightbox } from "./image-lightbox.js";
import { ltcAppRenderMethods } from "./ltc-app-render-methods.js";
import { ltcAppActionMethods } from "./ltc-app-action-methods.js";

class LtcApp {
  constructor() {
    this.repo = new DataRepository(API_BASE, DATA_ROOT, STORAGE_PREFIX);
    this.domain = new DomainService(this.repo);
    this.helpers = new AppHelpers();
    this.renderTimers = new Map();

    this.state = {
      page: "overview",
      queries: {
        dependents: "",
        cg: "",
        visits: "",
        visitStatus: "",
        visitMonthFrom: "",
        visitMonthTo: "",
        supplyIssues: ""
      },
      selected: {
        dependents: null,
        deceased: null,
        cg: null,
        cm: null,
        visits: null,
        supplies: null,
        supplyIssues: null,
        finance: null,
        units: null
      },
      checked: {
        dependents: new Set(),
        cg: new Set(),
        cm: new Set(),
        visits: new Set(),
        supplies: new Set(),
        supplyIssues: new Set(),
        finance: new Set(),
        units: new Set()
      }
    };

    this.el = {
      navButtons: [...document.querySelectorAll(".nav-btn")],
      pages: [...document.querySelectorAll(".page")],

      statDependents: document.getElementById("statDependents"),
      statCg: document.getElementById("statCg"),
      statCm: document.getElementById("statCm"),
      statHigh: document.getElementById("statHigh"),
      statUnits: document.getElementById("statUnits"),
      overviewCareRows: document.getElementById("overviewCareRows"),
      overviewCoverageRows: document.getElementById("overviewCoverageRows"),
      overviewCpAlertRows: document.getElementById("overviewCpAlertRows"),
      overviewIncomeTotal: document.getElementById("overviewIncomeTotal"),
      overviewExpenseTotal: document.getElementById("overviewExpenseTotal"),
      overviewNetTotal: document.getElementById("overviewNetTotal"),
      overviewStockBody: document.getElementById("overviewStockBody"),

      dependentsSearch: document.getElementById("dependentsSearch"),
      dependentsBody: document.getElementById("dependentsBody"),
      dependentsAddBtn: document.getElementById("dependentsAddBtn"),
      dependentsEditBtn: document.getElementById("dependentsEditBtn"),
      dependentsDeleteBtn: document.getElementById("dependentsDeleteBtn"),
      dependentsMarkDeceasedBtn: document.getElementById("dependentsMarkDeceasedBtn"),
      dependentsDeleteBatchBtn: document.getElementById("dependentsDeleteBatchBtn"),
      dependentsSelectAll: document.getElementById("dependentsSelectAll"),
      deceasedBody: document.getElementById("deceasedBody"),
      deceasedRestoreBtn: document.getElementById("deceasedRestoreBtn"),

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

      visitSearch: document.getElementById("visitSearch"),
      visitMonthFromFilter: document.getElementById("visitMonthFromFilter"),
      visitMonthToFilter: document.getElementById("visitMonthToFilter"),
      visitStatusFilter: document.getElementById("visitStatusFilter"),
      visitStatusText: document.getElementById("visitStatusText"),
      visitBody: document.getElementById("visitBody"),
      visitAddBtn: document.getElementById("visitAddBtn"),
      visitEditBtn: document.getElementById("visitEditBtn"),
      visitDeleteBtn: document.getElementById("visitDeleteBtn"),
      visitDeleteBatchBtn: document.getElementById("visitDeleteBatchBtn"),
      visitSelectAll: document.getElementById("visitSelectAll"),
      visitPersonMonthRows: document.getElementById("visitPersonMonthRows"),
      visitCgWorkloadRows: document.getElementById("visitCgWorkloadRows"),
      visitCmWorkloadRows: document.getElementById("visitCmWorkloadRows"),
      visitAreaReportRows: document.getElementById("visitAreaReportRows"),
      visitDependencyReportRows: document.getElementById("visitDependencyReportRows"),
      visitCoverageReportRows: document.getElementById("visitCoverageReportRows"),

      suppliesBody: document.getElementById("suppliesBody"),
      supplyAddProductBtn: document.getElementById("supplyAddProductBtn"),
      supplyEditProductBtn: document.getElementById("supplyEditProductBtn"),
      supplyDeleteProductBtn: document.getElementById("supplyDeleteProductBtn"),
      supplyDeleteBatchBtn: document.getElementById("supplyDeleteBatchBtn"),
      supplyInBtn: document.getElementById("supplyInBtn"),
      supplyOutBtn: document.getElementById("supplyOutBtn"),
      suppliesSelectAll: document.getElementById("suppliesSelectAll"),
      suppliesIssueSearch: document.getElementById("suppliesIssueSearch"),
      suppliesIssueSummary: document.getElementById("suppliesIssueSummary"),
      suppliesIssueBody: document.getElementById("suppliesIssueBody"),
      supplyIssueEditBtn: document.getElementById("supplyIssueEditBtn"),
      supplyIssueDeleteBtn: document.getElementById("supplyIssueDeleteBtn"),
      supplyIssueDeleteBatchBtn: document.getElementById("supplyIssueDeleteBatchBtn"),
      suppliesIssueSelectAll: document.getElementById("suppliesIssueSelectAll"),

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
      entitySubmitBtn: document.getElementById("entitySubmitBtn"),

      updateControl: document.getElementById("updateControl"),
      updateButton: document.getElementById("updateCheckBtn"),
      updateManualControl: document.getElementById("updateManualControl"),
      updateManualButton: document.getElementById("updateManualBtn"),
      updateDialog: document.getElementById("updateDialog"),
      updateDialogTitle: document.getElementById("updateDialogTitle"),
      updateStatusText: document.getElementById("updateStatusText"),
      updateVersionText: document.getElementById("updateVersionText"),
      updateProgressBar: document.getElementById("updateProgressBar"),
      updateProgressText: document.getElementById("updateProgressText"),
      updateNotes: document.getElementById("updateNotes"),
      updateDownloadBtn: document.getElementById("updateDownloadBtn"),
      updateInstallBtn: document.getElementById("updateInstallBtn"),
      updateCloseBtn: document.getElementById("updateCloseBtn"),

      imageLightbox: document.getElementById("imageLightbox"),
      imageLightboxImg: document.getElementById("imageLightboxImg"),
      imageLightboxCaption: document.getElementById("imageLightboxCaption"),
      imageLightboxError: document.getElementById("imageLightboxError"),
      imageLightboxClose: document.getElementById("imageLightboxClose")
    };

    this.dialogs = new EntityDialogService(this.el, this.repo, this.domain, this.helpers);
    this.securityToolkit = new SecurityToolkit(this.repo);
    this.updateController = new UpdateController(this.el);
    this.imageLightbox = new ImageLightbox({
      overlay: this.el.imageLightbox,
      image: this.el.imageLightboxImg,
      caption: this.el.imageLightboxCaption,
      errorText: this.el.imageLightboxError,
      closeButton: this.el.imageLightboxClose
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
      this.setupVisitFilters();
      this.setPage(this.state.page);
      this.activityPage.init();
      this.updateController.init();
      this.imageLightbox.init();
      await this.renderAll();
    } catch (error) {
      console.error(error);
      const requestNote = error?.requestId ? `\nรหัสติดตาม: ${error.requestId}` : "";
      alert(`เกิดข้อผิดพลาด: ${error.message}${requestNote}`);
    }
  }

  bindEvents() {
    for (const button of this.el.navButtons) {
      button.addEventListener("click", () => this.setPage(button.dataset.page));
    }

    this.el.dependentsSearch.addEventListener("input", (event) => {
      this.state.queries.dependents = Format.toText(event.target.value).toLowerCase();
      this.scheduleRender("dependents", () => this.renderDependents());
    });

    this.el.cgSearch.addEventListener("input", (event) => {
      this.state.queries.cg = Format.toText(event.target.value).toLowerCase();
      this.scheduleRender("cg", () => this.renderCg());
    });
    this.el.visitSearch?.addEventListener("input", (event) => {
      this.state.queries.visits = Format.toText(event.target.value).toLowerCase();
      this.scheduleRender("visits", () => this.renderVisits());
    });
    this.el.visitMonthFromFilter?.addEventListener("change", (event) => {
      this.state.queries.visitMonthFrom = Format.toText(event.target.value);
      this.scheduleRender("visits", () => this.renderVisits());
    });
    this.el.visitMonthToFilter?.addEventListener("change", (event) => {
      this.state.queries.visitMonthTo = Format.toText(event.target.value);
      this.scheduleRender("visits", () => this.renderVisits());
    });
    this.el.visitStatusFilter?.addEventListener("change", (event) => {
      this.state.queries.visitStatus = Format.toText(event.target.value);
      this.scheduleRender("visits", () => this.renderVisits());
    });
    this.el.suppliesIssueSearch?.addEventListener("input", (event) => {
      this.state.queries.supplyIssues = Format.toText(event.target.value).toLowerCase();
      this.scheduleRender("supplyIssues", () => this.renderSupplies());
    });

    this.bindSelectableTable(this.el.dependentsBody, "dependents", this.el.dependentsSelectAll);
    this.bindSelectableTable(this.el.deceasedBody, "deceased");
    this.bindSelectableTable(this.el.cgBody, "cg", this.el.cgSelectAll);
    this.bindSelectableTable(this.el.cmBody, "cm", this.el.cmSelectAll);
    this.bindSelectableTable(this.el.visitBody, "visits", this.el.visitSelectAll);
    this.bindSelectableTable(this.el.suppliesBody, "supplies", this.el.suppliesSelectAll);
    this.bindSelectableTable(this.el.suppliesIssueBody, "supplyIssues", this.el.suppliesIssueSelectAll);
    this.bindSelectableTable(this.el.financeBody, "finance", this.el.financeSelectAll);
    this.bindSelectableTable(this.el.unitBody, "units", this.el.unitsSelectAll);

    this.el.dependentsAddBtn.addEventListener("click", () => this.handleAddDependent().catch(this.handleError));
    this.el.dependentsEditBtn.addEventListener("click", () => this.handleEditDependent().catch(this.handleError));
    this.el.dependentsDeleteBtn.addEventListener("click", () => this.handleDeleteDependent().catch(this.handleError));
    this.el.dependentsMarkDeceasedBtn.addEventListener("click", () => this.handleMarkDependentDeceased().catch(this.handleError));
    this.el.dependentsDeleteBatchBtn.addEventListener("click", () => this.handleDeleteDependentBatch().catch(this.handleError));
    this.el.deceasedRestoreBtn.addEventListener("click", () => this.handleRestoreDeceasedDependent().catch(this.handleError));

    this.el.cgAddBtn.addEventListener("click", () => this.handleAddCg().catch(this.handleError));
    this.el.cgEditBtn.addEventListener("click", () => this.handleEditCg().catch(this.handleError));
    this.el.cgDeleteBtn.addEventListener("click", () => this.handleDeleteCg().catch(this.handleError));
    this.el.cgDeleteBatchBtn.addEventListener("click", () => this.handleDeleteCgBatch().catch(this.handleError));

    this.el.cmAddBtn.addEventListener("click", () => this.handleAddCm().catch(this.handleError));
    this.el.cmEditBtn.addEventListener("click", () => this.handleEditCm().catch(this.handleError));
    this.el.cmDeleteBtn.addEventListener("click", () => this.handleDeleteCm().catch(this.handleError));
    this.el.cmDeleteBatchBtn.addEventListener("click", () => this.handleDeleteCmBatch().catch(this.handleError));

    this.el.visitAddBtn?.addEventListener("click", () => this.handleAddVisit().catch(this.handleError));
    this.el.visitEditBtn?.addEventListener("click", () => this.handleEditVisit().catch(this.handleError));
    this.el.visitDeleteBtn?.addEventListener("click", () => this.handleDeleteVisit().catch(this.handleError));
    this.el.visitDeleteBatchBtn?.addEventListener("click", () => this.handleDeleteVisitBatch().catch(this.handleError));
    this.el.cmRateBody.addEventListener("click", (event) => {
      const trigger = event.target.closest(
        "button[data-cm-rate-rowid], button[data-cm-rate-group], tr[data-cm-rate-rowid], tr[data-cm-rate-group]"
      );
      if (!trigger) return;
      const rowId = String(trigger.dataset.cmRateRowid || "");
      const group = String(trigger.dataset.cmRateGroup || "");
      if (!rowId && !group) return;
      this.handleEditCmRate(rowId, group).catch(this.handleError);
    });

    this.el.supplyAddProductBtn.addEventListener("click", () => this.handleAddProduct().catch(this.handleError));
    this.el.supplyEditProductBtn.addEventListener("click", () => this.handleEditProduct().catch(this.handleError));
    this.el.supplyDeleteProductBtn.addEventListener("click", () => this.handleDeleteProduct().catch(this.handleError));
    this.el.supplyDeleteBatchBtn.addEventListener("click", () => this.handleDeleteProductBatch().catch(this.handleError));
    this.el.supplyInBtn.addEventListener("click", () => this.handleSupplyIn().catch(this.handleError));
    this.el.supplyOutBtn.addEventListener("click", () => this.handleSupplyOut().catch(this.handleError));
    this.el.supplyIssueEditBtn?.addEventListener("click", () => this.handleEditSupplyIssue().catch(this.handleError));
    this.el.supplyIssueDeleteBtn?.addEventListener("click", () => this.handleDeleteSupplyIssue().catch(this.handleError));
    this.el.supplyIssueDeleteBatchBtn?.addEventListener("click", () => this.handleDeleteSupplyIssueBatch().catch(this.handleError));

    this.el.financeAddBtn.addEventListener("click", () => this.handleAddFinance().catch(this.handleError));
    this.el.financeEditBtn.addEventListener("click", () => this.handleEditFinance().catch(this.handleError));
    this.el.financeDeleteBtn.addEventListener("click", () => this.handleDeleteFinance().catch(this.handleError));
    this.el.financeDeleteBatchBtn.addEventListener("click", () => this.handleDeleteFinanceBatch().catch(this.handleError));

    this.el.unitAddBtn.addEventListener("click", () => this.handleAddUnit().catch(this.handleError));
    this.el.unitEditBtn.addEventListener("click", () => this.handleEditUnit().catch(this.handleError));
    this.el.unitDeleteBtn.addEventListener("click", () => this.handleDeleteUnit().catch(this.handleError));
    this.el.unitDeleteBatchBtn.addEventListener("click", () => this.handleDeleteUnitBatch().catch(this.handleError));
  }

  // Builds the visit filter bar. Status options come from the shared
  // VISIT_STATUS_OPTIONS (Thai label, internal value). The month pickers replace
  // the native <input type="month"> (which renders ค.ศ. and can't be switched to
  // พ.ศ.) with month + Buddhist-year <select>s; the hidden input keeps its
  // Gregorian "YYYY-MM" value so the range filter logic stays unchanged.
  setupVisitFilters() {
    if (this.el.visitStatusFilter) {
      for (const option of VISIT_STATUS_OPTIONS) {
        const optionEl = document.createElement("option");
        optionEl.value = option.value;
        optionEl.textContent = option.label;
        this.el.visitStatusFilter.appendChild(optionEl);
      }
    }

    const monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    const currentThaiYear = new Date().getFullYear() + 543;

    const build = (hidden, label) => {
      if (!hidden || !hidden.parentNode) return;
      const wrap = document.createElement("div");
      wrap.className = "thai-month-filter";

      const month = document.createElement("select");
      const year = document.createElement("select");
      month.className = "filter-control";
      year.className = "filter-control";
      month.setAttribute("aria-label", `${label} (เดือน)`);
      year.setAttribute("aria-label", `${label} (ปี พ.ศ.)`);

      const emptyOption = (text) => {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = text;
        return option;
      };
      month.appendChild(emptyOption("ทุกเดือน"));
      year.appendChild(emptyOption("ทุกปี"));

      for (let i = 1; i <= 12; i += 1) {
        const option = document.createElement("option");
        option.value = String(i).padStart(2, "0");
        option.textContent = monthNames[i - 1];
        month.appendChild(option);
      }
      // ponytail: recent 16-year window; widen if old visit records need filtering.
      for (let beYear = currentThaiYear + 1; beYear >= currentThaiYear - 15; beYear -= 1) {
        const option = document.createElement("option");
        option.value = String(beYear - 543); // stored value stays Gregorian
        option.textContent = String(beYear); // shown as พ.ศ.
        year.appendChild(option);
      }

      const sync = () => {
        hidden.value = year.value && month.value ? `${year.value}-${month.value}` : "";
        hidden.dispatchEvent(new Event("change", { bubbles: true }));
      };
      month.addEventListener("change", sync);
      year.addEventListener("change", sync);

      hidden.parentNode.insertBefore(wrap, hidden);
      wrap.append(month, year);
    };

    build(this.el.visitMonthFromFilter, "เดือนที่เยี่ยม ตั้งแต่");
    build(this.el.visitMonthToFilter, "เดือนที่เยี่ยม ถึง");
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

    tbody.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.target.closest("input.row-check")) return;
      const tr = event.target.closest("tr[data-rowid]");
      if (!tr) return;
      event.preventDefault();
      this.state.selected[key] = tr.dataset.rowid;
      this.paintSelection(tbody, this.state.selected[key]);
    });
  }

  scheduleRender(key, render, delay = 120) {
    const timer = this.renderTimers.get(key);
    if (timer) clearTimeout(timer);

    const nextTimer = setTimeout(() => {
      this.renderTimers.delete(key);
      Promise.resolve(render()).catch(this.handleError);
    }, delay);
    this.renderTimers.set(key, nextTimer);
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

  setPage(page) {
    this.state.page = page;
    for (const button of this.el.navButtons) {
      button.classList.toggle("active", button.dataset.page === page);
    }
    for (const section of this.el.pages) {
      section.classList.toggle("show", section.id === `page-${page}`);
    }

    this.renderCurrentPage().catch(this.handleError);
  }

  captureActiveScrollState() {
    const activePage = this.el.pages.find((section) => section.classList.contains("show"));
    if (!activePage) return [];

    return [activePage, ...activePage.querySelectorAll("*")]
      .filter((element) => element.scrollTop > 0)
      .map((element) => [element, element.scrollTop, element.scrollLeft]);
  }

  restoreScrollState(scrollState) {
    for (const [element, top, left] of scrollState) {
      element.scrollTop = top;
      element.scrollLeft = left;
    }
  }

  async withPreservedActiveScroll(render) {
    const scrollState = this.captureActiveScrollState();
    await render();
    this.restoreScrollState(scrollState);
  }

  handleError = (error) => {
    console.error(error);
    if (error?.versionConflict) {
      this.repo.clearTableCache();
      this.domain.clearInventoryCache();
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
