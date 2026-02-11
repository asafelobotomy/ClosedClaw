#!/usr/bin/env python3
"""
ClosedClaw GTK GUI Messenger

A secure, minimal GTK4/Libadwaita messaging application that communicates
exclusively with ClosedClaw via Unix socket IPC.

No other communication channels are supported - this is the ONLY interface.
"""

import gi
gi.require_version('Gtk', '4.0')
gi.require_version('Adw', '1')
gi.require_version('GLib', '2.0')
gi.require_version('Gio', '2.0')
gi.require_version('Pango', '1.0')

from gi.repository import Gtk, Adw, GLib, Gio, Pango, Gdk
import json
import socket
import threading
import uuid
import time
import os
import sys
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, Callable
from enum import Enum
import html


# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

DEFAULT_SOCKET_PATH = "/tmp/closedclaw-gtk.sock"
APP_ID = "ai.closedclaw.messenger"
APP_NAME = "ClosedClaw Messenger"


# ═══════════════════════════════════════════════════════════════════════════════
# DATA MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class MessageType(Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    ERROR = "error"


@dataclass
class Message:
    id: str
    text: str
    msg_type: MessageType
    timestamp: float = field(default_factory=time.time)
    attachments: list = field(default_factory=list)
    
    def to_ipc_dict(self) -> dict:
        return {
            "id": self.id,
            "type": "message",
            "from": "desktop-user" if self.msg_type == MessageType.USER else "assistant",
            "to": "assistant" if self.msg_type == MessageType.USER else "desktop-user",
            "text": self.text,
            "timestamp": int(self.timestamp * 1000),
            "attachments": self.attachments
        }


# ═══════════════════════════════════════════════════════════════════════════════
# IPC CLIENT
# ═══════════════════════════════════════════════════════════════════════════════

class ClosedClawIPC:
    """Unix socket IPC client for communicating with ClosedClaw"""
    
    def __init__(self, socket_path: str = DEFAULT_SOCKET_PATH):
        self.socket_path = socket_path
        self.socket: Optional[socket.socket] = None
        self.connected = False
        self.receive_thread: Optional[threading.Thread] = None
        self.running = False
        self.message_callback: Optional[Callable[[dict], None]] = None
        self.status_callback: Optional[Callable[[bool, str], None]] = None
        self.buffer = ""
        
    def connect(self) -> bool:
        """Attempt to connect to ClosedClaw socket"""
        try:
            self.socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            self.socket.connect(self.socket_path)
            self.connected = True
            self.running = True
            
            # Start receive thread
            self.receive_thread = threading.Thread(target=self._receive_loop, daemon=True)
            self.receive_thread.start()
            
            if self.status_callback:
                GLib.idle_add(self.status_callback, True, "Connected to ClosedClaw")
            
            return True
        except FileNotFoundError:
            if self.status_callback:
                GLib.idle_add(self.status_callback, False, 
                    f"Socket not found: {self.socket_path}\nIs ClosedClaw gateway running?")
            return False
        except ConnectionRefusedError:
            if self.status_callback:
                GLib.idle_add(self.status_callback, False,
                    "Connection refused. ClosedClaw may not be accepting connections.")
            return False
        except Exception as e:
            if self.status_callback:
                GLib.idle_add(self.status_callback, False, f"Connection error: {e}")
            return False
    
    def disconnect(self):
        """Disconnect from ClosedClaw"""
        self.running = False
        self.connected = False
        if self.socket:
            try:
                self.socket.close()
            except:
                pass
            self.socket = None
        
        if self.status_callback:
            GLib.idle_add(self.status_callback, False, "Disconnected")
    
    def send(self, message: Message) -> bool:
        """Send a message to ClosedClaw"""
        if not self.connected or not self.socket:
            return False
        
        try:
            data = json.dumps(message.to_ipc_dict()) + "\n"
            self.socket.sendall(data.encode('utf-8'))
            return True
        except Exception as e:
            print(f"Send error: {e}", file=sys.stderr)
            self.disconnect()
            return False
    
    def _receive_loop(self):
        """Background thread to receive messages"""
        while self.running and self.socket:
            try:
                data = self.socket.recv(4096)
                if not data:
                    # Connection closed
                    self.disconnect()
                    break
                
                self.buffer += data.decode('utf-8')
                
                # Process complete JSON lines
                while '\n' in self.buffer:
                    line, self.buffer = self.buffer.split('\n', 1)
                    if line.strip():
                        try:
                            msg = json.loads(line)
                            if self.message_callback:
                                GLib.idle_add(self.message_callback, msg)
                        except json.JSONDecodeError as e:
                            print(f"JSON decode error: {e}", file=sys.stderr)
                            
            except Exception as e:
                if self.running:
                    print(f"Receive error: {e}", file=sys.stderr)
                    self.disconnect()
                break


