#!/usr/bin/env node
/* Real-browser quality audit: layout at phone/tablet/desktop widths, light and dark themes, console errors,
 * tap-target size, and axe-core accessibility rules.
 *
 *   npm run audit                           Edge only
 *   AUDIT_BROWSERS=edge,chrome,firefox npm run audit
 *   node tools/audit.js --pages=index.html,modules/06-scheduling.html --report-only
 *
 * Needs a locally installed browser (puppeteer-core does not download one). Not part of `npm test` because of that.
 */
"use strict";
const fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const puppeteer = require("puppeteer-core");

const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const flag = (n) => (args.find((a) => a.startsWith(`--${n}=`)) || "").split("=")[1];
const REPORT_ONLY = args.includes("--report-only");

const BROWSERS = {
  edge: { exe: ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe", "/usr/bin/microsoft-edge"], product: "chrome" },
  chrome: { exe: ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"], product: "chrome" },
  firefox: { exe: ["C:\\Program Files\\Mozilla Firefox\\firefox.exe", "/usr/bin/firefox", "/Applications/Firefox.app/Contents/MacOS/firefox"], product: "firefox" }
};
const VIEWPORTS = [
  { name: "phone 360", width: 360, height: 740, mobile: true },
  { name: "tablet 768", width: 768, height: 1024 },
  { name: "desktop 1280", width: 1280, height: 800 }
];
const THEMES = ["light", "dark"];

function listPages() {
  const only = flag("pages");
  if (only) return only.split(",");
  const out = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));
  for (const dir of ["pages", "modules", "labs", "handson"]) {
    const d = path.join(ROOT, dir);
    if (fs.existsSync(d)) out.push(...fs.readdirSync(d).filter((f) => f.endsWith(".html")).sort().map((f) => `${dir}/${f}`));
  }
  return out;
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".py": "text/plain; charset=utf-8", ".json": "application/json" };
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\//, "") || "index.html";
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    }).listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

/** Runs inside the page. */
function pageChecks() {
  const vw = document.documentElement.clientWidth;
  const insideScroller = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") return true; } return false; };
  const overflow = [];
  document.querySelectorAll("body *").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width && r.right > vw + 1 && !insideScroller(el) && getComputedStyle(el).position !== "fixed") overflow.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""} (right ${Math.round(r.right)} > ${vw})`);
  });
  const small = [];
  document.querySelectorAll("button, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, summary, [role=button]").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width && r.height && (r.width < 24 || r.height < 24)) small.push(`${el.tagName.toLowerCase()}[${(el.getAttribute("aria-label") || el.textContent || el.type || "").trim().slice(0, 24)}] ${Math.round(r.width)}x${Math.round(r.height)}`);
  });
  return { scrollWidth: document.documentElement.scrollWidth, vw, overflow: overflow.slice(0, 5), overflowCount: overflow.length, small };
}

async function main() {
  const pages = listPages();
  const wanted = (process.env.AUDIT_BROWSERS || "edge").split(",").map((s) => s.trim()).filter(Boolean);
  const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  const { server, port } = await serve();
  const findings = [];  // {where, kind, detail}
  let runs = 0;

  for (const name of wanted) {
    const spec = BROWSERS[name];
    const exe = process.env[`${name.toUpperCase()}_PATH`] || (spec && spec.exe.find((p) => fs.existsSync(p)));
    if (!exe) { console.log(`- ${name}: not installed, skipped`); continue; }
    const launch = () => puppeteer.launch({ executablePath: exe, browser: spec.product, headless: true, args: spec.product === "chrome" ? ["--no-sandbox"] : [] });
    let browser;
    try { browser = await launch(); } catch (e) { // browsers occasionally fail to start (e.g. right after self-updating); one retry
      console.log(`- ${name}: launch failed (${String(e.message).split("\n")[0]}), retrying once`);
      await new Promise((r) => setTimeout(r, 3000)); browser = await launch();
    }
    console.log(`\n== ${name} ${await browser.version()} ==`);
    for (const rel of pages) {
      for (const vp of VIEWPORTS) {
        for (const theme of THEMES) {
          const where = `${name} | ${rel} | ${vp.name} | ${theme}`;
          const page = await browser.newPage();
          const errors = [];
          page.on("pageerror", (e) => errors.push(`script error: ${e.message}`));
          page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
          page.on("requestfailed", (r) => errors.push(`request failed: ${r.url()}`));
          page.on("response", (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
          try {
            await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
            try { await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]); } catch (e) { /* not supported by this browser */ }
            await page.goto(`http://127.0.0.1:${port}/${rel}`, { waitUntil: "load" });
            await page.waitForFunction(() => [...document.querySelectorAll("[data-sim]")].every((e) => e.dataset.mounted), { timeout: 10000 });
            const res = await page.evaluate(pageChecks);
            if (res.scrollWidth > res.vw + 1) findings.push({ where, kind: "overflow", detail: `page scrolls sideways (${res.scrollWidth} > ${res.vw}); ${res.overflow.join("; ")}` });
            if (vp.mobile && res.small.length) findings.push({ where, kind: "tap-target", detail: `${res.small.length} control(s) under 24px: ${[...new Set(res.small)].slice(0, 4).join("; ")}` });
            await page.evaluate(axeSource);
            const axe = await page.evaluate(async () => {
              const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } });
              return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes[0].target.join(" ") + " | " + (v.nodes[0].failureSummary || "").split("\n").slice(1, 3).join(" ").slice(0, 160) }));
            });
            axe.forEach((v) => findings.push({ where, kind: `axe:${v.id}`, detail: `[${v.impact}] ${v.help} (${v.nodes} node${v.nodes > 1 ? "s" : ""}) e.g. ${v.sample}` }));
            errors.forEach((e) => findings.push({ where, kind: "error", detail: e }));
          } catch (e) {
            findings.push({ where, kind: "audit-failed", detail: e.message });
          } finally { await page.close(); }
          runs++;
        }
      }
    }
    await browser.close();
  }
  server.close();

  // Group identical findings across viewports/themes so the report stays readable.
  const groups = new Map();
  findings.forEach((f) => { const [b, p, v, t] = f.where.split(" | "); const key = `${f.kind}||${p}||${f.detail.replace(/\d+x\d+/g, "").slice(0, 120)}`; const g = groups.get(key) || { kind: f.kind, page: p, detail: f.detail, where: [] }; g.where.push(`${b}/${v}/${t}`); groups.set(key, g); });
  const list = [...groups.values()];
  console.log(`\nAudited ${runs} page views across ${wanted.join(", ")}.`);
  if (!list.length) { console.log("No findings."); return; }
  const byKind = {};
  list.forEach((g) => { (byKind[g.kind] = byKind[g.kind] || []).push(g); });
  Object.entries(byKind).sort().forEach(([kind, gs]) => {
    console.log(`\n### ${kind}  (${gs.length} distinct)`);
    gs.slice(0, 12).forEach((g) => console.log(`  - ${g.page}  [${g.where.length} view(s): ${[...new Set(g.where.map((w) => w.split("/")[0]))].join(",")}]  ${g.detail}`));
    if (gs.length > 12) console.log(`  … ${gs.length - 12} more`);
  });
  fs.mkdirSync(path.join(ROOT, ".audit"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, ".audit", "report.json"), JSON.stringify(list, null, 1));
  if (!REPORT_ONLY) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exit(2); });
