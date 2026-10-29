# Operating & Safety Rules

These rules apply unconditionally across this repository.

## 1. Zero Destructive File Actions
- **No Force Deletions:** NEVER run destructive removal commands such as `rm -rf`, `rm -r`, `rmdir`, or file unlinking without explicit, step-by-step confirmation from the user.
- **Safe Alternatives:** If a file or folder must be cleaned up or replaced:
  - Create a backup copy (e.g. `filename.bak`) before overwriting.
  - Or propose moving obsolete files to a temporary `.trash/` directory inside the workspace.
- **Never Overwrite Without Verification:** Always read and inspect existing files before making edits or overwriting them.

## 2. Strict Workspace Boundary
- **Workspace Containment:** All read, write, create, and delete operations must strictly remain inside the repository workspace (`/Users/michi/Documents/coding/github/toptube`).
- **No System/User File Access:** Never access, modify, or create files in the user's home directory (`~`, `~/.ssh`, `~/.zshrc`, `~/.config`, etc.), system directories (`/etc`, `/usr`, `/var`, `/System`), or other projects.
- **No Elevated Privileges:** Never run commands with `sudo`, `su`, or modify file system permissions globally (`chmod -R 777`, `chown`).

## 3. Git Safety & Preservation
- **Preserve History & Untracked Files:** NEVER run destructive git commands like:
  - `git reset --hard`
  - `git clean -f` / `git clean -fd` / `git clean -fx`
  - `git checkout -- .` / `git restore .`
  - `git push --force`
  - `git branch -D` without confirmation
- **Review Changes:** Always check `git status` and `git diff` to verify changes before and after making modifications.

## 4. Automated Testing & Regression Prevention
- **Mandatory Test Execution:** After modifying any JavaScript file in `js/`, run the test suite to ensure zero regressions:
  ```bash
  node --test
  # or
  node test/run.js
  ```
- **Zero External Dependencies:** Tests use Node's native `node:test` and `node:assert` standard library modules. Do NOT install heavy third-party testing frameworks or build tools (Jest, Vitest, Webpack, etc.) to keep the project 100% dependency-free and future-proof.
- **Core Test Coverage:**
  - `test/signal.test.js`: Geodesy (Haversine), elevation smoothing, spatial discretization, UCI climb categorization.
  - `test/share.test.js`: 3D polyline delta encoding, extrema/summit downsampling, gzip payload serialization.
  - `test/parser.test.js`: GPX XML ingestion, elevation forward-filling, waypoint classification.
  - `test/renderer.test.js`: Physical dimension scaling, color themes, SVG markup structure.
  - `test/escape.test.js`: Markup escaping and shared-link payload sanitization (untrusted input).
  - `test/share-compat.test.js`: Frozen share links in `test/fixtures/` must keep decoding — never regenerate them; add a new fixture when the format changes.
  - `test/ui-modules.test.js`: UI modules exercised against a stub DOM (`test/helpers/stub-document.js`).
  - `test/pacing.test.js`: Power-equation speed model, average-speed calibration, time-based fuel spacing.
- **Keep Tests Updated:** When introducing new algorithms, formulas, or formats, add corresponding test cases to `test/`.