# ═══════════════════════════════════════════════════════════════════════════════
# MESSAGE BUBBLE WIDGET
# ═══════════════════════════════════════════════════════════════════════════════

class MessageBubble(Gtk.Box):
    """A chat message bubble widget"""
    
    def __init__(self, message: Message):
        super().__init__(orientation=Gtk.Orientation.VERTICAL, spacing=4)
        self.message = message
        
        # Determine alignment
        is_user = message.msg_type == MessageType.USER
        
        if is_user:
            self.set_halign(Gtk.Align.END)
        elif message.msg_type in (MessageType.ERROR, MessageType.SYSTEM):
            self.set_halign(Gtk.Align.CENTER)
        else:
            self.set_halign(Gtk.Align.START)
        
        # Determine CSS class for message type
        type_class_map = {
            MessageType.USER: "message-user",
            MessageType.ASSISTANT: "message-assistant",
            MessageType.SYSTEM: "message-system",
            MessageType.ERROR: "message-error",
        }
        type_class = type_class_map.get(message.msg_type, "message-assistant")
        
        # Create bubble container
        bubble = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4)
        bubble.add_css_class("message-bubble")
        bubble.add_css_class(type_class)
        bubble.set_margin_start(8 if is_user else 48)
        bubble.set_margin_end(48 if is_user else 8)
        bubble.set_margin_top(4)
        bubble.set_margin_bottom(4)
        
        # Message text
        text_label = Gtk.Label()
        text_label.set_markup(self._format_text(message.text))
        text_label.set_wrap(True)
        text_label.set_wrap_mode(Pango.WrapMode.WORD_CHAR)
        text_label.set_max_width_chars(60)
        text_label.set_xalign(0 if not is_user else 1)
        text_label.set_selectable(True)
        text_label.add_css_class("message-text")
        bubble.append(text_label)
        
        # Timestamp
        time_str = time.strftime("%H:%M", time.localtime(message.timestamp))
        time_label = Gtk.Label(label=time_str)
        time_label.set_xalign(1 if is_user else 0)
        time_label.add_css_class("message-time")
        bubble.append(time_label)
        
        self.append(bubble)
    
    def _format_text(self, text: str) -> str:
        """Format message text with basic markup support"""
        # Escape HTML
        text = html.escape(text)
        
        # Convert markdown-style formatting
        # Bold: **text** or __text__
        import re
        text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
        text = re.sub(r'__(.+?)__', r'<b>\1</b>', text)
        
        # Italic: *text* or _text_
        text = re.sub(r'\*(.+?)\*', r'<i>\1</i>', text)
        text = re.sub(r'(?<![_])_(.+?)_(?![_])', r'<i>\1</i>', text)
        
        # Code: `text`
        text = re.sub(r'`(.+?)`', r'<tt>\1</tt>', text)
        
        return text


# ═══════════════════════════════════════════════════════════════════════════════
# TYPING INDICATOR
# ═══════════════════════════════════════════════════════════════════════════════

