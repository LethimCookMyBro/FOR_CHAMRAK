"use strict";

const crypto = require("node:crypto");
const { fromBase64Url, safeEqualText, toBase64Url } = require("../helpers");

class AuthService {
  constructor(config) {
    this.cookieName = config.cookieName;
    this.username = config.username;
    this.passwordHash = this.sha256(config.password);
    this.secret = config.secret;
    this.ttlSeconds = config.ttlSeconds;
    this.rememberTtlSeconds = config.rememberTtlSeconds;
    this.secureCookies = Boolean(config.secureCookies);
  }

  sha256(text) {
    return crypto.createHash("sha256").update(String(text || ""), "utf8").digest("hex");
  }

  parseCookies(req) {
    const cookieHeader = String(req.headers.cookie || "");
    if (!cookieHeader) return {};

    const result = {};
    const parts = cookieHeader.split(";");
    for (const part of parts) {
      const [rawKey, ...rest] = part.trim().split("=");
      if (!rawKey) continue;
      try {
        result[decodeURIComponent(rawKey)] = decodeURIComponent(rest.join("="));
      } catch {
        // ignore malformed cookie pair
      }
    }
    return result;
  }

  signPayload(payloadEncoded) {
    return crypto.createHmac("sha256", this.secret).update(payloadEncoded).digest("base64url");
  }

  issueToken(username, remember) {
    const now = Date.now();
    const ttl = remember ? this.rememberTtlSeconds : this.ttlSeconds;
    const exp = now + ttl * 1000;

    const payload = {
      user: String(username || ""),
      exp
    };

    const payloadEncoded = toBase64Url(JSON.stringify(payload));
    const signature = this.signPayload(payloadEncoded);
    const token = `${payloadEncoded}.${signature}`;

    return {
      token,
      exp,
      ttlSeconds: ttl
    };
  }

  verifyToken(token) {
    if (!token || typeof token !== "string" || !token.includes(".")) return null;

    const [payloadEncoded, signature] = token.split(".");
    if (!payloadEncoded || !signature) return null;

    const expectedSignature = this.signPayload(payloadEncoded);
    if (!safeEqualText(signature, expectedSignature)) return null;

    let payload;
    try {
      payload = JSON.parse(fromBase64Url(payloadEncoded));
    } catch {
      return null;
    }

    if (!payload || typeof payload !== "object") return null;
    if (!payload.user || !payload.exp) return null;
    if (Number(payload.exp) <= Date.now()) return null;

    return {
      username: String(payload.user),
      expiresAt: Number(payload.exp)
    };
  }

  validateCredentials(username, password) {
    const userOk = safeEqualText(String(username || ""), this.username);
    const passOk = safeEqualText(this.sha256(password), this.passwordHash);
    return userOk && passOk;
  }

  getSession(req) {
    const cookies = this.parseCookies(req);
    const token = cookies[this.cookieName];
    return this.verifyToken(token);
  }

  setAuthCookie(res, token, maxAgeSeconds) {
    res.cookie(this.cookieName, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: this.secureCookies,
      path: "/",
      maxAge: maxAgeSeconds * 1000
    });
  }

  clearAuthCookie(res) {
    res.clearCookie(this.cookieName, {
      httpOnly: true,
      sameSite: "strict",
      secure: this.secureCookies,
      path: "/"
    });
  }
}

module.exports = {
  AuthService
};
