> How Claude Code should work in this repo — the collaboration contract, engineering standards, design rules, and the documents that hold the spec. This file is deliberately stack-neutral and meant to be reused across repos. Product scope and behaviour live in `PRODUCT.md`.

# Instructions for Claude Code

## About this document
Author: Marek Kultys
Project: Garden Designer

This is a **base template**. Everything outside *Project profile* is meant to hold on every repo I work on, so it stays free of any one project's stack, platform or domain. Starting a new repo means: copy this file, rewrite *Project profile*, reset the version tracker to 0.1, and change nothing else. If a rule below turns out to be true of only one project, it is in the wrong place — move it into the profile or into `PRODUCT.md`.

### Version tracker
| Date | Version | Changes |
| ---- | ------- | ------- |
| 30-08-2026 | 0.1 | First generic draft, derived from the SwimCharts `CLAUDE.md` v0.19. Platform, language and domain rules replaced with stack-neutral equivalents; the Apple-specific privacy-manifest and on-device rules generalised into *declared facts* and *runtime observation*; per-project facts fenced into *Project profile*; two practices already visible in my own docs added as rules — record the non-obvious decision, and write down what the model does not know. |
| 30-08-2026 | 0.2 | Reduce the template to make it more general. |
| 30-08-2026 | 0.3 | Add rule about backwards compatibility |

Claude must always observe these rules.

---

## Project profile
<!-- PER-PROJECT. This is the only section that changes between repos. Rewrite it wholesale; leave everything below it untouched. -->

- **Project:** `proto-garden-designer` — a browser prototype of a garden-design simulation for semi-professional garden designers. Draw a plot, plant it, then scrub time of day, time of year and twenty years of growth, and watch the drawing answer back.
- **Stack:** TypeScript (strict), React 18, Vite, zustand, Vitest, Playwright. All drawing is hand-rolled canvas 2D. No CSS framework, no UI component library, no charting library.
- **Run it:** `npm run dev` → `http://localhost:5173`. Two build targets share one source tree: `npm run build`, and `SINGLEFILE=1 npm run build` for one self-contained `dist/index.html` with zero network requests, which is what testers actually receive.
- **Verification:** `npm test` (unit tests over the models), plus the browser checks in `scripts/`, which drive the real app through `window.gardenStore`. There is no single verify script yet — see *Testing and verification*.
- **Documents present:** `PRODUCT.md` (scope, principles, trade-offs, roadmap), `README.md` (how to run it, and why the code is shaped the way it is). Not yet written: `DEVELOPMENT-PLAN.md`, `VERSIONS.md`, `GUIDE.md`, `LINKS.md`.
- **Design source:** none yet. There is no Figma file for this prototype; the design was made in code. The *Design reference* rules below apply from the moment a Figma file exists, and not before.
- **Standing claims about the built artifact:** it runs entirely in the browser, transmits nothing, and stores nothing beyond the tab. `scripts/check-singlefile.mjs` enforces the zero-off-origin-request half of that. Those are the facts the *declared facts* rule has to keep true.
- **Branch flow:** develop on `develop`.

---

## Working with a non-engineer
- **Before every build, summarise what you will do in non-technical terms**, focusing on the outcome, and ask for permission to build. I want to understand what you plan to achieve before you achieve it.
- **After completing each task or version scope, give me a non-technical summary report**, focused on what it now does for the person using it rather than on what changed in the code.
- **Whenever you change anything in code, end your reply with a recommended commit description** (5–10 words) I can use when committing.
- **Keep me involved in your thought process.** I may not be an engineer but I am smart and willing to dive into any topic with you. Explain the trade-off you are making, not just the choice.
- **Tell me when I am wrong.** If my instruction conflicts with something already validated, or rests on a premise the code contradicts, say so before building rather than after.