class TypingIndicator(Gtk.Box):
    """Animated typing indicator"""
    
    def __init__(self):
        super().__init__(orientation=Gtk.Orientation.HORIZONTAL, spacing=4)
        self.set_halign(Gtk.Align.START)
        self.set_margin_start(56)
        self.set_margin_top(8)
        self.set_margin_bottom(8)
        self.set_visible(False)
        
        # Create dots
        self.dots = []
        for i in range(3):
            dot = Gtk.Label(label="●")
            dot.add_css_class("typing-dot")
            self.dots.append(dot)
            self.append(dot)
        
        # Typing dot styles are applied via the global CSS provider
        
        self.animation_step = 0
        self.timeout_id = None
    
    def start(self):
        self.set_visible(True)
        if self.timeout_id is None:
            self.timeout_id = GLib.timeout_add(300, self._animate)
    
    def stop(self):
        self.set_visible(False)
        if self.timeout_id:
            GLib.source_remove(self.timeout_id)
            self.timeout_id = None
    
    def _animate(self) -> bool:
        if not self.get_visible():
            return False
        
        for i, dot in enumerate(self.dots):
            if i == self.animation_step:
                dot.set_opacity(1.0)
            else:
                dot.set_opacity(0.3)
        
        self.animation_step = (self.animation_step + 1) % 3
        return True


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN WINDOW
# ═══════════════════════════════════════════════════════════════════════════════

