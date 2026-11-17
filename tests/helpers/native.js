/* Shared helpers for tests that run real programs: find Python and a C compiler, compile/run C, and (opt-in) do it all
 * inside a throwaway Linux (Alpine) container so Windows machines can verify Linux-only code.
 *   CC=...              choose the C compiler          PYTHON=...  choose Python
 *   EXAMPLES_DOCKER=1   (or LAB_DOCKER=1) use Docker when there is no local compiler or when the code needs Linux */
"use strict";
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawnSync } = require("node:child_process");

const which = (cmds, args = ["--version"]) => cmds.filter(Boolean).find((c) => { const r = spawnSync(c, args, { encoding: "utf8" }); return r.status === 0 && !r.error; });
const PY = which([process.env.PYTHON, "python3", "python", "py"]);
const CC = which([process.env.CC, "gcc", "cc", "clang"]);
const DOCKER_WANTED = !!(process.env.EXAMPLES_DOCKER || process.env.LAB_DOCKER);
const DOCKER = DOCKER_WANTED ? which(["docker"]) : null;
const FLAGS = ["-std=c99", "-D_POSIX_C_SOURCE=200809L", "-Wall", "-Wextra", "-Werror", "-pedantic", "-O0", "-pthread"];
/** C files that need C11 (for example <stdatomic.h>) say so in their first lines: a comment containing "build: c11". */
const flagsFor = (file) => (/build: c11/.test(fs.readFileSync(file, "utf8").slice(0, 200)) ? FLAGS.map((f) => (f === "-std=c99" ? "-std=c11" : f)) : FLAGS);
const isWindows = process.platform === "win32";

/** Can this machine compile and run C that needs a Unix-like system (fork, pthreads)? */
const nativeUnixC = !!CC && !isWindows;
/** Is there some way to run Unix-only C here (a local Unix compiler, or Docker)? */
const canRunUnixC = nativeUnixC || !!DOCKER;
const canRunUnixPython = !!PY && !isWindows;

function runPythonLocal(file, args = []) {
  return spawnSync(PY, [file, ...args], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" }, timeout: 120000 });
}
function runCLocal(file) {
  const out = path.join(os.tmpdir(), `osc_${process.pid}_${path.basename(file, ".c")}${isWindows ? ".exe" : ""}`);
  const c = spawnSync(CC, [...flagsFor(file), "-o", out, file], { encoding: "utf8", timeout: 120000 });
  if (c.status !== 0) return { status: c.status, stdout: "", stderr: c.stderr, compileFailed: true };
  const r = spawnSync(out, [], { encoding: "utf8", timeout: 120000 });
  try { fs.unlinkSync(out); } catch (e) { /* best effort */ }
  return r;
}

/**
 * Compile and run C files, and run their Python partners, inside ONE Alpine container (the setup is slow, so it is done once per
 * set of files). Returns { "<file name>": {stdout, status, compileFailed?} }.
 */
const containerCache = new Map();
function inContainer(dir, files) {
  const key = dir + "|" + files.join(",");
  if (containerCache.has(key)) return containerCache.get(key);
  const steps = files.map((f) => {
    const base = f.replace(/\.(c|py)$/, "");
    return f.endsWith(".c")
      ? `echo "@@${f}"; if gcc ${flagsFor(path.join(dir, f)).join(" ")} -o /tmp/${base} /src/${f} 2>/tmp/${base}.err; then /tmp/${base}; echo "@@status $?"; else echo "@@compile-failed"; cat /tmp/${base}.err; fi`
      : `echo "@@${f}"; python3 /src/${f}; echo "@@status $?"`;
  }).join("; ");
  const r = spawnSync("docker", ["run", "--rm", "-v", `${dir}:/src:ro`, "alpine:3.20", "sh", "-c", `apk add --no-cache gcc musl-dev python3 procps >/dev/null 2>&1; ${steps}`],
    { encoding: "utf8", timeout: 600000, env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
  // Parse the sections: "@@<file>" starts one, "@@status N" is its exit code, "@@compile-failed" marks a build error (its text follows).
  const result = {};
  let cur = null;
  (r.stdout || "").replace(/\r\n/g, "\n").split("\n").forEach((line) => {
    let m;
    if ((m = /^@@(\S+\.(?:c|py))$/.exec(line))) cur = result[m[1]] = { stdout: "", stderr: "", status: null, compileFailed: false };
    else if (cur && (m = /^@@status (\d+)$/.exec(line))) cur.status = +m[1];
    else if (cur && line === "@@compile-failed") { cur.compileFailed = true; cur.status = 1; }
    else if (cur) { if (cur.compileFailed) cur.stderr += line + "\n"; else cur.stdout += line + "\n"; }
  });
  containerCache.set(key, result);
  return result;
}

/** Run a C file wherever possible: locally on Unix, otherwise in the container (when allowed). */
function runUnixC(dir, file, siblings) {
  if (nativeUnixC) return runCLocal(path.join(dir, file));
  if (DOCKER) { const r = inContainer(dir, siblings || [file])[file]; return r || { status: -1, stdout: "", stderr: "no output from the container" }; }
  return null;
}
function runUnixPython(dir, file, siblings) {
  if (canRunUnixPython) return runPythonLocal(path.join(dir, file));
  if (DOCKER) { const r = inContainer(dir, siblings || [file])[file]; return r || { status: -1, stdout: "", stderr: "no output from the container" }; }
  return null;
}

module.exports = { PY, CC, DOCKER, FLAGS, isWindows, nativeUnixC, canRunUnixC, canRunUnixPython, runPythonLocal, runCLocal, inContainer, runUnixC, runUnixPython, which };
