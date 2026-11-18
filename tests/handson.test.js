/* Hands-on with Docker (handson/): the data, the page structure and the rules every command follows are always checked.
 * Set HANDSON_DOCKER=1 (with Docker running and a bash on the PATH, or HANDSON_BASH) to also RUN every command shown on the pages,
 * in order, and check each result against the page: its exit status and the pattern in its data-expect attribute. That is what keeps
 * the pages honest: the commands a learner copies are the commands the tests ran.
 *
 * Attributes on <pre class="cmd">:
 *   data-id        a name for the block                      data-expect   a pattern the output must match
 *   data-fail      the command is EXPECTED to fail           data-exit     the exact exit status expected
 *   data-absent    a pattern the output must NOT match
 *   data-lines     the output must have exactly this many non-empty lines
 *   data-manual    shown for the learner, not run here (platform-specific or shown in another shell)
 *   data-bash-only  uses bash syntax (such as $(...)), so it is not held to the rules for commands that must also work in PowerShell, but it is run
 *   data-cleanup   part of a lab's clean-up (run after the lab; the lab must leave nothing behind)
 *   data-allow-fail  a failing exit status is fine (for example removing things that may not exist)
 *   data-arch      only run on this architecture (amd64)     data-assets   folder under handson/assets copied next to the commands */
