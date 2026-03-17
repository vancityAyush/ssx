# SSH Script Redesign — Design Spec

## Problem Statement

The current `ssh.sh` has several issues:

1. **Poor UX** — numbered text input instead of interactive arrow-key menu
2. **No PowerShell support** — bash-only, excludes native Windows users
3. **Bugs** — `set -e` crashes on SSH test, no cleanup on failure
4. **Code duplication** — repeated ssh-keygen calls and input validation
5. **Hardcoded RSA** — GitLab/Azure force RSA-4096 despite ed25519 support
6. **No git config setup** — users must manually configure `git config` after key generation

## Solution Overview

Two scripts with feature parity:

| File | Shell | Menu UX | Distribution |
|------|-------|---------|-------------|
| `ssh.sh` | bash/zsh | bash-tui-toolkit `list` (bundled) | `curl \| bash` or `./ssh.sh` |
| `ssh.ps1` | PowerShell 5.1+ / pwsh 7+ | `[Console]::ReadKey()` arrow menu | `irm \| iex` or `./ssh.ps1` |

## Script Flow (both scripts)

1. **Provider selection** — arrow-key navigable menu: GitHub, Bitbucket, GitLab, Azure DevOps
2. **User input** — email (validated), key name (validated, no spaces), optional custom hostname
3. **Git config setup** — optional: prompt for git username, set `git config --global user.name` and `user.email`
4. **Key generation** — `ssh-keygen -t ed25519` for all providers (single code path)
5. **SSH agent + config** — platform-aware agent start, add key, write `~/.ssh/config` Host block
6. **Clipboard + browser** — copy public key to clipboard, open provider's SSH settings page
7. **Connection test loop** — interactive `ssh -T` with safe exit code handling
8. **Cleanup on failure** — trap handler removes partial key files and reverts config on error

## Interactive Menu — Bash

Bundle bash-tui-toolkit's `list` function and its minimal dependencies (`_cursor_up`, `_cursor_down`, `_clear_line`, raw key reading) into a `# --- TUI Functions ---` block at the top of `ssh.sh`. Approximately 40 lines of self-contained TUI code.

Usage:
```bash
providers=("Bitbucket" "GitHub" "GitLab" "Azure DevOps")
option=$(list "Select your Git provider" "${providers[@]}")
```

Returns 0-based index. Arrow Up/Down to navigate, Enter/Space to select.

Y/N prompts (custom hostname, git config) stay as simple `read -r -p` — no arrow nav needed for binary choices.

## Interactive Menu — PowerShell

A `Show-Menu` function using `[Console]::ReadKey($true)` to detect arrow keys. Highlights current selection with `Write-Host -ForegroundColor`. Returns on Enter or Space.

```powershell
$providers = @("Bitbucket", "GitHub", "GitLab", "Azure DevOps")
$option = Show-Menu -Title "Select your Git provider" -Options $providers
```

## Git Config Setup

After collecting email and key name:

1. Prompt: `Do you want to configure git username and email? (Y/N)`
2. If yes, prompt for git username (default: email prefix before `@`)
3. Run `git config --global user.name "<name>"` and `git config --global user.email "<email>"`
4. Display confirmation of configured values

## Bug Fixes

| Bug | Fix |
|-----|-----|
| `set -e` kills script on `ssh -T` | `ssh -T ... \|\| exit_code=$?` to capture exit code safely |
| No cleanup on failure | `trap cleanup EXIT` removes partial keys, reverts config entry |
| Duplicated ssh-keygen (4 calls) | Single `ssh-keygen -t ed25519 -C "$email" -f "$keyName" -N ""` |
| Duplicated input validation | Extract `validate_no_spaces()` helper function |
| Hardcoded RSA for GitLab/Azure | ed25519 for all providers |

## Cleanup Trap (bash)

```bash
cleanup() {
    if [ "$KEYGEN_STARTED" = true ] && [ "$KEYGEN_DONE" != true ]; then
        rm -f "$HOME/.ssh/$keyName" "$HOME/.ssh/$keyName.pub"
        # Remove last config block if it was partially written
    fi
}
trap cleanup EXIT
```

PowerShell equivalent uses `try/catch/finally`.

## Platform Detection

Bash `detect_os()` remains unchanged (linux, macos, windows, wsl).

PowerShell uses `$PSVersionTable.PSEdition`, `$IsWindows`, `$IsLinux`, `$IsMacOS` (pwsh 7+), with fallback to `$env:OS` for Windows PowerShell 5.1.

## Files Changed

- `ssh.sh` — rewrite with TUI menu, bug fixes, git config, cleanup trap
- `ssh.ps1` — new file, full feature parity with PowerShell
- `README.md` — update with PowerShell instructions and new features
- `CLAUDE.md` — update architecture section
