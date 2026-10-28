#!/usr/bin/env bash
set -e

echo "==> Setting up Sandboxed DevContainer for toptube..."

# 1. Ensure keyring and dbus packages are installed
if ! command -v gnome-keyring-daemon &> /dev/null || ! command -v dbus-launch &> /dev/null; then
  echo "==> Installing dbus and gnome-keyring..."
  sudo apt-get update -qq
  sudo apt-get install -y --no-install-recommends dbus-x11 gnome-keyring libsecret-1-0 libsecret-tools -qq
fi

# 2. Setup auto-start and auto-unlock script for gnome-keyring with blank password
mkdir -p "${HOME}/.local/bin" "${HOME}/.local/share/keyrings" "${HOME}/.cache"
cat << 'KEYRING_EOF' > "${HOME}/.local/bin/init-keyring.sh"
#!/bin/sh
mkdir -p "$HOME/.local/share/keyrings" "$HOME/.cache"
if [ ! -f "$HOME/.local/share/keyrings/default" ]; then
  echo "login" > "$HOME/.local/share/keyrings/default"
fi
if [ -z "$DBUS_SESSION_BUS_ADDRESS" ] || ! pgrep -u "$(id -u)" dbus-daemon > /dev/null 2>&1; then
  eval $(dbus-launch --sh-syntax)
fi
if ! pgrep -u "$(id -u)" gnome-keyring-d > /dev/null 2>&1; then
  eval $(printf '\n' | gnome-keyring-daemon --unlock --components=secrets 2>/dev/null)
fi
cat << ENV_EOF > "$HOME/.dbus-env"
export DBUS_SESSION_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS"
export GNOME_KEYRING_CONTROL="$GNOME_KEYRING_CONTROL"
ENV_EOF
KEYRING_EOF
chmod +x "${HOME}/.local/bin/init-keyring.sh"

# Start keyring now
. "${HOME}/.local/bin/init-keyring.sh"

# 3. Ensure PATH and keyring auto-start are in ~/.bashrc
export PATH="${HOME}/.local/bin:${PATH}"
if ! grep -q 'init-keyring.sh' "${HOME}/.bashrc" 2>/dev/null; then
  cat << 'BASHRC_EOF' >> "${HOME}/.bashrc"

# Auto-start and unlock keyring for agy session
export PATH="$HOME/.local/bin:$PATH"
if [ -f "$HOME/.local/bin/init-keyring.sh" ]; then
  . "$HOME/.local/bin/init-keyring.sh" >/dev/null 2>&1
fi
BASHRC_EOF
fi

# 4. Install AGY (Antigravity CLI) if not present
if ! command -v agy &> /dev/null; then
  echo "==> Installing Antigravity CLI (agy)..."
  curl -fsSL https://antigravity.google/cli/install.sh | bash
fi

# 5. Configure Git Safety Guard (prevents agents from auto-pushing to remote)
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
