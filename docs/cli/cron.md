---
summary: "CLI reference for `ClosedClaw cron` (schedule and run background jobs)"
read_when:
  - You want scheduled jobs and wakeups
  - You’re debugging cron execution and logs
title: "cron"
---

# `ClosedClaw cron`

Manage cron jobs for the Gateway scheduler.

Related:

- Cron jobs: [Cron jobs](/automation/cron-jobs)

Tip: run `ClosedClaw cron --help` for the full command surface.

## Common edits

Update delivery settings without changing the message:

```bash
ClosedClaw cron edit <job-id> --deliver --channel telegram --to "123456789"
```

Disable delivery for an isolated job:

```bash
ClosedClaw cron edit <job-id> --no-deliver
```
