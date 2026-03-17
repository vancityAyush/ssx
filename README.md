# sshx

`sshx` is a TypeScript-first CLI for generating and configuring SSH keys for GitHub, GitLab, Bitbucket, and Azure DevOps. The main implementation now lives in TypeScript, while the shell scripts remain available as fallbacks.

## Features

- Interactive provider selection when you run `sshx` with no arguments
- Scriptable setup with `sshx setup github -e you@example.com -k personal`
- SSH key generation, SSH config updates, clipboard copy, browser opening, and connection testing
- Optional per-host git identity setup for different SSH remotes
- Cross-platform support for macOS, Linux, Windows, and WSL

## Install

### npm

```bash
npm install -g @vancityayush/sshx
sshx
```

### npx

```bash
npx @vancityayush/sshx
npx @vancityayush/sshx setup github -e you@example.com -k personal
```

### Install Script

```bash
curl -fsSL https://raw.githubusercontent.com/vancityAyush/sshx/main/install.sh | sh
```

```powershell
irm https://raw.githubusercontent.com/vancityAyush/sshx/main/install.ps1 | iex
```

### Build From Source

```bash
git clone https://github.com/vancityAyush/sshx.git
cd sshx
bun install
bun run build
node dist/cli.js
```

## Usage

```bash
# Interactive setup
sshx

# Non-interactive setup
sshx setup github -e you@example.com -k personal

# Test a host
sshx test github.com

# Show configured SSH hosts
sshx list

# Copy a public key again
sshx copy personal

# Remove a key and matching SSH config entries
sshx remove personal

# Print SSH config or one host block
sshx config
sshx config github.com

# Manage the SSH agent
sshx agent list
sshx agent add personal
sshx agent remove personal
```

## What It Creates

- `~/.ssh/<keyname>`
- `~/.ssh/<keyname>.pub`
- `~/.ssh/config`
- `~/.ssh/.gitconfig-<keyname>` when you enable per-host git identity

## Legacy Scripts

If you want the original script-based flow directly, the repository still includes:

- `./ssh.sh`
- `pwsh ./ssh.ps1`

Those remain useful fallbacks, but the main CLI implementation now lives in [src/cli.ts](/Users/vancityayush/Development/ssh_script/src/cli.ts).
