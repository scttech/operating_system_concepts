/* Hands-on with Docker: the optional practice guide (handson/). One entry per lab page in handson/, in the order to do them,
 * and the knowledge checks for each.
 *
 * Labs:   { n, slug, title, summary, minutes, level, related: [module numbers], needs: [lab numbers that must be done first] }
 * Checks: { lab, q, choices, answer, explain }, or a short-answer question { lab, q, explain } with no choices (the learner thinks, then reveals).
 *         Four to six per lab, a mix of multiple choice, predict-the-output, short answer and "what would happen if". */
window.OSData = window.OSData || {};
window.OSData.handson = [
  { n: 0, slug: "00-setup-and-big-idea", title: "Setup and the big idea",
    summary: "Install and check Docker, run your first containers, and discover that containers do not have an operating system of their own: they share the host's kernel.",
    minutes: 30, level: "Beginner", related: [1, 19], needs: [] },
  { n: 1, slug: "01-linux-distro-tour", title: "A tour of Linux distributions",
    summary: "Compare Debian, Ubuntu, Alpine, Fedora and Arch containers. Different \"operating systems\" turn out to differ in user space: files, package managers and the C library.",
    minutes: 40, level: "Beginner", related: [18, 19], needs: [0] },
  { n: 2, slug: "02-processes-and-namespaces", title: "Processes and namespaces",
    summary: "See what makes a process \"inside\" a container, why the first process is special, and build a process-ID namespace by hand.",
    minutes: 40, level: "Intermediate", related: [5, 19], needs: [0] },
  { n: 3, slug: "03-resource-limits", title: "Resource limits (cgroups)",
    summary: "Give a container a memory limit and a CPU limit, watch the kernel's out-of-memory killer stop a runaway program, and compare CPU-bound and waiting workloads.",
    minutes: 40, level: "Intermediate", related: [6, 13, 19], needs: [0] }
];

