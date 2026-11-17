/* Python labs (Node only): every script is really executed and its output checked, and the lab pages are checked against the
 * scripts. Needs Python 3 on the PATH (set PYTHON to choose one). For the psutil path, set PYLIB to a folder containing psutil
 * (`python -m pip install --target <folder> psutil`), or install it normally; CI does the latter. */
(function () {
  "use strict";
  if (typeof require === "undefined") return;
  const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
  const { spawnSync } = require("node:child_process");
  const ROOT = path.resolve(__dirname, "..");
  const CODE = path.join(ROOT, "labs", "code");

  function findPython() {
    const candidates = [process.env.PYTHON, "python3", "python", "py"].filter(Boolean);
    for (const c of candidates) {
      const r = spawnSync(c, ["--version"], { encoding: "utf8" });
      if (r.status === 0 && /^Python 3/.test((r.stdout || r.stderr || "").trim())) return c;
    }
    return null;
  }
  const PY = findPython();
  const baseEnv = { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONPATH: [process.env.PYLIB, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter) };
  const run = (args, timeout = 90000) => spawnSync(PY, args, { encoding: "utf8", timeout, env: baseEnv, cwd: CODE });
  const lab = (file, timeout) => run([file], timeout);
  const hasPsutil = PY && run(["-c", "import psutil"]).status === 0;
  const test = PY ? QUnit.test : QUnit.skip;   // no Python: skip, but say so

  QUnit.module("python labs");

  QUnit.test(PY ? `Python found: ${spawnSync(PY, ["--version"], { encoding: "utf8" }).stdout.trim()}` : "Python 3 not found: lab execution tests are skipped", (assert) => {
    assert.ok(true, PY ? `using "${PY}"; psutil ${hasPsutil ? "available" : "not available (the psutil output checks are skipped)"}` : "install Python 3 or set PYTHON");
  });

  test("every lab script is valid Python", (assert) => {
    const files = fs.readdirSync(CODE).filter((f) => f.endsWith(".py"));
    assert.ok(files.length >= 6);
    files.forEach((f) => {
      const r = run(["-c", `import ast,sys; ast.parse(open(sys.argv[1], encoding="utf-8").read())`, f]);
      assert.equal(r.status, 0, `${f} parses${r.status ? ": " + r.stderr : ""}`);
    });
  });

  test("Lab 1a: processes launch, report exit codes, inherit the environment and run in parallel", (assert) => {
    const r = lab("lab1_processes.py");
    assert.equal(r.status, 0, r.stderr);
    const out = r.stdout;
    assert.ok(/this process: pid=\d+\s+parent pid=\d+/.test(out), "pid and parent pid");
    assert.ok(/child said:\s+hello from child, pid \d+/.test(out));
    assert.ok(/child exit code: 0/.test(out) && /a failing child exits with code 3/.test(out));
    assert.ok(/child saw LAB_GREETING = inherited!/.test(out), "environment is inherited");
    assert.ok(/all have different pids: True/.test(out));
    const secs = +/finished in ([\d.]+) s/.exec(out)[1];
    assert.ok(secs < 1.8, `four 0.5 s sleepers overlapped (${secs} s, sequential would be 2.0 s or more)`);
  });

  test("Lab 1b: fork, exec, wait and zombies (full run on Linux/macOS; a polite refusal on Windows)", (assert) => {
    const r = lab("lab1_fork.py");
    if (process.platform === "win32") {
      assert.equal(r.status, 1, "exits with an error code");
      assert.ok(/os\.fork\(\) is not available here/.test(r.stderr), "explains how to run it");
      return;
    }
    assert.equal(r.status, 0, r.stderr);
    const lines = r.stdout.trim().split("\n");
    assert.deepEqual(lines.slice(0, 4), [
      "child : fork() returned 0",
      "parent: fork() returned the child's pid (a positive number: True)",
      "parent: the child exited with code 7",
      "this line was printed by the echo program"], "deterministic order (every print is flushed)");
    assert.ok(lines.includes("3 forks in a row produced 8 processes"), "2^3 processes");
    const state = lines.find((l) => l.startsWith("before wait()"));
    if (state) assert.ok(/state as 'Z/.test(state), "the finished, un-waited child is a zombie");
    assert.equal(lines[lines.length - 1], "after wait(): the zombie is gone");
    assert.equal(lines.filter((l) => l.startsWith("child :")).length, 1, "no duplicated output from forked buffers");
  });

  test("Lab 1b on Linux in Docker (opt-in: LAB_DOCKER=1), so Windows machines can verify the Linux-only lab", (assert) => {
    if (!process.env.LAB_DOCKER) { assert.ok(true, "skipped (set LAB_DOCKER=1 to run)"); return; }
    const r = spawnSync("docker", ["run", "--rm", "-v", `${CODE}:/lab:ro`, "python:3.12-slim", "python", "/lab/lab1_fork.py"], { encoding: "utf8", timeout: 240000, env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(/3 forks in a row produced 8 processes/.test(r.stdout) && /the zombie is gone|after wait/.test(r.stdout));
  });

  test("Lab 2a: a lock makes the counter correct, and without one updates are lost", (assert) => {
    let wrongSeen = false;
    for (let attempt = 0; attempt < 3 && !wrongSeen; attempt++) {   // a race is probabilistic; with sleep(0) it is overwhelmingly likely
      const r = lab("lab2_threads.py");
      assert.equal(r.status, 0, r.stderr);
      const unsafe = /without a lock\s+got\s+(\d+): (.*)/.exec(r.stdout), safe = /with a lock\s+got\s+(\d+): (.*)/.exec(r.stdout);
      assert.equal(+safe[1], 8000, "with a lock: exactly 8000");
      assert.equal(safe[2], "correct");
      assert.ok(+unsafe[1] <= 8000 && +unsafe[1] >= 2000 - 1, "never more than the right answer");
      wrongSeen = +unsafe[1] < 8000 && /WRONG/.test(unsafe[2]);
    }
    assert.true(wrongSeen, "the unsafe version lost updates");
  });

  test("Lab 2b: threads, processes and sequential code all agree; processes are faster on a multi-core machine", (assert) => {
    const r = lab("lab2_gil.py");
    assert.equal(r.status, 0, r.stderr);
    const t = (label) => +new RegExp(label + "\\s+([\\d.]+) s").exec(r.stdout)[1];
    const seq = t("one after another"), threads = t("4 threads"), procs = t("4 processes");
    assert.ok(seq > 0 && threads > 0 && procs > 0);
    assert.ok(/give the same answers: True/.test(r.stdout));
    if (os.cpus().length >= 4) assert.ok(procs < seq * 0.9, `processes ${procs} s vs sequential ${seq} s`);
    else assert.ok(true, "fewer than 4 cores: speedup not asserted");
  });

  test("Lab 3 without psutil: prints the standard-library facts and an install hint", (assert) => {
    // Hide psutil even if installed, so this path is always tested
    const r = run(["-c", "import sys; sys.modules['psutil'] = None; exec(compile(open('lab3_resources.py', encoding='utf-8').read(), 'lab3_resources.py', 'exec'))"]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(/== The basics \(standard library only\) ==/.test(r.stdout) && /logical CPUs:\s+\d+/.test(r.stdout) && /disk:\s+\d+ GiB used of \d+ GiB/.test(r.stdout));
    assert.ok(/psutil is not installed\. Run:\s+python -m pip install psutil/.test(r.stdout), "helpful message");
    assert.false(/== CPU ==/.test(r.stdout), "stops before the psutil sections");
  });

  (hasPsutil ? test : QUnit.skip)("Lab 3 with psutil: CPU, memory, processes and ancestry", (assert) => {
    const r = lab("lab3_resources.py");
    assert.equal(r.status, 0, r.stderr);
    ["== CPU ==", "== Memory ==", "== Processes ==", "== This process =="].forEach((h) => assert.ok(r.stdout.includes(h), h));
    assert.ok(/RAM:\s+[\d.]+ GiB total, [\d.]+ GiB available \([\d.]+% in use\)/.test(r.stdout));
    assert.ok(/\d+ processes visible\. Top 5 by resident memory/.test(r.stdout));
    assert.equal((r.stdout.match(/^ {2}pid +\d+ /gm) || []).length, 5, "five process rows");
    assert.ok(/ancestors: .*\(\d+\)/.test(r.stdout), "ancestor chain printed");
  });

  test("Lab 4: bounded buffer never overflows; naive philosophers deadlock, ordered ones do not", (assert) => {
    const r = lab("lab4_sync.py", 120000);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(/bounded buffer: produced 12, consumed 12, largest buffer size seen [1-3] \(limit 3\), each producer's items stayed in order: True/.test(r.stdout), r.stdout);
    assert.ok(/naive \(left fork first\): DEADLOCK after 2 s: 5 of 5 philosophers stuck, meals eaten 0 of 15/.test(r.stdout), "the deadlock happens every time");
    assert.ok(/ordered \(lower-numbered fork first\): all 5 philosophers finished, 15 meals eaten, no deadlock/.test(r.stdout), "resource ordering prevents it");
  });

  QUnit.module("python labs: pages");

  QUnit.test("lab pages embed the real script contents (run `npm run build:labs` if this fails)", (assert) => {
    const { stale, pages } = require("../tools/build-labs.js");
    assert.ok(pages().length >= 4);
    assert.deepEqual(stale().map((p) => path.basename(p)), [], "no lab page is out of date");
  });

  QUnit.test("every lab in the list has a page, every script is used by a page, and every page is listed", (assert) => {
    globalThis.window = globalThis;
    require("../js/data/labs.js");
    const labs = globalThis.OSData.labs, files = fs.readdirSync(path.join(ROOT, "labs")).filter((f) => f.endsWith(".html")).sort();
    assert.deepEqual(files, labs.map((l) => l.slug + ".html").sort(), "labs/*.html matches js/data/labs.js");
    labs.forEach((l, i) => assert.equal(l.n, i + 1, `lab ${l.n} numbered sequentially`));
    const used = new Set();
    files.forEach((f) => { for (const [, src] of fs.readFileSync(path.join(ROOT, "labs", f), "utf8").matchAll(/data-src="labs\/code\/([^"]+)"/g)) used.add(src); });
    const scripts = fs.readdirSync(CODE).filter((f) => f.endsWith(".py")).sort();
    assert.deepEqual([...used].sort(), scripts, "each script appears in exactly the lab pages that use it");
  });

  QUnit.test("scripts are ASCII-only (they print to any console) and follow the numbering the pages refer to", (assert) => {
    fs.readdirSync(CODE).filter((f) => f.endsWith(".py")).forEach((f) => {
      const text = fs.readFileSync(path.join(CODE, f), "utf8");
      assert.false(/[^\x00-\x7f]/.test(text), `${f} is plain ASCII`);
      assert.true(/\(1\)/.test(text), `${f} has numbered comments for the page to refer to`);
    });
  });
})();
