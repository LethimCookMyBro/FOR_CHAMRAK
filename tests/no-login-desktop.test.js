"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { startServer } = require("../server/app");

async function startTestServer() {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ltc-no-login-"));
  const context = await startServer({
    configOverrides: {
      PORT: 0,
      HOST: "127.0.0.1",
      RUNTIME_ROOT: runtimeRoot,
      REQUIRE_AJAX_HEADER: false
    }
  });
  const address = context.address;
  assert.equal(typeof address, "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    ...context,
    baseUrl,
    runtimeRoot
  };
}

test("desktop app opens the main app shell without a login redirect", async (t) => {
  const server = await startTestServer();
  t.after(async () => {
    await server.close();
    await fs.rm(server.runtimeRoot, { recursive: true, force: true });
  });

  const response = await fetch(`${server.baseUrl}/`, { redirect: "manual" });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /LTC/);
  assert.equal(response.headers.get("location"), null);
});

test("desktop APIs are local-app APIs and do not require auth cookies", async (t) => {
  const server = await startTestServer();
  t.after(async () => {
    await server.close();
    await fs.rm(server.runtimeRoot, { recursive: true, force: true });
  });

  const health = await fetch(`${server.baseUrl}/api/health`);
  assert.equal(health.status, 200);

  const tables = await fetch(`${server.baseUrl}/api/tables`);
  const payload = await tables.json();

  assert.equal(tables.status, 200);
  assert.equal(typeof payload.count, "number");
  assert.ok(Array.isArray(payload.aliases));
});

test("legacy auth endpoints are not exposed in the no-login desktop app", async (t) => {
  const server = await startTestServer();
  t.after(async () => {
    await server.close();
    await fs.rm(server.runtimeRoot, { recursive: true, force: true });
  });

  const response = await fetch(`${server.baseUrl}/auth/me`);
  assert.equal(response.status, 404);
});
