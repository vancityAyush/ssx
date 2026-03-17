# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Two scripts with feature parity that automate SSH key generation and configuration for Git providers (GitHub, Bitbucket, GitLab, Azure DevOps):
- `ssh.sh` — Bash/Zsh (macOS, Linux, WSL, Git Bash)
- `ssh.ps1` — PowerShell 5.1+ / pwsh 7+ (Windows, Linux, macOS)

Both are interactive CLI tools meant to be run directly by end users.

## Commands

- **Run (bash):** `./ssh.sh` (interactive, requires user input and a terminal with arrow-key support)
- **Run (PowerShell):** `pwsh ./ssh.ps1` or `powershell ./ssh.ps1`
- **Lint (bash):** `shellcheck ssh.sh`
- **Release:** Push a tag like `v*` or use the workflow_dispatch trigger in `.github/workflows/release.yml`

There are no tests, no build step, and no dependencies beyond bash/PowerShell and standard OS utilities (ssh-keygen, git).

## Architecture

Both scripts follow the same linear interactive flow:

1. **TUI menu** (`select_option` / `Show-Menu`) — arrow-key navigable provider selection using ANSI escape codes (bash) or `[Console]::ReadKey()` (PowerShell)
2. **User input** — email (validated), key name (validated via `validate_no_spaces` / `Test-NoSpaces`), optional custom hostname
3. **Key generation** — `ssh-keygen -t ed25519` for all providers
4. **Git config setup** — optional `git config --global user.name` and `user.email`
5. **SSH agent setup** — platform-specific agent start and key add
6. **Config writing** (`writeConfig` / inline) — appends Host block to `~/.ssh/config`
7. **Clipboard copy** (`copy_to_clipboard` / `Set-Clipboard`) — platform-specific
8. **Browser open** (`open_settings_page` / `Start-Process`) — opens provider's SSH key settings URL
9. **Connection test loop** — interactive `ssh -T` testing with safe exit code handling
10. **Cleanup trap** — removes partial key files on failure/interrupt (`trap cleanup EXIT INT TERM` / `try/catch/finally`)

Key design patterns:
- Cross-platform behavior via `detect_os()` / `Get-Platform` + case/switch statements
- All user input validated in loops with pattern matching
- Bash uses `set -e` with explicit `|| exit_code=$?` for SSH test to avoid crashes
- PowerShell uses `$ErrorActionPreference = "Stop"` with `try/catch/finally`
