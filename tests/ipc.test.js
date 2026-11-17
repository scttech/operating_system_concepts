/* Inter-process communication: pipe and message-queue blocking rules, plus conservation properties checked on random operation
 * sequences against a plain-string oracle. */
(function () {
  "use strict";
  const L = typeof require !== "undefined" ? require("../js/lib/ipc.js") : window.OSLib;
  const types = (ev) => ev.map((e) => e.type);

  QUnit.module("IPC");

  QUnit.test("Pipe: bytes fit, writer blocks when full, reader wakes it", (assert) => {
    const c = L.newChannel("pipe", 4);
    assert.deepEqual(types(L.chanWrite(c, "abc")), ["wrote"]);
    const ev = L.chanWrite(c, "defg");
    assert.deepEqual(types(ev), ["wrote", "write-blocked"], "one byte fits, the rest waits");
    assert.deepEqual([ev[0].data, ev[1].remaining], ["d", 3]);
    assert.equal(c.buf.join(""), "abcd");
    assert.deepEqual(types(L.chanWrite(c, "x")), ["busy"], "a sleeping writer cannot write again");
    const r = L.chanRead(c, 2);
    assert.equal(r[0].data, "ab");
    assert.equal(r[1].type, "write-resumed", "reading made room, so the writer continues");
    assert.equal(c.buf.join(""), "cdef");
    assert.equal(c.writerBlocked, "g");
    assert.equal(L.chanRead(c, 10)[0].data, "cdef", "read returns what is there, up to n bytes");
    assert.equal(c.buf.join(""), "g");
    assert.equal(c.writerBlocked, null);
  });

  QUnit.test("Pipe is a byte stream: write boundaries are not preserved", (assert) => {
    const c = L.newChannel("pipe", 64);
    L.chanWrite(c, "hello "); L.chanWrite(c, "world");
    assert.equal(L.chanRead(c, 64)[0].data, "hello world", "two writes arrive as one read");
    L.chanWrite(c, "abcdef");
    assert.equal(L.chanRead(c, 2)[0].data, "ab", "one write can take several reads");
    assert.equal(L.chanRead(c, 2)[0].data, "cd");
  });

  QUnit.test("Reader sleeps on an empty pipe and is woken by a write", (assert) => {
    const c = L.newChannel("pipe", 8);
    assert.deepEqual(types(L.chanRead(c, 5)), ["read-blocked"]);
    assert.deepEqual(types(L.chanRead(c, 5)), ["busy"]);
    const ev = L.chanWrite(c, "hi");
    assert.deepEqual(types(ev), ["wrote", "read"]);
    assert.deepEqual([ev[1].data, ev[1].woke], ["hi", true]);
    assert.equal(c.readerBlocked, null);
    assert.equal(c.buf.length, 0);
  });

  QUnit.test("End of file: only after the write end is closed and the data is drained", (assert) => {
    const c = L.newChannel("pipe", 8);
    L.chanWrite(c, "ab");
    assert.deepEqual(types(L.closeWriteEnd(c)), ["closed"]);
    assert.equal(L.chanRead(c, 1)[0].data, "a");
    assert.equal(L.chanRead(c, 5)[0].data, "b", "data written before the close is still delivered");
    assert.deepEqual(types(L.chanRead(c, 5)), ["eof"], "then the reader sees end of file");
    assert.deepEqual(types(L.chanWrite(c, "z")), ["invalid"], "cannot write to a closed end");
  });

  QUnit.test("Closing the write end wakes a reader that was waiting", (assert) => {
    const c = L.newChannel("pipe", 8);
    L.chanRead(c, 3);
    const ev = L.closeWriteEnd(c);
    assert.deepEqual(types(ev), ["closed", "eof"]);
    assert.true(ev[1].woke);
  });

  QUnit.test("Writing with no reader is a broken pipe, and a sleeping writer is woken with an error", (assert) => {
    const c = L.newChannel("pipe", 2);
    L.closeReadEnd(c);
    assert.deepEqual(types(L.chanWrite(c, "a")), ["broken"]);
    const d = L.newChannel("pipe", 2);
    L.chanWrite(d, "abcd");
    assert.equal(d.writerBlocked, "cd");
    const ev = L.closeReadEnd(d);
    assert.deepEqual(types(ev), ["closed", "broken"]);
    assert.true(ev[1].woke);
    assert.equal(d.writerBlocked, null);
  });

  QUnit.test("Message queue: boundaries are kept, capacity counts messages", (assert) => {
    const c = L.newChannel("queue", 2);
    L.chanWrite(c, "first"); L.chanWrite(c, "second");
    const ev = L.chanWrite(c, "third");
    assert.deepEqual(types(ev), ["write-blocked"], "a third message does not fit");
    assert.equal(L.chanRead(c, 1)[0].data, "first", "one whole message per read, whatever n is");
    assert.deepEqual(c.buf, ["second", "third"], "the blocked writer's message moved in");
    assert.equal(L.chanRead(c, 1)[0].data, "second");
    assert.equal(L.chanRead(c, 1)[0].data, "third");
    assert.deepEqual(types(L.chanRead(c, 1)), ["read-blocked"]);
  });

  QUnit.test("Invalid input is rejected without changing state", (assert) => {
    assert.throws(() => L.newChannel("socket", 4));
    assert.throws(() => L.newChannel("pipe", 0));
    assert.throws(() => L.newChannel("pipe", 2.5));
    const c = L.newChannel("pipe", 4);
    assert.deepEqual(types(L.chanWrite(c, "")), ["invalid"]);
    assert.deepEqual(types(L.chanRead(c, 0)), ["invalid"]);
    assert.deepEqual([c.buf.length, c.readerBlocked, c.writerBlocked], [0, null, null]);
  });

  QUnit.test("Cost model: pipes copy twice per transfer, shared memory does not", (assert) => {
    assert.deepEqual(L.ipcCost("pipe", 1000, 64), { syscalls: 2000, copies: 2000, bytesCopied: 128000, needsSync: false });
    assert.deepEqual(L.ipcCost("socket", 10, 1), { syscalls: 20, copies: 20, bytesCopied: 20, needsSync: false });
    assert.deepEqual(L.ipcCost("shm", 1000000, 4096), { syscalls: 2, copies: 0, bytesCopied: 0, needsSync: true });
    assert.deepEqual(L.ipcCost("queue", 0, 5), { syscalls: 0, copies: 0, bytesCopied: 0, needsSync: false });
    assert.throws(() => L.ipcCost("telepathy", 1, 1));
    assert.throws(() => L.ipcCost("pipe", -1, 1));
  });

  QUnit.test("Random operations on a pipe: nothing is lost, duplicated or reordered, and capacity is never exceeded", (assert) => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let bad = 0, runs = 0;
    for (let trial = 0; trial < 300; trial++) {
      const cap = 1 + Math.floor(rnd() * 8), c = L.newChannel("pipe", cap);
      let accepted = "", got = "", alphabet = 0;
      for (let step = 0; step < 40; step++) {
        const op = rnd();
        if (op < 0.4) {
          const text = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => String.fromCharCode(97 + (alphabet++ % 26))).join("");
          const ev = L.chanWrite(c, text);
          if (ev[0].type === "wrote" || ev[0].type === "write-blocked") accepted += text;
          ev.forEach((e) => { if (e.type === "read") got += e.data; });
        } else if (op < 0.8) {
          L.chanRead(c, 1 + Math.floor(rnd() * 5)).forEach((e) => { if (e.type === "read") got += e.data; });
        } else if (op < 0.9) {
          L.closeWriteEnd(c).forEach((e) => { if (e.type === "read") got += e.data; });
        }
        runs++;
        const held = c.buf.join("") + (c.writerBlocked || "");
        if (got + held !== accepted || c.buf.length > cap) bad++;
        if (c.readerBlocked !== null && c.buf.length > 0) bad++;
        if (c.writerBlocked !== null && c.buf.length < cap) bad++;
      }
    }
    assert.equal(bad, 0, `${runs} steps: bytes read + held = bytes accepted, in order; no sleeper is left asleep when it could run`);
  });
})();
