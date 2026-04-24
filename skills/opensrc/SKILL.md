---
name: opensrc
description: Use when the task needs third-party implementation context beyond docs or types, especially for npm dependencies or public GitHub repos. Trigger when the user wants to inspect package internals, compare dependency behavior, fetch source for a library, or give Codex deeper context before debugging or integration work.
---

# opensrc

Use `opensrc` to pull real source code for dependencies or public GitHub repos into a local `opensrc/` directory so implementation details are available during coding work.

## When To Use

Use this skill when:

- A bug or behavior depends on how a dependency works internally.
- Types, docs, or README examples are not enough.
- The user explicitly asks to fetch package source or inspect a public GitHub repo.
- You need to compare local usage against upstream implementation.

Do not use it for routine package installation or when API docs alone are sufficient.

## Quick Start

Prefer `bunx` for one-off use unless `opensrc` is already installed:

```bash
bunx opensrc zod --modify=false
bunx opensrc react react-dom --modify=false
bunx opensrc owner/repo --modify=false
```

Useful forms:

```bash
bunx opensrc zod
bunx opensrc zod@3.22.0
bunx opensrc github:owner/repo
bunx opensrc owner/repo@v1.0.0
bunx opensrc owner/repo#main
bunx opensrc https://github.com/owner/repo
bunx opensrc list
bunx opensrc remove zod
```

## Workflow

1. Check whether `opensrc/sources.json` already exists and reuse it when possible.
2. Fetch only the packages or repos relevant to the task. Keep the scope narrow.
3. Default to `--modify=false` unless the user explicitly wants repo integration changes.
4. After fetching, inspect `opensrc/sources.json` to confirm the resolved version and local path.
5. Read the fetched source under `opensrc/<package>/` or `opensrc/<owner--repo>/`.
6. Cite exact upstream files when reasoning about dependency behavior or proposing fixes.

## Effective Usage Rules

- For installed npm dependencies, omit the version first. `opensrc` auto-detects the installed version from lockfiles and re-running the same package resyncs it.
- Pass an explicit version only when there is no lockfile match or the task requires a different release.
- For GitHub repos, prefer `owner/repo` shorthand unless the branch, tag, or full URL matters.
- Mix packages and repos in one fetch only when they are part of the same investigation.
- Treat fetched source as external reference material. Do not edit it unless the user explicitly asks.

## Repo Modification Policy

On first run, `opensrc` may offer to modify:

- `.gitignore`
- `tsconfig.json`
- `AGENTS.md`

Those preferences are stored in `opensrc/settings.json`.

Default behavior for Codex:

- Use `--modify=false` for exploratory or read-only dependency analysis.
- Use `--modify` only when the user wants `opensrc/` integrated into the repo workflow.
- If network or filesystem permissions block the fetch, request approval rather than silently skipping.

## Reading The Output

Typical layout:

```text
opensrc/
  settings.json
  sources.json
  zod/
  owner--repo/
```

Use `sources.json` as the inventory of what is available and where it lives. When explaining findings, reference the fetched path directly so the user can verify the upstream implementation quickly.
