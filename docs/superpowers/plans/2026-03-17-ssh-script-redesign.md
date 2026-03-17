# SSH Script Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite ssh.sh with arrow-key interactive menus, add PowerShell support (ssh.ps1), fix existing bugs, add git config setup, and add cleanup traps.

**Architecture:** Two independent scripts (ssh.sh for bash/zsh, ssh.ps1 for PowerShell) with feature parity. Both follow the same 8-phase flow: provider selection → user input → git config → key generation → SSH agent/config → clipboard/browser → connection test → cleanup. Arrow-key navigation uses raw terminal escape sequences in bash and `[Console]::ReadKey()` in PowerShell.

**Tech Stack:** Bash 4+/Zsh, PowerShell 5.1+/pwsh 7+, ssh-keygen, git, ANSI escape codes

**Spec:** `docs/superpowers/specs/2026-03-17-ssh-script-redesign-design.md`

---

### Task 1: Add TUI select_option function to ssh.sh

**Files:**
- Modify: `ssh.sh:1-5` (add TUI functions after shebang/set -e)

- [ ] **Step 1: Write the `select_option` function**

Add this block after `set -e` (line 4) in `ssh.sh`. This is a self-contained arrow-key menu inspired by bash-tui-toolkit's UX pattern:

```bash
# --- TUI: Arrow-key selection menu ---
select_option() {
    local title="$1"
    shift
    local options=("$@")
    local selected=0
    local count=${#options[@]}

    # Hide cursor
    printf '\e[?25l'

    # Print title and options
    printf '%s\n' "$title"
    for i in "${!options[@]}"; do
        if [ "$i" -eq "$selected" ]; then
            printf '  \e[1;32m> %s\e[0m\n' "${options[$i]}"
        else
            printf '    %s\n' "${options[$i]}"
        fi
    done

    while true; do
        # Read a single key
        IFS= read -rsn1 key

        # Handle escape sequences (arrow keys)
        if [ "$key" = $'\x1b' ]; then
            read -rsn2 -t 0.1 key
            case "$key" in
                '[A') # Up arrow
                    ((selected > 0)) && ((selected--))
                    ;;
                '[B') # Down arrow
                    ((selected < count - 1)) && ((selected++))
                    ;;
            esac
        elif [ "$key" = "" ] || [ "$key" = " " ]; then
            # Enter or Space - confirm selection
            printf '\e[?25h' # Show cursor
            echo "$selected"
            return
        fi

        # Redraw: move cursor up (count + 1 for title) and reprint
        printf '\e[%dA' "$((count + 1))"
        printf '\r\e[K%s\n' "$title"
        for i in "${!options[@]}"; do
            if [ "$i" -eq "$selected" ]; then
                printf '\r\e[K  \e[1;32m> %s\e[0m\n' "${options[$i]}"
            else
                printf '\r\e[K    %s\n' "${options[$i]}"
            fi
        done
    done
}
```

- [ ] **Step 2: Add cleanup on interruption for the TUI**

The `select_option` function hides the cursor. If the user presses Ctrl+C mid-menu, the cursor stays hidden. Wrap with a trap restoration. Add right after the function:

```bash
# Ensure cursor is restored on exit/interrupt
trap 'printf "\e[?25h"' EXIT INT TERM
```

- [ ] **Step 3: Test manually**

Run: `bash -c 'source ssh.sh'` — verify the function is parsed without errors (script will start interactively; Ctrl+C to exit). The trap should restore the cursor.

- [ ] **Step 4: Commit**

```bash
git add ssh.sh
git commit -m "feat: add arrow-key TUI select_option function"
```

---

### Task 2: Replace numbered input with TUI menu in ssh.sh

**Files:**
- Modify: `ssh.sh:33-50` (provider selection block)

- [ ] **Step 1: Replace the provider selection loop**

Replace the entire `while true; do ... echo "1. Bitbucket" ... done` block (lines 33-50) with:

