param(
    [string]$Prefix,
    [string]$Tag,
    [switch]$NoRun,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$SshxArgs
)

$ErrorActionPreference = "Stop"

$PackageName = if ($env:SSHX_PACKAGE_NAME) { $env:SSHX_PACKAGE_NAME } else { "@vancityayush/sshx" }
if (-not $Prefix) {
    $Prefix = if ($env:SSHX_INSTALL_PREFIX) {
        $env:SSHX_INSTALL_PREFIX
    } elseif ($env:LOCALAPPDATA) {
        Join-Path $env:LOCALAPPDATA "sshx"
    } else {
        Join-Path $HOME ".local"
    }
}

if (-not $Tag -and $env:SSHX_RELEASE_TAG) {
    $Tag = $env:SSHX_RELEASE_TAG
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm is required for install.ps1"
}

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    throw "bun is required for the TUI build of sshx. Install it from https://bun.sh"
}

$PackageSpec = if ($Tag) {
    $Version = $Tag -replace '^sshx-v', ''
    "$PackageName@$Version"
} else {
    $PackageName
}

$BinDir = Join-Path $Prefix "bin"
Write-Host "Installing $PackageSpec under $Prefix"
& npm install -g --prefix $Prefix $PackageSpec

if (-not $NoRun) {
    Write-Host ""
    Write-Host "Launching sshx..."
    & (Join-Path $BinDir "sshx.cmd") @SshxArgs
    exit $LASTEXITCODE
}

Write-Host "sshx installed at $BinDir"
