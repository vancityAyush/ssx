# sshx

`sshx` is a TUI-first Bun CLI for managing SSH keys for GitHub, GitLab, Bitbucket, and Azure DevOps. It runs as a full-screen interactive terminal app when invoked with no arguments, and it also supports headless commands for scripting and CI.

Current TUI rebuild uses `@vancityayush/tui`, so Bun is required at runtime.

## Features

- Launches a keyboard-first setup wizard for SSH keys
- Generates Ed25519 keys for GitHub, GitLab, and Bitbucket
- Generates RSA keys for Azure DevOps
- Writes managed `~/.ssh/config` blocks marked with `# sshx`
- Adds keys to `ssh-agent`
- Optionally writes per-key Git includes for host-specific identity config
- Copies public keys to the clipboard when available
- Opens the provider SSH settings page when available
- Lists, copies, removes, and connection-tests managed keys

## Runtime

`sshx` now targets the Bun runtime. The published package includes a Node-based launcher in `bin/sshx`, but the actual CLI process is executed with `bun`, so Bun `>= 1.3` must be installed on the machine.

## Install

### Bun

```bash
# One-off execution
bunx @vancityayush/sshx --help

# Global install
bun add -g @vancityayush/sshx
sshx
```

### npm

```bash
npm install -g @vancityayush/sshx
sshx
```

`npm` installation is supported, but `bun` still needs to be available on `PATH` at runtime because the launcher delegates to Bun.

### Repo Install

```bash
git clone https://github.com/vancityAyush/sshx.git
cd sshx
bun install
bun run build
bun dist/cli.js
```

## Usage

### Interactive TUI

```bash
sshx
sshx --tui
```

Launches a full-screen terminal UI. Navigate with arrow keys; no mouse required.

#### Main Menu

| Key | Action |
|-----|--------|
| `↑` / `↓` | Move selection |
| `Enter` | Open screen |
| `q` / `Esc` | Quit |

Options: **Setup**, **Key List**, **Test Connection**, **Agent**

#### Setup Wizard (4 steps)

1. **Provider** — pick GitHub, GitLab, Bitbucket, or Azure DevOps
2. **Email** — pre-filled from `git config user.email`
3. **Key name** — pre-filled as `id_ed25519_<provider>`
4. **Generate** — runs `ssh-keygen`, writes `~/.ssh/config`, copies pubkey, opens browser

| Key | Action |
|-----|--------|
| `↑` / `↓` | Move selection (step 1) |
| `Enter` | Confirm / advance |
| `Esc` | Back to main menu |

#### Key List

Shows all `# sshx`-managed SSH keys.

| Key | Action |
|-----|--------|
| `↑` / `↓` | Move selection |
| `Enter` | Copy public key to clipboard |
| `d` | Remove key (with confirmation dialog) |
| `Esc` | Back |

#### Test Connection

Select a provider → runs `ssh -T` and shows output.

| Key | Action |
|-----|--------|
| `↑` / `↓` | Move selection |
| `Enter` | Run test |
| `r` | Test another provider |
| `Esc` | Back |

#### Agent

Shows keys loaded in `ssh-agent`.

| Key | Action |
|-----|--------|
| `↑` / `↓` | Move selection |
| `a` | Add a managed key to the agent |
| `d` | Remove selected key from the agent |
| `r` | Refresh list |
| `Esc` | Back |

### Headless Commands

```bash
sshx setup github -e you@example.com -k personal

# Test a provider
sshx test github

# Show configured SSH hosts
sshx list
sshx copy personal
sshx remove personal

# Manage the SSH agent
sshx agent list
sshx agent add personal
sshx agent remove personal
```

### Setup Flags

```text
-e, --email <email>     Email for the SSH key comment
-k, --key <name>        Key file name
-H, --host <host>       Custom SSH host alias
--force                 Overwrite an existing key and host block
--no-git-config         Skip per-host git config setup
--no-browser            Skip opening the provider settings page
--no-clipboard          Skip copying the public key to the clipboard
```

## Managed SSH Config

`sshx` only treats SSH config entries as its own when they are marked with `# sshx`. Generated blocks look like this:

- `./scripts/ssh.sh`
- `pwsh ./scripts/ssh.ps1`

Removal and listing operations only target these managed entries.

## Build And Verify

```bash
bun install
bun run typecheck
bun test
bun run build
bun dist/cli.js --help
```

## Release

Push a tag like `sshx-v0.4.0` to trigger [.github/workflows/release.yml](.github/workflows/release.yml).

That workflow:

- verifies the tag matches `package.json`
- runs `bun install`
- runs `bun run typecheck`
- runs `bun test`
- runs `bun run build`
- creates an npm tarball with `npm pack`
- publishes a GitHub Release with the tarball plus install scripts
- publishes the root package to npm using `NPM_TOKEN`

## Legacy Shell Scripts

The repo still includes shell-script fallbacks:

- `scripts/ssh.sh`
- `scripts/ssh.ps1`

Those are separate from the Bun/TUI CLI and remain available if you want a script-only flow.
