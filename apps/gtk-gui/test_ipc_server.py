#!/usr/bin/env python3
"""
Test IPC Server
Simulates the ClosedClaw gateway for testing the GTK Messenger
"""

import socket
import json
import os
import time
import uuid
import sys
import signal

SOCKET_PATH = "/tmp/closedclaw-gtk.sock"

def create_response(user_text: str) -> dict:
    """Create a mock AI response"""
    return {
        "id": str(uuid.uuid4()),
        "type": "response",
        "from": "assistant",
        "to": "desktop-user",
        "text": f"You said: {user_text}\n\nThis is a test response from the mock server.",
        "timestamp": int(time.time() * 1000),
        "attachments": []
    }

def handle_client(conn: socket.socket, addr):
    """Handle a single client connection"""
    print(f"Client connected")
    
    buffer = ""
    try:
        while True:
            data = conn.recv(4096)
            if not data:
                break
            
            buffer += data.decode('utf-8')
            
            while '\n' in buffer:
                line, buffer = buffer.split('\n', 1)
                if line.strip():
                    try:
                        msg = json.loads(line)
                        print(f"Received: {msg.get('text', '')[:50]}...")
                        
                        # Send response after a brief delay
                        time.sleep(0.5)
                        response = create_response(msg.get('text', ''))
                        conn.sendall((json.dumps(response) + '\n').encode('utf-8'))
                        print(f"Sent response")
                        
                    except json.JSONDecodeError as e:
                        print(f"JSON error: {e}")
                        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()
        print("Client disconnected")

def main():
    # Remove old socket if exists
    if os.path.exists(SOCKET_PATH):
        os.unlink(SOCKET_PATH)
    
    # Create socket
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(SOCKET_PATH)
    server.listen(1)
    
    # Make socket accessible
    os.chmod(SOCKET_PATH, 0o666)
    
    print(f"Test IPC server listening on {SOCKET_PATH}")
    print("Start the GTK Messenger to test...")
    print("Press Ctrl+C to stop")
    
    def cleanup(signum, frame):
        print("\nShutting down...")
        server.close()
        os.unlink(SOCKET_PATH)
        sys.exit(0)
    
    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)
    
    try:
        while True:
            conn, addr = server.accept()
            handle_client(conn, addr)
    except Exception as e:
        print(f"Server error: {e}")
    finally:
        server.close()
        if os.path.exists(SOCKET_PATH):
            os.unlink(SOCKET_PATH)

if __name__ == "__main__":
    main()
