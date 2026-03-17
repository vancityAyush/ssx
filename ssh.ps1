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
            Write-Host "$Title$(' ' * 20)"
            for ($i = 0; $i -lt $count; $i++) {
                if ($i -eq $selected) {
                    Write-Host "  > $($Options[$i])$(' ' * 20)" -ForegroundColor Green
                } else {
                    Write-Host "    $($Options[$i])$(' ' * 20)"
                }
            }
        }
    } finally {
        [Console]::CursorVisible = $true
    }
}

# --- Validation helpers ---
function Test-NoSpaces {
    param([string]$Value, [string]$Label)
    if ([string]::IsNullOrWhiteSpace($Value)) {
        Write-Host "Error: $Label cannot be empty" -ForegroundColor Red
        return $false
    }
    if ($Value -match '\s') {
        Write-Host "Error: $Label cannot contain spaces" -ForegroundColor Red
        return $false
    }
    return $true
}

function Test-EmailAddress {
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
        elseif ($IsLinux) {
            if (Test-Path /proc/version) {
                $procVersion = Get-Content /proc/version -Raw
                if ($procVersion -match 'Microsoft') { return "wsl" }
            }
            return "linux"
        }
        elseif ($IsMacOS) { return "macos" }
    }
    # Windows PowerShell 5.1
    return "windows"
}

# --- Provider data ---
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

# --- Auto-detect from git remote ---
$detectedProvider = $null
$detectedUsername = ""
$detectedEmail = ""

if (Get-Command git -ErrorAction SilentlyContinue) {
    $detectedEmail = & git config --global user.email 2>$null
    $detectedUsername = & git config --global user.name 2>$null

    $remoteUrl = & git remote get-url origin 2>$null
    if ($remoteUrl) {
        if ($remoteUrl -match 'bitbucket\.org')              { $detectedProvider = 0 }
        elseif ($remoteUrl -match 'github\.com')              { $detectedProvider = 1 }
        elseif ($remoteUrl -match 'gitlab\.com')              { $detectedProvider = 2 }
        elseif ($remoteUrl -match 'dev\.azure\.com|vs-ssh\.visualstudio\.com') { $detectedProvider = 3 }

        # Extract username from remote URL if not in git config
        if (-not $detectedUsername) {
            if ($remoteUrl -match 'git@[^:]+:([^/]+)/') {
                $detectedUsername = $matches[1]
            } elseif ($remoteUrl -match 'https://[^/]+/([^/]+)/') {
                $detectedUsername = $matches[1]
            }
        }
    }
}

# --- State for cleanup ---
$script:keygenStarted = $false
$script:keygenDone = $false
$script:keyPath = ""

$script:originalDir = Get-Location