```bash
# Get provider selection with arrow-key menu
providers=("Bitbucket" "GitHub" "GitLab" "Azure DevOps")
option=$(select_option "Select your Git provider:" "${providers[@]}")
# Convert from 0-based to 1-based to match existing logic
option=$((option + 1))
```

- [ ] **Step 2: Verify all downstream references to `$option` still work**

The rest of the script uses `$option` as "1", "2", "3", or "4" — the `+1` conversion preserves this. Check that `getDefaultHostName`, `open_settings_page`, and the key generation block all reference the same values.

- [ ] **Step 3: Test manually**

Run: `./ssh.sh` — arrow keys should navigate the provider list, Enter/Space selects. After selection the script should proceed to email input.

- [ ] **Step 4: Commit**

```bash
git add ssh.sh
git commit -m "feat: replace numbered provider input with arrow-key menu"
```

---

### Task 3: Extract validate_no_spaces helper and deduplicate validation

**Files:**
- Modify: `ssh.sh:70-83` (keyName validation)
- Modify: `ssh.sh:169-182` (hostName validation)

- [ ] **Step 1: Add `validate_no_spaces` function**

Add after the `select_option` function and trap:

```bash
# Validate input: non-empty, no spaces
validate_no_spaces() {
    local input="$1"
    local label="$2"
    if [ -z "$input" ]; then
        echo "Error: $label cannot be empty"
        return 1
    fi
    if [ "$input" != "$(echo "$input" | tr -d ' ')" ]; then
        echo "Error: $label cannot contain spaces"
        return 1
    fi
    return 0
}
```

- [ ] **Step 2: Rewrite keyName input loop (lines 70-83)**

```bash
while true; do
    read -r -p "Enter your SSH key name: " keyName
    if validate_no_spaces "$keyName" "Key name"; then
        break
    fi
done
```

- [ ] **Step 3: Rewrite hostName input loop (lines 169-182)**

```bash
while true; do
    read -r -p "Enter your host name (e.g., work.github.com): " hostName
    if validate_no_spaces "$hostName" "Host name"; then
        break
    fi
done
```

- [ ] **Step 4: Test manually**

Run `./ssh.sh`, try empty inputs and inputs with spaces for both key name and hostname — should show error and re-prompt.

- [ ] **Step 5: Commit**

```bash
git add ssh.sh
git commit -m "refactor: extract validate_no_spaces to deduplicate input validation"
```

---

### Task 4: Unify key generation to ed25519 for all providers

**Files:**
- Modify: `ssh.sh:85-99` (key generation block)

- [ ] **Step 1: Replace the 4 if/elif blocks with a single ssh-keygen call**

Replace lines 85-99 with:

```bash
# Generate SSH key (ed25519 for all providers)
echo "Generating SSH key..."
ssh-keygen -t ed25519 -C "$email" -f "$keyName" -N ""
```

- [ ] **Step 2: Test manually**

Run `./ssh.sh`, select any provider — verify ed25519 key is generated (check with `file ~/.ssh/<keyname>`).

- [ ] **Step 3: Commit**

```bash
git add ssh.sh
git commit -m "fix: use ed25519 for all providers instead of RSA for GitLab/Azure"
```

---

### Task 5: Add cleanup trap for partial key files

**Files:**
- Modify: `ssh.sh` (near top, after functions; and wrap key generation)

- [ ] **Step 1: Add state variables and cleanup function**

Replace the simple cursor-restore trap with a comprehensive cleanup:

```bash
KEYGEN_STARTED=false
KEYGEN_DONE=false
KEYNAME_FOR_CLEANUP=""

cleanup() {
    printf '\e[?25h' # Restore cursor
    if [ "$KEYGEN_STARTED" = true ] && [ "$KEYGEN_DONE" != true ] && [ -n "$KEYNAME_FOR_CLEANUP" ]; then
        echo ""
        echo "Cleaning up partial SSH key files..."
        rm -f "$HOME/.ssh/$KEYNAME_FOR_CLEANUP" "$HOME/.ssh/$KEYNAME_FOR_CLEANUP.pub"
    fi
}
trap cleanup EXIT INT TERM
```

