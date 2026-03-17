# sshx

Cross-platform SSH key manager for Git providers (Bitbucket, GitHub, GitLab, Azure DevOps). A fast, single-binary Rust CLI with zero dependencies. Compatible with macOS, Linux, Windows, and WSL.

*(Looking for the legacy shell scripts? See the [Legacy Shell Scripts](#legacy-shell-scripts) section below).*

## Features

- **Arrow-key interactive menu**: Navigate and select your Git provider with arrow keys
- **Cross-platform compatibility**: Works on macOS, Linux, Windows, and WSL
- **Ed25519 keys for all providers**: Modern, secure, fast key generation
- **Git config setup**: Optionally configure `git config --global` username and email
- **Input validation**: Validates email addresses, key names, and user choices
- **Smart clipboard handling**: Automatically copies SSH key to clipboard on all platforms
- **Automatic browser opening**: Opens SSH settings page for your chosen Git provider
- **SSH agent management**: Properly handles SSH agent across different platforms
- **SSH connection testing**: Built-in SSH key testing functionality
- **Cleanup on failure**: Removes partial key files if the setup is interrupted

## Installation

`sshx` provides a hybrid interface: fully interactive when run with no arguments, or fully scriptable via subcommands and flags.

### Install via Script (macOS / Linux / WSL / Git Bash)

```bash
# One-liner — detects your platform and installs the latest release
curl -fsSL https://raw.githubusercontent.com/vancityAyush/ssh_script/main/install.sh | sh
```

### Install via Cargo (All Platforms)

Requires [Rust](https://rustup.rs/) to be installed.

```bash
cargo install sshx
```

### Install on Windows (PowerShell)

```powershell
# Download the latest Windows binary from GitHub Releases
$release = Invoke-RestMethod "https://api.github.com/repos/vancityAyush/ssh_script/releases" |
    Where-Object { $_.tag_name -like "sshx-v*" } | Select-Object -First 1
$url = ($release.assets | Where-Object { $_.name -like "*windows*" }).browser_download_url
Invoke-WebRequest -Uri $url -OutFile "$env:LOCALAPPDATA\sshx.exe"

# Add to PATH (if not already there)
$path = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($path -notlike "*$env:LOCALAPPDATA*") {
    [Environment]::SetEnvironmentVariable("PATH", "$path;$env:LOCALAPPDATA", "User")
}
```

Or install via Cargo:
```powershell
cargo install sshx
```

### Build from Source (All Platforms)

```bash
git clone https://github.com/vancityAyush/ssh_script.git
cd ssh_script
cargo build --release

# The binary is at target/release/sshx (or sshx.exe on Windows)
# Move it to a directory in your PATH:

# macOS / Linux / WSL
sudo cp target/release/sshx /usr/local/bin/

# Windows (PowerShell)
# Copy-Item target\release\sshx.exe $env:LOCALAPPDATA\sshx.exe
```

## Usage

```bash
# Full interactive setup (no arguments needed)
sshx

# Non-interactive setup with flags
sshx setup github -e you@example.com -k mykey

# Test SSH connection
sshx test github.com

# List configured SSH hosts
sshx list

# Copy public key to clipboard again
sshx copy mykey

# Remove a key (files + config + agent)
sshx remove mykey

# View SSH config entries
sshx config

# Manage SSH agent
sshx agent list
sshx agent add mykey
```

## How It Works

1. **Platform Detection**: Automatically detects your operating system (macOS, Linux, Windows, WSL)
2. **Provider Selection**: Arrow-key interactive menu to choose between Bitbucket, GitHub, GitLab, or Azure DevOps
3. **Input Validation**: Validates email format and key naming
4. **Key Generation**: Ed25519 keys for all providers (modern, secure, fast)
5. **Git Config Setup**: Optionally sets `git config --global user.name` and `user.email`
6. **SSH Agent Setup**: Automatically starts SSH agent and adds your key
7. **Config Management**: Updates SSH config with host-specific settings
8. **Clipboard Integration**: Copies public key to clipboard automatically
9. **Browser Integration**: Opens SSH settings page for easy key addition
10. **Connection Testing**: Built-in SSH connection testing

## What Gets Created

- `~/.ssh/[keyname]` - Your private SSH key
- `~/.ssh/[keyname].pub` - Your public SSH key
- `~/.ssh/config` - SSH configuration (updated)

---

## Legacy Shell Scripts

If you prefer not to use the compiled Rust binary, we still maintain independent shell scripts (`ssh.sh` for Bash/Zsh, `ssh.ps1` for PowerShell) with identical functionality. They reside in the `scripts/` directory.

### Quick Installation & Usage

#### macOS / Linux / WSL / Git Bash

```bash
# One-liner (copy & paste into Terminal)
curl -fsSLo ssh.sh https://raw.githubusercontent.com/vancityAyush/ssh_script/main/scripts/ssh.sh && bash ssh.sh
```

#### Windows (PowerShell)

```powershell
# One-liner (copy & paste into PowerShell)
iwr -Uri https://raw.githubusercontent.com/vancityAyush/ssh_script/main/scripts/ssh.ps1 -OutFile ssh.ps1; .\ssh.ps1
```

### Clone Repository (All Platforms)

```bash
git clone https://github.com/vancityAyush/ssh_script.git
cd ssh_script

# Bash/Zsh
chmod +x scripts/ssh.sh && ./scripts/ssh.sh

# PowerShell
./scripts/ssh.ps1
```

---

## Troubleshooting

### Permission Errors
```bash
# Check SSH directory permissions
ls -la ~/.ssh
```

### SSH Agent Issues
```bash
# Manually start SSH agent if needed
eval "$(ssh-agent -s)"

# List loaded keys
ssh-add -l
```

```powershell
# PowerShell: Start SSH agent service (Windows)
Start-Service ssh-agent

# List loaded keys
ssh-add -l
```

### Connection Testing
```bash
# Test specific connections
ssh -T git@github.com
ssh -T git@bitbucket.org
ssh -T git@gitlab.com
ssh -T git@ssh.dev.azure.com
```

## Prerequisites

- **SSH client**: `ssh-keygen` and `ssh-add` (pre-installed on macOS, Linux, WSL; install via [Git for Windows](https://gitforwindows.org/) on Windows)
- **Git**: For git config integration and SSH testing
- **Rust** *(only for `cargo install` or building from source)*: Install via [rustup.rs](https://rustup.rs/)

## Changelog

### v3.0.0 - Interactive Menu, PowerShell Support & Bug Fixes

**New Features:**
- Arrow-key interactive menu for provider selection (Claude CLI-style UX)
- PowerShell support (`ssh.ps1`) with full feature parity
- Optional git username and email configuration (`git config --global`)
- Ed25519 keys for all providers (was RSA-4096 for GitLab/Azure DevOps)
- Cleanup trap removes partial key files on failure or interruption

**Bug Fixes:**
- Fixed `set -e` crash on `ssh -T` test (exit code 1 is normal for Git SSH)
- Deduplicated input validation with shared `validate_no_spaces` helper
- Removed duplicated ssh-keygen calls (was 4 separate if/elif blocks)

### v2.1.0 - Azure DevOps Support

**New Features:**
- Azure DevOps support: Added SSH key generation for Azure Repos (option 4)
- RSA-4096 for Azure DevOps: Uses RSA-4096 keys as required by Azure DevOps (minimum 2048-bit)
- Azure DevOps hostname: Automatically configures `ssh.dev.azure.com` as the SSH host
- Azure DevOps settings page: Opens `https://dev.azure.com/_usersSettings/keys` for easy key addition

### v2.0.0 - Cross-Platform Compatibility Update

**Major Improvements:**
- Cross-platform compatibility: Added full support for macOS, Linux, Windows, and WSL
- Operating system detection: Automatic platform detection for optimized behavior
- Enhanced clipboard support: Added `pbcopy` (macOS), `xsel` (Linux alternative), improved WSL handling
- Better browser integration: Platform-specific URL opening with fallbacks
- Smart SSH agent management: Improved SSH agent handling across all platforms

**Bug Fixes:**
- Fixed Ed25519 key generation: Removed invalid `-b 4096` flag for Ed25519 keys (Bitbucket)
- Fixed curl recursion bug: Removed problematic self-downloading section
- Resolved all shellcheck warnings: Improved script quality and reliability
- Fixed directory navigation: Added proper error handling for `cd` commands
- Fixed SSH config writing: Using `printf` instead of `echo` for better formatting
