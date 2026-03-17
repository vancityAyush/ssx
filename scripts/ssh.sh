#!/bin/bash

# Ensure the script is running under bash (not sh/dash)
if [ -z "${BASH_VERSION:-}" ]; then
    echo "Error: This script requires bash. Please run: bash ssh.sh" >&2
    exit 1
fi

# Exit on any error
set -e

# --- TUI: Arrow-key selection menu ---
select_option() {
    local title="$1"
    shift
    local options=("$@")
    local selected=0
    local count=${#options[@]}

    # Hide cursor
    printf '\e[?25l' > /dev/tty

    # Print title and options
    printf '%s\n' "$title" > /dev/tty
    for i in "${!options[@]}"; do
        if [ "$i" -eq "$selected" ]; then
            printf '  \e[1;32m> %s\e[0m\n' "${options[$i]}" > /dev/tty
        else
            printf '    %s\n' "${options[$i]}" > /dev/tty
        fi
    done

    while true; do
        # Read a single key directly from the terminal
        IFS= read -rsn1 key < /dev/tty

        # Handle escape sequences (arrow keys)
        if [ "$key" = $'\x1b' ]; then
            read -rsn2 -t 0.5 key < /dev/tty
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
            printf '\e[?25h' > /dev/tty # Show cursor
            echo "$selected"
            return
        fi

        # Redraw: move cursor up (count + 1 for title) and reprint
        printf '\e[%dA' "$((count + 1))" > /dev/tty
        printf '\r\e[K%s\n' "$title" > /dev/tty
        for i in "${!options[@]}"; do
            if [ "$i" -eq "$selected" ]; then
                printf '\r\e[K  \e[1;32m> %s\e[0m\n' "${options[$i]}" > /dev/tty
            else
                printf '\r\e[K    %s\n' "${options[$i]}" > /dev/tty
            fi
        done
    done
}

# --- Validation helpers ---
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

# --- Cleanup state ---
KEYGEN_STARTED=false
KEYGEN_DONE=false
KEYNAME_FOR_CLEANUP=""

ORIGINAL_DIR="$(pwd)"

cleanup() {
    printf '\e[?25h' > /dev/tty # Restore cursor
    cd "$ORIGINAL_DIR" 2>/dev/null || true
    if [ "$KEYGEN_STARTED" = true ] && [ "$KEYGEN_DONE" != true ] && [ -n "$KEYNAME_FOR_CLEANUP" ]; then
        echo ""
        echo "Cleaning up partial SSH key files..."
        rm -f "$HOME/.ssh/$KEYNAME_FOR_CLEANUP" "$HOME/.ssh/$KEYNAME_FOR_CLEANUP.pub"
    fi
}
trap cleanup EXIT INT TERM

# Function to detect operating system
detect_os() {
    case "$OSTYPE" in
        linux-gnu*)
            if grep -q Microsoft /proc/version 2>/dev/null; then
                echo "wsl"
            else
                echo "linux"
            fi
            ;;
        darwin*)
            echo "macos"
            ;;
        cygwin|msys|win32)
            echo "windows"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

# --- Auto-detect from git remote ---
detected_provider=""
detected_username=""
detected_email=""

if command -v git &> /dev/null; then
    # Try to get email/username from existing git config
    detected_email=$(git config --global user.email 2>/dev/null || true)
    detected_username=$(git config --global user.name 2>/dev/null || true)

    # Try to detect provider from git remote
    remote_url=$(git remote get-url origin 2>/dev/null || true)
    if [ -n "$remote_url" ]; then
        case "$remote_url" in
            *bitbucket.org*)    detected_provider="1" ;;
            *github.com*)       detected_provider="2" ;;
            *gitlab.com*)       detected_provider="3" ;;
            *dev.azure.com*|*vs-ssh.visualstudio.com*) detected_provider="4" ;;
        esac

        # Extract username from remote URL
        # SSH: git@github.com:username/repo.git
        # HTTPS: https://github.com/username/repo.git
        if [ -z "$detected_username" ]; then
            case "$remote_url" in
                git@*:*/*)
                    detected_username=$(echo "$remote_url" | sed 's/.*://;s/\/.*//')
                    ;;
                https://*/*)
                    detected_username=$(echo "$remote_url" | sed 's|https://[^/]*/||;s|/.*||')
                    ;;
            esac
        fi
    fi
fi

# Navigate to SSH directory with error handling
cd "$HOME" || { echo "Error: Cannot access home directory"; exit 1; }
mkdir -p .ssh || { echo "Error: Cannot create .ssh directory"; exit 1; }
cd .ssh || { echo "Error: Cannot access .ssh directory"; exit 1; }

# Get provider selection with arrow-key menu
providers=("Bitbucket" "GitHub" "GitLab" "Azure DevOps")
if [ -n "$detected_provider" ]; then
    detected_index=$((detected_provider - 1))
    echo "Detected provider from git remote: ${providers[$detected_index]}"
    read -r -p "Use ${providers[$detected_index]}? (Y/N): " useDetected
    case "$useDetected" in
        [Yy]|[Yy][Ee][Ss]|"")
            option="$detected_provider"
            ;;
        *)
            option=$(select_option "Select your Git provider:" "${providers[@]}")
            option=$((option + 1))
            ;;
    esac