- [ ] **Step 2: Set state flags around key generation**

Wrap the keygen call:

```bash
KEYGEN_STARTED=true
KEYNAME_FOR_CLEANUP="$keyName"
ssh-keygen -t ed25519 -C "$email" -f "$keyName" -N ""

# Verify key was created successfully
if [ ! -f "$keyName" ] || [ ! -f "$keyName.pub" ]; then
    echo "Error: SSH key generation failed"
    exit 1
fi
KEYGEN_DONE=true
```

- [ ] **Step 3: Test by interrupting during key generation**

Run `./ssh.sh`, enter valid inputs, then Ctrl+C right after "Generating SSH key..." — verify no orphaned key files remain in `~/.ssh/`.

- [ ] **Step 4: Commit**

```bash
git add ssh.sh
git commit -m "fix: add cleanup trap to remove partial key files on failure"
```

---

### Task 6: Fix set -e crash on SSH test

**Files:**
- Modify: `ssh.sh:293-316` (SSH test loop)

- [ ] **Step 1: Replace the SSH test block**

Replace the `ssh -T` handling (the case block inside the test loop) with:

```bash
        [Tt]|[Tt][Ee][Ss][Tt])
            echo "Testing SSH connection to git@$hostName..."
            exit_code=0
            ssh -T "git@$hostName" 2>&1 || exit_code=$?

            case $exit_code in
                0) echo "SSH connection successful!" ;;
                1) echo "SSH key is working! (Exit code 1 is normal for Git SSH test)" ;;
                255) echo "SSH connection failed. Please check your SSH key setup." ;;
                *) echo "SSH test completed with exit code $exit_code" ;;
            esac
            ;;
```

- [ ] **Step 2: Test with a real provider**

Run `./ssh.sh`, set up a key, press T to test — verify the script doesn't crash and correctly reports the exit code.

- [ ] **Step 3: Commit**

```bash
git add ssh.sh
git commit -m "fix: handle ssh -T exit codes safely with set -e"
```

---

### Task 7: Add git config setup

**Files:**
- Modify: `ssh.sh` (after key generation and before SSH agent setup)

- [ ] **Step 1: Add git config prompt block**

Insert after the key verification success message and before "Starting SSH agent":

```bash
# Optional git config setup
read -r -p "Do you want to configure git username and email? (Y/N): " configGit

case "$configGit" in
    [Yy]|[Yy][Ee][Ss])
        # Default username from email prefix
        default_username="${email%%@*}"
        read -r -p "Enter your git username [$default_username]: " gitUsername
        gitUsername="${gitUsername:-$default_username}"

        git config --global user.name "$gitUsername"
        git config --global user.email "$email"

        echo "Git config updated:"
        echo "  user.name  = $gitUsername"
        echo "  user.email = $email"
        ;;
    *)
        echo "Skipping git config setup."
        ;;
esac
```

- [ ] **Step 2: Test manually**

Run `./ssh.sh`, say Y to git config — verify `git config --global --list` shows updated values. Run again, say N — verify no changes.

- [ ] **Step 3: Commit**

```bash
git add ssh.sh
git commit -m "feat: add optional git username and email configuration"
```

---

### Task 8: Create ssh.ps1 — PowerShell equivalent

**Files:**
- Create: `ssh.ps1`

- [ ] **Step 1: Write the complete ssh.ps1 script**

