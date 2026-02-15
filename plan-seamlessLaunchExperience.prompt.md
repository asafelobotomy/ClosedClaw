# Plan: Seamless Launch Experience for Linux Desktop

ClosedClaw currently requires manual coordination between gateway startup and GTK GUI launch. This plan delivers a one-click launch experience through phased improvements: first enhancing CLI commands for immediate usability, then packaging as a self-contained AppImage for desktop integration.

**Key Decisions**:
- Start with CLI enhancements (works with existing install, benefits everyone immediately)
- Build toward AppImage distribution (native desktop app feel, no Node install requirement)
- Leverage existing GTK launcher pattern from [apps/gtk-gui/launch.sh](apps/gtk-gui/launch.sh)
- Use systemd user services for daemon management (already implemented)
- Desktop entry follows freedesktop.org spec (already has template)

**Steps**

## Phase 1: CLI Launch Commands (Immediate Usability)

1. **Create unified launch command** in [src/commands/launch.ts](src/commands/launch.ts)
   - Check if gateway running (port check on 18789)
   - Start gateway in background if needed (`spawn` with detached mode)
   - Poll for readiness (HTTP health check on `http://127.0.0.1:18789/health`)
   - Retrieve or generate token (read from config or create new)
   - Launch GTK GUI with gateway connection details
   - Write PID file to `~/.closedclaw/gateway.pid` for lifecycle management
   - Register in [src/cli/cli.ts](src/cli/cli.ts) as `closedclaw launch`

2. **Enhance GTK GUI integration** in [apps/gtk-gui/](apps/gtk-gui/)
   - Update IPC bridge to receive gateway connection details from launcher
   - Auto-connect to gateway using provided token
   - Show connection status in GUI
   - Handle reconnection logic if gateway restarts

3. **Add token management commands** in [src/commands/token.ts](src/commands/token.ts)
   - `closedclaw token generate` - Create new token, save to config
   - `closedclaw token get` - Display current token from config/env
   - `closedclaw token set <token>` - Update config with provided token
   - Use crypto pattern: `crypto.randomBytes(32).toString('hex')`

4. **Add gateway readiness helper** in [src/gateway/readiness.ts](src/gateway/readiness.ts)
   - Export `waitForGatewayReady(port, timeout)` function
   - HTTP GET to `/health` endpoint with retry
   - Used by launch command and enhanced dashboard command

5. **Add tests** in [src/commands/launch.test.ts](src/commands/launch.test.ts)
   - Mock spawn/port checking
   - Verify token generation/retrieval
   - Test readiness polling with timeout
   - Integration test with real gateway startup (e2e config)

## Phase 2: Desktop Integration (Linux-Focused)

6. **Create desktop launcher script** at [scripts/desktop/closedclaw-launcher.sh](scripts/desktop/closedclaw-launcher.sh)
   - Bash script compatible with most Linux distros
   - Check dependencies (node, closedclaw binary, python3-gi, gtk4)
   - Launch gateway with proper env vars
   - Trap EXIT/INT/TERM for cleanup
   - Save PID, launch GTK GUI, wait for user exit
   - Based on [apps/gtk-gui/launch.sh](apps/gtk-gui/launch.sh) pattern

7. **Create freedesktop desktop entry** at [scripts/desktop/ai.closedclaw.desktop](scripts/desktop/ai.closedclaw.desktop)
   - Categories: Network;InstantMessaging;Chat
   - Icon: use existing assets or generate
   - Exec: point to launcher script
   - Terminal=false (runs in background)
   - StartupNotify=true
   - Keywords: AI, assistant, chat, gateway

8. **Add desktop install command** in [src/commands/desktop-install.ts](src/commands/desktop-install.ts)
   - `closedclaw desktop install` - Copy .desktop file to `~/.local/share/applications/`
   - `closedclaw desktop uninstall` - Remove .desktop file
   - Update desktop database: `update-desktop-database ~/.local/share/applications/`
   - Validate desktop entry with `desktop-file-validate`
   - Add to onboarding wizard as optional step

9. **Add system tray support** (optional, if desired) in [src/desktop/tray.ts](src/desktop/tray.ts)
   - Use `@mariozechner/pi-tui` or similar for tray icon
   - Menu: Open Control UI, Restart Gateway, Quit
   - Show connection status indicator
   - Linux: requires X11/Wayland tray protocol support (varies by DE)

## Phase 3: AppImage Packaging (Self-Contained Distribution)

10. **Research AppImage tooling** and document in [docs/development/appimage.md](docs/development/appimage.md)
    - Evaluate: appimagetool, electron-builder, pkg-fetch, caxa
    - Handle native deps: sharp (prebuilt binaries), baileys (pure JS), node-pty (rebuild)
    - Node runtime bundling: package Node 22+ with app
    - AppImage structure: AppDir layout, AppRun script, desktop integration

11. **Create AppImage build script** at [scripts/build/build-appimage.sh](scripts/build/build-appimage.sh)
    - Install dependencies: `pnpm install --prod`
    - Build TypeScript: `pnpm build`
    - Copy runtime files to AppDir: node, dist/, apps/gtk-gui/, assets/
    - Build native deps for target platform (sharp, node-pty)
    - Bundle GTK GUI dependencies (Python runtime, PyGObject, Gtk4)
    - Create AppRun script (launch gateway + GTK GUI)
    - Bundle with appimagetool or electron-builder
    - Output: `ClosedClaw-x86_64.AppImage`

