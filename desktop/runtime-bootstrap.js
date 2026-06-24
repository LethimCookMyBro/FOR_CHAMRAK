"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectoryEmpty(dirPath) {
  try {
    const entries = await fs.readdir(dirPath);
    return entries.length === 0;
  } catch {
    return true;
  }
}

async function hasMeaningfulRuntimeData(runtimeRoot) {
  const candidatePaths = [
    path.join(runtimeRoot, "overrides"),
    path.join(runtimeRoot, "logs", "activity_logs.jsonl"),
    path.join(runtimeRoot, "trash", "trash_items.json")
  ];

  for (const candidatePath of candidatePaths) {
    if (!(await pathExists(candidatePath))) continue;

    try {
      const stat = await fs.stat(candidatePath);
      if (stat.isFile() && stat.size > 0) return true;
      if (stat.isDirectory() && !(await isDirectoryEmpty(candidatePath))) return true;
    } catch {
      // ignore transient stat failures and continue checking
    }
  }

  return false;
}

async function copyPathIfPresent(sourcePath, targetPath) {
  if (!(await pathExists(sourcePath))) return false;
  await ensureDir(path.dirname(targetPath));
  await fs.cp(sourcePath, targetPath, {
    recursive: true,
    force: false,
    errorOnExist: false
  });
  return true;
}

async function migrateProjectRuntimeData(options) {
  const { projectRuntimeRoot, runtimeRoot } = options;
  if (!(await pathExists(projectRuntimeRoot))) return { migrated: false, copied: [] };
  if (await hasMeaningfulRuntimeData(runtimeRoot)) return { migrated: false, copied: [] };

  const copied = [];
  const mappings = [
    [path.join(projectRuntimeRoot, "overrides"), path.join(runtimeRoot, "overrides")],
    [path.join(projectRuntimeRoot, "logs"), path.join(runtimeRoot, "logs")],
    [path.join(projectRuntimeRoot, "trash"), path.join(runtimeRoot, "trash")],
    [path.join(projectRuntimeRoot, "activity_logs.jsonl"), path.join(runtimeRoot, "logs", "activity_logs.jsonl")],
    [path.join(projectRuntimeRoot, "trash_items.json"), path.join(runtimeRoot, "trash", "trash_items.json")]
  ];

  for (const [sourcePath, targetPath] of mappings) {
    if (await copyPathIfPresent(sourcePath, targetPath)) {
      copied.push({ sourcePath, targetPath });
    }
  }

  return {
    migrated: copied.length > 0,
    copied
  };
}

async function ensureDesktopRuntime(options) {
  const {
    configRoot,
    isPackaged,
    projectRuntimeRoot,
    runtimeRoot
  } = options;

  await Promise.all([
    ensureDir(runtimeRoot),
    ensureDir(path.join(runtimeRoot, "overrides")),
    ensureDir(path.join(runtimeRoot, "logs")),
    ensureDir(path.join(runtimeRoot, "trash")),
    ensureDir(configRoot)
  ]);

  const migration = !isPackaged
    ? await migrateProjectRuntimeData({
        projectRuntimeRoot,
        runtimeRoot
      })
    : { migrated: false, copied: [] };

  return {
    configRoot,
    migration,
    runtimeRoot
  };
}

module.exports = {
  ensureDesktopRuntime
};
