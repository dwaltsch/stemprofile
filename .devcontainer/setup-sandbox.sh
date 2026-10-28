#!/usr/bin/env bash
set -e

echo "==> Setting up Sandboxed DevContainer for toptube..."

# 1. Install AGY (Antigravity CLI) if not present
if ! command -v agy &> /dev/null; then
  echo "==> Installing Antigravity CLI (agy)..."
  curl -fsSL https://antigravity.google/cli/install.sh | bash
fi

# 2. Configure Git Safety Guard (prevents agents from auto-pushing to remote)
echo "==> Configuring Git Agent Guard..."
HOOKS_DIR="${HOME}/.git-hooks"
mkdir -p "${HOOKS_DIR}"
cat << 'EOF' > "${HOOKS_DIR}/pre-push"
#!/bin/sh
if [ "$ALLOW_AGENT_PUSH" != "1" ]; then
  echo "" >&2
  echo "\033[1;31m========================================================================\033[0m" >&2
  echo "\033[1;31m[AGENT GUARD] 'git push' is blocked inside this sandboxed container!\033[0m" >&2
  echo "\033[1;33mThis prevents autonomous agents from pushing unvetted code to GitHub.\033[0m" >&2
  echo "" >&2
  echo "To manually push your work from inside this container, run:" >&2
  echo "  ALLOW_AGENT_PUSH=1 git push $@" >&2
  echo "\033[1;31m========================================================================\033[0m" >&2
  echo "" >&2
  exit 1
fi
EOF
chmod +x "${HOOKS_DIR}/pre-push"
git config --global core.hooksPath "${HOOKS_DIR}"
git config --global --add safe.directory '*'

echo "==> toptube DevContainer setup completed successfully!"
