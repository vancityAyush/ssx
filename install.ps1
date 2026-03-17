param(
    [string]$InstallDir,
    [string]$Tag,
    [switch]$NoRun,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$SshxArgs
)

$ErrorActionPreference = "Stop"

$Repo = if ($env:SSHX_REPO) { $env:SSHX_REPO } else { "vancityAyush/sshx" }
if (-not $InstallDir) {
    $InstallDir = if ($env:SSHX_INSTALL_DIR) {
        $env:SSHX_INSTALL_DIR
    } elseif ($env:LOCALAPPDATA) {
        Join-Path $env:LOCALAPPDATA "sshx\bin"
    } else {
        Join-Path $HOME ".local/bin"
    }
}

if (-not $Tag -and $env:SSHX_RELEASE_TAG) {
    $Tag = $env:SSHX_RELEASE_TAG
}

function Get-PlatformAsset {
    $os = [System.Runtime.InteropServices.RuntimeInformation]::OSDescription
    $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()

    $platform = switch -Regex ($os) {
        "Windows" { "windows"; break }
        "Darwin|macOS" { "darwin"; break }
        "Linux" { "linux"; break }
        default { throw "Unsupported operating system: $os" }
    }

    $suffix = switch ($platform) {
        "windows" {
            if ($arch -ne "x64" -and $arch -ne "amd64") {
                throw "Unsupported Windows architecture: $arch"
            }
            "windows-x86_64.exe"
        }
        "darwin" {
            switch ($arch) {
                "x64" { "darwin-x86_64" }
                "arm64" { "darwin-aarch64" }
                default { throw "Unsupported macOS architecture: $arch" }
            }
        }
        "linux" {
            switch ($arch) {
                "x64" { "linux-x86_64" }
                "arm64" { "linux-aarch64" }
                default { throw "Unsupported Linux architecture: $arch" }
            }
        }
    }

    return @{
        Artifact = "sshx-$suffix"
        BinaryName = if ($platform -eq "windows") { "sshx.exe" } else { "sshx" }
        Platform = $suffix
    }
}

function Get-ReleaseTag {
    param([string]$Repository, [string]$RequestedTag)

    if ($RequestedTag) {
        return $RequestedTag
    }

    $releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repository/releases?per_page=100"
    $release = $releases | Where-Object { $_.tag_name -like "sshx-v*" } | Select-Object -First 1
    if (-not $release) {
        throw "Could not find an sshx release."
    }

    return $release.tag_name
}

function Add-UserPathIfNeeded {
    param([string]$Directory)

    if ($env:OS -ne "Windows_NT") {
        return
    }

    $userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($userPath -split ";" | Where-Object { $_ -eq $Directory }) {
        return
    }

    $newPath = if ([string]::IsNullOrWhiteSpace($userPath)) { $Directory } else { "$userPath;$Directory" }
    [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
    Write-Host "Added $Directory to your user PATH for future sessions."
}

$asset = Get-PlatformAsset
$resolvedTag = Get-ReleaseTag -Repository $Repo -RequestedTag $Tag
$downloadUrl = "https://github.com/$Repo/releases/download/$resolvedTag/$($asset.Artifact)"
$targetPath = Join-Path $InstallDir $asset.BinaryName
$tempPath = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName())

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Write-Host "Detected platform: $($asset.Platform)"
Write-Host "Installing $resolvedTag to $targetPath"
Invoke-WebRequest -Uri $downloadUrl -OutFile $tempPath
Move-Item -Force $tempPath $targetPath
Add-UserPathIfNeeded -Directory $InstallDir

if (-not $NoRun) {
    Write-Host ""
    Write-Host "Launching sshx..."
    & $targetPath @SshxArgs
    exit $LASTEXITCODE
}

Write-Host "sshx installed successfully at $targetPath"
