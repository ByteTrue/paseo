---
doc_type: lib-api-ref
entry: daemon-skills-management-rpc
category: daemon-websocket-rpc
status: current
source_files:
  - packages/protocol/src/messages.ts
  - packages/client/src/daemon-client.ts
  - packages/server/src/server/session.ts
  - packages/server/src/server/integrations/skills/operations.ts
summary: Browser and desktop daemon RPCs for reading and mutating the host's managed Paseo orchestration skills.
tags: [daemon, skills, websocket, host-settings]
last_reviewed: 2026-06-10
---

# Daemon skills management RPCs

## 概述

This RPC family exposes host-scoped orchestration skills management through the normal daemon client session. It is not the same feature as `Enable Paseo tools`:

- `Enable Paseo tools` controls `daemon.mcp.injectIntoAgents`.
- This RPC family manages the host machine's managed skills files under `~/.agents/skills`, `~/.claude/skills`, and `~/.codex/skills`.

The daemon advertises support through `server_info.features.hostSkillsManagement`. Clients should not call these RPCs when that flag is absent.

## API 参考

The family includes four request/response pairs:

- `daemon.skills.get_status.request` / `daemon.skills.get_status.response`
- `daemon.skills.install.request` / `daemon.skills.install.response`
- `daemon.skills.update.request` / `daemon.skills.update.response`
- `daemon.skills.uninstall.request` / `daemon.skills.uninstall.response`

All four responses share the same payload shape:

- `requestId: string`
- `status: { state, ops } | null`
- `error: string | null`

`status.state` is one of:

- `not-installed`
- `up-to-date`
- `drift`

`status.ops` is a list of pending managed actions:

- `{ kind: "add", name }`
- `{ kind: "update", name }`
- `{ kind: "delete", name }`

### `daemon.skills.get_status.request`

Reads the current managed skills state for the connected host.

Input payload:

- `requestId: string`

### `daemon.skills.install.request`

Installs missing managed skills from the host's bundled skills source.

Input payload:

- `requestId: string`

### `daemon.skills.update.request`

Repairs drifted managed skills and removes legacy managed names that are no longer in the bundle.

Input payload:

- `requestId: string`

### `daemon.skills.uninstall.request`

Removes all managed Paseo skills from the managed targets, while leaving unrelated user-defined skills alone.

Input payload:

- `requestId: string`

## 基本用法

1. Read `server_info.features.hostSkillsManagement`.
2. If the flag is absent, show an update-host hint and do not call these RPCs.
3. Call `daemon.skills.get_status.request` to render current state.
4. Trigger `install`, `update`, or `uninstall` based on the returned `state`.

## 注意事项

- This family is host-scoped: it mutates the daemon machine, not the browser machine.
- It is available to ordinary authorized daemon clients; it is not localhost-only like `local.os.*` / `local.fs.*`.
- The daemon only advertises the feature when it can resolve a bundled skills source directory.
- Managed operations do not remove unrelated user-defined skills outside the Paseo managed set.

## 相关条目

- [Architecture](../architecture.md)
- [Development](../development.md)
