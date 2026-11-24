# Operating & Safety Rules

These rules apply unconditionally across this repository.

## 1. Zero Destructive File Actions
- **No Force Deletions:** NEVER run destructive removal commands such as `rm -rf`, `rm -r`, `rmdir`, or file unlinking without explicit, step-by-step confirmation from the user.
- **Safe Alternatives:** If a file or folder must be cleaned up or replaced:
  - Create a backup copy (e.g. `filename.bak`) before overwriting.
  - Or propose moving obsolete files to a temporary `.trash/` directory inside the workspace.
- **Never Overwrite Without Verification:** Always read and inspect existing files before making edits or overwriting them.

## 2. Git Safety & Preservation
- **Preserve History & Untracked Files:** NEVER run destructive git commands like:
  - `git reset --hard`
  - `git clean -f` / `git clean -fd` / `git clean -fx`
  - `git checkout -- .` / `git restore .`
  - `git push --force`
  - `git branch -D` without confirmation
- **Review Changes:** Always check `git status` and `git diff` to verify changes before and after making modifications.

## 3. Automated Testing & Regression Prevention
- **Mandatory Test Execution:** After modifying any JavaScript file in `js/`, run the test suite to ensure zero regressions:
  ```bash
  node --test        # each suite in its own process
  node test/run.js   # all suites in one process (catches leaked globals); run both before committing
  ```
- **Asset Stamping:** After changing any file in `js/` or `css/`, re-stamp `index.html` and `sw.js` so browsers never mix cached and new files (the CSP keeps matching the import map, and the offline precache lists the new asset URLs). `test/assets.test.js` fails until you do:
  ```bash
  node scripts/stamp-assets.mjs   # or: just stamp
  ```
- **Zero External Dependencies:** Tests use Node's native `node:test` and `node:assert` standard library modules. Do NOT install heavy third-party testing frameworks or build tools (Jest, Vitest, Webpack, etc.) to keep the project 100% dependency-free and future-proof.
- **Core Test Coverage:**
  - `test/signal.test.js`: Geodesy (Haversine), distance-domain smoothing / gradients / hysteresis gain (same results at any point spacing), spatial discretization, UCI climb categorization.
  - `test/share.test.js`: Extrema/summit downsampling, packed binary (v4) serialization, URL hash round-trips and fuel plans in links.
  - `test/parser.test.js`: GPX XML ingestion, elevation forward-filling, waypoint classification.
  - `test/renderer.test.js`: Physical dimension scaling, color themes, SVG markup structure.
  - `test/escape.test.js`: Markup escaping and shared-link payload sanitization (untrusted input).
  - `test/ui-modules.test.js`: UI modules exercised against a stub DOM (`test/helpers/stub-document.js`).
  - `test/pacing.test.js`: Power-equation speed model, average-speed calibration, time-based fuel spacing.
  - `test/history.test.js`: Undo / redo snapshots, edit merging, history resets.
  - `test/climb-detail.test.js`: Climb segmentation, climb detail stickers, stacked export and print sheets.
  - `test/climb-editing.test.js`: Stable climb ids across re-detection, the detection threshold, manual climbs (merge / split), climb settings in links.
  - `test/a11y.test.js`: Keyboard-movable labels, accessible names, announced toasts, dialog focus trap.
  - `test/fuzz.test.js`: Seeded mutation fuzzing of GPX / TCX / FIT / share links through parse, store and render (`just fuzz <n> <seed>` for deep runs). Turn every finding into a regression case in `test/robustness.test.js`.
  - `test/assets.test.js`: `index.html` asset version stamps, import map coverage and its CSP hash are current; `sw.js` precaches every asset; the web manifest is valid. New test files must also be listed in `test/run.js`.
  - `test/robustness.test.js`: Hostile / broken input: crafted share links (setting clamps, compression bombs, size caps), invalid coordinates, GPS glitches, input size limits, corrupted saved plans, XML entity attacks, CSP compatibility. Add a case here for every new input path.
- **Keep Tests Updated:** When introducing new algorithms, formulas, or formats, add corresponding test cases to `test/`.

