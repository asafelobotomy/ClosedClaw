---
name: gateway-debugger
description: Troubleshooting gateway issues in ClosedClaw. Use when debugging gateway startup failures, port conflicts, lock file issues, WebSocket disconnections, or RPC errors. Covers log analysis, diagnostics, and recovery procedures.
---

# Gateway Debugger

This skill helps you diagnose and fix ClosedClaw gateway issues. The gateway is the control plane coordinating channels, sessions, tools, and agent execution via WebSocket/HTTP.

## When to Use

- Gateway fails to start
- Port conflicts or "address already in use" errors
- Lock file errors preventing startup
- WebSocket connection issues
- RPC method failures
- Channel disconnections
- Config reload problems
- Performance debugging

## Prerequisites

- Understanding of gateway architecture (`src/gateway/`)
- Access to logs at `~/.closedclaw/logs/`
- Familiarity with WebSocket protocol

## Quick Diagnostics

### Run Built-in Diagnostics

```bash
# Comprehensive health check
closedclaw doctor

# Channel connectivity status
closedclaw channels status

# Detailed channel probing
closedclaw channels status --probe
```

### Check Gateway Status

```bash
# Check if gateway is running
ps aux | grep closedclaw | grep gateway

# Check port usage (default: 18789)
lsof -i :18789
netstat -tuln | grep 18789  # Alternative

# Check lock file
cat ~/.closedclaw/gateway.lock

# Check recent logs
tail -f ~/.closedclaw/logs/gateway-$(date +%Y-%m-%d).log
```

## Common Issues & Solutions

### Issue 1: Port Already in Use

**Symptoms**:

- Error: "EADDRINUSE: address already in use :::18789"
- Gateway fails to start
- Cannot bind to port

**Diagnosis**:

```bash
# Find process using the port
lsof -i :18789

# Example output:
# COMMAND   PID     USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
# node    12345   user   20u  IPv6 0x...      0t0  TCP *:18789 (LISTEN)
```

**Solutions**:

```bash
# Solution 1: Kill the process
kill -9 12345

# Solution 2: Use different port
closedclaw gateway --port 18790

# Solution 3: Clean kill all ClosedClaw processes
pkill -f closedclaw
sleep 2
closedclaw gateway --verbose
```

**Prevention**:

```json5
// ~/.closedclaw/config.json5
{
  gateway: {
    port: 18790, // Use non-default port
  },
}
```

### Issue 2: Stale Lock File

**Symptoms**:

- Error: "Gateway is already running"
- GatewayLockError thrown
- Lock file exists but no process running

**Diagnosis**:

```bash
# Check lock file
cat ~/.closedclaw/gateway.lock

# Check if PID in lock file is running
PID=$(cat ~/.closedclaw/gateway.lock 2>/dev/null)
ps -p $PID 2>/dev/null || echo "Process not running"
```

**Solutions**:

```bash
# Solution 1: Remove stale lock file
rm ~/.closedclaw/gateway.lock

# Solution 2: Force start (removes lock automatically if stale)
closedclaw gateway --force

# Solution 3: Full cleanup
rm ~/.closedclaw/gateway.lock
pkill -f closedclaw
closedclaw gateway --verbose
```

**Prevention**:

- Always use Ctrl+C for graceful shutdown
- Avoid `kill -9` unless necessary
- Use daemon management (launchd/systemd)

### Issue 3: Config Validation Errors

**Symptoms**:

- Gateway fails to start with config error
- "Unknown key" errors
- Schema validation failures

**Diagnosis**:

```bash
# Run diagnostics
closedclaw doctor

# Check config syntax
cat ~/.closedclaw/config.json5 | json5

# Validate against schema
closedclaw config validate
```

**Solutions**:

```bash
# Solution 1: Check for typos
closedclaw doctor | grep -i "unknown"

# Solution 2: Migration required
closedclaw config migrate

# Solution 3: Fresh config
mv ~/.closedclaw/config.json5 ~/.closedclaw/config.json5.backup
closedclaw onboard

# Solution 4: Test config changes
closedclaw gateway --dry-run  # If available
```

**Common Config Issues**:

- Unknown keys (strict validation)
- Missing required fields
- Invalid JSON5 syntax
- Circular `$include` references
- Missing env var substitutions

### Issue 4: WebSocket Connection Failures

**Symptoms**:

- Clients cannot connect
- "WebSocket connection failed"
- Auth failures
- Timeout errors

**Diagnosis**:

```bash
# Test WebSocket connection
wscat -c ws://localhost:18789

# Check auth token
echo $ClosedClaw_GATEWAY_TOKEN

# Test with curl
curl -v http://localhost:18789/health

# Check logs for connection attempts
tail -f ~/.closedclaw/logs/gateway-*.log | grep -i websocket
```

