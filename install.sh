#!/bin/sh
set -eu

PACKAGE_NAME="${SSHX_PACKAGE_NAME:-@vancityayush/sshx}"
INSTALL_PREFIX="${SSHX_INSTALL_PREFIX:-${HOME:-$PWD}/.local}"
RUN_AFTER_INSTALL=1
REQUESTED_TAG="${SSHX_RELEASE_TAG:-}"

usage() {
    cat <<'EOF'
Usage: install.sh [options] [-- sshx-args...]

Installs the TypeScript sshx CLI with npm and launches it immediately by default.

Options:
  --prefix DIR   Install under DIR (default: ~/.local)
  --tag TAG      Install a specific tag such as sshx-v0.2.0
  --no-run       Install only; do not launch sshx
  -h, --help     Show this help
EOF
}

fail() {
    printf 'Error: %s\n' "$*" >&2
    exit 1
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

resolve_package_spec() {
    if [ -n "$REQUESTED_TAG" ]; then
        version="${REQUESTED_TAG#sshx-v}"
        printf '%s@%s\n' "$PACKAGE_NAME" "$version"
        return
    fi

    printf '%s\n' "$PACKAGE_NAME"
}

ensure_path_hint() {
    bin_dir="$1"
    case ":${PATH:-}:" in
        *":$bin_dir:"*) return ;;
    esac

    printf '\nAdd %s to your PATH to run sshx directly in future shells:\n' "$bin_dir" >&2
    printf '  export PATH="%s:$PATH"\n' "$bin_dir" >&2
}

main() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --prefix)
                [ "$#" -ge 2 ] || fail "--prefix requires a directory"
                INSTALL_PREFIX="$2"
                shift 2
                ;;
            --tag)
                [ "$#" -ge 2 ] || fail "--tag requires a value"
                REQUESTED_TAG="$2"
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

    command_exists npm || fail "npm is required for install.sh"

    package_spec="$(resolve_package_spec)"
    bin_dir="${INSTALL_PREFIX}/bin"

    printf 'Installing %s under %s\n' "$package_spec" "$INSTALL_PREFIX" >&2
    npm install -g --prefix "$INSTALL_PREFIX" "$package_spec"
    ensure_path_hint "$bin_dir"

    if [ "$RUN_AFTER_INSTALL" -eq 1 ]; then
        printf '\nLaunching sshx...\n' >&2
        exec "${bin_dir}/sshx" "$@"
    fi
}

main "$@"
