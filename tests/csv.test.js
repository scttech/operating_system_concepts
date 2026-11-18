/* CSV export of results tables: quoting rules and protection against spreadsheet formulas. */
(function () {
  "use strict";
  const L = typeof require !== "undefined" ? require("../js/lib/csv.js") : window.OSLib;

  QUnit.module("CSV export");

  QUnit.test("Plain values, numbers and line endings", (assert) => {
    assert.equal(L.toCSV([["Process", "Waiting"], ["P1", 3], ["P2", 4.5]]), "Process,Waiting\r\nP1,3\r\nP2,4.5\r\n");
    assert.equal(L.toCSV([]), "");
    assert.equal(L.toCSV([[null, undefined, 0, false]]), ",,0,false\r\n");
    assert.throws(() => L.toCSV("no"));
  });

  QUnit.test("Commas, quotes, newlines and edge spaces are quoted", (assert) => {
    assert.equal(L.csvCell("a,b"), '"a,b"');
    assert.equal(L.csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(L.csvCell("two\nlines"), '"two\nlines"');
    assert.equal(L.csvCell(" padded"), '" padded"');
    assert.equal(L.csvCell("plain text"), "plain text");
  });

  QUnit.test("Anything that could run as a spreadsheet formula is defused, but real numbers are left alone", (assert) => {
    ["=1+1", "+cmd|' /C calc'!A0", "@SUM(A1)", "-2+3", "=HYPERLINK(\"http://x\")"].forEach((v) => assert.ok(L.csvCell(v).replace(/^"/, "").startsWith("'"), `${v} is prefixed`));
    ["-3", "-0.5", "+7", "12%", "1e5", " -4 "].forEach((v) => assert.false(L.csvCell(v).includes("'"), `${v} is a number`));
    assert.equal(L.csvCell(-3), "-3", "an actual negative number");
    assert.equal(L.csvCell("P1 → P2"), "P1 → P2", "Unicode passes through");
  });

  QUnit.test("File names are safe", (assert) => {
    assert.equal(L.csvFileName("Scheduling results"), "scheduling-results.csv");
    assert.equal(L.csvFileName("../../etc/passwd"), "etc-passwd.csv");
    assert.equal(L.csvFileName(""), "results.csv");
    assert.equal(L.csvFileName("!!!"), "results.csv");
    assert.ok(L.csvFileName("x".repeat(200)).length <= 64);
  });
})();
