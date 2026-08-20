#!/usr/bin/env python3
import json
import re
import sys

def evaluate_command(command_line: str):
    if not command_line:
        return {"decision": "allow"}

    cmd = command_line.strip()

    # 1. HARD DENY - Critical System / OS Level Destruction & Privilege Escalation
    critical_deny_patterns = [
        (r"\brm\s+-[a-zA-Z]*(r|f)[a-zA-Z]*\s+/(?:\s|$)", "Prevented attempt to delete root system files (rm -rf /)."),
        (r"\brm\s+-[a-zA-Z]*(r|f)[a-zA-Z]*\s+(~|\$HOME)(/|\s|$)", "Prevented attempt to delete home directory."),
        (r"\b(rm|rmdir|unlink)\s+.*(/etc|/usr|/bin|/sbin|/System|/Library|/Applications|/var|~/\.ssh|~/\.config|~/\.zshrc|~/\.bashrc)", "Blocked modification/deletion of system and user security files."),
        (r"\b(sudo|su|doas)\b", "Privilege escalation (sudo/su) is strictly forbidden."),
        (r"\b(mkfs|fdisk|diskutil\s+eraseDisk|diskutil\s+eraseVolume)\b", "Raw disk modification or formatting commands are forbidden."),
        (r"\bdd\s+if=.*of=(/dev/|/)", "Raw disk block writing (dd) is forbidden."),
        (r":\(\)\s*\{\s*:\|:&\s*\};:", "Fork bomb detected and blocked."),
        (r"\b(shutdown|reboot|halt|poweroff)\b", "System power state commands are blocked."),
        (r">\s*(/etc/|/usr/|/System/|/Library/|/var/|~/\.ssh/|~/\.zshrc|~/\.bashrc)", "Writing directly to system or shell startup configuration files is blocked.")
    ]

    for pattern, reason in critical_deny_patterns:
        if re.search(pattern, cmd, re.IGNORECASE):
            return {
                "decision": "deny",
                "reason": f"Safety Guardrail: {reason}"
            }

    # 2. FORCE ASK - Destructive Actions requiring user confirmation (even with auto-approve)
    destructive_ask_patterns = [
        (r"\brm\s+-[a-zA-Z]*[rfRF]", "Command performs recursive or force file deletion ('rm -rf' / 'rm -r' / 'rm -f')."),
        (r"\b(rmdir|unlink)\b", "Command deletes directories or unlinks files."),
        (r"\bgit\s+reset\s+--hard", "Command resets git working tree discarding uncommitted changes ('git reset --hard')."),
        (r"\bgit\s+clean\s+-[a-zA-Z]*f", "Command permanently deletes untracked files ('git clean -f')."),
        (r"\bgit\s+(checkout|restore)\s+(\.|--\s*\.)", "Command discards all working tree modifications ('git restore / checkout .')."),
        (r"\bgit\s+push\s+.*(-f|--force)\b", "Command forces git push, potentially overwriting remote history."),
        (r"\bgit\s+branch\s+-D\b", "Command force-deletes a git branch."),
        (r"\bgit\s+stash\s+(drop|clear)\b", "Command permanently drops or clears git stashes.")
    ]

    for pattern, reason in destructive_ask_patterns:
        if re.search(pattern, cmd, re.IGNORECASE):
            return {
                "decision": "force_ask",
                "reason": f"Safety Guardrail: {reason} Manual confirmation required."
            }

    return {"decision": "allow"}

def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input.strip():
            print(json.dumps({"decision": "allow"}))
            return

        payload = json.loads(raw_input)
        tool_call = payload.get("toolCall", {})
        tool_name = tool_call.get("name", "")

        if tool_name == "run_command":
            args = tool_call.get("args", {})
            command_line = args.get("CommandLine", "")
            result = evaluate_command(command_line)
            print(json.dumps(result))
            return

        print(json.dumps({"decision": "allow"}))
    except Exception as e:
        # Fallback safely: if evaluation errors, don't crash the agent, but notify
        print(json.dumps({"decision": "allow"}))

if __name__ == "__main__":
    main()
