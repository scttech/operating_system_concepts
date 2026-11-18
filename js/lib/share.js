/* Shareable simulation links: a simulation's inputs written into the address (#hash) and read back, safely.
 *
 * A link looks like   pages/x.html#scheduling.algo=RR&scheduling.q=3&scheduling.procs=P1,0,6,2;P2,1,4,1
 * Keys are "<simulation>.<field>". Each simulation declares a spec: for every field, the kind of value it holds and its limits.
 * Reading a link NEVER trusts it: a field is accepted only if its whole value is well-formed and inside its limits (otherwise that
 * field is ignored and the simulation keeps its own value); unknown keys are ignored; oversized links are ignored whole; values are
 * only ever numbers, a short list of known words, or text made of letters, digits, _ and -, so nothing can be markup or code.
 * Pure logic (no DOM), so Node tests can round-trip every field and attack it with malformed links.
 *
 * Field kinds (build them with the helpers below):
 *   int(min, max)                      whole number
 *   num(min, max, decimals)            number with at most `decimals` places
 *   bool()                             true or false
 *   oneOf(values)                      one of a list of words
 *   word(maxLen)                       letters, digits, _ and - only
 *   ints(min, max, minLen, maxLen)     list of whole numbers
 *   table(cols, minRows, maxRows, uniqueCol)  rows of fixed columns; a column is word(..) or int(..); uniqueCol: that column must not repeat
 *   matrix(rows, cols, min, max)       a rows x cols grid of whole numbers
 *   tokens(pattern, maxLen)            list of short commands matching a pattern (for replaying a sequence of actions)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OSLib = Object.assign(root.OSLib || {}, { share: api });
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const MAX_HASH = 4000;      // a link longer than this is ignored entirely
  const MAX_PAIRS = 60;       // so is anything past this many key=value pairs
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // ----- field kinds -----
  const int = (min, max) => ({ k: "int", min, max });
  const num = (min, max, decimals) => ({ k: "num", min, max, decimals: decimals === undefined ? 2 : decimals });
  const bool = () => ({ k: "bool" });
  const oneOf = (values) => ({ k: "oneOf", values: values.map(String) });
  const word = (maxLen) => ({ k: "word", maxLen: maxLen || 8 });
  const ints = (min, max, minLen, maxLen) => ({ k: "ints", min, max, minLen: minLen === undefined ? 1 : minLen, maxLen: maxLen || 60 });
  const table = (cols, minRows, maxRows, uniqueCol) => ({ k: "table", cols, minRows: minRows === undefined ? 1 : minRows, maxRows: maxRows || 20, uniqueCol: uniqueCol === undefined ? -1 : uniqueCol });
  const matrix = (rows, cols, min, max) => ({ k: "matrix", rows, cols, min, max });
  const tokens = (pattern, maxLen) => ({ k: "tokens", pattern, re: new RegExp("^(?:" + pattern + ")$"), maxLen: maxLen || 60 });

  const INT_RE = /^-?[0-9]{1,9}$/, NUM_RE = /^-?[0-9]{1,9}(\.[0-9]{1,6})?$/;
  const inRange = (n, t) => Number.isFinite(n) && n >= t.min && n <= t.max;

  /** The value written by `text`, or undefined if it is not valid for this kind. */
  function decode(t, text) {
    if (typeof text !== "string" || text.length > 1200) return undefined;
    switch (t.k) {
      case "int": { if (!INT_RE.test(text)) return undefined; const n = +text; return inRange(n, t) ? n : undefined; }
      case "num": { if (!NUM_RE.test(text)) return undefined; const n = +text; return inRange(n, t) ? n : undefined; }
      case "bool": return text === "1" ? true : text === "0" ? false : undefined;
      case "oneOf": return t.values.includes(text) ? text : undefined;
      case "word": return new RegExp("^[A-Za-z0-9_-]{1," + t.maxLen + "}$").test(text) ? text : undefined;
      case "ints": {
        const parts = text === "" ? [] : text.split(",");
        if (parts.length < t.minLen || parts.length > t.maxLen) return undefined;
        const out = [];
        for (const p of parts) { const v = decode(int(t.min, t.max), p); if (v === undefined) return undefined; out.push(v); }
        return out;
      }
      case "table": {
        const rows = text === "" ? [] : text.split(";");
        if (rows.length < t.minRows || rows.length > t.maxRows) return undefined;
        const out = [];
        for (const r of rows) {
          const cells = r.split(",");
          if (cells.length !== t.cols.length) return undefined;
          const row = [];
          for (let i = 0; i < cells.length; i++) { const v = decode(t.cols[i], cells[i]); if (v === undefined) return undefined; row.push(v); }
          out.push(row);
        }
        if (t.uniqueCol >= 0 && new Set(out.map((r) => r[t.uniqueCol])).size !== out.length) return undefined;
        return out;
      }
      case "matrix": {
        const rows = text.split(";");
        if (rows.length !== t.rows) return undefined;
        const out = [];
        for (const r of rows) { const v = decode(ints(t.min, t.max, t.cols, t.cols), r); if (v === undefined) return undefined; out.push(v); }
        return out;
      }
      case "tokens": {
        const parts = text === "" ? [] : text.split(",");
        if (parts.length > t.maxLen) return undefined;
        return parts.every((p) => t.re.test(p)) ? parts : undefined;
      }
      default: return undefined;
    }
  }

  /** The text for a value, or null if the value is not valid for this kind (so a link never carries something it could not read back). */
  function encode(t, v) {
    let text = null;
    switch (t.k) {
      case "int": text = Number.isInteger(v) ? String(v) : null; break;
      case "num": text = typeof v === "number" && Number.isFinite(v) ? String(+v.toFixed(t.decimals)) : null; break;
      case "bool": text = v === true ? "1" : v === false ? "0" : null; break;
      case "oneOf": case "word": text = typeof v === "string" || typeof v === "number" ? String(v) : null; break;
      case "ints": text = Array.isArray(v) && v.every(Number.isInteger) ? v.join(",") : null; break;
      case "table": text = Array.isArray(v) && v.every((r) => Array.isArray(r)) ? v.map((r) => r.join(",")).join(";") : null; break;
      case "matrix": text = Array.isArray(v) && v.every((r) => Array.isArray(r)) ? v.map((r) => r.join(",")).join(";") : null; break;
      case "tokens": text = Array.isArray(v) && v.every((x) => typeof x === "string") ? v.join(",") : null; break;
      default: text = null;
    }
    return text !== null && decode(t, text) !== undefined ? text : null;
  }

  /** The "key=value" pairs of a hash (with or without the leading #). Anything malformed, repeated or oversized is dropped. */
  function pairs(hash) {
    const out = Object.create(null);
    let s = typeof hash === "string" ? (hash[0] === "#" ? hash.slice(1) : hash) : "";
    if (!s || s.length > MAX_HASH) return out;
    s.split("&").slice(0, MAX_PAIRS).forEach((p) => {
      const i = p.indexOf("=");
      if (i < 1) return;
      let key, val;
      try { key = decodeURIComponent(p.slice(0, i)); val = decodeURIComponent(p.slice(i + 1)); } catch (e) { return; }
      if (/^[a-z][a-z0-9]*\.[a-z][a-z0-9]*$/i.test(key) && !(key in out)) out[key] = val;
    });
    return out;
  }

  /** The valid fields for simulation `name` in a hash: { state, ignored }, where ignored lists the fields that were present but unusable. */
  function fromHash(name, spec, hash) {
    const all = pairs(hash), state = {}, ignored = [];
    Object.keys(spec).forEach((field) => {
      const key = `${name}.${field}`;
      if (!(key in all)) return;
      const v = decode(spec[field], all[key]);
      if (v === undefined) ignored.push(field); else state[field] = v;
    });
    return { state, ignored };
  }

  /** The hash (without #) for a simulation's state. Fields missing from the state, or not valid for the spec, are left out. */
  function toHash(name, spec, state) {
    const out = [];
    Object.keys(spec).forEach((field) => {
      if (!state || !own(state, field)) return;
      const text = encode(spec[field], state[field]);
      if (text !== null) out.push(`${name}.${field}=${encodeURIComponent(text).replace(/%2C/g, ",").replace(/%3B/g, ";")}`);
    });
    return out.join("&");
  }

  /** A full address for a state: the page's address without its old hash, then the new one. */
  function linkFor(pageUrl, name, spec, state) {
    return String(pageUrl).split("#")[0] + "#" + toHash(name, spec, state);
  }

  return { MAX_HASH, MAX_PAIRS, int, num, bool, oneOf, word, ints, table, matrix, tokens, decode, encode, pairs, fromHash, toHash, linkFor };
});
