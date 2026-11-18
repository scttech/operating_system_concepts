/* Study aids for each module: what you should be able to do afterwards, the ideas to take away, and free further reading.
 *   objectives: skills, phrased as things you can check yourself against;
 *   takeaways : the few ideas worth remembering;
 *   reading   : [title, url, what it is]. Every link is free to read online. Add more by appending to the module's list. */
window.OSData = window.OSData || {};
(function () {
  "use strict";
  const OSTEP = (file, title) => [`OSTEP: ${title}`, `https://pages.cs.wisc.edu/~remzi/OSTEP/${file}.pdf`, "free textbook chapter (Operating Systems: Three Easy Pieces)"];
  const MAN = (section, name, what) => [`${name}(${section}) manual page`, `https://man7.org/linux/man-pages/man${section}/${name}.${section}.html`, what || "Linux manual page"];
  const DOCS = (path, title, what) => [title, `https://docs.kernel.org/${path}`, what || "Linux kernel documentation"];
  const PY = (mod, what) => [`Python: the ${mod} module`, `https://docs.python.org/3/library/${mod}.html`, what || "Python documentation"];

  window.OSData.study = {
    1: {
      objectives: [
        "Name the main jobs of an operating system: sharing the hardware, hiding its details, and protecting programs from each other.",
        "Explain why the CPU has user and kernel modes, and what the only ways into kernel mode are.",
        "Tell an interrupt, a trap and an exception apart, with an example of each.",
        "Trace what happens, step by step, when a program makes a system call, and say why batching I/O is cheaper."
      ],
      takeaways: [
        "The kernel is the part of the OS that runs with full privilege. Everything else, including the shell, is an ordinary program.",
        "A program cannot jump into the kernel. It can only use entry points the hardware and kernel agreed on: interrupts, exceptions and traps.",
        "A system call costs a mode switch plus argument checking, which is why library buffering (printf, stdio) exists."
      ],
      reading: [OSTEP("intro", "Introduction to Operating Systems"), OSTEP("cpu-mechanisms", "Limited Direct Execution (modes, traps, system calls)"), MAN(2, "syscalls", "the full list of Linux system calls")]
    },
    2: {
      objectives: [
        "State the goals of protection and security, and the principle of least privilege.",
        "Read and compute Unix permission bits in octal and symbolic form, including the effect of a umask.",
        "Read an access-control matrix by rows (capabilities) and by columns (access-control lists).",
        "Match common attacks to the defenses that address them."
      ],
      takeaways: [
        "Permissions are checked by the kernel on every access, so they hold even if a program is buggy or malicious.",
        "Every process runs on behalf of a user, so the damage a compromised program can do is limited by that user's rights.",
        "Least privilege: give each program and user only what the job needs, and nothing more."
      ],
      reading: [OSTEP("security-intro", "Security"), MAN(7, "credentials", "users, groups and process identity on Linux"), MAN(7, "capabilities", "how Linux splits root's power into pieces")]
    },
    3: {
      objectives: [
        "List what a process contains and what the kernel keeps about it (the process control block).",
        "Draw the process state diagram and explain what causes each transition.",
        "Describe what fork, exec and wait do, and draw the process tree for a small program with several fork calls.",
        "Explain what happens during a context switch and why it is pure overhead."
      ],
      takeaways: [
        "A process is a program in execution: its own address space, registers, open files and state.",
        "fork copies a process; exec replaces its program. Keeping them separate is what lets a shell set up a child before it runs.",
        "A child that has exited stays as a zombie until its parent waits for it."
      ],
      reading: [OSTEP("cpu-intro", "The Abstraction: The Process"), OSTEP("cpu-api", "Interlude: Process API"), MAN(2, "fork"), MAN(2, "execve"), MAN(2, "wait")]
    },
    4: {
      objectives: [
        "Define turnaround time, waiting time and response time, and compute them from a schedule.",
        "Simulate FCFS, SJF, SRTF, Round Robin and priority scheduling by hand for a small set of processes.",
        "Explain the effect of the time quantum on Round Robin, and the convoy effect on FCFS.",
        "Say why no single scheduling algorithm is best for every goal."
      ],
      takeaways: [
        "Shortest-job-first minimizes average waiting time, but it needs the future and can starve long jobs.",
        "A short quantum helps response time and costs context switches; a long one approaches FCFS.",
        "Scheduling is a trade-off between throughput, fairness and responsiveness, so real systems combine ideas."
      ],
      reading: [OSTEP("cpu-sched", "Scheduling: Introduction"), OSTEP("cpu-sched-mlfq", "Multi-Level Feedback Queue"), MAN(7, "sched", "scheduling policies and priorities on Linux")]
    },
    5: {
      objectives: [
        "Say what threads share and what each one keeps for itself, compared with separate processes.",
        "Compare user-level, kernel-level and hybrid threading models.",
        "Use Amdahl's law to find the speedup limit of a program with a given serial fraction.",
        "Explain why threads are cheaper to create and switch than processes, and what that costs in safety."
      ],
      takeaways: [
        "Threads of one process share memory, which makes cooperation easy and bugs easy too.",
        "The serial part of a program limits its speedup, however many cores you add.",
        "In CPython, the global interpreter lock means threads speed up waiting (I/O) but not pure computation."
      ],
      reading: [OSTEP("threads-intro", "Concurrency: An Introduction"), OSTEP("threads-api", "Interlude: Thread API"), MAN(7, "pthreads", "POSIX threads overview"), PY("threading")]
    },
    6: {
      objectives: [
        "Show how an interleaving of two threads can lose an update to a shared counter.",
        "State the three requirements of a critical-section solution: mutual exclusion, progress and bounded waiting.",
        "Use a mutex and counting semaphores to protect shared data and to coordinate a producer and a consumer.",
        "Explain why spinlocks suit very short critical sections on multicore machines and sleeping locks suit long ones."
      ],
      takeaways: [
        "counter++ is three machine steps, so two threads can interleave them. A race condition is a bug that depends on timing.",
        "Locks make a critical section atomic as far as other lock users can tell, but only if everyone uses the lock.",
        "A semaphore counts, so it can represent a pool of resources; a mutex only says locked or unlocked."
      ],
      reading: [OSTEP("threads-locks", "Locks"), OSTEP("threads-sema", "Semaphores"), MAN(2, "futex", "the Linux primitive underneath most user-space locks")]
    },
    7: {
      objectives: [
        "State the four Coffman conditions and break a given deadlock by removing one of them.",
        "Find a cycle in a resource-allocation or wait-for graph.",
        "Run the banker's algorithm to decide whether a state is safe and whether a request can be granted.",
        "Compare prevention, avoidance, detection and ignoring, and say why most systems mostly ignore deadlock."
      ],
      takeaways: [
        "Deadlock needs all four conditions at once: mutual exclusion, hold and wait, no preemption, circular wait.",
        "A safe state has an order in which everyone can finish; an unsafe state is not yet a deadlock, only a risk.",
        "The cheapest practical fix is a global lock ordering, which removes circular wait."
      ],
      reading: [OSTEP("threads-bugs", "Common Concurrency Problems (includes deadlock)"), MAN(7, "pthreads", "see the sections on mutexes and thread safety")]
    },
    8: {
      objectives: [
        "Compare first-fit, best-fit and worst-fit allocation, and explain external and internal fragmentation.",
        "Translate a logical address to a physical one with a page table, splitting it into page number and offset.",
        "Walk a multi-level page table, count the memory references a translation needs, and compute the memory a sparse address space uses.",
        "Explain what a TLB does and compute its effect on average access time."
      ],
      takeaways: [
        "Paging removes external fragmentation by making every allocation the same size.",
        "A page table is a data structure the hardware reads, so its format is fixed by the CPU.",
        "Multi-level tables save memory because unused parts of the address space need no table at all.",
        "Without the TLB, every memory access would cost several more accesses."
      ],
      reading: [OSTEP("vm-paging", "Paging: Introduction"), OSTEP("vm-tlbs", "Paging: Faster Translations (TLBs)"), OSTEP("vm-smalltables", "Paging: Smaller Tables"), OSTEP("vm-freespace", "Free-Space Management")]
    },
    9: {
      objectives: [
        "Describe what happens on a page fault, from the trap to the restarted instruction.",
        "Run FIFO, LRU, OPT and Clock page replacement on a reference string and count the faults.",
        "Explain Belady's anomaly and which algorithms are immune to it.",
        "Compute effective access time and recognize thrashing."
      ],
      takeaways: [
        "Demand paging loads a page only when it is first touched, so a process can be larger than the memory it uses.",
        "OPT is the lower bound but needs the future; LRU approximates it, and Clock approximates LRU cheaply.",
        "A tiny page-fault rate is already expensive, because a fault costs millions of times a memory access."
      ],
      reading: [OSTEP("vm-beyondphys", "Beyond Physical Memory: Mechanisms"), OSTEP("vm-beyondphys-policy", "Beyond Physical Memory: Policies"), DOCS("admin-guide/mm/concepts.html", "Linux memory management concepts")]
    },
    10: {
      objectives: [
        "Break the time to read a disk block into seek, rotation and transfer, and compute each.",
        "Simulate FCFS, SSTF, SCAN, C-SCAN and LOOK disk scheduling and total the head movement.",
        "Say why disk scheduling matters far less for flash storage.",
        "Describe programmed I/O, interrupts and DMA, and when each is used."
      ],
      takeaways: [
        "Seek time dominates a spinning disk, so scheduling reduces head movement.",
        "SSTF can starve distant requests; SCAN-style algorithms bound the wait.",
        "DMA lets a device move data without the CPU copying it, and an interrupt says when it is finished."
      ],
      reading: [OSTEP("file-devices", "I/O Devices"), OSTEP("file-disks", "Hard Disk Drives"), OSTEP("file-raid", "Redundant Arrays of Inexpensive Disks (RAIDs)"), OSTEP("file-ssd", "Flash-based SSDs")]
    },
    11: {
      objectives: [
        "Compare contiguous, linked and indexed allocation by speed, fragmentation and growth.",
        "Compute the maximum file size for an inode with direct, indirect and double-indirect pointers.",
        "Explain the difference between a hard link and a symbolic link, and what happens when each target is removed.",
        "Describe why file systems journal or use copy-on-write."
      ],
      takeaways: [
        "The file's name lives in a directory; everything else about the file lives in its inode.",
        "A hard link is another name for the same inode; a symbolic link is a small file that holds a path.",
        "After a crash, a journal lets the file system repair itself in seconds instead of scanning the whole disk."
      ],
      reading: [OSTEP("file-intro", "Files and Directories"), OSTEP("file-implementation", "File System Implementation"), OSTEP("file-journaling", "Crash Consistency: FSCK and Journaling"), MAN(7, "inode"), MAN(7, "symlink")]
    },
    12: {
      objectives: [
        "Explain why operating systems for phones, servers, embedded devices and mainframes are designed differently.",
        "Place the major operating systems on a family tree and name what each descends from.",
        "Compare two or more systems on kernel design, scheduling, memory, files and security using the comparison tool.",
        "Use a short checklist of questions to understand any unfamiliar operating system."
      ],
      takeaways: [
        "Most differences come from different pressures: battery, deadlines, trust, scale or backward compatibility.",
        "The same ideas (processes, virtual memory, file systems) appear everywhere, in different proportions.",
        "Real-time means predictable timing, not high speed."
      ],
      reading: [["Android architecture", "https://source.android.com/docs/core/architecture", "how Android's layers fit on the Linux kernel"], OSTEP("intro", "Introduction to Operating Systems (the common ideas)")]
    },
    13: {
      objectives: [
        "Explain why isolated processes need kernel-provided ways to communicate.",
        "Compare message passing and shared memory, and say when each is the better choice.",
        "Predict what a reader and a writer on a pipe see: blocking, end of file and broken pipe.",
        "Say why shared memory still needs synchronization and what each IPC mechanism costs."
      ],
      takeaways: [
        "A pipe is a byte stream with no message boundaries, and a full or empty pipe puts a process to sleep.",
        "Forgetting to close an unused end is the classic reason a reader never sees end of file.",
        "Shared memory is the fastest local mechanism and the one that gives back all the concurrency bugs."
      ],
      reading: [MAN(7, "pipe"), MAN(7, "unix", "Unix-domain sockets"), MAN(7, "mq_overview", "POSIX message queues"), MAN(7, "shm_overview", "POSIX shared memory"), PY("multiprocessing")]
    },
    14: {
      objectives: [
        "Explain what a hypervisor does and the difference between type 1 and type 2.",
        "Say what Linux namespaces and control groups each control, and how together they make a container.",
        "Choose between a container and a virtual machine for a described situation, and justify it by isolation and cost.",
        "Explain VM exits and why paravirtual devices batch their work."
      ],
      takeaways: [
        "A container is an ordinary process with a restricted view (namespaces) and limited resources (cgroups). It has no kernel of its own.",
        "A VM virtualizes hardware and boots its own kernel, which is why it isolates more strongly and costs more.",
        "Containers on one kernel share its attack surface; clouds often put a VM boundary between customers."
      ],
      reading: [MAN(7, "namespaces"), MAN(7, "cgroups"), DOCS("admin-guide/cgroup-v2.html", "Control group v2"), DOCS("virt/kvm/index.html", "KVM: the Linux hypervisor")]
    },
    15: {
      objectives: [
        "Describe a monitor and what the wait, signal and broadcast operations of a condition variable do.",
        "Explain why a condition wait must sit in a while loop (Mesa semantics, spurious wake-ups).",
        "Build a bounded queue with one lock and two condition variables.",
        "Compare reader, writer and fair policies for a read-write lock, and say which one can starve whom."
      ],
      takeaways: [
        "A signal is a hint that a condition might now be true, so re-check it every time you wake up.",
        "wait releases the lock and sleeps in one atomic step, which is what prevents a lost wake-up.",
        "No read-write policy is best: sharing, freshness and fairness pull in different directions."
      ],
      reading: [OSTEP("threads-cv", "Condition Variables"), OSTEP("threads-locks-usage", "Lock-based Concurrent Data Structures"), MAN(3, "pthread_cond_wait", "the POSIX condition-variable call"), PY("threading", "includes Condition objects")]
    },
    16: {
      objectives: [
        "Order the stages of a boot, from power-on to a login prompt, and say what runs at each.",
        "Compare BIOS with an MBR disk and UEFI with GPT.",
        "Read the layout of a master boot record: boot code, four partition entries and the 55 AA signature.",
        "Explain how Secure Boot's chain of trust refuses modified code, and how an init system orders services by dependency."
      ],
      takeaways: [
        "Each boot stage is just capable enough to load the next one, which is more capable.",
        "The kernel needs a way to reach its root file system, which is why a temporary RAM file system (initramfs) exists.",
        "Boot time is set by the longest chain of dependencies, not the number of services."
      ],
      reading: [MAN(7, "boot", "the Linux boot process in outline"), ["systemd: system bootup process", "https://www.freedesktop.org/software/systemd/man/latest/bootup.html", "what happens after the kernel starts"], ["UEFI specifications", "https://uefi.org/specifications", "the reference for UEFI and Secure Boot"], ["Arch Linux wiki: boot process", "https://wiki.archlinux.org/title/Arch_boot_process", "a practical walk-through"]]
    },
    17: {
      objectives: [
        "Apply the rules of a multilevel feedback queue to a set of jobs, including demotion and priority boost.",
        "Explain how a time-sharing system tells interactive jobs from CPU-bound ones without knowing their lengths.",
        "Test a periodic task set for schedulability under rate-monotonic scheduling and EDF, and find a missed deadline.",
        "Explain why moving a task between cores has a cost, and how work stealing and CPU affinity respond to it."
      ],
      takeaways: [
        "A feedback queue learns from behavior: using the whole slice means CPU-bound, giving it up early means interactive.",
        "Without a priority boost, the lowest queue can starve.",
        "On one CPU, EDF meets every deadline exactly when utilization is at most 100%; rate-monotonic is guaranteed only up to about 69%.",
        "Balancing load is always traded against cache warmth."
      ],
      reading: [OSTEP("cpu-sched-mlfq", "Multi-Level Feedback Queue"), OSTEP("cpu-sched-lottery", "Proportional Share (lottery and stride)"), OSTEP("cpu-sched-multi", "Multiprocessor Scheduling"), MAN(7, "sched"), DOCS("scheduler/sched-deadline.html", "Linux deadline scheduler (EDF)"), MAN(2, "sched_setaffinity")]
    }
  };
})();