12. **Add AppRun launcher** at [scripts/appimage/AppRun](scripts/appimage/AppRun)
    - Detect AppImage mount point (`$APPDIR`)
    - Set NODE_PATH, LD_LIBRARY_PATH, PYTHONPATH for bundled runtime
    - Launch gateway with embedded Node: `$APPDIR/node $APPDIR/dist/entry.js gateway`
    - Launch GTK GUI with gateway connection details (token, port)
    - Handle cleanup on SIGTERM/SIGINT

13. **Handle native dependencies** in [scripts/build/bundle-native.sh](scripts/build/bundle-native.sh)
    - Sharp: download prebuilt binaries for Linux x64 (`@img/sharp-linux-x64`)
    - node-pty: rebuild for bundled Node version with `node-gyp rebuild`
    - Baileys: pure JS, no special handling
    - Canvas (optional): skip or bundle prebuilt `@napi-rs/canvas`
    - Copy .node files to AppDir with correct paths

14. **Add AppImage integration** in [scripts/appimage/appimage-integrate.sh](scripts/appimage/appimage-integrate.sh)
    - Desktop entry integration via AppImageLauncher or manual
    - Icon extraction and registration
    - MIME type associations (if applicable)
    - Update desktop database after first run

15. **Add auto-update support** (optional) in [src/update/appimage-update.ts](src/update/appimage-update.ts)
    - Detect AppImage environment (`$APPIMAGE`, `$APPDIR`)
    - Check for updates via GitHub releases API
    - Download new AppImage, verify signature
    - Replace current AppImage, restart
    - Use `appimageupdatetool` or custom implementation

## Phase 4: Testing & Documentation

16. **Add AppImage e2e tests** in [tools/testing/e2e/appimage-docker.sh](tools/testing/e2e/appimage-docker.sh)
    - Docker container with minimal Linux (Ubuntu/Debian)
    - Install AppImage, run it
    - Verify gateway starts, UI accessible
    - Test basic chat flow
    - Cleanup and exit

17. **Document launch workflows** in [docs/start/launch.md](docs/start/launch.md)
    - CLI launch: `closedclaw launch`
    - GTK GUI architecture and connection flow
    - Desktop integration: install .desktop entry
    - AppImage usage: download, make executable, run
    - Troubleshooting common issues (port conflicts, permissions, GTK dependencies)

18. **Update onboarding wizard** in [src/wizard/onboarding.ts](src/wizard/onboarding.ts)
    - Add step to install desktop entry
    - Optionally download AppImage (if user prefers)
    - Test launch after onboarding completes
    - Provide clear next steps

19. **Add CI build pipeline** in [.github/workflows/build-appimage.yml](.github/workflows/build-appimage.yml)
    - Build AppImage on Ubuntu runner
    - Test in Docker container
    - Upload artifact to GitHub releases
    - Trigger on tags (vYYYY.M.D)

## Verification

### Phase 1 (CLI Enhancement)
- `closedclaw launch` starts gateway + launches GTK GUI automatically
- `closedclaw token get` shows current token
- Gateway readiness polling succeeds within timeout
- GTK GUI receives gateway connection details (URL, token, port)

### Phase 2 (Desktop Integration)
- Desktop entry appears in application menu after `closedclaw desktop install`
- Clicking launcher icon starts gateway and launches GTK GUI
- GTK GUI connects to gateway automatically with generated token
- systemd service auto-starts on login (if installed)
- Shell script handles cleanup properly

### Phase 3 (AppImage)
- AppImage runs without Node pre-installed on system
- Gateway starts with bundled Node runtime
- GTK GUI launches automatically with valid token
- Native deps (sharp, node-pty) work correctly
- GTK dependencies (Gtk4, Adwaita, PyGObject) bundled or detected
- AppImage integrates with desktop environment (icon, menu entry)

### Phase 4 (End-to-End)
- Fresh Linux system: download AppImage, double-click, GTK GUI opens and connects
- Fresh Linux system: `npm install -g closedclaw && closedclaw launch` opens GTK GUI
- Developer: `pnpm launch` (alias to launch command) works in repo
- GTK GUI successfully connects to gateway and allows chatting with LLM
- All flows tested in CI before release

## Dependencies & Considerations

- **Native Deps**: Sharp requires prebuilt binaries or build toolchain; node-pty needs rebuild for bundled Node
- **GTK Dependencies**: PyGObject, Gtk4, Adwaita must be available on system or bundled in AppImage
- **Node Version**: Must bundle Node ≥22.12.0 per package.json engines requirement
- **Python Version**: Python 3.8+ required for GTK GUI (PyGObject)
- **AppImage Size**: Expect 200-300 MB (Node runtime + Python + GTK + deps); acceptable for desktop app
- **Desktop Environments**: Test on GNOME, KDE, XFCE (most common); tray support varies
- **Security**: Token auto-generation is fine for local-only (loopback bind); remote needs pairing
- **Backward Compat**: CLI enhancements must not break existing `closedclaw gateway` workflows
