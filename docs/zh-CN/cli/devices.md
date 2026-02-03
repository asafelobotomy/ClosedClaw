---
read_when:
  - 你正在审批设备配对请求
  - 你需要轮换或吊销设备令牌
summary: "`ClosedClaw devices` 的 CLI 参考（设备配对 + 令牌轮换/吊销）"
title: devices
x-i18n:
  generated_at: "2026-02-01T19:58:53Z"
  model: claude-opus-4-5
  provider: pi
  source_hash: 52f903817d2886c1dc29b85d30168d1edff7944bd120a1e139159c9d99a1f517
  source_path: cli/devices.md
  workflow: 14
---

# `ClosedClaw devices`

管理设备配对请求和设备范围的令牌。

## 命令

### `ClosedClaw devices list`

列出待处理的配对请求和已配对的设备。

```
ClosedClaw devices list
ClosedClaw devices list --json
```

### `ClosedClaw devices approve <requestId>`

批准待处理的设备配对请求。

```
ClosedClaw devices approve <requestId>
```

### `ClosedClaw devices reject <requestId>`

拒绝待处理的设备配对请求。

```
ClosedClaw devices reject <requestId>
```

### `ClosedClaw devices rotate --device <id> --role <role> [--scope <scope...>]`

轮换特定角色的设备令牌（可选择更新权限范围）。

```
ClosedClaw devices rotate --device <deviceId> --role operator --scope operator.read --scope operator.write
```

### `ClosedClaw devices revoke --device <id> --role <role>`

吊销特定角色的设备令牌。

```
ClosedClaw devices revoke --device <deviceId> --role node
```

## 通用选项

- `--url <url>`：Gateway网关 WebSocket URL（配置后默认使用 `gateway.remote.url`）。
- `--token <token>`：Gateway网关令牌（如需要）。
- `--password <password>`：Gateway网关密码（密码认证）。
- `--timeout <ms>`：RPC 超时时间。
- `--json`：JSON 输出（推荐用于脚本）。

## 注意事项

- 令牌轮换会返回新令牌（敏感信息）。请将其视为机密处理。
- 这些命令需要 `operator.pairing`（或 `operator.admin`）权限范围。
