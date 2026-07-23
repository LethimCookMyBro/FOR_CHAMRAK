"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

async function readSource(filePath) {
  return fs.readFile(path.join(repoRoot, filePath), "utf8");
}

test("deceased registry shows ADL and care group", async () => {
  const [index, renderer] = await Promise.all([
    readSource("index.html"),
    readSource("web/js/ltc-app-render-methods.js")
  ]);
  const deceasedPage = index.match(/<section id="page-deceased"[\s\S]*?<\/section>/)?.[0] || "";
  const renderDeceased = renderer.match(/async renderDeceased\(\)[\s\S]*?\n  async renderCg/ )?.[0] || "";

  assert.match(deceasedPage, /<th>ADL<\/th>/);
  assert.match(deceasedPage, /<th>กลุ่ม<\/th>/);
  assert.match(renderDeceased, /row\.ADL/);
  assert.match(renderDeceased, /getTaiGroup/);
});

test("CG codes stay in the CG series when the linked CM code is a name", async () => {
  const moduleUrl = pathToFileURL(path.join(repoRoot, "web", "js", "ltc-app-action-methods.js")).href;
  const { ltcAppActionMethods } = await import(`${moduleUrl}?t=${Date.now()}`);

  assert.equal(ltcAppActionMethods.generateCgCode("นางชมภาพ รัตนวาร", []), "CG1");
  assert.equal(ltcAppActionMethods.generateCgCode("CM1", [{ "รหัสcg": "CG1" }]), "CG2");
});

test("CG form identifies the linked CM by code, not by name", async () => {
  const dialogs = await readSource("web/js/entity-dialog-service.js");
  const cgDialog = dialogs.match(/async openCgDialog\([\s\S]*?\n  async openCmDialog/)?.[0] || "";

  assert.match(cgDialog, /label: "รหัส CM"/);
  assert.doesNotMatch(cgDialog, /label: "ชื่อ CM"/);
  assert.match(cgDialog, /label: `\$\{cm\["รหัสcm"\]/);
});
