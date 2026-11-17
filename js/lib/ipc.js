/* Inter-process communication models. Pure logic, no DOM.
 *   - channel: the kernel-side buffer behind a pipe (a stream of bytes) or a message queue (whole messages), with the
 *     blocking, end-of-file and broken-pipe rules that real systems apply;
 *   - ipcCost: a simple count of system calls and data copies per mechanism. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OSLib = Object.assign(root.OSLib || {}, api);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  /**
   * A channel between one writer and one reader.
   *   kind "pipe":  capacity is in bytes; reads take up to n bytes, whatever the sizes of the writes were.
   *   kind "queue": capacity is in messages; every read returns exactly one whole message.
   * A process that has to wait is recorded (writerBlocked holds what it still wants to write, readerBlocked the size it asked for),
   * and is woken automatically by the operation that makes progress possible.
   */
  function newChannel(kind, capacity) {
    if (kind !== "pipe" && kind !== "queue") throw new Error("kind must be 'pipe' or 'queue'");
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error("capacity must be a positive integer");
    return { kind, capacity, buf: [], readOpen: true, writeOpen: true, writerBlocked: null, readerBlocked: null, totalAccepted: 0, totalRead: 0 };
  }

  const used = (c) => c.buf.length;
  const room = (c) => c.capacity - c.buf.length;

  /** Move as much of the blocked writer's data as now fits. Returns events. */
  function resumeWriter(c) {
    if (c.writerBlocked === null) return [];
    if (c.kind === "queue") {
      if (room(c) < 1) return [];
      const m = c.writerBlocked;
      c.buf.push(m); c.totalAccepted += 1; c.writerBlocked = null;
      return [{ type: "write-resumed", data: m, n: 1 }];
    }
    const take = c.writerBlocked.slice(0, room(c));
    if (!take) return [];
    c.buf.push(...take); c.totalAccepted += take.length;
    c.writerBlocked = c.writerBlocked.slice(take.length) || null;
    return [{ type: "write-resumed", data: take, n: take.length, done: c.writerBlocked === null }];
  }

  /** Take data out for a reader that asked for n bytes (n is ignored for queues). */
  function take(c, n) {
    if (c.kind === "queue") { c.totalRead += 1; return c.buf.shift(); }
    const data = c.buf.splice(0, n).join("");
    c.totalRead += data.length;
    return data;
  }

  /** If a reader is asleep and there is something for it (or end of file), let it complete. */
  function serveReader(c) {
    if (c.readerBlocked === null) return [];
    if (used(c) > 0) {
      const data = take(c, c.readerBlocked);
      c.readerBlocked = null;
      return [{ type: "read", data, woke: true }, ...resumeWriter(c)];
    }
    if (!c.writeOpen && c.writerBlocked === null) { c.readerBlocked = null; return [{ type: "eof", woke: true }]; }
    return [];
  }

  /** The writer calls write(text). Returns a list of events describing what happened. */
  function chanWrite(c, text) {
    if (!c.readOpen) return [{ type: "broken", note: "no process can read this channel any more: the writer gets SIGPIPE / EPIPE" }];
    if (!c.writeOpen) return [{ type: "invalid", note: "the write end is already closed" }];
    if (c.writerBlocked !== null) return [{ type: "busy", note: "the writer is asleep inside an earlier write" }];
    if (typeof text !== "string" || text.length === 0) return [{ type: "invalid", note: "nothing to write" }];
    let ev;
    if (c.kind === "queue") {
      if (room(c) >= 1) { c.buf.push(text); c.totalAccepted += 1; ev = [{ type: "wrote", data: text, n: 1 }]; }
      else { c.writerBlocked = text; ev = [{ type: "write-blocked", remaining: 1 }]; }
    } else {
      const part = text.slice(0, room(c)), rest = text.slice(part.length);
      c.buf.push(...part); c.totalAccepted += part.length;
      ev = part ? [{ type: "wrote", data: part, n: part.length }] : [];
      if (rest) { c.writerBlocked = rest; ev.push({ type: "write-blocked", remaining: rest.length }); }
    }
    return ev.concat(serveReader(c));
  }

  /** The reader calls read(n). */
  function chanRead(c, n) {
    if (!c.readOpen) return [{ type: "invalid", note: "the read end is already closed" }];
    if (c.readerBlocked !== null) return [{ type: "busy", note: "the reader is already asleep inside a read" }];
    if (c.kind === "pipe" && (!Number.isInteger(n) || n < 1)) return [{ type: "invalid", note: "read at least one byte" }];
    if (used(c) > 0) { const data = take(c, n); return [{ type: "read", data }, ...resumeWriter(c)]; }
    if (!c.writeOpen && c.writerBlocked === null) return [{ type: "eof" }];
    c.readerBlocked = n;
    return [{ type: "read-blocked" }];
  }

  /** The writer closes its end. A reader that is asleep on an empty channel now sees end of file. */
  function closeWriteEnd(c) {
    if (!c.writeOpen) return [{ type: "invalid", note: "already closed" }];
    if (c.writerBlocked !== null) return [{ type: "busy", note: "the writer is asleep inside a write" }];
    c.writeOpen = false;
    return [{ type: "closed", end: "write" }, ...serveReader(c)];
  }

  /** The reader closes its end. A writer that is asleep waiting for room is woken with an error. */
  function closeReadEnd(c) {
    if (!c.readOpen) return [{ type: "invalid", note: "already closed" }];
    if (c.readerBlocked !== null) return [{ type: "busy", note: "the reader is asleep inside a read" }];
    c.readOpen = false;
    const ev = [{ type: "closed", end: "read" }];
    if (c.writerBlocked !== null) { c.writerBlocked = null; ev.push({ type: "broken", woke: true, note: "the sleeping writer is woken with an error (SIGPIPE / EPIPE)" }); }
    return ev;
  }

  /**
   * Rough cost of moving `transfers` messages of `bytes` bytes each between two processes on one machine.
   * Counts only the common case: the kernel copies data in and out of its own buffer for pipes, queues and sockets, while shared
   * memory is mapped into both processes once and then needs no system call or copy per transfer (but the processes must
   * synchronize themselves, for example with a semaphore).
   */
  const ipcMechanisms = ["pipe", "queue", "socket", "shm"];
  function ipcCost(mech, transfers, bytes) {
    if (!ipcMechanisms.includes(mech)) throw new Error("unknown mechanism: " + mech);
    if (!Number.isInteger(transfers) || transfers < 0 || !Number.isInteger(bytes) || bytes < 0) throw new Error("transfers and bytes must be non-negative integers");
    if (mech === "shm") return { syscalls: 2, copies: 0, bytesCopied: 0, needsSync: true };
    return { syscalls: 2 * transfers, copies: 2 * transfers, bytesCopied: 2 * transfers * bytes, needsSync: false };
  }

  return { newChannel, chanWrite, chanRead, closeWriteEnd, closeReadEnd, ipcCost, ipcMechanisms };
});