**Solutions**:

```bash
# Solution 1: Check auth configuration
cat ~/.closedclaw/config.json5 | grep -A5 "gateway"

# Solution 2: Verify token
export ClosedClaw_GATEWAY_TOKEN="your-token"
closedclaw gateway --verbose

# Solution 3: Disable auth (local dev only)
# In config.json5:
{
  "gateway": {
    "auth": { "enabled": false }
  }
}

# Solution 4: Check firewall
sudo ufw allow 18789  # Ubuntu
sudo firewall-cmd --add-port=18789/tcp  # CentOS
```

### Issue 5: Channel Disconnections

**Symptoms**:

- Channels show as disconnected in status
- Messages not being received
- Channel-specific errors

**Diagnosis**:

```bash
# Check channel status
closedclaw channels status

# Probe specific channel
closedclaw channels status --channel telegram --probe

# Check channel-specific logs
tail -f ~/.closedclaw/logs/telegram-*.log

# Check credentials
ls -la ~/.closedclaw/credentials/
```

**Solutions**:

```bash
# Solution 1: Restart channel
closedclaw channels restart --channel telegram

# Solution 2: Refresh credentials
closedclaw oauth signin --provider telegram

# Solution 3: Reset channel session
rm -rf ~/.closedclaw/sessions/telegram
closedclaw gateway restart

# Solution 4: Check rate limits
# Review channel-specific documentation in docs/channels/
```

### Issue 6: High Memory/CPU Usage

**Symptoms**:

- Gateway process using excessive resources
- Slow response times
- System lag

**Diagnosis**:

```bash
# Monitor gateway process
top -p $(pgrep -f "closedclaw.*gateway")

# Memory usage
ps aux | grep closedclaw | grep gateway

# Check heap size
node --max-old-space-size=4096 ...  # If needed

# Profile CPU
node --prof dist/index.js gateway
node --prof-process isolate-*.log > processed.txt
```

**Solutions**:

```bash
# Solution 1: Check for memory leaks
closedclaw gateway --inspect
# Open chrome://inspect in browser

# Solution 2: Reduce session cache
# In config.json5:
{
  "sessions": {
    "maxCacheSize": 100  // Reduce from default
  }
}

# Solution 3: Enable compaction
{
  "agents": {
    "compaction": {
      "enabled": true,
      "minMessages": 50
    }
  }
}

# Solution 4: Restart periodically (daemon)
# Add to systemd/launchd config
```

### Issue 7: Config Hot-Reload Failures

**Symptoms**:

- Changes to config.json5 not applied
- Gateway crashes on reload
- SIGUSR1 signal ignored

**Diagnosis**:

```bash
# Find gateway PID
pgrep -f "closedclaw.*gateway"

# Send reload signal
kill -USR1 $(pgrep -f "closedclaw.*gateway")

# Watch for reload in logs
tail -f ~/.closedclaw/logs/gateway-*.log | grep -i reload
```

**Solutions**:

```bash
# Solution 1: Manual restart
closedclaw gateway restart

# Solution 2: Check config validity first
closedclaw doctor
kill -USR1 $(pgrep -f "closedclaw.*gateway")

# Solution 3: Use gateway command
closedclaw gateway reload

# Solution 4: Watch mode for development
pnpm gateway:watch
```

## Log Analysis

### Log Locations

```bash
# Gateway logs
~/.closedclaw/logs/gateway-YYYY-MM-DD.log

# Channel-specific logs
~/.closedclaw/logs/telegram-YYYY-MM-DD.log
~/.closedclaw/logs/discord-YYYY-MM-DD.log

# Agent logs
~/.closedclaw/logs/agent-main-YYYY-MM-DD.log

# macOS unified logs (if using mac app)
./scripts/clawlog.sh
log show --predicate 'subsystem == "ai.closedclaw"' --last 1h
```

### Useful Log Patterns

```bash
# Find errors
grep -i error ~/.closedclaw/logs/gateway-*.log

# Find warnings
grep -i warn ~/.closedclaw/logs/gateway-*.log

# WebSocket connections
grep -i websocket ~/.closedclaw/logs/gateway-*.log

# RPC method calls
grep -i rpc ~/.closedclaw/logs/gateway-*.log

# Channel events
grep -i "channel:" ~/.closedclaw/logs/gateway-*.log

# Find crashes
grep -i "uncaught\|unhandled" ~/.closedclaw/logs/gateway-*.log

# Performance issues
grep -i "slow\|timeout" ~/.closedclaw/logs/gateway-*.log

# Follow live logs with filtering
tail -f ~/.closedclaw/logs/gateway-*.log | grep -E "error|warn|websocket"
```

