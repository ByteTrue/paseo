---
doc_type: decision
category: convention
date: 2026-06-08
slug: persist-adapter-as-injected-store
status: active
area: server-persistence
tags: [dependency-injection, persistence, providers, preferences]
---

# 持久化适配器用独立 Store 注入，不内嵌文件 I/O

## 背景

daemon-synced-settings feature 引入两项新的持久化需求：

1. **Provider snapshot cache** — `ProviderSnapshotManager` 需要将探测到的 provider model/mode 缓存到磁盘
2. **Agent form preferences** — app hook 需要从 daemon config 读取/写入模型偏好

这两个场景都有同一个设计问题：持久化 I/O 是嵌在编排对象内部，还是作为独立 Store 注入。

## 决定

**持久化适配器作为独立 Store 类，通过构造函数注入到编排对象。** 编排对象只依赖一个最小接口（`read` / `write` / `retainProviders`），不关心文件路径、序列化格式和 atomic write 策略。

具体落地：

- `ProviderSnapshotCacheStore` 实现 `ProviderSnapshotCache` 接口，注入 `ProviderSnapshotManager` 构造函数
- 测试时替换为 `{ read: vi.fn(), write: vi.fn() }`，不碰文件系统
- 生产实例在 `bootstrap.ts` 创建，依赖 `$PASEO_HOME` 环境

## 理由

1. **测试不需要文件系统** — 注入假 Store 后，manager 行为可以直接 assertion 内存状态，不需要创建 temp dir / 清理文件
2. **编排与 I/O 分离** — manager 的 `getSnapshot` / `refreshProvider` 逻辑不受缓存文件路径、序列化格式变化影响
3. **环境依赖显式化** — 看一眼 bootstrap.ts 就知道哪些模块需要 `$PASEO_HOME`，而不是在 manager 内部隐式访问

## 考虑过的替代方案

- **在 manager 内部直接写文件**：实现更快，但测试必须创建 temp dir + readFile，且文件 I/O 错误会耦合进 provider 编排逻辑
- **用 decorator / middleware 模式**：过度设计，缓存语义简单（读写 + retain），不需要中间件链

## 后果

- 新增模块都需要一个 interface + 一个实现类，比直接写文件多 ~30 行 boilerplate
- 但测试隔离和负责人分离的价值远大于这点 boilerplate
- 后续类似持久化需求（如 agent chat 缓存）也应遵循此规约
