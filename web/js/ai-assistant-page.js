import { Format } from "./utils.js";

class AiAssistantPage {
  constructor(config) {
    this.repo = config.repo;
    this.security = config.security;
    this.el = config.elements;
    this.history = [];
    this.isBusy = false;
  }

  init() {
    this.el.aiSendBtn?.addEventListener("click", () => this.submit().catch(this.handleError));
    this.el.aiInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        this.submit().catch(this.handleError);
      }
    });
    this.el.aiClearBtn?.addEventListener("click", () => this.clear());

    for (const button of this.el.aiQuickButtons || []) {
      button.addEventListener("click", () => {
        const prompt = String(button.dataset.prompt || "").trim();
        if (!prompt) return;
        this.el.aiInput.value = prompt;
        this.submit().catch(this.handleError);
      });
    }

    if (!this.el.aiChatBody?.children.length) {
      this.pushAssistantMessage(
        "สวัสดีครับ ผมคือ AI Assistant ของระบบ LTC คุณสามารถถามเรื่องผู้รับบริการ, การเงิน, คลังวัสดุ, หน่วยงาน หรือสั่งให้สร้างกราฟ/สร้างไฟล์รายงานได้"
      );
    }
  }

  setBusy(isBusy) {
    this.isBusy = isBusy;
    if (this.el.aiSendBtn) this.el.aiSendBtn.disabled = isBusy;
    if (this.el.aiInput) this.el.aiInput.disabled = isBusy;
    if (this.el.aiTyping) this.el.aiTyping.hidden = !isBusy;
  }

  createMeta(role) {
    const meta = document.createElement("small");
    meta.className = "ai-msg-meta";
    meta.textContent = `${role === "user" ? "คุณ" : "AI"} • ${new Date().toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit"
    })}`;
    return meta;
  }

  appendMessageElement(element) {
    this.el.aiChatBody.appendChild(element);
    this.el.aiChatBody.scrollTop = this.el.aiChatBody.scrollHeight;
  }

  pushUserMessage(text) {
    const safeText = String(text || "");
    this.history.push({ role: "user", text: safeText, at: new Date().toISOString() });

    const wrap = document.createElement("article");
    wrap.className = "ai-msg from-user";

    const bubble = document.createElement("div");
    bubble.className = "ai-msg-bubble";
    bubble.textContent = safeText;
    wrap.appendChild(bubble);
    wrap.appendChild(this.createMeta("user"));

    this.appendMessageElement(wrap);
  }

  pushAssistantMessage(text) {
    this.pushAssistantPayload({ answer: text });
  }

  normalizeChart(chart) {
    if (!chart || !Array.isArray(chart.labels) || !Array.isArray(chart.datasets)) return null;
    const labels = chart.labels.map((item) => String(item || "").trim()).filter(Boolean);
    if (!labels.length) return null;

    const datasets = chart.datasets
      .map((set, index) => {
        const data = Array.isArray(set?.data)
          ? set.data.map((item) => {
              const value = Number(item);
              return Number.isFinite(value) ? value : 0;
            })
          : [];
        if (!data.length) return null;

        return {
          label: String(set?.label || `Series ${index + 1}`),
          color: String(set?.color || ""),
          pointColors: Array.isArray(set?.pointColors) ? set.pointColors.map((item) => String(item || "")).slice(0, labels.length) : [],
          data: data.slice(0, labels.length)
        };
      })
      .filter(Boolean);

    if (!datasets.length) return null;

    return {
      title: String(chart.title || "กราฟสรุป"),
      unit: String(chart.unit || ""),
      labels,
      datasets
    };
  }

  renderCharts(charts) {
    const normalized = (Array.isArray(charts) ? charts : []).map((item) => this.normalizeChart(item)).filter(Boolean);
    if (!normalized.length) return null;

    const wrap = document.createElement("div");
    wrap.className = "ai-chart-wrap";

    for (const chart of normalized) {
      wrap.appendChild(this.buildChartCard(chart));
    }

    return wrap;
  }

  buildChartCard(chart) {
    const card = document.createElement("section");
    card.className = "ai-chart-card";

    const title = document.createElement("h4");
    title.className = "ai-chart-title";
    title.textContent = chart.title;
    card.appendChild(title);

    const maxValue = Math.max(1, ...chart.datasets.flatMap((set) => set.data.map((value) => Math.abs(Number(value) || 0))));
    const hasData = chart.datasets.some((set) => set.data.some((value) => Math.abs(Number(value) || 0) > 0));

    if (!hasData) {
      const empty = document.createElement("div");
      empty.className = "ai-chart-empty";
      empty.textContent = "ยังไม่มีข้อมูลเพียงพอสำหรับสร้างกราฟ";
      card.appendChild(empty);
      return card;
    }

    const plot = document.createElement("div");
    plot.className = "ai-chart-plot";

    for (let i = 0; i < chart.labels.length; i += 1) {
      const column = document.createElement("div");
      column.className = "ai-chart-column";

      const bars = document.createElement("div");
      bars.className = "ai-chart-bars";

      for (const dataset of chart.datasets) {
        const value = Number(dataset.data[i] || 0);
        const bar = document.createElement("span");
        bar.className = "ai-chart-bar";
        const size = Math.max(4, Math.round((Math.abs(value) / maxValue) * 100));
        bar.style.height = `${size}%`;
        const pointColor = String(dataset.pointColors?.[i] || dataset.color || "").trim();
        if (pointColor) bar.style.background = pointColor;
        bar.title = `${dataset.label}: ${Format.number(value)}${chart.unit ? ` ${chart.unit}` : ""}`;
        if (value < 0) bar.classList.add("is-negative");

        const valueText = document.createElement("i");
        valueText.className = "ai-chart-value";
        valueText.textContent = Format.number(value);
        bar.appendChild(valueText);

        bars.appendChild(bar);
      }

      const label = document.createElement("small");
      label.className = "ai-chart-label";
      label.textContent = chart.labels[i];

      column.appendChild(bars);
      column.appendChild(label);
      plot.appendChild(column);
    }

    card.appendChild(plot);

    const legend = document.createElement("div");
    legend.className = "ai-chart-legend";
    const single = chart.datasets.length === 1 ? chart.datasets[0] : null;
    const pointLegend = single && Array.isArray(single.pointColors) && single.pointColors.length === chart.labels.length;
    if (pointLegend) {
      for (let i = 0; i < chart.labels.length; i += 1) {
        const item = document.createElement("span");
        item.className = "ai-chart-legend-item";

        const dot = document.createElement("i");
        dot.className = "ai-chart-legend-dot";
        dot.style.background = String(single.pointColors[i] || single.color || "#2f7fc2");

        const text = document.createElement("b");
        text.textContent = String(chart.labels[i] || `ค่า ${i + 1}`);

        item.appendChild(dot);
        item.appendChild(text);
        legend.appendChild(item);
      }
    } else {
      for (const dataset of chart.datasets) {
        const item = document.createElement("span");
        item.className = "ai-chart-legend-item";

        const dot = document.createElement("i");
        dot.className = "ai-chart-legend-dot";
        if (dataset.color) dot.style.background = dataset.color;

        const text = document.createElement("b");
        text.textContent = dataset.label;

        item.appendChild(dot);
        item.appendChild(text);
        legend.appendChild(item);
      }
    }

    card.appendChild(legend);
    return card;
  }

  renderArtifacts(artifacts) {
    const rows = Array.isArray(artifacts) ? artifacts : [];
    if (!rows.length) return null;

    const wrap = document.createElement("div");
    wrap.className = "ai-artifact-wrap";

    for (const artifact of rows) {
      const row = document.createElement("div");
      row.className = "ai-artifact-item";

      const info = document.createElement("div");
      info.className = "ai-artifact-info";

      const name = document.createElement("strong");
      name.textContent = String(artifact.fileName || "report.txt");
      const meta = document.createElement("small");
      meta.textContent = `${String(artifact.mimeType || "application/octet-stream")} • ${this.formatBytes(artifact.size)}`;

      info.appendChild(name);
      info.appendChild(meta);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ai-artifact-btn";
      btn.textContent = "ดาวน์โหลด";
      btn.addEventListener("click", () => {
        this.downloadArtifact(artifact);
      });

      row.appendChild(info);
      row.appendChild(btn);
      wrap.appendChild(row);
    }

    return wrap;
  }

  downloadArtifact(artifact) {
    const base64 = String(artifact?.contentBase64 || "");
    if (!base64) throw new Error("ไฟล์ว่าง ไม่สามารถดาวน์โหลดได้");

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    const mimeType = String(artifact?.mimeType || "application/octet-stream");
    const fileName = String(artifact?.fileName || `ltc-file-${Date.now()}.txt`);
    const blob = new Blob([bytes], { type: mimeType });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  formatBytes(value) {
    const size = Number(value || 0);
    if (!Number.isFinite(size) || size <= 0) return "0 B";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  pushAssistantPayload(payload) {
    const answer = String(payload?.answer || "ไม่พบคำตอบที่เหมาะสมในขณะนี้");
    const charts = Array.isArray(payload?.charts) ? payload.charts : [];
    const artifacts = Array.isArray(payload?.artifacts) ? payload.artifacts : [];

    this.history.push({ role: "assistant", text: answer, at: new Date().toISOString() });

    const wrap = document.createElement("article");
    wrap.className = "ai-msg from-assistant ai-msg-rich";

    const bubble = document.createElement("div");
    bubble.className = "ai-msg-bubble";
    bubble.textContent = answer;
    wrap.appendChild(bubble);

    const chartElement = this.renderCharts(charts);
    if (chartElement) wrap.appendChild(chartElement);

    const artifactElement = this.renderArtifacts(artifacts);
    if (artifactElement) wrap.appendChild(artifactElement);

    wrap.appendChild(this.createMeta("assistant"));
    this.appendMessageElement(wrap);
  }

  clear() {
    this.history = [];
    this.el.aiChatBody.innerHTML = "";
    this.pushAssistantMessage("ล้างบทสนทนาแล้ว พร้อมเริ่มคำถามใหม่ครับ");
  }

  async submit() {
    if (this.isBusy) return;
    const raw = this.el.aiInput.value;
    const prompt = this.security.assertSafeText(raw, "คำถาม AI", 600);
    this.el.aiInput.value = "";

    this.pushUserMessage(prompt);
    this.setBusy(true);

    try {
      const payload = await this.repo.askAi(prompt, this.history);
      this.pushAssistantPayload(payload);
      this.renderSuggestions(payload?.suggestions || []);
    } finally {
      this.setBusy(false);
      this.el.aiInput.focus();
    }
  }

  renderSuggestions(suggestions) {
    if (!this.el.aiSuggestionWrap) return;
    this.el.aiSuggestionWrap.innerHTML = "";
    const list = Array.isArray(suggestions) ? suggestions.slice(0, 5) : [];
    if (!list.length) return;

    for (const text of list) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ai-suggestion-btn";
      button.textContent = Format.cleanWhitespace(text);
      button.dataset.prompt = text;
      button.addEventListener("click", () => {
        this.el.aiInput.value = String(button.dataset.prompt || "");
        this.submit().catch(this.handleError);
      });
      this.el.aiSuggestionWrap.appendChild(button);
    }
  }

  handleError = (error) => {
    console.error(error);
    const baseMessage = error?.message || "เกิดข้อผิดพลาดระหว่างใช้งาน AI";
    let message =
      error?.aiBusy && error?.retryAfter
        ? `${baseMessage} (ลองใหม่ใน ${Number(error.retryAfter)} วินาที)`
        : baseMessage;
    if (error?.requestId) {
      message = `${message}\nรหัสติดตาม: ${error.requestId}`;
    }
    this.pushAssistantMessage(message);
    this.setBusy(false);
  };
}

export { AiAssistantPage };