## Reference documents
- **Product definition is in `PRODUCT.md`** — the destination: what it is, who it is for, what it deliberately does not do, and what it is meant to find out. **Read it before implementing any feature.**
- **Version Tracker rows are an index, not a narrative.** Each row says *what changed and why* in **one or two sentences (~150 characters)** and **points at** the section, item, or sibling document that carries the detail — it never restates it. Keep out: file names, API calls, exact values, test counts, and the blow-by-blow of what was tried before it worked; those belong in the code, the spec section, or the plan item. A row that needs more than two sentences is a sign the detail belongs somewhere else. **Append new rows below the last one**, ascending by version and date — never insert above.
- **Write down the decision that looks arbitrary.** When the obvious implementation is wrong and the fix is not self-evidently better, record *the failure it avoids*, not just the fix — in a comment where it is short, in the README where it shapes the whole codebase. The next reader, me included, will otherwise "simplify" it straight back into the bug.
- **Be honest about what the model does not know.** Where an implementation simplifies reality, say so in `PRODUCT.md` under known trade-offs rather than smoothing over it. A stated limitation is a feature of the document; a hidden one is a defect in the product.

## Code structure
- **One feature per file.** Keep view and component bodies short — extract a subview if the body runs past ~50 lines.
- **Separate the layers:** data access, business logic, and presentation. Never reach for data from inside a view, and never put a calculation somewhere it cannot be tested without a UI.
- **Derived state is a function, not a copy.** Anything that can be computed from inputs should be computed from inputs, rather than stored alongside them and kept in sync by hand. Two sources of truth for one fact will disagree.
- **All design token values — colours, typography, spacing, timings — are referenced from a central constants file, never hardcoded inline.**
- **Handle the absent case explicitly.** No force-unwrapping, no non-null assertions, no `as any`, no empty catch. If the type checker is in the way, it has found something; do not suppress it to get past it. Run the language's strictest reasonable settings and keep them on.
- **Use the language's modern async idiom** (`async`/`await` or equivalent) rather than callbacks, and keep concurrency confined to a deliberate boundary rather than scattered through the code.
- **Do not restructure build or project configuration** — build files, project files, CI definitions, dependency manifests — without asking. I manage those by hand and a silent edit there is expensive to find.
- **Use the ecosystem's standard package manager**, and only one.

## Testing and verification
- **Write unit tests for all calculation, aggregation and derivation logic**, at each merge.
- **Test the models against published figures, not against their own output.** A test that asserts a function returns what it currently returns proves only that nobody has touched it. Where a real-world reference exists — a published table, a standard, a measured value — assert against that. Where it does not, assert the properties that must hold: monotonic, bounded, conserved, symmetric, never negative, and internally consistent with the other axes.
- **Pre-test against frozen real data before testing on the real thing.** Where sample data exists, freeze a copy as a golden fixture, run the logic over it, and assert the outputs match the known-good values. This catches the arithmetic without a device, a browser or a network in the loop.
- **Before committing anything non-trivial, run the project's verify script and keep it green.** One script, run by one command, that does every device-free check in one pass — type check, unit tests, every build target, and any structural checks. **CI runs the same script** on every push to the integration branches and every pull request, so a red CI is a real regression rather than a difference of environment. If the project has no such script yet, that is the first thing worth building.
- **Automated checks never replace using it.** Anything involving real hardware, real permissions, real data or the look of the thing stays validated by me on the real target.
- **Backwards compatibility** The app will be tested and further developed while real garden design work is carried on in it in parallel. Whenever you are making any changes or adding functionality or features, maintain backwards compatibility with the JSON format used in exports and imports, so that I can port old projects into the updated app. Whevever backwards compatibility is not possible, always flag this before build and explore the ways in which it can be maintained.

## Git and branches
- **I do all git non-read operations: commit, push, merge, tag, branch.** Read-only git — `status`, `log`, `diff`, `show` — is fine and encouraged.
- **Branch flow.** Work happens on a `garden-desing-prototype-*` branch; when ready, I merge that into`develop`; and then when happy with the code I merge into `master` only once a full version is validated.

## What not to do
- **Never add a third-party dependency without my explicit approval.** Each one is a thing to audit, update, and declare.
- **Never implement a feature that is not specified in `PRODUCT.md`.**
- **Never assume a missing specification. Ask me rather than inventing behaviour** — an invented behaviour that happens to be reasonable is harder to find later than one that is obviously wrong.
- **Never widen the scope of a fix.** Fix what is broken; tell me about the rest.
- **Never delete or rewrite my work to make a check pass** — not a test, not a validated behaviour, not a document. If something has to give, say what and why, and let me choose.
