"use strict";

function normalizePrefix(value, fallback) {
  const fallbackText = String(fallback || "/");
  const raw = String(value || "").trim();
  const withLeadingSlash = raw ? (raw.startsWith("/") ? raw : `/${raw}`) : fallbackText;
  const normalized = withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, "") : withLeadingSlash;
  if (!/^\/[A-Za-z0-9/_-]*$/.test(normalized)) {
    return fallbackText;
  }
  return normalized || fallbackText;
}

function routePath(prefix, suffix) {
  return `${String(prefix || "").replace(/\/+$/, "")}${suffix}`;
}

function matchesPrefix(pathname, prefix) {
  const safePrefix = String(prefix || "").replace(/\/+$/, "");
  if (!safePrefix || safePrefix === "/") return false;
  return pathname === safePrefix || pathname.startsWith(`${safePrefix}/`);
}

module.exports = {
  normalizePrefix,
  routePath,
  matchesPrefix
};
