import { SESSION_UNLOCK_MINUTES } from "./config.js";

class SecurityManager {
  constructor(button, onStateChange, ui = {}) {
    this.button = button;
    this.onStateChange = onStateChange;
    this.hashKey = "ltc_security_pin_sha256";
    this.unlockUntilKey = "ltc_security_unlock_until";
    this.requestPin =
      ui.requestPin ||
      (async () => null);
    this.notify = ui.notify || ((message) => window.alert(message));
  }

  async init() {
    this.refreshUi();
  }

  hasPin() {
    return Boolean(localStorage.getItem(this.hashKey));
  }

  isUnlocked() {
    const unlockUntil = Number(sessionStorage.getItem(this.unlockUntilKey) || 0);
    return unlockUntil > Date.now();
  }

  lock() {
    sessionStorage.removeItem(this.unlockUntilKey);
    this.refreshUi();
  }

  async toggle() {
    if (this.isUnlocked()) {
      this.lock();
      return;
    }
    await this.ensureUnlocked("ปลดล็อกโหมดแก้ไข");
  }

  async ensureUnlocked(actionLabel) {
    if (this.isUnlocked()) return true;

    if (!this.hasPin()) {
      const setupOk = await this.setupPin();
      if (!setupOk) return false;
      this.notify("ตั้ง PIN สำเร็จ ระบบปลดล็อกแล้ว");
      return true;
    }

    const pinResult = await this.requestPin({
      title: "ยืนยันตัวตนผู้ดูแลระบบ",
      hint: `กรอก PIN เพื่อดำเนินการ: ${actionLabel}`,
      confirm: false
    });
    if (!pinResult?.pin) return false;
    const pin = String(pinResult.pin);

    const storedHash = localStorage.getItem(this.hashKey);
    const incomingHash = await this.hash(pin);
    if (storedHash !== incomingHash) {
      this.notify("PIN ไม่ถูกต้อง");
      this.refreshUi();
      return false;
    }

    this.setUnlocked();
    this.refreshUi();
    return true;
  }

  async setupPin() {
    const setupResult = await this.requestPin({
      title: "ตั้งรหัส PIN ระบบความปลอดภัย",
      hint: "ตั้ง PIN อย่างน้อย 6 ตัวอักษร/ตัวเลข",
      confirm: true
    });
    if (!setupResult?.pin || !setupResult?.pinConfirm) return false;

    const first = String(setupResult.pin).trim();
    const second = String(setupResult.pinConfirm).trim();
    if (first.length < 6) {
      this.notify("PIN ต้องยาวอย่างน้อย 6 ตัว");
      return false;
    }
    if (first !== second) {
      this.notify("PIN ไม่ตรงกัน");
      return false;
    }

    localStorage.setItem(this.hashKey, await this.hash(first));
    this.setUnlocked();
    this.refreshUi();
    return true;
  }

  setUnlocked() {
    const unlockUntil = Date.now() + SESSION_UNLOCK_MINUTES * 60 * 1000;
    sessionStorage.setItem(this.unlockUntilKey, String(unlockUntil));
  }

  refreshUi() {
    const unlocked = this.isUnlocked();
    this.button.textContent = unlocked ? "🔓 โหมดแก้ไข: ปลดล็อก" : "🔐 โหมดแก้ไข: ล็อก";
    this.button.classList.toggle("is-unlocked", unlocked);
    if (typeof this.onStateChange === "function") {
      this.onStateChange(unlocked);
    }
  }

  async hash(value) {
    const text = String(value ?? "");
    if (!crypto?.subtle) {
      return btoa(unescape(encodeURIComponent(text)));
    }
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
}

export { SecurityManager };
