"use strict";

const { sanitizeText } = require("../../helpers");

class AiRequestCoordinator {
  constructor(config) {
    this.maxConcurrent = Math.max(1, Number(config.maxConcurrent || 1));
    this.maxPerClient = Math.max(1, Number(config.maxPerClient || 1));
    this.maxQueue = Math.max(1, Number(config.maxQueue || 1));
    this.queueTimeoutMs = Math.max(1000, Number(config.queueTimeoutMs || 5000));
    this.activeTotal = 0;
    this.activeByClient = new Map();
    this.queue = [];
    this.draining = false;
  }

  getClientActive(clientKey) {
    return Number(this.activeByClient.get(clientKey) || 0);
  }

  canRunNow(clientKey) {
    return this.activeTotal < this.maxConcurrent && this.getClientActive(clientKey) < this.maxPerClient;
  }

  markStart(clientKey) {
    this.activeTotal += 1;
    this.activeByClient.set(clientKey, this.getClientActive(clientKey) + 1);
  }

  markDone(clientKey) {
    this.activeTotal = Math.max(0, this.activeTotal - 1);
    const next = this.getClientActive(clientKey) - 1;
    if (next > 0) this.activeByClient.set(clientKey, next);
    else this.activeByClient.delete(clientKey);
  }

  dequeueRunnableIndex() {
    for (let i = 0; i < this.queue.length; i += 1) {
      if (this.canRunNow(this.queue[i].clientKey)) return i;
    }
    return -1;
  }

  runTask(item) {
    if (item.timer) clearTimeout(item.timer);
    this.markStart(item.clientKey);
    Promise.resolve()
      .then(item.task)
      .then((value) => {
        item.resolve({
          value,
          waitedMs: Date.now() - item.enqueuedAt
        });
      })
      .catch((error) => {
        item.reject(error);
      })
      .finally(() => {
        this.markDone(item.clientKey);
        this.drainQueue();
      });
  }

  drainQueue() {
    if (this.draining) return;
    this.draining = true;

    try {
      while (this.activeTotal < this.maxConcurrent) {
        const index = this.dequeueRunnableIndex();
        if (index < 0) break;
        const [item] = this.queue.splice(index, 1);
        if (!item) break;
        this.runTask(item);
      }
    } finally {
      this.draining = false;
    }
  }

  buildQueueError(code, message) {
    const error = new Error(message);
    error.status = 503;
    error.code = code;
    error.retryAfter = Math.max(1, Math.ceil(this.queueTimeoutMs / 1000));
    return error;
  }

  async run(clientKeyRaw, task) {
    const clientKey = sanitizeText(clientKeyRaw || "anonymous", 200) || "anonymous";
    if (typeof task !== "function") {
      const error = new Error("task ต้องเป็นฟังก์ชัน");
      error.status = 500;
      throw error;
    }

    const startAt = Date.now();
    if (this.canRunNow(clientKey)) {
      this.markStart(clientKey);
      try {
        const value = await task();
        return { value, waitedMs: 0 };
      } finally {
        this.markDone(clientKey);
        this.drainQueue();
      }
    }

    if (this.queue.length >= this.maxQueue) {
      throw this.buildQueueError("AI_QUEUE_FULL", "ระบบ AI มีผู้ใช้งานพร้อมกันจำนวนมาก กรุณาลองใหม่อีกครั้งในอีกสักครู่");
    }

    return new Promise((resolve, reject) => {
      const item = {
        clientKey,
        task,
        enqueuedAt: startAt,
        resolve,
        reject,
        timer: null
      };

      item.timer = setTimeout(() => {
        const index = this.queue.indexOf(item);
        if (index >= 0) {
          this.queue.splice(index, 1);
          reject(this.buildQueueError("AI_QUEUE_TIMEOUT", "AI กำลังประมวลผลหนาแน่น กรุณาลองใหม่อีกครั้ง"));
        }
      }, this.queueTimeoutMs);

      this.queue.push(item);
      this.drainQueue();
    });
  }

  metrics() {
    return {
      maxConcurrent: this.maxConcurrent,
      maxPerClient: this.maxPerClient,
      maxQueue: this.maxQueue,
      queueTimeoutMs: this.queueTimeoutMs,
      active: this.activeTotal,
      queued: this.queue.length
    };
  }
}

module.exports = {
  AiRequestCoordinator
};
