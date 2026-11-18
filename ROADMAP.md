# Roadmap: enhancements for OS Concepts

A working list of improvements to build together. Tick items off (`[x]`) as they ship, and add notes under them.

**Status key:** `[ ]` not started · `[~]` in progress · `[x]` done · `[-]` dropped (say why)
**Effort (rough guess):** **S** under half a day · **M** about a day · **L** several days

## Positioning and principles

* **An independent supplement.** This site is not tied to any one course or syllabus. It is meant to *supplement* whatever a learner is
  studying, and it is free to grow beyond any syllabus (see the MIT license).
* **From newcomer to advanced.** The reader is assumed to meet operating-system ideas for the first time, but every topic should
  carry them toward intermediate and advanced understanding. Pattern: a plain explanation first, then an opt-in
  **"Going deeper"** block (`<details class="deeper">`) for the advanced material (first used in Module 8, page tables).
* **Code in more than one language.** Samples use **C | Python tabs** (`<div class="code-tabs">`). Use C when it shows the real thing
  more honestly (pointers, bit fields, fixed-size structures) and say so in the C tab. The Python tab should say when Python hides the
  hardware reality or is a little contrived. Numbered comments `(1)`, `(2)` line up across both tabs, both versions must print
  identical output, and the tests compile and run them (`tests/examples.test.js`).
* **Labs and problems supplement the lessons**; they never replace them.

## Where we are today (baseline)

