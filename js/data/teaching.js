/* Teaching notes for instructors, one entry per module:
 *   misconceptions  [[what students often believe, what is actually true]]
 *   demos           [{ title, steps: [what to do, in order], to?: { id?, hash?, page? } }]   (to: where to start, same shape as paths.js; mod is the module itself)
 *   listen          one line per discussion prompt in js/data/prompts.js, in the same order: what a good answer contains
 * The misconceptions are ones the lessons address directly, so a student who has read the module has already seen the correction.
 * Nothing here is an answer key for the quiz questions; the printable handouts page makes those. */
window.OSData = window.OSData || {};
window.OSData.teaching = {
  1: {
    misconceptions: [
      ["The kernel is a process that runs alongside the others.", "The kernel is code that runs, with full privilege, on behalf of whichever process entered it (or in response to an interrupt). It is not a separate process that gets scheduled."],
      ["The shell and the GUI are part of the operating system.", "They are ordinary programs. Whether to count them as 'the OS' is a naming question; to the hardware they have no special rights."],
      ["A system call is just a function call.", "It switches mode through a trap to a fixed entry point the kernel chose. That is why it costs far more than a normal call, and why library buffering exists."]
    ],
    demos: [{ title: "Trace one system call out loud", steps: ["Open the system-call simulator and choose read or write.", "Ask the class to predict each step before you press Next: trap, mode switch, argument check, work, return.", "Ask: what stops a program from picking its own entry address?"], to: { id: "syscall" } }],
    listen: ["Sharing matters most for a laptop, hiding details for a phone app developer, protection for a shared router. Look for students tying a job to a real consequence.", "The step where the CPU switches to kernel mode. Look for 'it could overwrite the table of entry points, so any program would own the machine'.", "'Mode' (privileged vs. not) and 'entry point' (the kernel decides where control goes). If either is missing they are describing a normal call."]
  },
  2: {
    misconceptions: [
      ["Permissions are checked when a file is opened and then forgotten, so changing them has no effect.", "The check happens at open. A process that already has the file open keeps its access, so revoking permissions does not always stop a running program."],
      ["Mode 777 is a safe default because it avoids 'permission denied'.", "It lets any user modify the file. Least privilege means granting the least that works."],
      ["Security means keeping out outsiders.", "Much of OS security is about protecting programs from each other and from their own bugs, inside one machine."]
    ],
    demos: [{ title: "Digit by digit", steps: ["Ask a student for a mode, for example 640.", "Before you use the calculator, have the class say what owner, group and others may do.", "Then show the umask turning a default 666 into the mode a new file gets."], to: { id: "unix-file-permissions" } }],
    listen: ["That the group has read but not write. Changing the middle digit to 6 or 7 changes the answer; the explanation is read=4, write=2, execute=1.", "An ACL is easier to read per object and to change in one place; a capability makes it simple to hand out a narrow right. Revocation is the hard part of capabilities.", "A concrete example and a statement of what could go wrong. The best answers notice that the risk is often a bug in the program, not a malicious user."]
  },
  5: {
    misconceptions: [
      ["A process and a program are the same thing.", "A program is a file; a process is a running instance with its own memory, registers and open files. Two processes can run the same program."],
      ["fork() starts a new program.", "fork() copies the calling process. A new program only starts when the child calls exec()."],
      ["A waiting process still uses the CPU.", "A blocked process is not scheduled until the event it waits for completes, so it uses no CPU time."]
    ],
    demos: [{ title: "Predict the fork count", steps: ["Show a short program with two or three fork() calls, without running it.", "Have the class vote on how many processes exist at the end, then run the fork-tree simulator.", "Add an if on the return value and ask which processes take which branch."], to: { id: "creating-processes-fork-exec-wait" } }],
    listen: ["Eight processes for three forks (2 to the power 3). Common error: counting 3 or 6. The tree makes the doubling visible.", "The registers, program counter and memory map belong to one process. Sharing them would mean one process's state overwrites another's.", "Ready, running and waiting, with timeout, dispatch, I/O wait and I/O completion. A program that never does I/O never takes the arrows into and out of waiting."]
  },
  6: {
    misconceptions: [
      ["The best scheduling algorithm is the one with the shortest average waiting time.", "Waiting time, turnaround, response time and fairness are different goals. SJF minimizes average waiting but can starve long jobs and needs burst lengths nobody knows in advance."],
      ["Round Robin is always fair, so it is always best.", "With a very large quantum it behaves like FCFS, and with a very small one it spends its time switching."],
      ["Preemption makes everything faster.", "Preemption can improve response time and short-job waiting, but every switch costs time, and a preempted job finishes later."]
    ],
    demos: [{ title: "The convoy effect", steps: ["Load the convoy preset in the simulator and run FCFS.", "Ask: who is stuck behind whom, and what is the average wait?", "Switch to SJF, then to Round Robin with a small quantum, and compare each metric, not only one."], to: { id: "simulator" } }],
    listen: ["Each algorithm wins on a different metric. A good answer says which metric got worse, not only which got better.", "Interactive work needs fast response, backups need throughput. Look for multilevel or priority designs with some protection against starvation.", "SJF needs future knowledge (it can only be estimated) and starves long jobs."]
  },
  7: {
    misconceptions: [
      ["Twice the cores means twice the speed.", "Amdahl's law: the serial part limits the speedup. With 90% parallel work, no number of cores gives more than 10 times."],
      ["Threads are free to create and switch.", "They are cheaper than processes but not free: stacks, scheduling, cache effects and synchronization all cost."],
      ["Threads have their own memory.", "Threads in one process share the address space, which is why they can communicate quickly and also why they can corrupt each other's data."]
    ],
    demos: [{ title: "Where does the speedup stop?", steps: ["Open Amdahl's law with 90% parallel and 8 cores; ask for the speedup.", "Raise the cores to 1,000 and ask again.", "Move the parallel fraction to 99% and repeat; discuss why shrinking the serial part beats adding cores."], to: { id: "how-much-speedup-can-you-expect" } }],
    listen: ["Around 10 times is the ceiling at 90%, and about 100 times at 99%. Students should say the money is better spent on the serial part.", "Many processes isolate faults but cost memory and communication; threads share data cheaply but one bug can take everything down.", "Switch cost, contention for shared data and the serial fraction. Bonus: cache effects."]
  },
  9: {
    misconceptions: [
      ["A race condition needs two CPUs.", "On one CPU the scheduler can still switch between the read and the write of a shared variable."],
      ["counter += 1 is one step, so it cannot be interrupted.", "It is a load, an add and a store. The OS can switch between any two of them."],
      ["Adding a lock always fixes the problem.", "It fixes the race but can add waiting, priority inversion or deadlock if locks are taken in inconsistent orders."]
    ],
    demos: [{ title: "Lose an update on purpose", steps: ["Run the race simulator with no protection and many increments.", "Run it until the result is wrong and show the interleaving that caused it.", "Switch on a lock and ask what the lock costs."], to: { id: "the-race-condition" } }],
    listen: ["Load, add, store, with a switch between load and store so both threads read the same value.", "Deadlock, contention or priority inversion; a lock is the wrong tool for something a single atomic instruction can do, or for waiting on a condition.", "The producer waits when the buffer is full, the consumer works until it is empty; a bigger buffer smooths bursts but does not fix a permanently faster producer."]
  },
  11: {
    misconceptions: [
      ["A deadlock is the same as a slow program.", "In a deadlock nothing will ever proceed on its own: each member waits for something another member holds."],
      ["An unsafe state is a deadlock.", "An unsafe state means a deadlock could occur, not that it has. The Banker's algorithm avoids unsafe states."],
      ["The fix for deadlock is always to detect it and restart.", "There are four strategies: prevent, avoid, detect and recover, or ignore. Many real systems choose to ignore it and rely on timeouts."]
    ],
    demos: [{ title: "Break one condition", steps: ["Run the dining philosophers without prevention until they deadlock.", "Name the four conditions on the board, and ask which one each fix removes (resource ordering removes circular wait).", "Ask what the fix costs in fairness or parallelism."], to: { id: "philosophers" } }],
    listen: ["Usually circular wait, by numbering resources and taking them in order, or hold and wait, by taking both or neither.", "Ordering locks consistently, or taking both at once with a timeout. Trade-offs are less flexibility and possible starvation.", "Safe means some order exists in which everyone can finish. 'Available now' ignores what the others will still ask for."]
  },
  13: {
    misconceptions: [
      ["The page table is stored in the CPU.", "It is in memory. The CPU holds only a pointer to it and caches recent entries in the TLB."],
      ["A page is the same as a frame.", "A page is a block of the logical address space; a frame is a block of physical memory. The table maps pages to frames."],
      ["Paging eliminates fragmentation.", "It removes external fragmentation but leaves internal fragmentation in the last page of each process."]
    ],
    demos: [{ title: "Translate by hand first", steps: ["Give the class a page size and a small page table.", "Have them translate three addresses on paper, then check with the simulator.", "Halve the page size and ask what happens to the table and to wasted space."], to: { id: "paging" } }],
    listen: ["Smaller pages waste less in the last page but need a larger table. Students should compute, not guess.", "A flat table for a huge address space would be enormous, mostly empty entries; a multi-level table allocates only what is used, at the cost of more memory accesses per miss.", "Effective access time = hit rate times fast time + miss rate times slow time, so a few points of hit rate change little only when a miss is cheap."]
  },
  14: {
    misconceptions: [
      ["More frames always means fewer page faults.", "Not for every policy. FIFO can fault more with more frames (Belady's anomaly); LRU and optimal cannot."],
      ["Virtual memory is just using the disk as extra RAM.", "That is one use. It also gives each process its own address space, protection and sharing."],
      ["A small page-fault rate is harmless.", "A fault costs thousands of times as much as a memory access (more on a spinning disk), so even one fault in a thousand accesses slows things down badly."]
    ],
    demos: [{ title: "Beat the clairvoyant", steps: ["Run FIFO, LRU and optimal on one reference string.", "Ask how many faults each had and why optimal cannot be built.", "Use the effective-access-time simulator to show how little fault rate is tolerable."], to: { id: "page-replacement-algorithms" } }],
    listen: ["Optimal sets the lower bound; LRU is usually close, FIFO often is not. Students should note that optimal needs the future.", "LRU is a stack algorithm: the pages in memory with n frames are always a subset of those with n+1.", "Too many processes for the memory, so each lacks its working set and the system spends its time paging."]
  },
  15: {
    misconceptions: [
      ["Disk scheduling matters equally for every storage device.", "It matters for spinning disks where seek time dominates. On SSDs there is no head to move, so other costs matter."],
      ["SSTF is the best algorithm because it minimizes each seek.", "It can starve requests far from the head. SCAN-style algorithms bound the wait."],
      ["The OS reads exactly the bytes the program asks for.", "Disks work in blocks and sectors; the OS reads whole blocks and caches them."]
    ],
    demos: [{ title: "Same queue, five algorithms", steps: ["Enter a request queue with a far-away request near the end.", "Run FCFS, SSTF, SCAN and C-SCAN and compare total head movement.", "Ask which algorithm would starve that far request under constant new arrivals."], to: { id: "disk-scheduling-algorithms" } }],
    listen: ["SSTF under heavy load, because requests far from the head can wait indefinitely.", "Fairness and batching still matter for SSDs, but seek optimization does not. Look for 'no moving head'.", "Seek, rotational latency and transfer. The OS can influence seek by ordering requests."]
  },
  16: {
    misconceptions: [
      ["A file name is part of the file.", "In Unix the name is a directory entry pointing at an inode. The file's data and metadata belong to the inode, which is why one file can have several names."],
      ["Deleting a file erases its data.", "Removing a name decrements a link count. Data is freed when the count and the open-file count reach zero, and the blocks are usually not overwritten."],
      ["A symbolic link and a hard link are the same.", "A hard link is another name for the same inode. A symbolic link is a small file containing a path, which can dangle."]
    ],
    demos: [{ title: "How big can a file get?", steps: ["Give the class a block size and pointer size.", "Have them compute the maximum file size with direct, single, double and triple indirect blocks.", "Check with the inode simulator and change one parameter."], to: { id: "inodes" } }],
    listen: ["Pointers per block = block size / pointer size, and each indirect level multiplies. A common error is forgetting the direct blocks.", "Contiguous for read-mostly sequential files, linked for sequential only, indexed for random access. Look for the weakness of each.", "Two hard links: the data stays until the last name is removed. A symbolic link left behind now points at nothing."]
  },
  18: {
    misconceptions: [
      ["There are three operating systems, and everything else is a variation of Linux.", "There are many designs: microkernels, real-time kernels, mainframe systems, capability-based systems and others, made for different constraints."],
      ["Mobile operating systems are a different technology from desktop ones.", "Android uses the Linux kernel and iOS shares a lineage with macOS. What differs is the permission model, power management and app lifecycle."],
      ["Newer designs are always better.", "Every design trades one property for another. The simulator's questions help students compare trade-offs rather than rank systems."]
    ],
    demos: [{ title: "Pick the odd one out", steps: ["Choose three systems in the compare tool, for example a mainframe, a real-time system and a security-focused one.", "Ask students to say what each was built to protect or to guarantee.", "Ask what a desktop OS would have to give up to do the same."], to: { id: "compare" } }],
    listen: ["Specific design choices tied to a purpose, such as real-time guarantees or isolation between domains.", "Ideas like virtual memory and Unix's process model travel decades. Students might notice that lineage explains surprising similarities.", "Good answers ask about failure cost, timing needs and who might attack, before talking about features."]
  },
  12: {
    misconceptions: [
      ["Shared memory needs no synchronization because there is no copying.", "It needs even more, since the OS no longer mediates access. The processes must coordinate themselves."],
      ["A pipe is the same as a file.", "A pipe is a kernel buffer with blocking behavior: reading an empty pipe waits and writing a full one waits."],
      ["Sockets are only for networks.", "Unix-domain sockets connect processes on the same machine, with the same programming model."]
    ],
    demos: [{ title: "Who waits?", steps: ["Open the IPC simulator and choose a pipe.", "Make the writer faster than the reader and watch it block when the buffer is full.", "Switch to shared memory and ask who would stop the writer now."], to: { id: "cost" } }],
    listen: ["Copies versus synchronization. Small transfers favour messages; big ones favour sharing; sharing needs locks.", "Because the processes must now guard against races on their own, and a bug in one can corrupt the other.", "A narrow, simple choice such as a pipe or socket, with a reason about isolation and failure."]
  },
  19: {
    misconceptions: [
      ["A container is a lightweight virtual machine.", "A container is ordinary processes with isolated views (namespaces) and limits (control groups), sharing the host's kernel. A VM has its own kernel."],
      ["Containers are as isolated as virtual machines.", "A kernel bug can affect every container on the host, whereas a VM's boundary is the hypervisor."],
      ["A hypervisor is just another operating system.", "It is software, sometimes a small OS, whose job is to share the hardware among guest operating systems."]
    ],
    demos: [{ title: "Limits fail differently", steps: ["In the control-group simulators, give a busy group a CPU limit and watch it slow down.", "Then give a group a memory limit and watch it be killed.", "Ask why the two limits behave so differently."], to: { id: "cgroups" } }],
    listen: ["Containers share the host kernel, so a kernel flaw affects all; a VM has a separate kernel, so the attacker needs a second flaw.", "CPU is shareable and just slows work; memory cannot be taken back, so the group is killed.", "A namespace changes what a process can see, not what the kernel is. Good example: the host's kernel version."]
  },
  10: {
    misconceptions: [
      ["A condition variable remembers that it was signalled.", "A signal with no waiter is lost. That is why the state is checked in a loop under the lock."],
      ["After a wait returns, the condition must be true.", "Another thread may have run first. With Mesa-style monitors the condition must be rechecked in a while loop."],
      ["Readers never need protection because they only read.", "They need protection from a writer in the middle of an update. Readers can share with each other."]
    ],
    demos: [{ title: "Break the 'if' version", steps: ["In the monitor simulator select the 'if' version.", "Run until the consumer takes from an empty buffer.", "Switch to 'while' and run the same schedule."], to: { id: "mesa" } }],
    listen: ["The woken consumer was not the only one running; another consumer took the item first, and 'if' does not recheck.", "Writers can starve if readers keep arriving; a fair lock lets waiting writers in first.", "When read sections are tiny, the lock bookkeeping costs more than it saves."]
  },
  4: {
    misconceptions: [
      ["The operating system starts the moment the power button is pressed.", "Firmware runs first and loads a boot loader, which loads the kernel. Several programs run before the OS exists."],
      ["BIOS and UEFI are the same thing.", "UEFI is the newer firmware standard, with a boot manager, disk partitions (GPT) and Secure Boot support."],
      ["Secure Boot makes a computer secure.", "It checks that boot components are signed. It does nothing about a bug in the running system."]
    ],
    demos: [{ title: "Each stage's one job", steps: ["Step through the boot simulator.", "At each stage ask: what does it know, and what does it hand on?", "Then break one link in the chain of trust and see which stage refuses."], to: { id: "stages" } }],
    listen: ["Each stage only knows how to find and verify the next, with the first stage being very small.", "Each stage must hold a trusted key or hash of the next, anchored in hardware that cannot be changed.", "Services declare dependencies, and the init system starts them in an order that respects them, in parallel where it can."]
  },
  8: {
    misconceptions: [
      ["A scheduler is told how long each job will run.", "Real schedulers estimate behavior from the past, for example by moving a process down a queue each time it uses its full quantum."],
      ["Real-time means fast.", "Real-time means predictable: deadlines are met every time, even if the average speed is lower."],
      ["Adding cores solves scheduling.", "More cores add load balancing, cache and locality issues."]
    ],
    demos: [{ title: "Deadlines, not speed", steps: ["Open the real-time scheduler with a task set that is under 100% utilization.", "Compare rate-monotonic with earliest-deadline-first.", "Raise the load until one of them misses a deadline."], to: { id: "rt" } }],
    listen: ["Interactive jobs stay high because they yield early; the priority boost stops a job from being starved or from gaming the queues.", "EDF can use the processor fully; rate-monotonic guarantees only up to a lower utilization bound.", "A single shared queue needs a lock, which becomes a bottleneck; per-core queues need balancing and cost cache locality when work moves."]
  },
  3: {
    misconceptions: [
      ["A buffer overflow just crashes the program.", "Overwriting a saved return address can redirect execution. Crashes are the harmless outcome."],
      ["One strong defense is enough.", "Each defense (canary, non-executable memory, randomized layout) stops some attacks, and an information leak can undo layout randomization."],
      ["Hashing a password is the same as encrypting it.", "A hash cannot be reversed, which is why it is used for storage. A fast, unsalted hash can still be cracked by guessing."]
    ],
    demos: [{ title: "Layers of defense", steps: ["In the stack simulator start with no defenses and overflow the buffer.", "Turn on one defense at a time and ask what the attacker must now do.", "Finish with the leak switch and discuss why defense in depth is needed."], to: { id: "defenses" } }],
    listen: ["A canary stops simple overwrites but not a leak; non-executable memory stops injected code but not code reuse; randomization is undone by a leak.", "Fast hashes let attackers test billions of guesses a second; a salt makes each password separate, and repeating the hash makes each guess slower.", "A concrete system, with specific threats in each STRIDE category, and a sensible first mitigation."]
  },
  17: {
    misconceptions: [
      ["RAID is a backup.", "RAID keeps a system running through a disk failure. It does not protect against deletion, corruption or a fire."],
      ["RAID 5 survives any two failures.", "It tolerates one disk failure, and a second failure during a rebuild loses data."],
      ["SSDs can be overwritten in place like disks.", "Flash must be erased in large blocks before a page is rewritten, so the drive remaps writes and later copies valid pages (garbage collection)."]
    ],
    demos: [{ title: "Fail a disk, then another", steps: ["In the RAID simulator select RAID 5 and fail one disk, then a second.", "Repeat with RAID 6 and RAID 10.", "Ask students to rank the options by how much capacity they give and how many failures they survive."], to: { id: "raid" } }],
    listen: ["RAID 6 or mirrored striping depending on size and rebuild time, and an offsite backup for deletion and disaster.", "The commit record: one small write that makes the whole logged update either happen or not.", "Less spare space means garbage collection copies more valid pages, which means more writes and more wear. TRIM tells the drive which blocks are free."]
  }
};
