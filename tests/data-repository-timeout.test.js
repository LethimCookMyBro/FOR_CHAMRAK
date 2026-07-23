"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "../web/js/data-repository.js")).href;

test("table requests stop waiting when the local backend never responds", async () => {
  const { DataRepository } = await import(moduleUrl);
  const originalFetch = globalThis.fetch;
  let requestSignal = null;

  globalThis.fetch = (_url, options) => new Promise((_resolve, reject) => {
    requestSignal = options.signal;
    requestSignal.addEventListener(
      "abort",
      () => reject(Object.assign(new Error("request aborted"), { name: "AbortError" })),
      { once: true }
    );
  });

  try {
    const repository = new DataRepository("/api", "", "", { requestTimeoutMs: 25 });

    await assert.rejects(
      () => repository.getTable("t04_dataj"),
      (error) => {
        assert.equal(error.networkError, true);
        assert.equal(error.timeout, true);
        assert.match(error.message, /ไม่ตอบสนอง/);
        return true;
      }
    );

    assert.equal(requestSignal?.aborted, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
