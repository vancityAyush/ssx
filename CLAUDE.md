# CLAUDE.md

This file provides guidance for AI assistants working with code in this repository.

## Project Overview

`sshx` is a cross-platform TypeScript CLI that automates SSH key generation and configuration for Git providers (GitHub, Bitbucket, GitLab, Azure DevOps).

The main app is now a TUI-first Bun CLI with headless subcommands layered over the same command modules.

The repository also contains shell script fallbacks (`scripts/ssh.sh` and `scripts/ssh.ps1`).

## Commands

### TypeScript CLI (`sshx`)
- **Build:** `bun run build`
- **Type-check:** `bun run typecheck`
- **Test:** `bun test`
- **Run (Interactive):** `bun dist/cli.js`
- **Run (Flags):** `bun dist/cli.js setup github -e user@example.com -k mykey`
- **Release:** Push a tag like `sshx-v*` to trigger `.github/workflows/release.yml`

### Legacy Shell Scripts (`scripts/`)
- **Run (bash):** `./scripts/ssh.sh`
- **Run (PowerShell):** `pwsh ./scripts/ssh.ps1`
- **Lint (bash):** `shellcheck scripts/ssh.sh`
- **Release:** Push a tag like `v*` to trigger `.github/workflows/release.yml`

## Architecture (`sshx`)

The entrypoint lives in **`src/cli.ts`** and routes between:

- headless commands in `src/commands/`
- provider metadata in `src/providers.ts`
- SSH config/key helpers in `src/ssh/`
- platform helpers in `src/platform.ts`
- TUI screens in `src/tui/`

Key design patterns:
- Uses Node child process APIs to shell out to `ssh-keygen`, `ssh-add`, and OS utilities (`xclip`, `pbcopy`, etc.).
- Managed SSH config blocks are marked with `# sshx` so list/remove operations do not touch unrelated user config.
- Errors are propagated and cleanly displayed to the user.
- Partial artifacts (e.g. keys without config) are cleaned up during failure using rollback paths.
