---
doc_type: learning
track: knowledge
date: 2026-06-10
slug: host-side-managed-resources-need-server-ownership
component: host-management
tags: [server, desktop, web, skills, host-management]
---

# host-side managed resources need server ownership

## 背景

这次把 orchestration skills 管理从 Electron-only 扩到 Web 时，表面上看像是“把一张设置卡片搬到浏览器”，但真正的执行逻辑一直在 desktop main process 里：比较 bundled skills、同步文件、写 manifest、删除 legacy managed skills。

一旦能力要同时被 Web host settings 和 desktop settings 复用，单纯搬 UI 不够，真正的边界问题是“谁拥有 host 机器上的执行逻辑”。

## 指导原则

凡是“修改连接 host 上受 Paseo 管理资源”的能力，执行逻辑应默认落在 server scoped module，而不是继续埋在 Electron 包里。

UI、Electron IPC、WebSocket session RPC 都只是入口；真正知道如何读 bundle、比较目标目录、执行写入/删除的，应是 daemon/server 侧可复用的 host execution module。

## 为什么重要

- Web 端不能调用 Electron main process，desktop-only 实现一开始就限制了能力上限。
- host-side 资源的真实执行位置是 daemon 机器，不是浏览器机器；把执行逻辑放 server 更符合系统边界。
- 复用 server scoped module 后，desktop 和 Web 的行为更容易保持一致，测试也能围绕同一套纯逻辑展开。
- 如果 bundle/source 解析属于运行时前提，把它放到 server 才能稳定决定 feature flag，而不是让 UI 层猜测“应该能不能用”。

## 何时适用

- daemon 机器上的配置文件安装/同步
- managed bundle / assets / templates 的 host-side 落盘
- host 级别的安装器、修复器、清理器
- 任何本质上是“对连接 host 的受控资源执行操作”的能力

不适用于：

- 纯浏览器本地 UI 状态
- 纯 Electron 壳层能力，如窗口、dock、auto-update
- localhost-only OS/FS 特权动作；那类能力仍按独立安全边界处理

## 示例

- `web-host-skills-management` 最终做法不是把 desktop `IntegrationsSection` 原样搬到 Web，而是把 skills sync/status/remove 逻辑收进 `packages/server/src/server/integrations/skills/`，由 desktop IPC 和 `daemon.skills.*` 共同复用。