```powershell
#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# --- TUI: Arrow-key selection menu ---
function Show-Menu {
    param(
        [string]$Title,
        [string[]]$Options
    )

    $selected = 0
    $count = $Options.Count

    # Hide cursor
    [Console]::CursorVisible = $false

    try {
        Write-Host $Title
        for ($i = 0; $i -lt $count; $i++) {
            if ($i -eq $selected) {
                Write-Host "  > $($Options[$i])" -ForegroundColor Green
            } else {
                Write-Host "    $($Options[$i])"
            }
        }

        while ($true) {
            $key = [Console]::ReadKey($true)

            switch ($key.Key) {
                'UpArrow'   { if ($selected -gt 0) { $selected-- } }
                'DownArrow' { if ($selected -lt ($count - 1)) { $selected++ } }
                'Enter'     { [Console]::CursorVisible = $true; return $selected }
                'Spacebar'  { [Console]::CursorVisible = $true; return $selected }
            }

            # Redraw: move cursor up and reprint
            [Console]::SetCursorPosition(0, [Console]::CursorTop - $count - 1)
            Write-Host "`r$Title$(' ' * 20)"
            for ($i = 0; $i -lt $count; $i++) {
                $line = if ($i -eq $selected) { "  > $($Options[$i])" } else { "    $($Options[$i])" }
                $color = if ($i -eq $selected) { "Green" } else { "Gray" }
                Write-Host "`r$line$(' ' * 20)" -ForegroundColor $color
            }
        }
    } finally {
        [Console]::CursorVisible = $true
    }
}

# --- Validation helpers ---
function Test-NoSpaces {
    param([string]$Input, [string]$Label)
    if ([string]::IsNullOrWhiteSpace($Input)) {
        Write-Host "Error: $Label cannot be empty" -ForegroundColor Red
        return $false
    }
    if ($Input -match '\s') {
        Write-Host "Error: $Label cannot contain spaces" -ForegroundColor Red
        return $false
    }
    return $true
}

function Test-Email {
    param([string]$Email)
    if ($Email -match '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
        return $true
    }
    Write-Host "Error: Please enter a valid email address" -ForegroundColor Red
    return $false
}

# --- Platform detection ---
function Get-Platform {
    if ($PSVersionTable.PSEdition -eq 'Core') {
        if ($IsWindows) { return "windows" }
        elseif ($IsLinux) { return "linux" }
        elseif ($IsMacOS) { return "macos" }
    }
    # Windows PowerShell 5.1
    return "windows"
}

# --- Provider hostnames ---
$providers = @("Bitbucket", "GitHub", "GitLab", "Azure DevOps")
$hostnames = @{
    0 = "bitbucket.org"
    1 = "github.com"
    2 = "gitlab.com"
    3 = "ssh.dev.azure.com"
}
$settingsUrls = @{
    0 = "https://bitbucket.org/account/settings/ssh-keys/"
    1 = "https://github.com/settings/keys"
    2 = "https://gitlab.com/-/profile/keys"
    3 = "https://dev.azure.com/_usersSettings/keys"
}

# --- State for cleanup ---
$script:keygenStarted = $false
$script:keygenDone = $false
$script:keyPath = ""

