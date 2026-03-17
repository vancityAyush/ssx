#!/bin/bash

# Exit on any error
set -e

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

# Navigate to SSH directory with error handling
cd "$HOME" || { echo "Error: Cannot access home directory"; exit 1; }
mkdir -p .ssh || { echo "Error: Cannot create .ssh directory"; exit 1; }
cd .ssh || { echo "Error: Cannot access .ssh directory"; exit 1; }

# Get user input with validation
while true; do
    echo "Select an option:"
    echo "1. Bitbucket"
    echo "2. Github"
    echo "3. GitLab"
    read -r -p "Enter your choice (1-3): " option
    
    case "$option" in
        1|2|3)
            break
            ;;
        *)
            echo "Error: Please enter a valid option (1, 2, or 3)"
            ;;
    esac
done

while true; do
    read -r -p "Enter your email: " email
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
    if [ -n "$keyName" ]; then
        # Check for spaces by comparing with version that has spaces removed
        keyName_no_spaces=$(echo "$keyName" | tr -d ' ')
        if [ "$keyName" = "$keyName_no_spaces" ]; then
            break
        else
            echo "Error: Key name cannot be empty or contain spaces"
        fi
    else
        echo "Error: Key name cannot be empty or contain spaces"
    fi
done

# Generate SSH key based on platform preference
echo "Generating SSH key..."
if [ "$option" = "1" ]; then
    # Bitbucket - use ed25519 (no -b flag for ed25519)
    ssh-keygen -t ed25519 -C "$email" -f "$keyName" -N ""
elif [ "$option" = "2" ]; then
    # GitHub - use ed25519
    ssh-keygen -t ed25519 -C "$email" -f "$keyName" -N ""
elif [ "$option" = "3" ]; then
    # GitLab - use RSA with 4096 bits for compatibility
    ssh-keygen -t rsa -b 4096 -C "$email" -f "$keyName" -N ""
fi

# Verify key was created successfully
if [ ! -f "$keyName" ] || [ ! -f "$keyName.pub" ]; then
    echo "Error: SSH key generation failed"
    exit 1
fi

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
        *) echo "unknown" ;;
    esac
}

writeConfig() {
    local host="$1"
    local key="$2"
    
    if ! grep -q "Host $host" "$config_file"; then
        {
            printf "\nHost %s\n" "$host"
            printf "  HostName %s\n" "$(getDefaultHostName)"
            printf "  AddKeysToAgent yes\n"
            printf "  IdentityFile ~/.ssh/%s\n" "$key"
        } >> "$config_file"
        echo "SSH config updated successfully!"
    else
        echo "Error: Host '$host' already exists in config!"
        exit 1
    fi
}

# Get hostname configuration
read -r -p "Do you want to add custom host name? (Y/N): " choiceHost

case "$choiceHost" in
    [Yy]|[Yy][Ee][Ss])
        while true; do
            read -r -p "Enter your host name (e.g., work.github.com): " hostName
            if [ -n "$hostName" ]; then
                # Check for spaces by comparing with version that has spaces removed
                hostName_no_spaces=$(echo "$hostName" | tr -d ' ')
                if [ "$hostName" = "$hostName_no_spaces" ]; then
                    break
                else
                    echo "Error: Host name cannot be empty or contain spaces"
                fi
            else
                echo "Error: Host name cannot be empty or contain spaces"
            fi
        done
        ;;
    *)
        hostName=$(getDefaultHostName)
        ;;
esac

writeConfig "$hostName" "$keyName"

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
        echo "✓ SSH public key copied to clipboard!"
    else
        echo "⚠ Warning: Could not copy to clipboard automatically."
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
        *) echo "Error: Invalid option for opening settings page"; return 1 ;;
    esac
    
    echo "Opening SSH settings page in your browser..."
    
    case "$os" in
        "macos")
            if command -v open &> /dev/null; then
                open "$settings_url" && echo "✓ Browser opened successfully!"
                return 0
            fi
            ;;
        "linux"|"wsl")
            if command -v xdg-open &> /dev/null; then
                xdg-open "$settings_url" &> /dev/null && echo "✓ Browser opened successfully!"
                return 0
            elif command -v sensible-browser &> /dev/null; then
                sensible-browser "$settings_url" &> /dev/null && echo "✓ Browser opened successfully!"
                return 0
            fi
            ;;
        "windows")
            if command -v start &> /dev/null; then
                start "$settings_url" && echo "✓ Browser opened successfully!"
                return 0
            elif command -v cmd.exe &> /dev/null; then
                cmd.exe /c start "$settings_url" && echo "✓ Browser opened successfully!"
                return 0
            fi
            ;;
    esac
    
    echo "⚠ Could not automatically open browser."
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
            if ssh -T "git@$hostName"; then
                echo "✓ SSH connection successful!"
            else
                case $? in
                    1) echo "✓ SSH key is working! (Exit code 1 is normal for Git SSH test)" ;;
                    255) echo "✗ SSH connection failed. Please check your SSH key setup." ;;
                    *) echo "⚠ SSH test completed with exit code $?" ;;
                esac
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
echo "✓ SSH key generated: $keyName"
echo "✓ SSH key added to agent"
echo "✓ SSH config updated"
echo "✓ Public key copied to clipboard (if supported)"
echo ""
echo "Next steps:"
echo "1. Add the public key to your Git provider"
echo "2. Test the connection using the 'T' option above"
echo ""
