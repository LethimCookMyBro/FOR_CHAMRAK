"use strict";

const { sanitizeText } = require("../../helpers");

class GeminiClient {
  constructor(config) {
    this.apiKey = String(config.apiKey || "");
    this.model = String(config.model || "gemini-2.0-flash");
    this.timeoutMs = Number(config.timeoutMs || 12000);
  }

  isEnabled() {
    return Boolean(this.apiKey);
  }

  extractText(payload) {
    const parts = payload?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return "";
    return parts
      .map((part) => String(part?.text || "").trim())
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  async generate(promptText) {
    if (!this.isEnabled()) return "";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.apiKey
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: promptText }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 700
            }
          }),
          signal: controller.signal
        }
      );

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const detail = sanitizeText(payload?.error?.message || "", 180) || `status ${response.status}`;
        throw new Error(`gemini request failed: ${detail}`);
      }

      const text = this.extractText(payload);
      if (!text) throw new Error("gemini empty response");
      return text;
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = {
  GeminiClient
};