try {
    # Navigate to SSH directory
    $sshDir = Join-Path $HOME ".ssh"
    if (-not (Test-Path $sshDir)) {
        New-Item -ItemType Directory -Path $sshDir -Force | Out-Null
    }
    Set-Location $sshDir

    # Provider selection
    $option = Show-Menu -Title "Select your Git provider:" -Options $providers

    # Email input
    do {
        $email = Read-Host "Enter your email"
    } while (-not (Test-Email $email))

    # Key name input
    do {
        $keyName = Read-Host "Enter your SSH key name"
    } while (-not (Test-NoSpaces -Input $keyName -Label "Key name"))

    # Git config setup
    $configGit = Read-Host "Do you want to configure git username and email? (Y/N)"
    if ($configGit -match '^[Yy]') {
        $defaultUsername = ($email -split '@')[0]
        $gitUsername = Read-Host "Enter your git username [$defaultUsername]"
        if ([string]::IsNullOrWhiteSpace($gitUsername)) { $gitUsername = $defaultUsername }

        git config --global user.name $gitUsername
        git config --global user.email $email
        Write-Host "Git config updated:"
        Write-Host "  user.name  = $gitUsername"
        Write-Host "  user.email = $email"
    } else {
        Write-Host "Skipping git config setup."
    }

    # Generate SSH key
    Write-Host "Generating SSH key..."
    $script:keygenStarted = $true
    $script:keyPath = Join-Path $sshDir $keyName
    ssh-keygen -t ed25519 -C $email -f $script:keyPath -N '""'

    if (-not (Test-Path $script:keyPath) -or -not (Test-Path "$($script:keyPath).pub")) {
        throw "SSH key generation failed"
    }
    $script:keygenDone = $true
    Write-Host "SSH key generated successfully!"

    # Start SSH agent and add key
    Write-Host "Starting SSH agent and adding key..."
    $platform = Get-Platform
    if ($platform -eq "windows") {
        $agentService = Get-Service ssh-agent -ErrorAction SilentlyContinue
        if ($agentService -and $agentService.Status -ne 'Running') {
            Start-Service ssh-agent
        }
    } else {
        if (-not $env:SSH_AUTH_SOCK) {
            $agentOutput = ssh-agent -s
            Invoke-Expression ($agentOutput -replace ';.*' -join '; ')
        }
    }
    ssh-add $script:keyPath

    # SSH config
    $configFile = Join-Path $sshDir "config"
    if (-not (Test-Path $configFile)) { New-Item -ItemType File -Path $configFile | Out-Null }

    $defaultHostName = $hostnames[$option]

    $customHost = Read-Host "Do you want to add custom host name? (Y/N)"
    if ($customHost -match '^[Yy]') {
        do {
            $hostName = Read-Host "Enter your host name (e.g., work.github.com)"
        } while (-not (Test-NoSpaces -Input $hostName -Label "Host name"))
    } else {
        $hostName = $defaultHostName
    }

    $configContent = Get-Content $configFile -Raw -ErrorAction SilentlyContinue
    if ($configContent -and $configContent -match "Host $([regex]::Escape($hostName))") {
        throw "Host '$hostName' already exists in config!"
    }

    $configBlock = @"

Host $hostName
  HostName $defaultHostName
  AddKeysToAgent yes
  IdentityFile ~/.ssh/$keyName
"@
    Add-Content -Path $configFile -Value $configBlock
    Write-Host "SSH config updated successfully!"

    # Copy to clipboard
    $pubKeyPath = "$($script:keyPath).pub"
    $pubKey = Get-Content $pubKeyPath -Raw

    switch ($platform) {
        "windows" {
            $pubKey | Set-Clipboard
            Write-Host "SSH public key copied to clipboard!"
        }
        "macos" {
            $pubKey | pbcopy
            Write-Host "SSH public key copied to clipboard!"
        }
        "linux" {
            if (Get-Command xclip -ErrorAction SilentlyContinue) {
                $pubKey | xclip -selection clipboard
                Write-Host "SSH public key copied to clipboard!"
            } else {
                Write-Host "Warning: Could not copy to clipboard (install xclip)."
            }
        }
    }

    Write-Host ""
    Write-Host "SSH Public Key:"
    Write-Host $pubKey
    Write-Host ""

    # Open settings page
    $settingsUrl = $settingsUrls[$option]
    Write-Host "Opening SSH settings page in your browser..."
    switch ($platform) {
        "windows" { Start-Process $settingsUrl }
        "macos"   { open $settingsUrl }
        "linux"   { if (Get-Command xdg-open -ErrorAction SilentlyContinue) { xdg-open $settingsUrl } else { Write-Host "Please visit: $settingsUrl" } }
    }

    # SSH connection test loop
    Write-Host ""
    Write-Host "Add the SSH key to your Git provider, then test the connection."
    while ($true) {
        $choice = Read-Host "Press T to test SSH key, or any other key to exit"
        if ($choice -match '^[Tt]') {
            Write-Host "Testing SSH connection to git@$hostName..."
            $exitCode = 0
            try {
                ssh -T "git@$hostName" 2>&1
            } catch {
                $exitCode = $LASTEXITCODE
            }
            if ($LASTEXITCODE) { $exitCode = $LASTEXITCODE }

            switch ($exitCode) {
                0   { Write-Host "SSH connection successful!" }
                1   { Write-Host "SSH key is working! (Exit code 1 is normal for Git SSH test)" }
                255 { Write-Host "SSH connection failed. Please check your SSH key setup." }
                default { Write-Host "SSH test completed with exit code $exitCode" }
            }
        } else {
            Write-Host "Exiting script. SSH setup complete!"
            break
        }
        Write-Host ""
    }

    # Completion message
    Write-Host ""
    Write-Host "==========================================="
    Write-Host "SSH Setup Complete!"
    Write-Host "==========================================="
    Write-Host "SSH key generated: $keyName"
    Write-Host "SSH key added to agent"
    Write-Host "SSH config updated"
    Write-Host "Public key copied to clipboard (if supported)"

} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
} finally {
    # Cleanup partial key files on failure
    if ($script:keygenStarted -and -not $script:keygenDone -and $script:keyPath) {
        Write-Host "Cleaning up partial SSH key files..."
        Remove-Item -Path $script:keyPath -ErrorAction SilentlyContinue
        Remove-Item -Path "$($script:keyPath).pub" -ErrorAction SilentlyContinue
    }
}
```

- [ ] **Step 2: Test on PowerShell**

Run: `pwsh ./ssh.ps1` (or `powershell ./ssh.ps1` on Windows PowerShell 5.1). Verify:
- Arrow-key menu works for provider selection
- Email/key name validation works
- Git config prompt works
- Key generation produces ed25519 key
- SSH config is written correctly

- [ ] **Step 3: Commit**

```bash
git add ssh.ps1
git commit -m "feat: add PowerShell SSH key generator with arrow-key menu"
```

---

### Task 9: Update README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add PowerShell section to Quick Installation & Usage**

After the bash installation options, add:

```markdown
### PowerShell (Windows/Linux/macOS)

