#!/bin/sh
set -e

# sshx installer — detects platform and downloads the latest release binary

REPO="vancityayush/ssh_script"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"

detect_platform() {
    os="$(uname -s)"
    arch="$(uname -m)"

    case "$os" in
        Darwin)
            case "$arch" in
                x86_64) echo "darwin-x86_64" ;;
                arm64|aarch64) echo "darwin-aarch64" ;;
                *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
            esac
            ;;
        Linux)
            case "$arch" in
                x86_64) echo "linux-x86_64" ;;
                aarch64) echo "linux-aarch64" ;;
                *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
            esac
            ;;
        MINGW*|MSYS*|CYGWIN*)
            echo "windows-x86_64" ;;
        *)
            echo "Unsupported OS: $os" >&2; exit 1 ;;
    esac
}

main() {
    platform="$(detect_platform)"
    artifact="sshx-${platform}"

    echo "Detected platform: ${platform}"

    # Get latest release tag matching sshx-v*
    latest_tag=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases" \
        | grep '"tag_name"' \
        | grep 'sshx-v' \
        | head -1 \
        | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')

    if [ -z "$latest_tag" ]; then
        echo "Error: Could not find a sshx release." >&2
        exit 1
    fi

    echo "Latest release: ${latest_tag}"

    url="https://github.com/${REPO}/releases/download/${latest_tag}/${artifact}"
    echo "Downloading ${url}..."

    tmp="$(mktemp)"
    curl -fsSL -o "$tmp" "$url"
    chmod +x "$tmp"

    echo "Installing to ${INSTALL_DIR}/sshx..."
    if [ -w "$INSTALL_DIR" ]; then
        mv "$tmp" "${INSTALL_DIR}/sshx"
    else
        sudo mv "$tmp" "${INSTALL_DIR}/sshx"
    fi

    echo "sshx installed successfully! Run 'sshx --help' to get started."
}

main
