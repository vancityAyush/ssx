# CLAUDE.md

This file provides guidance for AI assistants working with code in this repository.

## Project Overview

`sshx` is a cross-platform Rust CLI that automates SSH key generation and configuration for Git providers (GitHub, Bitbucket, GitLab, Azure DevOps).

The repository also contains legacy shell scripts (`scripts/ssh.sh` and `scripts/ssh.ps1`) with feature parity, maintained as fallbacks.

## Commands

### Rust CLI (`sshx`)
- **Build:** `cargo build`
- **Run (Interactive):** `cargo run`
- **Run (Flags):** `cargo run -- setup github -e user@example.com -k mykey`
- **Lint:** `cargo clippy`
- **Format:** `cargo fmt`
- **Release:** Push a tag like `sshx-v*` to trigger `.github/workflows/sshx-release.yml`

### Legacy Shell Scripts (`scripts/`)
- **Run (bash):** `./scripts/ssh.sh`
- **Run (PowerShell):** `pwsh ./scripts/ssh.ps1`
- **Lint (bash):** `shellcheck scripts/ssh.sh`
- **Release:** Push a tag like `v*` to trigger `.github/workflows/release.yml`

## Architecture (`sshx`)

The Rust CLI is organized into the following modules in `src/`:

1. **`main.rs` & `cli.rs`** — Entry point, CLI argument parsing (using `clap`), and subcommand routing.
2. **`ui.rs`** — Interactive TUI components using `dialoguer` and `console`.
3. **`prompt.rs`** — High-level interactive flows and input validation.
4. **`providers.rs`** — Git provider definitions (URLs, settings pages).
5. **`ssh/` module** — Core SSH operations:
   - `keygen.rs` — Key generation (`ssh-keygen` execution).
   - `config.rs` — SSH config file parsing and writing.
   - `test.rs` — SSH connection testing.
6. **`platform/` module** — OS-specific implementations:
   - `clipboard.rs` — Cross-platform clipboard operations.
   - `agent.rs` — SSH agent management.
   - `browser.rs` — Opening default browser.

Key design patterns:
- Uses standard library `Command` to shell out to `ssh-keygen`, `ssh-add`, and OS utilities (`xclip`, `pbcopy`, etc.).
- Errors are propogated and cleanly displayed to the user.
- Partial artifacts (e.g. keys without config) are cleaned up during failure using manual rollback paths.
