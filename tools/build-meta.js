#!/usr/bin/env node
/* Writes the link-preview tags (Open Graph and Twitter card) and the canonical address into every page's <head>,
 * between the markers <!-- social:start --> and <!-- social:end -->. The base address is OSData.site.url in js/data/modules.js,
 * so a copy of this project changes one line and runs this tool.
 *
 *   node tools/build-meta.js          write the pages
 *   node tools/build-meta.js --check  exit 1 if any page is out of date (the tests run this)
 *
 * A page's title and description come from its own <title> and <meta name="description">. 404.html gets no canonical address. */
"use strict";
const fs = require("node:fs"), path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const START = "<!-- social:start -->", END = "<!-- social:end -->";
const IMAGE = { file: "images/logo-hero.jpg", width: 1000, height: 563, alt: "Operating System Concepts: Learn, Practice, Explore" };

function siteUrl() {
  const saved = globalThis.window;
  globalThis.window = globalThis;
  delete globalThis.OSData;
  const p = path.join(ROOT, "js", "data", "modules.js");
  delete require.cache[p];
  require(p);
  const url = globalThis.OSData.site.url;
  delete globalThis.OSData;
  if (saved === undefined) delete globalThis.window; else globalThis.window = saved;
  return url;
}

function pages() {
  const out = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));
  for (const dir of ["pages", "modules", "labs"]) out.push(...fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(".html")).sort().map((f) => `${dir}/${f}`));
  return out;
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

/** The block for one page, or null if the page has no title or description to use. */
function block(rel, html, base) {
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  if (!title || !desc) return null;
  const abs = (p) => base + p;
  const lines = [START];
  if (rel !== "404.html") lines.push(`<link rel="canonical" href="${abs(rel === "index.html" ? "" : rel)}">`);
  lines.push(
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Operating System Concepts">`,
    `<meta property="og:title" content="${esc(unesc(title))}">`,
    `<meta property="og:description" content="${desc}">`
  );
  if (rel !== "404.html") lines.push(`<meta property="og:url" content="${abs(rel === "index.html" ? "" : rel)}">`);
  lines.push(
    `<meta property="og:image" content="${abs(IMAGE.file)}">`,
    `<meta property="og:image:width" content="${IMAGE.width}">`,
    `<meta property="og:image:height" content="${IMAGE.height}">`,
    `<meta property="og:image:alt" content="${esc(IMAGE.alt)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    END
  );
  return lines.join("\n");
}

/** The page with its block written (added after the description, or replaced). */
function apply(html, blk) {
  const i = html.indexOf(START), j = html.indexOf(END);
  if (i >= 0 && j > i) return html.slice(0, i) + blk + html.slice(j + END.length);
  return html.replace(/(<meta name="description" content="[^"]*">)/, (m) => `${m}\n${blk}`);
}

function run(write) {
  const base = siteUrl();
  if (!/^https?:\/\/.+\/$/.test(base)) throw new Error("OSData.site.url must be an address ending in /");
  const stale = [];
  for (const rel of pages()) {
    const file = path.join(ROOT, rel), html = fs.readFileSync(file, "utf8");
    const blk = block(rel, html, base);
    if (!blk) { stale.push(`${rel} (no title or description)`); continue; }
    const next = apply(html, blk);
    if (next !== html) { stale.push(rel); if (write) fs.writeFileSync(file, next); }
  }
  return stale;
}

module.exports = { run, pages, block, siteUrl };

if (require.main === module) {
  const check = process.argv.includes("--check");
  const stale = run(!check);
  if (check) {
    if (stale.length) { console.error(`Out of date: ${stale.join(", ")}\nRun: node tools/build-meta.js`); process.exit(1); }
    console.log("Link-preview tags are up to date.");
  } else console.log(stale.length ? `Updated ${stale.length} page(s).` : "Nothing to change.");
}
