---
doc_type: decision
category: convention
date: 2026-06-09
slug: local-integration-server-modules
status: active
area: server-architecture
tags: [local-daemon, websocket, os-integration, module-boundary]
---

# Local integration logic lives in scoped server modules

## 背景

`2026-06-08-localhost-desktop-actions` 给 browser localhost 增加了本机 editor/file-manager open targets 和 daemon-backed directory picker。这个能力跨协议、WebSocket gate、Session handler、OS spawn、filesystem traversal 和 app UI。如果把所有实现塞进 `websocket-server.ts` 或 `session.ts`，会让本已很大的 server 文件继续膨胀，也会模糊安全 gate 和业务执行逻辑的边界。

## 决定

本机 OS / FS integration 的执行逻辑放在 scoped server modules 下：

- `packages/server/src/server/local-os/`：editor/file-manager target detection、target launch、OS-specific command mapping。
- `packages/server/src/server/local-fs/`：daemon-backed directory picker roots/listing、directory-only traversal。

WebSocket 层只负责 socket-level authorization gate 和 transport error；Session 层只负责协议分发和 response shaping；local modules 负责可测试的 OS / filesystem 行为。

## 理由

- **安全边界清楚**：relay / non-loopback 拒绝发生在 WebSocket boundary，不能被同一 Session 的其他 socket 继承本地权限。
- **业务逻辑可测试**：open target 和 directory picker 都可以用 unit tests 覆盖，不需要起 daemon 或真实浏览器。
- **避免大文件继续膨胀**：`websocket-server.ts` 和 `session.ts` 保持编排职责，不承载平台命令细节。
- **后续扩展有位置**：lite webview / local preview、更多 local setup actions 若进入 server，也应先判断是否属于新的 scoped module，而不是直接塞进现有巨型文件。

## 考虑过的替代方案

- **直接复用 Electron `editor-targets.ts`**：可避免重复，但会让 server 依赖 desktop 包或迫使 desktop/server 共享一个还不存在的 package。首版选择在 server 侧复制并测试纯逻辑，后续若重复继续扩大再提取 shared module。
- **把所有 handler 放进 `session.ts`**：接入最快，但会把 OS command mapping 和 directory traversal 混进 session 编排，验收时也证明这个路径容易偏离方案的模块隔离目标。

## 后果

新增 local integration 时，应先判断是否属于 `server/local-os/`、`server/local-fs/` 或新的 scoped module。WebSocket gate、Session dispatch、local execution module 三者要分层维护，测试也应分别覆盖：transport-level deny、protocol response shape、local module behavior。

## 相关文档

- `.bytetrue/features/2026-06-08-localhost-desktop-actions/localhost-desktop-actions-design.md`
- `.bytetrue/features/2026-06-08-localhost-desktop-actions/localhost-desktop-actions-acceptance.md`
- `.bytetrue/architecture/ARCHITECTURE.md`
