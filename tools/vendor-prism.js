#!/usr/bin/env node
/* Builds js/vendor/prism.min.js (Prism core + the few grammars the site needs) from the prismjs dev dependency,
 * and copies its license next to it. Run `npm run vendor:prism` after changing the language list or upgrading prismjs.
 * The generated files are committed, so the site itself never needs node_modules. */
"use strict";
const fs = require("node:fs"), path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PRISM = path.dirname(require.resolve("prismjs/package.json"));
const LANGUAGES = ["clike", "c", "python", "bash"];          // clike is required by c
const version = require("prismjs/package.json").version;

const parts = [`/* Prism ${version} (MIT, https://prismjs.com): core + ${LANGUAGES.join(", ")}. Built by tools/vendor-prism.js. */`,
  "window.Prism={manual:true};",                              // highlight only when asked: js/code.js decides which blocks
  fs.readFileSync(path.join(PRISM, "components", "prism-core.min.js"), "utf8").trim(),
  ...LANGUAGES.map((l) => fs.readFileSync(path.join(PRISM, "components", `prism-${l}.min.js`), "utf8").trim())];

fs.writeFileSync(path.join(ROOT, "js", "vendor", "prism.min.js"), parts.join("\n") + "\n");
fs.copyFileSync(path.join(PRISM, "LICENSE"), path.join(ROOT, "js", "vendor", "prism.LICENSE.txt"));
console.log(`js/vendor/prism.min.js: Prism ${version} with ${LANGUAGES.join(", ")} (${fs.statSync(path.join(ROOT, "js", "vendor", "prism.min.js")).size} bytes)`);
