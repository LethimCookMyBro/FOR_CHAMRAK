const STATUS_TEXT = {
  available: "พบเวอร์ชันใหม่ กำลังเตรียมดาวน์โหลด",
  checking: "กำลังตรวจสอบอัปเดต",
  dev: "ระบบอัปเดตจะพร้อมใช้หลัง build เป็นโปรแกรม .exe",
  downloaded: "อัปเดตดาวน์โหลดเสร็จแล้ว พร้อมติดตั้ง",
  downloading: "กำลังดาวน์โหลดอัปเดต",
  error: "ตรวจสอบอัปเดตไม่สำเร็จ",
  idle: "พร้อมตรวจสอบอัปเดต",
  "not-available": "โปรแกรมเป็นเวอร์ชันล่าสุดแล้ว",
  unconfigured: "ยังไม่ได้ตั้งค่าแหล่งอัปเดต"
};

function asPercent(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function normalizeNotes(notes) {
  if (!Array.isArray(notes)) return [];
  return notes.map((item) => String(item || "").trim()).filter(Boolean);
}

export class UpdateController {
  constructor(elements) {
    this.el = elements;
    this.api = window.ltcUpdater || null;
    this.state = null;
  }

  init() {
    if (!this.el.updateButton || !this.api) {
      this.hide();
      return;
    }

    this.hide();
    this.el.updateButton.addEventListener("click", () => this.handleUpdateClick());
    this.el.updateInstallBtn?.addEventListener("click", () => this.installUpdate());
    this.el.updateCloseBtn?.addEventListener("click", () => this.el.updateDialog?.close());

    this.api.onEvent((state) => this.render(state));
    this.api.getState()
      .then((state) => {
        this.render(state);
        if (state?.enabled && !state.available && !state.downloaded) {
          void this.checkSilently();
        }
      })
      .catch((error) => this.render({
        error: error?.message || "โหลดสถานะอัปเดตไม่สำเร็จ",
        status: "error"
      }));
  }

  hide() {
    if (this.el.updateButton) {
      this.el.updateButton.hidden = true;
    }
  }

  async handleUpdateClick() {
    this.openDialog();
    if (this.state?.busy) return;

    try {
      if (this.state?.available && !this.state.downloaded) {
        const downloaded = await this.api.downloadUpdate();
        this.render(downloaded);
        return;
      }

      const checked = await this.api.checkForUpdates();
      this.render(checked);
      if (checked?.available && !checked?.downloaded) {
        const downloaded = await this.api.downloadUpdate();
        this.render(downloaded);
      }
    } catch (error) {
      this.render({
        error: error?.message || "ตรวจสอบอัปเดตไม่สำเร็จ",
        status: "error"
      });
    }
  }

  async checkSilently() {
    try {
      const checked = await this.api.checkForUpdates();
      this.render(checked);
    } catch (error) {
      this.render({
        error: error?.message || "ตรวจสอบอัปเดตไม่สำเร็จ",
        status: "error"
      });
    }
  }

  async installUpdate() {
    try {
      await this.api.installUpdate();
    } catch (error) {
      this.render({
        ...this.state,
        error: error?.message || "ติดตั้งอัปเดตไม่สำเร็จ",
        status: "error"
      });
    }
  }

  openDialog() {
    if (!this.el.updateDialog?.open) {
      this.el.updateDialog?.showModal();
    }
  }

  render(nextState) {
    this.state = {
      ...this.state,
      ...nextState
    };

    const status = this.state.status || "idle";
    const progress = asPercent(this.state.progress);
    const notes = normalizeNotes(this.state.notes);
    const text = this.state.error || STATUS_TEXT[status] || STATUS_TEXT.idle;
    const shouldShowButton = Boolean(this.state.available || this.state.downloaded || status === "downloading");

    if (this.el.updateButton) {
      this.el.updateButton.hidden = !shouldShowButton;
    }

    this.el.updateButton?.classList.toggle("is-busy", Boolean(this.state.busy));
    this.el.updateButton?.classList.toggle("has-update", Boolean(this.state.available));
    this.el.updateButton?.classList.toggle("is-ready", Boolean(this.state.downloaded));

    if (this.el.updateDialogTitle) {
      this.el.updateDialogTitle.textContent = this.state.downloaded ? "อัปเดตเสร็จแล้ว" : "อัปเดตโปรแกรม";
    }
    if (this.el.updateStatusText) {
      this.el.updateStatusText.textContent = text;
    }
    if (this.el.updateVersionText) {
      this.el.updateVersionText.textContent = this.state.version ? `เวอร์ชัน: ${this.state.version}` : "";
    }
    if (this.el.updateProgressBar) {
      this.el.updateProgressBar.style.width = `${progress}%`;
    }
    if (this.el.updateProgressText) {
      this.el.updateProgressText.textContent = status === "downloading" ? `${progress}%` : "";
    }
    if (this.el.updateInstallBtn) {
      this.el.updateInstallBtn.hidden = !this.state.downloaded;
    }

    this.renderNotes(notes);
  }

  renderNotes(notes) {
    if (!this.el.updateNotes) return;

    this.el.updateNotes.replaceChildren();
    if (!notes.length) {
      const item = document.createElement("li");
      item.textContent = "ยังไม่มีรายละเอียดการเปลี่ยนแปลงจากไฟล์อัปเดต";
      this.el.updateNotes.append(item);
      return;
    }

    for (const note of notes) {
      const item = document.createElement("li");
      item.textContent = note;
      this.el.updateNotes.append(item);
    }
  }
}
