#!/bin/sh
set -eu

REPO="${SSHX_REPO:-vancityAyush/sshx}"
RUN_AFTER_INSTALL=1
RELEASE_TAG="${SSHX_RELEASE_TAG:-}"
INSTALL_DIR="${SSHX_INSTALL_DIR:-${INSTALL_DIR:-}}"

usage() {
    cat <<'EOF'
Usage: install.sh [options] [-- sshx-args...]

Downloads the latest sshx release for your platform, installs it locally,
and runs it immediately by default.

Options:
  --install-dir DIR  Install location (default: ~/.local/bin or ~/bin)
  --tag TAG          Install a specific release tag (for example sshx-v0.2.0)
  --no-run           Install only; do not launch sshx
  -h, --help         Show this help

Examples:
  curl -fsSL https://raw.githubusercontent.com/vancityAyush/sshx/main/install.sh | sh
  curl -fsSL https://raw.githubusercontent.com/vancityAyush/sshx/main/install.sh | sh -s -- setup github -e you@example.com -k personal
EOF
}

log() {
    printf '%s\n' "$*" >&2
}

fail() {
    log "Error: $*"
    exit 1
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

download() {
    url="$1"
    destination="$2"

    if command_exists curl; then
        curl -fsSL "$url" -o "$destination"
        return
    fi

    if command_exists wget; then
        wget -qO "$destination" "$url"
        return
    fi

    fail "curl or wget is required to download sshx"
}

detect_platform() {
    os="$(uname -s)"
    arch="$(uname -m)"

    case "$os" in
        Darwin)
            case "$arch" in
                x86_64)
                    DETECTED_PLATFORM="darwin-x86_64"
                    DETECTED_BINARY_NAME="sshx"
                    ;;
                arm64|aarch64)
                    DETECTED_PLATFORM="darwin-aarch64"
                    DETECTED_BINARY_NAME="sshx"
                    ;;
                *) fail "unsupported architecture: $arch" ;;
            esac
            ;;
        Linux)
            case "$arch" in
                x86_64)
                    DETECTED_PLATFORM="linux-x86_64"
                    DETECTED_BINARY_NAME="sshx"
                    ;;
                arm64|aarch64)
                    DETECTED_PLATFORM="linux-aarch64"
                    DETECTED_BINARY_NAME="sshx"
                    ;;
                *) fail "unsupported architecture: $arch" ;;
            esac
            ;;
        MINGW*|MSYS*|CYGWIN*)
            DETECTED_PLATFORM="windows-x86_64"
            DETECTED_BINARY_NAME="sshx.exe"
            ;;
        *)
            fail "unsupported OS: $os"
            ;;
    esac
}

resolve_install_dir() {
    if [ -n "$INSTALL_DIR" ]; then
        printf '%s\n' "$INSTALL_DIR"
        return
    fi

    if [ -n "${HOME:-}" ]; then
        case ":${PATH:-}:" in
            *":$HOME/.local/bin:"*)
                printf '%s\n' "$HOME/.local/bin"
                return
                ;;
            *":$HOME/bin:"*)
                printf '%s\n' "$HOME/bin"
                return
                ;;
        esac

        if [ -d "$HOME/.local/bin" ] || [ ! -d "$HOME/bin" ]; then
            printf '%s\n' "$HOME/.local/bin"
            return
        fi

        printf '%s\n' "$HOME/bin"
        return
    fi

    printf '%s\n' "/usr/local/bin"
}

resolve_release_tag() {
    if [ -n "$RELEASE_TAG" ]; then
        printf '%s\n' "$RELEASE_TAG"
        return
    fi

    releases_url="https://api.github.com/repos/${REPO}/releases?per_page=100"
    tmp_json="$(mktemp)"
    download "$releases_url" "$tmp_json"

    tag="$(grep '"tag_name"' "$tmp_json" | sed -n 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' | grep '^sshx-v' | head -n 1 || true)"
    rm -f "$tmp_json"

    [ -n "$tag" ] || fail "could not find an sshx release"
    printf '%s\n' "$tag"
}

ensure_on_path_hint() {
    install_dir="$1"

    case ":${PATH:-}:" in
        *":$install_dir:"*) return ;;
    esac

    log ""
    log "Note: $install_dir is not currently on PATH."
    log "Add it to your shell profile to run sshx directly in future sessions:"
    log "  export PATH=\"$install_dir:\$PATH\""
}

run_sshx() {
    binary_path="$1"
    shift

    if [ "$#" -eq 0 ]; then
        exec "$binary_path"
    fi

    exec "$binary_path" "$@"
}

main() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --install-dir)
                [ "$#" -ge 2 ] || fail "--install-dir requires a directory"
                INSTALL_DIR="$2"
                shift 2
                ;;
            --tag)
                [ "$#" -ge 2 ] || fail "--tag requires a value"
                RELEASE_TAG="$2"
                shift 2
                ;;
            --no-run)
                RUN_AFTER_INSTALL=0
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            --)
                shift
                break
                ;;
            *)
                break
                ;;
        esac
    done

    detect_platform
    platform="$DETECTED_PLATFORM"
    binary_name="$DETECTED_BINARY_NAME"
    artifact="sshx-${platform}"
    target_dir="$(resolve_install_dir)"
    mkdir -p "$target_dir"

    release_tag="$(resolve_release_tag)"
    download_url="https://github.com/${REPO}/releases/download/${release_tag}/${artifact}"
    tmp_file="$(mktemp)"
    target_path="${target_dir}/${binary_name}"

    log "Detected platform: ${platform}"
    log "Installing ${release_tag} to ${target_path}"
    download "$download_url" "$tmp_file"
    chmod +x "$tmp_file"
    mv "$tmp_file" "$target_path"
    ensure_on_path_hint "$target_dir"

    if [ "$RUN_AFTER_INSTALL" -eq 1 ]; then
        log ""
        log "Launching sshx..."
        run_sshx "$target_path" "$@"
    fi

    log "sshx installed successfully at ${target_path}"
}

main "$@"
