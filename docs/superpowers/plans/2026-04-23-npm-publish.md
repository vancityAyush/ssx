# npm Publish (sshx-cli) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the sshx CLI to npm as `sshx-cli`, an available unscoped public package name.

**Architecture:** Single `package.json` name change. The existing CI workflow (`.github/workflows/release.yml`) already builds, packs, and publishes on `sshx-v*` tags — no workflow changes needed. The bin command stays `sshx` so end-users are unaffected.

**Tech Stack:** Bun (build), npm (publish), GitHub Actions (CI)

---

## Prerequisites (manual — not code tasks)

- `NPM_TOKEN` secret must exist in GitHub repo → **Settings → Secrets → Actions → New repository secret**
  - Name: `NPM_TOKEN`
  - Value: npm access token with publish permissions (create at npmjs.com → Access Tokens → Generate New Token → Granular or Classic with publish scope)

---

## File Map

| File | Change |
|------|--------|
| `package.json` | `name`: `@vancityayush/sshx` → `sshx-cli` |

No other files change. Workflow, bin shim, dist, and scripts are all unchanged.

---

### Task 1: Rename package in package.json

**Files:**
- Modify: `package.json:2`

- [ ] **Step 1: Edit package name**

In `package.json`, change line 2:

```json
"name": "sshx-cli",
```

Full relevant section for reference:

```json
{
  "name": "sshx-cli",
  "version": "0.4.0",
  "description": "Cross-platform SSH key manager for Git providers, implemented in TypeScript",
```

- [ ] **Step 2: Verify pack produces correct name**

Run:
```bash
bun run build && npm pack --dry-run
```

Expected output includes:
```
npm notice package: sshx-cli@0.4.0
npm notice === Tarball Contents ===
npm notice ... bin/sshx
npm notice ... dist/cli.js
```

The tarball name should be `sshx-cli-0.4.0.tgz`, not `vancityayush-sshx-0.4.0.tgz`.

- [ ] **Step 3: Verify bin command name is still sshx**

Run:
```bash
cat package.json | grep -A3 '"bin"'
```

Expected:
```json
"bin": {
  "sshx": "bin/sshx"
},
```

The bin key must remain `sshx` — this is the command users run after `npm install -g sshx-cli`.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: rename npm package to sshx-cli"
```

---

### Task 2: Release to npm

**Files:** (none — workflow already exists)

- [ ] **Step 1: Bump version if needed**

Current version is `0.4.0`. If this is a fresh publish to a new name, the version is fine as-is. Skip this step unless you want a new version.

To bump (optional):
```bash
# Edit package.json version field manually, e.g. "0.4.1"
# Then commit: git add package.json && git commit -m "chore: bump version to 0.4.1"
```

- [ ] **Step 2: Verify NPM_TOKEN secret exists**

On GitHub: **repo → Settings → Secrets and variables → Actions**

Confirm `NPM_TOKEN` is listed. If missing, create it (see Prerequisites above) before continuing.

- [ ] **Step 3: Push tag to trigger release**

```bash
git push origin main
git tag sshx-v0.4.0
git push origin sshx-v0.4.0
```

If you bumped to `0.4.1`:
```bash
git tag sshx-v0.4.1
git push origin sshx-v0.4.1
```

The tag must match `package.json` version exactly — the workflow verifies this and fails fast if they differ.

- [ ] **Step 4: Monitor CI**

Go to: `https://github.com/vancityAyush/sshx/actions`

Watch for three jobs to go green:
1. `build` — typecheck + test + `npm pack`
2. `release` — GitHub Release created with `.tgz` artifact
3. `publish-npm` — `npm publish` runs with `NPM_TOKEN`

- [ ] **Step 5: Verify on npm**

```bash
npm view sshx-cli
```

Expected output includes `name: 'sshx-cli'` and the correct version.

End-to-end install smoke test:
```bash
npm install -g sshx-cli
sshx --help
```
