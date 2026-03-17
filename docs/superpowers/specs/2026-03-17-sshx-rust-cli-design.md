# sshx — Rust CLI for SSH Key Management

**Date:** 2026-03-17
**Status:** Approved

## Summary

Rewrite the existing `ssh.sh` / `ssh.ps1` scripts as a single cross-platform Rust CLI tool called `sshx`. The tool provides a hybrid interface: fully interactive when run with no arguments, fully scriptable via subcommands and flags.

## Goals

- Single binary, zero runtime dependencies, cross-platform (macOS, Linux, Windows, WSL)
- Hybrid CLI: interactive prompts when flags are missing, non-interactive when all flags provided
- Subcommand-based architecture (`sshx setup`, `sshx test`, `sshx list`, etc.)
- Simplified user flow: fewer Y/N prompts, smarter defaults via auto-detection
- Proper SSH config parsing (no fragile sed/regex)

## Non-Goals

- API-driven key upload to providers (keep browser-based flow)
- GUI or web interface
- SSH key rotation or expiry management

## CLI Interface

```
sshx — SSH key manager for Git providers

USAGE:
    sshx                                    # Interactive setup (default)
    sshx <COMMAND> [OPTIONS]

COMMANDS:
    setup     Generate and configure an SSH key for a Git provider
    test      Test SSH connection to a Git host
    list      List SSH host entries from ~/.ssh/config
    remove    Remove an SSH key (files + config + agent)
    copy      Copy a key's public key to clipboard
    config    View/edit SSH config entries
    agent     Manage SSH agent (start, list, add, remove keys)

SETUP FLAGS:
    --provider <github|gitlab|bitbucket|azure>   (-p)  or positional: sshx setup <PROVIDER>
    --email <EMAIL>                              (-e)
    --key <KEY_NAME>                             (-k)
    --host <CUSTOM_HOST>                         (-H)
    --no-git-config          Skip git config setup
    --no-browser             Don't open browser
    --no-clipboard           Don't copy to clipboard
    --force                  Overwrite existing key files and config entries without prompting

GLOBAL FLAGS:
    --verbose (-v)           Show detailed output
    --quiet (-q)             Suppress non-essential output

EXAMPLES:
    sshx                                    # Full interactive flow
    sshx setup github -e me@dev.com -k work # Non-interactive (provider as positional)
    sshx setup -p github -e me@dev.com -k work  # Same, provider as flag
    sshx test github.com                    # Test connection
    sshx list                               # Show configured hosts
    sshx remove mykey                       # Remove key files + config entry + agent entry
    sshx copy mykey                         # Re-copy public key to clipboard
    sshx config                             # Show SSH config host entries
    sshx config show github.com             # Show a specific host block
    sshx agent list                         # List loaded keys
    sshx agent add mykey                    # Add key to agent
```

## Architecture

```
src/
├── main.rs              # Entry point, clap CLI parsing
├── cli.rs               # Clap structs (Cli, Commands enum)
├── commands/
│   ├── mod.rs
│   ├── setup.rs         # Key generation + config + agent + clipboard + browser
│   ├── test.rs          # SSH connection testing
│   ├── list.rs          # List ~/.ssh/config host entries
│   ├── remove.rs        # Remove key files + config entry + agent
│   ├── copy.rs          # Copy public key to clipboard
│   ├── config.rs        # View/edit SSH config
│   └── agent.rs         # SSH agent management
├── ssh/
│   ├── mod.rs
│   ├── keygen.rs        # ssh-keygen wrapper
│   ├── config.rs        # ~/.ssh/config parser/writer
│   ├── agent.rs         # ssh-agent/ssh-add wrapper
│   └── connection.rs    # ssh -T test wrapper
├── platform/
│   ├── mod.rs
│   ├── clipboard.rs     # Cross-platform clipboard (pbcopy/xclip/clip.exe)
│   ├── browser.rs       # Cross-platform URL opener (open/xdg-open/start)
│   └── detect.rs        # OS detection
├── providers.rs         # Provider data (hostnames, settings URLs)
├── prompt.rs            # Interactive prompts (dialoguer wrappers)
└── ui.rs                # Spinners, styled output (indicatif/console)
```

### Module Responsibilities

