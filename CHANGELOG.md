# Changelog

All notable changes to the content and behavior of this site are listed here, newest first, so instructors can see what changed between
terms. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

**Things worth knowing when you update a course that links to this site**

* **Module numbers follow the course order.** Module 1 is first and Module 19 is last, and the page address starts with the same number (for example `modules/05-processes.html`). If a module is ever added or moved, the numbers after it change with it.
* **Quiz progress is tied to the wording of a question.** Learners' saved results are stored against a short fingerprint of each question's text.
  If a question's wording is edited, that one question counts as unanswered again for learners who had answered it. Changes of this kind are
  marked **(resets saved progress for that item)** below.
* **Old page addresses keep working.** The site-level pages (study tools, glossary, problems and the rest) moved into `pages/`. The published site redirects the old addresses, including `?` and `#` parts, so existing links and bookmarks still work. New links should use the `pages/` address.
* **Shared problem links stay stable.** Practice-problem links such as `problems.html#p=disk:48213:2` keep producing the same problem and answer.
  A change that would alter one is marked **(changes shared links)**.

## [Unreleased]

### Changed
- **Modules renumbered in course order.** The numbers used to be the order the modules were written; they now run 1 to 19 in the order a learner reads them (Security in depth is Module 3 and The boot process is Module 4, for example). Page addresses changed to match.
- **Tidier source tree:** the site-level pages now live in `pages/`, leaving only `index.html` and `404.html` at the top. Old addresses redirect on the published site.
- **Interface polish:** the theme switch is now an icon button (a moon in light mode, a sun in dark mode) with a label that says what it will do, and it follows the system setting until you choose; the home page Parts fold and unfold (with Expand all and Collapse all, remembered in your browser, and always open when printing or when a link points at one); and the home page links to the Hands-on labs.

### Added
- **Shareable simulation setups**: a "Copy link to this setup" button on 22 simulations (schedulers, page replacement, disk, Banker's, paging, memory allocation, Amdahl's law, RAID, SSD wear, journaling, the stack-overflow demo and more). Opening the link restores the setup; invalid or oversized links are ignored.
- **Hands-on with Docker** (optional): `handson/` with an overview, a troubleshooting page, a short appendix on Windows containers and Labs 0 to 8 (the big idea: containers share a kernel; a tour of Linux distributions; processes and namespaces; resource limits with cgroups; filesystems; system calls with `strace`; init, signals and zombies; booting xv6 under an emulator; exploring other operating systems with a verified OpenBSD boot, an honest feasibility list and a worksheet), each with real example output and knowledge checks.
- **Search** now also finds study paths, discussion prompts, teaching notes and the study tools and handouts pages.
- **Study paths** (`paths.html`): seven ordered routes through lessons, simulations, labs and practice.
- **Discussion and journal prompts** on every module page ("Think, discuss, write"), also printable with writing space.
- **Teaching notes** (`teaching.html`) for instructors: misconceptions, a classroom demonstration and what to listen for, for every module.
- **Printable handouts** (`handouts.html`): a study guide with check-off objectives, a quiz worksheet, a matching answer key (print it separately), and a glossary sheet, for any choice of modules. The cheat sheet now prints in two columns.
- **Printing**: a print stylesheet (black on white, no menus or controls, only the chosen code language, tables and code kept whole, link addresses spelled out) and a friendly 404 page that works from any folder. Every page now carries link-preview tags (title, description and the logo) so shared links look right.
- **Module 3, Security in Depth** (part: Foundations): a stack-frame simulator showing how an overflow reaches the return address and what a canary, non-executable memory, ASLR and an information leak each change; password-guessing time estimates and a salted, repeated hashing demo; and STRIDE threat-modeling exercises for three small systems. Two C and Python examples (a simulated stack frame, password hashing with its own SHA-256).
- **Module 17, Storage Reliability** (part: Memory and storage): RAID 0, 1, 5, 6 and 10 with failing disks, XOR parity and rebuilding, rebuild-risk estimates, SSD write amplification and wear, and a journaling simulator that crashes at every step. Two C and Python examples (XOR parity and a write-ahead log).
- **Eight more operating systems** in the Module 18 compare tool and family tree: HarmonyOS, Fuchsia, Solaris and illumos, OpenBSD, z/VM, z/TPF, Plan 9 and MINIX 3, with five new quick comparisons and a short section on what each shows best.
- Module 18 has four new quiz questions.
- `CONTRIBUTING.md`: how to report a problem, how to run the tests (including the glibc check that CI effectively performs), the generated files to
  refresh, and what a good change looks like.
- Issue forms for a content problem, a bug and a topic request, and a pull-request checklist.
- "Report a problem or suggest a change" link in every page's footer. A fork can point it at its own repository (or remove it) with
  `OSData.site.repo` in `js/data/modules.js`.
- This changelog.

## [1.0.0] - 2026-11-17

First complete release.

### Lessons (17 modules in five parts)
- **Foundations:** 1 OS fundamentals and system calls, 2 security and access control, 16 the boot process.
- **Processes and the CPU:** 3 processes, 4 CPU scheduling, 5 threads and parallel performance, 17 advanced scheduling.
- **Concurrency:** 6 synchronization, 15 monitors and readers-writers, 7 deadlocks, 13 inter-process communication.
- **Memory and storage:** 8 memory management (including multi-level page tables and the TLB), 9 virtual memory, 10 disk scheduling and I/O, 11 file systems.
- **Modern systems:** 12 operating systems beyond Windows, macOS and Linux (with a compare tool and a family tree), 14 virtualization and containers.
- Each module has learning objectives, key takeaways, a collapsed **Going deeper** section for advanced readers, and free further reading.
- The home page, the Modules menu and the Previous/Next links follow the order of the parts.

### Simulations
- More than 40 interactive d3 simulations with playback controls where they help: scheduler, page replacement, disk arm, Amdahl, race condition,
  bounded buffer, Banker's algorithm, dining philosophers, page-table walk with a TLB, pipes and message queues, namespaces, control groups,
  VM exits, boot stages, service start order, multilevel feedback queue, real-time scheduling, work stealing, and more.
- Side-by-side comparison of two schedulers (Module 6) and two page-replacement policies (Module 14).
- Results tables in Modules 6, 15 and 8 can be copied or downloaded as CSV.

### Code in C and Python
- 18 lesson examples, each in C and Python with the same numbered comments and identical output. Both versions are compiled and run by the tests.
  The Python tab says honestly where an idea is clearer in C or contrived in Python.
- 4 Python labs (processes, threads and the GIL, system resources, semaphores and deadlock), with C versions of Labs 1, 2 and 4.
- Syntax-highlighted source viewer with a C and Python tab, remembered across pages.

### Study tools
- 134 quiz questions with instant feedback and explanations.
- Randomized calculation practice with worked solutions: scheduling, page replacement, disk scheduling, paging, effective access time,
  inode size, Amdahl's law, permissions, Banker's algorithm and memory allocation. Answers are checked against independent calculations.
- Flashcards from the glossary, 17 scenario questions, a timed exam mode with a review of misses, and a private progress record kept only in the
  learner's browser (exportable, importable, clearable).
- A 161-term glossary whose entries link back to the lesson where each term is discussed, 34 FAQ entries, a cheat sheet, and a site-wide search.

### Site
- Neutral, independent branding, light and dark themes, a layout that works on phones, and keyboard and screen-reader support. A real-browser
  audit (layout, tap targets and axe) is part of the checks.
- No build step, no framework and no CDN: d3, Prism and QUnit are vendored.
- MIT license. GitHub Actions runs the tests and deploys to GitHub Pages.
