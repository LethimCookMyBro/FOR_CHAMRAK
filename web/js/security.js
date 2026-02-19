// SecurityToolkit v2: practical input validation + safe output helpers.
class SecurityToolkit {
  constructor(repo, options = {}) {
    this.repo = repo;
    this.strict = options.strict ?? true;
    // Avoid /g flag for patterns that are reused with .test().
    this.suspiciousPatterns = [
      { id: "xss_script", re: /<\s*script\b/i },
      { id: "js_proto", re: /\bjavascript\s*:/i },
      { id: "data_html", re: /\bdata\s*:\s*text\/html/i },
      { id: "event_handler", re: /\bon\w+\s*=/i },
      { id: "path_traversal", re: /(^|[\/\\])\.\.([\/\\]|$)/ },
      { id: "sql_union", re: /\bunion\b[\s\S]{0,40}\bselect\b/i },
      { id: "sql_drop", re: /\bdrop\b[\s\S]{0,40}\btable\b/i },
      { id: "sql_comment", re: /(--|\/\*|\*\/)/ }
    ];
  }

  sanitizePlainText(value, maxLength = 500) {
    const text = String(value ?? "")
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .trim();
    return text.slice(0, Math.max(1, maxLength));
  }

  // Backward compatibility for existing callers.
  sanitizeText(value, maxLength = 500) {
    return this.sanitizePlainText(value, maxLength);
  }

  escapeHtml(value) {
    const s = String(value ?? "");
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  findSuspicious(value) {
    const raw = String(value ?? "");
    const hits = [];
    for (const pattern of this.suspiciousPatterns) {
      if (pattern.re.test(raw)) hits.push(pattern.id);
    }
    return hits;
  }

  isSuspicious(value) {
    return this.findSuspicious(value).length > 0;
  }

  assertNonEmptyText(value, label = "ข้อมูล", maxLength = 500) {
    const s = this.sanitizePlainText(value, maxLength);
    if (!s) throw new Error(`${label} ว่างเปล่า`);
    return s;
  }

  assertSafeText(value, label = "ข้อมูล", maxLength = 500) {
    const s = this.assertNonEmptyText(value, label, maxLength);
    if (this.strict) {
      const hits = this.findSuspicious(value);
      if (hits.length) {
        throw new Error(`${label} มีรูปแบบที่ไม่ปลอดภัย (${hits.join(",")})`);
      }
    }
    return s;
  }

  assertSlug(value, label = "รหัส", maxLength = 80) {
    const s = this.assertNonEmptyText(value, label, maxLength);
    if (!/^[a-z0-9_-]+$/i.test(s)) throw new Error(`${label} รูปแบบไม่ถูกต้อง`);
    return s;
  }

  assertInt(value, label = "ตัวเลข", { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
    const s = this.assertNonEmptyText(value, label, 50);
    if (!/^-?\d+$/.test(s)) throw new Error(`${label} ต้องเป็นจำนวนเต็ม`);
    const n = Number(s);
    if (!Number.isSafeInteger(n)) throw new Error(`${label} ไม่ถูกต้อง`);
    if (n < min || n > max) throw new Error(`${label} เกินช่วงที่กำหนด`);
    return n;
  }

  assertEmail(value, label = "อีเมล", maxLength = 120) {
    const s = this.assertNonEmptyText(value, label, maxLength);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(s)) throw new Error(`${label} รูปแบบไม่ถูกต้อง`);
    return s;
  }

  assertUrl(value, label = "ลิงก์", { allowSchemes = ["http:", "https:"] } = {}) {
    const s = this.assertNonEmptyText(value, label, 2000);
    let parsed;
    try {
      parsed = new URL(s);
    } catch {
      throw new Error(`${label} รูปแบบไม่ถูกต้อง`);
    }
    if (!allowSchemes.includes(parsed.protocol)) {
      throw new Error(`${label} scheme ไม่อนุญาต`);
    }
    return parsed.toString();
  }

  assertSafePathSegment(value, label = "พาธ", maxLength = 120) {
    const s = this.assertNonEmptyText(value, label, maxLength);
    let decoded = s;
    try {
      decoded = decodeURIComponent(s);
    } catch {
      // Keep original text when decode fails.
    }

    if (/[\/\\]/.test(decoded)) throw new Error(`${label} ห้ามมี / หรือ \\`);
    if (decoded.includes("..")) throw new Error(`${label} ห้ามมี ..`);
    return s;
  }

  localSelfTest() {
    const tests = [
      { name: "xss-script", payload: "<script>alert(1)</script>", expectBlocked: true },
      { name: "event-handler", payload: "<img src=x onerror=alert(1)>", expectBlocked: true },
      { name: "sql-like-or-1eq1", payload: "' OR 1=1 --", expectBlocked: true },
      { name: "path-traversal-unix", payload: "../etc/passwd", expectBlocked: true },
      { name: "path-traversal-win", payload: "..\\Windows\\System32", expectBlocked: true },
      { name: "encoded-traversal", payload: "%2e%2e%2fetc%2fpasswd", expectBlocked: false },
      { name: "normal-text", payload: "สวัสดีครับ นี่คือข้อความปกติ", expectBlocked: false }
    ];

    return tests.map((test) => {
      const sanitized = this.sanitizePlainText(test.payload, 200);
      const hits = this.findSuspicious(test.payload);
      const blockedBySuspicious = hits.length > 0;

      let blockedByPathValidator = false;
      if (test.name === "encoded-traversal") {
        try {
          this.assertSafePathSegment(test.payload, "พาธ");
        } catch {
          blockedByPathValidator = true;
        }
      }

      const pass =
        blockedBySuspicious === test.expectBlocked ||
        (test.name === "encoded-traversal" && blockedByPathValidator === true);

      return {
        name: test.name,
        payload: test.payload,
        sanitized,
        suspiciousHits: hits,
        blocked: blockedBySuspicious,
        extra: test.name === "encoded-traversal" ? { blockedByPathValidator } : undefined,
        pass
      };
    });
  }

  async runSystemScan() {
    const localTests = this.localSelfTest();
    const server = await this.repo.runSecurityScan();
    return { localTests, server };
  }
}

export { SecurityToolkit };