class MessengerWindow(Adw.ApplicationWindow):
    """Main messenger window"""
    
    def __init__(self, app: Adw.Application, socket_path: str):
        super().__init__(application=app)
        
        self.socket_path = socket_path
        self.ipc = ClosedClawIPC(socket_path)
        self.ipc.message_callback = self._on_message_received
        self.ipc.status_callback = self._on_status_changed
        self.messages: list[Message] = []
        self._retry_timer_id: Optional[int] = None
        
        self._setup_window()
        self._setup_ui()
        self._apply_css()
        
        # Try to connect on startup
        GLib.timeout_add(500, self._initial_connect)
    
    def _setup_window(self):
        """Configure window properties"""
        self.set_title(APP_NAME)
        self.set_default_size(600, 800)
        self.set_size_request(400, 500)
        
        # Handle close
        self.connect("close-request", self._on_close)
    
    def _setup_ui(self):
        """Build the UI"""
        # Main layout
        main_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        
        # Header bar
        header = Adw.HeaderBar()
        header.set_title_widget(self._create_title_widget())
        
        # Connection status button
        self.status_button = Gtk.Button()
        self.status_icon = Gtk.Image.new_from_icon_name("network-offline-symbolic")
        self.status_button.set_child(self.status_icon)
        self.status_button.set_tooltip_text("Disconnected")
        self.status_button.connect("clicked", self._on_reconnect_clicked)
        header.pack_start(self.status_button)
        
        # Menu button
        menu_button = Gtk.MenuButton()
        menu_button.set_icon_name("open-menu-symbolic")
        menu_button.set_menu_model(self._create_menu())
        header.pack_end(menu_button)
        
        main_box.append(header)
        
        # Message area
        scroll = Gtk.ScrolledWindow()
        scroll.set_vexpand(True)
        scroll.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        
        self.message_list = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        self.message_list.set_valign(Gtk.Align.END)
        scroll.set_child(self.message_list)
        
        # Keep reference to scroll for auto-scroll
        self.scroll = scroll
        
        main_box.append(scroll)
        
        # Typing indicator
        self.typing_indicator = TypingIndicator()
        main_box.append(self.typing_indicator)
        
        # Input area
        input_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        input_box.set_margin_start(8)
        input_box.set_margin_end(8)
        input_box.set_margin_top(8)
        input_box.set_margin_bottom(8)
        
        # Text entry
        self.entry = Gtk.TextView()
        self.entry.set_wrap_mode(Gtk.WrapMode.WORD_CHAR)
        self.entry.set_accepts_tab(False)
        self.entry.set_hexpand(True)
        self.entry.set_size_request(-1, 40)
        
        entry_scroll = Gtk.ScrolledWindow()
        entry_scroll.set_child(self.entry)
        entry_scroll.set_max_content_height(150)
        entry_scroll.set_propagate_natural_height(True)
        entry_scroll.set_hexpand(True)
        entry_scroll.add_css_class("entry-scroll")
        
        # Handle Enter key
        key_controller = Gtk.EventControllerKey()
        key_controller.connect("key-pressed", self._on_key_pressed)
        self.entry.add_controller(key_controller)
        
        input_box.append(entry_scroll)
        
        # Send button
        self.send_button = Gtk.Button()
        self.send_button.set_icon_name("mail-send-symbolic")
        self.send_button.add_css_class("suggested-action")
        self.send_button.add_css_class("circular")
        self.send_button.set_valign(Gtk.Align.END)
        self.send_button.connect("clicked", self._on_send_clicked)
        input_box.append(self.send_button)
        
        main_box.append(input_box)
        
        self.set_content(main_box)
        
        # Add welcome message
        self._add_system_message("Welcome to ClosedClaw Messenger\nType a message to begin.")
    
    def _create_title_widget(self) -> Gtk.Widget:
        """Create the header title widget"""
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        
        title = Gtk.Label(label="ClosedClaw")
        title.add_css_class("title")
        box.append(title)
        
        self.subtitle = Gtk.Label(label="Connecting...")
        self.subtitle.add_css_class("subtitle")
        box.append(self.subtitle)
        
        return box
    
    def _create_menu(self) -> Gio.Menu:
        """Create the app menu"""
        menu = Gio.Menu()
        menu.append("Clear History", "app.clear")
        menu.append("Reconnect", "app.reconnect")
        menu.append("About", "app.about")
        menu.append("Quit", "app.quit")
        return menu
    
    def _apply_css(self):
        """Apply global CSS styles (all message types + UI elements)"""
        css_provider = Gtk.CssProvider()
        css_provider.load_from_data("""
            /* Message bubble base */
            .message-bubble {
                border-radius: 12px;
                padding: 8px 12px;
            }
            
            /* User messages */
            .message-user {
                background-color: #3584e4;
            }
            .message-user .message-text {
                color: #ffffff;
            }
            .message-user .message-time {
                color: rgba(255, 255, 255, 0.7);
                font-size: 0.8em;
            }
            
            /* Assistant messages */
            .message-assistant {
                background-color: #f6f5f4;
            }
            .message-assistant .message-text {
                color: #1e1e1e;
            }
            .message-assistant .message-time {
                color: rgba(30, 30, 30, 0.7);
                font-size: 0.8em;
            }
            
            /* System messages */
            .message-system {
                background-color: #fdf6e3;
            }
            .message-system .message-text {
                color: #657b83;
            }
            .message-system .message-time {
                color: rgba(101, 123, 131, 0.7);
                font-size: 0.8em;
            }
            
            /* Error messages */
            .message-error {
                background-color: #e01b24;
            }
            .message-error .message-text {
                color: #ffffff;
            }
            .message-error .message-time {
                color: rgba(255, 255, 255, 0.7);
                font-size: 0.8em;
            }
            
            /* Typing indicator */
            .typing-dot {
                color: #888;
                font-size: 8px;
            }
            
            /* Input area */
            .entry-scroll {
                border-radius: 20px;
                border: 1px solid #ccc;
                background: #fff;
            }
            
            textview {
                padding: 8px 12px;
                background: transparent;
            }
            
            textview text {
                background: transparent;
            }
        """.encode('utf-8'))
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            css_provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )
    
    def _initial_connect(self) -> bool:
        """Initial connection attempt — starts auto-retry loop if not connected"""
        if not self.ipc.connect():
            self._add_system_message("Waiting for gateway to start...")
            self._start_auto_retry()
        return False  # Don't repeat this GLib timeout
    
    def _start_auto_retry(self):
        """Schedule periodic reconnection attempts until connected"""
        if self._retry_timer_id is not None:
            return  # Already retrying
        self._retry_timer_id = GLib.timeout_add(2000, self._auto_retry_tick)
    
    def _stop_auto_retry(self):
        """Cancel the auto-retry timer"""
        if self._retry_timer_id is not None:
            GLib.source_remove(self._retry_timer_id)
            self._retry_timer_id = None
    
    def _auto_retry_tick(self) -> bool:
        """Attempt to reconnect; keep retrying until connected"""
        if self.ipc.connected:
            self._retry_timer_id = None
            return False  # Stop retrying
        if self.ipc.connect():
            self._retry_timer_id = None
            return False  # Connected, stop retrying
        return True  # Keep retrying
    
    def _on_close(self, window) -> bool:
        """Handle window close"""
        self._stop_auto_retry()
        self.ipc.disconnect()
        return False
    
    def _on_reconnect_clicked(self, button):
        """Handle reconnect button click"""
        self._add_system_message("Reconnecting...")
        self.ipc.disconnect()
        GLib.timeout_add(500, lambda: self.ipc.connect() or False)
    
    def _on_status_changed(self, connected: bool, message: str):
        """Handle connection status change"""
        if connected:
            self._stop_auto_retry()
            self.status_icon.set_from_icon_name("network-transmit-receive-symbolic")
            self.status_button.set_tooltip_text("Connected")
            self.subtitle.set_text("Connected")
            self.send_button.set_sensitive(True)
        else:
            self.status_icon.set_from_icon_name("network-offline-symbolic")
            self.status_button.set_tooltip_text(message)
            self.subtitle.set_text("Disconnected")
            self.send_button.set_sensitive(False)
            # Auto-retry on unexpected disconnect
            self._start_auto_retry()
            
            if "not found" in message.lower() or "refused" in message.lower():
                self._add_error_message(message)
    
    def _on_message_received(self, msg: dict):
        """Handle message received from ClosedClaw"""
        self.typing_indicator.stop()
        
        msg_type = MessageType.ASSISTANT
        if msg.get("type") == "status":
            msg_type = MessageType.SYSTEM
        elif msg.get("type") == "error":
            msg_type = MessageType.ERROR
        
        text = msg.get("text", "")
        if not text:
            return
        
        message = Message(
            id=msg.get("id", str(uuid.uuid4())),
            text=text,
            msg_type=msg_type,
            timestamp=msg.get("timestamp", time.time() * 1000) / 1000
        )
        
        self._add_message_bubble(message)
    
    def _on_key_pressed(self, controller, keyval, keycode, state):
        """Handle key press in text entry"""
        # Enter sends, Shift+Enter adds newline
        if keyval == Gdk.KEY_Return or keyval == Gdk.KEY_KP_Enter:
            if not (state & Gdk.ModifierType.SHIFT_MASK):
                self._send_message()
                return True
        return False
    
    def _on_send_clicked(self, button):
        """Handle send button click"""
        self._send_message()
    
    def _send_message(self):
        """Send the current message"""
        buffer = self.entry.get_buffer()
        text = buffer.get_text(
            buffer.get_start_iter(),
            buffer.get_end_iter(),
            False
        ).strip()
        
        if not text:
            return
        
        # Create message
        message = Message(
            id=str(uuid.uuid4()),
            text=text,
            msg_type=MessageType.USER
        )
        
        # Add to UI
        self._add_message_bubble(message)
        
        # Clear input
        buffer.set_text("")
        
        # Send via IPC
        if not self.ipc.send(message):
            self._add_error_message("Failed to send message. Check connection.")
        else:
            # Show typing indicator
            self.typing_indicator.start()
    
    def _add_message_bubble(self, message: Message):
        """Add a message bubble to the chat"""
        self.messages.append(message)
        bubble = MessageBubble(message)
        self.message_list.append(bubble)
        
        # Scroll to bottom
        GLib.idle_add(self._scroll_to_bottom)
    
    def _add_system_message(self, text: str):
        """Add a system message"""
        message = Message(
            id=str(uuid.uuid4()),
            text=text,
            msg_type=MessageType.SYSTEM
        )
        self._add_message_bubble(message)
    
    def _add_error_message(self, text: str):
        """Add an error message"""
        message = Message(
            id=str(uuid.uuid4()),
            text=text,
            msg_type=MessageType.ERROR
        )
        self._add_message_bubble(message)
    
    def _scroll_to_bottom(self):
        """Scroll the message list to bottom"""
        adj = self.scroll.get_vadjustment()
        adj.set_value(adj.get_upper())
        return False
    
    def clear_history(self):
        """Clear all messages"""
        self.messages.clear()
        while child := self.message_list.get_first_child():
            self.message_list.remove(child)
        self._add_system_message("History cleared")


