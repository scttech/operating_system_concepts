/* Security in depth: pure models behind the Module 3 simulations.
 *   stackAttack            : what happens when input overflows a buffer on the stack, with and without a canary, NX and ASLR;
 *   passwordSpace / crack* : how long guessing takes for a given password and a given kind of attacker;
 *   sha256Hex / *Hash      : SHA-256 and the salted and stretched hashes the example programs use;
 *   threat systems         : scoring a student's STRIDE classification. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OSLib = Object.assign(root.OSLib || {}, api);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  // ---------- the stack ----------
  const FRAME = { buf: 16, canary: 4, fp: 4, ret: 4 };
  const ASLR_BITS = 8;   // illustrative: a 32-bit process has few bits of randomness for the attacker to guess

  /** The segments of one stack frame, from the lowest address (where the buffer starts) up to the return address. */
  function stackLayout(canary) {
    const segs = [{ name: "buffer", start: 0, len: FRAME.buf }];
    let at = FRAME.buf;
    if (canary) { segs.push({ name: "canary", start: at, len: FRAME.canary }); at += FRAME.canary; }
    segs.push({ name: "saved frame pointer", start: at, len: FRAME.fp }); at += FRAME.fp;
    segs.push({ name: "return address", start: at, len: FRAME.ret }); at += FRAME.ret;
    return { segs, size: at };
  }

  /**
   * An unchecked copy of `inputLen` bytes into the buffer. opts:
   *   crafted : the last four bytes written are an address the attacker chose (otherwise the input is plain filler, "AAAA...")
   *   canary, nx, aslr : the defenses that are switched on
   *   leak    : the attacker has an information leak, so knows the canary value and the addresses
   *   target  : "shellcode" (jump into bytes the attacker supplied) or "reuse" (jump to code that already exists, such as library functions)
   * Returns the cells of the frame (empty, intact or overwritten), the outcome and the steps that lead to it.
   */
  function stackAttack(o) {
    const opts = Object.assign({ inputLen: 0, crafted: false, canary: false, nx: false, aslr: false, leak: false, target: "shellcode" }, o || {});
    if (!Number.isInteger(opts.inputLen) || opts.inputLen < 0 || opts.inputLen > 64) throw new Error("inputLen must be 0 to 64");
    if (opts.target !== "shellcode" && opts.target !== "reuse") throw new Error("target must be shellcode or reuse");
    const L = stackLayout(opts.canary), ret = L.segs[L.segs.length - 1], can = L.segs.find((s) => s.name === "canary");
    const cells = [];
    L.segs.forEach((s) => { for (let i = 0; i < s.len; i++) cells.push({ seg: s.name, offset: s.start + i, state: s.start + i < opts.inputLen ? "written" : s.name === "buffer" ? "empty" : "intact" }); });
    const steps = [];
    const reachesRet = opts.inputLen >= ret.start + ret.len;     // the whole return address is replaced
    const touchedRet = opts.inputLen > ret.start;
    const touchedCanary = !!can && opts.inputLen > can.start;
    let outcome;
    if (opts.inputLen <= FRAME.buf) { outcome = "safe"; steps.push(`The ${opts.inputLen} bytes fit in the ${FRAME.buf}-byte buffer. Nothing else on the stack is touched.`); }
    else {
      steps.push(`The copy does not check the length, so ${opts.inputLen - FRAME.buf} byte${opts.inputLen - FRAME.buf === 1 ? "" : "s"} spill past the end of the buffer into whatever sits above it.`);
      const canaryRestored = !!can && opts.crafted && opts.leak && reachesRet;
      if (touchedCanary && !canaryRestored) {
        outcome = "canary-abort";
        steps.push("The canary, a secret value placed between the buffer and the return address, was overwritten.");
        steps.push("Before returning, the function checks the canary, sees it changed, and stops the program. The attack is detected before the return address is used.");
      } else if (!touchedRet) {
        outcome = "corrupted";
        steps.push("The overflow stopped before the return address, but it damaged the saved frame pointer. The caller will misbehave or crash when it uses it.");
      } else if (!reachesRet) {
        outcome = "crash";
        steps.push("Part of the return address was overwritten, so the function returns to a meaningless address and the program crashes (a denial of service, not a takeover).");
      } else if (!opts.crafted) {
        outcome = "crash";
        steps.push("The return address now holds the filler bytes (0x41414141), which is not valid code. The function returns there and the program crashes.");
      } else {
        steps.push(`The attacker chose the bytes that land on the return address, so the function will return to an address of the attacker's choosing${can ? ", and the canary was restored to its correct value" : ""}.`);
        if (opts.aslr && !opts.leak) { outcome = "crash"; steps.push(`With address-space layout randomization the attacker does not know where anything is. A wrong guess crashes the program (about 1 chance in ${2 ** ASLR_BITS} here).`); }
        else if (opts.target === "shellcode" && opts.nx) { outcome = "blocked-nx"; steps.push("The return address points into the stack, but the stack is marked non-executable (NX). The CPU refuses to run it and the program crashes."); }
        else { outcome = "hijacked"; steps.push(opts.target === "shellcode" ? "The CPU jumps into the attacker's own bytes and runs them. The attacker now controls the program." : "The CPU jumps to code that already exists in the program or its libraries, chosen by the attacker. Non-executable memory does not stop this, so the attacker still controls the program."); }
      }
    }
    return { layout: L, cells, outcome, steps, reachesReturn: reachesRet, retStart: ret.start };
  }
  const stackOutcomes = {
    safe: "No damage", corrupted: "Corrupted data, likely crash later", crash: "Crash", "canary-abort": "Stopped by the canary", "blocked-nx": "Stopped by non-executable memory", hijacked: "Attacker takes control"
  };

  // ---------- passwords ----------
  const charsets = { digits: ["digits only", 10], lower: ["lower-case letters", 26], mixed: ["upper and lower case", 52], alnum: ["letters and digits", 62], all: ["letters, digits and symbols", 94] };
  /** Number of passwords of this length from an alphabet of `size` characters. */
  function passwordSpace(length, size) {
    if (!Number.isInteger(length) || length < 1 || length > 64 || !Number.isInteger(size) || size < 2) throw new Error("bad length or alphabet");
    return Math.pow(size, length);
  }
  const entropyBits = (space) => Math.log2(space);
  /** Guesses per second for three kinds of attacker (illustrative round figures, not measurements). */
  const attackers = {
    online: { label: "Guessing through the login page (rate-limited)", rate: 10 },
    slow: { label: "Stolen database, salted and deliberately slow hash (bcrypt, scrypt, Argon2)", rate: 1e4 },
    fast: { label: "Stolen database, fast unsalted hash (such as plain SHA-256) on GPUs", rate: 1e10 }
  };
  /** Seconds to try half of the space (the average time to find a randomly chosen password). */
  function crackSeconds(space, rate) {
    if (!(space >= 1) || !(rate > 0)) throw new Error("bad space or rate");
    return space / 2 / rate;
  }
  const UNITS = [["second", 1], ["minute", 60], ["hour", 3600], ["day", 86400], ["year", 31557600]];
  /** A sentence-sized description of a duration in seconds. */
  function humanTime(sec) {
    if (!(sec >= 0)) throw new Error("bad duration");
    if (sec < 1) return "less than a second";
    const universe = 13.8e9 * 31557600;
    if (sec > universe) return "longer than the age of the universe";
    let best = UNITS[0];
    for (const u of UNITS) if (sec >= u[1]) best = u;
    const n = sec / best[1];
    if (best[0] === "year" && n >= 1e9) return `${(n / 1e9).toFixed(1)} billion years`;
    if (best[0] === "year" && n >= 1e6) return `${(n / 1e6).toFixed(1)} million years`;
    if (best[0] === "year" && n >= 1e3) return `${(n / 1e3).toFixed(1)} thousand years`;
    const rounded = n < 10 ? n.toFixed(1) : Math.round(n).toString();
    return `${rounded} ${best[0]}${rounded === "1" || rounded === "1.0" ? "" : "s"}`;
  }

  // ---------- SHA-256 ----------
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));

  /** SHA-256 of bytes (a Uint8Array or an array of 0-255). Returns a Uint8Array of 32 bytes. */
  function sha256(bytes) {
    const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const len = bytes.length, padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
    padded.set(bytes);
    padded[len] = 0x80;
    const bits = len * 8, view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, Math.floor(bits / 0x100000000));
    view.setUint32(padded.length - 4, bits >>> 0);
    const w = new Array(64);
    for (let off = 0; off < padded.length; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g), t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), maj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + maj) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0; h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    const out = new Uint8Array(32), ov = new DataView(out.buffer);
    h.forEach((x, i) => ov.setUint32(i * 4, x >>> 0));
    return out;
  }
  /** Text as UTF-8 bytes. Written out by hand so it works in every environment (some test browsers have no TextEncoder). */
  function utf8(s) {
    if (typeof s !== "string") return s;
    const out = [];
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return Uint8Array.from(out);
  }
  const toHex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
  const concat = (...parts) => { const bs = parts.map(utf8), out = new Uint8Array(bs.reduce((n, b) => n + b.length, 0)); let at = 0; bs.forEach((b) => { out.set(b, at); at += b.length; }); return out; };
  const sha256Hex = (data) => toHex(sha256(utf8(data)));
  /** Hash of the password alone: two users with the same password get the same value. */
  const plainHash = (password) => sha256Hex(password);
  /** Hash of salt followed by password: the same password gives a different value for each salt. */
  const saltedHash = (salt, password) => sha256Hex(concat(salt, password));
  /** Salted, then repeated: h = H(salt + password); then h = H(h + password), rounds - 1 more times. Each guess costs `rounds` hashes. */
  function stretchedHash(salt, password, rounds) {
    if (!Number.isInteger(rounds) || rounds < 1 || rounds > 1000000) throw new Error("rounds must be 1 to 1,000,000");
    let h = sha256(concat(salt, password));
    for (let i = 1; i < rounds; i++) h = sha256(concat(h, password));
    return toHex(h);
  }

  // ---------- threat modeling (STRIDE) ----------
  const stride = { S: "Spoofing", T: "Tampering", R: "Repudiation", I: "Information disclosure", D: "Denial of service", E: "Elevation of privilege" };
  const strideAsks = {
    S: "Pretending to be someone or something else.", T: "Changing data or code without permission.", R: "Denying having done something, when nothing can prove otherwise.",
    I: "Exposing information to someone not allowed to see it.", D: "Making a service unavailable to the people who need it.", E: "Gaining abilities one should not have."
  };
  /** answers: { threatIndex: "S" | "T" | ... }. Returns per-threat results and a total. */
  function scoreThreats(system, answers) {
    const results = system.threats.map((t, i) => { const a = answers[i]; return { index: i, answer: a || null, correct: a === t.cat, answered: !!a && !!stride[a] }; });
    return { results, correct: results.filter((r) => r.correct).length, answered: results.filter((r) => r.answered).length, total: system.threats.length };
  }

  return { stackLayout, stackAttack, stackOutcomes, STACK_FRAME: FRAME, ASLR_BITS, charsets, passwordSpace, entropyBits, attackers, crackSeconds, humanTime, sha256, sha256Hex, plainHash, saltedHash, stretchedHash, stride, strideAsks, scoreThreats };
});