else
    option=$(select_option "Select your Git provider:" "${providers[@]}")
    # Convert from 0-based to 1-based to match existing logic
    option=$((option + 1))
fi

while true; do
    if [ -n "$detected_email" ]; then
        read -r -p "Enter your email [$detected_email]: " email
        email="${email:-$detected_email}"
    else
        read -r -p "Enter your email: " email
    fi
    # Basic email validation - check for @ symbol and dot
    case "$email" in
        *@*.*)
            # Additional check to ensure it's not just @.
            if [ "${email}" != "@." ] && [ -n "${email%%@*}" ] && [ -n "${email##*@}" ]; then
                break
            else
                echo "Error: Please enter a valid email address"
            fi
            ;;
        *)
            echo "Error: Please enter a valid email address"
            ;;
    esac
done

while true; do
    read -r -p "Enter your SSH key name: " keyName
    if validate_no_spaces "$keyName" "Key name"; then
        break
    fi
done

# Generate SSH key
echo "Generating SSH key..."
KEYGEN_STARTED=true
KEYNAME_FOR_CLEANUP="$keyName"
if [ "$option" = "4" ]; then
    # Azure DevOps requires RSA keys (minimum 2048-bit)
    ssh-keygen -t rsa -b 4096 -C "$email" -f "$keyName" -N ""
else
    # GitHub, Bitbucket, GitLab support ed25519
    ssh-keygen -t ed25519 -C "$email" -f "$keyName" -N ""
fi

# Verify key was created successfully
if [ ! -f "$keyName" ] || [ ! -f "$keyName.pub" ]; then
    echo "Error: SSH key generation failed"
    exit 1
fi
KEYGEN_DONE=true

echo "SSH key generated successfully!"

# Start SSH agent and add key
echo "Starting SSH agent and adding key..."
OS=$(detect_os)

if [ "$OS" = "windows" ]; then
    # Windows/Git Bash handling
    if ! pgrep -x "ssh-agent" > /dev/null; then
        eval "$(ssh-agent -s)"
    fi
else
    # Unix-like systems (Linux, macOS, WSL)
    if [ -z "$SSH_AUTH_SOCK" ]; then
        eval "$(ssh-agent -s)"
    fi
fi

ssh-add "$keyName" || { echo "Error: Failed to add SSH key to agent"; exit 1; }

# Create/update SSH config file
config_file="config"
touch "$config_file" || { echo "Error: Cannot create config file"; exit 1; }

if [ ! -w "$config_file" ]; then
    echo "Error: Config file is not writable"
    exit 1
fi

getDefaultHostName() {
    case "$option" in
        "1") echo "bitbucket.org" ;;
        "2") echo "github.com" ;;
        "3") echo "gitlab.com" ;;
        "4") echo "ssh.dev.azure.com" ;;
        *) echo "unknown" ;;
    esac
}

writeConfig() {
    local host="$1"
    local key="$2"

    if grep -q "Host $host" "$config_file"; then
        echo "Host '$host' already exists in config!"
        read -r -p "Do you want to replace it? (Y/N): " replaceChoice
        if [[ "$replaceChoice" =~ ^[Yy] ]]; then
            # Remove existing host block (Host line + indented lines that follow)
            sed -i.bak "/^Host $host$/,/^[^ ]/{/^Host $host$/d;/^  /d;}" "$config_file"
            rm -f "${config_file}.bak"
        else
            echo "Skipping SSH config update."
            return
        fi
    fi
    {
        printf "\nHost %s\n" "$host"
        printf "  HostName %s\n" "$(getDefaultHostName)"
        printf "  AddKeysToAgent yes\n"
        printf "  IdentityFile ~/.ssh/%s\n" "$key"
    } >> "$config_file"
    echo "SSH config updated successfully!"
}

# Get hostname configuration
read -r -p "Do you want to add custom host name? (Y/N): " choiceHost

case "$choiceHost" in
    [Yy]|[Yy][Ee][Ss])
        while true; do
            read -r -p "Enter your host name (e.g., work.github.com): " hostName
            if validate_no_spaces "$hostName" "Host name"; then
                break
            fi
        done
        ;;
    *)
        hostName=$(getDefaultHostName)
        ;;
esac

writeConfig "$hostName" "$keyName"

# Optional git config setup (per-key, using includeIf)
read -r -p "Do you want to configure git username and email for this key? (Y/N): " configGit

case "$configGit" in
    [Yy]|[Yy][Ee][Ss])
        default_username="${detected_username:-${email%%@*}}"
        read -r -p "Enter your git username [$default_username]: " gitUsername
        gitUsername="${gitUsername:-$default_username}"

        gitconfigFile="$HOME/.ssh/.gitconfig-$keyName"
        cat > "$gitconfigFile" <<EOF
[user]
    name = $gitUsername
    email = $email
