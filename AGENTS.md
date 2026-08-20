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