# ═══════════════════════════════════════════════════════════════════════════════
# APPLICATION
# ═══════════════════════════════════════════════════════════════════════════════

class MessengerApp(Adw.Application):
    """Main application class"""
    
    def __init__(self, socket_path: str = DEFAULT_SOCKET_PATH):
        super().__init__(
            application_id=APP_ID,
            flags=Gio.ApplicationFlags.FLAGS_NONE
        )
        self.socket_path = socket_path
        self.window: Optional[MessengerWindow] = None
        
        # Setup actions
        self._setup_actions()
    
    def _setup_actions(self):
        """Setup application actions"""
        actions = [
            ("quit", self._on_quit),
            ("clear", self._on_clear),
            ("reconnect", self._on_reconnect),
            ("about", self._on_about),
        ]
        
        for name, callback in actions:
            action = Gio.SimpleAction.new(name, None)
            action.connect("activate", callback)
            self.add_action(action)
    
    def do_activate(self):
        """Handle application activation"""
        # Use AdwStyleManager for color scheme (suppresses deprecated GtkSettings warning)
        style_manager = Adw.StyleManager.get_default()
        style_manager.set_color_scheme(Adw.ColorScheme.PREFER_DARK)
        
        if not self.window:
            self.window = MessengerWindow(self, self.socket_path)
        self.window.present()
    
    def _on_quit(self, action, param):
        """Handle quit action"""
        self.quit()
    
    def _on_clear(self, action, param):
        """Handle clear action"""
        if self.window:
            self.window.clear_history()
    
    def _on_reconnect(self, action, param):
        """Handle reconnect action"""
        if self.window:
            self.window._on_reconnect_clicked(None)
    
    def _on_about(self, action, param):
        """Show about dialog"""
        about = Adw.AboutWindow(
            transient_for=self.window,
            application_name=APP_NAME,
            application_icon="utilities-terminal-symbolic",
            developer_name="ClosedClaw",
            version="1.0.0",
            website="https://github.com/closedclaw/closedclaw",
            issue_url="https://github.com/closedclaw/closedclaw/issues",
            license_type=Gtk.License.MIT_X11,
            comments="Secure messaging interface for ClosedClaw AI assistant.\n\n"
                     "This application communicates ONLY via Unix socket IPC.\n"
                     "No other network connections are made.",
            developers=["ClosedClaw Team"],
        )
        about.present()


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description="ClosedClaw GTK Messenger - Secure AI chat interface"
    )
    parser.add_argument(
        "--socket", "-s",
        default=DEFAULT_SOCKET_PATH,
        help=f"Unix socket path (default: {DEFAULT_SOCKET_PATH})"
    )
    parser.add_argument(
        "--version", "-v",
        action="version",
        version="%(prog)s 1.0.0"
    )
    
    args = parser.parse_args()
    
    # Check socket exists (warn only)
    if not os.path.exists(args.socket):
        print(f"Warning: Socket {args.socket} does not exist.", file=sys.stderr)
        print("Start ClosedClaw gateway first: closedclaw gateway", file=sys.stderr)
    
    app = MessengerApp(socket_path=args.socket)
    return app.run(sys.argv[:1])  # Don't pass our args to GTK


if __name__ == "__main__":
    sys.exit(main())
