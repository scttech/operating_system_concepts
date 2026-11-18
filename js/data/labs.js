/* Lab list. Each lab is a page in labs/ plus runnable scripts in labs/code/. */
window.OSData = window.OSData || {};
window.OSData.labs = [
  { n: 1, slug: "01-processes", title: "Processes: launching, waiting and forking",
    summary: "Create child processes from Python, read exit codes, run children in parallel, and (on Linux/macOS) use fork, exec and wait.",
    related: [5, 6], minutes: 45, platform: "Part A: any system. Part B: Linux, macOS, WSL or Codio." },
  { n: 2, slug: "02-threads", title: "Threads, race conditions and the GIL",
    summary: "Watch a race condition lose updates, fix it with a lock, and measure when threads do and don't make Python faster.",
    related: [7, 9], minutes: 45, platform: "Any system." },
  { n: 3, slug: "03-resources", title: "Exploring system resources with psutil",
    summary: "Read CPU, memory, swap, disk and process information from Python and connect each number to an OS concept.",
    related: [6, 13, 14, 15], minutes: 40, platform: "Any system. Needs the psutil package." },
  { n: 4, slug: "04-semaphores-deadlock", title: "Semaphores and deadlock prevention",
    summary: "Build a bounded buffer with semaphores, then create a real deadlock with dining philosophers and fix it with resource ordering.",
    related: [9, 11], minutes: 50, platform: "Any system." }
];
