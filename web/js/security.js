class SecurityToolkit {
  constructor(repo) {
    this.repo = repo;
    this.patterns = [
      /<script/gi,
      /javascript:/gi,
      /onerror\s*=/gi,
      /onload\s*=/gi,
      /\.\.\//g,
      /drop\s+table/gi,
      /union\s+select/gi
    ];
  }

  sanitizeText(value, maxLength = 500) {
    const text = String(value || "")
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .replace(/[<>]/g, "")
      .trim();
    return text.slice(0, Math.max(1, maxLength));
  }

  isSuspicious(value) {
    const text = String(value || "");
    return this.patterns.some((pattern) => pattern.test(text));
  }

  assertSafeText(value, label = "ข้อมูล", maxLength = 500) {
    const sanitized = this.sanitizeText(value, maxLength);
    if (!sanitized) {
      throw new Error(`${label} ว่างเปล่า`);
    }
    if (this.isSuspicious(value)) {
      throw new Error(`${label} มีรูปแบบที่ไม่ปลอดภัย`);
    }
    return sanitized;
  }

  localSelfTest() {
    const cases = [
      { name: "xss-script", payload: "<script>alert(1)</script>" },
      { name: "event-handler", payload: "<img src=x onerror=alert(1)>" },
      { name: "sql-like", payload: "' OR 1=1 --" },
      { name: "path-traversal", payload: "../etc/passwd" }
    ];

    return cases.map((testCase) => {
      const sanitized = this.sanitizeText(testCase.payload, 200);
      const blocked = this.isSuspicious(testCase.payload);
      return {
        name: testCase.name,
        payload: testCase.payload,
        sanitized,
        blocked,
        pass: blocked && !sanitized.includes("<script")
      };
    });
  }

  async runSystemScan() {
    const localTests = this.localSelfTest();
    const server = await this.repo.runSecurityScan();
    return {
      localTests,
      server
    };
  }
}

export { SecurityToolkit };
