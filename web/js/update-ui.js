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

const TOOLTIP_AVAILABLE = "กดเพื่ออัปเดต";
const TOOLTIP_DOWNLOADING = "กำลังดาวน์โหลดอัปเดต";
const TOOLTIP_READY = "พร้อมติดตั้งอัปเดต";
const TOOLTIP_MANUAL_CHECK = "ตรวจสอบอัปเดต";
const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const UPDATE_ACTION_DOWNLOAD_TEXT = "ดาวน์โหลดและอัปเดต";
const UPDATE_ACTION_INSTALL_TEXT = "ติดตั้งตอนนี้";

function tooltipForState(state, status) {
  if (state?.downloaded) return TOOLTIP_READY;
  if (status === "downloading") return TOOLTIP_DOWNLOADING;
  return TOOLTIP_AVAILABLE;
}

function asPercent(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function normalizeNotes(notes) {
  if (!Array.isArray(notes)) return [];
  return notes.map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizeState(previousState, nextState) {
  const state = {
    ...previousState,
    ...nextState
  };
  const status = String(state.status || "idle");

  if (!state.enabled || status === "not-available" || status === "error" || status === "idle") {
    state.available = false;
    state.downloaded = false;
  } else if (status === "downloaded") {
    state.available = true;
    state.downloaded = true;
  } else if (status === "available") {
    state.available = true;
    state.downloaded = false;
  } else if (status === "downloading") {
    state.available = true;
    state.downloaded = false;
  }

  if (!state.available && !state.downloaded && status !== "downloading") {
    state.progress = 0;
  }

  return state;
}

export class UpdateController {
  constructor(elements) {
    this.el = elements;
    this.api = window.ltcUpdater || null;
    this.state = null;
    this.autoCheckTimer = null;
  }

  init() {
    if ((!this.el.updateButton && !this.el.updateManualButton) || !this.api) {
      this.hide();
      return;
    }

    this.hide();
    this.el.updateButton?.addEventListener("click", () => this.handleUpdateClick());
    this.el.updateManualButton?.addEventListener("click", () => this.handleManualCheck());
    this.el.updateDownloadBtn?.addEventListener("click", () => this.handlePrimaryUpdateAction());
    this.el.updateCloseBtn?.addEventListener("click", () => this.el.updateDialog?.close());

    this.api.onEvent((state) => this.render(state));
    this.api.getState()
      .then((state) => {
        this.render(state);
        if (state?.enabled && !state.available && !state.downloaded) {
          void this.checkSilently();
          this.startAutoCheck();
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
    // Hide the whole control so its hover tooltip cannot show when there is no update.
    if (this.el.updateControl) {
      this.el.updateControl.hidden = true;
    }
    if (this.el.updateManualButton) {
      this.el.updateManualButton.hidden = true;
    }
    if (this.el.updateManualControl) {
      this.el.updateManualControl.hidden = true;
    }
  }

  startAutoCheck() {
    if (this.autoCheckTimer || !this.api) return;
    const setTimer = window.setInterval || globalThis.setInterval;
    if (typeof setTimer !== "function") return;
    this.autoCheckTimer = setTimer(() => {
      if (!this.state?.enabled || this.state?.busy || this.state?.downloaded) return;
      void this.checkSilently();
    }, AUTO_CHECK_INTERVAL_MS);
    this.autoCheckTimer?.unref?.();
  }

  async handleManualCheck() {
    this.openDialog();
    if (this.state?.busy) return;

    try {
      const checked = await this.api.checkForUpdates();
      this.render(checked);
    } catch (error) {
      this.render({
        ...this.state,
        error: error?.message || "ตรวจสอบอัปเดตไม่สำเร็จ",
        status: "error"
      });
    }
  }

  async handleUpdateClick() {
    this.openDialog();
    if (this.state?.busy) return;

    try {
      if (this.state?.available || this.state?.downloaded) return;

      const checked = await this.api.checkForUpdates();
      this.render(checked);
    } catch (error) {
      this.render({
        error: error?.message || "ตรวจสอบอัปเดตไม่สำเร็จ",
        status: "error"
      });
    }
  }

  async downloadAvailableUpdate() {
    if (this.state?.busy || this.state?.downloaded) return;

    try {
      const state = this.state?.available ? this.state : await this.api.checkForUpdates();
      this.render(state);
      if (!state?.available || state?.downloaded) return;

      const downloaded = await this.api.downloadUpdate();
      this.render(downloaded);
    } catch (error) {
      this.render({
        ...this.state,
        error: error?.message || "ดาวน์โหลดอัปเดตไม่สำเร็จ",
        status: "error"
      });
    }
  }

  async handlePrimaryUpdateAction() {
    if (this.state?.downloaded) {
      await this.installUpdate();
      return;
    }

    await this.downloadAvailableUpdate();
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
    this.state = normalizeState(this.state, nextState);

    const status = this.state.status || "idle";
    const progress = asPercent(this.state.progress);
    const notes = normalizeNotes(this.state.notes);
    const text = this.state.error || STATUS_TEXT[status] || STATUS_TEXT.idle;
    const shouldShowButton = Boolean(this.state.available || this.state.downloaded || status === "downloading");

    if (this.el.updateButton) {
      this.el.updateButton.hidden = !shouldShowButton;
    }

    // The tooltip-bearing wrapper must disappear entirely when there is no real
    // update, otherwise its hover tooltip ("กดเพื่ออัปเดต") still shows. When an
    // update exists, keep the tooltip text honest about the current state.
    if (this.el.updateControl) {
      this.el.updateControl.hidden = !shouldShowButton;
      if (shouldShowButton) {
        const tip = tooltipForState(this.state, status);
        this.el.updateControl.setAttribute("data-tooltip", tip);
        if (this.el.updateButton) {
          this.el.updateButton.title = tip;
          this.el.updateButton.setAttribute("aria-label", tip);
        }
      }
    }

    const shouldShowManualButton = Boolean(this.state.enabled);
    if (this.el.updateManualButton) {
      this.el.updateManualButton.hidden = !shouldShowManualButton;
      this.el.updateManualButton.title = TOOLTIP_MANUAL_CHECK;
      this.el.updateManualButton.setAttribute("aria-label", TOOLTIP_MANUAL_CHECK);
    }
    if (this.el.updateManualControl) {
      this.el.updateManualControl.hidden = !shouldShowManualButton;
      this.el.updateManualControl.setAttribute("data-tooltip", TOOLTIP_MANUAL_CHECK);
    }

    this.el.updateButton?.classList.toggle("is-busy", Boolean(this.state.busy));
    this.el.updateButton?.classList.toggle("has-update", Boolean(this.state.available));
    this.el.updateButton?.classList.toggle("is-ready", Boolean(this.state.downloaded));
    this.el.updateManualButton?.classList.toggle("is-busy", Boolean(this.state.busy));

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
    if (this.el.updateDownloadBtn) {
      const canDownload = Boolean(this.state.available && !this.state.downloaded && !this.state.busy);
      const canInstall = Boolean(this.state.downloaded);
      this.el.updateDownloadBtn.hidden = !(canDownload || canInstall);
      this.el.updateDownloadBtn.textContent = canInstall ? UPDATE_ACTION_INSTALL_TEXT : UPDATE_ACTION_DOWNLOAD_TEXT;
    }
    if (this.el.updateInstallBtn) {
      this.el.updateInstallBtn.hidden = true;
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
