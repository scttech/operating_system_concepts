/* Discussion and journal prompts, three or so per module. Each prompt: { k, text, to?, label? }.
 *   k      "discuss" (talk it over in a group), "write" (a short journal or exit-ticket answer), "try" (do something in a simulation, then explain), "design" (decide and defend)
 *   to     optional link target, same shape as in paths.js: { mod?, id?, page?, hash? }; mod defaults to the prompt's own module
 *   label  link text
 * There are no model answers here on purpose: a good answer names the trade-off. The teaching notes (js/data/teaching.js) say what to listen for. */
window.OSData = window.OSData || {};
window.OSData.prompts = {
  1: [
    { k: "discuss", text: "Your phone, your laptop and a router all run an OS. Which of the jobs of an OS (sharing, hiding details, protecting) matter most for each of them, and why do the priorities differ?" },
    { k: "try", text: "Make a system call with the simulator and trace every mode switch. Which step would be the first to go wrong if user programs could write to the kernel's tables?", to: { id: "syscall" }, label: "System-call simulator" },
    { k: "write", text: "In your own words, why can't a program simply call a kernel function the way it calls its own functions? Use the words 'mode' and 'entry point'." }
  ],
  2: [
    { k: "try", text: "Create a file with mode 640, then ask whether another user in the group may write to it. Change one digit so that the answer changes, and explain the digit.", to: { id: "unix-file-permissions" }, label: "Permission calculator" },
    { k: "discuss", text: "An access-control list and a capability both express who may do what. Which one would you rather manage for a shared folder of 200 people, and which when you want to revoke one person's access quickly?", to: { id: "access-control-matrix" }, label: "Access-control matrix" },
    { k: "write", text: "Describe a time you gave a person or an app more access than it needed. What was the risk, and what would 'least privilege' have looked like?" }
  ],
  5: [
    { k: "try", text: "Predict how many processes exist after three fork() calls in a row, then run the fork tree. Where did your prediction go wrong, if it did?", to: { id: "creating-processes-fork-exec-wait" }, label: "fork tree" },
    { k: "discuss", text: "Why does the OS keep a separate saved state for every process? What would break if two processes shared one set of saved registers?", to: { id: "context-switching" }, label: "Context switching" },
    { k: "write", text: "Draw the process-state diagram from memory and label every arrow with what causes it. Which arrows does a program that never does any I/O never take?", to: { id: "process-states" }, label: "Process states" }
  ],
  6: [
    { k: "try", text: "Load the convoy-effect preset and run FCFS, SJF and Round Robin. Write down which numbers each one improves and which it makes worse.", to: { id: "simulator" }, label: "Scheduler simulator" },
    { k: "design", text: "You are designing a scheduler for a laptop used for video calls and background backups. Which algorithm family would you start from, and what would you change after the first week of complaints?" },
    { k: "write", text: "SJF gives the best average waiting time but is rarely used as it stands. Name two reasons, one practical and one about fairness.", to: { id: "compare" }, label: "Compare two algorithms" }
  ],
  7: [
    { k: "try", text: "Set the parallel fraction to 90% and slide the core count up. At what point would you stop paying for more cores? Now try 99%.", to: { id: "how-much-speedup-can-you-expect" }, label: "Amdahl's law" },
    { k: "discuss", text: "A web server could be one process with many threads or many processes with one thread each. Which would you choose for a service that must survive a bug in one request handler, and what does it cost?" },
    { k: "write", text: "Explain, to a friend who knows programming but not operating systems, why a program with twice as many threads is not twice as fast.", to: { id: "the-price-of-switching" }, label: "The price of switching" }
  ],
  9: [
    { k: "try", text: "Run the race simulator with no protection several times. Explain, step by step, how two threads each adding 1 can leave the counter 1 higher instead of 2.", to: { id: "the-race-condition" }, label: "Race simulator" },
    { k: "discuss", text: "A lock fixes the race. Name one new problem it creates, and one situation where a lock is the wrong tool entirely." },
    { k: "try", text: "In the bounded-buffer simulator make the producer much faster than the consumer. Who waits, who works, and what does the buffer size change?", to: { id: "bounded-buffer-producer-consumer" }, label: "Bounded buffer" }
  ],
  11: [
    { k: "try", text: "Run the dining philosophers with no prevention until it deadlocks. Which of the four conditions would you break first, and how?", to: { id: "philosophers" }, label: "Dining philosophers" },
    { k: "design", text: "Two services lock accounts A and B in opposite orders and sometimes freeze. Propose two different fixes and say what each one costs.", to: { page: "scenarios.html" }, label: "Scenario questions" },
    { k: "try", text: "In the Banker's algorithm simulator, find a request that is available right now but that the algorithm refuses. Explain why 'enough resources' is not the same as 'safe'.", to: { id: "banker-s-algorithm" }, label: "Banker's algorithm" }
  ],
  13: [
    { k: "try", text: "Translate three logical addresses by hand, then check them. What changes when you halve the page size, and what does it do to wasted space?", to: { id: "paging" }, label: "Paging simulator" },
    { k: "discuss", text: "Why is a single flat page table a poor idea for a 64-bit address space, and what does a multi-level table give up in exchange?", to: { id: "multilevel" }, label: "Why one big table fails" },
    { k: "write", text: "The TLB hit rate falls from 99% to 95%. Estimate how much slower an average memory access becomes, and say what that answer depends on.", to: { id: "making-translation-fast-the-tlb" }, label: "The TLB" }
  ],
  14: [
    { k: "try", text: "Run FIFO, LRU and optimal on the same reference string. Which gap between them surprises you most?", to: { id: "page-replacement-algorithms" }, label: "Page-replacement simulator" },
    { k: "try", text: "Find a case where adding a frame makes FIFO fault more. Then say what property LRU has that FIFO lacks.", to: { id: "compare" }, label: "Compare two policies" },
    { k: "write", text: "A machine becomes unusably slow when you open one more application. Explain what is likely happening using the words 'working set' and 'thrashing'.", to: { id: "thrashing-and-the-working-set" }, label: "Thrashing" }
  ],
  15: [
    { k: "try", text: "Make a request queue with requests on both ends of the disk and compare FCFS, SSTF and SCAN. Which one would you not want to use under heavy load, and why?", to: { id: "disk-scheduling-algorithms" }, label: "Disk-scheduling simulator" },
    { k: "discuss", text: "Disk-scheduling algorithms were designed for spinning disks. Which of their ideas still matter for an SSD, and which no longer do?" },
    { k: "write", text: "Where does the time go when a hard disk reads a small block? Rank the parts and say which one the OS can influence.", to: { id: "how-a-hard-disk-spends-its-time" }, label: "How a disk spends its time" }
  ],
  16: [
    { k: "try", text: "Use the inode simulator to find the largest file for 4 KB blocks and 4-byte pointers. Change one parameter and predict the new maximum before checking.", to: { id: "inodes" }, label: "Inode simulator" },
    { k: "discuss", text: "Contiguous, linked and indexed allocation each fit a different workload. Pick a workload for each and defend the pairing.", to: { id: "allocating-blocks-to-files" }, label: "Allocation methods" },
    { k: "write", text: "What happens to the data when you delete a file that has two hard links? What if it had one symbolic link pointing at it?" }
  ],
  18: [
    { k: "try", text: "Pick three systems from the compare tool that differ most from one another. For each, name one design choice that was made for a reason a desktop user would not notice.", to: { id: "compare" }, label: "Compare the systems" },
    { k: "discuss", text: "Which ideas in today's systems were invented decades ago? Choose one from the family tree and say what it tells you about how OS ideas spread.", to: { id: "tree" }, label: "Family tree" },
    { k: "design", text: "You are choosing an OS for a pacemaker, a bank's transaction system and a classroom tablet. What question would you ask first about each?" }
  ],
  12: [
    { k: "try", text: "Compare the costs of the mechanisms in the simulator for small and for large transfers. Which is cheapest for each, which is safest, and what did you give up?", to: { id: "cost" }, label: "What each one costs" },
    { k: "discuss", text: "Shared memory is the fastest way to pass data, yet most designs avoid it. Why?", to: { id: "shm" }, label: "Shared memory" },
    { k: "design", text: "A photo app has a thumbnail generator running as a separate process. Choose how the two talk and justify it.", to: { id: "choose" }, label: "Choosing a mechanism" }
  ],
  19: [
    { k: "discuss", text: "A container and a virtual machine can both run a web app. What is shared with the host in each case, and what does that mean for a security bug?", to: { id: "compare" }, label: "VM or container?" },
    { k: "try", text: "Give a group a CPU limit and watch what happens to a busy process, then give it a memory limit. How do the two limits fail differently?", to: { id: "cgroups" }, label: "Control-group limits" },
    { k: "write", text: "Explain what a namespace changes and what it does not, using one example of something a container can still see about the host." }
  ],
  10: [
    { k: "try", text: "Use the monitor simulator to show a consumer that wakes up to an empty buffer when written with 'if'. Explain why 'while' repairs it.", to: { id: "mesa" }, label: "Why 'while', not 'if'" },
    { k: "discuss", text: "A read-write lock lets many readers in at once. What happens to a writer when readers keep arriving, and how would you fix it?", to: { id: "rw" }, label: "Readers and writers" },
    { k: "write", text: "When would you choose a plain lock over a read-write lock even though readers dominate? Think about the cost of the lock itself." }
  ],
  4: [
    { k: "try", text: "Step through the boot sequence and stop at each stage. What does that stage know about the machine, and what does it need to find next?", to: { id: "stages" }, label: "Boot sequence" },
    { k: "try", text: "Alter one stage in the chain of trust and see where boot stops. What did the earlier stages have to know in advance to catch it?", to: { id: "secure" }, label: "Chain of trust" },
    { k: "discuss", text: "If a service starts before the one it depends on, what can the init system do about it? Look at the start-up order simulator.", to: { id: "init" }, label: "Starting services" }
  ],
  8: [
    { k: "try", text: "Compare a CPU-bound job and an interactive job in the feedback-queue simulator. Where does each settle, and why? Then say how a CPU-bound job could cheat, and which rule (look at the priority boost) limits that.", to: { id: "mlfq" }, label: "Feedback queues" },
    { k: "try", text: "Choose a task set that earliest-deadline-first meets but rate-monotonic misses (edit the C and T values if no preset does). What does that tell you about total utilization?", to: { id: "rt" }, label: "Real-time scheduling" },
    { k: "discuss", text: "On many cores, why can a shared run queue become a bottleneck, and what does per-core queuing cost in return?", to: { id: "multi" }, label: "Many cores" }
  ],
  3: [
    { k: "try", text: "Turn on one defense at a time in the stack-overflow simulator. For each, name an attacker move that still gets through.", to: { id: "defenses" }, label: "Stack-overflow simulator" },
    { k: "write", text: "Why is a fast hash a poor choice for storing passwords, and how do a salt and repetition each help?", to: { id: "passwords" }, label: "Password storage" },
    { k: "design", text: "Pick a system you use daily and list three threats with STRIDE. For each, say what you would try first to reduce it.", to: { id: "threats" }, label: "Threat modeling" }
  ],
  17: [
    { k: "try", text: "Fail one disk, then two, in each RAID level. Which level would you trust for a large array and what would you still back up?", to: { id: "raid" }, label: "RAID simulator" },
    { k: "try", text: "Crash the journaling simulator at every step with and without a journal. What is the one step that must be atomic, and how is it made so?", to: { id: "crash" }, label: "Journaling simulator" },
    { k: "discuss", text: "Why does an almost-full SSD slow down and wear faster? What can the OS tell the drive to help?", to: { id: "ssd" }, label: "SSD write amplification" }
  ]
};
