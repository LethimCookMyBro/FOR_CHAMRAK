"use strict";

const crypto = require("node:crypto");

function toBase64Url(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(String(input), "utf8");
  return buffer.toString("base64url");
}

function fromBase64Url(input) {
  return Buffer.from(String(input || ""), "base64url").toString("utf8");
}

function safeEqualText(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function sha1(text) {
  return crypto.createHash("sha1").update(String(text || ""), "utf8").digest("hex");
}

function sanitizeText(value, maxLength = 500) {
  const text = String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[<>]/g, "")
    .trim();
  if (!text) return "";
  return text.slice(0, Math.max(1, maxLength));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (!value || typeof value !== "object") return value;

  const next = {};
  const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    next[key] = canonicalize(value[key]);
  }
  return next;
}

function toDateTs(value) {
  if (!value) return null;
  const ts = new Date(String(value)).getTime();
  if (Number.isNaN(ts)) return null;
  return ts;
}

function nowIso() {
  return new Date().toISOString();
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

module.exports = {
  toBase64Url,
  fromBase64Url,
  safeEqualText,
  sha1,
  sanitizeText,
  canonicalize,
  toDateTs,
  nowIso,
  includesAny
};