**`cli.rs`** — Clap derive structs. `Cli` struct with `Commands` enum. Each subcommand has its own args struct. When run with no args or just `sshx`, defaults to interactive setup.

**`commands/setup.rs`** — Orchestrates the full setup flow. Accepts `SetupArgs` with all optional fields. For each missing field, calls the corresponding prompt function. Delegates key generation, config writing, agent management, clipboard, and browser to the `ssh/` and `platform/` modules.

**`ssh/config.rs`** — Proper SSH config parser. Reads `~/.ssh/config` into structured `HostBlock` entries. Supports: list all hosts, find host by name, add host block, remove host block, replace host block. No regex-based editing.

**`ssh/keygen.rs`** — Wraps `ssh-keygen`. Generates ed25519 by default, RSA-4096 for Azure DevOps. Handles cleanup on failure (remove partial key files).

**`ssh/agent.rs`** — Wraps `ssh-agent` and `ssh-add`. Platform-aware: uses Windows service management on Windows, `SSH_AUTH_SOCK` on Unix.

**`ssh/connection.rs`** — Wraps `ssh -T` for connection testing. Handles the exit code 1 = success case for Git SSH. Filters Azure DevOps noise.

**`platform/`** — OS detection (`cfg!(target_os)` + WSL check), clipboard commands, browser open commands. Each returns `Result` with graceful fallback messages.

**`prompt.rs`** — Thin wrapper around dialoguer. Each function takes `Option<T>` — if `Some`, returns immediately; if `None`, prompts interactively. Functions: `prompt_provider`, `prompt_email`, `prompt_key_name`, `prompt_hostname`, `prompt_git_config`.

**`providers.rs`** — Static data for each provider: name, default hostname, SSH settings URL, key type (ed25519 vs RSA).

**`ui.rs`** — Styled output helpers: success/error/warning messages, spinners for long operations.

## Setup Flow

```
1. Auto-detect from git remote (provider, email, username) — silent, sets defaults
2. Prompt/use --provider (interactive: arrow-key select with detected default highlighted)
3. Prompt/use --email (pre-filled from git config if available)
4. Prompt/use --key name (validated: no spaces, not empty)
5. Prompt/use --host (skip if not needed, default from provider)
6. Generate SSH key
     - ed25519 for GitHub, GitLab, Bitbucket
     - RSA-4096 for Azure DevOps
     - No passphrase (empty -N "")
     - On failure/interrupt: cleanup partial files
7. Start SSH agent + add key (platform-specific)
8. Write host block to ~/.ssh/config
     - If host exists: prompt to replace (or skip in non-interactive mode, overwrite with --force)
9. Optional: configure git user.name/email via includeIf
     - Only if user confirms (or --no-git-config to skip)
     - Creates ~/.ssh/.gitconfig-<keyname> with [user] name/email
     - Adds includeIf directives to ~/.gitconfig (global git config)
10. Copy public key to clipboard (unless --no-clipboard)
11. Open provider SSH settings in browser (unless --no-browser)
12. Print summary
13. Offer single connection test (in interactive mode)
```

## Error Handling

### Exit Codes

| Code | Meaning |
|------|---------|
| 0    | Success |
| 1    | General failure (key generation failed, config write error, etc.) |
| 2    | Invalid arguments or missing required input in non-interactive mode |
| 3    | Missing prerequisites (ssh-keygen, git not found) |

### Error Categories

- **Missing prerequisites**: Check for `ssh-keygen`, `ssh-add`, `git` at startup via `which` crate. Print clear message naming the missing tool and how to install it.
- **Permission errors**: `~/.ssh` not writable, config file read-only. Print the path and suggest `chmod` or running with appropriate permissions.
- **Key file conflicts**: If `~/.ssh/<keyname>` already exists, prompt to overwrite in interactive mode. In non-interactive mode, fail unless `--force` is passed.
- **Config conflicts**: If a Host block already exists, prompt to replace in interactive mode. In non-interactive mode, skip unless `--force` is passed.
- **Network failures**: `ssh -T` test failures show the raw SSH error output and suggest checking network/firewall.
- **Agent failures**: On Windows, if ssh-agent service is disabled/missing, warn but continue (key works via config `IdentityFile` without agent). On Unix, if `SSH_AUTH_SOCK` is unset and `ssh-agent` fails to start, warn but continue.

