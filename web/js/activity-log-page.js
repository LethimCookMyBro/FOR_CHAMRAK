import { Format } from "./utils.js";

class ActivityLogPage {
  constructor(config) {
    this.repo = config.repo;
    this.el = config.elements;
    this.onDataRestored = typeof config.onDataRestored === "function" ? config.onDataRestored : null;
    this.trashSelected = new Set();
  }

  init() {
    this.el.trashRestoreBtn?.addEventListener("click", () => this.restoreSelected().catch(this.handleError));
    this.el.trashPurgeBtn?.addEventListener("click", () => this.purgeExpired().catch(this.handleError));

    this.el.trashBody?.addEventListener("change", (event) => {
      const checkbox = event.target.closest("input[data-trash-id]");
      if (!checkbox) return;
      const trashId = String(checkbox.dataset.trashId || "");
      if (!trashId) return;

      if (checkbox.checked) this.trashSelected.add(trashId);
      else this.trashSelected.delete(trashId);

      this.syncTrashSelectionStatus();
    });
  }

  async refreshAll() {
    await this.loadTrash();
  }

  async loadTrash() {
    const payload = await this.repo.listTrash({ includeRestored: false });
    const rows = Array.isArray(payload?.items) ? payload.items : [];
    this.trashSelected.clear();

    if (this.el.trashSummary) {
      this.el.trashSummary.textContent = `รายการที่กู้คืนได้ ${Format.number(rows.length)} รายการ`;
    }

    this.el.trashBody.innerHTML = rows.length
      ? rows
          .map(
            (row) => `
              <tr>
                <td class="check-col"><input type="checkbox" class="row-check" data-trash-id="${Format.escapeHtml(row.trashId)}"></td>
                <td><span class="unit-badge">${Format.escapeHtml(row.alias || "-")}</span></td>
                <td>${Format.escapeHtml(row.preview || "-")}</td>
                <td>${Format.escapeHtml(Format.formatDateCompact(row.deletedAt))}</td>
                <td>${Format.escapeHtml(row.deletedBy || "-")}</td>
                <td><span class="tag ${row.daysLeft <= 5 ? "tag-danger" : "tag-warn"}">${Format.number(row.daysLeft)} วัน</span></td>
              </tr>
            `
          )
          .join("")
      : `<tr><td colspan="6" class="empty-row">ไม่มีข้อมูลที่รอกู้คืน</td></tr>`;

    this.syncTrashSelectionStatus();
  }

  syncTrashSelectionStatus() {
    if (!this.el.trashRestoreBtn) return;
    this.el.trashRestoreBtn.disabled = this.trashSelected.size === 0;
    this.el.trashRestoreBtn.textContent =
      this.trashSelected.size > 0 ? `กู้คืนข้อมูลที่เลือก (${this.trashSelected.size})` : "กู้คืนข้อมูลที่เลือก";
  }

  async restoreSelected() {
    const ids = [...this.trashSelected];
    if (!ids.length) throw new Error("กรุณาเลือกรายการที่ต้องการกู้คืน");
    if (!confirm(`ยืนยันการกู้คืนข้อมูล ${ids.length} รายการ?`)) return;

    const payload = await this.repo.restoreTrash(ids);

    if (payload.restored > 0 && this.onDataRestored) {
      await this.onDataRestored(payload.restoredAliases || []);
    }

    alert(`กู้คืนสำเร็จ ${payload.restored} รายการ (ข้าม ${payload.skipped})`);
    await this.loadTrash();
  }

  async purgeExpired() {
    const payload = await this.repo.purgeExpiredTrash();
    alert(`ลบข้อมูลหมดอายุแล้ว ${payload.removed} รายการ`);
    await this.loadTrash();
  }

  handleError = (error) => {
    console.error(error);
    alert(error?.message || "เกิดข้อผิดพลาดในหน้ากู้คืนข้อมูล");
  };
}

export { ActivityLogPage };
