# Contributing

Thank you for helping. This is an independent, open teaching resource (MIT license), and it gets better when people who teach and
learn operating systems tell us what is wrong, unclear or missing.

## The quickest ways to help (no code needed)

* **A mistake or something confusing in a lesson, quiz, glossary entry or answer key:** [open an issue](https://github.com/scttech/operating_system_concepts/issues/new/choose)
  and choose *Content problem*. Say which page, quote the sentence, and say what you expected. A wrong answer in a quiz or problem is
  the most valuable report there is.
* **Something broken on the site** (a simulation misbehaves, a page does not fit a phone, a link is dead): choose *Bug report*.
  The browser and device help a great deal.
* **A topic you would like added:** choose *Topic request*. Tell us who it is for and what a learner should be able to do afterwards.

## What this project is, so contributions fit

* **A supplement, not a course.** It is loosely based on a typical first operating-systems course but is independent of any one course,
  institution or textbook, and it grows beyond them. Keep it neutral: no institution's branding or course codes.
* **From first-timer to advanced.** The main text is for someone meeting the ideas for the first time. Advanced material goes in the
  collapsed **Going deeper** block of a lesson, never in the way of a beginner.
* **Answers are always available** (instant feedback, worked solutions). Nothing is hidden behind a login or an instructor key.
* **Private by default.** Nothing is sent anywhere. Progress stays in the learner's own browser. No analytics, no CDN, no accounts.
* **Accessible.** Keyboard reachable, readable in light and dark themes, usable on a phone, text alternatives for pictures.
* **Tested.** Anything that computes an answer (a simulator, a generator, a code sample) is checked against an independent calculation.

## Setting up

You need Node.js 22 or newer. Python 3 is needed for the lab tests. A C compiler (or Docker) is needed for the C examples.

```bash
npm ci
python -m http.server 8000      # or: npm run serve   -> http://localhost:8000
npm test
```

There is no build step for the site itself: the pages are plain HTML, CSS and JavaScript that work from the folder.

### Generated files (run these after you change the pages)

Four sets of files are generated from the pages, and the tests fail if they are out of date:

| Command | Regenerates | Run it after you change... |
|---|---|---|
| `npm run build:labs` | the code listings embedded in lab and lesson pages | any file in `labs/code/` or `examples/` |
| `npm run build:glossary` | `js/data/glossary-index.js` (where each term is discussed) | any `<dfn data-term>` or the glossary |
| `npm run build:search` | `js/data/search-index.js` (text for the site search) | the text of any lesson, lab or the cheat sheet |
| `npm run build:meta` | the link-preview tags in every page's `<head>` | a page title or description, or `OSData.site.url` (set it to where your copy is published) |

When in doubt, run `npm run build`, which does all four. `npm run check` only reports what is out of date (each tool also has a `--check` form, for example `node tools/build-search-index.js --check`).

### Testing the way CI does

* `npm test` runs the whole suite with QUnit in Node. Page tests drive the real pages in jsdom.
* Open `tests/index.html` in a browser (or serve the folder) to run the logic tests there too.
* **C examples need a Unix.** On Windows run them in a container: `EXAMPLES_DOCKER=1 LAB_DOCKER=1 npm test`. CI uses glibc, so before you push,
  also run `EXAMPLES_IMAGE=debian:stable-slim EXAMPLES_DOCKER=1 LAB_DOCKER=1 npm test`. (A bug in one example only showed on glibc.)
* `npm run audit` opens every page in a real browser at phone, tablet and desktop widths, in light and dark themes, and checks for
  sideways scrolling, tiny tap targets and accessibility problems (axe). `AUDIT_BROWSERS=edge,chrome,firefox npm run audit` runs all three.

## Adding things

The README's **Adding content** section has the recipe for each kind of change: a module, a simulation, a code sample in C and Python,
a practice problem, a lab, a glossary term, an FAQ entry, a study aid. In short:

* A **simulation** has its logic in `js/lib/` (pure, with a test that checks it against something independent), and only the drawing in `js/sims/`.
* A **code sample** exists in C *and* Python in `examples/`, prints identical output, shares the same `(1)`, `(2)` comment numbers, and both
  versions are compiled and run by the tests. The Python note should say honestly when the idea is clearer in C, or contrived in Python.
* A **module** must be added to exactly one part in `OSData.parts`, have `js/data/study.js` entries, quiz questions (six or more), and a
  *Going deeper* block. The tests check each of these.
* **Quiz questions** have four choices, one answer, and an explanation that teaches rather than just confirms.

## Pull requests

1. Keep a pull request to one topic, and say what changed and why.
2. Run the tests (and the generated-file commands above). A pull request with failing tests, or with out-of-date generated files, cannot be merged.
3. Add or update tests with the change. If you fixed a bug, add a test that fails without the fix.
4. Update `CHANGELOG.md` under *Unreleased* when learners or instructors would notice the change.
5. Be careful with wording: write for a student seeing the idea for the first time, avoid jargon before it is defined, and prefer short sentences.

## Licensing of contributions

By contributing you agree that your work is released under the repository's [MIT License](LICENSE.txt), the same terms as the rest of the project.
Please do not add text, code or images you do not have the right to share, and do not copy material from textbooks or course notes.

## Conduct

Be kind and assume good intent. This is a teaching resource; questions from beginners are welcome, and corrections should be given
the way you would want one given to you.
