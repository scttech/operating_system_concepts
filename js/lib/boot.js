/* The boot process: pure models behind the Module 4 simulations.
 *   bootStages / bootRun : the sequence from power-on to a login prompt for BIOS, UEFI and UEFI with Secure Boot, and where an injected failure stops it;
 *   mbrBuild / mbrParse  : the classic 512-byte master boot record (boot code, four partition entries, signature 0x55AA);
 *   bootOrder            : starting services in dependency order, as init systems do, with the parallel schedule and critical path;
 *   bootChain / verifyChain : Secure Boot's chain of trust. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OSLib = Object.assign(root.OSLib || {}, api);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  // ---------- the stages ----------
  const S = (id, actor, title, where, mode, text) => ({ id, actor, title, where, mode, text });
  const common = [
    S("kernel-load", "Boot loader", "Load the kernel and the initial RAM disk", "Disk, then main memory", "64-bit (long) mode", "The loader reads the kernel image and a small initial file system (initramfs) into memory, builds the kernel command line (for example root=/dev/sda2) and jumps to the kernel."),
    S("kernel-start", "Kernel", "The kernel takes over", "Main memory", "64-bit (long) mode", "The kernel sets up its own page tables and interrupt handlers, finds the memory and CPUs, starts the scheduler and initializes drivers. From here on, nothing from the firmware is needed."),
    S("initramfs", "Kernel + initramfs", "Find and mount the root file system", "RAM disk, then the real disk", "Kernel mode", "The disk drivers and file-system code may live on the real disk, so a small temporary file system in RAM supplies them. Once the real root file system is mounted, the temporary one is discarded."),
    S("init", "init (PID 1)", "Start user space", "Root file system", "User mode", "The kernel starts one program, PID 1 (systemd, for example). It starts services in dependency order, in parallel where it can, and every other process descends from it."),
    S("login", "Services", "A login prompt or desktop appears", "User space", "User mode", "The machine is up. Everything from here on is ordinary processes.")
  ];
  const bootStages = {
    bios: { name: "Legacy BIOS with an MBR disk", stages: [
      S("power", "Hardware", "Power on and reset", "CPU reset vector", "16-bit real mode", "The CPU starts in its oldest, simplest mode and jumps to a fixed address inside the firmware chip."),
      S("post", "Firmware (BIOS)", "Power-on self-test (POST)", "Firmware chip", "16-bit real mode", "The firmware checks and initializes memory, the keyboard, the display and the disk controllers, then picks a boot device from its list."),
      S("mbr", "Firmware (BIOS)", "Read the boot sector", "Disk sector 0 → memory at 0x7C00", "16-bit real mode", "The BIOS reads the first 512-byte sector of the boot disk into memory and checks that its last two bytes are 0x55 0xAA. If they are not, it tries the next device."),
      S("stage1", "Boot loader (stage 1)", "Run the 446 bytes of boot code", "Memory at 0x7C00", "16-bit real mode", "That sector holds only 446 bytes of code, which is too little to understand a file system. It just finds the next piece and loads it."),
      S("loader", "Boot loader (GRUB)", "Load the full boot loader and show a menu", "The gap after the MBR, or /boot", "16-bit → 32-bit protected mode", "The larger part of the loader understands file systems. It reads its configuration, lets you choose an entry, and switches the CPU into a modern mode."),
      ...common] },
    uefi: { name: "UEFI with a GPT disk", stages: [
      S("power", "Hardware", "Power on and reset", "CPU reset vector", "Firmware's own mode", "The CPU starts at a fixed address inside the firmware flash."),
      S("firmware", "Firmware (UEFI)", "Initialize the platform", "Firmware flash", "64-bit mode", "UEFI firmware is a small operating system of its own: it initializes the hardware, loads drivers (including file-system drivers) and reads its settings from non-volatile memory."),
      S("esp", "Firmware (UEFI)", "Find the EFI System Partition", "GPT partition table on disk", "64-bit mode", "The firmware reads the GPT, finds the EFI System Partition (a small FAT file system) and looks for the boot loader program named in its boot entries."),
      S("loader", "Boot loader (GRUB, systemd-boot, Windows Boot Manager)", "Run the boot loader as an EFI program", "ESP, for example EFI/BOOT/BOOTX64.EFI", "64-bit mode", "The loader is an ordinary program in the PE executable format. Because the firmware can read the file system, it needs no 446-byte tricks."),
      ...common] },
    secure: { name: "UEFI with Secure Boot", stages: [
      S("power", "Hardware", "Power on and reset", "CPU reset vector", "Firmware's own mode", "The CPU starts at a fixed address inside the firmware flash, which is the root of trust: it cannot be modified by the operating system."),
      S("firmware", "Firmware (UEFI)", "Initialize the platform", "Firmware flash", "64-bit mode", "The firmware initializes the hardware and loads the Secure Boot keys it trusts (the db) and the keys it forbids (the dbx)."),
      S("esp", "Firmware (UEFI)", "Find the EFI System Partition", "GPT partition table on disk", "64-bit mode", "The firmware finds the boot loader program on the EFI System Partition."),
      S("verify-loader", "Firmware (UEFI)", "Verify the boot loader's signature", "Firmware, using its trusted keys", "64-bit mode", "Before running anything from disk, the firmware checks the program's digital signature against its trusted keys. Unsigned or modified code is refused."),
      S("loader", "Boot loader (often via a small signed shim)", "Run the verified boot loader", "ESP", "64-bit mode", "The shim, signed by a key the firmware trusts, verifies the next stage with the distribution's own key."),
      S("verify-kernel", "Boot loader", "Verify the kernel's signature", "Boot loader, using the distribution's key", "64-bit mode", "The loader checks the kernel image before running it. The chain of trust continues: each stage verifies the next before handing over control."),
      ...common] }
  };

  // what each failure does, and the stage where it strikes
  const bootFailures = {
    none: { label: "No failure", at: {} },
    nosig: { label: "Boot sector / boot partition is missing or damaged", at: { bios: "mbr", uefi: "esp", secure: "esp" },
      message: { bios: "“Missing operating system” or “No bootable device”. The signature bytes were not 0x55AA, so the BIOS skipped the disk.", uefi: "“No bootable device”. The firmware found no EFI System Partition with a boot loader on it.", secure: "“No bootable device”. The firmware found no EFI System Partition with a boot loader on it." }, outcome: "halted" },
    unsigned: { label: "A modified or unsigned boot loader", at: { secure: "verify-loader" },
      message: { secure: "“Security Violation”. The firmware refused to run code whose signature it could not verify, so the tampered loader never executed." }, outcome: "halted" },
    nokernel: { label: "The kernel file is missing", at: { bios: "kernel-load", uefi: "kernel-load", secure: "kernel-load" },
      message: { bios: "The boot loader prints an error such as “file not found” and drops to its prompt.", uefi: "The boot loader prints an error such as “file not found” and drops to its prompt.", secure: "The boot loader prints an error such as “file not found” and drops to its prompt." }, outcome: "halted" },
    noroot: { label: "The kernel cannot find its root file system", at: { bios: "initramfs", uefi: "initramfs", secure: "initramfs" },
      message: { bios: "“Kernel panic: unable to mount root fs”. The kernel is running, but without a root file system it has no PID 1 to start.", uefi: "“Kernel panic: unable to mount root fs”. The kernel is running, but without a root file system it has no PID 1 to start.", secure: "“Kernel panic: unable to mount root fs”. The kernel is running, but without a root file system it has no PID 1 to start." }, outcome: "halted" },
    service: { label: "A required service fails to start", at: { bios: "init", uefi: "init", secure: "init" },
      message: { bios: "The init system marks the boot degraded and drops to an emergency shell. The kernel and PID 1 are fine; one service is not.", uefi: "The init system marks the boot degraded and drops to an emergency shell. The kernel and PID 1 are fine; one service is not.", secure: "The init system marks the boot degraded and drops to an emergency shell. The kernel and PID 1 are fine; one service is not." }, outcome: "recovery" }
  };

  /** Walk the boot of `kind` ("bios", "uefi" or "secure") with an optional failure. A failure that does not apply (for example an unsigned loader without Secure Boot) changes nothing. */
  function bootRun(kind, failure) {
    const b = bootStages[kind], f = bootFailures[failure || "none"];
    if (!b) throw new Error("unknown firmware: " + kind);
    if (!f) throw new Error("unknown failure: " + failure);
    const stopAt = f.at[kind];
    const idx = stopAt ? b.stages.findIndex((s) => s.id === stopAt) : -1;
    if (idx < 0) return { kind, steps: b.stages, failedAt: null, outcome: "booted", message: "The system booted: user space is running." };
    return { kind, steps: b.stages.slice(0, idx + 1), failedAt: stopAt, outcome: f.outcome, message: f.message[kind] };
  }

  // ---------- master boot record ----------
  const MBR_TYPES = { 0x00: "empty", 0x05: "Extended", 0x07: "NTFS / exFAT", 0x0b: "FAT32", 0x0c: "FAT32 (LBA)", 0x82: "Linux swap", 0x83: "Linux", 0xee: "GPT protective", 0xef: "EFI System" };
  const mbrTypeName = (t) => MBR_TYPES[t] || "unknown";
  const le32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  const put32 = (b, o, v) => { b[o] = v & 255; b[o + 1] = (v >>> 8) & 255; b[o + 2] = (v >>> 16) & 255; b[o + 3] = (v >>> 24) & 255; };

  /** Build a 512-byte sector. parts: up to four {active, type, start, sectors} (start and sectors in 512-byte sectors). */
  function mbrBuild(parts, bootCodeFill) {
    if (parts.length > 4) throw new Error("an MBR holds at most four partitions");
    const b = new Uint8Array(512);
    b.fill(bootCodeFill === undefined ? 0 : bootCodeFill, 0, 446);
    parts.forEach((p, i) => {
      if (!Number.isInteger(p.start) || !Number.isInteger(p.sectors) || p.start < 0 || p.sectors < 0 || p.start > 0xffffffff || p.sectors > 0xffffffff || p.type < 0 || p.type > 255) throw new Error("bad partition");
      const o = 446 + 16 * i;
      b[o] = p.active ? 0x80 : 0;
      b[o + 1] = 0xfe; b[o + 2] = 0xff; b[o + 3] = 0xff;           // CHS start: "too large to express", so use the LBA fields
      b[o + 4] = p.type;
      b[o + 5] = 0xfe; b[o + 6] = 0xff; b[o + 7] = 0xff;           // CHS end
      put32(b, o + 8, p.start);
      put32(b, o + 12, p.sectors);
    });
    b[510] = 0x55; b[511] = 0xaa;
    return b;
  }
  /** Read the sector back: signature check and the four entries. */
  function mbrParse(b) {
    if (!b || b.length !== 512) throw new Error("a sector is 512 bytes");
    const partitions = [0, 1, 2, 3].map((i) => {
      const o = 446 + 16 * i, type = b[o + 4], sectors = le32(b, o + 12);
      return { index: i + 1, active: b[o] === 0x80, type, typeName: mbrTypeName(type), start: le32(b, o + 8), sectors, used: type !== 0 || sectors !== 0 };
    });
    return { valid: b[510] === 0x55 && b[511] === 0xaa, partitions };
  }
  const hex2 = (n) => n.toString(16).padStart(2, "0");
  /** The lines the C and Python examples print for a parsed sector. */
  function mbrLines(m) {
    const out = [m.valid ? "boot signature (bytes 510-511): 0x55AA, valid" : "boot signature (bytes 510-511): not 0x55AA, invalid"];
    m.partitions.forEach((p) => {
      if (!p.used) { out.push(`partition ${p.index}: unused`); return; }
      out.push(`partition ${p.index}: ${(p.active ? "active" : "idle").padEnd(6)} type 0x${hex2(p.type)} ${p.typeName.padEnd(14)} start LBA ${String(p.start).padEnd(8)} size ${Math.floor(p.sectors / 2048)} MiB`);
    });
    const first = m.partitions.find((p) => p.used);
    if (first) out.push(`the first partition starts at byte ${first.start * 512} (${Math.floor((first.start * 512) / 1048576)} MiB), aligned to 1 MiB: ${(first.start * 512) % 1048576 === 0 ? "True" : "False"}`);
    return out;
  }

  // ---------- service start order ----------
  /**
   * units: [{name, dur, after: [names]}]. Each unit starts as soon as every unit it comes after has finished, so independent units
   * start together. Returns the schedule, total time, serial time and the critical path; or {cycle} if the units wait for each other forever.
   */
  function bootOrder(units) {
    const byName = new Map(units.map((u) => [u.name, u]));
    if (byName.size !== units.length) throw new Error("unit names must be unique");
    units.forEach((u) => { if (!(u.dur > 0)) throw new Error("bad duration for " + u.name); u.after.forEach((d) => { if (!byName.has(d)) throw new Error(`${u.name} comes after unknown unit ${d}`); }); });
    const start = new Map(), end = new Map(), via = new Map();
    let left = units.slice();
    while (left.length) {
      const ready = left.filter((u) => u.after.every((d) => end.has(d)));
      if (!ready.length) return { cycle: left.map((u) => u.name).sort() };
      ready.forEach((u) => {
        let s = 0, from = null;
        u.after.forEach((d) => { if (end.get(d) > s || (end.get(d) === s && from === null)) { s = end.get(d); from = d; } });
        start.set(u.name, s); end.set(u.name, s + u.dur); via.set(u.name, from);
      });
      left = left.filter((u) => !end.has(u.name));
    }
    const schedule = units.map((u) => ({ name: u.name, start: start.get(u.name), end: end.get(u.name), dur: u.dur, after: u.after.slice() }))
      .sort((a, b) => a.start - b.start || (a.name < b.name ? -1 : 1));
    const total = Math.max(...schedule.map((s) => s.end));
    let tail = schedule.filter((s) => s.end === total).map((s) => s.name).sort()[0];
    const critical = [];
    for (let n = tail; n; n = via.get(n)) critical.unshift(n);
    return { schedule, total, serial: units.reduce((s, u) => s + u.dur, 0), critical };
  }

  // ---------- chain of trust ----------
  const bootChain = [
    { name: "Firmware", signedBy: null, role: "Holds the trusted public keys in write-protected storage. This is the root of trust." },
    { name: "Boot loader (shim)", signedBy: "Firmware", role: "Signed by a certificate authority whose key the firmware trusts." },
    { name: "Boot loader (GRUB)", signedBy: "Boot loader (shim)", role: "Verified by the shim with the distribution's key." },
    { name: "Kernel", signedBy: "Boot loader (GRUB)", role: "Verified by the boot loader before it jumps to it." },
    { name: "Kernel modules (drivers)", signedBy: "Kernel", role: "Verified by the kernel before it loads each driver." }
  ];
  /** tampered: a set or array of component names whose files were changed. Each link is checked by the one before it, so the first tampered link is where trust breaks. */
  function verifyChain(tampered) {
    const bad = new Set(tampered || []);
    const verified = [];
    for (const c of bootChain) {
      if (c.signedBy !== null && bad.has(c.name)) return { verified, failedAt: c.name, refused: bootChain.slice(bootChain.indexOf(c)).map((x) => x.name) };
      verified.push(c.name);
    }
    return { verified, failedAt: null, refused: [] };
  }

  return { bootStages, bootFailures, bootRun, MBR_TYPES, mbrBuild, mbrParse, mbrLines, bootOrder, bootChain, verifyChain };
});
