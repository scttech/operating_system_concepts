/* Multi-level page tables and a TLB. Pure logic: works in the browser and in Node.
 *
 * A configuration describes how a virtual address is cut up:
 *   { vaBits, offsetBits, levelBits: [bits for level 1, level 2, ...], pteBytes, names: [...] }
 * with vaBits = offsetBits + sum(levelBits). Addresses are JavaScript numbers (exact up to 2^53), so a 48-bit address is fine.
 * Page tables are sparse: a table only exists if some mapped page needs it, which is the whole point of multi-level tables.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OSLib = Object.assign(root.OSLib || {}, api);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const pow2 = (n) => 2 ** n;

  function validate(cfg) {
    const sum = cfg.levelBits.reduce((a, b) => a + b, 0) + cfg.offsetBits;
    if (sum !== cfg.vaBits || cfg.levelBits.length < 1 || cfg.levelBits.some((b) => b < 1) || cfg.offsetBits < 1) throw new Error("level bits + offset bits must add up to the address size");
    if (cfg.vaBits > 52) throw new Error("addresses wider than 52 bits are not supported");
    return cfg;
  }

  /** Cut a virtual address into the index for each level and the offset. */
  function split(vaddr, cfg) {
    const size = pow2(cfg.offsetBits), vpn = Math.floor(vaddr / size), offset = vaddr % size;
    const indices = []; let rest = vpn;
    for (let i = cfg.levelBits.length - 1; i >= 0; i--) { const n = pow2(cfg.levelBits[i]); indices[i] = rest % n; rest = Math.floor(rest / n); }
    return { vaddr, vpn, offset, indices, inRange: Number.isInteger(vaddr) && vaddr >= 0 && vaddr < pow2(cfg.vaBits) };
  }

  /** Build a sparse page table from [{vpn, frame}] mappings. */
  function build(cfg, mappings) {
    validate(cfg);
    let nextId = 0;
    const levels = cfg.levelBits.map(() => []);
    const mk = (level) => { const node = { id: nextId++, level, entries: new Map() }; levels[level].push(node); return node; };
    const rootNode = mk(0), size = pow2(cfg.offsetBits), last = cfg.levelBits.length - 1;
    mappings.forEach((m) => {
      const sp = split(m.vpn * size, cfg);
      let node = rootNode;
      for (let lvl = 0; lvl <= last; lvl++) {
        const idx = sp.indices[lvl];
        if (lvl === last) { node.entries.set(idx, { present: true, frame: m.frame }); break; }
        let e = node.entries.get(idx);
        if (!e) { e = { present: true, next: mk(lvl + 1) }; node.entries.set(idx, e); }
        node = e.next;
      }
    });
    return { cfg, root: rootNode, levels, mappedPages: mappings.length };
  }

  /** Walk the tables for one address. Returns the steps taken (one table read each) and either a physical address or a fault. */
  function walk(table, vaddr) {
    const cfg = table.cfg, sp = split(vaddr, cfg), size = pow2(cfg.offsetBits), last = cfg.levelBits.length - 1;
    if (!sp.inRange) return { split: sp, steps: [], fault: { level: -1, reason: "outside the address space" }, physical: null, frame: null, memRefs: 0 };
    let node = table.root; const steps = [];
    for (let lvl = 0; lvl <= last; lvl++) {
      const idx = sp.indices[lvl], e = node.entries.get(idx);
      const step = { level: lvl, name: (cfg.names && cfg.names[lvl]) || `Level ${lvl + 1}`, index: idx, tableId: node.id, present: !!e };
      steps.push(step);
      if (!e) return { split: sp, steps, fault: { level: lvl, reason: `no entry at ${step.name}[${idx}]` }, physical: null, frame: null, memRefs: steps.length };
      if (lvl === last) { step.frame = e.frame; return { split: sp, steps, fault: null, physical: e.frame * size + sp.offset, frame: e.frame, memRefs: steps.length }; }
      node = e.next;
    }
    throw new Error("unreachable");
  }

  /** A small TLB keyed by virtual page number. Oldest entry first. policy: "LRU" or "FIFO". */
  function createTLB({ entries = 4, policy = "LRU" } = {}) {
    let list = [];
    return {
      size: entries, policy,
      lookup(vpn) {
        const i = list.findIndex((e) => e.vpn === vpn);
        if (i < 0) return undefined;
        const e = list[i];
        if (policy === "LRU") { list.splice(i, 1); list.push(e); }
        return e.frame;
      },
      /** Returns the evicted vpn (or null). */
      insert(vpn, frame) {
        if (entries <= 0) return null;
        const i = list.findIndex((e) => e.vpn === vpn);
        if (i >= 0) list.splice(i, 1);
        let evicted = null;
        if (list.length >= entries) evicted = list.shift().vpn;
        list.push({ vpn, frame });
        return evicted;
      },
      flush() { list = []; },
      snapshot() { return list.map((e) => ({ ...e })); }
    };
  }

  /** Run a sequence of virtual addresses through the TLB and page tables. */
  function runSequence(table, addrs, tlbOpts) {
    const cfg = table.cfg, tlb = createTLB(tlbOpts || { entries: 0 }), steps = [];
    let hits = 0, misses = 0, faults = 0, totalRefs = 0;
    addrs.forEach((addr) => {
      const sp = split(addr, cfg), size = pow2(cfg.offsetBits);
      let rec;
      const cached = sp.inRange ? tlb.lookup(sp.vpn) : undefined;
      if (cached !== undefined) {
        hits++; totalRefs += 1;
        rec = { addr, split: sp, tlbHit: true, walk: null, fault: null, physical: cached * size + sp.offset, frame: cached, memRefs: 1, evicted: null };
      } else {
        const w = walk(table, addr);
        if (w.fault) { faults++; totalRefs += w.memRefs; rec = { addr, split: sp, tlbHit: false, walk: w, fault: w.fault, physical: null, frame: null, memRefs: w.memRefs, evicted: null }; }
        else { misses++; totalRefs += w.memRefs + 1; const evicted = tlb.insert(sp.vpn, w.frame); rec = { addr, split: sp, tlbHit: false, walk: w, fault: null, physical: w.physical, frame: w.frame, memRefs: w.memRefs + 1, evicted }; }
      }
      rec.tlb = tlb.snapshot();
      steps.push(rec);
    });
    return { steps, hits, misses, faults, totalMemRefs: totalRefs };
  }

  /** Memory used by the tables, compared with one flat table covering the whole address space. */
  function memory(table) {
    const cfg = table.cfg;
    const perLevel = table.levels.map((nodes, i) => {
      const entries = pow2(cfg.levelBits[i]);
      return { name: (cfg.names && cfg.names[i]) || `Level ${i + 1}`, tables: nodes.length, entriesEach: entries, bytes: nodes.length * entries * cfg.pteBytes };
    });
    const total = perLevel.reduce((s, l) => s + l.bytes, 0);
    const flatEntries = pow2(cfg.vaBits - cfg.offsetBits), flatBytes = flatEntries * cfg.pteBytes;
    return { perLevel, total, flatEntries, flatBytes, savedFraction: 1 - total / flatBytes };
  }

  /** Effective access time with a TLB. A miss costs one memory read per table level plus the data access. */
  const eatWithTLB = ({ hit, tlbNs, memNs, levels }) => hit * (tlbNs + memNs) + (1 - hit) * (tlbNs + levels * memNs + memNs);
  /** How much memory the TLB can map at once. */
  const tlbReach = (entries, pageBytes) => entries * pageBytes;

  // ---------- Ready-made configurations with a small, typical process ----------
  const PRESETS = {
    teach16: {
      label: "Teaching: 16-bit addresses (4 + 4 + 8 bits)",
      cfg: { vaBits: 16, offsetBits: 8, levelBits: [4, 4], pteBytes: 4, names: ["Top-level table", "Second-level table"] },
      physFrames: 64, frameStep: 7, frameBase: 5,
      regions: [{ name: "code", vpn: 0x00, pages: 4 }, { name: "heap", vpn: 0x10, pages: 3 }, { name: "stack", vpn: 0xfe, pages: 2 }],
      examples: [["code", 0x0012], ["heap", 0x1034], ["stack", 0xfe80], ["unmapped (gap)", 0x5000], ["unmapped (in a table that exists)", 0x0412]]
    },
    x86_32: {
      label: "32-bit x86 (10 + 10 + 12 bits, 4 KiB pages)",
      cfg: { vaBits: 32, offsetBits: 12, levelBits: [10, 10], pteBytes: 4, names: ["Page directory", "Page table"] },
      physFrames: 2 ** 20, frameStep: 7, frameBase: 0x100,
      regions: [{ name: "code", vpn: 0x00400, pages: 5 }, { name: "heap", vpn: 0x10000, pages: 4 }, { name: "stack", vpn: 0xbfffd, pages: 3 }],
      examples: [["code", 0x00403004], ["heap", 0x10001a20], ["stack", 0xbffffff0], ["unmapped (gap)", 0x7fff0000], ["unmapped (in a table that exists)", 0x00408000]]
    },
    x86_64: {
      label: "x86-64 (9 + 9 + 9 + 9 + 12 bits, 48-bit addresses)",
      cfg: { vaBits: 48, offsetBits: 12, levelBits: [9, 9, 9, 9], pteBytes: 8, names: ["PML4", "PDPT", "PD", "PT"] },
      physFrames: 2 ** 36, frameStep: 13, frameBase: 0x1000,
      regions: [{ name: "code", vpn: 0x400, pages: 5 }, { name: "heap", vpn: 0x1a2b, pages: 4 }, { name: "shared library", vpn: 0x7f1234560, pages: 6 }, { name: "stack", vpn: 0x7ffc1233e, pages: 3 }],
      examples: [["code", 0x401a30], ["heap", 0x1a2c010], ["shared library", 0x7f1234562abc], ["stack", 0x7ffc12340fff], ["unmapped (gap)", 0x7f0000000000]]
    }
  };

  /** [{vpn, frame, region}] for a preset: frames are spread out so the mapping is not trivially the identity. */
  function presetMappings(name) {
    const p = PRESETS[name]; if (!p) throw new Error(`unknown preset ${name}`);
    let i = 0; const out = [];
    p.regions.forEach((r) => { for (let k = 0; k < r.pages; k++) { out.push({ vpn: r.vpn + k, frame: (p.frameBase + i * p.frameStep) % p.physFrames, region: r.name }); i++; } });
    return out;
  }
  const presetTable = (name) => build(PRESETS[name].cfg, presetMappings(name));

  return { ptPresets: PRESETS, ptValidate: validate, ptSplit: split, ptBuild: build, ptWalk: walk, createTLB, ptRunSequence: runSequence, ptMemory: memory, eatWithTLB, tlbReach, ptPresetMappings: presetMappings, ptPresetTable: presetTable };
});
