"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

async function readIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

async function resolveReleaseNotes() {
  const inlineNotes = String(process.env.LTC_RELEASE_NOTES || process.env.RELEASE_NOTES || "").trim();
  if (inlineNotes) return inlineNotes;

  const notesFile = String(process.env.LTC_RELEASE_NOTES_FILE || process.env.RELEASE_NOTES_FILE || "").trim();
  if (notesFile) {
    const resolved = path.resolve(repoRoot, notesFile);
    const fileNotes = (await readIfExists(resolved)).trim();
    if (fileNotes) return fileNotes;
  }

  const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
  return [
    `Release v${packageJson.version}`,
    "ปรับปรุงโปรแกรมและไฟล์ติดตั้งสำหรับเวอร์ชันนี้"
  ].join("\n");
}

function normalizeNotes(rawNotes) {
  return String(rawNotes || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[#*\-\s]+/, "").trim())
    .filter(Boolean);
}

function stripExistingReleaseNotes(ymlText) {
  const lines = String(ymlText || "").split(/\r?\n/);
  const releaseNotesIndex = lines.findIndex((line) => /^releaseNotes\s*:/.test(line));
  const kept = releaseNotesIndex >= 0 ? lines.slice(0, releaseNotesIndex) : lines;
  return kept.join("\n").replace(/\s+$/, "");
}

function formatReleaseNotes(notes) {
  const normalized = normalizeNotes(notes);
  if (!normalized.length) return "";

  const rows = ["releaseNotes:"];
  for (const note of normalized) {
    rows.push(`  - ${JSON.stringify(note)}`);
  }
  return rows.join("\n");
}

async function patchLatestYml(options = {}) {
  const outDir = path.resolve(options.outDir || process.argv[2] || path.join(repoRoot, "dist"));
  const latestPath = path.join(outDir, "latest.yml");
  const latestYml = await fs.readFile(latestPath, "utf8");
  const releaseNotes = formatReleaseNotes(await resolveReleaseNotes());

  if (!releaseNotes) return latestPath;

  const nextYml = `${stripExistingReleaseNotes(latestYml)}\n${releaseNotes}\n`;
  await fs.writeFile(latestPath, nextYml, "utf8");
  return latestPath;
}

module.exports = async function afterAllArtifactBuild(buildResult) {
  await patchLatestYml({ outDir: buildResult.outDir });
  return [];
};

module.exports.patchLatestYml = patchLatestYml;
module.exports.formatReleaseNotes = formatReleaseNotes;

if (require.main === module) {
  patchLatestYml()
    .then((latestPath) => {
      console.log(`[release] patched releaseNotes in ${latestPath}`);
    })
    .catch((error) => {
      console.error("[release] failed to patch latest.yml", error);
      process.exit(1);
    });
}
