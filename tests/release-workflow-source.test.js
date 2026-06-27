"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("electron build workflow uses the app icon and latest.yml release-notes patcher", async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));

  assert.equal(packageJson.build.win.icon, "build/icon.svg");
  assert.match(packageJson.scripts["electron:build"], /electron-builder --win/);
  assert.match(packageJson.scripts["electron:build"], /scripts\/patch-latest-release-notes\.js/);
  await fs.access(path.join(repoRoot, "build", "icon.svg"));
});

test("release-notes hook writes releaseNotes into latest.yml", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltc-latest-yml-"));
  const latestPath = path.join(tempDir, "latest.yml");
  await fs.writeFile(
    latestPath,
    [
      "version: 9.9.9",
      "path: LTC-Chamrak-Setup-9.9.9.exe",
      "sha512: abc",
      ""
    ].join("\n"),
    "utf8"
  );

  const script = require("../scripts/patch-latest-release-notes");
  const previousNotes = process.env.LTC_RELEASE_NOTES;
  process.env.LTC_RELEASE_NOTES = "เพิ่มปุ่มตรวจสอบอัปเดต\nใส่ icon โปรแกรม";

  try {
    await script.patchLatestYml({ outDir: tempDir });
  } finally {
    if (previousNotes === undefined) delete process.env.LTC_RELEASE_NOTES;
    else process.env.LTC_RELEASE_NOTES = previousNotes;
  }

  const patched = await fs.readFile(latestPath, "utf8");
  await fs.rm(tempDir, { recursive: true, force: true });

  assert.match(patched, /releaseNotes:/);
  assert.match(patched, /เพิ่มปุ่มตรวจสอบอัปเดต/);
  assert.match(patched, /ใส่ icon โปรแกรม/);
});
