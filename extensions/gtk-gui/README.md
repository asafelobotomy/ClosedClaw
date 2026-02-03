# GTK GUI Channel Plugin

Custom channel plugin for integrating ClosedClaw with a GTK desktop application on Linux.

## Features

- **Unix Socket IPC**: Fast, bidirectional communication with GTK app
- **File-based IPC**: Alternative using JSONL files (inbox/outbox)
- **Block Streaming**: Real-time response streaming to GUI
- **Media Attachments**: Support for images and files

## Configuration

Add to your `~/.closedclaw/config.json5`:

```json5
{
  plugins: {
    entries: {
      "gtk-gui": {
        enabled: true,
        config: {
          // Unix socket (recommended)
          socketPath: "/tmp/closedclaw-gtk.sock",
          
          // OR file-based IPC:
          // inboxPath: "/tmp/closedclaw-gtk/inbox.jsonl",
          // outboxPath: "/tmp/closedclaw-gtk/outbox.jsonl",
          
          userId: "desktop-user"
        }
      }
    }
  }
}
```

## Message Format

Messages are JSON objects, one per line:

```json
{
  "id": "gtk-1234567890-abc123",
  "type": "message",
  "from": "desktop-user",
  "to": "assistant",
  "text": "Hello, ClosedClaw!",
  "timestamp": 1706886000000,
  "attachments": [
    {
      "path": "/home/user/image.png",
      "mimeType": "image/png"
    }
  ]
}
```

### Message Types

- `message`: User message to assistant
- `response`: Assistant response to user
- `status`: Status updates (typing, error, etc.)

## GTK App Integration

### Python GTK Example

```python
import gi
gi.require_version('Gtk', '4.0')
from gi.repository import Gtk, GLib
import socket
import json
import threading

class ClosedClawClient:
    def __init__(self, socket_path="/tmp/closedclaw-gtk.sock"):
        self.socket_path = socket_path
        self.sock = None
        self.on_response = None
    
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(self.socket_path)
        
        # Start receiver thread
        threading.Thread(target=self._receive_loop, daemon=True).start()
    
    def send_message(self, text):
        msg = {
            "id": f"gtk-{int(time.time() * 1000)}",
            "type": "message",
            "from": "desktop-user",
            "to": "assistant",
            "text": text,
            "timestamp": int(time.time() * 1000)
        }
        self.sock.sendall((json.dumps(msg) + "\n").encode())
    
    def _receive_loop(self):
        buffer = ""
        while True:
            data = self.sock.recv(4096).decode()
            if not data:
                break
            buffer += data
            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)
                if line.strip():
                    msg = json.loads(line)
                    if self.on_response:
                        GLib.idle_add(self.on_response, msg)
```

### Rust GTK Example

See `examples/gtk-rust/` for a complete Rust GTK4 implementation.

## Security

- Socket is created with restrictive permissions (0600)
- Only local connections accepted
- No network exposure

## Troubleshooting

1. **Socket not found**: Ensure Gateway is running with GTK GUI plugin enabled
2. **Permission denied**: Check socket file permissions
3. **Connection refused**: Verify socket path matches config
