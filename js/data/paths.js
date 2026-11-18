/* Study paths: ordered routes through the lessons, simulations, labs and practice for one goal.
 * Each path: { id, title, who, goal, steps: [{ t, to, label, note }] }.
 *   t     "read" (a lesson), "try" (a simulation or a spot in a lesson), "lab", "practice", "review"
 *   to    where it goes: { mod, id? } a module and optionally a heading id on its page; { lab: n }; { page, hash? } any other page
 *   note  one sentence on why this step is here and what to look for
 * A path is a suggestion. Anyone can map it onto their own course: keep the order, drop what you do not need.
 * Tests check that every target exists. */
window.OSData = window.OSData || {};
window.OSData.paths = [
  {
    id: "newcomer", title: "From newcomer to advanced", who: "Someone meeting operating systems for the first time who wants the whole picture, in a sensible order.",
    goal: "Understand what an OS does, how it shares the CPU and memory, how programs coordinate safely, and where the real world differs from the textbook.",
    steps: [
      { t: "read", to: { mod: 1 }, label: "Module 1: OS fundamentals", note: "Start here. The two ideas that everything else builds on are user and kernel mode, and the system call." },
      { t: "try", to: { mod: 1, id: "syscall" }, label: "System-call simulator", note: "Step through what happens when a program asks the kernel for something." },
      { t: "read", to: { mod: 5 }, label: "Module 5: processes", note: "A process is a program plus its state. Learn the states and what a context switch saves." },
      { t: "lab", to: { lab: 1 }, label: "Lab 1: processes", note: "Do the any-system part first; the fork part needs Linux, macOS or WSL." },
      { t: "read", to: { mod: 6 }, label: "Module 6: CPU scheduling", note: "How the OS chooses who runs next, and what each rule costs." },
      { t: "practice", to: { page: "problems.html", hash: "topic=scheduling" }, label: "Scheduling problems", note: "Work three or four by hand before you trust the simulator." },
      { t: "read", to: { mod: 7 }, label: "Module 7: threads", note: "Why threads exist, and why more cores do not mean proportionally more speed." },
      { t: "read", to: { mod: 9 }, label: "Module 9: synchronization", note: "Watch an update get lost in the race simulator, then see what fixes it." },
      { t: "read", to: { mod: 11 }, label: "Module 11: deadlocks", note: "What goes wrong when the fix is applied badly: four conditions, and four ways out." },
      { t: "read", to: { mod: 13 }, label: "Module 13: memory", note: "Addresses, paging and the TLB." },
      { t: "read", to: { mod: 14 }, label: "Module 14: virtual memory", note: "Pretending to have more memory than you do, and what it costs when you guess wrong." },
      { t: "practice", to: { page: "problems.html", hash: "topic=pagerepl" }, label: "Page-replacement problems", note: "Count faults by hand for FIFO, LRU and optimal." },
      { t: "read", to: { mod: 15 }, label: "Module 15: disk scheduling and I/O", note: "Why the order of disk requests matters on spinning disks, and what changes with flash." },
      { t: "read", to: { mod: 16 }, label: "Module 16: file systems", note: "How names become blocks: directories, inodes and links." },
      { t: "review", to: { page: "exam.html" }, label: "Timed exam on the core modules so far", note: "Check where you stand before going deeper. Review every miss." },
      { t: "read", to: { mod: 10 }, label: "Module 10: monitors", note: "Going deeper: the safer way to write waiting code, and why a wait belongs in a while loop." },
      { t: "read", to: { mod: 8 }, label: "Module 8: advanced scheduling", note: "What real schedulers do: feedback queues, deadlines and many cores." },
      { t: "read", to: { mod: 19 }, label: "Module 19: virtualization and containers", note: "How the same hardware is split into machines and into containers." },
      { t: "read", to: { mod: 18 }, label: "Module 18: beyond Windows, macOS and Linux", note: "See how other designs made different choices." }
    ]
  },
  {
    id: "programs", title: "How programs run", who: "Learners who want to follow one program from power-on to exit, without the deeper theory.",
    goal: "Explain what happens between pressing the power button and a program printing its output.",
    steps: [
      { t: "read", to: { mod: 4 }, label: "Module 4: the boot process", note: "From firmware to the first process." },
      { t: "try", to: { mod: 4, id: "stages" }, label: "Boot sequence simulator", note: "Step through the stages and see what each hands to the next." },
      { t: "read", to: { mod: 1 }, label: "Module 1: OS fundamentals", note: "How a running program asks the kernel for help." },
      { t: "read", to: { mod: 5 }, label: "Module 5: processes", note: "How a program becomes a process, and how fork, exec and wait create more." },
      { t: "try", to: { mod: 5, id: "creating-processes-fork-exec-wait" }, label: "fork tree", note: "Predict how many processes there will be before you press the button." },
      { t: "lab", to: { lab: 1 }, label: "Lab 1: processes", note: "Do it on a real machine." },
      { t: "read", to: { mod: 12 }, label: "Module 12: inter-process communication", note: "How two running programs exchange data." },
      { t: "read", to: { mod: 19 }, label: "Module 19: virtualization and containers", note: "What changes when the 'machine' is virtual." }
    ]
  },
  {
    id: "memory", title: "Memory and storage", who: "Learners who want to understand addresses, paging, disks and file systems, and how data survives failures.",
    goal: "Follow an address from a program to a page frame, and a file name to a block, and say what happens when something fails.",
    steps: [
      { t: "read", to: { mod: 13 }, label: "Module 13: memory management", note: "Logical and physical addresses, then paging." },
      { t: "try", to: { mod: 13, id: "paging" }, label: "Paging simulator", note: "Translate an address by hand, then check it." },
      { t: "try", to: { mod: 13, id: "making-translation-fast-the-tlb" }, label: "Page-table walk and TLB", note: "See how many memory accesses one load really needs." },
      { t: "practice", to: { page: "problems.html", hash: "topic=paging" }, label: "Paging problems", note: "Offsets, frame numbers and page-table sizes." },
      { t: "read", to: { mod: 14 }, label: "Module 14: virtual memory", note: "Demand paging, replacement and thrashing." },
      { t: "try", to: { mod: 14, id: "effective-access-time" }, label: "Effective access time", note: "Find how small the fault rate has to be before memory feels normal." },
      { t: "lab", to: { lab: 3 }, label: "Lab 3: system resources", note: "Read the same numbers from a real machine." },
      { t: "read", to: { mod: 15 }, label: "Module 15: disk scheduling and I/O", note: "Seek time, rotation and why requests are reordered." },
      { t: "read", to: { mod: 16 }, label: "Module 16: file systems", note: "Allocation, inodes, links and free space." },
      { t: "practice", to: { page: "problems.html", hash: "topic=inode" }, label: "Inode problems", note: "How large can a file be with these block and pointer sizes?" },
      { t: "read", to: { mod: 17 }, label: "Module 17: storage reliability", note: "RAID, flash wear and crash-safe updates." },
      { t: "try", to: { mod: 17, id: "crash" }, label: "Journaling simulator", note: "Crash at every step and see what each design recovers." }
    ]
  },
  {
    id: "concurrency", title: "Concurrency", who: "Learners who write, or will write, code with threads and need to know why it breaks and how to make it safe.",
    goal: "Predict where a concurrent program can go wrong, and choose a tool that fixes it without causing a deadlock.",
    steps: [
      { t: "read", to: { mod: 7 }, label: "Module 7: threads", note: "What threads share, and what parallel speedup really looks like." },
      { t: "try", to: { mod: 7, id: "how-much-speedup-can-you-expect" }, label: "Amdahl's law", note: "Find how much of a program must run in parallel before more cores matter." },
      { t: "read", to: { mod: 9 }, label: "Module 9: synchronization", note: "Races, critical sections, locks and semaphores." },
      { t: "try", to: { mod: 9, id: "the-race-condition" }, label: "Race simulator", note: "Run it without protection, then with a lock, and compare." },
      { t: "lab", to: { lab: 2 }, label: "Lab 2: threads, races and the GIL", note: "See a lost update on a real interpreter." },
      { t: "read", to: { mod: 10 }, label: "Module 10: monitors and readers-writers", note: "The tidier way: a lock and condition variables together." },
      { t: "try", to: { mod: 10, id: "mesa" }, label: "Why a wait needs a loop", note: "Watch a stolen wakeup break the 'if' version." },
      { t: "read", to: { mod: 11 }, label: "Module 11: deadlocks", note: "How careful locking can still freeze a program." },
      { t: "lab", to: { lab: 4 }, label: "Lab 4: semaphores and deadlock prevention", note: "Build a bounded buffer, then cause and fix a deadlock." },
      { t: "read", to: { mod: 12 }, label: "Module 12: inter-process communication", note: "Sharing less: pass messages instead of memory." },
      { t: "practice", to: { page: "scenarios.html" }, label: "Scenario questions", note: "Choose a lock, a queue or an atomic for each situation, and say why." }
    ]
  },
  {
    id: "security", title: "Security", who: "Learners who want to know how an OS protects itself and its users, and how those protections fail.",
    goal: "Explain how permissions, memory protection and a trusted boot chain work, and name the attacks each one stops and does not stop.",
    steps: [
      { t: "read", to: { mod: 2 }, label: "Module 2: security and access control", note: "Goals, least privilege, permissions and access-control lists." },
      { t: "try", to: { mod: 2, id: "unix-file-permissions" }, label: "Permission calculator", note: "Work out a mode and what the umask removes." },
      { t: "read", to: { mod: 3 }, label: "Module 3: security in depth", note: "How memory bugs become attacks, and how passwords should be stored." },
      { t: "try", to: { mod: 3, id: "defenses" }, label: "Stack-overflow simulator", note: "Turn defenses on one at a time and see which attack each stops." },
      { t: "try", to: { mod: 3, id: "passwords" }, label: "Password guessing time", note: "Compare an online attacker with one holding a stolen hash." },
      { t: "try", to: { mod: 3, id: "threats" }, label: "Threat-modeling exercise", note: "Find the threats for three small systems using STRIDE." },
      { t: "read", to: { mod: 4 }, label: "Module 4: the boot process", note: "Where trust has to start." },
      { t: "try", to: { mod: 4, id: "secure" }, label: "Chain of trust", note: "Change one stage and see where the chain breaks." },
      { t: "read", to: { mod: 19 }, label: "Module 19: virtualization and containers", note: "What a container does and does not isolate." },
      { t: "practice", to: { page: "scenarios.html" }, label: "Scenario questions", note: "Apply what you have learned to situations." }
    ]
  },
  {
    id: "performance", title: "Performance", who: "Learners who want to reason about why systems are slow and what to change first.",
    goal: "Use measurements and simple models to predict what a change to scheduling, threads, memory or disks will do.",
    steps: [
      { t: "read", to: { mod: 6 }, label: "Module 6: CPU scheduling", note: "Turnaround, waiting and response time are different goals." },
      { t: "try", to: { mod: 6, id: "compare" }, label: "Compare two schedulers", note: "Run both on the same workload and look at which numbers move." },
      { t: "read", to: { mod: 7 }, label: "Module 7: threads and parallel performance", note: "Amdahl's law and the cost of switching." },
      { t: "read", to: { mod: 8 }, label: "Module 8: advanced scheduling", note: "Feedback queues, deadlines and multicore balance." },
      { t: "read", to: { mod: 14 }, label: "Module 14: virtual memory", note: "How the page-fault rate decides everything." },
      { t: "try", to: { mod: 14, id: "compare" }, label: "Compare two page-replacement policies", note: "Watch the same reference string under two rules." },
      { t: "read", to: { mod: 15 }, label: "Module 15: disk scheduling", note: "Seek time dominates on spinning disks." },
      { t: "try", to: { mod: 17, id: "ssd" }, label: "SSD write amplification", note: "See why a nearly full flash drive writes more than you asked." },
      { t: "lab", to: { lab: 3 }, label: "Lab 3: system resources", note: "Measure a real machine." }
    ]
  },
  {
    id: "beyond", title: "Beyond the big three", who: "Learners who already know the basics and want to see other designs, virtual machines and containers.",
    goal: "Say how a different operating system or isolation technique changes the trade-offs, and why.",
    steps: [
      { t: "read", to: { mod: 18 }, label: "Module 18: beyond Windows, macOS and Linux", note: "Start with the questions to ask about any new OS." },
      { t: "try", to: { mod: 18, id: "tree" }, label: "Family tree", note: "See which ideas were inherited and which were new." },
      { t: "try", to: { mod: 18, id: "compare" }, label: "Compare the systems", note: "Pick three that differ most and say why." },
      { t: "read", to: { mod: 19 }, label: "Module 19: virtualization and containers", note: "Hypervisors, namespaces and control groups." },
      { t: "try", to: { mod: 19, id: "compare" }, label: "VM or container?", note: "Decide for each situation what you need isolated." },
      { t: "read", to: { mod: 4 }, label: "Module 4: the boot process", note: "How different machines start." },
      { t: "read", to: { mod: 8 }, label: "Module 8: advanced scheduling", note: "Real-time systems are a different world." }
    ]
  }
];
