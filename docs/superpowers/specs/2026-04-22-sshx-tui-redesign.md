# sshx TUI Redesign

**Date:** 2026-04-22
**Status:** Approved

## Overview

Full rebuild of `sshx` from scratch as a TUI-first CLI. Discards all existing TypeScript source. Retains project goal: manage SSH keys on the local system for Git providers (GitHub, GitLab, Bitbucket, Azure DevOps).

Uses `@vancityayush/tui` (React/ink-based terminal UI library) for interactive mode. Flag-based invocation still works for scripting and CI.

---

## UX Model

**Hybrid:** no args → launches TUI; known command + args → runs headlessly and exits.

```
$ sshx                          # opens TUI
$ sshx setup github -e a@b.com  # headless, no TUI
$ sshx list                     # prints list, exits
$ sshx remove mykey             # removes key, exits
```

---

## Commands

| Command  | Description |
|----------|-------------|
| `setup`  | Generate SSH key, write SSH config, copy pubkey to clipboard, open provider settings URL |
| `list`   | Show all sshx-managed keys from `~/.ssh/config` |
| `remove` | Delete key files and SSH config entry |
| `test`   | Run `ssh -T` against a provider host |
| `agent`  | List/add/remove keys from ssh-agent |
| `copy`   | Copy a key's public key to clipboard |

---

## File Structure

```
sshx/
├── src/
│   ├── cli.ts                  # entry: parse args → headless command or TUI
│   ├── providers.ts            # PROVIDERS map (github/gitlab/bitbucket/azure)
│   ├── commands/
│   │   ├── setup.ts
│   │   ├── list.ts
│   │   ├── remove.ts
│   │   ├── test.ts
│   │   ├── agent.ts
│   │   └── copy.ts
│   ├── ssh/
│   │   ├── config.ts           # read/write/parse ~/.ssh/config
│   │   └── keygen.ts           # shell out to ssh-keygen
│   ├── platform.ts             # clipboard, browser-open, OS detection
│   └── tui/
│       ├── App.tsx             # screen router
│       ├── screens/
│       │   ├── MainMenu.tsx
│       │   ├── Setup.tsx
│       │   ├── KeyList.tsx
│       │   ├── TestConnection.tsx
│       │   └── Agent.tsx
│       └── components/
│           └── Header.tsx
├── package.json
└── tsconfig.json
```

**Constraint:** Nothing in `src/commands/` or `src/ssh/` imports from `src/tui/`. The TUI layer is purely additive.

---

## Architecture

### Entry Point (`cli.ts`)

1. Parse `process.argv`.
2. If a known command name is present → call the matching command function → exit with its status code.
3. If no args (or `--tui`) → `render(<App />)` from `@vancityayush/tui`.

### Command Functions

Each command is an `async function` that accepts typed options and returns a result object or throws a typed error. No UI dependencies. Used by both TUI screens and headless flag mode.

```ts
// example signature
export async function setup(opts: SetupOptions): Promise<SetupResult>
export async function list(): Promise<ManagedKey[]>
export async function remove(keyName: string): Promise<void>
```

### TUI Navigation

`App.tsx` holds `currentScreen` state (union type). `MainMenu` renders a `CustomSelect` list. Selecting an item sets screen. Each screen accepts an `onBack` prop; pressing Esc/`q` calls it → returns to `MainMenu`.

### Setup Wizard (4 steps, within Setup screen)

1. **Provider** — `CustomSelect`: GitHub, GitLab, Bitbucket, Azure DevOps
2. **Email** — `TextInput`, pre-filled from `git config user.email`
3. **Key name** — `TextInput`, pre-filled as `id_ed25519_<provider>`
4. **Generate** — `Spinner` while running `setup()`, then show pubkey + "Copied to clipboard" + "Opening browser..."

### KeyList Screen

`OrderedList` of managed keys. Each row: key name + provider label + copy/remove actions. Remove shows a `Dialog` confirmation before calling `remove()`.

### TestConnection Screen

Provider `CustomSelect` → call `test()` → stream `ssh -T` output into a `Text` block with a `Spinner` while running.

### Agent Screen

Show keys currently in ssh-agent. Buttons: add (select from managed keys list), remove from agent.

---

## Data Flow

### SSH Config Ownership

`src/ssh/config.ts` is the sole reader/writer of `~/.ssh/config`. It parses config into typed segments:

```ts
type ConfigSegment =
  | { kind: "text"; lines: string[] }
  | { kind: "host"; host: string; lines: string[]; managed: boolean }
```

`managed: true` when the block contains a `# sshx` comment. `list.ts` filters by this marker. No separate metadata file.

### Managed Key Tracking

sshx identifies its own SSH config blocks with a `# sshx` comment on the `Host` line. Example:

```
Host github.com  # sshx
  IdentityFile ~/.ssh/id_ed25519_github
  User git
```

### Auto-detect

`setup.ts` reads `git config user.email` and parses the current directory's remote URL to pre-fill email and guess provider before the wizard opens.

---

## Error Handling

### Setup Rollback

If `setup()` fails mid-way (e.g. key written but config write fails), it deletes partial artifacts before throwing. TUI shows error in red on the Setup screen; user can retry.

### Clipboard / Browser Failures

Non-fatal. `platform.ts` catches failures from `pbcopy`/`xclip`/`clip.exe` and `open`/`xdg-open`/`explorer.exe` and returns a warning string. TUI displays it but does not block completion.

### Flag-mode Errors

`cli.ts` catches thrown errors from command functions, prints message to stderr, exits with code 1. No TUI rendered.

---

## Providers

| Key        | Label         | Hostname                | Key Type  | Settings URL |
|------------|---------------|-------------------------|-----------|--------------|
| `github`   | GitHub        | `github.com`            | ed25519   | `https://github.com/settings/keys` |
| `gitlab`   | GitLab        | `gitlab.com`            | ed25519   | `https://gitlab.com/-/profile/keys` |
| `bitbucket`| Bitbucket     | `bitbucket.org`         | ed25519   | `https://bitbucket.org/account/settings/ssh-keys/` |
| `azure`    | Azure DevOps  | `ssh.dev.azure.com`     | rsa       | `https://dev.azure.com/_usersSettings/keys` |

---

## Runtime & Tooling

- **Runtime:** Bun (required by `@vancityayush/tui`)
- **Language:** TypeScript with JSX (`tsconfig` target: `node18`, `jsx: react`)
- **Build:** `bun build ./src/cli.ts --target=node --format=cjs --outfile ./dist/cli.js`
- **Type-check:** `bunx tsc --noEmit`
- **Dependencies:** `@vancityayush/tui`, `react`
- **Dev dependencies:** `@types/node`, `typescript`, `@types/react`
