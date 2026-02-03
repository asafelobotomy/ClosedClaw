#!/usr/bin/env bash
# ClosedClaw Messenger Launcher
# Ensures dependencies are available and launches the GTK app

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_SCRIPT="$SCRIPT_DIR/closedclaw_messenger.py"

# Check Python dependencies
check_dependencies() {
    python3 -c "import gi; gi.require_version('Gtk', '4.0'); gi.require_version('Adw', '1')" 2>/dev/null
    return $?
}

# Install dependencies on Arch Linux
install_arch() {
    echo "Installing GTK4 and libadwaita dependencies..."
    sudo pacman -S --needed --noconfirm gtk4 libadwaita python-gobject
}

# Install dependencies on Fedora
install_fedora() {
    echo "Installing GTK4 and libadwaita dependencies..."
    sudo dnf install -y gtk4 libadwaita python3-gobject
}

# Install dependencies on Debian/Ubuntu
install_debian() {
    echo "Installing GTK4 and libadwaita dependencies..."
    sudo apt-get update
    sudo apt-get install -y gir1.2-gtk-4.0 gir1.2-adw-1 python3-gi python3-gi-cairo
}

# Detect distro and install
install_dependencies() {
    if command -v pacman &>/dev/null; then
        install_arch
    elif command -v dnf &>/dev/null; then
        install_fedora
    elif command -v apt-get &>/dev/null; then
        install_debian
    else
        echo "Error: Unknown distribution. Please install GTK4 and libadwaita manually." >&2
        echo "Required packages: gtk4, libadwaita, python-gobject (PyGObject)" >&2
        exit 1
    fi
}

# Main
main() {
    # Check if dependencies are available
    if ! check_dependencies; then
        echo "GTK4/Libadwaita dependencies not found."
        read -p "Install now? [Y/n] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            echo "Cannot run without dependencies. Exiting."
            exit 1
        fi
        install_dependencies
    fi
    
    # Launch the app
    exec python3 "$APP_SCRIPT" "$@"
}

main "$@"
