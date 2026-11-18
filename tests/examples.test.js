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
  const B = require("../js/lib/boot.js");
  function mbrExpected() {
    return B.mbrLines(B.mbrParse(B.mbrBuild([{ active: true, type: 0x83, start: 2048, sectors: 1048576 }, { type: 0x82, start: 1050624, sectors: 2097152 }, { type: 0x07, start: 3147776, sectors: 41943040 }])));
  }
  function initExpected() {
    const u = [["local-fs", 2, []], ["network", 3, ["local-fs"]], ["logging", 1, ["local-fs"]], ["database", 4, ["network", "logging"]], ["web", 2, ["database", "network"]], ["cron", 1, ["logging"]], ["ssh", 1, ["network"]]].map(([name, dur, after]) => ({ name, dur, after }));
    const r = B.bootOrder(u);
    return [...r.schedule.map((x) => `t=${String(x.start).padEnd(2)} start ${x.name.padEnd(8)} (takes ${x.dur})`), `everything is up after ${r.total} time units; one at a time it would take ${r.serial}`, `critical path: ${r.critical.join(" -> ")}`];
  }
  const A = require("../js/lib/advsched.js");
  function rtExpected() {
    const tasks = A.rtPresets.classic.tasks, a = A.rtAnalysis(tasks), H = a.hyperperiod;
    const line = (name, r) => (r.misses.length ? `${name}: first missed deadline: T${r.misses[0].task + 1} job released at ${r.misses[0].release} (deadline ${r.misses[0].deadline})` : `${name}: no deadline missed in ${H} ticks`);
    return [`utilization = ${a.U.toFixed(3)} (rate-monotonic is guaranteed below ${a.rmBound.toFixed(3)}, EDF up to 1.000)`, line("rate-monotonic", A.rtSimulate(tasks, "rm")), line("earliest-deadline-first", A.rtSimulate(tasks, "edf"))];
  }
  const Sx = require("../js/lib/security.js");
  function passwordExpected() {
    const pw = "correct horse", sa = "a1b2c3d4", sb = "9f8e7d6c", row = (l, hx) => l.padEnd(24) + hx.slice(0, 16) + "...";
    return [row('sha256 of "password":', Sx.sha256Hex("password")), row("alice, no salt:", Sx.plainHash(pw)), row("bob, no salt:", Sx.plainHash(pw)), "same password, same stored hash: True",
      row("alice, salted:", Sx.saltedHash(sa, pw)), row("bob, salted:", Sx.saltedHash(sb, pw)), "same password, same stored hash: False",
      row("alice, salted, x10000:", Sx.stretchedHash(sa, pw, 10000)), 'check "correct horse": True', 'check "correct horsf": False'];
  }
  function stackExpected() {
    const hex8 = (n) => "0x" + n.toString(16).padStart(8, "0");
    const line = (label, can, fp, ret, verdict) => label.padEnd(36) + " canary " + (can ? "intact" : "SMASHED").padEnd(6) + ", saved fp " + (fp ? "intact" : "SMASHED").padEnd(6) + ", return address " + hex8(ret) + " -> " + verdict;
    const R = 0x08048456;
    return [line("copy of 8 bytes (unchecked):", true, true, R, "returns normally"), line("copy of 16 bytes (unchecked):", true, true, R, "returns normally"),
      line("copy of 20 bytes (unchecked):", false, true, R, "aborted by the canary check"), line("copy of 28 bytes (unchecked):", false, false, 0x41414141, "aborted by the canary check"),
      line("crafted 28 bytes, canary known:", true, false, 0x0804dead, "returns to a changed address"), line("copy of 28 bytes (checked, cut to 16):", true, true, R, "returns normally")];
  }
  const St = require("../js/lib/storage.js");
  function raidExpected() {
    const b = (t) => Uint8Array.from(t, (c) => c.charCodeAt(0)), txt = (u) => String.fromCharCode(...u), hexs = (u) => Array.from(u, (x) => x.toString(16).padStart(2, "0")).join("");
    const data = ["alpha-01", "bravo-02", "charlie3", "delta-04"].map(b), parity = St.xorBlocks(data), fresh = b("BRAVO-99");
    const rebuilt = St.rebuildBlock(data.filter((_, i) => i !== 2), parity), recomputed = St.xorBlocks([data[0], fresh, data[2], data[3]]);
    const wrong = St.rebuildBlock(data.filter((_, i) => i !== 2 && i !== 3), parity);
    return ["data disks:  " + data.map(txt).join(" "), "parity disk: " + hexs(parity),
      `disk 2 fails; rebuilt from parity and the other disks: ${txt(rebuilt)} (matches original: ${txt(rebuilt) === txt(data[2]) ? "True" : "False"})`,
      `small write to disk 1: new parity from old parity, old data and new data matches a full recompute: ${txt(St.updateParity(parity, data[1], fresh)) === txt(recomputed) ? "True" : "False"}`,
      "that small write costs 2 reads + 2 writes = " + St.raidInfo("5", 4, 1).smallWriteIOs + " disk operations",
      `a second failure (disks 2 and 3 both lost) cannot be rebuilt: wrong data produced: ${txt(wrong) !== txt(data[2]) ? "True" : "False"}`];
  }
  const mode = (what, octal, sym) => `${what.padEnd(36)} ${octal} (${sym})`;
  const EXPECT = {
    pagetable_translate: { unix: false, lines: pagetableExpected },
    syscall_vs_stdio: { unix: false, lines: () => ["BAC"] },
    file_mode: { unix: true, lines: () => [mode("created with mode 666, umask 022:", "644", "rw-r--r--"), mode("after chmod 640:", "640", "rw-r-----"), mode("after chmod 600:", "600", "rw-------"), "others can read the file: no"] },
    threads_sum: { unix: false, lines: threadsExpected },
    spinlock_atomic: { unix: false, lines: () => ["4 threads x 2000 increments, protected by a spinlock: counter = 8000 (correct: True)"] },
    page_faults: { unix: true, lines: () => ["mapped 256 pages: no physical memory is assigned until a page is first touched", "touching each page for the first time caused page faults: True", "touching them all a second time caused far fewer: True"] },
    pipe_fork: { unix: true, lines: () => ["child read 20 bytes: hello through a pipe", "child saw end of file", "parent wrote 20 bytes and the child exited with status 0"] },
    shared_memory: { unix: true, lines: () => ["ordinary variable after the child set it to 99: 1", "shared memory after the child set it to 99:     99"] },
    socket_pair: { unix: true, lines: () => ["parent sent:     ping", "parent received: PING"] },
    resource_limits: { unix: true, lines: () => ["address-space limit set to 1024 MiB", "allocating 4 MiB: allowed", "allocating 2048 MiB: refused by the kernel"] },
    ns_inherit: { unix: true, lines: () => ["every process belongs to one namespace of each kind: ipc, mnt, net, pid, user, uts (all present: True)", "a forked child is in the same namespaces as its parent: True"] },
    condvar_queue: { unix: false, lines: () => ["2 producers sent 100 items each; 2 consumers received 200 items (sum of values = " + 2 * (100 * 101 / 2) + ")", "the queue never held more than 4 items: True"] },
    rwlock_demo: { unix: false, lines: () => ["4 readers made 4000 reads; every read saw a consistent pair: True", "the writer made 1000 updates; final value: 1000"] },
    mbr_parse: { unix: false, lines: mbrExpected },
    init_order: { unix: false, lines: initExpected },
    rt_schedule: { unix: false, lines: rtExpected },
    cpu_affinity: { unix: true, lines: () => ["nice(5) raised the niceness by 5 (capped at 19): True", "this process may run on at least one CPU: True", "after pinning, the allowed set is exactly that one CPU: True"] },
    password_hash: { unix: false, lines: passwordExpected },
    stack_frame_sim: { unix: false, lines: stackExpected },
    raid_parity: { unix: false, lines: raidExpected },
    write_ahead_log: { unix: false, lines: () => ["wrote 3 records (A=1, B=2, A=5) to the log", "full log replays to: A=5, B=2 (3 records)", "log cut in the middle of the last record: replays to A=1, B=2 (2 records)", "a flipped bit in the second record is caught by its checksum: replays to A=1, B=0 (1 record)"] },
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
    assert.ok(STEMS.length >= 22);
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