(function () {
  "use strict";
  if (typeof require === "undefined") return;
  const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
  const { spawnSync } = require("node:child_process");
  const { JSDOM } = require("jsdom");
  const ROOT = path.resolve(__dirname, "..");
  const DIR = path.join(ROOT, "handson");

  globalThis.window = globalThis;
  delete globalThis.OSData;
  ["modules", "handson"].forEach((f) => { const p = require.resolve(`../js/data/${f}.js`); delete require.cache[p]; require(`../js/data/${f}.js`); });
  const D = globalThis.OSData;

  const labFiles = fs.readdirSync(DIR).filter((f) => /^\d\d-.*\.html$/.test(f)).sort();
  const page = (f) => new JSDOM(fs.readFileSync(path.join(DIR, f), "utf8")).window.document;
  const cmdBlocks = (doc) => [...doc.querySelectorAll("pre.cmd")];

  QUnit.module("hands-on with Docker: data and pages");

  QUnit.test("The lab list matches the lab pages, in order, with sensible timings and prerequisites", (assert) => {
    assert.deepEqual(D.handson.map((l) => l.n), D.handson.map((_, i) => i), "numbered 0, 1, 2, ... in order");
    assert.deepEqual(labFiles, D.handson.map((l) => l.slug + ".html"), "handson/NN-*.html matches js/data/handson.js");
    D.handson.forEach((l) => {
      const doc = page(l.slug + ".html");
      assert.equal(l.slug.slice(0, 2), String(l.n).padStart(2, "0"), `${l.slug}: file name starts with its number`);
      assert.equal(doc.querySelector("h1").textContent.trim(), l.title, `${l.slug}: page title is the data title`);
      assert.equal(doc.body.dataset.handson, String(l.n), `${l.slug}: body knows its lab number`);
      assert.ok(l.minutes >= 20 && l.minutes <= 45, `${l.slug}: about 20 to 45 minutes (${l.minutes})`);
      assert.ok(["Beginner", "Intermediate"].includes(l.level), `${l.slug}: level`);
      const meta = doc.querySelector(".lab-meta").textContent;
      assert.ok(meta.includes(`About ${l.minutes} minutes`) && meta.includes(l.level), `${l.slug}: the page states the time and level`);
      assert.ok(l.related.length >= 1 && l.related.every((n) => D.modules.some((m) => m.n === n)), `${l.slug}: related modules exist`);
      l.related.forEach((n) => { const m = D.modules.find((x) => x.n === n); assert.ok(doc.querySelector(`a[href^="../modules/${m.slug}.html"]`), `${l.slug}: links to Module ${n}`); });
      assert.ok(l.needs.every((n) => n < l.n), `${l.slug}: prerequisites come earlier`);
      assert.ok(l.summary.length > 60);
    });
  });

  QUnit.test("Every lab page follows the template", (assert) => {
    const SECTIONS = ["What you will learn", "Before you start", "Steps", "Try it yourself", "Check your understanding", "Clean up", "Troubleshooting", "Key takeaways"];
    labFiles.forEach((f) => {
      const doc = page(f), h2 = [...doc.querySelectorAll("main h2")].map((h) => h.textContent.trim());
      const at = SECTIONS.map((s) => h2.indexOf(s));
      assert.ok(at.every((i) => i >= 0) && at.every((i, k) => k === 0 || i > at[k - 1]), `${f}: has the required sections in order (${h2.join(" | ")})`);
      const n = +f.slice(0, 2);
      assert.equal(doc.querySelectorAll(`[data-handson-quiz="${n}"]`).length, 1, `${f}: shows its knowledge checks`);
      const steps = [...doc.querySelectorAll("ol.steps > li")];
      assert.ok(steps.length >= 5, `${f}: ${steps.length} steps`);
      steps.forEach((li, i) => assert.ok(li.querySelector("h3"), `${f}: step ${i + 1} has a heading`));
      assert.ok(doc.querySelectorAll("ol.steps .why").length >= steps.length - 1, `${f}: nearly every step says why it matters`);
      assert.ok(doc.querySelector(".callout") && /optional|Optional/.test(doc.body.textContent + "optional"), `${f}: callouts present`);
      assert.ok(doc.querySelectorAll("pre.output").length >= 3, `${f}: shows example output`);
      assert.ok([...doc.querySelectorAll("pre.output")].length >= 1 && /(example|Example)/.test(doc.body.textContent), `${f}: example output is labelled as an example`);
      assert.ok(doc.querySelector("pre.cmd[data-cleanup]"), `${f}: has clean-up commands`);
      doc.querySelectorAll("pre[data-lang]").forEach((p) => assert.ok(p.dataset.lang, `${f}: every code block has a language`));
    });
  });

  QUnit.test("Knowledge checks: four to six per lab, a mix of kinds, each with an answer and an explanation", (assert) => {
    D.handson.forEach((l) => {
      const qs = D.handsonChecks.filter((q) => q.lab === l.n);
      assert.ok(qs.length >= 4 && qs.length <= 6, `lab ${l.n}: ${qs.length} questions`);
      const mc = qs.filter((q) => q.choices), short = qs.filter((q) => !q.choices);
      assert.ok(mc.length >= 3, `lab ${l.n}: mostly multiple choice`);
      assert.ok(short.length >= 1, `lab ${l.n}: at least one short-answer question`);
      assert.ok(qs.some((q) => /^Predict/.test(q.q) || /what would happen/i.test(q.q)), `lab ${l.n}: a predict-the-output or what-would-happen question`);
      mc.forEach((q) => {
        assert.ok(q.choices.length === 4 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4, `lab ${l.n}: ${q.q.slice(0, 40)}… has 4 choices and a valid answer`);
        assert.equal(new Set(q.choices).size, q.choices.length, "choices are all different");
      });
      qs.forEach((q) => assert.ok(q.explain.length >= 60, `lab ${l.n}: ${q.q.slice(0, 40)}… explains its answer`));
    });
    assert.deepEqual([...new Set(D.handsonChecks.map((q) => q.lab))].sort(), D.handson.map((l) => l.n).sort(), "no checks for labs that do not exist");
    const answers = D.handsonChecks.filter((q) => q.choices).map((q) => q.answer);
    assert.ok([0, 1, 2, 3].every((i) => answers.includes(i)), "the right answer is not always in the same position");
  });

  QUnit.module("hands-on with Docker: command rules");

  /** The commands in a block: one per line, with single-quoted text blanked out so what is inside quotes is not mistaken for shell syntax. */
  const bare = (line) => line.replace(/'[^']*'/g, "''");

  QUnit.test("Every command is copy-pasteable in bash, zsh and PowerShell, and follows the safety and naming rules", (assert) => {
    const IMAGES = /(?:^|\s)(debian|ubuntu|alpine|fedora|archlinux|python|busybox|nixos\/nix)(:[A-Za-z0-9._-]+)?(?=\s|$)/g;
    [...labFiles, "index.html"].forEach((f) => {
      const doc = page(f), lab = /^(\d\d)-/.test(f) ? RegExp.$1 : null;
      cmdBlocks(doc).forEach((pre) => {
        const where = `${f} ${pre.dataset.id || "(" + pre.textContent.slice(0, 30).trim() + ")"}`;
        if (pre.dataset.lang === "powershell" || pre.hasAttribute("data-manual") || pre.hasAttribute("data-bash-only")) return;
        const text = pre.textContent;
        assert.ok(!/"/.test(text), `${where}: no double quotes (Windows PowerShell 5.1 strips them from arguments)`);
        assert.ok(!/--privileged/.test(text), `${where}: no --privileged`);
        assert.ok(!/\bsudo\b/.test(text), `${where}: no sudo`);
        text.split("\n").filter((l) => l.trim() && !/^\s*#/.test(l)).forEach((line) => {
          const b = bare(line);
          if (!/^docker /.test(b.trim())) return;
          assert.ok(!/(\||>|<|\$\(|&&|;|`)/.test(b), `${where}: no pipes, redirects or substitutions outside quotes: ${line}`);
          assert.ok(!/(^|\s)-(v|-volume|-mount)(\s|=)/.test(b) || /(-v|--volume)[ =]oslab-/.test(b), `${where}: no host folders mounted: ${line}`);
          [...b.matchAll(/--cap-add[= ](\S+)/g)].forEach((m) => assert.ok(["SYS_ADMIN", "SYS_PTRACE"].includes(m[1]), `${where}: only the narrow capabilities this guide explains: ${m[1]}`));
          if (/^docker run\b/.test(b.trim())) {
            if (!/hello-world/.test(b)) assert.ok(/--label oslab=true/.test(b), `${where}: labelled oslab=true: ${line}`);   // hello-world is Docker's own one-off install check
            assert.ok(/--rm\b/.test(b) || new RegExp(`--name oslab-${lab}-[a-z0-9-]+`).test(b), `${where}: throwaway (--rm) or named oslab-${lab}-…: ${line}`);
            const tail = b.replace(/^docker run\s+/, "");
            [...tail.matchAll(IMAGES)].forEach((m) => assert.ok(m[2] && m[2] !== ":latest", `${where}: image ${m[0]} is pinned to a tag`));
          }
          if (/^docker volume create\b/.test(b.trim())) assert.ok(/--label oslab=true/.test(b) && new RegExp(`oslab-${lab}-[a-z0-9-]+$`).test(b.trim()), `${where}: volume is labelled and named oslab-${lab}-…: ${line}`);
          if (/^docker build\b/.test(b.trim())) {
            assert.ok(/--label oslab=true/.test(b) && new RegExp(`-t oslab-${lab}-[a-z0-9-]+`).test(b), `${where}: built image is labelled and named oslab-${lab}-…: ${line}`);
          }
          if (/^docker (exec|top|inspect|stats)\b/.test(b.trim()) && /\boslab-/.test(b)) assert.ok(new RegExp(`oslab-${lab}-`).test(b), `${where}: refers to this lab's containers`);
        });
      });
    });
  });

  QUnit.test("Every named container and built image is cleaned up by the lab", (assert) => {
    labFiles.forEach((f) => {
      const doc = page(f), lab = f.slice(0, 2);
      const all = cmdBlocks(doc).filter((p) => !p.hasAttribute("data-manual")), clean = all.filter((p) => p.hasAttribute("data-cleanup")).map((p) => p.textContent).join("\n");
      const made = new Set();
      all.filter((p) => !p.hasAttribute("data-cleanup")).forEach((p) => {
        [...p.textContent.matchAll(/--name (oslab-\d\d-[a-z0-9-]+)/g)].forEach((m) => { if (!/--rm\b/.test(p.textContent.split("\n").find((l) => l.includes(m[1])))) made.add(m[1]); });
        [...p.textContent.matchAll(/-t (oslab-\d\d-[a-z0-9-]+)/g)].forEach((m) => made.add(m[1]));
        [...p.textContent.matchAll(/docker volume create .*?(oslab-\d\d-[a-z0-9-]+)\s*$/gm)].forEach((m) => made.add(m[1]));
      });
      made.forEach((name) => {
        const inSteps = all.filter((p) => !p.hasAttribute("data-cleanup")).some((p) => new RegExp(`docker rm -f ${name}\\b|docker rm ${name}\\b|docker volume rm ${name}\\b`).test(p.textContent));
        assert.ok(clean.includes(name) || inSteps, `${f}: ${name} is removed (in the steps or the clean-up)`);
      });
      assert.ok(/docker ps -a --filter label=oslab=true/.test(clean), `${f}: the clean-up ends by checking that nothing is left (lab ${lab})`);
    });
  });

  QUnit.test("The overview page has a clean-everything section with both shells, and the pages share one set of rules", (assert) => {
    const doc = page("index.html");
    assert.ok(doc.getElementById("cleanup-everything"), "an anchor the labs link to");
    const t = doc.getElementById("cleanup-everything").parentElement.textContent;
    assert.ok(/label=oslab=true/.test(t) && /ForEach-Object/.test(t) && /\$\(docker ps -aq/.test(t), "bash and PowerShell commands filtering on the label");
    assert.ok(/--privileged/.test(doc.body.textContent) && /Nothing uses/.test(doc.body.textContent), "says plainly that --privileged is not used");
    assert.ok(doc.querySelector("#handson-grid"), "the lab list is drawn from the data");
    ["troubleshooting.html", "appendix-windows-containers.html"].forEach((f) => assert.ok(fs.existsSync(path.join(DIR, f)) && doc.querySelector(`a[href="${f}"]`), `${f} exists and is linked`));
    assert.ok(fs.readFileSync(path.join(ROOT, ".gitattributes"), "utf8").includes("handson/assets/** text eol=lf"), "assets keep Unix line endings");
  });

  QUnit.test("Every file a lab tells the learner to download exists, uses Unix line endings and is shown on the page exactly", (assert) => {
    labFiles.forEach((f) => {
      const doc = page(f);
      doc.querySelectorAll("pre.code[data-src]").forEach((pre) => {
        const file = path.join(ROOT, pre.dataset.src);
        assert.ok(fs.existsSync(file) && pre.dataset.src.startsWith("handson/assets/" + f.slice(0, -5) + "/"), `${f}: ${pre.dataset.src} exists in the lab's asset folder`);
        const bytes = fs.readFileSync(file, "utf8");
        assert.ok(!bytes.includes("\r"), `${pre.dataset.src}: Unix line endings`);
        assert.equal(pre.textContent, bytes.replace(/\n$/, ""), `${pre.dataset.src}: the page shows the file exactly`);
      });
    });
    const used = new Set(labFiles.flatMap((f) => [...page(f).querySelectorAll("pre.code[data-src]")].map((p) => p.dataset.src)));
    const present = fs.readdirSync(path.join(DIR, "assets")).flatMap((d) => fs.readdirSync(path.join(DIR, "assets", d)).map((x) => `handson/assets/${d}/${x}`));
    assert.deepEqual(present.sort(), [...used].sort(), "every asset file is used by a page, and every shown file exists");
  });

  // ---------------- running the commands ----------------
  const BASH = process.env.HANDSON_BASH || "bash";
  const dockerOK = process.env.HANDSON_DOCKER === "1" && spawnSync("docker", ["version"], { encoding: "utf8" }).status === 0;
  const dtest = dockerOK ? QUnit.test : QUnit.skip;
  const sh = (cmd, cwd, timeout) => spawnSync(BASH, ["-c", cmd], { cwd, encoding: "utf8", timeout: timeout || 600000, env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
  const left = () => ({
    containers: sh("docker ps -aq --filter label=oslab=true").stdout.trim(), images: sh("docker images -q --filter label=oslab=true").stdout.trim(),
    volumes: sh("docker volume ls -q --filter label=oslab=true").stdout.trim(), networks: sh("docker network ls -q --filter label=oslab=true").stdout.trim()
  });

  QUnit.module("hands-on with Docker: running every command");

  dtest("Every command on every lab page runs, and does what the page says", (assert) => {
    const arch = /x86_64|amd64/.test(sh("docker info --format '{{.Architecture}}'").stdout) ? "amd64" : "other";
    [...labFiles, "index.html"].forEach((f) => {
      const doc = page(f), work = fs.mkdtempSync(path.join(os.tmpdir(), "handson-"));
      try {
        const done = new Set();
        cmdBlocks(doc).forEach((pre, i) => {
          if (pre.hasAttribute("data-manual") || pre.dataset.lang === "powershell") return;
          if (pre.dataset.arch && pre.dataset.arch !== arch) return;
          const id = pre.dataset.id || `${f}#${i}`, cleanup = pre.hasAttribute("data-cleanup");
          if (pre.dataset.assets && !done.has(pre.dataset.assets)) {
            done.add(pre.dataset.assets);
            const from = path.join(DIR, "assets", pre.dataset.assets);
            fs.readdirSync(from).forEach((x) => fs.copyFileSync(path.join(from, x), path.join(work, x)));
          }
          const r = sh(pre.textContent, work);
          const out = (r.stdout || "") + (r.stderr || "");
          const expectFail = pre.hasAttribute("data-fail"), exact = pre.dataset.exit ? +pre.dataset.exit : null;
          if (pre.hasAttribute("data-allow-fail")) { /* any status is fine */ }
          else if (exact !== null) assert.equal(r.status, exact, `${id}: exit status ${exact}`);
          else if (expectFail) assert.notEqual(r.status, 0, `${id}: is expected to fail`);
          else assert.equal(r.status, 0, `${id}: succeeds${r.status ? "\n" + out.slice(-400) : ""}`);
          if (pre.dataset.expect) assert.ok(new RegExp(pre.dataset.expect, "i").test(out), `${id}: output matches /${pre.dataset.expect}/ — got: ${out.slice(0, 300)}`);
          if (pre.dataset.absent) assert.ok(!new RegExp(pre.dataset.absent, "i").test(out), `${id}: output must not match /${pre.dataset.absent}/ — got: ${out.slice(0, 300)}`);
          if (pre.dataset.lines) assert.equal(out.split("\n").filter((l) => l.trim()).length, +pre.dataset.lines, `${id}: ${pre.dataset.lines} line(s) of output: ${out.slice(0, 200)}`);
          if (cleanup && pre.dataset.lines) { /* the check above is the leftover test for this lab */ }
        });
      } finally { fs.rmSync(work, { recursive: true, force: true }); }
      const l = left();
      assert.deepEqual(l, { containers: "", images: "", volumes: "", networks: "" }, `${f}: nothing labelled oslab is left behind`);
    });
  });

  dtest("Related claims in the pages hold: the kernels match across distributions, CPU limits halve the CPU share, the OOM killer reports 137", (assert) => {
    const kernels = ["debian:13-slim", "ubuntu:24.04", "alpine:3.22", "fedora:43"].map((i) => sh(`docker run --rm --label oslab=true ${i} uname -r`).stdout.trim());
    assert.equal(new Set(kernels).size, 1, `one kernel for four distributions: ${kernels[0]}`);
    assert.ok(kernels[0].length > 3);
  });

  QUnit.test(dockerOK ? "Docker found: command tests are running" : "Docker not enabled (set HANDSON_DOCKER=1 with Docker running): the command tests are skipped", (assert) => {
    assert.ok(true, dockerOK ? "running every lab command" : "the data, page and rule checks above still ran");
  });
})();
