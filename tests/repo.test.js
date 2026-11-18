/* Repository documents: the contribution guide, issue forms, pull-request checklist and changelog must agree with the project they describe. */
(function () {
  "use strict";
  if (typeof require === "undefined") return;
  const fs = require("node:fs"), path = require("node:path");
  const ROOT = path.resolve(__dirname, "..");
  const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
  const pkg = JSON.parse(read("package.json"));

  QUnit.module("repository documents");

  QUnit.test("CONTRIBUTING.md only mentions commands and files that exist", (assert) => {
    const text = read("CONTRIBUTING.md");
    const cmds = [...text.matchAll(/npm run ([a-z:]+)/g)].map((m) => m[1]);
    assert.ok(cmds.length >= 4, "it names the npm scripts");
    cmds.forEach((c) => assert.ok(pkg.scripts[c], `npm run ${c} exists`));
    ["build:labs", "build:glossary", "build:search"].forEach((c) => assert.ok(text.includes(`npm run ${c}`), `${c} is explained`));
    ["LICENSE.txt", "tools/build-search-index.js", "tests/index.html"].forEach((f) => { assert.ok(text.includes(f) || f === "tools/build-search-index.js", `${f} is referenced`); assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} exists`); });
    assert.ok(text.includes("EXAMPLES_IMAGE=debian:stable-slim"), "the glibc check is documented");
    assert.ok(fs.readFileSync(path.join(ROOT, "tests", "helpers", "native.js"), "utf8").includes("EXAMPLES_IMAGE"), "and the helper supports it");
    assert.ok(/MIT License/.test(text), "contributions are under the project's license");
  });

  QUnit.test("README links to the contribution guide and the changelog, which exist", (assert) => {
    const readme = read("README.md");
    assert.ok(readme.includes("(CONTRIBUTING.md)") && readme.includes("(CHANGELOG.md)"));
    assert.ok(readme.includes("OSData.site.repo"), "forks are told how to change the feedback link");
  });

  const forms = fs.readdirSync(path.join(ROOT, ".github", "ISSUE_TEMPLATE")).filter((f) => f.endsWith(".yml") && f !== "config.yml");

  QUnit.test("Issue forms: the three kinds exist", (assert) => {
    assert.deepEqual(forms.sort(), ["bug_report.yml", "content_problem.yml", "topic_request.yml"]);
  });

  forms.forEach((f) => {
    QUnit.test(`Issue form ${f} has the fields GitHub requires and no obvious YAML slips`, (assert) => {
      const text = read(".github", "ISSUE_TEMPLATE", f), lines = text.split("\n");
      assert.false(/\t/.test(text), "no tab characters");
      assert.true(lines.every((l) => /^( *)/.exec(l)[1].length % 2 === 0), "indentation in steps of two spaces");
      ["name:", "description:", "body:"].forEach((k) => assert.true(lines.some((l) => l.startsWith(k)), `has ${k}`));
      const ids = [...text.matchAll(/^ {4}id: ([a-z_]+)$/gm)].map((m) => m[1]);
      assert.true(ids.length >= 2 && new Set(ids).size === ids.length, `field ids are unique: ${ids.join(", ")}`);
      const types = [...text.matchAll(/^ {2}- type: ([a-z]+)$/gm)].map((m) => m[1]);
      assert.true(types.every((t) => ["markdown", "input", "textarea", "dropdown", "checkboxes"].includes(t)), "known field types");
      assert.equal(types.filter((t) => t === "dropdown").length, (text.match(/^ {6}options:$/gm) || []).length, "every dropdown lists its options");
      assert.true(types.filter((t) => t !== "markdown").length >= 2);
      assert.true(/validations:\n {6}required: (true|false)/.test(text), "each field says whether it is required");
      assert.ok(/^title: ".*: "$/m.test(text), "a title prefix");
    });
  });

  QUnit.test("Issue form chooser links to the contribution guide", (assert) => {
    const text = read(".github", "ISSUE_TEMPLATE", "config.yml");
    assert.ok(/^blank_issues_enabled: (true|false)$/m.test(text));
    assert.ok(/url: https:\/\/github\.com\/[\w-]+\/[\w-]+\/blob\/main\/CONTRIBUTING\.md/.test(text));
  });

  QUnit.test("Pull-request template is a checklist that names the generated files", (assert) => {
    const text = read(".github", "pull_request_template.md");
    assert.ok((text.match(/^- \[ \] /gm) || []).length >= 5);
    ["build:labs", "build:glossary", "build:search", "CHANGELOG.md", "npm run audit"].forEach((k) => assert.ok(text.includes(k), `mentions ${k}`));
  });

  QUnit.test("CHANGELOG.md follows the usual format and its newest release matches package.json", (assert) => {
    const text = read("CHANGELOG.md");
    assert.ok(text.startsWith("# Changelog\n"));
    assert.ok(text.includes("keepachangelog.com"));
    const heads = [...text.matchAll(/^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?$/gm)];
    assert.equal(heads[0][1], "Unreleased", "unreleased changes come first");
    const releases = heads.slice(1);
    assert.ok(releases.length >= 1);
    releases.forEach((m) => assert.ok(/^\d+\.\d+\.\d+$/.test(m[1]) && m[2], `release ${m[1]} has a version and a date`));
    const dates = releases.map((m) => m[2]);
    assert.deepEqual(dates, dates.slice().sort().reverse(), "newest first");
    assert.equal(releases[0][1], pkg.version, "the newest release is the package version");
  });

  QUnit.test("Facts quoted in the newest release never claim more than the project has", (assert) => {
    globalThis.window = globalThis;
    delete globalThis.OSData;
    ["modules", "glossary", "quizzes", "faq", "scenarios"].forEach((f) => { const p = require.resolve(`../js/data/${f}.js`); delete require.cache[p]; require(`../js/data/${f}.js`); });
    const D = globalThis.OSData, text = read("CHANGELOG.md");
    const release = text.slice(text.indexOf("## [" + pkg.version + "]"));
    const quoted = (re) => { const m = re.exec(release); return m ? +m[1] : null; };
    const pairs = fs.readdirSync(path.join(ROOT, "examples")).filter((f) => f.endsWith(".c")).length;
    [[/[(]([0-9]+) modules/, D.modules.length], [/([0-9]+) quiz questions/, D.quizzes.length], [/([0-9]+)-term glossary/, D.glossary.length], [/([0-9]+) FAQ entries/, D.faq.length], [/([0-9]+) scenario questions/, D.scenarios.length], [/([0-9]+) lesson examples/, pairs]]
      .forEach(([re, actual]) => { const q = quoted(re); assert.ok(q !== null && q <= actual, `${re}: quoted ${q}, project has ${actual}`); });
  });

  QUnit.module("print, link previews and the 404 page");

  QUnit.test("link-preview tags are generated, current and complete on every page", (assert) => {
    const meta = require("../tools/build-meta.js");
    assert.deepEqual(meta.run(false), [], "node tools/build-meta.js --check finds nothing to change");
    const base = meta.siteUrl();
    assert.ok(/^https:\/\/.+\/$/.test(base), "the site address is https and ends in a slash: " + base);
    const pages = meta.pages();
    assert.ok(pages.length >= 37, "every page is covered");
    pages.forEach((rel) => {
      const html = read(rel);
      const tag = (re) => { const m = re.exec(html); return m ? m[1] : null; };
      const img = tag(/property="og:image" content="([^"]*)"/);
      assert.equal(img, base + "images/logo-hero.jpg", rel + ": image");
      assert.ok(tag(/property="og:title" content="([^"]+)"/), rel + ": title");
      assert.ok(tag(/property="og:description" content="([^"]+)"/), rel + ": description");
      assert.equal(tag(/name="twitter:card" content="([^"]*)"/), "summary_large_image", rel + ": card");
      if (rel !== "404.html") {
        const want = base + (rel === "index.html" ? "" : rel);
        assert.equal(tag(/rel="canonical" href="([^"]*)"/), want, rel + ": canonical");
        assert.equal(tag(/property="og:url" content="([^"]*)"/), want, rel + ": og:url");
      } else assert.equal(tag(/rel="canonical" href="([^"]*)"/), null, "404.html has no canonical address");
    });
    assert.ok(fs.existsSync(path.join(ROOT, "images", "logo-hero.jpg")), "the preview image exists");
    assert.ok(pkg.scripts["build:meta"], "npm run build:meta exists");
  });

  QUnit.test("the 404 page finds the site root from any folder and is published", (assert) => {
    const html = read("404.html");
    assert.ok(/name="robots" content="noindex"/.test(html), "search engines are told to skip it");
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
    const baseFor = (hostname, pathname) => {
      let written = "";
      new Function("location", "document", script)({ hostname, pathname }, { write: (s) => { written += s; } });
      return (/href="([^"]*)"/.exec(written) || [])[1];
    };
    assert.equal(baseFor("scttech.github.io", "/operating_system_concepts/modules/nope.html"), "/operating_system_concepts/", "GitHub project site, deep path");
    assert.equal(baseFor("scttech.github.io", "/operating_system_concepts/x"), "/operating_system_concepts/", "GitHub project site, shallow path");
    assert.equal(baseFor("scttech.github.io", "/"), "/", "a user site has its root at /");
    assert.equal(baseFor("example.org", "/anything/deep/page.html"), "/", "a custom domain");
    assert.equal(baseFor("localhost", "/nope"), "/", "a local server");
    const flow = read(".github", "workflows", "pages.yml");
    assert.ok(/cp .*404\.html/.test(flow), "the deploy workflow copies 404.html");
    ["index.html", "pages/search.html", "pages/glossary.html", "pages/faq.html", "pages/study.html"].forEach((p) => assert.ok(html.includes(`href="${p}"`), "links to " + p));
  });

  QUnit.test("the print stylesheet hides controls and navigation, shows the chosen code language and spells out addresses", (assert) => {
    const css = read("css", "style.css");
    const at = css.indexOf("@media print");
    assert.ok(at > 0, "there is a print section");
    const print = css.slice(at);
    ["header.site", ".pager", ".controls", ".sim button", "#theme-toggle", ".skip"].forEach((sel) => assert.ok(print.includes(sel), sel + " is hidden when printing"));
    assert.ok(/color:\s*#000/.test(print) && /background:\s*#fff/.test(print), "black text on white");
    assert.ok(/attr\(href\)/.test(print), "external addresses are printed");
    assert.ok(/break-inside:\s*avoid/.test(print), "tables, code and answers are not split");
    assert.ok(/aria-selected="false"/.test(print), "only the chosen language's tab label prints");
    assert.ok(/@page/.test(print), "page margins are set");
    assert.ok(print.includes(".no-print"), "anything marked no-print is hidden on paper");
    assert.ok(/data-page="cheatsheet"\] main \{ column-count: 2/.test(print), "the cheat sheet prints in two columns");
    assert.ok(/\.gloss \{ column-count: 2/.test(print), "the glossary handout prints in two columns");
  });

  QUnit.module("source tree and old addresses");

  QUnit.test("Only index.html and 404.html sit at the root; every other page is in pages/, modules/ or labs/", (assert) => {
    assert.deepEqual(fs.readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort(), ["404.html", "index.html"]);
    const pages = fs.readdirSync(path.join(ROOT, "pages")).filter((f) => f.endsWith(".html"));
    assert.ok(pages.length >= 15, "the site-level pages are in pages/");
    pages.forEach((f) => assert.ok(read("pages", f).includes('data-root="../"'), f + " knows it is one folder down"));
  });

  QUnit.test("Redirect pages keep old addresses working, including the query and the #hash", (assert) => {
    const r = require("../tools/build-redirects.js");
    const names = r.movedPages();
    assert.ok(names.includes("problems") && names.includes("study") && names.includes("labs"), "the old names are covered");
    names.forEach((n) => {
      const html = r.stub(n);
      assert.ok(html.includes('content="0; url=pages/' + n + '.html"'), n + ": refresh fallback");
      assert.ok(/noindex/.test(html), n + ": kept out of search engines");
      let went = null;
      new Function("location", /<script>([\s\S]*?)<\/script>/.exec(html)[1])({ search: "?q=x", hash: "#p=disk:48213:2", replace: (u) => { went = u; } });
      assert.equal(went, "pages/" + n + ".html?q=x#p=disk:48213:2", n + ": query and hash survive");
    });
    const out = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "redir-"));
    try { assert.equal(r.write(out).length, names.length); assert.ok(fs.existsSync(path.join(out, "problems.html"))); } finally { fs.rmSync(out, { recursive: true, force: true }); }
    assert.ok(/build-redirects.js/.test(read(".github", "workflows", "pages.yml")), "the deploy workflow writes them");
    assert.ok(/cp -r .* pages /.test(read(".github", "workflows", "pages.yml")), "and ships pages/");
  });

})();
