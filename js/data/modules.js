/* Module index. To add a module: add an entry here and create modules/<slug>.html */
window.OSData = window.OSData || {};
window.OSData.modules = [
  { n: 1,  slug: "01-fundamentals",     title: "OS Fundamentals & System Calls",
    summary: "What an OS does, kernel vs. user mode, and how a system call crosses the boundary.",
    tags: ["kernel", "syscalls", "structure"] },
  { n: 2,  slug: "02-security",         title: "Security & Access Control",
    summary: "Protection domains, Unix permissions, access-control matrices, ACLs and capabilities.",
    tags: ["permissions", "ACL", "least privilege"] },
  { n: 3,  slug: "03-processes",        title: "Processes",
    summary: "Process states, the PCB, context switches, and fork() process trees.",
    tags: ["states", "fork", "PCB"] },
  { n: 4,  slug: "04-scheduling",       title: "CPU Scheduling",
    summary: "FCFS, SJF, SRTF, Round Robin and Priority scheduling with live Gantt charts.",
    tags: ["Gantt", "turnaround", "quantum"] },
  { n: 5,  slug: "05-threads",          title: "Threads & Parallel Performance",
    summary: "Threads vs. processes, Amdahl's law, and the cost of context switching.",
    tags: ["Amdahl", "speedup", "multicore"] },
  { n: 6,  slug: "06-synchronization",  title: "Process Synchronization",
    summary: "Race conditions, mutual exclusion, semaphores and the bounded-buffer problem.",
    tags: ["race", "mutex", "semaphore"] },
  { n: 7,  slug: "07-deadlocks",        title: "Deadlocks",
    summary: "Coffman conditions, dining philosophers, and Banker's algorithm safety checks.",
    tags: ["Banker's", "prevention", "avoidance"] },
  { n: 8,  slug: "08-memory",           title: "Memory Management",
    summary: "Contiguous allocation, fragmentation, paging and address translation.",
    tags: ["paging", "fragmentation", "MMU"] },
  { n: 9,  slug: "09-virtual-memory",   title: "Virtual Memory",
    summary: "Demand paging, page replacement (FIFO, LRU, OPT, Clock), Belady's anomaly, and EAT.",
    tags: ["page fault", "LRU", "TLB"] },
  { n: 10, slug: "10-disk-io",          title: "Disk Scheduling & I/O",
    summary: "I/O devices, disk geometry and scheduling: FCFS, SSTF, SCAN, C-SCAN, LOOK.",
    tags: ["seek", "SCAN", "DMA"] },
  { n: 11, slug: "11-file-systems",     title: "File Systems",
    summary: "Allocation methods, inodes, indirect blocks and maximum file size.",
    tags: ["inode", "FAT", "allocation"] },
  { n: 12, slug: "12-os-landscape",    title: "Beyond Windows, macOS & Linux",
    summary: "Android, iOS, Qubes, Raspberry Pi, real-time systems and IBM mainframes, with a side-by-side compare tool.",
    tags: ["mobile", "mainframe", "compare"] },
  { n: 13, slug: "13-ipc",               title: "Inter-Process Communication",
    summary: "Pipes, message queues, sockets and shared memory: how isolated processes talk, when each side must wait, and what each choice costs.",
    tags: ["pipe", "sockets", "shared memory"] },
  { n: 14, slug: "14-virtualization",   title: "Virtualization & Containers",
    summary: "Hypervisors and virtual machines, containers built from namespaces and control groups, and what each one really isolates.",
    tags: ["hypervisor", "namespaces", "cgroups"] },
  { n: 15, slug: "15-monitors",         title: "Monitors & Readers–Writers",
    summary: "Condition variables, why a wait belongs in a while loop, and read-write locks with their fairness trade-offs.",
    tags: ["monitor", "condition variable", "starvation"] },
  { n: 16, slug: "16-boot",              title: "The Boot Process",
    summary: "From power-on to a login prompt: firmware, boot loaders, the master boot record, the kernel, init, and the chain of trust.",
    tags: ["BIOS", "UEFI", "init"] },
  { n: 17, slug: "17-advanced-scheduling", title: "Advanced Scheduling",
    summary: "Multilevel feedback queues, real-time scheduling with deadline guarantees (rate-monotonic and EDF), and balancing work across cores.",
    tags: ["MLFQ", "real-time", "multicore"] }
];

/* Parts: the modules grouped by theme, in the order to read them. Module numbers are stable ids (links and quizzes use them),
 * so a part may list numbers out of numeric order. Every module belongs to exactly one part. */
window.OSData.parts = [
  { id: "foundations", title: "Foundations", blurb: "What an operating system is, how it protects itself, and how a machine starts.", modules: [1, 2, 16] },
  { id: "processes", title: "Processes and the CPU", blurb: "Programs in execution, how the CPU is shared among them, and how to use several cores.", modules: [3, 4, 5, 17] },
  { id: "concurrency", title: "Concurrency", blurb: "What goes wrong when activities share data, and the tools that make it safe: locks, monitors, messages and deadlock handling.", modules: [6, 15, 7, 13] },
  { id: "memory", title: "Memory and storage", blurb: "From addresses to pages, to disks and file systems.", modules: [8, 9, 10, 11] },
  { id: "modern", title: "Modern systems", blurb: "Operating systems beyond the desktop, and virtualization and containers.", modules: [12, 14] }
];
/** Module numbers in reading order (part by part). */
window.OSData.readingOrder = window.OSData.parts.flatMap((p) => p.modules);
/** The part a module belongs to, with its position: {part, index (1-based), of}. */
window.OSData.partOf = function (n) {
  const part = window.OSData.parts.find((p) => p.modules.includes(n));
  return part ? { part, number: window.OSData.parts.indexOf(part) + 1, index: part.modules.indexOf(n) + 1, of: part.modules.length } : null;
};