* 17 modules with 41+ d3 simulations, many with playback controls (scheduler, page replacement, disk arm, Amdahl timeline,
  fork tree, Banker's, race lab, process states).
* Module 12: family tree and a compare tool for 14 operating systems (share a comparison via `#compare=windows,zos`).
* About 100 glossary terms, each linked back to the lesson where it is discussed (`npm run build:glossary`).
* 25 FAQ entries, a mixed practice quiz, a cheat sheet.
* **Calculation practice:** 10 kinds of randomized problems (two levels) with worked solutions and shareable problem codes.
* **Python labs:** 4 labs with real, tested scripts (`labs/code/`) and sample output from real runs.
* About 185 automated tests (QUnit) in Node, including independent re-computation of every generated answer and actual execution
  of the Python labs. The logic, data and problem tests also run in a browser (checked in Edge, Chrome and Firefox).
* `npm run audit`: real-browser layout, tap-target and accessibility (axe) audit at phone, tablet and desktop widths.
* GitHub Pages deployment through Actions, MIT license, logo and favicon.

## Suggested order

| Phase | Theme | Why first |
|------:|-------|-----------|
| 0 | Quality pass | Biggest risk is things we have not looked at yet (phones, other browsers, accessibility, factual accuracy) |
| 1 | Randomized practice problems | Tests skills that multiple choice cannot; reuses the tested logic libraries |
| 2 | Shareable simulation links | Cheap, high value for assignments and discussion prompts |
| 3 | Instructor page and syllabus map | Makes the site usable in the course immediately |
| 4 | Python labs | Matches the syllabus activities |
| 5 | New content modules | Grow beyond the syllabus |
| 6 | More learning features | Flashcards, objectives, progress, scenarios |
| 7 | Site polish | Search, print, offline, feedback |

Phases are independent enough to reorder. Pick what matters most for the next class or assignment.

---

## Phase 0: Quality pass

Goal: find and fix what we have not verified. Nothing here adds features, but it protects everything else.

- [x] **QA-1 Phone and tablet layout** (S). Screenshot every page at 360, 768 and 1024 px wide. So far only desktop widths were checked.
  *Watch for:* wide SVG charts, the scheduler table, the compare table (it scrolls horizontally), long module menus.
  *Done when:* no horizontal page scroll (except inside tables), and controls are tappable (at least 44 px).
  *Result:* audited 17 pages at 360, 768 and 1280 px. Wide tables and charts now scroll inside their own boxes; charts shrink to 75% of their natural size and then scroll, so labels stay legible. Sliders and tree nodes meet the 24 px minimum target (WCAG 2.2).
- [x] **QA-2 Other browsers** (S). Check Firefox and Safari (and an iPhone/Android browser if possible). So far we only tested in Edge and jsdom.
  *Watch for:* `color-mix()`, `transform-box`, `:has`-style selectors, SVG text rendering, `file://` behavior.
  *Result:* `npm run audit` drives real Edge, Chrome and Firefox (set `AUDIT_BROWSERS=edge,chrome,firefox`) and is clean in all three. **Safari/WebKit and real phones are still untested** (not available here): worth a manual look on an iPhone.
- [x] **QA-3 Accessibility audit** (M).
  * Run an automated checker (axe or Lighthouse) on every page and fix the findings.
  * Give each chart a text alternative (a data table, or a short description of what to notice).
  * Verify keyboard-only use of every simulation and the compare tool, including visible focus.
  * Check color contrast in both light and dark themes, especially chart colors and `.muted` text.
  * Make sure live updates (`aria-live`) are not too chatty during animations.
  *Done when:* no serious/critical automated findings; a manual screen-reader pass of one module goes smoothly.
  *Result:* axe-core (WCAG 2.0–2.2 A/AA plus best practices) is clean on every page, in light and dark. Fixed: palette text contrast (new `--on-cN` and `--cNt` variables), glossary list markup, empty table headers, heading order, button names, nested interactive SVG, keyboard access to scrollable regions. **Still manual:** a real screen-reader pass, and written descriptions of what each chart shows (charts have short labels only).
- [~] **QA-4 Content accuracy review** (M). A subject-matter pass over lesson text, quiz explanations and especially Module 12's profiles.
  Mainframe and midrange entries (z/OS, z/VSE, IBM i) deserve a read by someone who works with them. Log corrections here.
  *Status:* I re-read the riskiest numeric and historical claims (rotational latency, address-bit arithmetic, EAT figures, scheduler history, OS dates, version-specific statements) and found no errors, but **a human subject-matter review is still needed**, especially for Module 12.
- [x] **QA-5 Performance check** (S). Page weight and load time on a slow connection. The home hero is now a 126 KB JPEG; `d3.min.js` is 280 KB.
  Consider loading d3 only on pages that use it (home and glossary currently load it unnecessarily).
  *Result:* the home page no longer loads d3 (280 KB); hero image is 126 KB; every page that loads d3 uses it.
- [x] **QA-6 Link and spell check** (S). Add an automated external-link check (none today) and a spell-check pass on content files.
  *Result:* the pages contain no external links (internal links, images and anchors are tested). cspell over the content found no real typos; British spellings were normalized to American English.

## Phase 1: Randomized practice problems with worked solutions

Goal: a "Problems" page where students practice the calculations they will meet on exams. A new problem each time, a checked answer, and step-by-step working.

- [x] **PP-1 Problem framework** (M). A small generator interface: `generate(seed)` returns the problem text, inputs, the correct answer and the worked steps.
  Seeded, so a problem can be reproduced from a link (see Phase 2). Numeric answers allow a tolerance.
  *Result:* `js/lib/problems.js`. A problem code `kind:seed:level` (for example `disk:48213:2`) always gives the same problem. Numeric, multiple-choice and text answers; a tolerance per problem; a "close" hint for near misses.
- [x] **PP-2 Generators** (L, one at a time):
  - [x] CPU scheduling: average waiting/turnaround time for FCFS, SJF, SRTF, RR (priority scheduling not included yet)
  - [x] Page replacement: count faults (FIFO, LRU, OPT) for a reference string
  - [x] Disk scheduling: total head movement (FCFS, SSTF, SCAN, C-SCAN, LOOK, C-LOOK); SSTF problems never contain ties
  - [x] Paging: split a logical address, translate through a page table
  - [x] Effective access time (page faults and TLB)
  - [x] Banker's algorithm: safe or unsafe, and grant or deny a request (the Need matrix and safe sequence appear in the worked steps)
  - [x] Memory allocation: first/best/worst-fit placements (one or two requests)
  - [x] Inode maximum file size
  - [x] Amdahl's law speedup (and the limit)
  - [x] Unix permissions (octal to symbolic, symbolic to octal, umask)
- [x] **PP-3 Interface** (M). Answer boxes, "Check", "Show steps", "New problem", difficulty (small or large numbers), and a link back to the matching simulation.
  *Result:* `problems.html`: topic and difficulty pickers, hint, worked solution, copy-link, first-try score for the visit (nothing is stored). Each lesson links to its matching topic. Open idea: link from each problem to the matching *simulation* with the same numbers (needs Phase 2).
- [x] **PP-4 Tests** (M). Every generator's stated answer must equal what the existing `js/lib/` code computes, across many seeds. This is where bugs would hide.
  *Result:* better than the plan: answers are compared with *independent* re-implementations written in the test (a separate scheduler, page-replacement and disk calculators, and a brute-force search over all process orderings for Banker's), across 240 problems per kind, plus textbook cases and a link-stability snapshot. This caught a real bug (a link such as `constructor:1:1` was accepted).

*Open question:* should answers accept partial credit (e.g., correct method, wrong arithmetic)? Probably show "your answer vs. correct" with the steps. Not done: the page currently shows the correct answer and steps, but does not grade intermediate steps.

## Phase 2: Shareable simulation links

Goal: an instructor can assign "run this exact case and explain it" by sending one URL. The compare tool already works this way.

- [ ] **SL-1 URL state for simulations** (M). *(Already done for practice problems: `problems.html#p=disk:48213:2`, and for the OS compare tool: `#compare=windows,zos`.)* Encode inputs in the hash:
  scheduler (processes, algorithm, quantum), page replacement (string, frames, algorithm), disk (queue, head, algorithm),
  Banker's (matrices), paging (page size, table, address), memory allocation requests.
- [ ] **SL-2 "Copy link" button** on each simulation (S).
- [ ] **SL-3 Safe parsing** (S). Ignore bad or oversized input in links; never execute or inject it.
- [ ] **SL-4 Tests** (S). Round-trip: state to link to state, plus malformed links.

## Phase 3: Instructor page and syllabus map

Goal: make the site easy to use in the actual course.

- [ ] **IN-1 Learning paths** (S). *Reframed:* the site is an independent supplement, so instead of mapping one course's syllabus,
  provide a few study paths (newcomer to advanced; "how programs run"; "memory and storage"; "concurrency"; "security") that name which
  lessons, simulations, labs and problems to use in what order. Anyone can then map a path onto their own course.
- [ ] **IN-2 Prompts** (M). Discussion and journal prompts per module, each linked to a simulation or comparison ("use the scheduler to show a convoy effect, then argue for a better algorithm").
- [ ] **IN-3 Answer keys and teaching notes** (M). Notes on common misconceptions and suggested in-class demos.
- [ ] **IN-4 Printable handouts** (M). A print stylesheet and print-friendly versions of the cheat sheet and key tables (see Phase 7).

## Phase 4: Python labs

Goal: hands-on practice that matches the syllabus activities (system utility processes, implementing threads, exploring system resources with Python, semaphores and deadlocks).

- [x] **PY-1 Lab page format** (S). Objective, setup, annotated starter code, expected output, "what to notice", common mistakes, an extension.
  *Result:* every lab has: objectives, setup, "predict first", the script (injected from the real file by `npm run build:labs`, with Download and Copy), example output, numbered "what to notice", "try it" experiments, common mistakes, journal-style reflection questions and an extension.
- [x] **PY-2 Labs** (M each):
  - [x] Processes: `os.fork`, `subprocess`, process trees, zombies (Lab 1; the fork half is Unix-only and was verified on real Linux in Docker)
  - [x] Threads: threading, locks, race conditions (matching the race-condition lab here), `multiprocessing` and the GIL (Lab 2)
  - [x] System resources: `psutil` (CPU, memory, disks, processes), with sample output (Lab 3; the sample output is a clearly labelled illustrative example, not a real machine's process list)
  - [x] Semaphores and deadlock prevention: bounded buffer, dining philosophers with ordering (Lab 4)
- [x] **PY-3 Decision: run Python in the browser?** (S to decide).
  Option A: annotated code and sample output only (small, fully offline, safe).
  Option B: Pyodide in the page (editable and runnable code, but roughly 10 MB vendored, slower first load, and no real `fork` or `psutil`).
  *Decision:* Option A. The labs are about real OS behavior (`fork`, real threads, `psutil`) that a browser sandbox cannot show. Revisit only for small, pure-Python warm-ups.
  *Tested:* `tests/labs.test.js` actually runs every script (and checks the page shows exactly the script's code). Two real bugs were found by running them: unflushed output reordering after `fork`, and a GIL demo whose tasks were too small to show any effect.

## Phase 5: New content modules

Each new module follows the existing pattern: lesson, one or more simulations (pure logic in `js/lib/` with tests, UI in `js/sims/`), quiz questions, glossary terms with `<dfn>` markers, and FAQ entries.

- [x] **C-1 Virtualization and containers** (L). Hypervisors (type 1 and 2), VMs vs. containers, namespaces, cgroups, a "what is isolated?" comparison. **Done:** Module 14, with five simulations and two tested C and Python examples.
- [x] **C-2 Boot process** (M). Firmware (BIOS/UEFI), bootloader, kernel start, init. A step-through animation. **Done:** Module 16, with four simulations and two tested C and Python examples.
- [x] **C-3 Multi-level page tables and TLB simulator** (L). Module 8 describes these but has no simulation.
  *Result:* a general N-level page-table and TLB library (`js/lib/pagetable.js`, tested against independent BigInt calculations and
  brute-force prefix counts), a step-through walk simulator (three real layouts: a 16-bit teaching machine, 32-bit x86 and x86-64),
  table-memory comparison, TLB reach and EAT, a tested C and Python translation example in language tabs, an opt-in "Going deeper"
  section (page-walk caches, ASIDs, huge pages, nested paging, KPTI), 8 quiz questions, 6 glossary terms and 2 FAQ entries.
  *Follow-ups:* a page-fault service step (demand paging) in the same simulator; copy-on-write demonstrated through the PTE flags.
- [x] **C-4 Advanced scheduling** (L). Multilevel feedback queue; real-time (rate-monotonic, earliest-deadline-first) with a schedulability check; multicore load balancing. **Done:** Module 17, with three simulations and two tested C and Python examples.
- [x] **C-5 Readers–writers, monitors and condition variables** (M). Simulator plus a starvation demonstration. **Done:** Module 15, with two simulations and two tested C and Python examples.
- [ ] **C-6 Security depth** (L). Buffer-overflow stack diagram, authentication and password hashing, a threat-model exercise.
- [ ] **C-7 Storage reliability** (M). RAID levels, SSD wear leveling and write amplification, journaling crash recovery.
- [ ] **C-8 More operating systems for the compare tool** (S each). HarmonyOS, Fuchsia, Solaris/illumos, OpenBSD, z/VM, z/TPF, watchOS/tvOS, Plan 9, Minix.
  Each needs all 15 profile rows and a place in the family tree (the data tests enforce this).
- [x] **C-9 Inter-process communication** (M). Pipes, shared memory, message passing, sockets with a visual. **Done:** Module 13, with a pipe and message-queue explorer, a cost comparison, and three tested C and Python examples (pipe, socket pair, shared memory).

## Phase 6: More learning features

- [x] **L-8 "Going deeper" tiers for every module** (L). Add an opt-in advanced block to each lesson (the pattern from Module 8) so readers can move from beginner to advanced inside one site. **Done:** every module 1–12 has one, and a page test requires it.
- [x] **L-9 C | Python tabs in the labs and older lessons** (M). Where C shows the real thing better (`fork`/`exec`, threads with pthreads, semaphores, signals), add a tested C version next to the Python one, with a note on how the two differ. **Done:** Labs 1, 2 and 4 and seven lesson examples (modules 1, 2, 5, 6, 8, 9, 11) have tested C and Python tabs.
- [x] **L-10 Group modules into parts** (M). Foundations, Systems in practice, Security, Modern infrastructure, so the list stays coherent as it grows past 12 modules. **Done:** five parts with a reading order; the home page, jump menu and Previous/Next links follow it, and each lesson names its part.
- [x] **L-1 Learning objectives, key takeaways and further reading** per module (M). Map objectives to the course competencies. Include free references (for example OSTEP) next to the course text. **Done:** Every module has objectives, takeaways and free reading (OSTEP chapters, Linux manual pages and kernel documentation), rendered from `js/data/study.js`, searchable, with link shapes checked by tests.
- [x] **L-2 Flashcards** (S). Built from the glossary, with "I knew it / still learning" piles. **Done:** `flashcards.html`: weighted by box, term-to-definition or the reverse, with keyboard shortcuts.
- [x] **L-3 Progress tracking** (M). Modules visited and quiz scores kept in the student's own browser. Private by default; the instructor cannot see it, and students can export or clear it. **Done:** `progress.html`: modules visited, per-question mastery, flashcard boxes and exam scores, kept only in the browser, with validated export, import and clear.
- [x] **L-4 Scenario questions** (M). "Which scheduler, page-replacement policy or OS fits this situation, and why?" with a model answer. **Done:** `scenarios.html`: 17 scenarios, each with a note on why every option does or does not fit.
- [x] **L-5 Side-by-side algorithm comparison** (M). Two schedulers (or page-replacement algorithms) on the same workload, stacked. **Done:** Compare two schedulers (Module 4) or two page-replacement policies (Module 9) on one workload, with a plain-language verdict.
- [x] **L-6 Exam mode** (M). Timed, shuffled, scored quiz with a review of misses. **Done:** `exam.html`: shuffled, timed, no feedback until submission, per-module score and review of misses.
- [x] **L-7 Export results** (S). Copy or download a simulation's results table (CSV) for journals and reports. **Done:** Copy or download any results table as CSV (formula-safe), in Modules 4, 10 and 17.

## Phase 7: Site polish

- [x] **P-1 Site-wide search** (M). Client-side index of lessons, glossary and FAQ. **Done:** `search.html`, covering lessons, glossary, FAQ, labs, cheat sheet and OS profiles, with a generated page-text index and highlighted results.
- [ ] **P-2 Print stylesheet** (S).
- [ ] **P-3 404 page and social preview** (S). Open Graph/Twitter card meta with the logo (needs the final site URL).
- [ ] **P-4 Feedback and contribution** (S). "Report an issue" link, `CONTRIBUTING.md`, issue templates.
- [ ] **P-5 Offline use** (M). A service worker so the site works without a connection and can be installed. (Careful with cache invalidation.)
- [ ] **P-6 Changelog** (S). A short `CHANGELOG.md`, so instructors know what changed between terms.
- [x] **P-7 License** (S). MIT, chosen so that people can copy and adapt the material. The file is `LICENSE.txt` (linked from every page's footer and shipped with the deployed site), and the README explains reuse in plain language.
  *Still optional:* the copyright line reads "The Operating System Concepts contributors". Replace it with a name or organization if you prefer.

---

## Working agreement

For every item:

1. **Logic first:** new calculations go in `js/lib/` (pure, no DOM) with tests using known answers.
2. **Tests with the feature:** page-level tests drive the new controls; the data tests cover new content.
3. **Accessible by default:** keyboard operable, text alternatives for charts, works in both themes and at phone width.
4. **No CDN:** third-party code is vendored with its license.
5. **Check visually** in a real browser before calling it done.
6. **Update this file** (status and notes) and the README when something ships.

## Questions to settle with the instructor

- Which phase should come first for the next assignment or term?
- Should student progress and scores be tracked at all, and if so is "private to the student" acceptable?
- Are the Python labs meant to replace or supplement the course's Codio activities?
- Is there a deadline (term start, a specific assignment) that sets the order?
- Who can review the Module 12 profiles, especially the mainframe and midrange entries?
- (Optional) What copyright holder name should replace "The Operating System Concepts contributors" in LICENSE.txt?

## Notes and decisions

*(Add dated notes here as we work through the list.)*

- **Phase 0 (quality pass) found and fixed:** a stray literal "null" shown in the scheduler's CPU strip, the family-tree panel,
  the compare table and Banker's step list (DOM `replaceChildren` prints `null` as text), now guarded by `OSUI.fill` and a test that
  scans every page for `null`/`undefined`/`NaN`. The test was first written with `\b` boundaries and *missed* the bug
  (it rendered as `nullDone:`), so it now uses lookarounds. Lesson: prove a regression test fails against the bug.
- Added `npm run audit` (real-browser layout, tap-target and axe checks). It needs locally installed browsers, so it is not part of `npm test`.
