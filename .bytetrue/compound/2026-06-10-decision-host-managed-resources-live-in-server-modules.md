---
doc_type: decision
category: convention
date: 2026-06-10
slug: host-managed-resources-live-in-server-modules
status: active
area: host-management
tags: [server, desktop, web, host-management, convention]
---

## 背景

`web-host-skills-management` 暴露了一个结构性问题：host-scoped 资源管理能力最初只存在于 Electron main process 内部。只要能力想被 Web 复用，desktop-only 实现就会变成瓶颈，最终逼出“双份逻辑”或“只把 UI 搬过去但后端没法执行”的半成品。

这类能力和 localhost-only 的 `local.os.*` / `local.fs.*` 又不同。后者是本机 OS/FS 特权动作，有单独的 transport gate；而 host-scoped managed resources 更像普通 daemon operator 能力，只是其副作用落在 daemon 机器上。

## 决定

凡是“修改连接 host 上受 Paseo 管理资源”的执行逻辑，默认放在 `packages/server/src/server/` 下的 scoped module，由 WebSocket session RPC 和 Electron IPC 共同复用。

具体到本次 feature：

- `packages/server/src/server/integrations/skills/` 负责 bundled skills source 解析、managed skill diff、sync、uninstall。
- Web 通过 `daemon.skills.*` RPC 调用这套逻辑。
- desktop 保留入口，但只做薄包装 / 委托，不再持有独占实现。

## 理由

- **边界清楚**：执行地点是 daemon host，就应由 daemon/server 拥有执行逻辑。
- **避免双份实现**：Web 和 desktop 共用一套 host execution module，行为和测试不容易漂。
- **feature gate 更可靠**：server 侧能基于真实运行时条件（如 bundled skills source 是否存在）决定是否声明支持。
- **后续扩展有路径**：未来如果 CLI installer、模板同步、其它 host-managed 资源也要从 Web 触达，不需要再重新决定“该放 Electron 还是 server”。

## 考虑过的替代方案

- **继续把逻辑留在 desktop 包，只给 Web 做代理入口**：短期接入快，但本质仍把 host execution 锁在 Electron 进程里；standalone server 和 remote Web 都难复用。
- **给 Web 再复制一份 Node/FS 实现**：会产生第二份状态机和第二份 manifest 逻辑，长期不可维护。
- **完全抽成独立 workspace package**：未来可能值得，但这次范围下先收回 server scoped module 已足够，不必提前做更大搬迁。

## 后果

- 后续新做 host-scoped managed resource 功能时，默认先在 `packages/server/src/server/` 下找归属位置，而不是直接往 `packages/desktop/src/` 塞执行逻辑。
- Electron-only 壳层能力仍然留在 desktop 包；不要把这条 convention 误用到 window/update/dock 这类不属于 daemon host execution 的能力上。
- `Enable Paseo tools` 这类 agent runtime config 开关继续保留在现有 daemon config 路径，不因为共享 module convention 而混入 skills 安装器语义。

## 相关文档

- `.bytetrue/features/2026-06-10-web-host-skills-management/web-host-skills-management-design.md`
- `.bytetrue/features/2026-06-10-web-host-skills-management/web-host-skills-management-acceptance.md`
- `.bytetrue/architecture/ARCHITECTURE.md`
- `docs/api/daemon-skills-management-rpc.md`
