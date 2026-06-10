---
doc_type: lib-api-ref
entry: local-os-integration-rpc
category: daemon-websocket-rpc
status: current
source_files:
  - packages/protocol/src/messages.ts
  - packages/client/src/daemon-client.ts
  - packages/server/src/server/session.ts
  - packages/server/src/server/websocket-server.ts
summary: Browser-local daemon RPCs for local editor/file-manager open targets and daemon-backed directory browsing.
tags: [local-daemon, websocket, rpc, os-integration]
last_reviewed: 2026-06-09
---

# Local OS integration RPCs

## 概述

This endpoint family is used by browser clients that are connected directly to a local Paseo daemon. It is exposed only to loopback/local direct sockets. Relay and non-loopback direct TCP clients are rejected before the local OS / filesystem layer runs.

The family includes four request/response pairs:

- `local.os.list_open_targets.request` / `local.os.list_open_targets.response`
- `local.os.open_target.request` / `local.os.open_target.response`
- `local.fs.list_roots.request` / `local.fs.list_roots.response`
- `local.fs.list_directory.request` / `local.fs.list_directory.response`

## API 参考

### `local.os.list_open_targets.request`

Returns the list of available editor and file-manager targets for the current daemon machine.

Input payload:

- `requestId: string`

Response payload:

- `requestId: string`
- `targets: Array<{ id, label, kind }>`
- `error: string | null`

### `local.os.open_target.request`

Launches or reveals a local path in the selected target.

Input payload:

- `requestId: string`
- `editorId: string`
- `path: string`
- `cwd?: string`
- `mode?: "open" | "reveal"`

Response payload:

- `requestId: string`
- `success: boolean`
- `error: string | null`

### `local.fs.list_roots.request`

Returns directory roots that the browser-local directory picker can render.

Input payload:

- `requestId: string`

Response payload:

- `requestId: string`
- `roots: Array<{ id, label, path, kind }>`
- `error: string | null`

### `local.fs.list_directory.request`

Returns the child directories for a single absolute path.

Input payload:

- `requestId: string`
- `path: string`

Response payload:

- `requestId: string`
- `path: string`
- `parentPath: string | null`
- `entries: Array<{ name, path, kind, hidden }>`
- `error: string | null`

## 基本用法

1. The browser client checks `server_info.features.localOsIntegration`.
2. It only uses these RPCs when the active connection is local loopback/direct.
3. The workspace open-target menu calls `local.os.list_open_targets.request` before rendering targets.
4. The Open Project modal calls `local.fs.list_roots.request` and `local.fs.list_directory.request` to render the directory picker.
5. The server returns `rpc_error` at the WebSocket boundary for non-local sockets.

## 典型场景

- Open the current workspace in VS Code or Finder from a browser session.
- Reveal the current file in the platform file manager.
- Browse a local project root in a file-explorer-style picker and open it as a workspace.

## 注意事项

- These RPCs are not available to relay or non-loopback direct clients.
- `editorId` follows the existing open-target naming used by the Electron bridge.
- `path` must be an absolute local path for `local.os.open_target.request` and `local.fs.list_directory.request`.
- `local.fs.list_directory.request` returns directories only.

## 相关条目

- [Architecture](../architecture.md)
- [Local daemon actions in the browser](../local-daemon-actions.md)
