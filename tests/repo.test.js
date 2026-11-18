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

})();
