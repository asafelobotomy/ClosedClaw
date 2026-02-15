---
title: Cloud Foundry
description: Deploy ClosedClaw on Cloud Foundry (open-source PaaS)
summary: Deploy ClosedClaw on Cloud Foundry for multi-cloud PaaS deployment
read_when:
  - Setting up ClosedClaw on Cloud Foundry
  - Looking for open-source PaaS deployment
  - Need multi-cloud deployment flexibility
---

# Cloud Foundry Deployment

**Goal:** ClosedClaw Gateway running on [Cloud Foundry](https://www.cloudfoundry.org/) with persistent storage, automatic scaling, and channel access.

## What is Cloud Foundry?

Cloud Foundry is an open-source Platform-as-a-Service (PaaS) that automates deployment, scaling, and management of applications. It supports multiple clouds (AWS, Azure, GCP, OpenStack) and provides a consistent deployment experience across all of them.

**Key benefits:**
- **Multi-cloud:** Deploy to any Cloud Foundry installation (public or private)
- **Zero infrastructure management:** Focus on your app, not servers
- **Built-in services:** Easy database and storage binding
- **Auto-scaling:** Scale based on demand
- **Rolling deployments:** Zero-downtime updates

## What you need

- [Cloud Foundry CLI (`cf`)](https://docs.cloudfoundry.org/cf-cli/install-go-cli.html) installed
- Access to a Cloud Foundry foundation (e.g., Pivotal/VMware Tanzu, SAP BTP, IBM Cloud Foundry)
- Model auth: Anthropic API key (or other provider keys)
- Channel credentials: Discord bot token, Telegram token, etc.

## Quick Start Path

1. Clone repo → customize `manifest.yml`
2. Create app → set environment variables
3. Deploy with `cf push`
4. Configure via SSH or environment variables

## Prerequisites Check

Verify you have the CF CLI installed:

```bash
cf version
```

Log in to your Cloud Foundry instance:

```bash
cf login -a https://api.YOUR_CF_DOMAIN
# Enter username and password when prompted
```

## 1) Configure the manifest

The repository includes a `manifest.yml` file. Review and customize it:

```yaml
applications:
  - name: closedclaw
    memory: 2G
    disk_quota: 1G
    instances: 1
    buildpacks:
      - nodejs_buildpack
    command: node dist/index.js gateway --allow-unconfigured --port $PORT --bind lan
    
    env:
      NODE_ENV: production
      CLOSEDCLAW_PREFER_PNPM: "1"
      CLOSEDCLAW_STATE_DIR: /home/vcap/app/data
```

**Key settings:**

| Setting | Why |
|---------|-----|
| `memory: 2G` | 512MB is too small; 2GB recommended for production |
| `--bind lan` | Binds to `0.0.0.0` so CF router can reach the gateway |
| `--port $PORT` | Uses CF's assigned port (required) |
| `--allow-unconfigured` | Starts without config file (create it after deployment) |
| `CLOSEDCLAW_STATE_DIR` | Stores state in the app directory |

**Important:** Cloud Foundry assigns ports dynamically. The `$PORT` environment variable is automatically set by CF.

## 2) Set environment variables

Before deploying, set your secrets as environment variables:

```bash
# Required: Gateway token (for non-loopback binding)
cf set-env closedclaw CLOSEDCLAW_GATEWAY_TOKEN $(openssl rand -hex 32)

# Model provider API keys
cf set-env closedclaw ANTHROPIC_API_KEY sk-ant-...

# Optional: Other providers
cf set-env closedclaw OPENAI_API_KEY sk-...
cf set-env closedclaw GOOGLE_API_KEY ...

# Channel tokens (if using)
cf set-env closedclaw DISCORD_BOT_TOKEN MTQ...
cf set-env closedclaw TELEGRAM_BOT_TOKEN ...
```

**Security note:** Non-loopback binds (`--bind lan`) require `CLOSEDCLAW_GATEWAY_TOKEN` for security. Treat these tokens like passwords.

## 3) Deploy the application

```bash
# From the ClosedClaw repository root
cf push
```

**First deploy process:**
1. CF uploads your application code (excluding `.cfignore` files)
2. Node.js buildpack detects `package.json`
3. Runs `pnpm install --frozen-lockfile`
4. Runs `pnpm build` (TypeScript compilation)
5. Runs `pnpm ui:build` (web UI build)
6. Starts the application with the command from `manifest.yml`

This takes ~3-5 minutes on first deploy. Subsequent deploys are faster.

## 4) Verify deployment

Check the app status:

```bash
cf app closedclaw
```

You should see:
```
name:              closedclaw
requested state:   started
routes:            closedclaw.YOUR_CF_DOMAIN
instances:         1/1
memory usage:      2G
```

View logs:

```bash
cf logs closedclaw --recent
```

You should see:
```
[APP/PROC/WEB/0] [gateway] listening on ws://0.0.0.0:8080 (PID xxx)
```

## 5) Add persistent storage (optional)

By default, CF applications have ephemeral storage. For production deployments, bind a persistent storage service:

### Option A: Volume Service (if available)

```bash
# Create a volume service
cf create-service volume standard closedclaw-storage

# Bind it to your app
cf bind-service closedclaw closedclaw-storage

# Restage to pick up the service binding
cf restage closedclaw
```

### Option B: Object Storage (S3-compatible)

Use S3 or CF's blob storage service for config and state persistence:

```bash
# Create an S3-compatible service
cf create-service p-s3 standard closedclaw-s3

# Bind it to your app
cf bind-service closedclaw closedclaw-s3

# Set environment variable to use S3 for state
cf set-env closedclaw CLOSEDCLAW_USE_S3 true
cf restage closedclaw
```

**Note:** You'll need to implement S3 state persistence in ClosedClaw if using Option B.

## 6) Configure ClosedClaw

### Option A: Via SSH (interactive)

```bash
cf ssh closedclaw
```

Create config:

```bash
cd /home/vcap/app
mkdir -p data
cat > data/closedclaw.json5 << 'EOF'
{
  agents: {
    defaults: {
      model: {
        primary: "claude-3-7-sonnet-20250219",
        fallback: "gpt-4o"
      }
    }
  },
  gateway: {
    auth: {
      mode: "token"
    }
  }
}
EOF
```

### Option B: Via environment variables (recommended)

Set configuration via environment variables instead of a config file:

```bash
cf set-env closedclaw CLOSEDCLAW_AGENT_MODEL_PRIMARY claude-3-7-sonnet-20250219
cf set-env closedclaw CLOSEDCLAW_GATEWAY_AUTH_MODE token
cf restage closedclaw
```

## 7) Access the dashboard

The gateway is accessible via the route assigned by Cloud Foundry.

**Get your app URL:**

```bash
cf app closedclaw
# Look for "routes:" line
```

Open in browser:
```
https://closedclaw.YOUR_CF_DOMAIN
```

**Authentication:** You'll need to provide the `CLOSEDCLAW_GATEWAY_TOKEN` you set earlier.

## 8) Connect your channels

### Telegram

```bash
cf ssh closedclaw
cd /home/vcap/app
node dist/index.js pairing list telegram
node dist/index.js pairing approve telegram <CODE>
```

### WhatsApp

```bash
cf ssh closedclaw
cd /home/vcap/app
node dist/index.js channels login whatsapp
# Scan QR code (output to terminal)
```

See [Channels](/channels) for other providers.

## Scaling

### Horizontal scaling (multiple instances)

```bash
cf scale closedclaw -i 2
```

**Note:** ClosedClaw's gateway uses WebSockets and maintains session state. Running multiple instances requires:
- Sticky sessions (automatic with CF's routing)
- Shared state storage (see persistent storage section)

### Vertical scaling (more memory/CPU)

```bash
cf scale closedclaw -m 4G
```

## Monitoring

### View logs

```bash
# Recent logs
cf logs closedclaw --recent

# Stream logs
cf logs closedclaw
```

### Check health

```bash
cf app closedclaw
```

### View events

```bash
cf events closedclaw
```

## Troubleshooting

### App won't start

Check logs for errors:

```bash
cf logs closedclaw --recent
```

Common issues:
- **Out of memory:** Increase memory with `cf scale closedclaw -m 4G`
- **Build failure:** Check that `package.json` is present and valid
- **Port binding:** Ensure command uses `--port $PORT`

### Health check failing

Verify the health endpoint is accessible:

```bash
cf ssh closedclaw
curl http://localhost:$PORT/health
```

If failing, check:
- Gateway is binding to `0.0.0.0` (use `--bind lan`)
- Port matches `$PORT` environment variable
- Health check timeout is sufficient (set in manifest: `timeout: 180`)

### Can't SSH to app

Enable SSH if disabled:

```bash
cf enable-ssh closedclaw
cf restart closedclaw
```

### Gateway token not working

Verify environment variable is set:

```bash
cf env closedclaw | grep CLOSEDCLAW_GATEWAY_TOKEN
```

If missing, set it:

```bash
cf set-env closedclaw CLOSEDCLAW_GATEWAY_TOKEN $(openssl rand -hex 32)
cf restage closedclaw
```

## Cost Considerations

Cloud Foundry pricing varies by provider:

| Provider | Free Tier | Paid Plans | Notes |
|----------|-----------|------------|-------|
| Pivotal/VMware Tanzu | Enterprise only | Contact sales | Production-grade |
| SAP BTP | Trial account | From ~$10/mo | Free trial for 90 days |
| IBM Cloud Foundry | 256MB free | From $30/mo | Limited free tier |
| Swisscom App Cloud | Trial available | From CHF 40/mo | Swiss data residency |

**Minimum resources for ClosedClaw:**
- 2GB memory
- 1GB disk
- 1 instance

## Security Best Practices

1. **Use environment variables for secrets** - Never commit secrets to `manifest.yml`
2. **Enable health checks** - Already configured in the manifest
3. **Use HTTPS routes** - CF provides this automatically
4. **Restrict SSH access** - Only enable when needed
5. **Rotate gateway tokens** - Change `CLOSEDCLAW_GATEWAY_TOKEN` periodically

```bash
# Rotate token
cf set-env closedclaw CLOSEDCLAW_GATEWAY_TOKEN $(openssl rand -hex 32)
cf restage closedclaw
```

## Zero-Downtime Deployments

Cloud Foundry supports zero-downtime deployments:

```bash
# Rolling deployment (requires CF 7.0+)
cf push closedclaw --strategy rolling
```

This:
1. Starts new instances with updated code
2. Waits for health checks to pass
3. Routes traffic to new instances
4. Stops old instances

## Advanced: Using Services

Cloud Foundry services can provide:
- PostgreSQL/MySQL databases
- Redis for caching
- S3 for file storage
- Monitoring/logging

### Example: Bind PostgreSQL

```bash
# Create a PostgreSQL service
cf create-service postgresql small closedclaw-db

# Bind to your app
cf bind-service closedclaw closedclaw-db

# Restage to inject credentials
cf restage closedclaw
```

Service credentials are automatically injected as environment variables in the `VCAP_SERVICES` JSON.

## Comparison with Other Platforms

| Feature | Cloud Foundry | Fly.io | Heroku | Render |
|---------|---------------|--------|--------|--------|
| Multi-cloud | ✅ Yes | ❌ No | ❌ No | ❌ No |
| Open source | ✅ Yes | ❌ No | ❌ No | ❌ No |
| Free tier | Varies | ✅ Yes | ✅ Limited | ✅ Yes |
| Persistent storage | Via services | ✅ Volumes | Add-ons | ✅ Disks |
| WebSocket support | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Auto-scaling | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |

**When to choose Cloud Foundry:**
- You need multi-cloud portability
- You have access to an enterprise CF installation
- You want a fully open-source deployment platform
- You need advanced service binding and marketplace

**When to choose alternatives:**
- **Fly.io**: Better free tier, simpler setup ([guide](/platforms/fly))
- **DigitalOcean**: More control, cheaper VPS ([guide](/platforms/digitalocean))
- **Oracle Cloud**: Free tier with generous resources ([guide](/platforms/oracle))

## See Also

- [Fly.io guide](/platforms/fly) - Alternative PaaS with better free tier
- [DigitalOcean guide](/platforms/digitalocean) - VPS alternative
- [Gateway configuration](/gateway/configuration) - Full config reference
- [Channels](/channels) - Channel setup guides
- [Cloud Foundry documentation](https://docs.cloudfoundry.org/) - Official CF docs