### Log Analysis Tools

```bash
# Count error types
grep -i error ~/.closedclaw/logs/gateway-*.log | cut -d' ' -f5- | sort | uniq -c | sort -rn

# Timeline of events
grep "2026-02-09 14:" ~/.closedclaw/logs/gateway-*.log

# Export logs for analysis
tar -czf closedclaw-logs-$(date +%Y%m%d).tar.gz ~/.closedclaw/logs/

# Parse JSON logs (if applicable)
cat ~/.closedclaw/logs/gateway-*.log | jq -r 'select(.level=="error") | .message'
```

## Development Debugging

### Hot-Reload Mode

```bash
# Watch mode with auto-restart
pnpm gateway:watch

# Development mode (skip channels)
ClosedClaw_SKIP_CHANNELS=1 pnpm gateway:watch

# Verbose logging
pnpm closedclaw gateway --verbose

# Debug mode with inspect
node --inspect dist/index.js gateway
```

### Testing Gateway

```bash
# E2E test suite
pnpm test:e2e -- src/gateway

# Specific gateway test
pnpm test -- src/gateway/server.test.ts

# With verbose output
pnpm test -- src/gateway/server.test.ts --reporter=verbose

# Gateway network tests
pnpm test:e2e -- src/gateway/server.e2e.test.ts
```

### Debugging WebSocket/RPC

```typescript
// Enable debug logging in test
process.env.DEBUG = "closedclaw:gateway:*";

// Use test helpers
import { createTestGateway } from "../gateway/test-helpers.e2e.js";

const gateway = await createTestGateway({
  port: 18790,
  verbose: true,
});
```

## Recovery Procedures

### Full Reset (Nuclear Option)

```bash
# Stop gateway
pkill -f closedclaw

# Remove lock files
rm ~/.closedclaw/gateway.lock

# Backup config
cp ~/.closedclaw/config.json5 ~/config-backup.json5

# Clear sessions (careful!)
rm -rf ~/.closedclaw/sessions/*

# Clear logs
rm ~/.closedclaw/logs/*.log

# Fresh start
closedclaw gateway --reset --verbose
```

### Graceful Recovery

```bash
# Stop gateway
closedclaw gateway stop

# Wait for cleanup
sleep 5

# Remove stale locks
rm -f ~/.closedclaw/gateway.lock

# Restart
closedclaw gateway --verbose

# Verify
closedclaw channels status
```

### Daemon Recovery

```bash
# macOS (launchd)
launchctl stop ai.closedclaw.gateway
launchctl start ai.closedclaw.gateway

# Linux (systemd)
systemctl --user restart closedclaw-gateway

# Check daemon status
./scripts/restart-mac.sh  # macOS
systemctl --user status closedclaw-gateway  # Linux
```

## Diagnostic Checklist

- [ ] Gateway process running: `ps aux | grep closedclaw`
- [ ] Port available: `lsof -i :18789`
- [ ] Lock file valid: `cat ~/.closedclaw/gateway.lock`
- [ ] Config valid: `closedclaw doctor`
- [ ] Logs accessible: `ls -la ~/.closedclaw/logs/`
- [ ] Channels connected: `closedclaw channels status`
- [ ] WebSocket reachable: `curl http://localhost:18789/health`
- [ ] Credentials present: `ls ~/.closedclaw/credentials/`
- [ ] Disk space available: `df -h ~/.closedclaw`
- [ ] Memory reasonable: `top -p $(pgrep -f closedclaw)`

## Prevention Best Practices

1. **Use daemon management**: launchd/systemd for automatic restart
2. **Monitor logs**: Set up log rotation and monitoring
3. **Regular health checks**: `closedclaw doctor` in cron
4. **Graceful shutdown**: Always use Ctrl+C, not `kill -9`
5. **Config validation**: Test config changes before reload
6. **Backup config**: Version control or regular backups
7. **Update regularly**: `closedclaw update --channel stable`
8. **Resource limits**: Set memory/CPU limits in daemon config
9. **Rate limiting**: Configure per-channel rate limits
10. **Error alerting**: Set up notifications for critical errors

## Related Files

- `src/gateway/boot.ts` - Gateway startup logic
- `src/gateway/server.ts` - WebSocket/HTTP server
- `src/infra/gateway-lock.ts` - Lock file management
- `src/config/config-reload.ts` - Hot-reload implementation
- `src/gateway/net.ts` - Network configuration
- `docs/debugging.md` - General debugging guide
