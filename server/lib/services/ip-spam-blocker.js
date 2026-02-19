"use strict";

const { getClientIp } = require("../ip-utils");

class IpSpamBlocker {
  constructor(config = {}) {
    this.enabled = config.enabled !== false;
    this.windowMs = Math.max(1000, Number(config.windowMs || 60 * 1000));
    this.maxHits = Math.max(10, Number(config.maxHits || 240));
    this.blockMs = Math.max(1000, Number(config.blockMs || 10 * 60 * 1000));
    this.cleanupIntervalMs = Math.max(5000, Number(config.cleanupIntervalMs || 60 * 1000));
    this.states = new Map();
    this.lastCleanupAt = 0;
  }

  getClientKey(req) {
    return getClientIp(req);
  }

  pruneState(state, now) {
    state.hits = state.hits.filter((ts) => now - ts <= this.windowMs);
    if (state.blockedUntil && state.blockedUntil <= now) {
      state.blockedUntil = 0;
    }
  }

  maybeCleanup(now = Date.now()) {
    if (now - this.lastCleanupAt < this.cleanupIntervalMs) return;
    this.lastCleanupAt = now;

    for (const [key, state] of this.states.entries()) {
      this.pruneState(state, now);
      const stale = state.hits.length === 0 && state.blockedUntil <= now && now - state.lastSeenAt > this.windowMs * 2;
      if (stale) this.states.delete(key);
    }
  }

  getState(req, now = Date.now()) {
    this.maybeCleanup(now);
    const key = this.getClientKey(req);
    const state = this.states.get(key) || { hits: [], blockedUntil: 0, lastSeenAt: now };
    state.lastSeenAt = now;
    this.pruneState(state, now);
    this.states.set(key, state);
    return { key, state };
  }

  consume(req) {
    if (!this.enabled) {
      return {
        blocked: false,
        justBlocked: false,
        retryAfterSeconds: 0,
        clientIp: this.getClientKey(req)
      };
    }

    const now = Date.now();
    const { key, state } = this.getState(req, now);

    if (state.blockedUntil > now) {
      return {
        blocked: true,
        justBlocked: false,
        retryAfterSeconds: Math.max(1, Math.ceil((state.blockedUntil - now) / 1000)),
        clientIp: key
      };
    }

    state.hits.push(now);
    this.pruneState(state, now);

    if (state.hits.length > this.maxHits) {
      state.blockedUntil = now + this.blockMs;
      state.hits = [];
      this.states.set(key, state);
      return {
        blocked: true,
        justBlocked: true,
        retryAfterSeconds: Math.max(1, Math.ceil(this.blockMs / 1000)),
        clientIp: key
      };
    }

    this.states.set(key, state);
    return {
      blocked: false,
      justBlocked: false,
      retryAfterSeconds: 0,
      clientIp: key
    };
  }

  metrics() {
    const now = Date.now();
    let blocked = 0;
    for (const state of this.states.values()) {
      if (state.blockedUntil > now) blocked += 1;
    }
    return {
      enabled: this.enabled,
      windowMs: this.windowMs,
      maxHits: this.maxHits,
      blockMs: this.blockMs,
      trackedIps: this.states.size,
      blockedIps: blocked
    };
  }
}

module.exports = {
  IpSpamBlocker
};
