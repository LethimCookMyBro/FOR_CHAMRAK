"use strict";

const { getClientIp } = require("../ip-utils");

class LoginAttemptLimiter {
  constructor(config) {
    this.windowMs = config.windowMs;
    this.maxAttempts = config.maxAttempts;
    this.blockMs = config.blockMs || config.windowMs;
    this.states = new Map();
  }

  getClientKey(req) {
    return getClientIp(req);
  }

  pruneState(state, now) {
    state.attempts = state.attempts.filter((ts) => now - ts <= this.windowMs);
    if (state.blockedUntil && state.blockedUntil <= now) state.blockedUntil = 0;
  }

  getState(req, now = Date.now()) {
    const key = this.getClientKey(req);
    const state = this.states.get(key) || { attempts: [], blockedUntil: 0 };
    this.pruneState(state, now);
    this.states.set(key, state);
    return { key, state };
  }

  check(req) {
    const now = Date.now();
    const { state } = this.getState(req, now);
    if (state.blockedUntil > now) {
      const retryAfterSeconds = Math.max(1, Math.ceil((state.blockedUntil - now) / 1000));
      return { blocked: true, retryAfterSeconds };
    }
    return { blocked: false, retryAfterSeconds: 0 };
  }

  registerFailure(req) {
    const now = Date.now();
    const { key, state } = this.getState(req, now);
    state.attempts.push(now);
    this.pruneState(state, now);
    if (state.attempts.length >= this.maxAttempts) {
      state.blockedUntil = now + this.blockMs;
      state.attempts = [];
    }
    this.states.set(key, state);
  }

  clear(req) {
    const key = this.getClientKey(req);
    this.states.delete(key);
  }
}

module.exports = {
  LoginAttemptLimiter
};