EOF

        defaultHost=$(getDefaultHostName)
        includeHost="$hostName"
        if [ "$hostName" = "$defaultHost" ]; then
            includeHost="$defaultHost"
        fi
        git config --global "includeIf.hasconfig:remote.*.url:git@${includeHost}:*/**" ".path" "$gitconfigFile"
        git config --global "includeIf.hasconfig:remote.*.url:ssh://git@${includeHost}/**" ".path" "$gitconfigFile"

        echo "Git config for this key saved to $gitconfigFile"
        echo "  user.name  = $gitUsername"
        echo "  user.email = $email"
        echo "  (applied automatically for repos with $includeHost remotes)"
        ;;
    *)
        echo "Skipping git config setup."
        ;;
esac

# Cross-platform clipboard functionality
copy_to_clipboard() {
    local file="$1"
    local os
    os=$(detect_os)
    local success=false

    case "$os" in
        "macos")
            if command -v pbcopy &> /dev/null; then
                pbcopy < "$file" && success=true
            fi
            ;;
        "linux")
            if command -v xclip &> /dev/null; then
                xclip -selection clipboard < "$file" && success=true
            elif command -v xsel &> /dev/null; then
                xsel --clipboard --input < "$file" && success=true
            fi
            ;;
        "wsl")
            if command -v clip.exe &> /dev/null; then
                clip.exe < "$file" && success=true
            elif command -v xclip &> /dev/null; then
                xclip -selection clipboard < "$file" && success=true
            fi
            ;;
        "windows")
            if command -v clip.exe &> /dev/null; then
                clip.exe < "$file" && success=true
            elif command -v clip &> /dev/null; then
                clip < "$file" && success=true
            fi
            ;;
    esac

    if [ "$success" = true ]; then
        echo "SSH public key copied to clipboard!"
    else
        echo "Warning: Could not copy to clipboard automatically."
        echo "Please copy the following SSH public key manually:"
    fi
}

copy_to_clipboard "$keyName.pub"
echo ""
echo "SSH Public Key:"
cat "$keyName.pub"
echo ""

# Cross-platform URL opening
open_settings_page() {
    local option="$1"
    local settings_url=""
    local os
    os=$(detect_os)

    case "$option" in
        "1") settings_url="https://bitbucket.org/account/settings/ssh-keys/" ;;
        "2") settings_url="https://github.com/settings/keys" ;;
        "3") settings_url="https://gitlab.com/-/profile/keys" ;;
        "4") settings_url="https://dev.azure.com/_usersSettings/keys" ;;
        *) echo "Error: Invalid option for opening settings page"; return 1 ;;
    esac

    echo "Opening SSH settings page in your browser..."

    case "$os" in
        "macos")
            if command -v open &> /dev/null; then
                open "$settings_url" && echo "Browser opened successfully!"
                return 0
            fi
            ;;
        "linux"|"wsl")
            if command -v xdg-open &> /dev/null; then
                xdg-open "$settings_url" &> /dev/null && echo "Browser opened successfully!"
                return 0
            elif command -v sensible-browser &> /dev/null; then
                sensible-browser "$settings_url" &> /dev/null && echo "Browser opened successfully!"
                return 0
            fi
            ;;
        "windows")
            if command -v start &> /dev/null; then
                start "$settings_url" && echo "Browser opened successfully!"
                return 0
            elif command -v cmd.exe &> /dev/null; then
                cmd.exe /c start "$settings_url" && echo "Browser opened successfully!"
                return 0
            fi
            ;;
    esac

    echo "Could not automatically open browser."
    echo "Please manually visit: $settings_url"
}

open_settings_page "$option"
echo ""

# SSH key testing loop
echo "Add the SSH key to your Git provider, then test the connection."
while true; do
    read -r -p "Press T to test SSH key, or any other key to exit: " choice
    echo ""

    case "$choice" in
        [Tt]|[Tt][Ee][Ss][Tt])
            echo "Testing SSH connection to git@$hostName..."
            exit_code=0
            ssh_output=$(ssh -T -i "$HOME/.ssh/$keyName" -o StrictHostKeyChecking=accept-new -o BatchMode=yes "git@$hostName" 2>&1) || exit_code=$?

            if [ "$exit_code" -eq 0 ] || [ "$exit_code" -eq 1 ] || echo "$ssh_output" | grep -qi "successfully authenticated\|Shell access is not supported"; then
                # Filter out confusing Azure DevOps messages
                filtered_output=$(echo "$ssh_output" | grep -vi "shell request failed\|Shell access is not supported")
                if [ -n "$filtered_output" ]; then
                    echo "$filtered_output"
                fi
                echo "SSH connection successful! Your SSH key is working."
            else
                echo "$ssh_output"
                echo "SSH connection failed. Please check your SSH key setup."
            fi
            ;;
        *)
            echo "Exiting script. SSH setup complete!"
            break
            ;;
    esac
    echo ""
done

# Script completion message
echo ""
echo "==========================================="
echo "SSH Setup Complete!"
echo "==========================================="
echo "SSH key generated: $keyName"
echo "SSH key added to agent"
echo "SSH config updated"
echo "Public key copied to clipboard (if supported)"
echo ""
echo "Next steps:"
echo "1. Add the public key to your Git provider"
echo "2. Test the connection using the 'T' option above"
echo ""
