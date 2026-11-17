#!/usr/bin/env node
/* Injects the real lab scripts into the lab pages so the code students read is exactly the code they download.
 *
 * In a lab page, write:   <pre class="code" data-src="labs/code/lab1_processes.py"></pre>
 * This script fills it with the (HTML-escaped) file contents.
 *
 *   node tools/build-labs.js            update the pages
 *   node tools/build-labs.js --check    exit 1 if a page is out of date (the tests use this)
 */
"use strict";
const fs = require("node:fs"), path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const LABS = path.join(ROOT, "labs");
const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const BLOCK = /<pre class="code" data-src="([^"]+)">[\s\S]*?<\/pre>/g;

function render(html) {
  return html.replace(BLOCK, (m, src) => {
    const file = path.join(ROOT, src);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) throw new Error(`labs: ${src} does not exist`);
    const code = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").replace(/\n$/, "");
    return `<pre class="code" data-src="${src}"><code>${escapeHtml(code)}</code></pre>`;
  });
}

function pages() { return fs.readdirSync(LABS).filter((f) => f.endsWith(".html")).sort().map((f) => path.join(LABS, f)); }

function stale() {
  return pages().filter((p) => { const cur = fs.readFileSync(p, "utf8"); return render(cur) !== cur; });
}

module.exports = { render, stale, pages };

if (require.main === module) {
  if (process.argv.includes("--check")) {
    const bad = stale();
    if (bad.length) { console.error(`Out of date: ${bad.map((p) => path.relative(ROOT, p)).join(", ")}. Run: npm run build:labs`); process.exit(1); }
    console.log("lab pages are up to date");
  } else {
    let n = 0;
    for (const p of pages()) { const cur = fs.readFileSync(p, "utf8"), next = render(cur); if (next !== cur) { fs.writeFileSync(p, next); n++; } }
    console.log(`Updated ${n} lab page(s).`);
  }
}
