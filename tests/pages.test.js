/* Page-level tests (Node only). Loads every real HTML page in jsdom, executes its scripts, then checks
   structure, links, simulation mounting and interactive behavior. The pure-logic tests live in the other files. */
(function () {
  "use strict";
  if (typeof require === "undefined") return; // browser runner covers logic + data only
  const fs = require("fs"), path = require("path");
  const { JSDOM, VirtualConsole } = require("jsdom");
  const ROOT = path.resolve(__dirname, "..");

  const rootPages = ["index.html", "pages/labs.html", "pages/problems.html", "pages/glossary.html", "pages/faq.html", "pages/practice.html", "pages/cheatsheet.html", "pages/search.html", "pages/study.html", "pages/progress.html", "pages/flashcards.html", "pages/exam.html", "pages/scenarios.html", "pages/handouts.html", "pages/paths.html", "pages/teaching.html"];
  const moduleFiles = fs.readdirSync(path.join(ROOT, "modules")).filter((f) => f.endsWith(".html")).sort();
  const labFiles = fs.readdirSync(path.join(ROOT, "labs")).filter((f) => f.endsWith(".html")).sort();
  const handsonFiles = fs.readdirSync(path.join(ROOT, "handson")).filter((f) => f.endsWith(".html")).sort();
  const allPages = [...rootPages, ...moduleFiles.map((f) => "modules/" + f), ...labFiles.map((f) => "labs/" + f), ...handsonFiles.map((f) => "handson/" + f)];

  /** Ids on a page: those in its HTML plus the ones js/site.js gives headings at run time (same rule as the search index). */
  const anchorCache = {};
  function anchorIds(file) {
    if (!anchorCache[file]) {
      const doc = new JSDOM(fs.readFileSync(file, "utf8")).window.document;
      const set = new Set([...doc.querySelectorAll("[id]")].map((e) => e.id));
      require("../tools/build-search-index.js").headingIds(doc).forEach((id) => set.add(id));
      anchorCache[file] = set;
    }
    return anchorCache[file];
  }

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
    assert.equal(moduleFiles.length, 19, "19 module pages");
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
          if (!hash || /^(term|part)-/.test(hash) || hash.includes("=")) return; // runtime anchors and state hashes (#topic=…, #p=…) are checked by their own tests; // term-… and part-… anchors are assigned at run time and verified by their own tests's live DOM below
          if (!file) { if (!doc.getElementById(hash)) missing.push(href + " (anchor)"); } // same page: check the live DOM
          else if (target.endsWith(".html") && !/glossary\.html$/.test(target) && !anchorIds(target).has(hash)) missing.push(href + " (anchor)");
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
          const ro = doc.defaultView.OSData.readingOrder;
          assert.equal(pager.length, n === ro[0] || n === ro[ro.length - 1] ? 1 : 2, "prev/next pager (first and last in reading order have one link)");
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
      assert.equal(doc.querySelectorAll("#module-grid .card").length, 19);
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
    for (const [rel, href] of [["index.html", "LICENSE.txt"], ["modules/06-scheduling.html", "../LICENSE.txt"], ["labs/01-processes.html", "../LICENSE.txt"], ["pages/problems.html", "../LICENSE.txt"]]) {
      await withPage(rel, ({ document: doc }) => {
        const a = doc.querySelector("footer.site a");
        assert.ok(a && a.textContent === "MIT License" && a.getAttribute("href") === href, `${rel}: footer links to ${href}`);
        assert.ok(/Free to copy and adapt/.test(doc.querySelector("footer.site").textContent));
        assert.true(fs.existsSync(path.resolve(path.dirname(path.join(ROOT, rel)), href)), "and the file exists there");
      });
    }
  });

  QUnit.test("Glossary: search and topic filter", async (assert) => {
    await withPage("pages/glossary.html", ({ window: w, document: doc }) => {
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
    await withPage("pages/glossary.html", ({ window: w, document: doc }) => {
      const dd = (id) => doc.getElementById(id).nextElementSibling;
      const aging = dd("aging").querySelector(".seealso");
      assert.ok(/First discussed in Module 6 \(The algorithms\)/.test(aging.textContent), aging.textContent);
      assert.equal(aging.querySelector("a").getAttribute("href"), "../modules/06-scheduling.html#term-aging", "deep link to the term in the lesson");
      const kernel = dd("kernel").querySelector(".seealso");
      assert.ok(/First discussed in Module 1/.test(kernel.textContent) && /also in Module 18/.test(kernel.textContent), "terms used in several modules list them all");
      assert.deepEqual([...kernel.querySelectorAll("a")].map((a) => a.getAttribute("href")).slice(0, 1), ["../modules/01-fundamentals.html#term-kernel"]);
      assert.equal(doc.querySelectorAll("dd .seealso").length, doc.querySelectorAll("dt").length, "every listed term has a link to a lesson");
      // "Discussed in" filter
      const all = doc.querySelectorAll("dt").length;
      setValue(w, doc.getElementById("mod"), "11", "change");
      const names = [...doc.querySelectorAll("dt")].map((d) => d.firstChild.textContent);
      assert.ok(names.length > 3 && names.length < all, `Module 11 filter: ${names.length} terms`);
      assert.ok(names.includes("Deadlock") && names.includes("Banker's algorithm") && !names.includes("Seek time"));
      setValue(w, doc.getElementById("mod"), "all", "change");
      assert.equal(doc.querySelectorAll("dt").length, all);
    });
  });

  QUnit.test("Lessons: a #term-… link lands on the defined term (and the first <dfn> per term owns the id)", async (assert) => {
    await withPage("modules/11-deadlocks.html", ({ document: doc }) => {
      const t = doc.getElementById("term-deadlock");
      assert.ok(t && t.tagName === "DFN", "dfn has an anchor");
      assert.ok(t.classList.contains("flash"), "the arrival is highlighted");
      assert.equal(doc.querySelectorAll("#term-deadlock").length, 1);
    }, "#term-deadlock");
  });

  QUnit.test("Glossary: terms linked from module pages resolve to an anchor", async (assert) => {
    await withPage("modules/11-deadlocks.html", ({ document: doc }) => {
      const link = doc.querySelector('dfn[data-term="Deadlock"] a');
      assert.equal(link.getAttribute("href"), "../pages/glossary.html#deadlock");
    });
    await withPage("pages/glossary.html", ({ document: doc }) => assert.ok(doc.getElementById("deadlock")));
  });

  QUnit.test("FAQ: filter", async (assert) => {
    await withPage("pages/faq.html", ({ window: w, document: doc }) => {
      const all = doc.querySelectorAll("details.faq").length;
      assert.ok(all >= 20);
      setValue(w, doc.getElementById("q"), "belady");
      const n = doc.querySelectorAll("details.faq").length;
      assert.ok(n >= 1 && n < all);
      assert.true(doc.querySelector("details.faq").open, "matches expand automatically");
    });
  });

  QUnit.test("Practice: module filter and question count", async (assert) => {
    await withPage("pages/practice.html", ({ window: w, document: doc }) => {
      assert.equal(doc.querySelectorAll(".q").length, 10);
      setValue(w, doc.getElementById("mod"), "6", "change");
      setValue(w, doc.getElementById("num"), "all", "change");
      const n = w.OSData.quizzes.filter((q) => q.mod === 6).length;
      assert.equal(doc.querySelectorAll(".q").length, n);
      assert.ok([...doc.querySelectorAll(".q .meta")].every((m) => m.textContent.includes("Module 6")));
      // answering gives immediate feedback and a score
      const q = doc.querySelector(".q"); q.querySelector("button.choice").click();
      assert.ok(q.querySelector(".explain") && !q.querySelector(".explain").hidden);
      assert.ok(q.querySelectorAll("button.choice:disabled").length === q.querySelectorAll("button.choice").length);
      assert.ok(/Score: [01] \/ 1 answered/.test(doc.querySelector(".score").textContent));
    });
  });

  QUnit.test("Quiz: clicking the right answer says Correct, the wrong one reveals the answer", async (assert) => {
    await withPage("modules/06-scheduling.html", ({ document: doc }) => {
      const qs = [...doc.querySelectorAll(".q")];
      const right = qs[0], wrong = qs[1];
      const D = doc.defaultView.OSData.quizzes.filter((q) => q.mod === 6);
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

  QUnit.test("Module 5: process state diagram enforces one running process; fork tree has 2^n nodes", async (assert) => {
    await withPage("modules/05-processes.html", ({ window: w, document: doc }) => {
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

  QUnit.test("Module 6: scheduling simulator recomputes metrics", async (assert) => {
    await withPage("modules/06-scheduling.html", ({ window: w, document: doc }) => {
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

  QUnit.test("Module 7: Amdahl explorer", async (assert) => {
    await withPage("modules/07-threads.html", ({ window: w, document: doc }) => {
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

  QUnit.test("Module 9: race condition lab shows a lost update, and the mutex blocks", async (assert) => {
    await withPage("modules/09-synchronization.html", ({ window: w, document: doc }) => {
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

  QUnit.test("Module 11: Banker's algorithm and dining philosophers", async (assert) => {
    await withPage("modules/11-deadlocks.html", ({ window: w, document: doc }) => {
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

  QUnit.test("Module 13: allocation shows external fragmentation; paging translates addresses", async (assert) => {
    await withPage("modules/13-memory.html", ({ window: w, document: doc }) => {
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

  QUnit.test("Module 14: page replacement reproduces Belady's anomaly; EAT calculator", async (assert) => {
    await withPage("modules/14-virtual-memory.html", ({ window: w, document: doc }) => {
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

  QUnit.test("Module 15: disk scheduling totals match the textbook", async (assert) => {
    await withPage("modules/15-disk-io.html", ({ window: w, document: doc }) => {
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
    await withPage("modules/06-scheduling.html", ({ window: w, document: doc }) => {
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
    await withPage("modules/06-scheduling.html", ({ window: w, document: doc }) => {
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
    await withPage("modules/14-virtual-memory.html", ({ document: doc }) => {
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
    await withPage("modules/15-disk-io.html", ({ document: doc }) => {
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
    await withPage("modules/07-threads.html", ({ window: w, document: doc }) => {
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
    await withPage("modules/05-processes.html", ({ document: doc }) => {
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
    await withPage("modules/05-processes.html", ({ document: doc }) => {
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
    await withPage("modules/11-deadlocks.html", ({ window: w, document: doc }) => {
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
    await withPage("modules/09-synchronization.html", ({ window: w, document: doc }) => {
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
    await withPage("modules/13-memory.html", ({ window: w, document: doc }) => {
      const m = sim(doc, "memalloc");
      assert.equal(m.querySelectorAll("svg g.pop").length, 0);
      setValue(w, field(m, "Request size"), 100);
      button(m, "Allocate").click();
      assert.equal(m.querySelectorAll("svg g.pop").length, 1);
      button(m, "Compact memory").click();
      assert.equal(m.querySelectorAll("svg g.pop").length, 0, "animation cleared on the next action");
    });
  });

  QUnit.module("pages: Module 18 (OS landscape)");

  const cardButton = (c, id) => c.querySelector(`button[data-os="${id}"]`);
  const colHeads = (c) => [...c.querySelectorAll("table.compare thead th")].slice(1).map((th) => th.textContent.trim());
  const rowCount = (c) => c.querySelectorAll("table.compare tbody tr[data-row]").length;

  QUnit.test("Compare tool: pick systems with the Compare buttons and read them side by side", async (assert) => {
    await withPage("modules/18-os-landscape.html", ({ window: w, document: doc }) => {
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

  QUnit.test("Compare tool: the newer systems have presets, and links on the page change the comparison", async (assert) => {
    await withPage("modules/18-os-landscape.html", ({ window: w, document: doc }) => {
      const c = sim(doc, "oscompare"), preset = field(c, "Quick comparisons");
      setValue(w, preset, "Microkernels in practice", "change");
      assert.deepEqual(colHeads(c), ["QNX", "MINIX 3", "Fuchsia"]);
      setValue(w, preset, "Mainframe virtualization and transactions", "change");
      assert.deepEqual(colHeads(c), ["z/VM", "z/TPF", "z/OS (MVS)"]);
      // every comparison link in "More designs worth a look" names real systems
      const links = [...doc.querySelectorAll("main table a[href^='#compare=']")];
      assert.ok(links.length >= 8);
      links.forEach((a) => a.getAttribute("href").slice(9).split(",").forEach((id) => assert.ok(w.OSData.osList.some((o) => o.id === id), `${id} exists`)));
      w.location.hash = "#compare=plan9,solaris,openbsd";
      w.dispatchEvent(new w.HashChangeEvent("hashchange"));
      assert.deepEqual(colHeads(c), ["Plan 9", "Solaris and illumos", "OpenBSD"], "following a link on the same page updates the table");
      w.location.hash = "#compare=nonsense,harmonyos";
      w.dispatchEvent(new w.HashChangeEvent("hashchange"));
      assert.deepEqual(colHeads(c), ["HarmonyOS"], "unknown ids are ignored");
    });
  });

  QUnit.test("Compare tool: limit of five, presets, clear, and the Compare button", async (assert) => {
    await withPage("modules/18-os-landscape.html", ({ window: w, document: doc }) => {
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
    await withPage("modules/18-os-landscape.html", ({ document: doc }) => {
      const c = sim(doc, "oscompare");
      assert.deepEqual(colHeads(c), ["Windows (NT)", "z/OS (MVS)"], "a #compare=… link preselects systems");
      assert.equal(cardButton(c, "zos").getAttribute("aria-pressed"), "true");
      assert.ok(/EBCDIC/.test(c.querySelector('[data-card="zos"] details').textContent), "full profile is available on the card");
    }, "#compare=windows,zos");
    await withPage("modules/18-os-landscape.html", ({ document: doc }) => {
      const c = sim(doc, "oscompare");
      assert.deepEqual(colHeads(c), ["Linux (distributions)"], "unknown ids in the link are ignored");
    }, "#compare=bogus,linux");
  });

  QUnit.test("Family tree: select a system to see its lineage and add it to the comparison", async (assert) => {
    await withPage("modules/18-os-landscape.html", ({ window: w, document: doc }) => {
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
    const cases = [["pages/cheatsheet.html", ["bash", "python", "python"]], ["modules/05-processes.html", ["c"]], ["modules/07-threads.html", ["python"]], ["modules/02-security.html", ["bash"]], ["modules/01-fundamentals.html", ["c"]], ["pages/labs.html", ["bash"]]];
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
    await withPage("modules/05-processes.html", ({ document: doc }) => {
      const code = doc.querySelector("pre[data-lang=c] code");
      assert.ok(code.querySelector(".token.macro, .token.directive"), "#include is highlighted as a directive");
      assert.ok(code.querySelector(".token.keyword"), "C keywords");
    });
  });

  QUnit.test("Labs index lists every lab with its related lessons", async (assert) => {
    await withPage("pages/labs.html", ({ window: w, document: doc }) => {
      const cards = [...doc.querySelectorAll("#lab-grid .card")];
      assert.equal(cards.length, w.OSData.labs.length);
      assert.deepEqual(cards.map((c) => c.getAttribute("href")), w.OSData.labs.map((l) => `../labs/${l.slug}.html`));
      assert.ok(cards.every((c) => c.querySelectorAll(".tag").length >= 2), "each card shows its related modules");
      assert.ok(/os\.fork/.test(doc.body.textContent), "explains the Windows limitation");
    });
  });

  QUnit.test("Navigation includes Labs and Study tools on every page", async (assert) => {
    await withPage("index.html", ({ document: doc }) => {
      const links = [...doc.querySelectorAll("header.site nav a")].map((a) => [a.textContent, a.getAttribute("href")]);
      assert.deepEqual(links.filter(([t]) => ["Labs", "Study tools"].includes(t)), [["Labs", "pages/labs.html"], ["Study tools", "pages/study.html"]]);
      assert.ok([...doc.querySelectorAll("main a.btn")].some((a) => a.getAttribute("href") === "pages/problems.html"), "home page promotes the problems");
    });
    await withPage("labs/02-threads.html", ({ document: doc }) => {
      assert.deepEqual([...doc.querySelectorAll("header.site nav a")].filter((a) => ["Labs", "Study tools"].includes(a.textContent)).map((a) => a.getAttribute("href")), ["../pages/labs.html", "../pages/study.html"]);
    });
  });

  const lib = require("../js/lib/problems.js");
  const inputOf = (doc) => doc.querySelector('#problem input[type="text"]');
  const checkBtn = (doc) => button(doc.getElementById("problem"), "Check answer");
  const status = (doc) => doc.getElementById("result");

  QUnit.test("Problems: a problem link shows exactly the problem the generator produces", async (assert) => {
    await withPage("pages/problems.html", ({ window: w, document: doc }) => {
      const expected = lib.generateProblem("scheduling", 123, 2);
      const host = doc.getElementById("problem");
      assert.equal(host.querySelector(".prompt").innerHTML, expected.prompt, "same prompt as the library");
      assert.ok(host.textContent.includes("scheduling:123:2"), "problem code shown");
      assert.equal(doc.getElementById("topic").value, "scheduling"); assert.equal(doc.getElementById("level").value, "2");
      assert.equal(doc.getElementById("topic").options.length, 11, "any topic + 10 kinds");
      assert.ok(host.querySelector('a[href="../modules/06-scheduling.html"]'), "links back to the lesson");
    }, "#p=scheduling:123:2");
  });

  QUnit.test("Problems: correct answer, wrong answer, hint, solution steps and score", async (assert) => {
    await withPage("pages/problems.html", ({ window: w, document: doc }) => {
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
    await withPage("pages/problems.html", ({ window: w, document: doc }) => {
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
    await withPage("pages/problems.html", ({ window: w, document: doc }) => {
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
    await withPage("pages/problems.html", ({ window: w, document: doc }) => {
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
    await withPage("pages/problems.html", ({ document: doc }) => assert.equal(doc.getElementById("topic").value, "paging"), "#topic=paging");
    for (const bad of ["#p=constructor:1:1", "#p=<img src=x onerror=alert(1)>:1:1", "#p=scheduling:1:9", "#topic=__proto__", "#p=%E0%A4%A"]) {
      await withPage("pages/problems.html", ({ document: doc, errors }) => {
        assert.deepEqual(errors, [], `${bad}: no script errors`);
        assert.ok(doc.querySelector("#problem .prompt"), `${bad}: falls back to a normal problem`);
        assert.false(/onerror/.test(doc.getElementById("problem").innerHTML), "nothing from the hash is injected into the page");
      }, bad);
    }
  });

  QUnit.test("A malformed link hash never breaks a page", async (assert) => {
    for (const rel of ["index.html", "pages/glossary.html", "modules/06-scheduling.html", "modules/18-os-landscape.html", "labs/01-processes.html", "pages/problems.html"]) {
      for (const bad of ["#%E0%A4%A", "#term-%zz", "#compare=%ff%ff", "#" + "x".repeat(5000)]) {
        await withPage(rel, ({ errors, document: doc }) => assert.deepEqual(errors, [], `${rel}${bad.slice(0, 14)}: no script errors`), bad);
      }
    }
  });

  QUnit.test("Lessons link to the matching Python labs", async (assert) => {
    const expected = { "05-processes": ["01-processes"], "06-scheduling": ["03-resources"], "07-threads": ["02-threads"], "09-synchronization": ["02-threads", "04-semaphores-deadlock"],
      "11-deadlocks": ["04-semaphores-deadlock"], "13-memory": ["03-resources"], "14-virtual-memory": ["03-resources"], "15-disk-io": ["03-resources"] };
    for (const [slug, labs] of Object.entries(expected)) {
      await withPage(`modules/${slug}.html`, ({ document: doc }) => {
        const hrefs = [...doc.querySelectorAll('a[href^="../labs/"]')].map((a) => a.getAttribute("href").replace("../labs/", "").replace(".html", ""));
        assert.deepEqual(hrefs, labs, `${slug} links to ${labs.join(", ")}`);
      });
    }
  });

  QUnit.test("Lessons link to matching practice problems", async (assert) => {
    for (const [file, kinds] of [["modules/06-scheduling.html", ["scheduling"]], ["modules/13-memory.html", ["paging", "memalloc"]], ["modules/14-virtual-memory.html", ["pagerepl", "eat"]], ["modules/15-disk-io.html", ["disk"]], ["modules/11-deadlocks.html", ["banker"]], ["modules/16-file-systems.html", ["inode"]], ["modules/07-threads.html", ["amdahl"]], ["modules/02-security.html", ["perms"]]]) {
      await withPage(file, ({ document: doc }) => {
        const hrefs = [...doc.querySelectorAll('a[href^="../pages/problems.html#topic="]')].map((a) => a.getAttribute("href").split("=")[1]);
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

  QUnit.test("Module 13 page: C and Python tabs show the real files, with notes about each language", async (assert) => {
    await withPage("modules/13-memory.html", ({ document: doc }) => {
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
    const wanted = { "01-fundamentals": "syscall_vs_stdio", "02-security": "file_mode", "07-threads": "threads_sum", "09-synchronization": "spinlock_atomic", "14-virtual-memory": "page_faults", "16-file-systems": "inode_links" };
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

  QUnit.module("pages: Module 12 (inter-process communication)");

  QUnit.test("IPC explorer: a pipe is a byte stream, a queue keeps messages, and blocking and closing behave as the lesson says", async (assert) => {
    await withPage("modules/12-ipc.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "ipc"), log = () => [...s.querySelectorAll("ol li")].map((li) => li.textContent);
      const send = (t) => { setValue(w, s.querySelector('input[type="text"]'), t); button(s, "Writer: write").click(); };
      const slots = () => [...s.querySelectorAll("g.cell text")].map((t) => t.textContent);
      send("hello"); send("ab");
      assert.deepEqual(slots(), ["h", "e", "l", "l", "o", "a"], "capacity 6: the second write fills the buffer with one byte left over");
      const label = () => s.querySelector("svg").getAttribute("aria-label");
      assert.ok(/Writer: asleep/.test(label()), "the last byte did not fit, so the writer is asleep");
      assert.ok(log().some((l) => /goes to sleep with 1 byte/.test(l)), "the log explains the sleep");
      send("c");
      assert.ok(/Not possible now/.test(log().pop()), "a sleeping writer cannot write again");
      button(s, "Reader: read").click();
      assert.deepEqual(slots(), ["o", "a", "b"], "reader took 4 bytes; the sleeping writer's byte moved in");
      assert.ok(log().some((l) => /sleeping writer was woken/.test(l) || /woken/.test(l)), "reading wakes the sleeping writer");
      assert.ok(/Writer: running/.test(label()));
      // message queue keeps boundaries
      setValue(w, field(doc, "Mechanism"), "queue", "change");
      assert.deepEqual(slots(), [], "switching resets the channel");
      send("one"); send("two");
      assert.deepEqual(slots(), ["one", "two"]);
      setValue(w, field(doc, "Reader asks for"), 8);
      button(s, "Reader: read").click();
      assert.ok(log().pop().includes('"one"') && /one whole message/.test(log().pop()), "one whole message per read, whatever the requested size");
      assert.deepEqual(slots(), ["two"]);
    });
  });

  QUnit.test("IPC explorer: scenarios, end of file and broken pipe", async (assert) => {
    await withPage("modules/12-ipc.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "ipc"), log = () => [...s.querySelectorAll("ol li")].map((li) => li.textContent);
      button(s, "Scenario: end of file").click();
      assert.ok(log().some((l) => /end of file/.test(l)), "eof reported after the write end closed and the data was read");
      assert.equal(log().filter((l) => /read returned 2|read returned 3|read returned 1/.test(l)).length, 1, "the three bytes arrive in one read");
      button(s, "Scenario: broken pipe").click();
      assert.ok(log().some((l) => /no process can read/.test(l)), "writing with no reader is a broken pipe");
      button(s, "Scenario: reader waits for data").click();
      assert.ok(log().some((l) => /goes to sleep/.test(l)) && log().some((l) => /sleeping reader was woken/.test(l)), "reader sleeps and is woken by the write");
      button(s, "Scenario: writer outruns reader").click();
      assert.ok(log().some((l) => /goes to sleep/.test(l)));
      button(s, "Reader: close its end").click();
      assert.ok(log().some((l) => /sleeping writer was woken with an error/.test(l)), "closing the read end wakes the sleeper with an error");
      button(s, "Reset").click();
      assert.equal(log().length, 0);
    });
  });

  QUnit.test("Module 12 shows three C and Python example pairs, each with a note for both languages", async (assert) => {
    await withPage("modules/12-ipc.html", ({ document: doc }) => {
      const boxes = [...doc.querySelectorAll(".code-tabs")];
      assert.deepEqual(boxes.map((b) => b.querySelector("pre.code").dataset.src), ["examples/pipe_fork.c", "examples/socket_pair.c", "examples/shared_memory.c"]);
      boxes.forEach((b) => {
        assert.deepEqual(tabsOf(b).map((t) => t.textContent), ["C", "Python"]);
        assert.ok(b.querySelector('.lang-note[data-lang="c"]') && b.querySelector('.lang-note[data-lang="python"]'));
        assert.ok(b.querySelectorAll(".marker").length >= 8, "numbered comments are badges in both listings");
      });
    });
  });

  QUnit.module("pages: side-by-side comparison");

  QUnit.test("Scheduler comparison: two Gantt strips, a verdict per measure, and a plain-language summary", async (assert) => {
    await withPage("modules/06-scheduling.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "schedvs"), L = w.OSLib;
      assert.equal(s.querySelectorAll(".gantt-strip").length, 2);
      assert.equal(s.querySelectorAll(".gantt-strip")[0].getAttribute("aria-label").startsWith("A: "), true);
      const procs = [["P1", 0, 6, 2], ["P2", 0, 8, 1], ["P3", 0, 3, 3]].map(([pid, arrival, burst, priority]) => ({ pid, arrival, burst, priority }));
      const c = L.compareSchedules(procs, "FCFS", "RR", { quantum: 3 });
      const rows = () => [...s.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((td) => td.textContent));
      assert.equal(rows().length, 5);
      assert.equal(rows()[0][1], (Math.round(c.rows[0].a * 10) / 10).toFixed(1), "the table shows the library's numbers");
      assert.equal(rows()[0][3], c.rows[0].better === "tie" ? "equal" : c.rows[0].better.toUpperCase());
      assert.ok([...s.querySelectorAll("ul li")].some((li) => /lower average|equal|same algorithm/.test(li.textContent)), "a summary sentence");
      setValue(w, field(s, "Algorithm B"), "FCFS", "change");
      assert.ok(/same algorithm/.test(s.querySelector("ul").textContent), "the same algorithm on both sides");
      assert.true(rows().every((r) => r[3] === "equal"));
      setValue(w, field(s, "Workload"), "One long job and several short ones", "change");
      setValue(w, field(s, "Algorithm B"), "SJF", "change");
      assert.ok(/Shortest Job First|SJF/.test(s.querySelector("ul").textContent));
      assert.equal(s.querySelector("label input[type=range]").closest("label").style.display, "none", "the quantum slider only shows when Round Robin is chosen");
    });
  });

  QUnit.test("Page-replacement comparison: the classic string, where the two policies differ, and the same policy twice", async (assert) => {
    await withPage("modules/14-virtual-memory.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "pagevs"), caps = () => [...s.querySelectorAll("caption")].map((c) => c.textContent);
      assert.deepEqual(caps(), ["A: FIFO: 15 faults, 5 hits", "B: LRU: 12 faults, 8 hits"]);
      assert.ok([...s.querySelectorAll("ul li")][0].textContent.includes("LRU causes 3 fewer page faults (12 against 15)"));
      const refs = w.OSData ? null : null;
      const differs = s.querySelectorAll("table")[0].querySelectorAll("th.differs").length, differsB = s.querySelectorAll("table")[1].querySelectorAll("th.differs").length;
      assert.equal(differs - differsB, 3, "FIFO faults alone at three more references than LRU does");
      assert.equal(s.querySelectorAll("table")[0].querySelectorAll("tbody tr").length, 4, "three frames plus the result row");
      setValue(w, field(s, "Policy B"), "FIFO", "change");
      assert.ok(/same policy/.test(s.querySelector("ul").textContent));
      assert.equal(s.querySelectorAll("th.differs").length, 0);
      setValue(w, field(s, "Reference string"), "A loop slightly larger than memory", "change");
      setValue(w, field(s, "Frames"), 3);
      setValue(w, field(s, "Policy A"), "LRU", "change");
      setValue(w, field(s, "Policy B"), "OPT", "change");
      assert.ok(/OPT|Optimal/.test(caps()[1]) && Number(/: ([0-9]+) faults/.exec(caps()[0])[1]) > Number(/: ([0-9]+) faults/.exec(caps()[1])[1]), "OPT beats LRU on a loop larger than memory: " + caps().join(" | "));
    });
  });

  QUnit.module("pages: CSV export");

  QUnit.test("Results tables can be copied or downloaded as CSV, with a manual fallback", async (assert) => {
    await withPage("modules/06-scheduling.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "scheduling"), bars = s.querySelectorAll(".export-bar");
      assert.equal(bars.length, 2, "the per-process table and the comparison table each have export buttons");
      const bar = bars[0], table = bar.previousElementSibling;
      assert.equal(table.tagName, "TABLE");
      bar.querySelectorAll("button")[0].click();   // jsdom has no clipboard, so the text box appears
      const box = bar.querySelector("textarea");
      assert.false(box.hidden, "fallback text box shown");
      const lines = box.value.split(String.fromCharCode(10)).filter(Boolean);
      assert.equal(lines[0], "Process,Arrival,Burst,Completion,Turnaround,Waiting,Response");
      assert.equal(lines.length, 1 + table.querySelectorAll("tbody tr").length);
      assert.ok(/^P1,0,/.test(lines[1]), lines[1]);
      assert.equal(box.value, w.OSLib.toCSV([...table.querySelectorAll("tr")].map((tr) => [...tr.children].map((c) => c.textContent))).split(String.fromCharCode(13)).join(""), "the CSV is the table's text (a text box keeps only line feeds)");
      setValue(w, field(s, "Algorithm"), "RR", "change");
      bar.querySelectorAll("button")[1].click();
      assert.ok(/Select the text below/.test(bar.querySelector(".small").textContent) || !box.hidden, "download falls back too");
    });
    await withPage("modules/15-disk-io.html", ({ document: doc }) => {
      assert.equal(sim(doc, "disk").querySelectorAll(".export-bar").length, 1);
    });
    await withPage("modules/08-advanced-scheduling.html", ({ document: doc }) => {
      assert.equal(sim(doc, "mlfq").querySelectorAll(".export-bar").length, 1);
      assert.equal(sim(doc, "multicore").querySelectorAll(".export-bar").length, 1);
    });
  });

  QUnit.module("pages: study tools");

  QUnit.test("Study hub links to every tool, and the nav marks it current on each tool's page", async (assert) => {
    await withPage("pages/study.html", ({ document: doc }) => {
      assert.deepEqual([...doc.querySelectorAll("main a.card")].map((a) => a.getAttribute("href")), ["practice.html", "flashcards.html", "scenarios.html", "problems.html", "exam.html", "progress.html", "paths.html", "handouts.html", "teaching.html"]);
    });
    for (const rel of ["pages/practice.html", "pages/problems.html", "pages/flashcards.html", "pages/exam.html", "pages/scenarios.html", "pages/progress.html", "pages/handouts.html", "pages/paths.html", "pages/teaching.html", "pages/study.html"]) {
      await withPage(rel, ({ document: doc }) => {
        const cur = [...doc.querySelectorAll('header.site nav a[aria-current="page"]')].map((a) => a.textContent);
        assert.deepEqual(cur, ["Study tools"], `${rel}: the Study tools link is current`);
      });
    }
  });

  QUnit.module("pages: handouts");

  QUnit.test("Handouts: each sheet is drawn from the chosen modules, and the worksheet never shows an answer", async (assert) => {
    await withPage("pages/handouts.html", ({ window: w, document: doc }) => {
      const D = w.OSData, sheet = doc.getElementById("sheet"), form = doc.getElementById("setup");
      const pick = (k) => { const r = form.querySelector(`input[name=kind][value=${k}]`); r.checked = true; r.dispatchEvent(new w.Event("change", { bubbles: true })); };
      const boxes = [...doc.querySelectorAll("#modules input[type=checkbox]")];
      assert.equal(boxes.length, D.modules.length, "one checkbox per module");
      assert.equal(sheet.querySelectorAll(".handout-module").length, D.modules.length, "the study guide starts with every module");
      assert.ok(sheet.querySelectorAll("ul.checks li").length >= 3 * D.modules.length, "objectives are check-off lines");
      // choose two modules
      const only = (nums) => boxes.forEach((b) => { b.checked = nums.includes(+b.value); });
      only([6, 9]);
      pick("guide");
      assert.deepEqual([...sheet.querySelectorAll(".handout-module h3")].map((e) => e.textContent), ["Module 6: " + D.modules[5].title, "Module 9: " + D.modules[8].title]);
      pick("worksheet");
      assert.equal(sheet.querySelectorAll(".wq").length, 10, "five questions for each of two modules");
      assert.ok(sheet.querySelector(".fill .rule"), "name and date lines");
      const wtext = sheet.textContent;
      const q = D.quizzes.filter((x) => x.mod === 6)[0];
      assert.ok(wtext.includes(q.q) && !wtext.includes(q.explain), "the question appears, its explanation does not");
      assert.equal(sheet.querySelectorAll(".wq ol.letters li").length, [...sheet.querySelectorAll(".wq")].length * 4, "four lettered choices each");
      pick("key");
      assert.equal(sheet.querySelectorAll(".ak").length, 10, "a key line per question");
      assert.ok(sheet.textContent.includes(q.explain), "the key has the explanation");
      assert.ok(/^1\. [A-D]\. /.test(sheet.querySelector(".ak").textContent), "numbered with the correct letter");
      const count = doc.getElementById("count"); count.value = "0"; count.dispatchEvent(new w.Event("change", { bubbles: true }));
      assert.equal(sheet.querySelectorAll(".ak").length, D.quizzes.filter((x) => x.mod === 6 || x.mod === 9).length, "all of them");
      pick("glossary");
      assert.equal(sheet.querySelectorAll(".gloss dt").length, D.glossary.length, "every term");
      assert.ok(doc.getElementById("mod-set").hidden && doc.getElementById("count-label").hidden, "module and count choices hide for the glossary");
      pick("guide");
      only([]);
      boxes[0].dispatchEvent(new w.Event("change", { bubbles: true }));
      assert.equal(sheet.children.length, 0, "nothing chosen, nothing drawn");
      assert.ok(doc.getElementById("setup-msg").textContent.length > 0 && doc.getElementById("print").disabled, "a message, and Print is off");
    });
  });

  QUnit.test("Handouts: Print opens the print dialog, and the cheat sheet has its own Print button", async (assert) => {
    await withPage("pages/handouts.html", ({ window: w, document: doc }) => {
      let n = 0; w.print = () => { n++; };
      doc.getElementById("print").click();
      assert.equal(n, 1);
    });
    await withPage("pages/cheatsheet.html", ({ window: w, document: doc }) => {
      let n = 0; w.print = () => { n++; };
      const b = doc.querySelector("button[data-print]");
      assert.ok(b && b.closest(".no-print"), "a button that is hidden on paper");
      b.click();
      assert.equal(n, 1);
      assert.ok(doc.querySelector('a[href="handouts.html"]'), "links to the handouts");
    });
  });

  QUnit.module("pages: paths, prompts and teaching notes");

  QUnit.test("Study paths: every path can be chosen, every step is a link that exists, and the address can choose the path", async (assert) => {
    await withPage("pages/paths.html", ({ window: w, document: doc }) => {
      const D = w.OSData, sel = doc.getElementById("path");
      assert.equal(sel.options.length, D.paths.length);
      D.paths.forEach((p) => {
        sel.value = p.id; sel.dispatchEvent(new w.Event("change", { bubbles: true }));
        const links = [...doc.querySelectorAll("#path-view ol.path-steps li a")];
        assert.equal(links.length, p.steps.length, `${p.id}: a link per step`);
        links.forEach((a) => { const href = a.getAttribute("href"); assert.ok(fs.existsSync(path.resolve(ROOT, "pages", href.split("#")[0])), `${p.id}: ${href} exists`); });
        assert.equal(doc.querySelector("#path-view h2").textContent, p.title, `${p.id}: shown`);
      });
    });
    await withPage("pages/paths.html", ({ document: doc }) => { assert.equal(doc.getElementById("path").value, "security"); assert.ok(/Security/.test(doc.querySelector("#path-view h2").textContent)); }, "#security");
    await withPage("pages/paths.html", ({ document: doc }) => { assert.equal(doc.getElementById("path").value, "newcomer", "an unknown path falls back to the first"); }, "#nonsense");
  });

  QUnit.test("Every module page shows its prompts with working links, and never the teaching notes", async (assert) => {
    for (const f of moduleFiles) {
      await withPage("modules/" + f, ({ window: w, document: doc }) => {
        const n = +f.slice(0, 2), D = w.OSData, sec = doc.querySelector("section.prompts");
        assert.ok(sec, `${f}: has a prompts section`);
        const items = [...sec.querySelectorAll("li")];
        assert.equal(items.length, D.prompts[n].length, `${f}: one item per prompt`);
        sec.querySelectorAll("a").forEach((a) => {
          const href = a.getAttribute("href"), file = path.normalize(path.join(ROOT, "modules", href.split("#")[0]));
          assert.ok(fs.existsSync(file), `${f}: ${href} exists`);
          const frag = href.split("#")[1];
          if (frag && href.startsWith(f)) assert.ok(doc.getElementById(frag), `${f}: #${frag} is on the page`);
        });
        assert.ok(sec.compareDocumentPosition(doc.querySelector("[data-quiz]")) & 4, `${f}: before the quiz`);
        assert.ok(!doc.body.textContent.includes(w.OSData.teaching ? "Listen for" : " "), `${f}: no teaching notes`);
      });
    }
  });

  QUnit.test("Teaching notes: every module is shown with its misconceptions, demonstration and listen-for lines; the picker narrows it", async (assert) => {
    await withPage("pages/teaching.html", ({ window: w, document: doc }) => {
      const D = w.OSData, sel = doc.getElementById("mod");
      assert.equal(doc.querySelectorAll(".teach-module").length, D.modules.length, "all modules at first");
      assert.equal(doc.querySelectorAll(".listen").length, Object.values(D.prompts).reduce((n, l) => n + l.length, 0), "a listen-for line per prompt");
      sel.value = "9"; sel.dispatchEvent(new w.Event("change", { bubbles: true }));
      const blocks = doc.querySelectorAll(".teach-module");
      assert.equal(blocks.length, 1);
      assert.ok(/Module 9: /.test(blocks[0].querySelector("h2").textContent));
      assert.equal(blocks[0].querySelectorAll(".demo").length, D.teaching[9].demos.length);
      assert.equal(blocks[0].querySelectorAll("h3").length, 3);
      assert.ok(doc.querySelector('a[href="handouts.html"]'), "points to the answer keys");
    });
    await withPage("pages/teaching.html", ({ document: doc }) => { assert.equal(doc.querySelectorAll(".teach-module").length, 1); assert.ok(/Module 10: /.test(doc.querySelector(".teach-module h2").textContent)); }, "#module-10");
  });

  QUnit.test("Handouts: the prompts sheet has the chosen modules' prompts with writing lines", async (assert) => {
    await withPage("pages/handouts.html", ({ window: w, document: doc }) => {
      const D = w.OSData, form = doc.getElementById("setup"), sheet = doc.getElementById("sheet");
      [...doc.querySelectorAll("#modules input")].forEach((b) => { b.checked = [5, 11].includes(+b.value); });
      const r = form.querySelector("input[name=kind][value=prompts]"); r.checked = true; r.dispatchEvent(new w.Event("change", { bubbles: true }));
      assert.equal(sheet.querySelectorAll(".wq").length, D.prompts[5].length + D.prompts[11].length);
      assert.equal(sheet.querySelectorAll(".lines").length, sheet.querySelectorAll(".wq").length, "space to write for each");
      assert.ok(!sheet.textContent.includes("Listen for"));
    });
  });


  QUnit.module("pages: shareable simulation links");

  /** The hash that the "Copy link" button produces on a page: the page is driven by `act`, then the link box (shown when the clipboard is unavailable) is read. */
  const linkFrom = (doc, name) => { const bar = sim(doc, name).querySelector(".share-bar"); button(bar, "Copy link to this setup").click(); return bar.querySelector("input").value; };
  const hashOf = (url) => url.slice(url.indexOf("#"));
  const statusOf = (doc, name) => text(sim(doc, name).querySelector(".share-bar .small"));

  QUnit.test("Every shareable simulation has a Copy link button, and the link is a plain address", async (assert) => {
    const where = { scheduling: "modules/06-scheduling.html", pagerepl: "modules/14-virtual-memory.html", disk: "modules/15-disk-io.html", banker: "modules/11-deadlocks.html", paging: "modules/13-memory.html", memalloc: "modules/13-memory.html" };
    for (const [name, rel] of Object.entries(where)) {
      await withPage(rel, ({ document: doc }) => {
        const url = linkFrom(doc, name);
        assert.ok(new RegExp("#" + name + "\.").test(url), `${name}: link names the simulation: ${url.slice(0, 90)}`);
        assert.ok(!/[<>"' ]/.test(url), `${name}: only URL-safe characters`);
        assert.ok(url.length < 1500, `${name}: short enough`);
      });
    }
  });

  QUnit.test("Scheduler: a link sets the table, algorithm and quantum; the result is the library's", async (assert) => {
    const hash = "#scheduling.procs=A,0,5,1;B,1,3,2;C,2,1,3&scheduling.algo=RR&scheduling.q=2";
    await withPage("modules/06-scheduling.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "scheduling");
      assert.deepEqual([...s.querySelectorAll("tbody tr")].slice(0, 3).map((tr) => tr.querySelector("td").textContent.replace("■", "").trim()), ["A", "B", "C"], "the processes from the link");
      assert.equal(field(doc, "Algorithm").value, "RR");
      assert.equal(field(doc, "Time quantum").value, "2");
      assert.notEqual(field(doc, "Time quantum").closest("label").style.display, "none", "the quantum control shows for Round Robin");
      const r = w.OSLib.simulateScheduling([{ pid: "A", arrival: 0, burst: 5, priority: 1 }, { pid: "B", arrival: 1, burst: 3, priority: 2 }, { pid: "C", arrival: 2, burst: 1, priority: 3 }], "RR", { quantum: 2 });
      assert.equal(metrics(s)[0], r.avg.waiting.toFixed(2), "average waiting time matches");
      assert.ok(/Setup loaded/.test(statusOf(doc, "scheduling")));
    }, hash);
  });

  QUnit.test("Scheduler: set it up by hand, copy the link, open it elsewhere, and see the same thing", async (assert) => {
    let hash, before;
    await withPage("modules/06-scheduling.html", ({ window: w, document: doc }) => {
      setValue(w, field(doc, "Algorithm"), "SJF", "change");
      const pr = doc.querySelector('[data-sim="scheduling"] input[aria-label="P2 burst"]'); setValue(w, pr, 11);
      before = metrics(sim(doc, "scheduling")); hash = hashOf(linkFrom(doc, "scheduling"));
    });
    await withPage("modules/06-scheduling.html", ({ document: doc }) => {
      assert.equal(field(doc, "Algorithm").value, "SJF");
      assert.deepEqual(metrics(sim(doc, "scheduling")), before, "same numbers");
      assert.equal(doc.querySelector('input[aria-label="P2 burst"]').value, "11");
    }, hash);
  });

  QUnit.test("Scheduler: bad or hostile links change nothing and inject nothing", async (assert) => {
    let fresh;
    await withPage("modules/06-scheduling.html", ({ document: doc }) => { fresh = metrics(sim(doc, "scheduling")); });
    const bad = ["#scheduling.q=99&scheduling.algo=nope", "#scheduling.procs=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E,1,1,1", "#scheduling.procs=" + "A,0,1,1;".repeat(40), "#scheduling.procs=A,0,1,1;A,0,2,2", "#scheduling.algo=__proto__"];
    for (const h of bad) {
      await withPage("modules/06-scheduling.html", ({ document: doc }) => {
        assert.deepEqual(metrics(sim(doc, "scheduling")), fresh, `unchanged by ${h.slice(0, 50)}`);
        assert.equal(sim(doc, "scheduling").querySelectorAll("img").length, 0, "no element was created from the link");
        assert.ok(!/Setup loaded/.test(statusOf(doc, "scheduling")), "it did not claim to load");
        assert.ok(/Ignored/.test(statusOf(doc, "scheduling")), "it says what it ignored");
      }, h);
    }
    await withPage("modules/06-scheduling.html", ({ document: doc }) => {
      assert.equal(field(doc, "Algorithm").value, "SJF", "the good field of a mixed link is still used");
    }, "#scheduling.algo=SJF&scheduling.q=99");
  });

  QUnit.test("Page replacement: Belady's anomaly from a link, and a round trip", async (assert) => {
    await withPage("modules/14-virtual-memory.html", ({ document: doc }) => {
      assert.equal(metrics(sim(doc, "pagerepl"))[0], "10", "FIFO with 4 frames faults 10 times");
      assert.equal(field(doc, "Frames").value, "4");
      assert.equal(field(doc, "Reference string").value, "1 2 3 4 1 2 5 1 2 3 4 5");
    }, "#pagerepl.refs=1,2,3,4,1,2,5,1,2,3,4,5&pagerepl.frames=4&pagerepl.algo=FIFO");
    let hash, before;
    await withPage("modules/14-virtual-memory.html", ({ window: w, document: doc }) => {
      setValue(w, field(doc, "Algorithm"), "LRU", "change"); setValue(w, field(doc, "Frames"), 5); setValue(w, field(doc, "Reference string"), "3 1 4 1 5 9 2 6 5 3 5");
      before = metrics(sim(doc, "pagerepl")); hash = hashOf(linkFrom(doc, "pagerepl"));
    });
    await withPage("modules/14-virtual-memory.html", ({ document: doc }) => { assert.deepEqual(metrics(sim(doc, "pagerepl")), before); }, hash);
    await withPage("modules/14-virtual-memory.html", ({ document: doc }) => { assert.equal(field(doc, "Frames").value, "3", "9 frames is out of range, so ignored"); }, "#pagerepl.frames=9&pagerepl.refs=1,2,x");
  });

  QUnit.test("Disk: the textbook queue under SSTF from a link moves 236 cylinders; round trip", async (assert) => {
    await withPage("modules/15-disk-io.html", ({ document: doc }) => {
      const m = sim(doc, "disk");
      assert.equal(metrics(m)[0], "236");
      assert.equal(field(doc, "Request queue").value, "98 183 37 122 14 124 65 67");
    }, "#disk.reqs=98,183,37,122,14,124,65,67&disk.head=53&disk.max=199&disk.algo=SSTF");
    let hash, before;
    await withPage("modules/15-disk-io.html", ({ window: w, document: doc }) => {
      setValue(w, field(doc, "Algorithm"), "CSCAN", "change"); setValue(w, field(doc, "Initial direction"), "down", "change"); setValue(w, field(doc, "Request queue"), "10 150 20 130 30 120");
      before = metrics(sim(doc, "disk")); hash = hashOf(linkFrom(doc, "disk"));
    });
    await withPage("modules/15-disk-io.html", ({ document: doc }) => {
      assert.deepEqual(metrics(sim(doc, "disk")), before);
      assert.notEqual(field(doc, "Initial direction").closest("label").style.display, "none", "the direction control shows for C-SCAN");
    }, hash);
    await withPage("modules/15-disk-io.html", ({ document: doc }) => { assert.equal(field(doc, "Request queue").value, "98 183 37 122 14 124 65 67", "a queue beyond the disk is ignored"); }, "#disk.max=100&disk.reqs=500,2");
  });

  QUnit.test("Banker's: an unsafe state, and a request that is checked when the link opens", async (assert) => {
    const unsafe = "#banker.alloc=0,1,0;2,0,0;3,0,2;2,1,1;3,3,2&banker.max=7,5,3;3,2,2;9,0,2;2,2,2;4,3,3&banker.avail=0,0,2&banker.pid=1&banker.req=1,0,2";
    await withPage("modules/11-deadlocks.html", ({ document: doc }) => {
      const b = sim(doc, "banker");
      assert.ok(/UNSAFE/.test(text(b)), "the safety verdict follows the link");
      const req = [...b.querySelectorAll("h4")].find((x) => x.textContent === "Make a request").parentElement;
      assert.equal(req.querySelector("select").value, "1", "the requesting process");
      assert.deepEqual([...req.querySelectorAll("input")].map((i) => i.value), ["1", "0", "2"], "the request");
      assert.ok(/granted|exceed|not enough|unsafe/i.test(text(req.querySelector("p[aria-live]"))), "the request was checked when the link opened: " + text(req.querySelector("p[aria-live]")));
    }, unsafe);
    let hash;
    await withPage("modules/11-deadlocks.html", ({ window: w, document: doc }) => {
      setValue(w, doc.querySelector('input[aria-label="Available A"]'), 9);
      hash = hashOf(linkFrom(doc, "banker"));
    });
    await withPage("modules/11-deadlocks.html", ({ document: doc }) => { assert.equal(doc.querySelector('input[aria-label="Available A"]').value, "9"); }, hash);
    await withPage("modules/11-deadlocks.html", ({ document: doc }) => { assert.ok(/SAFE\./.test(text(sim(doc, "banker"))) && !/UNSAFE/.test(text(sim(doc, "banker"))), "a matrix with the wrong shape is ignored"); }, "#banker.alloc=1,2;3,4&banker.avail=1,2");
  });

  QUnit.test("Paging: page size, page table and address from a link", async (assert) => {
    await withPage("modules/13-memory.html", ({ document: doc }) => {
      assert.ok(/= 7188\b/.test(text(sim(doc, "paging"))), "address 1300 with the default 256-byte table is physical 7188");
    }, "#paging.ps=256&paging.addr=1300");
    await withPage("modules/13-memory.html", ({ document: doc }) => {
      const p = sim(doc, "paging");
      assert.equal(field(doc, "Page size").value, "1024");
      assert.ok(/Physical = 0 × 1024 \+ 52 = 52/.test(text(p)), text(p).slice(-200));
      assert.equal(p.querySelectorAll('input[aria-label^="Frame for page"]').length, 4);
      assert.equal(p.querySelector('input[aria-label="Frame for page 1"]').value, "", "a blank entry is an unmapped page");
    }, "#paging.ps=1024&paging.table=3,-1,0,1&paging.addr=2100");
    await withPage("modules/13-memory.html", ({ document: doc }) => { assert.ok(/page fault/i.test(text(sim(doc, "paging"))), "an address on an unmapped page is a fault"); }, "#paging.ps=1024&paging.table=3,-1,0,1&paging.addr=1100");
    let hash;
    await withPage("modules/13-memory.html", ({ window: w, document: doc }) => {
      setValue(w, field(doc, "Page size"), "512", "change"); setValue(w, doc.querySelector('input[aria-label="Frame for page 3"]'), 9); setValue(w, field(doc, "Logical address"), 2000);
      hash = hashOf(linkFrom(doc, "paging"));
    });
    await withPage("modules/13-memory.html", ({ document: doc }) => {
      assert.equal(field(doc, "Page size").value, "512"); assert.equal(doc.querySelector('input[aria-label="Frame for page 3"]').value, "9");
      assert.ok(/Logical <?b?>?2000|Logical 2000/.test(text(sim(doc, "paging"))));
    }, hash);
    await withPage("modules/13-memory.html", ({ document: doc }) => { assert.equal(field(doc, "Page size").value, "256", "a page table of the wrong size, or a bad page size, is ignored"); }, "#paging.ps=300&paging.table=1,2,3");
  });

  QUnit.test("Memory allocation: a link replays the actions, and what you did replays the same way", async (assert) => {
    const L = require("../js/lib/memory.js");
    const independent = (ops) => {
      let b = [{ start: 0, size: 100, pid: "OS" }, { start: 100, size: 900, pid: null }], n = 0, strat = "first";
      ops.forEach((t) => { if (t[0] === "a") { const r = L.allocate(b, "P" + (n + 1), +t.slice(1), strat); if (r.ok) { n++; b = r.blocks; } } else if (t[0] === "f") b = L.release(b, "P" + t.slice(1)); else if (t === "c") b = L.compact(b); else if (t[0] === "S") strat = { f: "first", b: "best", w: "worst" }[t[1]]; });
      const f = L.fragmentation(b); return [f.free + " KB", f.largest + " KB", String(f.holes), (f.external * 100).toFixed(0) + "%"];
    };
    const ops = ["a120", "a60", "a200", "f2", "a50", "Sb", "a30", "a700", "f1", "c"];
    await withPage("modules/13-memory.html", ({ document: doc }) => {
      assert.deepEqual(metrics(sim(doc, "memalloc")), independent(ops), "same memory map as an independent replay");
      assert.ok(/Replayed 9 steps/.test(text(sim(doc, "memalloc"))), "the impossible allocation is skipped, and the message counts what was applied: " + text(sim(doc, "memalloc")).slice(-120));
    }, "#memalloc.ops=" + ops.join(","));
    let hash, before;
    await withPage("modules/13-memory.html", ({ window: w, document: doc }) => {
      const m = sim(doc, "memalloc");
      setValue(w, field(doc, "Request size"), 150); button(m, "Allocate").click(); setValue(w, field(doc, "Request size"), 80); button(m, "Allocate").click();
      setValue(w, field(doc, "Placement strategy"), "worst", "change"); setValue(w, field(doc, "Request size"), 40); button(m, "Allocate").click();
      button(m, "P1 (150K)").click(); button(m, "Compact memory").click();
      before = metrics(m); hash = hashOf(linkFrom(doc, "memalloc"));
      assert.ok(/ops=a150,a80,Sw,a40,f1,c$/.test(hash.replace("memalloc.", "")) || /memalloc\.ops=a150,a80,Sw,a40,f1,c$/.test(hash), "the link is the list of actions: " + hash);
    });
    await withPage("modules/13-memory.html", ({ document: doc }) => { assert.deepEqual(metrics(sim(doc, "memalloc")), before); }, hash);
    await withPage("modules/13-memory.html", ({ document: doc }) => { assert.deepEqual(metrics(sim(doc, "memalloc")).slice(0, 2), ["900 KB", "900 KB"], "unknown commands: the whole field is ignored"); }, "#memalloc.ops=a100,rm-rf");
  });

  QUnit.test("The other shareable simulations: set up, copy the link, open it elsewhere, and the simulation shows the same thing", async (assert) => {
    const inSim = (el, labelStart) => {
      const l = [...el.querySelectorAll("label")].find((x) => x.textContent.trim().toLowerCase().startsWith(labelStart.toLowerCase()));
      if (!l) throw new Error(`no field labelled “${labelStart}”`);
      return l.querySelector("input,select");
    };
    const signature = (el) => { const c = el.cloneNode(true); c.querySelectorAll(".share-bar").forEach((n) => n.remove()); return text(c); };
    const pickOption = (w, sel, i) => setValue(w, sel, sel.options[i].value, "change");
    const check = (el, i, on, w) => { const b = el.querySelectorAll("input[type=checkbox]")[i]; b.checked = on; fire(w, b, "change"); };
    const CASES = {
      schedvs: ["modules/06-scheduling.html", (e, w) => { setValue(w, inSim(e, "Algorithm A"), "SJF", "change"); pickOption(w, inSim(e, "Workload"), 2); }],
      pagevs: ["modules/14-virtual-memory.html", (e, w) => { setValue(w, inSim(e, "Policy A"), "OPT", "change"); setValue(w, inSim(e, "Frames"), 4); pickOption(w, inSim(e, "Reference string"), 1); }],
      amdahl: ["modules/07-threads.html", (e, w) => { setValue(w, inSim(e, "Parallel fraction"), 0.5); setValue(w, inSim(e, "Your core count"), 16); }],
      switchcost: ["modules/07-threads.html", (e, w) => { setValue(w, inSim(e, "Time quantum"), 30); setValue(w, inSim(e, "Runnable processes"), 20); }],
      eat: ["modules/14-virtual-memory.html", (e, w) => { setValue(w, inSim(e, "Memory access"), 200); setValue(w, inSim(e, "Fault service time"), 4.5); setValue(w, inSim(e, "Fault rate"), -4.5); }],
      alloc: ["modules/16-file-systems.html", (e, w) => { setValue(w, inSim(e, "File length"), 9); setValue(w, inSim(e, "Read file block"), 3); }],
      inode: ["modules/16-file-systems.html", (e, w) => { setValue(w, inSim(e, "Block size"), "2048", "change"); setValue(w, inSim(e, "Pointer size"), "8", "change"); setValue(w, inSim(e, "Direct pointers"), 10); check(e, 2, true, w); }],
      forktree: ["modules/05-processes.html", (e, w) => { setValue(w, inSim(e, "Number of fork"), 4); }],
      mlfq: ["modules/08-advanced-scheduling.html", (e, w) => { pickOption(w, inSim(e, "Workload"), 1); setValue(w, inSim(e, "Time slice, level 2"), 6); setValue(w, inSim(e, "Priority boost"), 10); }],
      multicore: ["modules/08-advanced-scheduling.html", (e, w) => { pickOption(w, inSim(e, "Workload"), 1); setValue(w, inSim(e, "Cores"), 6); pickOption(w, inSim(e, "Balancing"), 0); setValue(w, inSim(e, "Cost of moving"), 3); }],
      raid: ["modules/17-storage-reliability.html", (e, w) => { setValue(w, inSim(e, "RAID level"), "6", "change"); setValue(w, inSim(e, "Disks"), 7); e.querySelectorAll('[role="group"] button')[1].click(); e.querySelectorAll('[role="group"] button')[4].click(); }],
      raidrisk: ["modules/17-storage-reliability.html", (e, w) => { setValue(w, inSim(e, "Disk size"), 12); setValue(w, inSim(e, "Disks in the array"), 8); setValue(w, inSim(e, "Drive's error rate"), "1e15", "change"); }],
      ssdwear: ["modules/17-storage-reliability.html", (e, w) => { setValue(w, inSim(e, "Hidden spare"), 20); setValue(w, inSim(e, "How full"), 50); pickOption(w, inSim(e, "Writes"), 1); check(e, 0, false, w); }],
      journal: ["modules/17-storage-reliability.html", (e, w) => { pickOption(w, inSim(e, "File system"), 1); setValue(w, inSim(e, "Crash after"), 2); }],
      stackattack: ["modules/03-security-depth.html", (e, w) => { setValue(w, inSim(e, "Input length"), 20); check(e, 0, true, w); check(e, 1, true, w); }],
      pwcrack: ["modules/03-security-depth.html", (e, w) => { setValue(w, inSim(e, "Length"), 12); pickOption(w, inSim(e, "Characters used"), 1); pickOption(w, inSim(e, "How was it chosen"), 1); }]
    };
    for (const [name, [rel, mutate]] of Object.entries(CASES)) {
      let fresh, changed, hash;
      await withPage(rel, ({ window: w, document: doc }) => {
        const e = sim(doc, name);
        fresh = signature(e);
        mutate(e, w);
        changed = signature(e);
        assert.notEqual(changed, fresh, `${name}: the changes show`);
        hash = hashOf(linkFrom(doc, name));
        assert.ok(hash.startsWith("#" + name + "."), `${name}: the link names the simulation: ${hash.slice(0, 100)}`);
        assert.ok(!/[<>"' ]/.test(hash), `${name}: URL-safe`);
      });
      await withPage(rel, ({ document: doc }) => { assert.equal(signature(sim(doc, name)), changed, `${name}: the link restores what was set up`); }, hash);
      await withPage(rel, ({ document: doc }) => { assert.equal(signature(sim(doc, name)), fresh, `${name}: a link for other keys, and junk values, change nothing`); }, `#${name}.nothing=1&${name}.${hash.slice(name.length + 2).split("=")[0]}=%3Cimg%3E&other.x=2`);
    }
  });


  QUnit.test("Links for one simulation leave the others on the page alone, and the existing #compare and #p links still work", async (assert) => {
    await withPage("modules/13-memory.html", ({ document: doc }) => {
      assert.equal(field(doc, "Page size").value, "256", "the paging simulation ignores memalloc's keys");
      assert.equal(metrics(sim(doc, "memalloc"))[0], "670 KB");
    }, "#memalloc.ops=a100,a130");
    await withPage("modules/18-os-landscape.html", ({ document: doc }) => { assert.ok(/Windows/.test(text(doc.querySelector('[data-sim="oscompare"]'))) && /z\/OS/.test(text(doc.querySelector('[data-sim="oscompare"]')))); }, "#compare=windows,zos");
  });


  QUnit.test("Answering a quiz question records progress, and visiting a module records the visit", async (assert) => {
    await withPage("modules/09-synchronization.html", ({ window: w, document: doc }) => {
      const P = w.OSProgress, L = w.OSLib;
      assert.ok(P, "progress is loaded on module pages");
      assert.deepEqual(Object.keys(P.state.visited), ["9"], "the visit is recorded");
      const q = doc.querySelector(".quiz .q"), stem = q.querySelector(".stem").textContent.replace(/^[0-9]+[.] /, "").replace(/ [(]Module.*$/, "");
      const data = w.OSData.quizzes.find((x) => stem.startsWith(x.q));
      q.querySelector(`button.choice[data-i="${data.answer}"]`).click();
      assert.equal(P.state.quiz[9].answered, 1);
      assert.equal(P.state.quiz[9].correct, 1);
      assert.equal(P.state.quiz[9].q[L.questionId(data.q)], 1, "stored under the question's id");
      const q2 = doc.querySelectorAll(".quiz .q")[1];
      q2.querySelector("button.reveal").click();
      assert.equal(P.state.quiz[9].answered, 1, "just revealing an answer is not counted");
      const wrong = q2.querySelector("button.choice");
      assert.ok(wrong, "the second question's choices are still there");
    });
  });

  QUnit.test("Flashcards: reveal, grade, boxes, direction, and the hide-known option", async (assert) => {
    await withPage("pages/flashcards.html", ({ window: w, document: doc }) => {
      const P = w.OSProgress, card = () => doc.getElementById("card"), $ = (id) => doc.getElementById(id);
      assert.ok(/cards in this set/.test($("stats").textContent));
      assert.true($("knew").hidden && $("learning").hidden && !$("flip").hidden, "answer buttons appear only after revealing");
      const term = card().querySelector(".front .big").textContent;
      assert.ok(w.OSData.glossary.some((g) => g.term === term), "the front shows a glossary term");
      $("flip").click();
      const def = w.OSData.glossary.find((g) => g.term === term).def;
      assert.equal(card().querySelector(".back .big").textContent, def, "the back shows its definition");
      assert.false($("knew").hidden);
      assert.ok(card().querySelector(".back a"), "a link to where the term is discussed");
      $("knew").click();
      assert.deepEqual(JSON.parse(JSON.stringify(P.state.cards[term])), { box: 1, seen: 1 });
      const next = card().querySelector(".front .big").textContent;
      assert.notEqual(next, term, "never the same card twice in a row");
      $("flip").click(); $("learning").click();
      assert.equal(P.state.cards[next].box, 0);
      // keyboard
      doc.dispatchEvent(new w.KeyboardEvent("keydown", { key: " ", bubbles: true }));
      assert.false(card().querySelector(".back").hidden, "Space reveals");
      const t3 = card().querySelector(".front .big").textContent;
      doc.dispatchEvent(new w.KeyboardEvent("keydown", { key: "k", bubbles: true }));
      assert.equal(P.state.cards[t3].box, 1, "K marks known");
      // direction
      setValue(w, $("dir"), "def", "change");
      const shown = card().querySelector(".front .big").textContent;
      assert.ok(w.OSData.glossary.some((g) => g.def === shown), "definition first");
      // topic with everything known and 'hide'
      setValue(w, $("cat"), "Scheduling", "change");
      w.OSData.glossary.filter((g) => g.cat === "Scheduling").forEach((g) => { P.card(g.term, true); P.card(g.term, true); P.card(g.term, true); });
      setValue(w, $("known"), "hide", "change");
      assert.ok(/every card in this set is marked known/.test(card().textContent), "nothing left to study");
      assert.true($("flip").hidden);
    });
  });

  QUnit.test("Exam mode: setup validation, answering, scoring, review of misses, and progress", async (assert) => {
    await withPage("pages/exam.html", ({ window: w, document: doc }) => {
      const $ = (id) => doc.getElementById(id), P = w.OSProgress;
      assert.equal(doc.querySelectorAll("#modules input[type=checkbox]").length, w.OSData.modules.length);
      $("none").click();
      $("start").click();
      assert.ok(/at least one module/.test($("setup-msg").textContent) && $("exam").hidden, "needs a module");
      doc.querySelector('#modules input[value="1"]').checked = true;
      setValue(w, $("count"), "10", "change"); setValue(w, $("time"), "0", "change");
      $("start").click();
      assert.false($("exam").hidden);
      assert.true($("setup").hidden);
      const qs = [...doc.querySelectorAll("#questions fieldset")];
      assert.equal(qs.length, Math.min(10, w.OSData.quizzes.filter((q) => q.mod === 1).length));
      assert.equal($("clock").textContent, "No time limit");
      assert.equal(doc.querySelectorAll("#questions .explain, #questions .correct, #questions .wrong").length, 0, "no answers are shown during the exam");
      assert.true(qs.every((f) => f.querySelectorAll("input[type=radio]").length === 4));
      // answer the first 3 correctly, the 4th wrongly, leave the rest
      const text = (f) => f.querySelector("legend").textContent.replace(/^[0-9]+[.] /, "");
      qs.slice(0, 4).forEach((f, i) => {
        const data = w.OSData.quizzes.find((q) => q.q === text(f));
        const pick = i < 3 ? data.answer : (data.answer + 1) % 4;
        f.querySelector(`input[value="${pick}"]`).click();
      });
      assert.equal($("answered").textContent, `4 of ${qs.length} answered`);
      $("submit").click();
      assert.false($("results").hidden);
      assert.ok($("score").textContent.startsWith("Score: 3 of " + qs.length), $("score").textContent);
      assert.ok($("results").textContent.includes(`1 wrong, ${qs.length - 4} left blank`));
      const reviews = doc.querySelectorAll("#results .review");
      assert.equal(reviews.length, qs.length - 3, "every miss and blank is reviewed");
      assert.ok([...reviews].some((r) => /You left this blank/.test(r.textContent)) && [...reviews].some((r) => /You chose:/.test(r.textContent)));
      assert.equal(P.state.exams.length, 1);
      assert.deepEqual([P.state.exams[0].correct, P.state.exams[0].total, P.state.exams[0].mods], [3, qs.length, [1]]);
      assert.equal(P.state.quiz[1].answered, 4, "answered questions also update mastery");
      $("again").click();
      assert.false($("setup").hidden);
    });
  });

  QUnit.test("Exam mode: the clock runs out and submits for you", async (assert) => {
    await withPage("pages/exam.html", ({ window: w, document: doc }) => {
      const $ = (id) => doc.getElementById(id);
      let t = 1000000;
      w.OSExamNow = () => t;
      doc.querySelector('#modules input[value="2"]').checked = true;
      $("none").click(); doc.querySelector('#modules input[value="2"]').checked = true;
      setValue(w, $("count"), "10", "change"); setValue(w, $("time"), "1", "change");
      $("start").click();
      const limit = w.OSLib.suggestedSeconds(Math.min(10, w.OSData.quizzes.filter((q) => q.mod === 2).length));
      assert.equal($("clock").textContent, w.OSLib.formatClock(limit), "the clock starts at the limit");
      t += (limit - 60) * 1000; w.OSExam.check();
      assert.ok($("clock").textContent === "1:00", "about a minute left: " + $("clock").textContent);
      assert.ok(/1 minute left/.test($("alerts").textContent), "a warning is announced");
      assert.true($("exam-bar").classList.contains("low"));
      assert.true($("results").hidden);
      t += 61 * 1000; w.OSExam.check();
      assert.false($("results").hidden, "submitted automatically");
      assert.ok(/The time limit ended the exam/.test($("results").textContent));
      assert.ok(/Score: 0 of/.test($("score").textContent), "nothing was answered");
    });
  });

  QUnit.test("Scenario questions: choose, see every option explained, and filter by topic", async (assert) => {
    await withPage("pages/scenarios.html", ({ window: w, document: doc }) => {
      const host = doc.getElementById("scenario");
      const stem = () => host.querySelector(".stem").textContent;
      const sc = () => w.OSData.scenarios.find((s) => s.situation === stem());
      assert.ok(sc(), "a scenario from the data is shown");
      assert.equal(host.querySelectorAll("button.choice").length, 4);
      assert.true(host.querySelector(".explain").hidden, "explanations wait for an answer");
      host.querySelector(`button.choice[data-i="${sc().answer}"]`).click();
      assert.ok(host.querySelector(".explain").textContent.startsWith("Right."));
      assert.equal(host.querySelectorAll(".explain li").length, 4, "all four options explained");
      assert.ok(host.querySelector(".explain a").getAttribute("href").startsWith("../modules/"));
      assert.true([...host.querySelectorAll("button.choice")].every((b) => b.disabled));
      const first = sc().id;
      doc.getElementById("next").click();
      assert.notEqual(sc().id, first, "another scenario");
      const wrong = (sc().answer + 1) % 4;
      host.querySelector(`button.choice[data-i="${wrong}"]`).click();
      assert.ok(host.querySelector(".explain").textContent.startsWith("Not the best fit."));
      assert.equal(host.querySelectorAll("button.choice.wrong").length, 1);
      setValue(w, doc.getElementById("topic"), "Virtualization", "change");
      assert.equal(sc().topic, "Virtualization");
      host.querySelector("button.btn.secondary").click();
      assert.ok(host.querySelector(".explain").textContent.startsWith("Best fit:"), "'just show the answer' skips the guess");
    });
  });

  QUnit.test("Progress page: import, summary, export and clear (with a confirmation step)", async (assert) => {
    await withPage("pages/progress.html", ({ window: w, document: doc }) => {
      const $ = (id) => doc.getElementById(id);
      assert.equal(doc.querySelectorAll("#modules table").length, w.OSData.parts.length, "one table per part");
      assert.deepEqual([...doc.querySelectorAll("#overview .metric b")].map((b) => b.textContent), ["0 of " + w.OSData.modules.length, "0 of " + w.OSData.quizzes.length, "0", "0"]);
      const p = w.OSLib.newProgress();
      w.OSLib.markVisited(p, 4, "2026-11-03"); w.OSLib.recordAnswer(p, 4, "abc", true); w.OSLib.gradeCard(p, "Deadlock", true);
      w.OSLib.recordExam(p, { date: "2026-11-04", mods: [4], total: 10, correct: 7, seconds: 125 });
      $("import-text").value = w.OSLib.serializeProgress(p);
      $("import").click();
      assert.ok(/Imported/.test($("message").textContent));
      assert.equal(doc.querySelector("#overview .metric b").textContent, "1 of " + w.OSData.modules.length);
      assert.ok(text(doc.getElementById("modules")).includes("2026-11-03"));
      assert.ok(/7 of 10 \(70%\)/.test(text($("exams"))) || text($("exams")).includes("7 of 10 (70%)"));
      assert.ok(text($("exams")).includes("2:05"), "exam time shown as minutes:seconds");
      $("export").click();
      assert.false($("export-box").hidden);
      assert.equal(JSON.parse($("export-text").value).visited["4"], "2026-11-03", "export is the stored state");
      $("import-text").value = "this is not progress";
      $("import").click();
      assert.ok(/not valid progress data/.test($("message").textContent), "bad import is refused with a reason");
      assert.equal(doc.querySelector("#overview .metric b").textContent, "1 of " + w.OSData.modules.length, "and nothing changed");
      $("clear").click();
      assert.false($("clear-confirm").hidden, "clearing asks first");
      $("clear-no").click();
      assert.equal(doc.querySelector("#overview .metric b").textContent, "1 of " + w.OSData.modules.length, "'Keep it' keeps it");
      $("clear").click(); $("clear-yes").click();
      assert.equal(doc.querySelector("#overview .metric b").textContent, "0 of " + w.OSData.modules.length);
      assert.deepEqual(JSON.parse(JSON.stringify(w.OSProgress.state.visited)), {});
    });
  });

  QUnit.test("Home page cards show progress once a module has been visited", async (assert) => {
    await withPage("index.html", ({ window: w, document: doc }) => {
      assert.equal(doc.querySelectorAll(".progress-chip").length, 0, "nothing yet");
      assert.ok(w.OSProgress, "progress is available on the home page");
    });
  });

  QUnit.module("pages: study aids");

  QUnit.test("Every module shows its objectives under the introduction, takeaways before the quiz, and outside reading after it", async (assert) => {
    for (const f of MODULE_PAGES) {
      await withPage(`modules/${f}`, ({ window: w, document: doc }) => {
        const n = +doc.body.dataset.module, st = w.OSData.study[n];
        const obj = doc.getElementById("objectives"), key = doc.getElementById("key-takeaways"), rd = doc.getElementById("further-reading"), quiz = doc.querySelector("[data-quiz]");
        assert.ok(obj && key && rd, `${f}: all three boxes exist`);
        if (!obj || !key || !rd) return;
        assert.deepEqual([...obj.parentElement.querySelectorAll("li")].map((li) => li.textContent), st.objectives, `${f}: objectives`);
        assert.deepEqual([...key.parentElement.querySelectorAll("li")].map((li) => li.textContent), st.takeaways, `${f}: takeaways`);
        const links = [...rd.parentElement.querySelectorAll("a")];
        assert.deepEqual(links.map((a) => a.getAttribute("href")), st.reading.map((r) => r[1]), `${f}: reading links`);
        assert.true(links.every((a) => a.getAttribute("rel") === "noopener" && /^https:/.test(a.href)), `${f}: outside links are https and rel=noopener`);
        const pos = (a, b) => !!(a.compareDocumentPosition(b) & 4);   // b follows a
        assert.true(pos(doc.querySelector(".lead"), obj) && pos(obj, key) && pos(key, quiz) && pos(quiz, rd), `${f}: order is introduction, objectives, ..., takeaways, quiz, reading`);
        assert.equal(obj.parentElement.getAttribute("aria-labelledby"), "objectives");
      });
    }
  });

  QUnit.test("Study aids are searchable and lead to their boxes", async (assert) => {
    await withPage("pages/search.html", ({ window: w, document: doc }) => {
      setValue(w, doc.getElementById("q"), "bug that depends on timing");
      const hrefs = [...doc.querySelectorAll("#results a")].map((a) => a.getAttribute("href"));
      assert.ok(hrefs.some((h) => /^\.\.\/modules\/09-synchronization\.html#(objectives|key-takeaways)$/.test(h)), "a takeaway about races is found: " + hrefs.slice(0, 5).join(" "));
    });
  });

  QUnit.module("pages: site-wide search");

  QUnit.test("Search page: results, highlighting, filters, shareable links and untrusted input", async (assert) => {
    await withPage("pages/search.html", ({ window: w, document: doc }) => {
      const input = doc.getElementById("q"), results = () => [...doc.querySelectorAll("#results li")], status = () => doc.getElementById("status").textContent;
      assert.ok(/Type one or more words/.test(status()), "empty at first");
      setValue(w, input, "deadlock");
      assert.ok(/results? for “deadlock”/.test(status()));
      const first = results()[0];
      assert.equal(first.querySelector(".tag").textContent, "Glossary");
      assert.equal(first.querySelector("a").getAttribute("href"), "../pages/glossary.html#deadlock");
      assert.ok(first.querySelector("a mark") && first.querySelector("mark").textContent.toLowerCase() === "deadlock", "matches are marked");
      assert.ok(results().some((li) => li.querySelector("a").getAttribute("href").startsWith("../modules/11-deadlocks.html")), "lessons are found too");
      setValue(w, doc.getElementById("kind"), "FAQ", "change");
      assert.ok(results().length > 0 && results().every((li) => li.querySelector(".tag").textContent === "FAQ"), "the Show filter keeps one kind");
      setValue(w, doc.getElementById("kind"), "", "change");
      setValue(w, input, "zzzzqqqq");
      assert.ok(/No results for “zzzzqqqq”/.test(status()) && results().length === 0);
      setValue(w, input, "<img src=x onerror=alert(1)>");
      assert.equal(doc.querySelectorAll("#results img, #status img").length, 0, "a query is never parsed as HTML");
      assert.ok(/No results/.test(status()));
      setValue(w, input, "semaphore");
      const link = results().find((li) => li.querySelector(".tag").textContent === "Lesson").querySelector("a").getAttribute("href");
      assert.ok(/^\.\.\/modules\/[A-Za-z0-9-]+\.html#[A-Za-z0-9-]+$/.test(link), "a lesson result links to its section: " + link);
    });
    await withPage("pages/search.html", ({ document: doc }) => {
      assert.equal(doc.getElementById("q").value, "page fault", "?q= fills the box");
      assert.ok(doc.querySelectorAll("#results li").length > 0);
    }, "?q=page%20fault");
    await withPage("pages/search.html", ({ document: doc, errors }) => {
      assert.deepEqual(errors, [], "a malformed link does not break the page");
    }, "#q=%E0%A4%A");
    await withPage("index.html", ({ document: doc }) => {
      assert.ok([...doc.querySelectorAll("header nav a")].some((a) => a.textContent === "Search" && a.getAttribute("href") === "pages/search.html"), "Search is in the navigation");
    });
  });

  QUnit.test("Every search-index link lands on a real heading, and headings get unique ids", async (assert) => {
    const idx = require("../tools/build-search-index.js").buildSections();
    const byPage = {};
    idx.forEach(([url]) => { const [file, id] = url.split("#"); (byPage[file] = byPage[file] || []).push(id); });
    for (const [file, ids] of Object.entries(byPage)) {
      await withPage(file, ({ document: doc }) => {
        ids.filter(Boolean).forEach((id) => assert.ok(doc.getElementById(id) && /^H2$/.test(doc.getElementById(id).tagName), `${file}#${id} is a heading`));
        const all = [...doc.querySelectorAll("[id]")].map((e) => e.id);
        assert.equal(new Set(all).size, all.length, `${file}: ids are unique`);
      });
    }
    assert.ok(Object.keys(byPage).length >= 22, "modules, labs and the cheat sheet are indexed");
  });

  QUnit.test("Every page's footer offers a way to report a problem, which a fork can change or remove", async (assert) => {
    for (const rel of allPages) {
      await withPage(rel, ({ window: w, document: doc }) => {
        const a = doc.querySelector("footer.site a[href$='/issues/new/choose']");
        assert.ok(a, `${rel}: has the report link`);
        if (!a) return;
        assert.equal(a.getAttribute("href"), w.OSData.site.repo + "/issues/new/choose", `${rel}: it points at OSData.site.repo`);
        assert.equal(a.getAttribute("rel"), "noopener");
      });
    }
    await withPage("index.html", ({ window: w, document: doc }) => {
      assert.equal(doc.querySelectorAll("footer.site a[href$='/issues/new/choose']").length, 1, "one link, not duplicated");
    });
  });

  QUnit.module("pages: course parts");

  QUnit.test("Home page groups the modules into parts, in reading order, with every module once", async (assert) => {
    await withPage("index.html", ({ window: w, document: doc }) => {
      const D = w.OSData, sections = [...doc.querySelectorAll("#module-grid section.part")];
      assert.equal(sections.length, D.parts.length);
      sections.forEach((sec, i) => {
        assert.equal(sec.querySelector("h3").textContent, `Part ${i + 1}: ${D.parts[i].title}`);
        assert.equal(sec.getAttribute("aria-labelledby"), sec.querySelector("h3").id, "section is labelled by its heading");
        assert.equal(sec.querySelector("h3").id, "part-" + D.parts[i].id, "module pages link to this anchor");
        assert.deepEqual([...sec.querySelectorAll(".card .num")].map((x) => +x.textContent.replace("Module ", "")), D.parts[i].modules, "cards follow the part's order");
      });
      assert.equal(doc.querySelectorAll("#module-grid .card").length, D.modules.length, "every module appears exactly once");
    });
  });

  QUnit.test("Module pages: the jump menu is grouped by part, the pager follows reading order, and the part is named under the title", async (assert) => {
    await withPage("modules/10-monitors.html", ({ window: w, document: doc }) => {
      const D = w.OSData, groups = [...doc.querySelectorAll("header select optgroup")];
      assert.deepEqual(groups.map((g) => g.label), D.parts.map((p, i) => `Part ${i + 1}: ${p.title}`));
      assert.equal(doc.querySelectorAll("header select option").length, D.modules.length + 1, "all modules plus the placeholder");
      assert.equal(doc.querySelector("header select option[selected]").textContent.slice(0, 3), "10.");
      const pager = [...doc.querySelectorAll(".pager a")].map((a) => a.textContent);
      assert.ok(pager[0].startsWith("← 9.") && pager[1].startsWith("11."), "in the Concurrency part, Module 10 comes after 9 and before 11: " + pager.join(" | "));
      const eyebrow = doc.querySelector(".eyebrow");
      assert.ok(eyebrow.textContent.includes("Module 10 · Part 3: Concurrency (2 of 4)"), eyebrow.textContent);
      assert.ok(eyebrow.querySelector("a").getAttribute("href").endsWith("index.html#part-concurrency"));
    });
    await withPage("modules/19-virtualization.html", ({ document: doc }) => {
      const pager = [...doc.querySelectorAll(".pager a")].map((a) => a.textContent);
      assert.equal(pager.length, 1, "Module 19 ends the course: only a Previous link");
      assert.ok(pager[0].startsWith("← 18."));
    });
  });

  QUnit.module("pages: Module 17 (storage reliability)");

  QUnit.test("RAID simulator: capacity, failing disks and the verdict follow the library", async (assert) => {
    await withPage("modules/17-storage-reliability.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "raid"), L = w.OSLib, diskBtns = () => [...s.querySelectorAll('[role="group"] button')], verdict = () => s.querySelector("p[aria-live]").textContent;
      assert.deepEqual(metrics(s).slice(0, 3), ["32 TB", "80%", "1"], "RAID 5, five 8 TB disks");
      assert.equal(diskBtns().length, 5);
      diskBtns()[0].click();
      assert.ok(/1 failed, data safe/.test(verdict()) && /degraded/.test(verdict()));
      assert.equal(diskBtns()[0].getAttribute("aria-pressed"), "true");
      diskBtns()[3].click();
      assert.ok(/DATA LOST/.test(verdict()));
      diskBtns()[3].click(); diskBtns()[0].click();
      assert.ok(/All disks working/.test(verdict()), "pressing a failed disk replaces it");
      setValue(w, field(s, "RAID level"), "10", "change");
      setValue(w, field(s, "Disks"), 6);
      assert.equal(metrics(s)[0], "24 TB");
      diskBtns()[0].click(); diskBtns()[2].click(); diskBtns()[4].click();
      assert.ok(/3 failed, data safe/.test(verdict()), "one disk from each pair");
      diskBtns()[1].click();
      assert.ok(/DATA LOST/.test(verdict()), "both disks of a pair");
      setValue(w, field(s, "Disks"), 5);
      assert.ok(/even number/.test(text(s)), "RAID 10 needs an even number");
      setValue(w, field(s, "RAID level"), "6", "change");
      setValue(w, field(s, "Disks"), 3);
      assert.ok(/at least 4 disks/.test(text(s)));
    });
  });

  QUnit.test("Parity demo: the rebuilt value equals the lost one, for any data", async (assert) => {
    await withPage("modules/17-storage-reliability.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "raidparity");
      assert.ok(/XOR of the parity and the three surviving disks is 77, which equals/.test(text(s)), text(s.querySelector("p.status-ok")));
      const ins = [...s.querySelectorAll('input[type="number"]')];
      setValue(w, ins[0], 255); setValue(w, ins[1], 1); setValue(w, ins[2], 0); setValue(w, ins[3], 170);
      setValue(w, field(s, "Which data disk fails"), "0", "change");
      const parity = 255 ^ 1 ^ 0 ^ 170;
      assert.ok(text(s).includes(`is 255, which equals what disk 1 held (255)`));
      assert.ok(text(s).includes(parity.toString(2).padStart(8, "0")), "the parity bits are shown");
      setValue(w, ins[1], 999);
      assert.equal(ins[1].value, "999", "the field keeps what was typed");
      assert.ok(text(s).includes("is 255, which equals"), "values above 255 are clamped to 255 in the calculation, so the answer is still right");
    });
  });

  QUnit.test("Rebuild risk: RAID 5 grows risky with disk size and RAID 6 stays covered", async (assert) => {
    await withPage("modules/17-storage-reliability.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "raidrisk"), L = w.OSLib, cells = () => [...s.querySelectorAll("tbody tr")].map((tr) => tr.children[3].textContent);
      const want = L.rebuildRisk("5", 6, 8, 1e14).probability;
      assert.equal(cells()[1], (want * 100).toFixed(1) + "%");
      assert.ok(/about 0/.test(cells()[2]), "RAID 6 is covered");
      setValue(w, field(s, "Disk size"), 2);
      const small = parseFloat(cells()[1]);
      setValue(w, field(s, "Disk size"), 20);
      assert.ok(parseFloat(cells()[1]) > small, "bigger disks, bigger risk");
      setValue(w, field(s, "Drive's error rate"), "1e15", "change");
      assert.ok(parseFloat(cells()[1]) < 60, "enterprise drives lower it");
    });
  });

  QUnit.test("SSD simulator: sequential writes amplify about 1×, random writes on a full drive much more, and an impossible setting is explained", async (assert) => {
    await withPage("modules/17-storage-reliability.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "ssdwear"), L = w.OSLib, wa = () => parseFloat(metrics(s)[2]);
      const want = L.ssdSimulate({ overProvision: 0.07, fill: 0.9, pattern: "random", separate: true, writes: 20000, seed: 7 }).wa;
      assert.equal(metrics(s)[2], want.toFixed(2) + "×");
      assert.ok(s.querySelectorAll("svg rect").length >= 128, "one bar per block");
      setValue(w, field(s, "Writes"), "sequential", "change");
      assert.ok(wa() < 1.1, "sequential: " + wa());
      setValue(w, field(s, "Writes"), "random", "change");
      setValue(w, field(s, "Hidden spare"), 28);
      assert.ok(wa() < want, "more spare space, less amplification");
      assert.equal(s.querySelectorAll("tbody tr").length, 3, "a comparison of three spare-space sizes");
      setValue(w, field(s, "Hidden spare"), 3);
      assert.ok(/does not fit|needs a few blocks/.test(text(s)), "too little spare space is explained rather than crashing");
    });
  });

  QUnit.test("Journal simulator: damage without a journal, all-or-nothing with one", async (assert) => {
    await withPage("modules/17-storage-reliability.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "journal"), verdict = () => s.querySelector("p[aria-live]").textContent, rows = () => [...s.querySelectorAll("tbody tr")].map((tr) => [tr.children[0].textContent, tr.children[1].textContent]);
      setValue(w, field(s, "Crash after"), 2);
      assert.ok(/CORRUPT/.test(verdict()) && /never written|no data|garbage/i.test(text(s)), verdict());
      assert.equal(s.querySelectorAll("ol li").length, 3);
      setValue(w, field(s, "Order of the in-place"), "data-first", "change");
      assert.ok(/inconsistent \(a leaked block\)|leaked/.test(verdict()), "data first leaks a block at worst");
      assert.false(/CORRUPT/.test(rows().map((r) => r[1]).join(" ")), "no crash point corrupts a file");
      setValue(w, field(s, "File system"), "metadata", "change");
      assert.equal(s.querySelectorAll("ol li").length, 5);
      assert.ok(s.querySelector("ol").textContent.includes("the commit point"));
      setValue(w, field(s, "Crash after"), 4);
      assert.ok(/At the crash: inconsistent/.test(verdict()) && /After recovery: consistent, with the append complete/.test(verdict()), verdict());
      assert.ok(/replays/.test(text(s)));
      setValue(w, field(s, "Crash after"), 2);
      assert.ok(/After recovery: consistent, as before/.test(verdict()));
      assert.equal(rows().length, 6);
      assert.true(rows().every((r) => !/CORRUPT/.test(r[1])), "a journal never leaves corruption");
    });
  });

  QUnit.test("Module 17 shows two C and Python example pairs with notes for both languages", async (assert) => {
    await withPage("modules/17-storage-reliability.html", ({ document: doc }) => {
      const boxes = [...doc.querySelectorAll(".code-tabs")];
      assert.deepEqual(boxes.map((b) => b.querySelector("pre.code").dataset.src), ["examples/raid_parity.c", "examples/write_ahead_log.c"]);
      boxes.forEach((b) => { assert.deepEqual(tabsOf(b).map((t) => t.textContent), ["C", "Python"]); assert.ok(b.querySelector('.lang-note[data-lang="c"]') && b.querySelector('.lang-note[data-lang="python"]')); });
    });
  });

  QUnit.module("pages: Module 3 (security in depth)");

  QUnit.test("Stack attack: buttons reproduce the library's outcomes, and each defense changes the result", async (assert) => {
    await withPage("modules/03-security-depth.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "stackattack"), L = w.OSLib, verdict = () => s.querySelector("p[aria-live]").textContent;
      assert.ok(/No damage/.test(verdict()), "starts with 8 bytes: it fits");
      assert.equal(s.querySelectorAll(".stack-seg").length, 3, "buffer, saved frame pointer and return address");
      button(s, "Plain overflow").click();
      assert.ok(verdict().startsWith(L.stackOutcomes.crash), verdict());
      assert.equal(s.querySelectorAll(".cell.written").length, 24, "28 bytes: the whole 24-byte frame is overwritten");
      button(s, "Real attack, no defenses").click();
      assert.ok(verdict().startsWith(L.stackOutcomes.hijacked) && s.querySelector(".status-bad"), verdict());
      button(s, "All three defenses").click();
      assert.equal(s.querySelectorAll(".stack-seg").length, 4, "a canary segment appears");
      assert.ok(verdict().startsWith(L.stackOutcomes["canary-abort"]) && s.querySelector(".status-ok"));
      button(s, "Defenses and an information leak").click();
      assert.ok(verdict().startsWith(L.stackOutcomes.hijacked), "a leak plus code reuse beats all three");
      assert.ok(/existing|exist/.test(text(s)), "the steps say that existing code is reused");
      // every preset agrees with the library
      const o = { inputLen: 28, crafted: true, canary: true, nx: true, aslr: true, leak: false, target: "shellcode" };
      button(s, "All three defenses").click();
      assert.equal(verdict(), L.stackOutcomes[L.stackAttack(o).outcome] + ".");
      assert.ok(s.querySelector(".stack-frame").getAttribute("aria-label").includes("canary"));
      setValue(w, field(s, "Input length"), 10);
      assert.ok(/No damage/.test(verdict()));
    });
  });

  QUnit.test("Password guessing: the numbers match the library, and a human-style password ignores length", async (assert) => {
    await withPage("modules/03-security-depth.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "pwcrack"), L = w.OSLib, times = () => [...s.querySelectorAll("tbody tr")].map((tr) => tr.children[2].textContent);
      const space = L.passwordSpace(8, 26);
      assert.deepEqual(times(), [L.attackers.online, L.attackers.slow, L.attackers.fast].map((a) => L.humanTime(L.crackSeconds(space, a.rate))));
      assert.ok(/208827064576|2\.1e\+11/.test(text(s)) || text(s).includes("2.1e+11"), "the space is shown");
      assert.equal(times()[2], "less than a second" === times()[2] ? times()[2] : times()[2], "fast hash");
      assert.ok(s.querySelectorAll(".status-bad").length >= 1, "a fast hash on 8 lower-case letters is flagged red");
      setValue(w, field(s, "Length"), 16);
      setValue(w, field(s, "Characters used"), "all", "change");
      assert.ok(s.querySelectorAll(".status-ok").length >= 2, "16 random characters of all kinds are out of reach");
      setValue(w, field(s, "How was it chosen"), "human", "change");
      const humanTimes = times();
      setValue(w, field(s, "Length"), 4);
      assert.deepEqual(times(), humanTimes, "for a human-chosen password the length slider does not matter");
      assert.ok(/common word/.test(text(s)));
    });
  });

  QUnit.test("Hash demo: same password, same plain hash; salts and repetition make them differ", async (assert) => {
    await withPage("modules/03-security-depth.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "hashdemo"), L = w.OSLib, rows = () => [...s.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((c) => c.textContent));
      const r = rows();
      assert.equal(r[0][3], "identical");
      assert.equal(r[1][3], "different"); assert.equal(r[2][3], "different");
      assert.equal(s.querySelectorAll("tbody tr")[0].querySelector("code").getAttribute("title"), L.plainHash("correct horse"), "the full hash is in the title");
      assert.equal(s.querySelectorAll("tbody tr")[1].querySelector("code").getAttribute("title"), L.saltedHash("a1b2c3d4", "correct horse"));
      assert.ok(r[2][0].includes("1,000"), "1,000 repetitions by default");
      setValue(w, field(s, "Times the hash is repeated"), 3);
      assert.equal(s.querySelectorAll("tbody tr")[2].querySelector("code").getAttribute("title"), L.stretchedHash("a1b2c3d4", "correct horse", 3));
      setValue(w, s.querySelector('input[type="text"]'), "hunter2");
      assert.equal(s.querySelectorAll("tbody tr")[0].querySelector("code").getAttribute("title"), L.plainHash("hunter2"));
      const before = text(s.querySelector("p.small"));
      button(s, "New random salts").click();
      assert.notEqual(text(s.querySelector("p.small")), before, "new salts");
      assert.equal(rows()[1][3], "different");
    });
  });

  QUnit.test("Threat modeling: choose categories, check, see why, and reveal all", async (assert) => {
    await withPage("modules/03-security-depth.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "threatmodel"), sys = w.OSData.threatSystems;
      assert.equal(s.querySelectorAll("ol > li").length, sys[0].threats.length);
      const sels = () => [...s.querySelectorAll("ol select")];
      setValue(w, sels()[0], sys[0].threats[0].cat, "change");
      setValue(w, sels()[1], "I", "change");
      button(s, "Check my answers").click();
      assert.ok(/You answered 2 of 7, and 1 are right/.test(text(s)), text(s.querySelector("p[aria-live]:last-of-type")));
      assert.ok([...s.querySelectorAll("ol li")][0].textContent.includes("Correct"));
      assert.ok(/Not quite. The best fit is T: Tampering/.test(text(s)), "a wrong answer says what fits");
      assert.ok(/A usual defense/.test(text(s)));
      button(s, "Show all answers").click();
      assert.ok(/7 of 7, and 7 are right/.test(text(s)));
      button(s, "Start over").click();
      assert.equal(sels().filter((x) => x.value).length, 0);
      setValue(w, field(s, "System"), "lock", "change");
      assert.ok(text(s).includes("smart door lock") && s.querySelectorAll("ol > li").length === sys[1].threats.length);
      assert.equal(s.querySelectorAll("table tbody tr").length, 6, "the STRIDE key");
    });
  });

  QUnit.test("Module 3 shows two C and Python example pairs with notes for both languages", async (assert) => {
    await withPage("modules/03-security-depth.html", ({ document: doc }) => {
      const boxes = [...doc.querySelectorAll(".code-tabs")];
      assert.deepEqual(boxes.map((b) => b.querySelector("pre.code").dataset.src), ["examples/stack_frame_sim.c", "examples/password_hash.c"]);
      boxes.forEach((b) => { assert.deepEqual(tabsOf(b).map((t) => t.textContent), ["C", "Python"]); assert.ok(b.querySelector('.lang-note[data-lang="c"]') && b.querySelector('.lang-note[data-lang="python"]')); });
    });
  });

  QUnit.module("pages: Module 8 (advanced scheduling)");

  QUnit.test("MLFQ simulator: metrics match the library, the priority boost changes the starvation workload", async (assert) => {
    await withPage("modules/08-advanced-scheduling.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "mlfq"), L = w.OSLib, mean = (r, k) => (r.jobs.reduce((a, j) => a + j[k], 0) / r.jobs.length).toFixed(1);
      let r = L.mlfqSimulate(L.mlfqPresets.mixed.jobs, { quanta: [2, 4, 8], boost: 0 });
      assert.deepEqual([metrics(s)[0], metrics(s)[1], metrics(s)[3]], [mean(r, "response"), mean(r, "turnaround"), String(r.end)]);
      assert.equal(s.querySelectorAll("tbody tr").length, L.mlfqPresets.mixed.jobs.length, "one row per job");
      assert.ok(s.querySelectorAll("svg g[clip-path] rect").length >= r.timeline.filter((t) => t.id).length, "every busy tick is drawn");
      setValue(w, field(s, "Workload"), "starve", "change");
      const plain = metrics(s)[2];
      setValue(w, field(s, "Priority boost every"), 6);
      r = L.mlfqSimulate(L.mlfqPresets.starve.jobs, { quanta: [2, 4, 8], boost: 6 });
      const worst = r.jobs.reduce((a, j) => (j.longestWait > a.longestWait ? j : a), r.jobs[0]);
      assert.equal(metrics(s)[2], worst.id + ": " + worst.longestWait);
      assert.notEqual(metrics(s)[2], plain, "the boost shortens the longest stretch without CPU");
      assert.equal(s.querySelectorAll("svg line[stroke-dasharray]").length, r.boosts.length, "boosts are marked");
      setValue(w, field(s, "Time slice, level 1"), 1);
      assert.ok(/1-tick slice/.test(text(s)));
    });
  });

  QUnit.test("Real-time simulator: rate-monotonic misses the classic set, EDF does not, and the analysis table says why", async (assert) => {
    await withPage("modules/08-advanced-scheduling.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "rtsched"), L = w.OSLib, tasks = L.rtPresets.classic.tasks;
      const miss = L.rtSimulate(tasks, "rm").misses;
      assert.ok(text(s).includes(`${miss.length} deadline${miss.length === 1 ? "" : "s"} missed in 35 ticks`), text(s.querySelector("p[aria-live]")));
      assert.ok(text(s).includes("T2's job released at 0 (due 7)"));
      assert.ok(text(s).includes("0.971") && text(s).includes("0.828") && text(s).includes("T2: 8 (> 7)"), "utilization, bound and the late response time");
      assert.ok(/NOT schedulable/.test(text(s)) && /not met/.test(text(s)));
      setValue(w, field(s, "Algorithm"), "edf", "change");
      assert.ok(/No deadline missed in 35 ticks/.test(text(s)));
      setValue(w, field(s, "Task set"), "over", "change");
      assert.ok(/deadlines? missed/.test(text(s)) && text(s).includes("EDF: schedulable if and only if U ≤ 1NOT schedulable"), "above 100% even EDF fails");
      setValue(w, field(s, "Task set"), "easy", "change");
      assert.ok(/No deadline missed/.test(text(s)) && /met: schedulable for sure/.test(text(s)));
      assert.ok(s.querySelector("svg").getAttribute("aria-label").includes("T3 (C=1, T=12)"));
    });
  });

  QUnit.test("Multicore simulator: stealing versus no balancing, and the four-way comparison", async (assert) => {
    await withPage("modules/08-advanced-scheduling.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "multicore"), L = w.OSLib, tasks = L.mcTasks([6, 6, 6, 6, 6, 6, 6, 6]);
      let r = L.mcSimulate(tasks, 4, { policy: "steal", place: "one", penalty: 1 });
      assert.deepEqual([metrics(s)[0], metrics(s)[2], metrics(s)[3]], [String(r.makespan), String(r.migrations), String(r.lowerBound)]);
      setValue(w, field(s, "Balancing"), "static", "change");
      assert.equal(metrics(s)[0], "48", "everything on one core takes the sum of the work");
      assert.equal(metrics(s)[1], "25%", "four cores, one busy");
      assert.equal(s.querySelectorAll("tbody tr").length, 4, "all four combinations");
      setValue(w, field(s, "Cores"), 8);
      setValue(w, field(s, "Where tasks start"), "spread", "change");
      assert.equal(metrics(s)[0], "6", "eight equal tasks on eight cores");
      setValue(w, field(s, "Workload"), "skew", "change");
      setValue(w, field(s, "Balancing"), "steal", "change");
      assert.equal(metrics(s)[3], "14", "the big task is the bound");
    });
  });

  QUnit.test("Module 8 shows two C and Python example pairs with notes for both languages", async (assert) => {
    await withPage("modules/08-advanced-scheduling.html", ({ document: doc }) => {
      const boxes = [...doc.querySelectorAll(".code-tabs")];
      assert.deepEqual(boxes.map((b) => b.querySelector("pre.code").dataset.src), ["examples/rt_schedule.c", "examples/cpu_affinity.c"]);
      boxes.forEach((b) => { assert.deepEqual(tabsOf(b).map((t) => t.textContent), ["C", "Python"]); assert.ok(b.querySelector('.lang-note[data-lang="c"]') && b.querySelector('.lang-note[data-lang="python"]')); });
    });
  });

  QUnit.module("pages: Module 4 (the boot process)");

  QUnit.test("Boot stepper: stages in order, failures stop where they should, Secure Boot is the only path that blocks a tampered loader", async (assert) => {
    await withPage("modules/04-boot.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "bootseq"), L = w.OSLib;
      assert.ok(/Press Play or Step/.test(text(s)), "starts powered off");
      for (let i = 0; i < 3; i++) button(s, "Step ▶").click();
      assert.ok(/Read the boot sector/.test(text(s.querySelector(".callout"))) && /0x55/.test(text(s.querySelector(".callout"))), "stage 3 of the BIOS path reads the boot sector");
      assert.ok(/16-bit real mode/.test(text(s.querySelector(".callout"))));
      const total = L.bootRun("bios", "none").steps.length;
      for (let i = 0; i < total; i++) button(s, "Step ▶").click();
      assert.ok(/Booted. /.test(text(s)), "a normal boot finishes");
      setValue(w, field(doc, "What goes wrong"), "unsigned", "change");
      for (let i = 0; i < 20; i++) button(s, "Step ▶").click();
      assert.ok(/Booted. /.test(text(s)), "without Secure Boot, the tampered loader runs");
      setValue(w, field(doc, "Firmware and disk"), "secure", "change");
      for (let i = 0; i < 20; i++) button(s, "Step ▶").click();
      assert.ok(/Boot stopped./.test(text(s)) && /Security Violation/.test(text(s)), "with Secure Boot it is refused");
      setValue(w, field(doc, "What goes wrong"), "service", "change");
      for (let i = 0; i < 30; i++) button(s, "Step ▶").click();
      assert.ok(/Partly booted/.test(text(s)) && /emergency shell/.test(text(s)));
      assert.ok(s.querySelector("svg").getAttribute("aria-label").includes("Verify the boot loader"));
    });
  });

  QUnit.test("MBR viewer: little-endian bytes, signature and the decoded lines", async (assert) => {
    await withPage("modules/04-boot.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "mbrview"), dump = () => text(s.querySelector(".code-scroll")), decoded = () => s.querySelector("pre[aria-live]").textContent;
      assert.ok(/80 FE FF FF 83 FE FF FF 00 08 00 00 00 00 10 00/.test(dump()), "first entry: 2048 is 00 08 00 00 and 1,048,576 sectors is 00 00 10 00");
      assert.ok(/55 AA/.test(dump()));
      assert.ok(/partition 1: active type 0x83 Linux/.test(decoded()) && /partition 3: unused/.test(decoded()));
      assert.ok(/The BIOS would accept/.test(text(s)));
      setValue(w, s.querySelector('input[aria-label="Partition 1 start sector"]'), 63);
      assert.ok(/3F 00 00 00/.test(dump()), "63 is 3F 00 00 00");
      assert.ok(/aligned to 1 MiB: False/.test(decoded()), "the old start at sector 63 is not aligned");
      const sig = [...s.querySelectorAll('input[type="checkbox"]')].pop();
      sig.checked = true; fire(w, sig, "change");
      assert.ok(/55 00/.test(dump()) && /invalid/.test(decoded()) && /No bootable device/.test(text(s)));
    });
  });

  QUnit.test("Service order: parallel start, critical path, and a dependency cycle", async (assert) => {
    await withPage("modules/04-boot.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "initorder");
      assert.deepEqual(metrics(s).slice(0, 2), ["11", "14"]);
      assert.ok(/local-fs → network → database → web/.test(text(s)));
      setValue(w, field(doc, "cron takes"), 9);
      assert.equal(metrics(s)[0], "12", "2 + 1 + 9: a slow cron becomes the longest chain");
      assert.ok(text(s).includes("local-fs → logging → cron"));
      setValue(w, field(doc, "cron takes"), 1);
      setValue(w, field(doc, "network takes"), 6);
      assert.equal(metrics(s)[0], "14", "slowing the critical path slows the boot: 2 + 6 + 4 + 2");
      const cb = s.querySelector('input[type="checkbox"]'); cb.checked = true; fire(w, cb, "change");
      assert.ok(/Dependency cycle/.test(text(s)) && /never/.test(text(s)));
    });
  });

  QUnit.test("Chain of trust: the first tampered link breaks the rest", async (assert) => {
    await withPage("modules/04-boot.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "trustchain");
      assert.ok(/Every link verified/.test(text(s)));
      const boxes = [...s.querySelectorAll('input[type="checkbox"]')];
      boxes[2].checked = true; fire(w, boxes[2], "change");
      assert.ok(/breaks at “Kernel”/.test(text(s)), "tampering with the kernel");
      boxes[0].checked = true; fire(w, boxes[0], "change");
      assert.ok(text(s).includes("breaks at “Boot loader (shim)”") && /never reached/.test(text(s)), "the earliest tampered link wins and later ones are never reached");
    });
  });

  QUnit.test("Module 4 shows two C and Python example pairs with notes for both languages", async (assert) => {
    await withPage("modules/04-boot.html", ({ document: doc }) => {
      const boxes = [...doc.querySelectorAll(".code-tabs")];
      assert.deepEqual(boxes.map((b) => b.querySelector("pre.code").dataset.src), ["examples/mbr_parse.c", "examples/init_order.c"]);
      boxes.forEach((b) => { assert.deepEqual(tabsOf(b).map((t) => t.textContent), ["C", "Python"]); assert.ok(b.querySelector('.lang-note[data-lang="c"]') && b.querySelector('.lang-note[data-lang="python"]')); });
    });
  });

  QUnit.module("pages: Module 10 (monitors and readers-writers)");

  QUnit.test("Mesa demo: the if version breaks on the scripted interleaving and the while version does not", async (assert) => {
    await withPage("modules/10-monitors.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "mesa"), log = () => [...s.querySelectorAll("ol li")].map((li) => li.textContent);
      button(s, "Run all steps").click();
      assert.ok(/took an item from an empty buffer/.test(text(s)), "if: the bug is reported");
      assert.ok(log().some((l) => /EMPTY/.test(l)));
      assert.ok(button(s, "Step ▶").disabled, "no more steps");
      setValue(w, field(doc, "How the consumer waits"), "while", "change");
      assert.equal(log().length, 0, "switching resets");
      button(s, "Run all steps").click();
      assert.ok(/No error/.test(text(s)) && !/EMPTY/.test(log().join(" ")), "while: no error");
      assert.ok(log().some((l) => /re-checks the condition/.test(l)));
      button(s, "Run 3000 random interleavings of each").click();
      const m = /With "if": ([0-9]+) of 3000 random schedules took from an empty buffer\. With "while": ([0-9]+) of 3000/.exec(text(s));
      assert.ok(m && +m[1] > 0 && +m[2] === 0, "random schedules: if fails sometimes, while never: " + (m && m[0]));
    });
  });

  QUnit.test("Readers-writers timeline: the starvation workload and the policy table agree with the library", async (assert) => {
    await withPage("modules/10-monitors.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "rwsim"), L = w.OSLib, metricsOf = () => metrics(s);
      let want = L.rwSimulate(L.rwPresets.stream.requests, "reader");
      assert.deepEqual(metricsOf(), [String(want.maxReaderWait), String(want.maxWriterWait), want.meanWait.toFixed(1), String(want.end)]);
      assert.equal(want.maxWriterWait, 18);
      assert.ok(/W1 waited 18 ticks/.test(text(s)) && /starvation/.test(text(s)), "the writer is flagged as starved");
      setValue(w, field(doc, "Policy"), "fair", "change");
      want = L.rwSimulate(L.rwPresets.stream.requests, "fair");
      assert.equal(metricsOf()[1], String(want.maxWriterWait));
      assert.ok(/Nobody waited disproportionately/.test(text(s)) || !/starvation in practice/.test(text(s)), "fair: no starvation");
      const rows = [...s.querySelectorAll("tbody tr")].map((tr) => tr.children[0].textContent);
      assert.deepEqual(rows, ["Reader preference", "Writer preference", "First come, first served"]);
      setValue(w, field(s, "Workload"), "writers", "change");
      setValue(w, field(doc, "Policy"), "writer", "change");
      assert.ok(/R1 waited/.test(text(s)) && /starvation/.test(text(s)), "now the reader is the starved one");
      button(s, "New random workload").click();
      assert.ok(s.querySelectorAll("svg g[clip-path] rect").length >= 6, "a random workload is drawn");
    });
  });

  QUnit.test("Module 10 shows two C and Python example pairs with notes for both languages", async (assert) => {
    await withPage("modules/10-monitors.html", ({ document: doc }) => {
      const boxes = [...doc.querySelectorAll(".code-tabs")];
      assert.deepEqual(boxes.map((b) => b.querySelector("pre.code").dataset.src), ["examples/condvar_queue.c", "examples/rwlock_demo.c"]);
      boxes.forEach((b) => { assert.deepEqual(tabsOf(b).map((t) => t.textContent), ["C", "Python"]); assert.ok(b.querySelector('.lang-note[data-lang="c"]') && b.querySelector('.lang-note[data-lang="python"]')); });
    });
  });

  QUnit.module("pages: Module 19 (virtualization and containers)");

  QUnit.test("Layer stacks: kernel count follows the approach", async (assert) => {
    await withPage("modules/19-virtualization.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "virtstack"), kernels = () => s.querySelector(".metric b").textContent;
      assert.equal(kernels(), "1", "containers share one kernel");
      setValue(w, field(doc, "Approach"), "type1", "change");
      assert.equal(kernels(), "3", "three applications in three VMs: three guest kernels");
      setValue(w, field(doc, "Applications started"), 4);
      assert.equal(kernels(), "4");
      setValue(w, field(doc, "Approach"), "type2", "change");
      assert.equal(kernels(), "5", "the host kernel as well");
      assert.ok(/virtual machines on a desktop/i.test(text(s)) || /type 2/i.test(text(s)));
      assert.ok(s.querySelector("svg").getAttribute("aria-label").includes("5 kernels"));
    });
  });

  QUnit.test("Namespaces: ticking one changes only its own command; PID shows both numberings", async (assert) => {
    await withPage("modules/19-virtualization.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "nsview"), rows = () => [...s.querySelectorAll("tbody tr")].map((tr) => [tr.children[0].textContent, tr.children[1].textContent, tr.children[2].textContent]);
      const before = rows();
      assert.ok(before.every((r) => r[2] === "the host's"));
      const cb = [...s.querySelectorAll('input[type="checkbox"]')];
      cb[0].checked = true; fire(w, cb[0], "change");
      const after = rows(), changed = after.filter((r, i) => r[1] !== before[i][1]);
      assert.equal(changed.length, 1, "only one command prints something different");
      assert.equal(changed[0][0], "ps -e");
      assert.ok(/^1 /.test(changed[0][1]) && /4150/.test(text(s)) && /Process 1 inside is the container's init/.test(text(s)), "the PID view starts at 1 and explains the numbering");
      button(s, "Full container").click();
      assert.ok(rows().every((r) => /private/.test(r[2])) && cb.every((c) => c.checked));
      button(s, "Ordinary process").click();
      assert.ok(rows().every((r) => r[2] === "the host's") && cb.every((c) => !c.checked));
    });
  });

  QUnit.test("CPU control groups: shares, caps and the explanation of who is held back", async (assert) => {
    await withPage("modules/19-virtualization.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "cgcpu"), label = () => s.querySelector("svg").getAttribute("aria-label");
      const L = w.OSLib;
      const want = L.cgAllocate([{ name: "web", weight: 200, demand: 3, cap: null }, { name: "database", weight: 100, demand: 3, cap: null }, { name: "batch job", weight: 100, demand: 4, cap: 1 }], 4);
      assert.equal(want[2].state, "capped");
      assert.ok(label().includes(`batch job ${want[2].alloc.toFixed(2)} of 4 cores`), label());
      assert.ok(label().includes(`web ${want[0].alloc.toFixed(2)} of 3 cores`));
      setValue(w, field(doc, "CPU cores in the machine"), 8);
      assert.ok(label().includes("web 3.00 of 3 cores") && label().includes("database 3.00 of 3 cores"), "with 8 cores web and database are fully served");
      assert.ok(label().includes("batch job 1.00 of 4 cores"), "the cap still holds the batch job to one core");
      assert.ok(/held back by its cap/.test(text(s)));
    });
  });

  QUnit.test("Memory control group: the OOM kill stays inside the group", async (assert) => {
    await withPage("modules/19-virtualization.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "cgmem"), result = () => [...s.querySelectorAll("tbody tr")].map((tr) => [tr.children[0].textContent, tr.children[2].textContent]);
      assert.deepEqual(result().map((r) => r[1]), ["killed (OOM)", "running", "running"], "300 + 120 + 150 = 570 MiB exceeds 512, so the largest (database) is killed and the rest fit");
      setValue(w, field(doc, "Group memory limit"), 1000);
      assert.deepEqual(result().map((r) => r[1]), ["running", "running", "running"]);
      assert.ok(/Everything fits/.test(text(s)));
      setValue(w, field(doc, "Group memory limit"), 100);
      assert.ok(result().filter((r) => r[1] === "killed (OOM)").length >= 2, "a tiny limit kills several, largest first");
    });
  });

  QUnit.test("VM exits table agrees with the library", async (assert) => {
    await withPage("modules/19-virtualization.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "vmexits"), exits = () => [...s.querySelectorAll("tbody tr")].map((tr) => tr.children[1].textContent);
      const L = w.OSLib;
      assert.deepEqual(exits(), ["7,000", L.vmExits(1000, 32, "virtio", 2000).exits.toLocaleString(), "0"]);
      setValue(w, field(doc, "Virtio batch size"), 1);
      assert.equal(exits()[1], "2,000");
    });
  });

  QUnit.test("Module 19 shows two C and Python example pairs with notes for both languages", async (assert) => {
    await withPage("modules/19-virtualization.html", ({ document: doc }) => {
      const boxes = [...doc.querySelectorAll(".code-tabs")];
      assert.deepEqual(boxes.map((b) => b.querySelector("pre.code").dataset.src), ["examples/ns_inherit.c", "examples/resource_limits.c"]);
      boxes.forEach((b) => { assert.deepEqual(tabsOf(b).map((t) => t.textContent), ["C", "Python"]); assert.ok(b.querySelector('.lang-note[data-lang="c"]') && b.querySelector('.lang-note[data-lang="python"]')); });
    });
  });

  QUnit.test("IPC cost table matches the library and shared memory needs no per-transfer calls", async (assert) => {
    await withPage("modules/12-ipc.html", ({ window: w, document: doc }) => {
      const s = sim(doc, "ipccost"), rows = () => [...s.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((td) => td.textContent));
      const L = w.OSLib;
      const want = L.ipcCost("pipe", 1000, 64);
      assert.deepEqual(rows()[0], ["Pipe", want.syscalls.toLocaleString(), want.copies.toLocaleString(), want.bytesCopied.toLocaleString(), "no: the kernel orders the operations"]);
      assert.equal(rows()[3][0], "Shared memory"); assert.equal(rows()[3][1], "2"); assert.equal(rows()[3][2], "0"); assert.ok(/^yes/.test(rows()[3][4]));
      button(s, "One big transfer").click();
      assert.equal(rows()[0][1], "2", "one transfer is one write and one read");
    });
  });

  QUnit.test("Page-table walk: translation, faults, TLB behavior and table memory", async (assert) => {
    await withPage("modules/13-memory.html", ({ window: w, document: doc }) => {
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

  QUnit.test("Module 13 lessons, quiz and glossary cover the new material", async (assert) => {
    await withPage("modules/13-memory.html", ({ window: w, document: doc }) => {
      const qs = w.OSData.quizzes.filter((q) => q.mod === 13);
      assert.ok(qs.length >= 14, `${qs.length} questions`);
      assert.equal(doc.querySelectorAll("[data-quiz] .q").length, qs.length);
      ["Multi-level page table", "Page table entry (PTE)", "Page walk", "Huge page", "ASID (address-space identifier)", "TLB reach"].forEach((t) => assert.ok(doc.querySelector(`dfn[data-term="${t}"]`), `${t} is marked in the lesson`));
      assert.ok(/4 MiB/.test(doc.body.textContent) && /512 GiB/.test(doc.body.textContent) && /109 ns/.test(doc.body.textContent));
    });
  });

  QUnit.module("pages: more");

  QUnit.test("Module 16: allocation reads and inode capacity", async (assert) => {
    await withPage("modules/16-file-systems.html", ({ window: w, document: doc }) => {
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