window.OSData.handsonChecks = [
  // ---- Lab 0 ----
  { lab: 0, q: "You run uname -r in a Debian container and then in an Alpine container on the same computer. What do you see?",
    choices: ["The same kernel version both times", "A Debian kernel, then an Alpine kernel", "Two different version numbers, because each distribution ships its own kernel", "An error, because Alpine has no kernel"], answer: 0,
    explain: "Containers do not bring a kernel. Every container on a machine asks the same running kernel, so uname -r matches. Debian and Alpine differ in user space: files, libraries and tools." },
  { lab: 0, q: "Which of these is NOT part of a container image?",
    choices: ["The program and its libraries", "A package manager and configuration files", "A Linux kernel", "The files the program reads when it starts"], answer: 2,
    explain: "An image is a set of files (user space). The kernel belongs to the host, or on Windows and macOS to the hidden Linux virtual machine that Docker Desktop runs." },
  { lab: 0, q: "On Windows with Docker Desktop (WSL2), where does the Linux kernel used by a container come from?",
    choices: ["Windows itself, translating Linux calls", "A Linux kernel that Docker Desktop and WSL2 run in a lightweight virtual machine", "The Debian or Alpine image", "The Docker website, downloaded on each run"], answer: 1,
    explain: "Windows cannot run Linux programs directly. Docker Desktop starts a small Linux virtual machine, and every Linux container shares that one kernel. The kernel version string even says microsoft-standard-WSL2." },
  { lab: 0, q: "Predict: on a Mac you run docker run --rm fedora:43 uname -s. What does it print?",
    choices: ["Darwin", "Fedora", "Linux", "macOS"], answer: 2,
    explain: "uname -s prints the kernel name. The container's kernel is Linux (the one in Docker Desktop's virtual machine), not the Mac's Darwin kernel." },
  { lab: 0, q: "In a sentence or two: why is \"I am running an Alpine container\" not the same as \"I am running the Alpine operating system\"?",
    explain: "The container runs Alpine's user space (its files, libraries and tools) on top of someone else's kernel. The kernel is the core of an operating system, and the container does not have its own, so you have borrowed part of Alpine, not booted it." },

  // ---- Lab 1 ----
  { lab: 1, q: "Why is the Alpine image so much smaller than the Debian or Fedora image?",
    choices: ["Alpine has a smaller kernel", "Alpine uses a compact C library (musl) and small tools (BusyBox) and installs very little by default", "Alpine images are compressed and Debian images are not", "Alpine only runs on ARM"], answer: 1,
    explain: "Alpine is built for size: musl instead of glibc, BusyBox for many tools in one small program, and almost no extras. The kernel is not part of any image, so it cannot explain the difference." },
  { lab: 1, q: "What is the C standard library, and what does it have to do with system calls?",
    choices: ["A folder of C source files, used only when compiling", "A library of functions such as printf, malloc and fopen that programs call; many of them make system calls to the kernel on the program's behalf", "Another name for the kernel", "A program that checks C code for errors"], answer: 1,
    explain: "Programs rarely talk to the kernel directly. They call library functions, and the library makes the system calls. glibc (Debian, Ubuntu, Fedora) and musl (Alpine) are two implementations of the same job." },
  { lab: 1, q: "Predict: a program built on Debian is copied into an Alpine image and run. What happens?",
    choices: ["It runs exactly the same", "It prints: exec /hello: no such file or directory", "It runs but slowly", "The kernel translates it automatically"], answer: 1,
    explain: "The file exists, but the loader it names (/lib64/ld-linux-x86-64.so.2) does not, because Alpine has no glibc. The kernel reports the missing loader with a message that looks like a missing program." },
  { lab: 1, q: "Which of these would NOT help a Debian-built program run on Alpine?",
    choices: ["Compile it statically so it carries its own copy of the library", "Compile it on Alpine against musl", "Run the container with extra privileges", "Install a glibc compatibility layer in the Alpine image"], answer: 2,
    explain: "Extra privileges change what a container may do, not which libraries it has. The fix has to supply the library the program expects or remove the need for it." },
  { lab: 1, q: "In your own words: the message exec /hello: no such file or directory appeared even though /hello is plainly in the image. What is actually missing?",
    explain: "The program file is there, but a program built with glibc names a loader, /lib64/ld-linux-x86-64.so.2, that the kernel must start first to load the libraries. Alpine has no such file, so the kernel fails while trying to start the program and reports a misleading \"no such file\". The missing piece is the C library's loader, not the program." },
  { lab: 1, q: "A Debian container and a Fedora container run side by side on one machine. Which of these is the same for both?",
    choices: ["The package manager", "The C library", "The kernel", "The default shell"], answer: 2,
    explain: "Package manager (apt or dnf), C library version and shell can all differ. The kernel is shared." },

  // ---- Lab 2 ----
  { lab: 2, q: "What makes a process \"inside\" a container?",
    choices: ["It runs on a separate virtual CPU", "It is an ordinary process of the host kernel that has been placed in its own namespaces (and cgroups)", "It runs in an emulator", "It has a different kernel"], answer: 1,
    explain: "A container is not a machine. It is regular processes with a restricted view of the system (namespaces) and restricted use of resources (cgroups)." },
  { lab: 2, q: "What is a namespace?",
    choices: ["A folder for container images", "A kernel feature that gives a group of processes their own view of a system-wide resource, such as process IDs, host name or network", "A DNS name for a container", "A security password"], answer: 1,
    explain: "Linux has namespaces for process IDs, mounts, network, host name, inter-process communication, users and more. Each one hides the rest of the system's version of that resource." },
  { lab: 2, q: "Predict: you run docker run --rm alpine:3.22 ps. What does the output show?",
    choices: ["Dozens of processes, as on a normal Linux computer", "One process, the ps command itself, as PID 1", "Nothing, because ps is not installed", "The host computer's processes"], answer: 1,
    explain: "The container's first process is simply the command it was started with. Here that command is ps, so it is PID 1, and it is the only process in the container's PID namespace." },
  { lab: 2, q: "Why is PID 1 special in Linux?",
    choices: ["It always runs as the fastest process", "It is the only process allowed to use the network", "It cannot be stopped by anyone", "The kernel treats it as the init process: it adopts orphaned processes, and some signals are ignored unless it installs a handler"], answer: 3,
    explain: "PID 1 has extra duties and extra protection from the kernel. In a container, the program you start is PID 1, which is why signals and orphaned processes behave differently (Lab 6 explores this)." },
  { lab: 2, q: "One sleep process showed up as PID 1 in its own namespace, PID 7 in the container, and a five-digit PID from docker top. Why three numbers for one process?",
    explain: "PID namespaces nest, and each level numbers processes separately. The process is PID 1 in the innermost namespace, PID 7 in the container's namespace and a large number in the namespace of the Docker Desktop virtual machine. The NSpid line in /proc/PID/status lists every number it has." },
  { lab: 2, q: "Which command in this lab failed until you added --cap-add=SYS_ADMIN, and why?",
    choices: ["ps, because it needs to read /proc", "unshare, because creating a new namespace is a privileged operation that Docker's default policy blocks", "hostname, because it changes the network", "docker top, because it needs an extra capability"], answer: 1,
    explain: "Creating namespaces from inside a container needs the SYS_ADMIN capability. Docker's default seccomp policy blocks it, so you grant the one capability needed, only for this throwaway container." },

  // ---- Lab 3 ----
  { lab: 3, q: "A container is killed and docker inspect shows exit code 137. What does 137 mean?",
    choices: ["The program finished normally", "128 + 9: the process was ended by signal 9 (SIGKILL), for example by the kernel's out-of-memory killer", "The image could not be found", "A network timeout"], answer: 1,
    explain: "Exit codes above 128 mean death by signal: the code is 128 plus the signal number. Signal 9 cannot be caught or ignored. Together with OOMKilled=true, it points to the out-of-memory killer." },
  { lab: 3, q: "What is the difference between a memory limit (--memory) and a memory reservation (--memory-reservation)?",
    choices: ["They are the same setting", "The limit is a hard cap that triggers the out-of-memory killer; the reservation is a soft target the kernel tries to protect when memory is short", "The limit applies to disks and the reservation to RAM", "The reservation is checked by Docker, the limit by the application"], answer: 1,
    explain: "A limit is enforced: go past it and the kernel kills a process. A reservation is a softer promise that matters when the whole machine is under memory pressure." },
  { lab: 3, q: "Predict: a CPU-bound program takes 2 seconds with no limit. About how long does it take with --cpus=0.5?",
    choices: ["About 1 second", "About 2 seconds", "About 4 seconds", "It is killed"], answer: 2,
    explain: "The program can use the CPU for only half of each scheduling period, so the same work takes about twice as long on the wall clock. The CPU time it uses stays the same." },
  { lab: 3, q: "In a sentence or two: why did the program that only waits (sleeps) finish in the same time with and without --cpus=0.5?",
    explain: "A CPU quota only limits time spent running on the CPU. A program that sleeps is not using the CPU, so it never runs into the quota. This is why CPU limits slow compute-heavy jobs but barely touch programs that mostly wait for I/O." },
  { lab: 3, q: "Who actually enforces a container's memory and CPU limits?",
    choices: ["Docker's own scheduler, program by program", "The application, because it reads the limit and obeys it", "The CPU hardware", "The Linux kernel, using control groups (cgroups); Docker only sets them up"], answer: 3,
    explain: "Docker writes the limits into the kernel's cgroup settings, and the kernel's memory manager and scheduler enforce them. That is why you could read the numbers from /sys/fs/cgroup inside the container." },
  { lab: 3, q: "What would happen if you ran the memory test with --memory=64m but without --memory-swap=64m on a machine that has swap enabled?",
    choices: ["Nothing different: the program is always killed at 64 MiB", "The container could use swap as well, up to a larger total, so it might survive past 64 MiB of RAM before being killed", "Docker would refuse to start", "The program would run faster"], answer: 1,
    explain: "By default Docker lets a container use swap equal to its memory limit on top of the limit. Setting --memory-swap equal to --memory removes the extra, so the result is the same on every machine." }
];
