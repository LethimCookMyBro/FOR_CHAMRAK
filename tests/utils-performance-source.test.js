"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

async function readSource(filePath) {
  // Normalize CRLF->LF so string markers match on Windows checkouts too.
  const source = await fs.readFile(path.join(repoRoot, filePath), "utf8");
  return source.replace(/\r\n/g, "\n");
}

test("Format.number reuses one Thai number formatter", async () => {
  const source = await readSource("web/js/utils.js");
  const formatterCreations = [...source.matchAll(/new Intl\.NumberFormat\("th-TH"\)/g)];

  assert.equal(formatterCreations.length, 1);
  assert.match(source, /THAI_NUMBER_FORMATTER\.format/);
});

test("escapeHtml uses a single replacement pass", async () => {
  const source = await readSource("web/js/utils.js");
  const escapeHtmlStart = source.indexOf("static escapeHtml(value)");
  const escapeHtmlEnd = source.indexOf("\n\n  static number", escapeHtmlStart);
  const body = source.slice(escapeHtmlStart, escapeHtmlEnd);

  assert.match(body, /\.replace\(\/\[&<>"'\]\/g/);
  assert.doesNotMatch(body, /\.replaceAll\(/);
});