All errors use `eprintln!` with colored output via `console` crate. Non-fatal issues are warnings (yellow), fatal issues are errors (red) with the exit code above.

## SSH Config Parser Scope

The `ssh/config.rs` parser handles a **practical subset** of SSH config:

**Supported:**
- `Host <pattern>` blocks with indented key-value directives
- Comments (`#` lines) — preserved on round-trip
- Blank lines — preserved on round-trip
- Multiple Host blocks in sequence

**Not supported (passed through unchanged):**
- `Match` blocks
- `Include` directives (the included files are not followed)
- Wildcard Host patterns (`Host *`) — these are preserved but not matched against
- Multi-value Host lines (`Host foo bar`)

The parser reads the file into a `Vec<ConfigEntry>` where each entry is either a `HostBlock { host: String, directives: Vec<(String, String)> }`, a `Comment(String)`, or a `RawLine(String)` (for unrecognized content). This preserves the file's structure and formatting for lines the tool doesn't modify.

**Operations:**
- `list_hosts() -> Vec<&HostBlock>` — return all parsed host blocks
- `find_host(name: &str) -> Option<&HostBlock>` — find by exact Host name
- `add_host(block: HostBlock)` — append to end of file
- `remove_host(name: &str) -> bool` — remove a host block
- `replace_host(name: &str, block: HostBlock) -> bool` — replace in-place
- `write(&self, path: &Path) -> Result<()>` — write back to file

## Identifier Resolution

Commands like `remove`, `copy`, and `agent add` take a `<key>` argument. This refers to the **key filename** (e.g., `mykey`), which maps to `~/.ssh/mykey` (private) and `~/.ssh/mykey.pub` (public). The `remove` command also scans `~/.ssh/config` for Host blocks whose `IdentityFile` points to that key and offers to remove those entries too.

## Key Design Decisions

1. **Hybrid mode**: Every interactive prompt checks if a CLI flag was provided first. If all required flags are present, the entire flow runs non-interactively. This makes the tool scriptable in CI/automation.

2. **Auto-detection is silent**: Unlike the current script which asks "Detected X, use it?", the new tool simply pre-selects the detected value in the interactive menu. Fewer interruptions.

3. **Proper SSH config parsing**: The current scripts use sed/regex to manipulate `~/.ssh/config`, which is fragile. The new tool parses config into structured data and writes it back cleanly.

4. **Single connection test**: Instead of a test loop, the setup offers one test at the end. Users can run `sshx test <host>` anytime after.

5. **No async**: All operations are synchronous `std::process::Command` calls. No tokio/async-std needed.

6. **Cleanup via Drop/ctrlc**: Register a ctrlc handler that removes partial key files if generation was interrupted.

## Dependencies

```toml
[dependencies]
clap = { version = "4", features = ["derive"] }
dialoguer = "0.11"
indicatif = "0.17"
console = "0.15"
ctrlc = "3"
dirs = "6"              # Cross-platform home directory (~)
which = "6"             # Check if commands exist (ssh-keygen, git, etc.)
```

## Distribution

- **GitHub Releases**: Cross-compiled binaries for:
  - `x86_64-unknown-linux-gnu`
  - `aarch64-unknown-linux-gnu`
  - `x86_64-apple-darwin`
  - `aarch64-apple-darwin`
  - `x86_64-pc-windows-msvc`
- **Install script**: `curl -fsSL .../install.sh | sh` (detects platform, downloads binary)
- **Cargo**: `cargo install sshx`
- **Future**: Homebrew tap, AUR package

## Migration

- The existing `ssh.sh` and `ssh.ps1` remain in the repo for users who prefer scripts
- README updated to recommend `sshx` as the primary tool
- One-liner install commands updated to use the install script

## Success Criteria

- Single `sshx` binary works on macOS, Linux, Windows, WSL
- `sshx setup github -e user@example.com -k mykey` runs fully non-interactive
- `sshx` with no args provides polished interactive experience
- All current functionality preserved (key gen, config, agent, clipboard, browser, test)
- New functionality: list, remove, copy, config view/edit, agent management
