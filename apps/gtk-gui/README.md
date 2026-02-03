# ClosedClaw GTK Messenger

A secure, minimal GTK4/Libadwaita messaging application that communicates
**exclusively** with ClosedClaw via Unix socket IPC.

## Features

- 🔒 **Secure by Design**: Communicates ONLY via local Unix socket
- 🎨 **Modern UI**: GTK4 + Libadwaita for native GNOME look
- 💬 **Chat Interface**: Familiar messaging-style layout
- ✨ **Markdown Support**: Basic formatting (bold, italic, code)
- 🔄 **Auto-reconnect**: Handles connection drops gracefully
- 🖼️ **Attachment Support**: Send/receive files (coming soon)

## No Other Communication Methods

This application is designed to be the **sole interface** for ClosedClaw:

- ❌ No HTTP/HTTPS connections
- ❌ No WebSocket connections  
- ❌ No TCP/IP network sockets
- ❌ No D-Bus or other IPC
- ✅ **Only** Unix socket at `/tmp/closedclaw-gtk.sock`

## Requirements

- Python 3.10+
- GTK 4.x
- Libadwaita 1.x
- PyGObject (python-gobject)

### Install on Arch Linux

```bash
sudo pacman -S gtk4 libadwaita python-gobject
```

### Install on Fedora

```bash
sudo dnf install gtk4 libadwaita python3-gobject
```

### Install on Debian/Ubuntu

```bash
sudo apt install gir1.2-gtk-4.0 gir1.2-adw-1 python3-gi python3-gi-cairo
```

## Usage

### Quick Start

```bash
# 1. Start ClosedClaw gateway (in another terminal)
cd /path/to/ClosedClaw
node openclaw.mjs gateway

# 2. Run the messenger
./apps/gtk-gui/run.sh
```

### Command Line Options

```bash
# Use custom socket path
./run.sh --socket /path/to/custom.sock

# Show version
./run.sh --version

# Show help
./run.sh --help
```

### Install System-wide

```bash
# Install the launcher
sudo install -m 755 apps/gtk-gui/closedclaw_messenger.py /usr/local/bin/closedclaw-messenger

# Install desktop entry
sudo install -m 644 apps/gtk-gui/ai.closedclaw.messenger.desktop /usr/share/applications/
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GTK Messenger App                        │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │    UI Layer     │    │        Message Bubbles          │ │
│  │  (Adw.Window)   │◀──▶│    (User, Assistant, System)    │ │
│  └────────┬────────┘    └─────────────────────────────────┘ │
│           │                                                 │
│  ┌────────▼────────┐                                       │
│  │   IPC Client    │                                       │
│  │ (Unix Socket)   │                                       │
│  └────────┬────────┘                                       │
└───────────┼─────────────────────────────────────────────────┘
            │
            │ Unix Socket (/tmp/closedclaw-gtk.sock)
            │ JSON Lines Protocol
            │
┌───────────▼─────────────────────────────────────────────────┐
│                    ClosedClaw Gateway                       │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │  GTK GUI Plugin │    │        Agent Runtime            │ │
│  │ (extensions/    │◀──▶│      (AI Processing)            │ │
│  │   gtk-gui/)     │    │                                 │ │
│  └─────────────────┘    └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## IPC Protocol

Messages are JSON objects, one per line (JSON Lines format):

### User → ClosedClaw

```json
{
  "id": "uuid-string",
  "type": "message",
  "from": "desktop-user",
  "to": "assistant",
  "text": "Hello, how are you?",
  "timestamp": 1234567890000,
  "attachments": []
}
```

### ClosedClaw → User

```json
{
  "id": "uuid-string",
  "type": "response",
  "from": "assistant",
  "to": "desktop-user",
  "text": "I'm doing well! How can I help you today?",
  "timestamp": 1234567890123,
  "attachments": []
}
```

### Status Messages

```json
{
  "id": "uuid-string",
  "type": "status",
  "text": "Processing...",
  "timestamp": 1234567890000
}
```

## Security

This application enforces strict security:

1. **No Network Access**: The app makes zero network connections
2. **Local Socket Only**: Communication via Unix socket (filesystem permissions)
3. **No External Dependencies**: No CDN resources, no analytics, no telemetry
4. **Sandboxable**: Can run in Flatpak/Firejail with minimal permissions

### Recommended Firejail Profile

```ini
# /etc/firejail/closedclaw-messenger.profile
include /etc/firejail/default.profile

# Only allow the Unix socket
whitelist /tmp/closedclaw-gtk.sock
whitelist ${HOME}/.ClosedClaw

# No network at all
net none

# No access to sensitive directories
blacklist /boot
blacklist /media
blacklist /mnt
blacklist /run/media
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift+Enter` | New line |
| `Ctrl+Q` | Quit |

## Troubleshooting

### "Socket not found"

The ClosedClaw gateway isn't running or the socket path is wrong.

```bash
# Check if gateway is running
pgrep -f "closedclaw.*gateway"

# Check socket exists
ls -la /tmp/closedclaw-gtk.sock

# Start gateway
node /path/to/ClosedClaw/openclaw.mjs gateway
```

### "Connection refused"

The gateway is running but not accepting connections on the GTK socket.

```bash
# Check GTK plugin is enabled
cat ~/.ClosedClaw/config.json5 | grep gtk-gui

# Ensure plugin config
# plugins.entries.gtk-gui.enabled: true
```

### GTK/Adwaita errors

Missing dependencies or wrong versions.

```bash
# Check installed versions
python3 -c "import gi; print(gi.version_info)"
pkg-config --modversion gtk4
pkg-config --modversion libadwaita-1
```

## Contributing

Contributions are welcome! Please ensure any changes:

1. Do NOT add any network connectivity
2. Maintain the Unix socket-only communication
3. Follow GTK4/Libadwaita best practices
4. Add tests for new features

## License

MIT License - See LICENSE file in the ClosedClaw repository.
