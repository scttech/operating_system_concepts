/* Storage reliability: pure models behind the Module 17 simulations.
 *   raid*          : RAID levels (capacity, how many failures they survive, the cost of a small write), XOR parity and rebuilding,
 *                    and the chance of hitting a read error during a rebuild;
 *   ssdSimulate    : a tiny flash translation layer with garbage collection, to measure write amplification and wear;
 *   journalCrash   : an append to a file, interrupted by a crash at every possible point, with and without journaling. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OSLib = Object.assign(root.OSLib || {}, api);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  // ---------- RAID ----------
  const raidLevels = {
    "0": { name: "RAID 0 (striping)", min: 2 }, "1": { name: "RAID 1 (mirroring)", min: 2 }, "5": { name: "RAID 5 (striping with one parity)", min: 3 },
    "6": { name: "RAID 6 (striping with two parities)", min: 4 }, "10": { name: "RAID 10 (striped mirrors)", min: 4 }
  };
  /** Capacity and fault tolerance for n disks of sizeTB each. */
  function raidInfo(level, n, sizeTB) {
    const L = raidLevels[level];
    if (!L) throw new Error("unknown RAID level");
    if (!Number.isInteger(n) || n < 1 || n > 16 || !(sizeTB > 0)) throw new Error("bad disks or size");
    const valid = n >= L.min && (level !== "10" || n % 2 === 0);
    const info = { level, name: L.name, disks: n, valid, minDisks: L.min };
    if (!valid) return Object.assign(info, { usable: 0, efficiency: 0, guaranteed: 0, bestCase: 0, smallWriteIOs: 0, note: level === "10" && n >= L.min ? "RAID 10 needs an even number of disks." : `${L.name} needs at least ${L.min} disks.` });
    const usable = { "0": n, "1": 1, "5": n - 1, "6": n - 2, "10": n / 2 }[level] * sizeTB;
    const guaranteed = { "0": 0, "1": n - 1, "5": 1, "6": 2, "10": 1 }[level];
    const bestCase = { "0": 0, "1": n - 1, "5": 1, "6": 2, "10": n / 2 }[level];
    const smallWriteIOs = { "0": 1, "1": n, "5": 4, "6": 6, "10": 2 }[level];
    return Object.assign(info, { usable, efficiency: usable / (n * sizeTB), guaranteed, bestCase, smallWriteIOs, note: "" });
  }
  /** Does the array still hold all its data after the disks in `failed` (indexes 0..n-1) are lost? RAID 10 mirrors the pairs (0,1), (2,3), ... */
  function raidSurvives(level, n, failed) {
    const info = raidInfo(level, n, 1);
    if (!info.valid) throw new Error(info.note);
    const f = new Set(failed);
    if ([...f].some((d) => !Number.isInteger(d) || d < 0 || d >= n)) throw new Error("no such disk");
    if (level === "10") { for (let p = 0; p < n; p += 2) if (f.has(p) && f.has(p + 1)) return false; return true; }
    if (level === "0") return f.size === 0;
    if (level === "1") return f.size < n;
    return f.size <= (level === "5" ? 1 : 2);
  }
  /** Byte-by-byte XOR of equal-length blocks: the parity block. */
  function xorBlocks(blocks) {
    if (!blocks.length) throw new Error("no blocks");
    const len = blocks[0].length, out = new Uint8Array(len);
    blocks.forEach((b) => { if (b.length !== len) throw new Error("blocks must be the same length"); for (let i = 0; i < len; i++) out[i] ^= b[i]; });
    return out;
  }
  /** Recover the one missing block from the surviving data blocks and the parity block. */
  const rebuildBlock = (survivors, parity) => xorBlocks([...survivors, parity]);
  /** The parity after one data block changes, without reading the other disks: new = old parity XOR old data XOR new data. */
  const updateParity = (oldParity, oldData, newData) => xorBlocks([oldParity, oldData, newData]);
  /**
   * Chance of meeting at least one unrecoverable read error while reading what is needed to rebuild after ONE disk failed.
   * ureBits: one such error per this many bits read (a common specification is 1e14 for consumer drives, 1e15 for enterprise).
   * RAID 5 must read every surviving disk completely; a mirror must read its partner; RAID 6 and 3-way mirrors can still correct one error.
   */
  function rebuildRisk(level, n, sizeTB, ureBits) {
    const info = raidInfo(level, n, sizeTB);
    if (!info.valid || !(ureBits > 0)) throw new Error("bad input");
    if (level === "0") return { bitsRead: 0, probability: 1, covered: false, note: "RAID 0 has no redundancy: one failed disk loses everything." };
    const disksRead = level === "5" ? n - 1 : level === "6" ? n - 1 : 1;
    const bitsRead = disksRead * sizeTB * 8e12;
    const p = 1 - Math.exp(-bitsRead / ureBits);
    const covered = level === "6" || (level === "1" && n >= 3);
    return { bitsRead, probability: covered ? 0 : p, rawProbability: p, covered, note: covered ? "One more error can still be corrected from the remaining redundancy." : "A read error during the rebuild loses data." };
  }

  // ---------- SSD wear ----------
  function rng32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  /**
   * A flash drive can only erase whole blocks, and only write pages that were erased. Overwriting a page therefore writes a NEW page elsewhere and leaves
   * the old one invalid; when free blocks run low, garbage collection copies the still-valid pages of the emptiest block and erases it.
   * opts: blocks, pagesPerBlock, overProvision (fraction of flash kept hidden from the host), fill (fraction of the visible space holding data),
   *       writes (host writes to measure), pattern "random" | "sequential" | "hotcold" (80% of writes go to 20% of the data), seed,
   *       separate (the drive writes frequently and rarely changed data, and pages moved by garbage collection, into separate blocks, as multi-stream drives do).
   * Write amplification = flash writes / host writes.
   */
  function ssdSimulate(opts) {
    const o = Object.assign({ blocks: 128, pagesPerBlock: 32, overProvision: 0.07, fill: 0.8, writes: 20000, pattern: "random", seed: 1, separate: true }, opts || {});
    const B = o.blocks, P = o.pagesPerBlock, total = B * P, logical = Math.floor(total * (1 - o.overProvision)), used = Math.max(1, Math.floor(logical * o.fill));
    if (!Number.isInteger(B) || B < 8 || !Number.isInteger(P) || P < 4 || !(o.overProvision >= 0 && o.overProvision < 0.9) || !(o.fill > 0 && o.fill <= 1) || logical > total - 5 * P || !Number.isInteger(o.writes) || o.writes < 1) throw new Error("bad SSD settings");
    if (!["random", "sequential", "hotcold"].includes(o.pattern)) throw new Error("bad pattern");
    const rnd = rng32(o.seed);
    const owner = new Int32Array(total).fill(-1), map = new Int32Array(logical).fill(-1), valid = new Int32Array(B), fillOf = new Int32Array(B), erases = new Int32Array(B);
    const free = [...Array(B).keys()];
    const frontier = { h: -1, c: -1, g: -1 };
    let hostWrites = 0, flashWrites = 0, relocated = 0, eraseCount = 0, seq = 0;
    function takeFree() {
      let best = 0;
      for (let i = 1; i < free.length; i++) if (erases[free[i]] < erases[free[best]]) best = i;   // use the least-worn free block
      return free.splice(best, 1)[0];
    }
    const hot = Math.max(1, Math.floor(used * 0.2));
    /** kind: "h" fresh host write to a hot page, "c" to a cold page, "g" a page moved by garbage collection. Without separation all share one block. */
    function place(l, kind) {
      const k = o.separate ? kind : "h";
      let a = frontier[k];
      if (a < 0 || fillOf[a] === P) { a = takeFree(); frontier[k] = a; }
      const p = a * P + fillOf[a]++;
      owner[p] = l; map[l] = p; valid[a]++; flashWrites++;
    }
    function collect() {
      while (free.length < 4) {
        let v = -1;
        for (let b = 0; b < B; b++) if (b !== frontier.h && b !== frontier.c && b !== frontier.g && fillOf[b] === P && (v < 0 || valid[b] < valid[v] || (valid[b] === valid[v] && erases[b] < erases[v]))) v = b;
        if (v < 0) throw new Error("no block to collect");
        for (let i = 0; i < P; i++) { const l = owner[v * P + i]; if (l >= 0) { owner[v * P + i] = -1; valid[v]--; map[l] = -1; place(l, "g"); relocated++; } }
        fillOf[v] = 0; erases[v]++; eraseCount++; free.push(v);
      }
    }
    function write(l) {
      const old = map[l];
      if (old >= 0) { owner[old] = -1; valid[Math.floor(old / P)]--; map[l] = -1; }
      const kind = l < hot ? "h" : "c", a = o.separate ? frontier[kind] : frontier.h;
      if (a < 0 || fillOf[a] === P) collect();
      place(l, kind);
    }
    for (let l = 0; l < used; l++) write(l);                              // fill the drive with data first: this is not counted
    flashWrites = 0; relocated = 0; eraseCount = 0; erases.fill(0);
    for (let i = 0; i < o.writes; i++) {
      let l;
      if (o.pattern === "sequential") l = seq++ % used;
      else if (o.pattern === "random") l = Math.floor(rnd() * used);
      else l = rnd() < 0.8 ? Math.floor(rnd() * hot) : hot + Math.floor(rnd() * Math.max(1, used - hot));
      write(Math.min(l, used - 1)); hostWrites++;
    }
    const mapped = [...map].filter((x) => x >= 0).length;
    return { hostWrites, flashWrites, relocated, erasesTotal: eraseCount, wa: flashWrites / hostWrites, erases: Array.from(erases), maxErase: Math.max(...erases), minErase: Math.min(...erases), mapped, used, logical, physical: total,
      consistent: [...map].every((p, l) => p < 0 || owner[p] === l) && Array.from(valid).reduce((a, b) => a + b, 0) === mapped };
  }

  // ---------- journaling ----------
  const journalModes = { none: "No journal (update in place)", metadata: "Metadata journal (data first, then a logged update)", full: "Full journal (data and metadata logged)" };
  const journalOrders = { "metadata-first": ["bitmap", "inode", "data"], "data-first": ["data", "bitmap", "inode"], "inode-first": ["inode", "data", "bitmap"] };
  const STEP_TEXT = { bitmap: "mark the new block as used in the free-space bitmap", inode: "update the file's inode (new size and a pointer to the block)", data: "write the new data into the block" };
  /** The steps an append goes through, and which of them are the journal's commit point. */
  function journalSteps(mode, order) {
    if (!journalModes[mode]) throw new Error("unknown mode");
    if (mode === "none") { const o = journalOrders[order]; if (!o) throw new Error("unknown order"); return { steps: o.map((k) => ({ id: k, text: STEP_TEXT[k] })), commitAt: null }; }
    if (mode === "metadata") return { steps: [{ id: "data", text: "write the new data into the block" }, { id: "log-meta", text: "write the bitmap and inode updates into the journal" }, { id: "commit", text: "write the commit record" }, { id: "bitmap", text: "apply the bitmap update in place" }, { id: "inode", text: "apply the inode update in place" }], commitAt: 3 };
    return { steps: [{ id: "log-data", text: "write the new data into the journal" }, { id: "log-meta", text: "write the bitmap and inode updates into the journal" }, { id: "commit", text: "write the commit record" }, { id: "data", text: "copy the data to its block" }, { id: "bitmap", text: "apply the bitmap update in place" }, { id: "inode", text: "apply the inode update in place" }], commitAt: 3 };
  }
  const applied = (done) => ({ bitmap: done.has("bitmap"), inode: done.has("inode"), data: done.has("data") });
  /** Judge a disk state: which of the three structures reflect the append, and what is wrong if they disagree. */
  function judge(s) {
    const n = (s.bitmap ? 1 : 0) + (s.inode ? 1 : 0) + (s.data ? 1 : 0);
    if (n === 0) return { state: "old", consistent: true, severe: false, problems: [] };
    if (n === 3) return { state: "new", consistent: true, severe: false, problems: [] };
    const problems = [];
    if (s.inode && !s.bitmap) problems.push({ kind: "dangling", severe: true, text: "The file points to a block that the free-space bitmap still lists as free. The block could be given to another file, and two files would share it." });
    if (s.inode && !s.data) problems.push({ kind: "garbage", severe: true, text: "The file now includes a block whose data was never written, so it contains whatever was there before: someone else's old data, or junk." });
    if (s.bitmap && !s.inode) problems.push({ kind: "leak", severe: false, text: "The block is marked used but no file owns it: a leaked block. Harmless apart from lost space; a repair scan can reclaim it." });
    if (s.data && !s.inode && !s.bitmap) return { state: "old", consistent: true, severe: false, problems: [] };   // an unreferenced data block: the old state, with a stray write
    return { state: problems.length ? "broken" : "old", consistent: !problems.length, severe: problems.some((x) => x.severe), problems };
  }
  /**
   * The append is interrupted after `crashAfter` steps (0 to the number of steps). Returns what is on disk at the crash, what recovery does,
   * and what is on disk afterwards. "none" has no recovery: the damage stays until a repair scan. Journals replay the update if the commit record
   * was written, and discard it otherwise.
   */
  function journalCrash(mode, order, crashAfter) {
    const { steps, commitAt } = journalSteps(mode, order || "metadata-first");
    if (!Number.isInteger(crashAfter) || crashAfter < 0 || crashAfter > steps.length) throw new Error("crashAfter must be 0 to " + steps.length);
    const done = new Set(steps.slice(0, crashAfter).map((s) => s.id));
    const atCrash = applied(done), before = judge(atCrash);
    let recovery = "There is no journal, so nothing is repaired automatically.", after = atCrash;
    if (mode !== "none") {
      const committed = crashAfter >= commitAt;
      if (committed) { after = { bitmap: true, inode: true, data: true }; recovery = "The commit record is on disk, so recovery replays the logged update and finishes the append."; }
      else { after = { bitmap: false, inode: false, data: false }; recovery = crashAfter === 0 ? "Nothing was written." : "There is no commit record, so recovery ignores the logged update. The append simply did not happen."; }
    }
    const result = judge(after);
    return { steps, crashAfter, completed: steps.slice(0, crashAfter), atCrash, beforeRecovery: before, recovery, afterRecovery: after, state: result.state, consistent: result.consistent, severe: result.severe, problems: result.problems, committed: commitAt !== null && crashAfter >= commitAt };
  }

  return { raidLevels, raidInfo, raidSurvives, xorBlocks, rebuildBlock, updateParity, rebuildRisk, ssdSimulate, journalModes, journalOrders, journalSteps, journalCrash };
});
