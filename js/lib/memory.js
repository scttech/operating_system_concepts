/* Contiguous memory allocation, paging helpers. Pure logic. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OSLib = Object.assign(root.OSLib || {}, api);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  /** blocks: [{start,size,pid|null}] covering memory with no gaps. */
  function allocate(blocks, pid, size, strategy) {
    const holes = blocks.map((b, i) => ({ b, i })).filter((x) => x.b.pid === null && x.b.size >= size);
    if (!holes.length) return { ok: false, blocks };
    let choice = holes[0];
    if (strategy === "best") choice = holes.reduce((m, x) => (x.b.size < m.b.size ? x : m));
    else if (strategy === "worst") choice = holes.reduce((m, x) => (x.b.size > m.b.size ? x : m));
    const out = blocks.map((b) => ({ ...b }));
    const h = out[choice.i];
    if (h.size > size) out.splice(choice.i + 1, 0, { start: h.start + size, size: h.size - size, pid: null });
    h.size = size; h.pid = pid;
    return { ok: true, blocks: out };
  }

  function release(blocks, pid) {
    const out = blocks.map((b) => (b.pid === pid ? { ...b, pid: null } : { ...b }));
    const merged = [];
    out.forEach((b) => {
      const last = merged[merged.length - 1];
      if (last && last.pid === null && b.pid === null) last.size += b.size;
      else merged.push(b);
    });
    return merged;
  }

  function compact(blocks) {
    const used = blocks.filter((b) => b.pid !== null);
    const total = blocks.reduce((s, b) => s + b.size, 0);
    let pos = 0;
    const out = used.map((b) => { const nb = { ...b, start: pos }; pos += b.size; return nb; });
    if (pos < total) out.push({ start: pos, size: total - pos, pid: null });
    return out;
  }

  function fragmentation(blocks) {
    const holes = blocks.filter((b) => b.pid === null).map((b) => b.size);
    const free = holes.reduce((s, x) => s + x, 0), largest = Math.max(0, ...holes);
    return { free, largest, holes: holes.length, external: free ? 1 - largest / free : 0 };
  }

  /** Paging: translate a logical address. pageTable maps page -> frame (or null/undefined if invalid). */
  function translate(addr, pageSize, pageTable) {
    const page = Math.floor(addr / pageSize), offset = addr % pageSize;
    const frame = pageTable[page];
    if (frame === null || frame === undefined) return { page, offset, valid: false };
    return { page, offset, frame, physical: frame * pageSize + offset, valid: true };
  }

  const isPow2 = (n) => n > 0 && (n & (n - 1)) === 0;
  const log2 = (n) => Math.round(Math.log2(n));

  return { allocate, release, compact, fragmentation, translate, isPow2, log2 };
});
