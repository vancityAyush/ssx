# AGENTS.md

This file provides guidance for Codex and other AI assistants working with code in this repository.

## Project Overview

`sshx` is a cross-platform TypeScript CLI that automates SSH key generation and configuration for Git providers including GitHub, Bitbucket, GitLab, and Azure DevOps.

The repository also contains shell script fallbacks: `scripts/ssh.sh` and `scripts/ssh.ps1`.

## Repository Boundaries

- Do not read from or rely on `.entire/metadata/**`. Treat it as internal tool metadata, not project source.

## Commands

### TypeScript CLI (`sshx`)

- Build: `bun run build`
- Type-check: `bun run typecheck`
- Run interactively: `node dist/cli.js` (after build)
- Run with flags: `node dist/cli.js setup github -e user@example.com -k mykey`
- Release: push a tag matching `sshx-v*` to trigger `.github/workflows/release.yml`

### Legacy Shell Scripts (`scripts/`)

- Run bash version: `./scripts/ssh.sh`
- Run PowerShell version: `pwsh ./scripts/ssh.ps1`
- Lint bash version: `shellcheck scripts/ssh.sh`
- Release: push a tag matching `v*` to trigger `.github/workflows/release.yml`

## Architecture

The CLI implementation lives in `src/cli.ts` and includes:

- Argument parsing and command routing
- Provider metadata and setup flows
- SSH key generation/configuration logic
- SSH agent integration, clipboard copy, and connection testing
- Platform-aware browser and shell command handling

## Design Notes

- The CLI shells out for `ssh-keygen`, `ssh-add`, and OS utilities such as `xclip` and `pbcopy`.
- Errors should be propagated cleanly and displayed clearly to the user.
- Partial artifacts created during failures, such as keys without config, should be cleaned up through rollback paths.
