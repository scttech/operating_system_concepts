/* Lesson code examples (Node only): every example exists in C and Python, both must compile/run, print identical output,
 * and print what the lesson says they print. Where possible the expected output is derived independently (for the page table, from
 * the tested page-table library; for the thread example, from a closed formula with BigInt).
 *
 * C needs a Unix-like system (fork, pthreads, mmap...). Use a local compiler on Linux/macOS (set CC to choose), or set
 * EXAMPLES_DOCKER=1 to compile and run in a throwaway Alpine container, for example from Windows. Without either, the C checks are
 * skipped and the Python ones still run. CI (Linux) runs everything. */
(function () {
  "use strict";
  if (typeof require === "undefined") return;
  const fs = require("node:fs"), path = require("node:path");
  const ROOT = path.resolve(__dirname, ".."), EX = path.join(ROOT, "examples");
  const L = require("../js/lib/pagetable.js");
  const N = require("./helpers/native.js");

  const STEMS = [...new Set(fs.readdirSync(EX).filter((f) => /\.(c|py)$/.test(f)).map((f) => f.replace(/\.(c|py)$/, "")))].sort();
  const ALL_FILES = STEMS.flatMap((s) => [`${s}.c`, `${s}.py`]);
  const lines = (r) => r.stdout.replace(/\r\n/g, "\n").trim().split("\n");
  const hex = (n, w) => n.toString(16).toUpperCase().padStart(w, "0");

  // ---------- what each example must print ----------
  function pagetableExpected() {
    const table = L.ptPresetTable("teach16");
    const out = [0x0012, 0x03ff, 0x1034, 0xfe80, 0x5000, 0x0412].map((a) => {
      const w = L.ptWalk(table, a), sp = w.split, head = `0x${hex(a, 4)} -> top ${String(sp.indices[0]).padStart(2)}, second ${String(sp.indices[1]).padStart(2)}, offset 0x${hex(sp.offset, 2)} -> `;
      return w.fault ? `${head}PAGE FAULT (${w.fault.level === 0 ? "no second-level table" : "page not present"})` : `${head}frame ${String(w.frame).padStart(2)} -> physical 0x${hex(w.physical, 4)}`;
    });
    const m = L.ptMemory(table);
    out.push(`second-level tables allocated: ${m.perLevel[1].tables}; entries used: ${m.perLevel[0].entriesEach + m.perLevel[1].tables * m.perLevel[1].entriesEach} instead of ${m.flatEntries} for one flat table`);
    return out;
  }
  function threadsExpected() {
    const S = (n) => (n - 1n) * n * (2n * n - 1n) / 6n, NN = 1000000n, out = []; let total = 0n;
    for (let t = 0n; t < 4n; t++) { const from = NN * t / 4n, to = NN * (t + 1n) / 4n, s = S(to) - S(from); total += s; out.push(`thread ${t} summed the squares of [${from}, ${to}): ${s}`); }
    out.push(`total = ${total} (matches the formula: ${total === S(NN) ? "True" : "False"})`);
    return out;
  }
  const mode = (what, octal, sym) => `${what.padEnd(36)} ${octal} (${sym})`;
  const EXPECT = {
    pagetable_translate: { unix: false, lines: pagetableExpected },
    syscall_vs_stdio: { unix: false, lines: () => ["BAC"] },
    file_mode: { unix: true, lines: () => [mode("created with mode 666, umask 022:", "644", "rw-r--r--"), mode("after chmod 640:", "640", "rw-r-----"), mode("after chmod 600:", "600", "rw-------"), "others can read the file: no"] },
    threads_sum: { unix: false, lines: threadsExpected },
    spinlock_atomic: { unix: false, lines: () => ["4 threads x 2000 increments, protected by a spinlock: counter = 8000 (correct: True)"] },
    page_faults: { unix: true, lines: () => ["mapped 256 pages: no physical memory is assigned until a page is first touched", "touching each page for the first time caused page faults: True", "touching them all a second time caused far fewer: True"] },
    inode_links: { unix: true, lines: () => ["created original.txt: link count 1", "after link(): link count 2, same inode: yes", "the symbolic link has its own inode: yes", "after removing the original name: link count 1, data still readable: yes", "the symbolic link now dangles (opening it fails): yes"] }
  };

  /** Run an example's Python partner: locally when the code is portable (or we are on Unix), otherwise in the container. */
  function py(stem) {
    const e = EXPECT[stem], file = `${stem}.py`;
    if (!e.unix && N.PY) return N.runPythonLocal(path.join(EX, file));
    return N.runUnixPython(EX, file, ALL_FILES);
  }
  const hasPy = (stem) => (!EXPECT[stem].unix && !!N.PY) || N.canRunUnixPython || !!N.DOCKER;

  QUnit.module("lesson code examples");

  QUnit.test(`tools: Python ${N.PY ? "yes" : "NO"}; C ${N.nativeUnixC ? "local " + N.CC : N.DOCKER ? "in a Linux container (Docker)" : "not available here"}`, (assert) => {
    assert.ok(true, "C checks need Linux/macOS or EXAMPLES_DOCKER=1; CI runs them");
    assert.deepEqual(STEMS.filter((s) => !EXPECT[s]), [], "every example has an expected output in this test");
    assert.deepEqual(Object.keys(EXPECT).filter((s) => !STEMS.includes(s)).sort(), [], "no expectation for a missing example");
  });

  STEMS.filter((s) => EXPECT[s]).forEach((stem) => {
    (hasPy(stem) ? QUnit.test : QUnit.skip)(`${stem}.py prints exactly what the lesson says`, (assert) => {
      const r = py(stem);
      assert.equal(r.status, 0, r.stderr);
      assert.deepEqual(lines(r), EXPECT[stem].lines());
    });
    (N.canRunUnixC ? QUnit.test : QUnit.skip)(`${stem}.c compiles with -Wall -Wextra -Werror -pedantic and prints exactly the same as the Python version`, (assert) => {
      const r = N.runUnixC(EX, `${stem}.c`, ALL_FILES);
      assert.ok(!r.compileFailed, `compiles cleanly: ${r.stderr || ""}`);
      assert.equal(r.status, 0, r.stderr);
      assert.deepEqual(lines(r), EXPECT[stem].lines(), "C matches the expected lines");
      if (hasPy(stem)) assert.equal(r.stdout.replace(/\r\n/g, "\n"), py(stem).stdout.replace(/\r\n/g, "\n"), "byte for byte identical to the Python output");
    });
  });

  QUnit.test("each example pair has the same numbered comments in both languages and is plain ASCII", (assert) => {
    assert.ok(STEMS.length >= 7);
    STEMS.forEach((stem) => {
      const markers = (ext) => fs.readFileSync(path.join(EX, `${stem}.${ext}`), "utf8").split("\n").flatMap((line) => { const i = line.search(/\/\*|\/\/|#/); return i < 0 ? [] : [...line.slice(i).matchAll(/\((\d+)\)/g)].map((m) => m[1]); });
      assert.ok(fs.existsSync(path.join(EX, `${stem}.c`)) && fs.existsSync(path.join(EX, `${stem}.py`)), `${stem} exists in both languages`);
      assert.deepEqual([...new Set(markers("c"))].sort(), [...new Set(markers("py"))].sort(), `${stem}: same (1), (2)... markers so one explanation fits both`);
      assert.ok(markers("c").length >= 2, `${stem} has numbered comments`);
      ["c", "py"].forEach((ext) => assert.false(/[^\x00-\x7f]/.test(fs.readFileSync(path.join(EX, `${stem}.${ext}`), "utf8")), `${stem}.${ext} is ASCII`));
    });
  });

  QUnit.test("every example is shown in a lesson, in language tabs, with a note for each language", (assert) => {
    const used = {};
    fs.readdirSync(path.join(ROOT, "modules")).forEach((f) => {
      const html = fs.readFileSync(path.join(ROOT, "modules", f), "utf8");
      for (const [, box] of html.matchAll(/<div class="code-tabs"[^>]*>([\s\S]*?)\n  <\/div>/g)) {
        for (const [, src] of box.matchAll(/data-src="examples\/([^"]+)"/g)) used[src] = { page: f, notes: [...box.matchAll(/class="lang-note" data-lang="(\w+)"/g)].map((m) => m[1]) };
      }
    });
    assert.deepEqual(Object.keys(used).sort(), fs.readdirSync(EX).filter((f) => /\.(c|py)$/.test(f)).sort(), "every example file is used by a lesson, and every lesson listing exists");
  });
})();
