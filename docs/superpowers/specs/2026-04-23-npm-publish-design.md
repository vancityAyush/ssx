# npm Publish Design

**Date:** 2026-04-23  
**Status:** Approved

## Goal

Publish `sshx` to npm as an unscoped public package under the name `sshx-cli`.

## Context

The `sshx` npm name is already taken by an unrelated project (dwyschka/sshx, last published 2022-06-26). The next-best unscoped name `sshx-cli` is available and clearly communicates the package purpose.

The existing CI workflow (`.github/workflows/release.yml`) already handles the full release pipeline:
- Build → typecheck → test → `npm pack` → GitHub Release → `npm publish`
- Triggered on tags matching `sshx-v*`

## Changes

### `package.json`
- Change `name` from `@vancityayush/sshx` to `sshx-cli`

### `.github/workflows/release.yml`
- No changes — keep `--access public` flag on `npm publish` (harmless for unscoped packages, explicit intent)

### Manual prerequisite
- `NPM_TOKEN` secret must be set in GitHub repo settings → Secrets → Actions

## What stays the same

- `"bin": { "sshx": "bin/sshx" }` — users run `sshx` after install regardless of package name
- Version stays `0.4.0`
- All other package.json fields unchanged

## Install UX after publish

```sh
npm install -g sshx-cli
sshx setup github -e user@example.com
```

## Non-goals

- Claiming the `sshx` npm name
- Changing the CLI command name
- Changing the git tag format or release trigger
