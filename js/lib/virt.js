/* Virtualization and containers: pure models behind the Module 14 simulations.
 *   virtStacks / virtKernelCount : which layers each way of running software needs, and how many kernels that means;
 *   isolationMatrix              : what each technology isolates;
 *   nsView / nsNames             : what a process can see, depending on the namespaces it was given;
 *   pidTranslate                 : the same processes under their host and container process IDs;
 *   cgAllocate / oomKill         : CPU shares and caps, and memory limits, as control groups apply them;
 *   vmExits                      : how often a guest must stop and call the hypervisor, for three ways of doing I/O.
 * The counts in vmExits are illustrative teaching numbers, not measurements. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OSLib = Object.assign(root.OSLib || {}, api);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  // ---------- stacks ----------
  // base: layers shared by every unit, bottom to top. unit: layers each application unit has for itself, bottom to top.
  // A layer with kernel:true is an operating-system kernel; the count of kernels is what differs most between the approaches.
  const L = (label, kernel) => ({ label, kernel: !!kernel });
  const virtStacks = {
    bare: { name: "No virtualization", base: [L("Operating system kernel", true)], unit: [L("Libraries"), L("Application")],
      note: "Everything runs directly on one kernel and shares one view of the machine." },
    type2: { name: "Virtual machines on a desktop OS (type 2 hypervisor)", base: [L("Host operating system kernel", true), L("Hypervisor program (VirtualBox, VMware Workstation)")], unit: [L("Guest operating system kernel", true), L("Libraries"), L("Application")],
      note: "The hypervisor is an ordinary program on a normal OS, so every guest request passes through two operating systems." },
    type1: { name: "Virtual machines on a bare-metal hypervisor (type 1)", base: [L("Hypervisor (Xen, ESXi, Hyper-V, KVM in Linux)")], unit: [L("Guest operating system kernel", true), L("Libraries"), L("Application")],
      note: "The hypervisor is the lowest software layer. Each guest believes it owns a whole computer." },
    container: { name: "Containers", base: [L("Operating system kernel", true), L("Container runtime (Docker, containerd, Podman)")], unit: [L("Libraries from the image"), L("Application")],
      note: "All containers share one kernel. Each is an ordinary process with a restricted view of the system." },
    cloud: { name: "Containers inside virtual machines (typical cloud)", base: [L("Hypervisor")], unit: [L("Guest operating system kernel", true), L("Container runtime"), L("Libraries from the image"), L("Application")],
      note: "Each tenant gets a VM for strong isolation, and the tenant's containers share that VM's kernel." }
  };
  /** Number of kernels running when `units` applications are started with the given approach. */
  function virtKernelCount(key, units) {
    const s = virtStacks[key];
    if (!s) throw new Error("unknown stack: " + key);
    if (!Number.isInteger(units) || units < 1) throw new Error("units must be a positive integer");
    return s.base.filter((x) => x.kernel).length + units * s.unit.filter((x) => x.kernel).length;
  }

  // ---------- what is isolated ----------
  const isolationTech = ["process", "container", "vm"];
  const isolationMatrix = [
    { aspect: "Own kernel", process: false, container: false, vm: true, note: "Only a VM runs its own kernel. A kernel bug in a container affects every container on the host." },
    { aspect: "Own view of the file system", process: false, container: true, vm: true, note: "A container sees an image's files as its root; ordinary processes share the host's." },
    { aspect: "Own process IDs", process: false, container: true, vm: true, note: "Inside a container the first process is PID 1." },
    { aspect: "Own network interfaces and ports", process: false, container: true, vm: true, note: "Each container can listen on port 80 without clashing with another." },
    { aspect: "Enforced CPU and memory limits", process: false, container: true, vm: true, note: "Containers use control groups; a VM is given a fixed number of virtual CPUs and an amount of memory." },
    { aspect: "Can run a different operating system", process: false, container: false, vm: true, note: "A Linux container needs a Linux kernel. A Windows VM can run on a Linux host." },
    { aspect: "Starts in about a second or less", process: true, container: true, vm: false, note: "Starting a container is starting a process. A VM boots a kernel (microVMs cut this to roughly a tenth of a second)." },
    { aspect: "Memory cost per instance is small", process: true, container: true, vm: false, note: "Each VM carries its own kernel and caches." }
  ];

  // ---------- namespaces ----------
  const nsNames = [
    { key: "pid", label: "PID", what: "process IDs" },
    { key: "mnt", label: "Mount", what: "the file system tree" },
    { key: "net", label: "Network", what: "interfaces, addresses, ports" },
    { key: "uts", label: "UTS", what: "the host name" },
    { key: "ipc", label: "IPC", what: "System V and POSIX IPC objects" },
    { key: "user", label: "User", what: "user and group IDs" },
    { key: "cgroup", label: "Cgroup", what: "the view of the cgroup tree" }
  ];
  const nsHost = {
    uts: { command: "hostname", out: "laptop" },
    pid: { command: "ps -e", out: "1 systemd\n842 sshd\n1377 firefox\n4123 containerd-shim\n4150 sleep 3600\n4188 ps -e" },
    net: { command: "ip -brief addr", out: "lo      127.0.0.1\neth0    192.168.1.20\nwlan0   192.168.1.21\ndocker0 172.17.0.1" },
    mnt: { command: "ls /", out: "bin  boot  etc  home  usr  var" },
    user: { command: "id", out: "uid=1000(alice) gid=1000(alice)" },
    ipc: { command: "ipcs -m", out: "key 0x1a2b3c4d  owner alice  4096 bytes\nkey 0x00000000  owner bob    8192 bytes" },
    cgroup: { command: "cat /proc/self/cgroup", out: "0::/user.slice/user-1000.slice/session-3.scope" }
  };
  const nsContainer = {
    uts: { command: "hostname", out: "web-1" },
    pid: { command: "ps -e", out: "1 sleep 3600\n7 ps -e" },
    net: { command: "ip -brief addr", out: "lo   127.0.0.1\neth0 172.17.0.2" },
    mnt: { command: "ls /", out: "app  bin  etc  lib  usr" },
    user: { command: "id", out: "uid=0(root) gid=0(root)   (host sees uid 100000)" },
    ipc: { command: "ipcs -m", out: "(none)" },
    cgroup: { command: "cat /proc/self/cgroup", out: "0::/" }
  };
  /** What each probe command prints for a process that was given the namespaces in `flags` (an object such as {pid:true}). */
  function nsView(flags) {
    const f = flags || {};
    return nsNames.map((n) => {
      const isolated = !!f[n.key], src = isolated ? nsContainer[n.key] : nsHost[n.key];
      return { ns: n.key, label: n.label, command: src.command, output: src.out, isolated };
    });
  }
  /** Give every process in `hostPids` its number inside a new PID namespace: the first becomes 1, the others follow in order. */
  function pidTranslate(hostPids) {
    if (!Array.isArray(hostPids) || hostPids.some((p) => !Number.isInteger(p) || p < 1) || new Set(hostPids).size !== hostPids.length) throw new Error("host PIDs must be distinct positive integers");
    return hostPids.map((host, i) => ({ host, inside: i + 1 }));
  }

  // ---------- control groups ----------
  /**
   * Share `cpus` cores among groups. Each group has a weight (cpu.weight), a demand in cores, and an optional cap in cores (cpu.max).
   * A group never gets more than min(demand, cap). Spare capacity is shared by weight (work-conserving "water filling").
   * Returns [{name, alloc, limit, state}] where state is "satisfied", "capped" (held back by its cap) or "squeezed" (held back by contention).
   */
  function cgAllocate(groups, cpus) {
    if (!(cpus > 0)) throw new Error("cpus must be positive");
    groups.forEach((g) => { if (!(g.weight > 0) || !(g.demand >= 0) || (g.cap !== null && g.cap !== undefined && !(g.cap >= 0))) throw new Error("bad group " + g.name); });
    const limit = groups.map((g) => Math.min(g.demand, g.cap === null || g.cap === undefined ? Infinity : g.cap));
    const alloc = groups.map(() => 0), done = groups.map((_, i) => limit[i] <= 0);
    let left = cpus;
    for (;;) {
      const open = groups.map((_, i) => i).filter((i) => !done[i]);
      if (!open.length || left <= 1e-12) break;
      const wsum = open.reduce((s, i) => s + groups[i].weight, 0);
      const full = open.filter((i) => limit[i] - alloc[i] <= (left * groups[i].weight) / wsum + 1e-12);
      if (!full.length) { open.forEach((i) => { alloc[i] += (left * groups[i].weight) / wsum; }); left = 0; break; }
      full.forEach((i) => { left -= limit[i] - alloc[i]; alloc[i] = limit[i]; done[i] = true; });
    }
    return groups.map((g, i) => ({ name: g.name, alloc: alloc[i], limit: limit[i], demand: g.demand,
      state: alloc[i] >= g.demand - 1e-9 ? "satisfied" : limit[i] < g.demand - 1e-9 && alloc[i] >= limit[i] - 1e-9 ? "capped" : "squeezed" }));
  }
  /**
   * A memory limit on a group (memory.max). If the group's processes use more than the limit and nothing can be reclaimed, the kernel
   * kills processes inside that group, largest first, until the rest fit. Processes outside the group are never touched.
   */
  function oomKill(procs, limit) {
    if (!(limit >= 0) || procs.some((p) => !(p.mib >= 0))) throw new Error("bad input");
    const alive = procs.slice(), killed = [];
    let total = alive.reduce((s, p) => s + p.mib, 0);
    while (total > limit && alive.length) {
      let big = 0;
      alive.forEach((p, i) => { if (p.mib > alive[big].mib) big = i; });
      const [v] = alive.splice(big, 1);
      killed.push(v.name); total -= v.mib;
    }
    return { killed, remaining: alive.map((p) => p.name), total };
  }

  // ---------- VM exits ----------
  const vmModes = { emulated: "Emulated device (the guest drives a pretend hardware NIC)", virtio: "Paravirtual device (virtio: guest and host share queues)", passthrough: "Device passthrough (the guest owns a real device slice)" };
  const EMULATED_EXITS_PER_PACKET = 7; // illustrative: about six register accesses plus one interrupt acknowledgement
  /** Exits taken to send `packets` packets, `batch` packets at a time for virtio, where each exit costs `exitCycles` cycles. */
  function vmExits(packets, batch, mode, exitCycles) {
    if (!vmModes[mode]) throw new Error("unknown mode: " + mode);
    if (!Number.isInteger(packets) || packets < 0 || !Number.isInteger(batch) || batch < 1 || !(exitCycles >= 0)) throw new Error("bad input");
    const exits = mode === "emulated" ? packets * EMULATED_EXITS_PER_PACKET : mode === "virtio" ? 2 * Math.ceil(packets / batch) : 0;
    return { exits, cycles: exits * exitCycles, perPacket: packets ? (exits * exitCycles) / packets : 0 };
  }

  return { virtStacks, virtKernelCount, isolationTech, isolationMatrix, nsNames, nsView, pidTranslate, cgAllocate, oomKill, vmModes, vmExits, EMULATED_EXITS_PER_PACKET };
});
