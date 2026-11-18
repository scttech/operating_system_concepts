/* CSV text for results tables, so students can paste them into a spreadsheet, journal or report. Pure logic.
 * Follows RFC 4180 (commas, double quotes, CRLF line ends). A text cell that a spreadsheet could read as a formula (it starts with
 * = + - @ and is not a plain number) gets a leading apostrophe, so nothing in a table can run as a formula when opened. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OSLib = Object.assign(root.OSLib || {}, api);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const NUMBER = /^[-+]?(\d+(\.\d*)?|\.\d+)(e[-+]?\d+)?%?$/i;

  function csvCell(value) {
    let s = value === null || value === undefined ? "" : String(value);
    if (typeof value !== "number" && /^[=+\-@\t\r]/.test(s) && !NUMBER.test(s.trim())) s = "'" + s;
    return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  /** rows: an array of arrays (the first is usually the header). */
  function toCSV(rows) {
    if (!Array.isArray(rows)) throw new Error("rows must be an array");
    return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + (rows.length ? "\r\n" : "");
  }

  /** A file name that is safe on every system: lower-case letters, digits and dashes, with the extension. */
  function csvFileName(name) {
    const base = String(name || "results").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "results";
    return base + ".csv";
  }

  return { toCSV, csvCell, csvFileName };
});
