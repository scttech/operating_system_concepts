/* Page-level tests (Node only). Loads every real HTML page in jsdom, executes its scripts, then checks
   structure, links, simulation mounting and interactive behavior. The pure-logic tests live in the other files. */
(function () {
  "use strict";
  if (typeof require === "undefined") return; // browser runner covers logic + data only
  const fs = require("fs"), path = require("path");
  const { JSDOM, VirtualConsole } = require("jsdom");
  const ROOT = path.resolve(__dirname, "..");

  const rootPages = ["index.html", "labs.html", "problems.html", "glossary.html", "faq.html", "practice.html", "cheatsheet.html"];
  const moduleFiles = fs.readdirSync(path.join(ROOT, "modules")).filter((f) => f.endsWith(".html")).sort();
  const labFiles = fs.readdirSync(path.join(ROOT, "labs")).filter((f) => f.endsWith(".html")).sort();
  const allPages = [...rootPages, ...moduleFiles.map((f) => "modules/" + f), ...labFiles.map((f) => "labs/" + f)];

  function load(rel, hash) {
    return new Promise((resolve, reject) => {
      const errors = [];
      const vc = new VirtualConsole();
      vc.on("jsdomError", (e) => errors.push(String((e && (e.detail && e.detail.stack || e.stack)) || e)));
      vc.on("error", (...a) => errors.push(a.join(" ")));
      const opts = { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, virtualConsole: vc };
      if (hash) opts.url = require("url").pathToFileURL(path.join(ROOT, rel)).href + hash; // e.g. "#compare=windows,zos"
      JSDOM.fromFile(path.join(ROOT, rel), opts)
        .then((dom) => {
          const finish = () => resolve({ dom, window: dom.window, document: dom.window.document, errors });
          if (dom.window.document.readyState === "complete") finish(); else dom.window.addEventListener("load", finish);
        }).catch(reject);
    });
  }
  async function withPage(rel, fn, hash) {
    const page = await load(rel, hash);
    try { return await fn(page); } finally { page.window.close(); }
  }

  // ---- tiny DOM helpers ----
  const fire = (w, el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));
  const setValue = (w, el, v, type = "input") => { el.value = String(v); fire(w, el, type); };
  const field = (doc, labelStart) => {
    const l = [...doc.querySelectorAll("label")].find((x) => x.textContent.trim().toLowerCase().startsWith(labelStart.toLowerCase()));
    if (!l) throw new Error(`no field labelled “${labelStart}”`);
    return l.querySelector("input,select");
  };
  const button = (scope, text) => {
    const b = [...scope.querySelectorAll("button")].find((x) => x.textContent.trim() === text);
    if (!b) throw new Error(`no button “${text}”`);
    return b;
  };
  const sim = (doc, name) => doc.querySelector(`[data-sim="${name}"]`);
  const metrics = (el) => [...el.querySelectorAll(".metric b")].map((b) => b.textContent.trim());
  const text = (el) => el.textContent.replace(/\s+/g, " ");

  globalThis.window = globalThis;
  require("../js/data/modules.js"); require("../js/data/glossary.js"); require("../js/data/glossary-index.js");
  const glossaryIndex = globalThis.OSData.glossaryIndex;

  const rendered = []; // positions of the correct answer after shuffling, across all module quizzes

  QUnit.module("pages: structure and loading");

  QUnit.test("The site has exactly the expected pages", (assert) => {
    assert.equal(moduleFiles.length, 12, "12 module pages");
    globalThis.window = globalThis;
    require("../js/data/modules.js");
    assert.deepEqual(moduleFiles, globalThis.OSData.modules.map((m) => m.slug + ".html"), "module files match js/data/modules.js");
  });

  allPages.forEach((rel) => {
    QUnit.test(`${rel}: loads cleanly with working scripts, links and widgets`, async (assert) => {
      await withPage(rel, ({ window: w, document: doc, errors }) => {
        assert.deepEqual(errors, [], "no script or console errors");
        assert.equal(doc.documentElement.lang, "en", "lang attribute");
        assert.ok(doc.title.trim().length > 5, "has a title");
        assert.ok(doc.querySelector('meta[name="viewport"]') && doc.querySelector('meta[name="description"]'), "viewport + description meta");
        assert.ok(doc.querySelector("header.site nav a") && doc.querySelector("footer.site"), "site header and footer injected");
        assert.ok(doc.querySelector("main#main") && doc.querySelector("a.skip"), "main landmark and skip link");
        assert.equal(doc.querySelectorAll("h1").length, 1, "exactly one h1");

        // every referenced file exists
        const dir = path.dirname(path.join(ROOT, rel));
        const missing = [];
        doc.querySelectorAll("script[src], link[href]").forEach((el) => {
          const ref = el.getAttribute("src") || el.getAttribute("href");
          if (!/^https?:/.test(ref) && !fs.existsSync(path.resolve(dir, ref))) missing.push(ref);
        });
        doc.querySelectorAll("a[href]").forEach((a) => {
          const href = a.getAttribute("href");
          if (/^(https?:|mailto:)/.test(href)) return;
          const [file, hash] = href.split("#");
          const target = file ? path.resolve(dir, file) : path.join(ROOT, rel);
          if (!fs.existsSync(target)) { missing.push(href); return; }
          if (!hash || /^term-/.test(hash) || hash.includes("=")) return; // runtime anchors and state hashes (#topic=…, #p=…) are checked by their own tests; // term-… anchors are assigned at run time and verified against each lesson's live DOM below
          if (!file) { if (!doc.getElementById(hash)) missing.push(href + " (anchor)"); } // same page: check the live DOM
          else if (target.endsWith(".html") && !/glossary\.html$/.test(target) && !fs.readFileSync(target, "utf8").includes(`id="${hash}"`)) missing.push(href + " (anchor)");
        });
        doc.querySelectorAll("img").forEach((img) => {
          const ref = img.getAttribute("src");
          if (!/^(https?:|data:)/.test(ref) && !fs.existsSync(path.resolve(dir, ref))) missing.push(ref);
          assert.true(img.hasAttribute("alt"), `image ${ref} has an alt attribute (empty is fine for decorative images)`);
        });
        assert.deepEqual(missing, [], "all local scripts, styles, images and links resolve");
        assert.ok(doc.querySelector('link[rel="icon"]'), "favicon declared");
        assert.ok(doc.querySelector("header.site .brand img") && doc.querySelector("header.site .brand img").alt === "", "header logo mark is decorative");
        assert.equal([...doc.querySelectorAll("script[src]")].filter((s) => /^https?:/.test(s.getAttribute("src"))).length, 0, "no CDN scripts (everything is vendored)");

        // simulations all mounted
        const sims = [...doc.querySelectorAll("[data-sim]")];
        sims.forEach((s) => {
          assert.equal(s.dataset.mounted, "true", `sim “${s.dataset.sim}” mounted`);
          assert.ok(s.querySelector(".sim h3") && s.querySelector("svg, table, button, input"), `sim “${s.dataset.sim}” rendered content`);
        });

        // quizzes
        doc.querySelectorAll("[data-quiz]").forEach((qz) => {
          const n = w.OSData.quizzes.filter((q) => q.mod === +qz.dataset.quiz).length;
          assert.equal(qz.querySelectorAll(".q").length, n, `module quiz renders all ${n} questions`);
          qz.querySelectorAll(".reveal").forEach((b) => b.click());
          qz.querySelectorAll(".q").forEach((q) => {
            assert.equal(q.querySelectorAll("button.choice.correct").length, 1, "exactly one correct answer highlighted");
            assert.false(q.querySelector(".explain").hidden, "explanation shown");
            rendered.push([...q.querySelectorAll("button.choice")].findIndex((b) => b.classList.contains("correct")));
          });
        });

        // definitions: every <dfn data-term> resolved against the glossary
        doc.querySelectorAll("dfn[data-term]").forEach((d) => assert.ok(d.title, `glossary term “${d.dataset.term}” exists`));
        // regression: DOM methods print null/undefined children as text, and NaN shows up when a calculation goes wrong
        const clone = doc.body.cloneNode(true);
        clone.querySelectorAll("pre, script, code, .log").forEach((n) => n.remove());
        const stray = (clone.textContent.match(/(?<![A-Za-z])(null|undefined|NaN|Infinity|\[object Object\])(?![a-z])/g) || []); // lookarounds, not \b: the bug rendered as "nullDone:"
        assert.deepEqual(stray, [], "no stray null / undefined / NaN / [object Object] in the visible text");
        // anchors the glossary links to: unique ids, and every indexed definition for this module resolves to its <dfn>
        const ids = [...doc.querySelectorAll("[id]")].map((e) => e.id);
        assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], "no duplicate element ids");
        if (rel.startsWith("modules/")) {
          const n = +doc.body.dataset.module;
          Object.entries(glossaryIndex).forEach(([term, entries]) => entries.filter((e) => e.m === n && e.kind === "dfn").forEach((e) => {
            const target = doc.getElementById(e.id);
            assert.ok(target && target.tagName === "DFN" && target.dataset.term.toLowerCase() === term.toLowerCase(), `#${e.id} points at the definition of “${term}”`);
          }));
        }

        // lab pages: code listings with a download link and Copy button, pager
        if (rel.startsWith("labs/")) {
          const n = +doc.body.dataset.lab, pager = doc.querySelectorAll(".pager a");
          assert.equal(pager.length, n === 1 || n === 4 ? 1 : 2, "prev/next pager");
          assert.ok(doc.title.includes(`Lab ${n}:`), "title carries the lab number");
          const listings = [...doc.querySelectorAll("pre.code")];
          assert.ok(listings.length >= 1, "has at least one code listing");
          listings.forEach((pre) => {
            const name = pre.dataset.src.split("/").pop(), bar = pre.previousElementSibling;
            assert.ok(bar && bar.classList.contains("codebar"), `${name} has a toolbar`);
            assert.equal(bar.querySelector("a[download]").getAttribute("href"), `../${pre.dataset.src}`, "download link points at the real script");
            const isC = pre.dataset.src.endsWith(".c"), lang = isC ? "c" : "python";
            assert.equal(bar.querySelector(".lang").textContent, isC ? "C" : "Python", "language label");
            assert.ok(pre.querySelector("code.language-" + lang + " .token.keyword"), `${name}: keywords are highlighted`);
            assert.ok(pre.querySelector("code .token.string") && pre.querySelector("code .token.comment") && pre.querySelector("code .token.builtin, code .token.function"), `${name}: strings, comments and builtins/functions are highlighted`);
            assert.ok(pre.querySelectorAll(".token.comment .marker").length >= 1, `${name}: numbered comment markers like (1) are badges`);
            assert.ok(bar.querySelector("button"), "Copy button");
            assert.equal(pre.textContent, fs.readFileSync(path.join(ROOT, pre.dataset.src), "utf8").replace(/\r\n/g, "\n").replace(/\n$/, ""), "the page shows exactly the script's code");
          });
          assert.ok(doc.querySelectorAll(".output").length >= 1, "shows example output");
        }
        // module pages: pager
        if (rel.startsWith("modules/")) {
          const n = +doc.body.dataset.module, pager = doc.querySelectorAll(".pager a");
          assert.equal(pager.length, n === 1 || n === 12 ? 1 : 2, "prev/next pager");
          assert.ok(doc.querySelector("[data-quiz]"), "has a quiz");
          assert.ok(doc.querySelector("[data-sim]"), "has at least one simulation");
          assert.ok(doc.title.includes(`Module ${n}:`), "title carries module number");
        }
      });
    });
  });

  QUnit.test("Quiz answers are shuffled: the correct answer is not concentrated in one position", (assert) => {
    assert.ok(rendered.length > 60, `${rendered.length} questions sampled`);
    const counts = [0, 0, 0, 0, 0];
    rendered.forEach((i) => counts[i]++);
    assert.ok(Math.max(...counts) < rendered.length * 0.5, `positions: ${counts}`);
  });

  QUnit.module("pages: interactive behavior");

  QUnit.test("Home: one card per module; theme toggle works", async (assert) => {
    await withPage("index.html", ({ window: w, document: doc }) => {
      assert.equal(doc.querySelectorAll("#module-grid .card").length, 12);
      assert.ok(!/Reflect/i.test(doc.getElementById("module-grid").textContent), "no reflection module");
      doc.getElementById("theme-toggle").click();
      assert.ok(["light", "dark"].includes(doc.documentElement.dataset.theme));
    });
  });

  QUnit.test("Logo: used as the home-page heading, shipped in web-sized form, and present in the README", async (assert) => {
    await withPage("index.html", ({ document: doc }) => {
      const img = doc.querySelector("h1 img.hero-logo");
      assert.ok(img, "the logo is inside the h1");
      assert.equal(img.getAttribute("alt"), "Operating System Concepts: Learn, Practice, Explore", "descriptive alt text");
      assert.equal(img.getAttribute("src"), "images/logo-hero.jpg");
      assert.equal(doc.querySelector('link[rel="icon"]').getAttribute("href"), "images/favicon.png");
    });
    const size = (f) => fs.statSync(path.join(ROOT, "images", f)).size;
    assert.ok(fs.existsSync(path.join(ROOT, "images", "operating_system_concepts_logo.png")), "original logo kept in images/");
    assert.false(fs.existsSync(path.join(ROOT, "operating_system_concepts_logo.png")), "no stray copy in the project root");
    assert.ok(size("logo-hero.jpg") < size("operating_system_concepts_logo.png") * 0.2, "hero image is a small fraction of the original's weight");
    assert.ok(size("logo-hero.jpg") < 250 * 1024, "hero image stays under 250 KB for slow connections");
    assert.false(fs.existsSync(path.join(ROOT, "images", "logo-hero.png")), "the old PNG hero is gone");
    assert.ok(size("favicon.png") < 20000);
    // Pixel size of a PNG (IHDR) or JPEG (first start-of-frame marker)
    const dims = (f) => {
      const b = fs.readFileSync(path.join(ROOT, "images", f));
      if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
      let i = 2;
      while (i < b.length) {
        const marker = b[i + 1], len = b.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
        i += 2 + len;
      }
      throw new Error("no JPEG frame header in " + f);
    };
    assert.deepEqual([...fs.readFileSync(path.join(ROOT, "images", "logo-hero.jpg")).subarray(0, 3)], [0xff, 0xd8, 0xff], "really is a JPEG");
    // The width/height attributes in the HTML must match the real image (prevents layout shift), and the shapes must match the source logo
    const [hw, hh] = dims("logo-hero.jpg"), [ow, oh] = dims("operating_system_concepts_logo.png"), [fw, fh] = dims("favicon.png");
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    assert.ok(html.includes(`width="${hw}" height="${hh}"`), `index.html declares ${hw}x${hh} for the hero image`);
    assert.ok(Math.abs(hw / hh - ow / oh) < 0.01, `hero (${hw}x${hh}) has the same aspect ratio as the source logo (${ow}x${oh})`);
    assert.deepEqual([fw, fh], [64, 64], "favicon is a 64×64 square");
    const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
    assert.ok(/<img src="images\/operating_system_concepts_logo\.png"/.test(readme), "README shows the logo");
    assert.ok(fs.existsSync(path.join(ROOT, "images", "operating_system_concepts_logo.png")));
  });

  QUnit.test("License: the standard MIT text is present, the README explains reuse, and the deploy ships the file", (assert) => {
    const lic = fs.readFileSync(path.join(ROOT, "LICENSE.txt"), "utf8");
    assert.ok(/^MIT License/.test(lic) && /Permission is hereby granted, free of charge/.test(lic) && /Copyright \(c\) 2026/.test(lic));
    assert.ok(/sublicense, and\/or sell/.test(lic) && /THE SOFTWARE IS PROVIDED "AS IS"/.test(lic), "unmodified MIT wording (rights and warranty disclaimer)");
    assert.false(fs.existsSync(path.join(ROOT, "LICENSE")), "one license file, not two");
    const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
    assert.ok(/## License\s+Released under the \[MIT License\]\(LICENSE\.txt\)/.test(readme), "README has a License section pointing at the file");
    assert.ok(/free to copy, adapt/i.test(readme.replace(/\s+/g, " ")), "README says people may copy and adapt");
    assert.ok(/cp [^\n]*LICENSE\.txt _site\//.test(fs.readFileSync(path.join(ROOT, ".github", "workflows", "pages.yml"), "utf8")), "the deployed site includes the license file");
  });

  QUnit.test("Every page's footer links to the license", async (assert) => {
    for (const [rel, href] of [["index.html", "LICENSE.txt"], ["modules/04-scheduling.html", "../LICENSE.txt"], ["labs/01-processes.html", "../LICENSE.txt"], ["problems.html", "LICENSE.txt"]]) {
      await withPage(rel, ({ document: doc }) => {
        const a = doc.querySelector("footer.site a");
        assert.ok(a && a.textContent === "MIT License" && a.getAttribute("href") === href, `${rel}: footer links to ${href}`);
        assert.ok(/Free to copy and adapt/.test(doc.querySelector("footer.site").textContent));
        assert.true(fs.existsSync(path.resolve(path.dirname(path.join(ROOT, rel)), href)), "and the file exists there");
      });
    }
  });

  QUnit.test("Glossary: search and topic filter", async (assert) => {
    await withPage("glossary.html", ({ window: w, document: doc }) => {
      const all = doc.querySelectorAll("dt").length;
      assert.ok(all >= 80);
      setValue(w, doc.getElementById("q"), "paging");
      const n = doc.querySelectorAll("dt").length;
      assert.ok(n > 0 && n < all, `search narrowed ${all} → ${n}`);
      assert.ok(doc.getElementById("count").textContent.startsWith(`${n} of`));
      setValue(w, doc.getElementById("q"), "");
      setValue(w, doc.getElementById("cat"), "Deadlocks", "change");
      assert.ok([...doc.querySelectorAll("dt .cat")].every((c) => c.textContent === "Deadlocks"));
      setValue(w, doc.getElementById("q"), "zzzzqqq");
      assert.ok(/No matching/.test(doc.getElementById("list").textContent));
    });
  });

  QUnit.test("Glossary: each term links back to the lesson where it is discussed", async (assert) => {
    await withPage("glossary.html", ({ window: w, document: doc }) => {
      const dd = (id) => doc.getElementById(id).nextElementSibling;
      const aging = dd("aging").querySelector(".seealso");
      assert.ok(/First discussed in Module 4 \(The algorithms\)/.test(aging.textContent), aging.textContent);
      assert.equal(aging.querySelector("a").getAttribute("href"), "modules/04-scheduling.html#term-aging", "deep link to the term in the lesson");
      const kernel = dd("kernel").querySelector(".seealso");
      assert.ok(/First discussed in Module 1/.test(kernel.textContent) && /also in Module 12/.test(kernel.textContent), "terms used in several modules list them all");
      assert.deepEqual([...kernel.querySelectorAll("a")].map((a) => a.getAttribute("href")).slice(0, 1), ["modules/01-fundamentals.html#term-kernel"]);
      assert.equal(doc.querySelectorAll("dd .seealso").length, doc.querySelectorAll("dt").length, "every listed term has a link to a lesson");
      // "Discussed in" filter
      const all = doc.querySelectorAll("dt").length;
      setValue(w, doc.getElementById("mod"), "7", "change");
      const names = [...doc.querySelectorAll("dt")].map((d) => d.firstChild.textContent);
      assert.ok(names.length > 3 && names.length < all, `Module 7 filter: ${names.length} terms`);
      assert.ok(names.includes("Deadlock") && names.includes("Banker's algorithm") && !names.includes("Seek time"));
      setValue(w, doc.getElementById("mod"), "all", "change");
      assert.equal(doc.querySelectorAll("dt").length, all);
    });
  });

  QUnit.test("Lessons: a #term-… link lands on the defined term (and the first <dfn> per term owns the id)", async (assert) => {
    await withPage("modules/07-deadlocks.html", ({ document: doc }) => {
      const t = doc.getElementById("term-deadlock");
      assert.ok(t && t.tagName === "DFN", "dfn has an anchor");
      assert.ok(t.classList.contains("flash"), "the arrival is highlighted");
      assert.equal(doc.querySelectorAll("#term-deadlock").length, 1);
    }, "#term-deadlock");
  });

  QUnit.test("Glossary: terms linked from module pages resolve to an anchor", async (assert) => {
    await withPage("modules/07-deadlocks.html", ({ document: doc }) => {
      const link = doc.querySelector('dfn[data-term="Deadlock"] a');
      assert.equal(link.getAttribute("href"), "../glossary.html#deadlock");
    });
    await withPage("glossary.html", ({ document: doc }) => assert.ok(doc.getElementById("deadlock")));
  });

  QUnit.test("FAQ: filter", async (assert) => {
    await withPage("faq.html", ({ window: w, document: doc }) => {
      const all = doc.querySelectorAll("details.faq").length;
      assert.ok(all >= 20);
      setValue(w, doc.getElementById("q"), "belady");
      const n = doc.querySelectorAll("details.faq").length;
      assert.ok(n >= 1 && n < all);
      assert.true(doc.querySelector("details.faq").open, "matches expand automatically");
    });
  });

  QUnit.test("Practice: module filter and question count", async (assert) => {
    await withPage("practice.html", ({ window: w, document: doc }) => {
      assert.equal(doc.querySelectorAll(".q").length, 10);
      setValue(w, doc.getElementById("mod"), "4", "change");
      setValue(w, doc.getElementById("num"), "all", "change");
      const n = w.OSData.quizzes.filter((q) => q.mod === 4).length;
      assert.equal(doc.querySelectorAll(".q").length, n);
      assert.ok([...doc.querySelectorAll(".q .meta")].every((m) => m.textContent.includes("Module 4")));
      // answering gives immediate feedback and a score
      const q = doc.querySelector(".q"); q.querySelector("button.choice").click();
      assert.ok(q.querySelector(".explain") && !q.querySelector(".explain").hidden);
      assert.ok(q.querySelectorAll("button.choice:disabled").length === q.querySelectorAll("button.choice").length);
      assert.ok(/Score: [01] \/ 1 answered/.test(doc.querySelector(".score").textContent));
    });
  });

  QUnit.test("Quiz: clicking the right answer says Correct, the wrong one reveals the answer", async (assert) => {
    await withPage("modules/04-scheduling.html", ({ document: doc }) => {
      const qs = [...doc.querySelectorAll(".q")];
      const right = qs[0], wrong = qs[1];
      const D = doc.defaultView.OSData.quizzes.filter((q) => q.mod === 4);
      const click = (qEl, i, wantCorrect) => {
        const answerText = D[i].choices[D[i].answer];
        [...qEl.querySelectorAll("button.choice")].find((x) => (x.textContent === answerText) === wantCorrect).click();
      };
      click(right, 0, true); click(wrong, 1, false);
      assert.ok(/^Correct/.test(right.querySelector(".explain").textContent));
      assert.ok(/^Not quite/.test(wrong.querySelector(".explain").textContent));
      assert.equal(wrong.querySelectorAll("button.choice.wrong").length, 1);
      assert.equal(wrong.querySelectorAll("button.choice.correct").length, 1, "correct answer is revealed after a miss");
    });
  });

  QUnit.test("Module 1: system call walkthrough toggles between user and kernel mode", async (assert) => {
    await withPage("modules/01-fundamentals.html", ({ document: doc }) => {
      const s = sim(doc, "syscall");
      assert.ok(/USER MODE/.test(s.textContent) && /1 \/ 8/.test(s.textContent));
      button(s, "Next ▶").click(); button(s, "Next ▶").click();
      assert.ok(/KERNEL MODE/.test(s.textContent) && /3 \/ 8/.test(s.textContent), "step 3 is in kernel mode");
      for (let i = 0; i < 10; i++) button(s, "Next ▶").click();
      assert.ok(/8 \/ 8/.test(s.textContent) && /USER MODE/.test(s.textContent), "returns to user mode at the end");
      button(s, "Reset").click();
      assert.ok(/1 \/ 8/.test(s.textContent));
    });
  });

  QUnit.test("Module 2: permission calculator and access matrix", async (assert) => {
    await withPage("modules/02-security.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "perms");
      assert.ok(text(s).includes("rwxr-xr--"));
      const octal = s.querySelector('input[aria-label="Octal mode"]');
      assert.equal(octal.value, "754");
      const ownerRead = s.querySelector('input[aria-label="Owner (u) Read (4)"]');
      ownerRead.checked = false; fire(w, ownerRead, "change");
      assert.equal(octal.value, "354", "unticking owner-read updates the octal mode");
      setValue(w, octal, "640");
      assert.ok(text(s).includes("rw-r-----"));
      assert.equal(s.querySelector('input[aria-label="Other (o) Read (4)"]').checked, false);
      assert.ok(/umask/.test(text(s)) && /644/.test(text(s)), "umask default 666 & ~022 = 644");

      const a = sim(doc, "acm");
      assert.ok(/Carol may r payroll\.db/.test(text(a)), "default check: Carol can read payroll.db");
      const cell = a.querySelector('input[aria-label="Carol rights on payroll.db"]');
      setValue(w, cell, "");
      assert.ok(/Carol may not r payroll\.db/.test(text(a)), "removing the right denies access");
      assert.ok(/payroll\.db: Bob:rw/.test(text(a)), "ACL list shows Bob's rights on payroll.db");
    });
  });

  QUnit.test("Module 3: process state diagram enforces one running process; fork tree has 2^n nodes", async (assert) => {
    await withPage("modules/03-processes.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "procstates");
      button(s, "+ New process").click(); button(s, "+ New process").click();
      [...s.querySelectorAll("button")].filter((b) => /^admit/.test(b.textContent)).forEach((b) => b.click());
      const dispatch = () => [...s.querySelectorAll("button")].filter((b) => /^dispatch/.test(b.textContent));
      assert.equal(dispatch().length, 2);
      dispatch()[0].click();
      assert.ok(dispatch().every((b) => b.disabled), "CPU busy: no second dispatch is possible");
      [...s.querySelectorAll("button")].find((b) => /^timeout/.test(b.textContent)).click();
      assert.ok(dispatch().every((b) => !b.disabled), "after preemption the CPU is free again");

      const f = sim(doc, "forktree");
      assert.equal(f.querySelectorAll("svg circle").length, 8);
      setValue(w, f.querySelector('input[type="range"]'), 4);
      assert.equal(f.querySelectorAll("svg circle").length, 16);
      assert.ok(/= 16 processes/.test(text(f)));
    });
  });

  QUnit.test("Module 4: scheduling simulator recomputes metrics", async (assert) => {
    await withPage("modules/04-scheduling.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "scheduling");
      assert.equal(metrics(s)[0], "6.67", "FCFS average waiting time for the textbook preset");
      assert.ok(s.querySelectorAll("svg rect").length >= 3, "Gantt chart drawn");
      const algo = field(s, "Algorithm");
      setValue(w, algo, "SJF", "change");
      assert.equal(metrics(s)[0], "4.00", "SJF average waiting time");
      setValue(w, algo, "RR", "change");
      assert.notEqual(field(s, "Time quantum").closest("label").style.display, "none", "quantum slider appears for Round Robin");
      setValue(w, field(s, "Time quantum"), 1);
      const csSmall = +metrics(s)[3];
      setValue(w, field(s, "Time quantum"), 12);
      assert.ok(csSmall > +metrics(s)[3], "smaller quantum causes more context switches");
      // editing a burst time
      setValue(w, algo, "FCFS", "change");
      setValue(w, s.querySelector('input[aria-label="P1 burst"]'), 10);
      assert.equal(metrics(s)[0], "9.33", "P1 burst 10, then P2 (8) and P3 (3): waits 0, 10, 18 → 28/3");
      // compare table highlights the best algorithm
      assert.ok(/★/.test(text(s)));
      // adding and removing processes
      button(s, "+ Add process").click();
      assert.equal(s.querySelectorAll("tbody tr input[aria-label$=' burst']").length, 4);
      s.querySelector('button[aria-label="Remove P4"]').click();
      assert.equal(s.querySelectorAll("tbody tr input[aria-label$=' burst']").length, 3);
      // every preset renders without error
      const preset = field(s, "Preset");
      [...preset.options].forEach((o) => { setValue(w, preset, o.value, "change"); assert.ok(metrics(s).length === 5, `preset “${o.value}” renders`); });
    });
  });

  QUnit.test("Module 5: Amdahl explorer", async (assert) => {
    await withPage("modules/05-threads.html", ({ window: w, document: doc }) => {
      const a = sim(doc, "amdahl");
      assert.equal(metrics(a)[0], "4.71×", "p = 0.9, N = 8");
      setValue(w, field(a, "Parallel fraction"), 0.5);
      assert.equal(metrics(a)[2], "2.0×", "limit with p = 0.5");
      setValue(w, field(a, "Parallel fraction"), 0.99);
      assert.ok(a.querySelectorAll("svg path").length > 6);
      const c = sim(doc, "switchcost");
      assert.equal(metrics(c)[0], "90.9%", "q = 10, s = 1");
    });
  });

  QUnit.test("Module 6: race condition lab shows a lost update, and the mutex blocks", async (assert) => {
    await withPage("modules/06-synchronization.html", ({ window: w, document: doc }) => {
      const r = sim(doc, "race");
      setValue(w, field(r, "Increments"), 1);
      const t1 = () => button(r, "Step thread 1"), t2 = () => button(r, "Step thread 2");
      t1().click(); t2().click(); t1().click(); t2().click(); t1().click(); t2().click(); // L L A A S S
      assert.ok(/Wrong: expected 2 but got 1/.test(text(r)), "interleaving loses an update");
      button(r, "Reset").click();
      t1().click(); t1().click(); t1().click(); t2().click(); t2().click(); t2().click();
      assert.ok(/Correct: 2 = 2/.test(text(r)), "serial execution is correct");
      // mutex
      const cb = r.querySelector('input[type="checkbox"]'); cb.checked = true; fire(w, cb, "change");
      t1().click(); // LOCK
      assert.true(t2().disabled, "thread 2 is blocked while thread 1 holds the mutex");
      assert.ok(/BLOCKED on mutex/.test(text(r)));
      button(r, "Run 1000 random schedules").click();
      assert.ok(/0 of 1000 random schedules produced the wrong answer/.test(text(r)), "mutex: never wrong");
      cb.checked = false; fire(w, cb, "change");
      button(r, "Run 1000 random schedules").click();
      const m = text(r).match(/(\d+) of 1000 random schedules produced the wrong answer/);
      assert.ok(m && +m[1] > 0, `without a mutex some schedules go wrong (${m && m[1]})`);

      const b = sim(doc, "boundedbuffer");
      for (let i = 0; i < 40; i++) button(b, "Single tick").click();
      const [empty, full] = metrics(b).map(Number);
      assert.equal(empty + full, 6, "empty + full = N");
      setValue(w, field(b, "Buffer size"), 3);
      assert.equal(metrics(b)[0], "3", "resizing resets the buffer");
    });
  });

  QUnit.test("Module 7: Banker's algorithm and dining philosophers", async (assert) => {
    await withPage("modules/07-deadlocks.html", ({ window: w, document: doc }) => {
      const b = sim(doc, "banker");
      assert.ok(/SAFE\./.test(text(b)) && /P1 → P3 → P4 → P0 → P2/.test(text(b)), "textbook state is safe");
      b.querySelector('select[aria-label="Requesting process"]').value = "4";
      const inputs = [...b.querySelectorAll('input[aria-label^="Request for resource"]')];
      [3, 3, 0].forEach((v, i) => { inputs[i].value = v; });
      button(b, "Check request").click();
      assert.ok(/unsafe/.test(text(b)), "P4 (3,3,0) is denied");
      setValue(w, field(b, "Preset"), "Unsafe state", "change");
      assert.ok(/UNSAFE\./.test(text(b)));
      b.querySelector('input[aria-label="Available A"]').value = 5; fire(w, b.querySelector('input[aria-label="Available A"]'), "input");

      const p = sim(doc, "philosophers");
      setValue(w, field(p, "Strategy"), "ordered", "change");
      for (let i = 0; i < 300; i++) button(p, "Step").click();
      assert.false(/DEADLOCK/.test(text(p)), "resource ordering never deadlocks");
      assert.ok(p.querySelectorAll("svg circle").length >= 5);
      setValue(w, field(p, "Strategy"), "naive", "change");
      let found = false;
      for (let seed = 1; seed <= 30 && !found; seed++) {
        setValue(w, field(p, "Random seed"), seed);
        for (let i = 0; i < 400 && !found; i++) { button(p, "Step").click(); found = /DEADLOCK/.test(text(p)); }
      }
      assert.true(found, "the naive strategy deadlocks for some seed");
    });
  });

  QUnit.test("Module 8: allocation shows external fragmentation; paging translates addresses", async (assert) => {
    await withPage("modules/08-memory.html", ({ window: w, document: doc }) => {
      const m = sim(doc, "memalloc");
      button(m, "Load fragmented example").click();
      assert.deepEqual(metrics(m).slice(0, 2), ["330 KB", "100 KB"], "330 KB free but largest hole is 100 KB");
      setValue(w, field(m, "Request size"), 150);
      button(m, "Allocate").click();
      assert.ok(/external fragmentation/.test(text(m)), "request fails because of external fragmentation");
      button(m, "Compact memory").click();
      assert.equal(metrics(m)[1], "330 KB", "after compaction one hole of 330 KB");
      button(m, "Allocate").click();
      assert.ok(/P8 \(150 KB\) placed/.test(text(m)));
      button(m, "Reset").click();
      setValue(w, field(m, "Request size"), 100);
      for (let i = 0; i < 3; i++) button(m, "Allocate").click();
      assert.ok(/P3 \(100 KB\) placed/.test(text(m)));

      const p = sim(doc, "paging");
      assert.ok(/Page 5 → frame 28/.test(text(p)), "address 1300 is in page 5, mapped to frame 28");
      assert.ok(/= 7188/.test(text(p)), "1300 → frame 28 → physical 7188");
      const row = p.querySelector('input[aria-label="Frame for page 5"]'); row.value = ""; fire(w, row, "input");
      assert.ok(/Page fault \/ invalid reference/.test(text(p)), "clearing the mapping makes the access invalid");
      setValue(w, field(p, "Page size"), 1024, "change");
      assert.equal(p.querySelectorAll('input[aria-label^="Frame for page"]').length, 4, "4096 / 1024 = 4 pages");
    });
  });

  QUnit.test("Module 9: page replacement reproduces Belady's anomaly; EAT calculator", async (assert) => {
    await withPage("modules/09-virtual-memory.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "pagerepl");
      assert.equal(metrics(s)[0], "9", "FIFO, 3 frames");
      setValue(w, field(s, "Frames"), 4);
      assert.equal(metrics(s)[0], "10", "FIFO, 4 frames: more frames, more faults");
      assert.ok(/Belady's anomaly: FIFO gets worse going to 4/.test(text(s)), "chart annotates the anomaly");
      setValue(w, field(s, "Algorithm"), "LRU", "change");
      setValue(w, field(s, "Frames"), 3);
      assert.equal(metrics(s)[0], "10", "LRU, 3 frames on the Belady string");
      setValue(w, field(s, "Preset"), "Classic textbook string", "change");
      setValue(w, field(s, "Algorithm"), "OPT", "change");
      assert.equal(metrics(s)[0], "9", "OPT on the classic string");
      setValue(w, s.querySelector('input[type="text"]'), "1 2 x");
      assert.ok(/non-negative integers/.test(text(s)), "bad input is reported");
      setValue(w, s.querySelector('input[type="text"]'), "1 2 3 1 2 3");
      assert.equal(metrics(s)[0], "3", "OPT with 3 frames: only cold misses");
      setValue(w, field(s, "Algorithm"), "CLOCK", "change");
      assert.ok(s.querySelectorAll("svg").length >= 2);

      const e = sim(doc, "eat");
      assert.ok(/8,?099\.9 ns/.test(metrics(e)[0]) || /8,?100 ns/.test(metrics(e)[0]), "p = 0.001: ≈ 8100 ns");
      assert.equal(metrics(e)[1], "81.00×");
    });
  });

  QUnit.test("Module 10: disk scheduling totals match the textbook", async (assert) => {
    await withPage("modules/10-disk-io.html", ({ window: w, document: doc }) => {
      const d = sim(doc, "disk");
      assert.equal(metrics(d)[0], "640", "FCFS");
      const algo = field(d, "Algorithm");
      const expected = { SSTF: "236", SCAN: "331", CSCAN: "382", LOOK: "299", CLOOK: "322" };
      for (const [a, total] of Object.entries(expected)) { setValue(w, algo, a, "change"); assert.equal(metrics(d)[0], total, a); }
      assert.notEqual(field(d, "Initial direction").closest("label").style.display, "none", "direction shown for sweep algorithms");
      setValue(w, field(d, "Initial direction"), "down", "change");
      assert.equal(metrics(d)[0], "326", "C-LOOK sweeping down first: 16+23 down, jump 169 up, then 59+2+24+31+2 down");
      setValue(w, d.querySelector('input[type="text"]'), "5 9999");
      assert.ok(/between 0 and 199/.test(text(d)), "out-of-range request rejected");
      button(d, "Textbook queue").click();
      assert.ok(d.querySelectorAll("svg circle").length >= 9);
      button(d, "Random queue").click();
      assert.ok(/All algorithms/.test(text(d)) && /★/.test(text(d)));
    });
  });

  QUnit.module("pages: animations");

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frameLabel = (s) => s.querySelector(".player .small").textContent;

  QUnit.test("Scheduler: stepping through time fills the Gantt chart and moves processes between CPU and queue", async (assert) => {
    await withPage("modules/04-scheduling.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "scheduling");
      assert.ok(s.querySelector(".player"), "player controls present");
      assert.equal(frameLabel(s), "time 17 / 17", "starts in the finished state");
      assert.equal(s.querySelectorAll("svg g.seg").length, 3, "full Gantt chart at the end");
      button(s, "⟲ Restart").click();
      assert.equal(frameLabel(s), "time 0 / 17");
      assert.equal(s.querySelectorAll("svg g.seg").length, 0, "nothing has run at t = 0");
      assert.ok(/CPU:\s*P1 · 6 left/.test(text(s.querySelector(".cpu-strip"))), "P1 is on the CPU");
      assert.ok(/P2 · 8/.test(text(s.querySelector(".cpu-strip"))) && /P3 · 3/.test(text(s.querySelector(".cpu-strip"))), "P2 and P3 wait in the queue");
      button(s, "Step ▶").click();
      assert.equal(s.querySelectorAll("svg g.seg").length, 1);
      assert.ok(/P1 · 5 left/.test(text(s.querySelector(".cpu-strip"))), "one time unit of P1 consumed");
      for (let i = 0; i < 5; i++) button(s, "Step ▶").click();
      const strip = text(s.querySelector(".cpu-strip"));
      assert.ok(/CPU:\s*P2/.test(strip) && /Done:\s*P1/.test(strip) && /Ready queue →\s*P3/.test(strip), `t = 6: ${strip}`);
      button(s, "◀ Back").click();
      assert.equal(frameLabel(s), "time 5 / 17", "step back");
      for (let i = 0; i < 20; i++) button(s, "Step ▶").click();
      assert.equal(frameLabel(s), "time 17 / 17", "stops at the end");
      assert.ok(/finished/.test(text(s.querySelector(".cpu-strip"))));
      // changing an input resets the animation to the finished state of the new schedule
      button(s, "⟲ Restart").click();
      setValue(w, field(s, "Algorithm"), "SJF", "change");
      assert.equal(frameLabel(s), "time 17 / 17");
    });
  });

  QUnit.test("Scheduler: Play advances on a timer, Pause stops it, Restart-from-end replays", async (assert) => {
    await withPage("modules/04-scheduling.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "scheduling");
      const speed = s.querySelector('select[aria-label="Animation speed"]');
      setValue(w, speed, "Fast", "change");
      const play = button(s, "▶ Play");
      play.click();                                    // at the end → restarts from 0
      assert.equal(play.textContent, "⏸ Pause");
      assert.equal(frameLabel(s), "time 0 / 17", "play from the finished state rewinds first");
      return sleep(900).then(() => {
        const n = +frameLabel(s).match(/time (\d+)/)[1];
        assert.ok(n >= 2 && n < 17, `advanced on its own to t = ${n}`);
        play.click();                                  // pause
        assert.equal(play.textContent, "▶ Play");
        const frozen = frameLabel(s);
        return sleep(600).then(() => assert.equal(frameLabel(s), frozen, "paused: no further progress"));
      });
    });
  });

  QUnit.test("Page replacement: references are processed one at a time with a running commentary", async (assert) => {
    await withPage("modules/09-virtual-memory.html", ({ document: doc }) => {
      const s = sim(doc, "pagerepl");
      assert.equal(frameLabel(s), "12 of 12 references");
      button(s, "⟲ Restart").click();
      assert.ok(/Press Play or Step/.test(text(s)));
      button(s, "Step ▶").click(); button(s, "Step ▶").click(); button(s, "Step ▶").click();
      assert.ok(/Reference 3 of 12: page 3 → PAGE FAULT \(a frame was free\)\. Faults so far: 3\./.test(text(s)), "cold misses fill free frames");
      for (let i = 0; i < 1; i++) button(s, "Step ▶").click();
      assert.ok(/Reference 4 of 12: page 4 → PAGE FAULT, evicts page 1/.test(text(s)), "FIFO evicts the oldest page");
      const revealed = s.querySelectorAll("svg .pop").length;
      assert.equal(revealed, 1, "the current column is outlined");
      for (let i = 0; i < 8; i++) button(s, "Step ▶").click();
      assert.equal(frameLabel(s), "12 of 12 references");
      assert.equal(metrics(s)[0], "9", "metrics always show the final result");
    });
  });

  QUnit.test("Disk: the arm moves one request at a time and the running total matches", async (assert) => {
    await withPage("modules/10-disk-io.html", ({ document: doc }) => {
      const d = sim(doc, "disk");
      assert.equal(frameLabel(d), "move 8 of 8");
      assert.ok(/Finished: 640 cylinders/.test(text(d)));
      button(d, "⟲ Restart").click();
      assert.ok(/Head at cylinder 53/.test(text(d)));
      button(d, "Step ▶").click();
      assert.ok(/Move 1: 53 → 98\. Cylinders moved so far: 45 of 640\./.test(text(d)));
      button(d, "Step ▶").click();
      assert.ok(/Move 2: 98 → 183\. Cylinders moved so far: 130 of 640\./.test(text(d)), "45 + 85");
      button(d, "◀ Back").click();
      assert.ok(/Move 1: 53 → 98/.test(text(d)));
      for (let i = 0; i < 10; i++) button(d, "Step ▶").click();
      assert.ok(/Finished: 640 cylinders/.test(text(d)));
      assert.ok(d.querySelectorAll("svg .overlay line").length >= 7, "full path drawn at the end");
    });
  });

  QUnit.test("Amdahl: the timeline shows a serial phase, then a parallel phase", async (assert) => {
    await withPage("modules/05-threads.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "amdahl");
      assert.ok(/speedup 4\.71×/.test(text(s)), "final state reports the speedup");
      button(s, "⟲ Restart").click();
      for (let i = 0; i < 2; i++) button(s, "Step ▶").click();        // 2/40 of the single-core time, inside the 10% serial part
      assert.ok(/Serial phase/.test(text(s)));
      for (let i = 0; i < 4; i++) button(s, "Step ▶").click();
      assert.ok(/Parallel phase/.test(text(s)), "after the serial 10% the other cores join in");
      assert.equal(s.querySelectorAll("svg").length, 2, "speedup chart + timeline");
      setValue(w, field(s, "Your core count"), 64);
      assert.ok(/and 52 more cores/.test(text(s)), "only 12 lanes are drawn for large N");
    });
  });

  QUnit.test("Fork tree: each fork() call reveals the next doubling", async (assert) => {
    await withPage("modules/03-processes.html", ({ document: doc }) => {
      const f = sim(doc, "forktree");
      assert.equal(frameLabel(f), "fork() call 3 of 3");
      button(f, "⟲ Restart").click();
      assert.ok(/Before any fork/.test(text(f)));
      const visible = () => [...f.querySelectorAll("svg g.n")].filter((g) => +g.getAttribute("opacity") === 1).length;
      assert.equal(visible(), 1, "only the original process");
      button(f, "Step ▶").click();
      assert.equal(visible(), 2);
      button(f, "Step ▶").click();
      assert.equal(visible(), 4);
      assert.ok(/After fork\(\) call #2: 4 processes/.test(text(f)));
      button(f, "Step ▶").click();
      assert.equal(visible(), 8);
    });
  });

  QUnit.test("Process states: auto-play makes legal moves by itself", async (assert) => {
    assert.timeout(15000);
    await withPage("modules/03-processes.html", ({ document: doc }) => {
      const s = sim(doc, "procstates");
      const auto = button(s, "▶ Auto-play");
      auto.click();
      assert.equal(auto.textContent, "⏸ Pause");
      return sleep(2000).then(() => {
        const lines = [...s.querySelectorAll(".log div")].map((d) => d.textContent);
        assert.ok(lines.length >= 2, `${lines.length} events logged: ${lines.slice(0, 3).join(" | ")}`);
        assert.ok(lines.some((l) => /created/.test(l)));
        assert.ok(s.querySelectorAll("svg circle.pop").length >= 1, "the most recently moved process pops");
        auto.click();
        assert.equal(auto.textContent, "▶ Auto-play");
        const n = s.querySelectorAll(".log div").length;
        return sleep(1100).then(() => assert.equal(s.querySelectorAll(".log div").length, n, "paused"));
      });
    });
  });

  QUnit.test("Banker's: the safety check can be animated resource by resource", async (assert) => {
    await withPage("modules/07-deadlocks.html", ({ window: w, document: doc }) => {
      const b = sim(doc, "banker");
      assert.equal(frameLabel(b), "5 of 5 processes finished");
      button(b, "⟲ Restart").click();
      assert.ok(/Start: only the Available/.test(text(b)));
      button(b, "Step ▶").click();
      assert.ok(/P1 can finish/.test(text(b)) && /Work is now \(5, 3, 2\)/.test(text(b)), "after P1: (3,3,2) + (2,0,0)");
      assert.equal(b.querySelectorAll("tbody tr.hl").length, 1, "current step highlighted in the table");
      button(b, "Step ▶").click();
      assert.ok(/Work is now \(7, 4, 3\)/.test(text(b)), "after P3");
      setValue(w, field(b, "Preset"), "Unsafe state", "change");
      assert.ok(/no safe sequence|of \d+ processes finished/.test(frameLabel(b)));
    });
  });

  QUnit.test("Race lab: auto-run animates a random schedule to completion", async (assert) => {
    assert.timeout(15000);
    await withPage("modules/06-synchronization.html", ({ window: w, document: doc }) => {
      const r = sim(doc, "race");
      setValue(w, field(r, "Increments"), 1);
      const auto = button(r, "▶ Auto-run (random schedule)");
      auto.click();
      assert.equal(auto.textContent, "⏸ Pause");
      return sleep(3700).then(() => { // 6 steps + one tick to notice it is finished, at 450 ms each
        assert.ok(/Correct|Wrong/.test(text(r)), "ran to completion by itself");
        assert.equal(auto.textContent, "▶ Auto-run (random schedule)", "stops itself at the end");
      });
    });
  });

  QUnit.test("Memory allocation: a newly placed block pops in", async (assert) => {
    await withPage("modules/08-memory.html", ({ window: w, document: doc }) => {
      const m = sim(doc, "memalloc");
      assert.equal(m.querySelectorAll("svg g.pop").length, 0);
      setValue(w, field(m, "Request size"), 100);
      button(m, "Allocate").click();
      assert.equal(m.querySelectorAll("svg g.pop").length, 1);
      button(m, "Compact memory").click();
      assert.equal(m.querySelectorAll("svg g.pop").length, 0, "animation cleared on the next action");
    });
  });

  QUnit.module("pages: Module 12 (OS landscape)");

  const cardButton = (c, id) => c.querySelector(`button[data-os="${id}"]`);
  const colHeads = (c) => [...c.querySelectorAll("table.compare thead th")].slice(1).map((th) => th.textContent.trim());
  const rowCount = (c) => c.querySelectorAll("table.compare tbody tr[data-row]").length;

  QUnit.test("Compare tool: pick systems with the Compare buttons and read them side by side", async (assert) => {
    await withPage("modules/12-os-landscape.html", ({ window: w, document: doc }) => {
      const c = sim(doc, "oscompare"), osCount = w.OSData.osList.length;
      assert.equal(c.querySelectorAll("article.os-card").length, osCount, "one card per operating system");
      assert.ok(/Nothing selected yet/.test(text(c)));
      const labels = [...c.querySelectorAll("button[data-os]")].map((b) => b.textContent);
      assert.ok(labels.every((l) => l === "＋ Compare"), "every card has a Compare button");
      cardButton(c, "android").click(); cardButton(c, "ios").click();
      assert.deepEqual(colHeads(c), ["Android", "iOS / iPadOS"]);
      assert.equal(cardButton(c, "android").getAttribute("aria-pressed"), "true");
      assert.equal(cardButton(c, "android").textContent, "✓ In comparison");
      assert.equal(rowCount(c), 15, "all 15 attributes shown");
      assert.ok(/low-memory killer/.test(text(c.querySelector("table.compare"))), "real content in the table");
      // hide a section
      const basics = c.querySelector('input[aria-label="Show section Basics"]'); basics.checked = false; fire(w, basics, "change");
      assert.equal(rowCount(c), 10);
      assert.false(/Typical hardware/.test(text(c.querySelector("table.compare"))));
      basics.checked = true; fire(w, basics, "change");
      assert.equal(rowCount(c), 15);
      // remove with the chip
      c.querySelector('button[aria-label="Remove iOS / iPadOS"]').click();
      assert.deepEqual(colHeads(c), ["Android"]);
      assert.ok(/Add another system/.test(text(c)));
      // toggling the card again removes it
      cardButton(c, "android").click();
      assert.ok(/Nothing selected yet/.test(text(c)));
      assert.equal(cardButton(c, "android").getAttribute("aria-pressed"), "false");
    });
  });

  QUnit.test("Compare tool: limit of five, presets, clear, and the Compare button", async (assert) => {
    await withPage("modules/12-os-landscape.html", ({ window: w, document: doc }) => {
      const c = sim(doc, "oscompare");
      button(c, "Compare selected ▼").click();
      assert.ok(/Choose at least one system/.test(text(c)), "asks for a selection first");
      ["windows", "macos", "linux", "android", "ios"].forEach((id) => cardButton(c, id).click());
      assert.equal(colHeads(c).length, 5);
      cardButton(c, "qubes").click();
      assert.ok(/up to 5 systems/.test(text(c)), "sixth selection refused with a message");
      assert.equal(colHeads(c).length, 5);
      assert.equal(cardButton(c, "qubes").getAttribute("aria-pressed"), "false");
      button(c, "Clear all").click();
      assert.ok(/Nothing selected yet/.test(text(c)));
      const preset = field(c, "Quick comparisons");
      setValue(w, preset, "Mainframe and midrange", "change");
      assert.deepEqual(colHeads(c), ["z/OS (MVS)", "z/VSE", "IBM i (iSeries)"], "mainframe preset");
      assert.equal(preset.value, "", "preset menu resets");
      for (const name of [...preset.options].map((o) => o.value).filter(Boolean)) {
        setValue(w, preset, name, "change");
        assert.ok(colHeads(c).length >= 2 && colHeads(c).length <= 5, `preset “${name}” gives a valid comparison`);
      }
      button(c, "Compare selected ▼").click();
      assert.equal(c.querySelector(".status-bad").textContent, "", "no error once something is selected");
    });
  });

  QUnit.test("Compare tool: full-profile details and shareable links", async (assert) => {
    await withPage("modules/12-os-landscape.html", ({ document: doc }) => {
      const c = sim(doc, "oscompare");
      assert.deepEqual(colHeads(c), ["Windows (NT)", "z/OS (MVS)"], "a #compare=… link preselects systems");
      assert.equal(cardButton(c, "zos").getAttribute("aria-pressed"), "true");
      assert.ok(/EBCDIC/.test(c.querySelector('[data-card="zos"] details').textContent), "full profile is available on the card");
    }, "#compare=windows,zos");
    await withPage("modules/12-os-landscape.html", ({ document: doc }) => {
      const c = sim(doc, "oscompare");
      assert.deepEqual(colHeads(c), ["Linux (distributions)"], "unknown ids in the link are ignored");
    }, "#compare=bogus,linux");
  });

  QUnit.test("Family tree: select a system to see its lineage and add it to the comparison", async (assert) => {
    await withPage("modules/12-os-landscape.html", ({ window: w, document: doc }) => {
      const t = sim(doc, "oslineage"), c = sim(doc, "oscompare");
      assert.equal(t.querySelectorAll("g[data-node]").length, w.OSData.osTree.nodes.length, "every system is on the timeline");
      assert.equal(t.querySelectorAll("svg path").length, w.OSData.osTree.edges.length + 1, "one line per inheritance edge (+ the axis)");
      const node = (id) => t.querySelector(`g[data-node="${id}"]`);
      node("zos").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
      assert.ok(/z\/OS \(2001\)/.test(text(t)) && /← OS\/390 \(derived\)/.test(text(t)), "lineage shown");
      node("unix").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      assert.ok(/Unix \(1971\)/.test(text(t)) && /→ Linux \(inspired by\)/.test(text(t)), "keyboard activation works");
      assert.ok(!/Add .* to the comparison/.test(text(t)), "systems without a profile have no add button (Unix)");
      node("android").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
      button(t, "Add Android to the comparison").click();
      assert.deepEqual(colHeads(c), ["Android"], "the tree feeds the compare tool");
      assert.ok([...t.querySelectorAll("g[data-node]")].every((g) => g.getAttribute("tabindex") === "0" && g.getAttribute("role") === "button"), "keyboard accessible");
    });
  });

  QUnit.module("pages: Python labs and calculation practice");

  QUnit.test("Source viewer: highlighted blocks in lessons, the cheat sheet and the labs index keep their text and get the right language", async (assert) => {
    const cases = [["cheatsheet.html", ["bash", "python", "python"]], ["modules/03-processes.html", ["c"]], ["modules/05-threads.html", ["python"]], ["modules/02-security.html", ["bash"]], ["modules/01-fundamentals.html", ["c"]], ["labs.html", ["bash"]]];
    for (const [rel, langs] of cases) {
      await withPage(rel, ({ window: w, document: doc }) => {
        const blocks = [...doc.querySelectorAll("pre[data-lang]:not(.code)")];
        assert.deepEqual(blocks.map((b) => b.dataset.lang), langs, `${rel}: languages`);
        blocks.forEach((b) => {
          assert.ok(b.querySelector("code.language-" + b.dataset.lang + " .token"), `${rel}: ${b.dataset.lang} block has highlighted tokens`);
          assert.ok(b.textContent.trim().length > 20, "text is intact");
        });
        assert.ok(w.Prism && w.Prism.manual === true && Object.keys(w.Prism.languages).includes("c") && Object.keys(w.Prism.languages).includes("python"), "vendored Prism loaded with C and Python");
      });
    }
    await withPage("modules/03-processes.html", ({ document: doc }) => {
      const code = doc.querySelector("pre[data-lang=c] code");
      assert.ok(code.querySelector(".token.macro, .token.directive"), "#include is highlighted as a directive");
      assert.ok(code.querySelector(".token.keyword"), "C keywords");
    });
  });

  QUnit.test("Labs index lists every lab with its related lessons", async (assert) => {
    await withPage("labs.html", ({ window: w, document: doc }) => {
      const cards = [...doc.querySelectorAll("#lab-grid .card")];
      assert.equal(cards.length, w.OSData.labs.length);
      assert.deepEqual(cards.map((c) => c.getAttribute("href")), w.OSData.labs.map((l) => `labs/${l.slug}.html`));
      assert.ok(cards.every((c) => c.querySelectorAll(".tag").length >= 2), "each card shows its related modules");
      assert.ok(/os\.fork/.test(doc.body.textContent), "explains the Windows limitation");
    });
  });

  QUnit.test("Navigation includes Labs and Problems on every page", async (assert) => {
    await withPage("index.html", ({ document: doc }) => {
      const links = [...doc.querySelectorAll("header.site nav a")].map((a) => [a.textContent, a.getAttribute("href")]);
      assert.deepEqual(links.filter(([t]) => ["Labs", "Problems"].includes(t)), [["Labs", "labs.html"], ["Problems", "problems.html"]]);
      assert.ok([...doc.querySelectorAll("main a.btn")].some((a) => a.getAttribute("href") === "problems.html"), "home page promotes the problems");
    });
    await withPage("labs/02-threads.html", ({ document: doc }) => {
      assert.deepEqual([...doc.querySelectorAll("header.site nav a")].filter((a) => ["Labs", "Problems"].includes(a.textContent)).map((a) => a.getAttribute("href")), ["../labs.html", "../problems.html"]);
    });
  });

  const lib = require("../js/lib/problems.js");
  const inputOf = (doc) => doc.querySelector('#problem input[type="text"]');
  const checkBtn = (doc) => button(doc.getElementById("problem"), "Check answer");
  const status = (doc) => doc.getElementById("result");

  QUnit.test("Problems: a problem link shows exactly the problem the generator produces", async (assert) => {
    await withPage("problems.html", ({ window: w, document: doc }) => {
      const expected = lib.generateProblem("scheduling", 123, 2);
      const host = doc.getElementById("problem");
      assert.equal(host.querySelector(".prompt").innerHTML, expected.prompt, "same prompt as the library");
      assert.ok(host.textContent.includes("scheduling:123:2"), "problem code shown");
      assert.equal(doc.getElementById("topic").value, "scheduling"); assert.equal(doc.getElementById("level").value, "2");
      assert.equal(doc.getElementById("topic").options.length, 11, "any topic + 10 kinds");
      assert.ok(host.querySelector('a[href="modules/04-scheduling.html"]'), "links back to the lesson");
    }, "#p=scheduling:123:2");
  });

  QUnit.test("Problems: correct answer, wrong answer, hint, solution steps and score", async (assert) => {
    await withPage("problems.html", ({ window: w, document: doc }) => {
      const p = lib.generateProblem("disk", 4242, 1), host = doc.getElementById("problem");
      assert.equal(status(doc).hidden, true, "no result before checking");
      checkBtn(doc).click();
      assert.ok(/Enter an answer first/.test(status(doc).textContent), "empty answer is refused politely");
      setValue(w, inputOf(doc), String(p.answer + 11)); checkBtn(doc).click();
      assert.ok(/✗ Not quite/.test(status(doc).textContent), "wrong answer");
      assert.true(host.querySelector(".explain:not([role]):not(#result)").hidden, "a wrong answer does not reveal the solution");
      button(host, "Hint").click();
      assert.false([...host.querySelectorAll("p.small")].find((n) => /^Hint:/.test(n.textContent)).hidden, "hint shown on request");
      setValue(w, inputOf(doc), String(p.answer)); checkBtn(doc).click();
      assert.ok(/✓ Correct/.test(status(doc).textContent) && !/first try/.test(status(doc).textContent), "correct on the second try is not a first-try win");
      assert.false(host.querySelector(".explain:not([role]):not(#result)").hidden, "solution steps appear after solving");
      assert.ok(/0 of 1 problem solved on the first try/.test(doc.getElementById("score").textContent));
      assert.ok(host.querySelectorAll("ol li").length >= 3, "worked steps listed");
      // next problem, solved first time
      button(doc.body, "New problem").click();
      const q = lib.parseProblemCode(/problem code: (\S+)/i.exec(doc.getElementById("problem").textContent.replace(/\s+/g, " "))[1]);
      const p2 = lib.generateProblem(q.kind, q.seed, q.level);
      setValue(w, doc.querySelector('#problem input[type="text"]') || { value: "", dispatchEvent() {} }, p2.answerType === "choice" ? "" : p2.answerText.replace(/,/g, ""));
      if (p2.answerType === "choice") doc.querySelector(`#problem input[name="choice"][value="${p2.answer}"]`).checked = true;
      checkBtn(doc).click();
      assert.ok(/✓ Correct\. .*Solved on the first try/.test(status(doc).textContent), "first-try success is recognized");
      assert.ok(/1 of 2 problems solved on the first try/.test(doc.getElementById("score").textContent));
    }, "#p=disk:4242:1");
  });

  QUnit.test("Problems: showing the steps gives up the first-try credit; Enter submits", async (assert) => {
    await withPage("problems.html", ({ window: w, document: doc }) => {
      const p = lib.generateProblem("amdahl", 9, 1), host = doc.getElementById("problem");
      button(host, "Show solution steps").click();
      assert.ok(host.textContent.includes(p.answerText), "answer revealed");
      assert.false(host.querySelector(".explain:not([role]):not(#result)").hidden);
      setValue(w, inputOf(doc), p.answerText);
      inputOf(doc).dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      assert.ok(/✓ Correct/.test(status(doc).textContent) && !/first try/.test(status(doc).textContent));
      assert.ok(/0 of 1 problem solved/.test(doc.getElementById("score").textContent));
    }, "#p=amdahl:9:1");
  });

  QUnit.test("Problems: multiple-choice problems use radio buttons", async (assert) => {
    await withPage("problems.html", ({ window: w, document: doc }) => {
      const p = lib.generateProblem("banker", 5, 1);
      assert.equal(p.answerType, "choice");
      const radios = [...doc.querySelectorAll('#problem input[type="radio"]')];
      assert.equal(radios.length, 2); assert.ok(doc.querySelector("#problem fieldset legend"), "grouped and labelled");
      radios[1 - p.answer].checked = true; checkBtn(doc).click();
      assert.ok(/✗/.test(status(doc).textContent));
      radios[p.answer].checked = true; checkBtn(doc).click();
      assert.ok(/✓ Correct/.test(status(doc).textContent));
    }, "#p=banker:5:1");
  });

  QUnit.test("Problems: topic and difficulty pickers, lesson topic links, and untrusted hashes", async (assert) => {
    await withPage("problems.html", ({ window: w, document: doc }) => {
      const topic = doc.getElementById("topic"), code = () => /problem code: (\S+)/i.exec(doc.getElementById("problem").textContent.replace(/\s+/g, " "))[1];
      setValue(w, topic, "pagerepl", "change");
      assert.ok(code().startsWith("pagerepl:"), code());
      setValue(w, doc.getElementById("level"), "2", "change");
      assert.ok(code().startsWith("pagerepl:") && code().endsWith(":2"), code());
      const before = code(); button(doc.body, "New problem").click();
      assert.notEqual(code(), before, "a new problem has a new code");
      const seen = new Set();
      setValue(w, topic, "any", "change");
      for (let i = 0; i < 40; i++) { button(doc.body, "New problem").click(); seen.add(code().split(":")[0]); }
      assert.ok(seen.size >= 5, `“any topic” varies: ${[...seen].join(", ")}`);
      for (const k of lib.problemKinds) { setValue(w, topic, k.id, "change"); assert.ok(inputOf(doc) || doc.querySelector('#problem input[type="radio"]'), `${k.id} shows an answer control`); }
    });
    await withPage("problems.html", ({ document: doc }) => assert.equal(doc.getElementById("topic").value, "paging"), "#topic=paging");
    for (const bad of ["#p=constructor:1:1", "#p=<img src=x onerror=alert(1)>:1:1", "#p=scheduling:1:9", "#topic=__proto__", "#p=%E0%A4%A"]) {
      await withPage("problems.html", ({ document: doc, errors }) => {
        assert.deepEqual(errors, [], `${bad}: no script errors`);
        assert.ok(doc.querySelector("#problem .prompt"), `${bad}: falls back to a normal problem`);
        assert.false(/onerror/.test(doc.getElementById("problem").innerHTML), "nothing from the hash is injected into the page");
      }, bad);
    }
  });

  QUnit.test("A malformed link hash never breaks a page", async (assert) => {
    for (const rel of ["index.html", "glossary.html", "modules/04-scheduling.html", "modules/12-os-landscape.html", "labs/01-processes.html", "problems.html"]) {
      for (const bad of ["#%E0%A4%A", "#term-%zz", "#compare=%ff%ff", "#" + "x".repeat(5000)]) {
        await withPage(rel, ({ errors, document: doc }) => assert.deepEqual(errors, [], `${rel}${bad.slice(0, 14)}: no script errors`), bad);
      }
    }
  });

  QUnit.test("Lessons link to the matching Python labs", async (assert) => {
    const expected = { "03-processes": ["01-processes"], "04-scheduling": ["03-resources"], "05-threads": ["02-threads"], "06-synchronization": ["02-threads", "04-semaphores-deadlock"],
      "07-deadlocks": ["04-semaphores-deadlock"], "08-memory": ["03-resources"], "09-virtual-memory": ["03-resources"], "10-disk-io": ["03-resources"] };
    for (const [slug, labs] of Object.entries(expected)) {
      await withPage(`modules/${slug}.html`, ({ document: doc }) => {
        const hrefs = [...doc.querySelectorAll('a[href^="../labs/"]')].map((a) => a.getAttribute("href").replace("../labs/", "").replace(".html", ""));
        assert.deepEqual(hrefs, labs, `${slug} links to ${labs.join(", ")}`);
      });
    }
  });

  QUnit.test("Lessons link to matching practice problems", async (assert) => {
    for (const [file, kinds] of [["modules/04-scheduling.html", ["scheduling"]], ["modules/08-memory.html", ["paging", "memalloc"]], ["modules/09-virtual-memory.html", ["pagerepl", "eat"]], ["modules/10-disk-io.html", ["disk"]], ["modules/07-deadlocks.html", ["banker"]], ["modules/11-file-systems.html", ["inode"]], ["modules/05-threads.html", ["amdahl"]], ["modules/02-security.html", ["perms"]]]) {
      await withPage(file, ({ document: doc }) => {
        const hrefs = [...doc.querySelectorAll('a[href^="../problems.html#topic="]')].map((a) => a.getAttribute("href").split("=")[1]);
        assert.deepEqual(hrefs, kinds, `${file} links to ${kinds.join(", ")}`);
        hrefs.forEach((k) => assert.ok(lib.problemKinds.some((x) => x.id === k), `${k} is a real problem kind`));
      });
    }
  });

  QUnit.module("pages: page tables and language tabs");

  const PT = require("../js/lib/pagetable.js");
  const tabsOf = (g) => [...g.querySelectorAll('[role="tab"]')];
  const visible = (g) => [...g.querySelectorAll('[role="tabpanel"]')].filter((p) => !p.hidden).map((p) => p.id.split("-").slice(-2, -1)[0]);
  const walkText = (s) => text(s.querySelector(".ptwalk"));
  const ex = (s, label) => [...s.querySelectorAll('[role="group"] button')].find((b) => b.textContent.startsWith(label));

  QUnit.test("Language tabs: switching, keyboard, notes, and one choice applies to every sample on the page", async (assert) => {
    await withPage("tests/fixtures/codetabs.html", ({ window: w, document: doc, errors }) => {
      assert.deepEqual(errors, []);
      const groups = [...doc.querySelectorAll(".code-tabs")];
      assert.equal(groups.filter((g) => g.classList.contains("ready")).length, 2, "two groups became tabs; the single-language block did not");
      assert.equal(groups[2].querySelectorAll('[role="tab"]').length, 0);
      const [a, b] = groups;
      assert.deepEqual(tabsOf(a).map((t) => t.textContent), ["C", "Python"], "tabs in the order of the markup");
      assert.equal(a.querySelector('[role="tablist"]').getAttribute("aria-label"), "First sample");
      assert.deepEqual([visible(a), visible(b)], [["c"], ["python"]], "each group starts at its own first language");
      assert.ok(tabsOf(a).every((t) => t.getAttribute("aria-controls") && doc.getElementById(t.getAttribute("aria-controls")).getAttribute("aria-labelledby") === t.id), "tabs and panels reference each other");
      assert.deepEqual(tabsOf(a).map((t) => t.tabIndex), [0, -1], "roving tabindex");
      // clicking Python in the first group switches the second group too
      tabsOf(a)[1].click();
      assert.deepEqual([visible(a), visible(b)], [["python"], ["python"]]);
      assert.deepEqual(tabsOf(a).map((t) => t.getAttribute("aria-selected")), ["false", "true"]);
      assert.ok(/Python note one/.test(a.textContent) && !a.querySelector('[role="tabpanel"][hidden]').textContent.includes("Python note one"), "the note travels with its language");
      // choosing C in the second group switches the first
      tabsOf(b)[1].click();
      assert.deepEqual([visible(a), visible(b)], [["c"], ["c"]], "choice synced across groups");
      // keyboard: arrows, Home, End, wrap-around, with focus following
      tabsOf(a)[0].focus();
      tabsOf(a)[0].dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      assert.equal(doc.activeElement, tabsOf(a)[1]); assert.deepEqual(visible(a), ["python"]);
      tabsOf(a)[1].dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      assert.equal(doc.activeElement, tabsOf(a)[0], "wraps around");
      tabsOf(a)[0].dispatchEvent(new w.KeyboardEvent("keydown", { key: "End", bubbles: true }));
      assert.deepEqual(visible(a), ["python"]);
      tabsOf(a)[1].dispatchEvent(new w.KeyboardEvent("keydown", { key: "Home", bubbles: true }));
      assert.deepEqual(visible(a), ["c"]);
      assert.ok(a.querySelector("pre code.language-c .token") && a.querySelector("pre code.language-python .token"), "hidden panels are highlighted too");
    });
  });

  QUnit.test("Module 8 page: C and Python tabs show the real files, with notes about each language", async (assert) => {
    await withPage("modules/08-memory.html", ({ document: doc }) => {
      const box = doc.querySelector(".code-tabs");
      assert.ok(box.classList.contains("ready")); assert.deepEqual(tabsOf(box).map((t) => t.textContent), ["C", "Python"]);
      assert.deepEqual(visible(box), ["c"], "C first: it shows the structure more honestly");
      const c = box.querySelector('pre[data-src="examples/pagetable_translate.c"]'), py = box.querySelector('pre[data-src="examples/pagetable_translate.py"]');
      assert.equal(c.textContent, fs.readFileSync(path.join(ROOT, "examples", "pagetable_translate.c"), "utf8").replace(/\r\n/g, "\n").replace(/\n$/, ""));
      assert.equal(py.textContent, fs.readFileSync(path.join(ROOT, "examples", "pagetable_translate.py"), "utf8").replace(/\r\n/g, "\n").replace(/\n$/, ""));
      assert.ok(c.querySelector(".token.keyword") && c.querySelector(".token.macro, .token.directive") && py.querySelector(".token.keyword"), "both highlighted");
      assert.equal(c.querySelectorAll(".marker").length, 7); assert.equal(py.querySelectorAll(".marker").length, 7, "(1)–(7) badges in both");
      assert.ok(/clearer version here/.test(text(box.querySelector('.lang-note[data-lang="c"]'))) && /hides the hardware reality/.test(text(box.querySelector('.lang-note[data-lang="python"]'))), "each tab explains its trade-off");
      assert.ok(doc.getElementById("multilevel") && doc.querySelector("details.deeper summary .badge").textContent === "Advanced", "advanced tier is opt-in");
      assert.ok(doc.querySelectorAll("details.deeper li").length >= 6);
    });
  });

  const MODULE_PAGES = fs.readdirSync(path.join(ROOT, "modules")).filter((f) => /^\d\d-.*\.html$/.test(f)).sort();
  QUnit.test("every module has an opt-in Advanced 'Going deeper' section with several points", async (assert) => {
    for (const f of MODULE_PAGES) {
      await withPage(`modules/${f}`, ({ document: doc }) => {
        const d = doc.querySelector("details.deeper");
        assert.ok(d, `${f}: has a going-deeper section`);
        if (!d) return;
        assert.false(d.hasAttribute("open"), `${f}: collapsed by default so newcomers are not overwhelmed`);
        assert.equal(d.querySelector("summary .badge").textContent, "Advanced", `${f}: badge`);
        assert.ok(/^Going deeper/.test(text(d.querySelector("summary")).replace(/^Advanced/, "")), `${f}: summary names it`);
        assert.ok(d.querySelectorAll("li").length >= 5, `${f}: at least five points`);
      });
    }
  });

  QUnit.test("lesson code examples appear as C and Python tabs with a note for each language and the real files", async (assert) => {
    const wanted = { "01-fundamentals": "syscall_vs_stdio", "02-security": "file_mode", "05-threads": "threads_sum", "06-synchronization": "spinlock_atomic", "09-virtual-memory": "page_faults", "11-file-systems": "inode_links" };
    for (const [page, stem] of Object.entries(wanted)) {
      await withPage(`modules/${page}.html`, ({ document: doc }) => {
        const box = doc.querySelector(".code-tabs");
        assert.ok(box && box.classList.contains("ready"), `${page}: tabs are active`);
        if (!box) return;
        assert.deepEqual(tabsOf(box).map((t) => t.textContent), ["C", "Python"], `${page}: C and Python tabs`);
        for (const [lang, ext] of [["c", "c"], ["python", "py"]]) {
          const pre = box.querySelector(`pre[data-src="examples/${stem}.${ext}"]`);
          assert.equal(pre.textContent, fs.readFileSync(path.join(ROOT, "examples", `${stem}.${ext}`), "utf8").replace(/\r\n/g, "\n").replace(/\n$/, ""), `${page}: ${lang} listing is the real file`);
          assert.ok(pre.querySelector(".token"), `${page}: ${lang} is highlighted`);
          assert.ok(box.querySelector(`.lang-note[data-lang="${lang}"]`), `${page}: ${lang} has a note`);
        }
      });
    }
  });

  QUnit.test("Page-table walk: translation, faults, TLB behavior and table memory", async (assert) => {
    await withPage("modules/08-memory.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "ptwalk"), table = PT.ptPresetTable("teach16");
      // default: the code address 0x0012 on the 4 + 4 + 8 teaching machine
      assert.ok(/Top-level table, table #0: entry 0 points to the next table/.test(walkText(s)) && /Second-level table, table #1: entry 0 holds frame 0x5/.test(walkText(s)), walkText(s));
      assert.ok(/Physical address = frame 0x5 × 256 \+ offset 0x12 = 0x512 \(3 memory references: 2 table reads \+ the data access\)/.test(walkText(s)));
      assert.equal(s.querySelectorAll(".ptfields .ptf").length, 3, "three bit fields: two indices and the offset");
      // examples: faults at the right level
      ex(s, "unmapped (gap)").click();
      assert.ok(/Top-level table, table #0: entry 5 is not present: PAGE FAULT/.test(walkText(s)) && !/Physical address/.test(walkText(s)));
      ex(s, "unmapped (in a table that exists)").click();
      assert.ok(/Second-level table, table #\d+: entry 4 is not present: PAGE FAULT/.test(walkText(s)), "fault at the second level");
      // typed addresses, checked against the library
      const input = s.querySelector('input[aria-label="Virtual address in hexadecimal"]');
      for (const a of [0x1034, 0xfe80, 0x03ff]) {
        setValue(w, input, a.toString(16)); const want = PT.ptWalk(table, a).physical;
        assert.ok(new RegExp(`= 0x${want.toString(16).toUpperCase()} \\(`).test(walkText(s)), `0x${a.toString(16)} → 0x${want.toString(16).toUpperCase()}`);
      }
      setValue(w, input, "zz"); assert.ok(/hexadecimal digits/.test(text(s)), "bad input is explained, not a crash");
      setValue(w, input, "10000"); assert.ok(/Outside the address space/.test(walkText(s)), "past the end of a 16-bit space");
      // a sequence with a TLB that is too small, then big enough (the loop of 6 pages repeated 3 times)
      setValue(w, input, "12");
      setValue(w, field(s, "Accesses"), "cycle", "change");
      assert.equal(field(s, "Accesses").value, "cycle");
      const hitsOf = () => +[...s.querySelectorAll(".metric")].find((m) => /TLB hits/.test(m.textContent)).querySelector("b").textContent;
      assert.equal(s.querySelector(".player .small").textContent, "access 18 of 18", "starts at the finished state");
      assert.equal(hitsOf(), 0, "6 pages cycling through a 4-entry LRU TLB: every access misses");
      setValue(w, field(s, "TLB entries"), "8", "change");
      assert.equal(hitsOf(), 12, "with 8 entries only the first round misses");
      setValue(w, field(s, "TLB replacement"), "FIFO", "change"); assert.equal(hitsOf(), 12);
      setValue(w, field(s, "TLB entries"), "0", "change");
      assert.equal(hitsOf(), 0); assert.ok(/There is no TLB/.test(text(s)), "no TLB: every access walks");
      assert.ok(/access time with no TLB/.test(text(s)));
      // stepping through
      setValue(w, field(s, "TLB entries"), "4", "change");
      setValue(w, field(s, "TLB replacement"), "LRU", "change");
      button(s, "⟲ Restart").click(); assert.ok(/Press Play or Step/.test(text(s)));
      button(s, "Step ▶").click(); assert.ok(/Access 1: virtual address 0x0008/.test(text(s)) && /not cached \(miss\)/.test(walkText(s)));
      button(s, "Step ▶").click(); button(s, "Step ▶").click(); button(s, "Step ▶").click(); button(s, "Step ▶").click();
      assert.ok(/was added and page 0x\w+ was evicted \(LRU\)/.test(walkText(s)), "the fifth distinct page evicts one from a 4-entry TLB");
      assert.equal(s.querySelectorAll("tbody tr.hl").length >= 1, true, "the newest TLB entry is highlighted");
      // table memory on the real layouts
      setValue(w, field(s, "Address layout"), "x86_32", "change");
      assert.ok(/16 KiB/.test(text(s)) && /4 MiB/.test(text(s)) && /99\.6% less/.test(text(s)), "32-bit: 16 KiB of tables instead of 4 MiB");
      assert.ok(/Page directory, table #0: entry 1 points to the next table/.test(walkText(s)), "0x00403004 → directory entry 1");
      const w32 = PT.ptWalk(PT.ptPresetTable("x86_32"), 0x00403004);
      assert.ok(new RegExp(`entry 3 holds frame 0x${w32.frame.toString(16).toUpperCase()}`).test(walkText(s)), "page-table entry 3");
      setValue(w, field(s, "Address layout"), "x86_64", "change");
      assert.ok(/512 GiB/.test(text(s)) && /PML4/.test(walkText(s)) && /PDPT/.test(walkText(s)) && /PT, table/.test(walkText(s)), "four levels with the real names");
      assert.equal(s.querySelectorAll(".ptfields .ptf").length, 5, "four 9-bit indices and the offset");
      setValue(w, input, "7ffc12340fff"); assert.ok(/Physical address/.test(walkText(s)), "a 48-bit stack address translates");
      assert.ok(/Show the tables that exist \(\d+ tables for 18 mapped pages\)/.test(text(s)), "the tables that exist are listed");
    });
  });

  QUnit.test("Module 8 lessons, quiz and glossary cover the new material", async (assert) => {
    await withPage("modules/08-memory.html", ({ window: w, document: doc }) => {
      const qs = w.OSData.quizzes.filter((q) => q.mod === 8);
      assert.ok(qs.length >= 14, `${qs.length} questions`);
      assert.equal(doc.querySelectorAll("[data-quiz] .q").length, qs.length);
      ["Multi-level page table", "Page table entry (PTE)", "Page walk", "Huge page", "ASID (address-space identifier)", "TLB reach"].forEach((t) => assert.ok(doc.querySelector(`dfn[data-term="${t}"]`), `${t} is marked in the lesson`));
      assert.ok(/4 MiB/.test(doc.body.textContent) && /512 GiB/.test(doc.body.textContent) && /109 ns/.test(doc.body.textContent));
    });
  });

  QUnit.module("pages: more");

  QUnit.test("Module 11: allocation reads and inode capacity", async (assert) => {
    await withPage("modules/11-file-systems.html", ({ window: w, document: doc }) => {
      const a = sim(doc, "alloc");
      const reads = () => [...a.querySelectorAll("table tbody tr")].map((tr) => tr.children[1].textContent);
      assert.deepEqual(reads(), ["1", "6", "2", "1"], "block k = 5: contiguous 1, linked 6, indexed 2, FAT 1");
      setValue(w, field(a, "Read file block k"), 0);
      assert.deepEqual(reads(), ["1", "1", "2", "1"]);
      assert.equal(a.querySelectorAll("svg").length, 4);

      const i = sim(doc, "inode");
      assert.ok(/GiB/.test(metrics(i)[1]), "with double indirect: gigabytes");
      assert.equal(metrics(i)[0], "1,024", "1024 pointers per 4 KiB block");
      const dbl = [...i.querySelectorAll('input[type="checkbox"]')][1]; dbl.checked = false; fire(w, dbl, "change");
      assert.equal(metrics(i)[1], "4.05 MiB", "(12 + 1024) × 4 KiB = 4,144 KiB");
      const tri = [...i.querySelectorAll('input[type="checkbox"]')][2]; tri.checked = true; fire(w, tri, "change");
      assert.ok(dbl.checked && /TiB|PiB/.test(metrics(i)[1]), "triple indirect forces double indirect on");
      setValue(w, field(i, "Pointer size"), 8, "change");
      assert.equal(metrics(i)[0], "512");
    });
  });
})();
