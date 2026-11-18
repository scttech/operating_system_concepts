#!/usr/bin/env node
/* Writes a small redirect page at each old address, so links made before the site-level pages moved into pages/ keep working
 * (for example problems.html#p=disk:48213:2 now opens pages/problems.html#p=disk:48213:2).
 *
 *   node tools/build-redirects.js <output folder>
 *
 * The deploy workflow runs this on the assembled site, so the repository itself holds no stubs. The redirect keeps the ?query and #hash. */
"use strict";
const fs = require("node:fs"), path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

/** Names (without .html) of the pages that once lived at the site root. */
function movedPages() { return fs.readdirSync(path.join(ROOT, "pages")).filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5)).sort(); }

/** The redirect page for one name. */
function stub(name) {
  const to = `pages/${name}.html`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>This page has moved — OS Concepts</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${to}">
<meta http-equiv="refresh" content="0; url=${to}">
<script>location.replace("${to}" + location.search + location.hash);</script>
</head>
<body>
<p>This page has moved to <a href="${to}">${to}</a>.</p>
</body>
</html>
`;
}

function write(outDir) {
  const names = movedPages();
  names.forEach((n) => fs.writeFileSync(path.join(outDir, `${n}.html`), stub(n)));
  return names;
}

module.exports = { movedPages, stub, write };

if (require.main === module) {
  const out = process.argv[2];
  if (!out || !fs.existsSync(out)) { console.error("Usage: node tools/build-redirects.js <existing output folder>"); process.exit(1); }
  console.log(`Wrote ${write(out).length} redirect pages to ${out}`);
}
