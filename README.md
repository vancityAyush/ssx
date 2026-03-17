# SSH Script

This cross-platform script automates the process of generating and configuring SSH keys for Bitbucket, GitHub, GitLab, or Azure DevOps. Available in both Bash and PowerShell, compatible with macOS, Linux, Windows (Git Bash/WSL/PowerShell).

## Features

- **Arrow-key interactive menu**: Navigate and select your Git provider with arrow keys (Claude CLI-style UX)
- **Cross-platform compatibility**: Works on macOS, Linux, Windows, and WSL
- **Bash and PowerShell support**: `ssh.sh` for bash/zsh, `ssh.ps1` for PowerShell 5.1+/pwsh 7+
- **Ed25519 keys for all providers**: Modern, secure, fast key generation
- **Git config setup**: Optionally configure `git config --global` username and email
- **Input validation**: Validates email addresses, key names, and user choices
- **Smart clipboard handling**: Automatically copies SSH key to clipboard on all platforms
- **Automatic browser opening**: Opens SSH settings page for your chosen Git provider
- **SSH agent management**: Properly handles SSH agent across different platforms
- **SSH connection testing**: Built-in SSH key testing functionality
- **Cleanup on failure**: Removes partial key files if the script is interrupted

## Platform Support

| Platform | Script | SSH Agent | Clipboard | Browser Opening |
|----------|--------|-----------|-----------|-----------------|
| **macOS** | `ssh.sh` / `ssh.ps1` | `ssh-agent` | `pbcopy` | `open` |
| **Linux** | `ssh.sh` / `ssh.ps1` | `ssh-agent` | `xclip`, `xsel` | `xdg-open` |
| **Windows (Git Bash)** | `ssh.sh` | `ssh-agent` | `clip.exe` | `cmd.exe start` |
| **Windows (PowerShell)** | `ssh.ps1` | `ssh-agent` service | `Set-Clipboard` | `Start-Process` |
| **WSL** | `ssh.sh` / `ssh.ps1` | `ssh-agent` | `clip.exe`, `xclip` | `xdg-open` |

## Quick Installation & Usage

### Bash / Zsh (macOS, Linux, WSL, Git Bash)

#### Option 1: Direct Download and Run
```bash
curl -O https://raw.githubusercontent.com/vancityAyush/ssh_script/main/ssh.sh
chmod +x ssh.sh
./ssh.sh
```

#### Option 2: One-liner Download and Execute
```bash
curl -fsSL https://raw.githubusercontent.com/vancityAyush/ssh_script/main/ssh.sh | bash
```

#### Option 3: Clone Repository
```bash
git clone https://github.com/vancityAyush/ssh_script.git
cd ssh_script
chmod +x ssh.sh
./ssh.sh
```

### PowerShell (Windows, Linux, macOS)

#### Option 1: Download and Run
```powershell
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/vancityAyush/ssh_script/main/ssh.ps1" -OutFile "ssh.ps1"
./ssh.ps1
```

#### Option 2: One-liner
```powershell
irm https://raw.githubusercontent.com/vancityAyush/ssh_script/main/ssh.ps1 | iex
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

## Troubleshooting

### Permission Errors
```bash
# Make sure script is executable
chmod +x ssh.sh

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

## Requirements

### Bash (`ssh.sh`)
- Bash 4+ or Zsh
- SSH client (usually pre-installed)
- Git (for git config and SSH testing)
- Internet connection (for downloading and testing)

### PowerShell (`ssh.ps1`)
- PowerShell 5.1 (Windows) or pwsh 7+ (cross-platform)
- SSH client (`ssh-keygen`, `ssh-add`)
- Git (for git config and SSH testing)
- Internet connection (for downloading and testing)

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