#### Option 1: Download and Run
```powershell
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/vancityAyush/ssh_script/main/ssh.ps1" -OutFile "ssh.ps1"
./ssh.ps1
```

#### Option 2: One-liner
```powershell
irm https://raw.githubusercontent.com/vancityAyush/ssh_script/main/ssh.ps1 | iex
```
```

- [ ] **Step 2: Update Features section**

Add to the features list:
- Arrow-key navigation for provider selection (Claude CLI-style)
- PowerShell support (5.1+ and pwsh 7+)
- Optional git username/email configuration
- ed25519 keys for all providers
- Cleanup on failure (partial key removal)

- [ ] **Step 3: Update Platform Support table**

Add PowerShell row and note ed25519 for all.

- [ ] **Step 4: Add v3.0.0 changelog entry**

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: update README with PowerShell support and new features"
```

---

### Task 10: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update architecture section**

Add `ssh.ps1` to the overview. Update the phases to mention git config setup and cleanup trap. Note that the project now has two entry points.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with PowerShell script and new architecture"
```

---

### Task 11: Update release workflow

**Files:**
- Modify: `.github/workflows/release.yml:61-65` (binary asset prep)

- [ ] **Step 1: Add ssh.ps1 to release assets**

In the "Prepare binary asset" step, add:
```yaml
cp ssh.ps1 release/ssh-key-generator.ps1
```

In the "Upload Release Assets" step, add `ssh.ps1` and `release/ssh-key-generator.ps1` to the files list.

- [ ] **Step 2: Update release notes template**

Add PowerShell section to the generated release_notes.md.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add ssh.ps1 to release assets"
```