try {
    # Navigate to SSH directory
    $sshDir = Join-Path $HOME ".ssh"
    if (-not (Test-Path $sshDir)) {
        New-Item -ItemType Directory -Path $sshDir -Force | Out-Null
    }
    Set-Location $sshDir

    # Provider selection
    if ($null -ne $detectedProvider) {
        $providerName = $providers[$detectedProvider]
        Write-Host "Detected provider from git remote: $providerName"
        $useDetected = Read-Host "Use ${providerName}? (Y/N)"
        if ($useDetected -match '^[Yy]' -or $useDetected -eq '') {
            $option = $detectedProvider
        } else {
            $option = Show-Menu -Title "Select your Git provider:" -Options $providers
        }
    } else {
        $option = Show-Menu -Title "Select your Git provider:" -Options $providers
    }

    # Email input
    do {
        if ($detectedEmail) {
            $email = Read-Host "Enter your email [$detectedEmail]"
            if ([string]::IsNullOrWhiteSpace($email)) { $email = $detectedEmail }
        } else {
            $email = Read-Host "Enter your email"
        }
    } while (-not (Test-EmailAddress $email))

    # Key name input
    do {
        $keyName = Read-Host "Enter your SSH key name"
    } while (-not (Test-NoSpaces -Value $keyName -Label "Key name"))

    # Generate SSH key
    Write-Host "Generating SSH key..."
    $script:keygenStarted = $true
    $script:keyPath = Join-Path $sshDir $keyName
    if ($option -eq 3) {
        # Azure DevOps requires RSA keys (minimum 2048-bit)
        & ssh-keygen -t rsa -b 4096 -C $email -f $script:keyPath -N ""
    } else {
        # GitHub, Bitbucket, GitLab support ed25519
        & ssh-keygen -t ed25519 -C $email -f $script:keyPath -N ""
    }

    if (-not (Test-Path $script:keyPath) -or -not (Test-Path "$($script:keyPath).pub")) {
        throw "SSH key generation failed"
    }
    $script:keygenDone = $true
    Write-Host "SSH key generated successfully!"

    # Start SSH agent and add key
    Write-Host "Starting SSH agent and adding key..."
    $platform = Get-Platform
    $agentOk = $false
    if ($platform -eq "windows") {
        $agentService = Get-Service ssh-agent -ErrorAction SilentlyContinue
        if ($agentService) {
            if ($agentService.StartType -eq 'Disabled') {
                # Try to enable the service (requires admin)
                try {
                    Set-Service ssh-agent -StartupType Manual -ErrorAction Stop
                } catch {
                    Write-Host "Warning: ssh-agent service is disabled. Run as Administrator to enable it." -ForegroundColor Yellow
                }
            }
            if ($agentService.Status -ne 'Running') {
                try {
                    Start-Service ssh-agent -ErrorAction Stop
                } catch {
                    Write-Host "Warning: Could not start ssh-agent service. Run as Administrator to start it." -ForegroundColor Yellow
                }
            }
            # Re-check status
            $agentService = Get-Service ssh-agent -ErrorAction SilentlyContinue
            if ($agentService -and $agentService.Status -eq 'Running') {
                $agentOk = $true
            }
        } else {
            Write-Host "Warning: OpenSSH ssh-agent service not found. Install OpenSSH optional feature." -ForegroundColor Yellow
        }
    } else {
        if (-not $env:SSH_AUTH_SOCK) {
            $agentOutput = & ssh-agent -s 2>&1
            foreach ($line in $agentOutput) {
                if ($line -match '(\w+)=([^;]+)') {
                    [Environment]::SetEnvironmentVariable($matches[1], $matches[2])
                }
            }
        }
        $agentOk = $true
    }
    if ($agentOk) {
        & ssh-add $script:keyPath
    } else {
        Write-Host "Skipping ssh-add (agent not running). SSH will use the key from config directly." -ForegroundColor Yellow
    }

    # SSH config
    $configFile = Join-Path $sshDir "config"
    if (-not (Test-Path $configFile)) {
        New-Item -ItemType File -Path $configFile -Force | Out-Null
    }

    $defaultHostName = $hostnames[$option]

    $customHost = Read-Host "Do you want to add custom host name? (Y/N)"
    if ($customHost -match '^[Yy]') {
        do {
            $hostName = Read-Host "Enter your host name (e.g., work.github.com)"
        } while (-not (Test-NoSpaces -Value $hostName -Label "Host name"))
    } else {
        $hostName = $defaultHostName
    }

    $configContent = Get-Content $configFile -Raw -ErrorAction SilentlyContinue
    if ($configContent -and $configContent -match "Host\s+$([regex]::Escape($hostName))(\s|$)") {
        Write-Host "Host '$hostName' already exists in config!"
        $replaceChoice = Read-Host "Do you want to replace it? (Y/N)"
        if ($replaceChoice -match '^[Yy]') {
            # Remove existing host block (Host line + indented lines that follow)
            $escapedHost = [regex]::Escape($hostName)
            $configContent = $configContent -replace "(?m)\r?\nHost\s+$escapedHost\s*\r?\n(?:\s+.+\r?\n)*", "`n"
            $configContent = $configContent -replace "(?m)^Host\s+$escapedHost\s*\r?\n(?:\s+.+\r?\n)*", ""
            Set-Content -Path $configFile -Value $configContent.TrimEnd() -NoNewline
        } else {
            Write-Host "Skipping SSH config update."
        }
    }

    if (-not ($replaceChoice) -or ($replaceChoice -match '^[Yy]')) {
        $configBlock = @"

Host $hostName
  HostName $defaultHostName
  AddKeysToAgent yes
  IdentityFile ~/.ssh/$keyName
"@
        Add-Content -Path $configFile -Value $configBlock
        Write-Host "SSH config updated successfully!"
    }

    # Optional git config setup (per-key, using includeIf)
    $configGit = Read-Host "Do you want to configure git username and email for this key? (Y/N)"
    if ($configGit -match '^[Yy]') {
        $defaultUsername = if ($detectedUsername) { $detectedUsername } else { ($email -split '@')[0] }
        $gitUsername = Read-Host "Enter your git username [$defaultUsername]"
        if ([string]::IsNullOrWhiteSpace($gitUsername)) { $gitUsername = $defaultUsername }

        $gitconfigFile = Join-Path $sshDir ".gitconfig-$keyName"
        @"
[user]
    name = $gitUsername
    email = $email
"@ | Set-Content -Path $gitconfigFile

        $includeHost = if ($hostName -ne $defaultHostName) { $hostName } else { $defaultHostName }
        & git config --global "includeIf.hasconfig:remote.*.url:git@${includeHost}:*/**" ".path" $gitconfigFile
        & git config --global "includeIf.hasconfig:remote.*.url:ssh://git@${includeHost}/**" ".path" $gitconfigFile

        Write-Host "Git config for this key saved to $gitconfigFile"
        Write-Host "  user.name  = $gitUsername"
        Write-Host "  user.email = $email"
        Write-Host "  (applied automatically for repos with $includeHost remotes)"
    } else {
        Write-Host "Skipping git config setup."
    }

    # Copy to clipboard
    $pubKeyPath = "$($script:keyPath).pub"
    $pubKey = Get-Content $pubKeyPath -Raw

    switch ($platform) {
        "windows" {
            $pubKey | Set-Clipboard
            Write-Host "SSH public key copied to clipboard!"
        }
        "macos" {
            $pubKey | & pbcopy
            Write-Host "SSH public key copied to clipboard!"
        }
        default {
            if (Get-Command xclip -ErrorAction SilentlyContinue) {
                $pubKey | & xclip -selection clipboard
                Write-Host "SSH public key copied to clipboard!"
            } elseif (Get-Command clip.exe -ErrorAction SilentlyContinue) {
                $pubKey | & clip.exe
                Write-Host "SSH public key copied to clipboard!"
            } else {
                Write-Host "Warning: Could not copy to clipboard automatically."
                Write-Host "Please copy the following SSH public key manually:"
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
        "macos"   { & open $settingsUrl }
        default {
            if (Get-Command xdg-open -ErrorAction SilentlyContinue) {
                & xdg-open $settingsUrl 2>&1 | Out-Null
                Write-Host "Browser opened successfully!"
            } else {
                Write-Host "Could not automatically open browser."
                Write-Host "Please manually visit: $settingsUrl"
            }
        }
    }

    # SSH connection test loop
    Write-Host ""
    Write-Host "Add the SSH key to your Git provider, then test the connection."
    while ($true) {
        $choice = Read-Host "Press T to test SSH key, or any other key to exit"
        Write-Host ""

        if ($choice -match '^[Tt]') {
            Write-Host "Testing SSH connection to git@$hostName..."
            $sshOutput = & ssh -T -i $script:keyPath -o StrictHostKeyChecking=accept-new -o BatchMode=yes "git@$hostName" 2>&1
            $exitCode = $LASTEXITCODE
            $outputStr = $sshOutput -join "`n"

            if ($exitCode -eq 0 -or $exitCode -eq 1 -or $outputStr -match "successfully authenticated|Shell access is not supported") {
                # Filter out confusing Azure DevOps messages
                $filteredOutput = ($sshOutput | Where-Object { $_ -notmatch "shell request failed|Shell access is not supported" }) -join "`n"
                if ($filteredOutput.Trim()) {
                    Write-Host $filteredOutput
                }
                Write-Host "SSH connection successful! Your SSH key is working." -ForegroundColor Green
            } else {
                Write-Host $outputStr
                Write-Host "SSH connection failed. Please check your SSH key setup." -ForegroundColor Red
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
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "1. Add the public key to your Git provider"
    Write-Host "2. Test the connection using the 'T' option above"
    Write-Host ""

} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
} finally {
    # Restore original directory
    Set-Location $script:originalDir
    # Cleanup partial key files on failure
    if ($script:keygenStarted -and -not $script:keygenDone -and $script:keyPath) {
        Write-Host "Cleaning up partial SSH key files..."
        Remove-Item -Path $script:keyPath -ErrorAction SilentlyContinue
        Remove-Item -Path "$($script:keyPath).pub" -ErrorAction SilentlyContinue
    }
}
