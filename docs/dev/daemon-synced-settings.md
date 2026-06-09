---
doc_type: dev-guide
slug: daemon-synced-settings
component: daemon-synced-settings
status: current
summary: 将 daemon display name、create-agent 偏好、provider snapshot 缓存持久化到 daemon 本机，让新 web 客户端连上即可工作。
tags: [daemon, settings, protocol, providers]
last_reviewed: 2026-06-08
---

# 新设备连上 daemon 即刻可用

## 概述

Paseo web 客户端换设备 / 换浏览器后，和 daemon 工作能力直接相关的三组状态现在由 daemon 持久化管理，不再依赖浏览器 localStorage：

1. **Daemon 显示名** — `daemon.displayName`，用户给主机起的名字。
2. **Create-agent 偏好** — `agents.formPreferences`，包括最近选的 provider、每个 provider 的 model/mode/thinking 默认值、收藏模型。
3. **Provider 快照缓存** — `$PASEO_HOME/provider-snapshot-cache.json`，上次成功探测到的 provider model/mode 列表。

新浏览器连上 daemon 后，这三组状态经由 `server_info` 和 daemon config RPC 秒开可用，不需要重新配置或等待 provider 探测。

## 前置依赖

- 依赖 `v0.1.94` 或更新的 daemon 和 client。
- daemon 需要 `$PASEO_HOME` 可读写。

## 快速上手

### App 端：读取 daemon display name

```ts
// session-context.tsx 在 server_info 到达后自动同步
// 无需手动调用；<HostInfo /> / <HostSettings /> 直接展示已有 label
```

如需在创建 agent 表单中使用 daemon-backed 偏好：

```ts
// 只需传 serverId，hook 自动识别 daemon 能力
const prefs = useFormPreferences(serverId);
// prefs.provider, prefs.providerPreferences, prefs.favoriteModels 来自 daemon config
```

### Server 端：新增配置字段

新 daemon 启动时会自动从 `$PASEO_HOME/config.json` 加载新字段，无需额外配置。手动 patch 示例：

```json
// PATCH getDaemonConfig → payload
{
  "displayName": "Studio Mac",
  "agentFormPreferences": {
    "provider": "codex",
    "providerPreferences": {
      "codex": { "model": "gpt-5.1", "mode": "auto", "thinking": "low" }
    },
    "favoriteModels": ["codex:gpt-5.1", "claude:opus-4.5"]
  }
}
```

## 核心概念

### 三层持久化

| 层级                 | 落点                                       | 内容                                                     |
| -------------------- | ------------------------------------------ | -------------------------------------------------------- |
| Daemon 全局配置      | `$PASEO_HOME/config.json`                  | `daemon.displayName`, `agents.formPreferences`           |
| Daemon provider 缓存 | `$PASEO_HOME/provider-snapshot-cache.json` | 每个 cwd 的 provider model/mode 最后已知状态             |
| Browser 本地         | AsyncStorage `@paseo:daemon-registry` 等   | 连接书签、host label 缓存（fallback）、授权密钥、UI 外观 |

### Provider snapshot cache 契约

- **Cold read**：`getSnapshot(cwd)` 先查内存；冷的优先读磁盘缓存，返回带 `cacheState: "cached"` 的 entry；同时后台 warm。
- **Backfill write**：每次 provider probe 完成后 `setEntry` 写回缓存，写入前剔除 loading 状态 entry。
- **Refresh 失败**：如果已有 `cacheState: "cached"` + `status: "ready"` 的 entry，后台刷新失败后保留 cached models/modes，追加 `lastRefreshError`。
- **Provider 删除**：`applyMutableProviderConfig` 通过 `retainProviders` 清理已删除 provider 的缓存条目。

### Feature flags

新行为全部通过 `server_info.features` 中的 gate 控制：

```ts
// websocket-server.ts 构建 features 对象
features: {
  // COMPAT(daemonDisplayName): added in v0.1.94, remove gate after 2026-12-08.
  daemonDisplayName: true,
  // COMPAT(daemonAgentFormPreferences): added in v0.1.94, remove gate after 2026-12-08.
  daemonAgentFormPreferences: true,
  // COMPAT(providerSnapshotCache): added in v0.1.94, remove gate after 2026-12-08.
  providerSnapshotCache: true,
}
```

App 端检测 feature flag 来决定走 daemon 路径还是旧本地路径：

```ts
// host-page.tsx - 新 daemon 用 patchConfig 改名
const supportsDaemonDisplayName = features?.daemonDisplayName === true;

// use-form-preferences.ts - 新 daemon 用 daemon config 偏好
const supportsDaemonPreferences = features?.daemonAgentFormPreferences === true;
```

**添加新 feature gate 的约定**：

- 在 `websocket-server.ts` 的 `features` 对象里加一条，带 `COMPAT(name): added in v0.1.XX, remove gate after YYYY-MM-DD` 注释（6 个月后清理）。
- App 端在对应 hook/组件里检查 `features?.flagName === true`，写一个干净的能力分支，不写 fallback 模拟代码。
- 旧 daemon 不返回这个 flag → app 走旧路径。

## 接口参考

### 协议新增字段（全部 optional）

**MutableDaemonConfig**（`messages.ts`）：`displayName`, `agentFormPreferences`

**DaemonPersistedConfig**（`persisted-config.ts`）：`daemon.displayName`, `agents.formPreferences`

**ServerInfoStatusPayload**（`messages.ts`）：`displayName?: string | null`

**ProviderSnapshotEntry**（`agent-types.ts`）：`cacheState?: "live" | "cached"`, `cacheGeneratedAt?: string`, `lastRefreshError?: string`

### Server 新增类

**ProviderSnapshotCacheStore** — `packages/server/src/server/agent/provider-snapshot-cache-store.ts`

```ts
interface ProviderSnapshotCache {
  read(cwd: string): ProviderSnapshotEntry[];
  write(cwd: string, entries: ProviderSnapshotEntry[]): void;
  retainProviders(providerIds: AgentProvider[]): void;
}
```

通过 `ProviderSnapshotManager` 构造函数注入。生产实例在 `bootstrap.ts` 创建。测试可通过注入 `{ read: vi.fn(), write: vi.fn(), retainProviders: vi.fn() }` 隔离。

## 常见场景

### 场景 1：新浏览器连已配置 daemon

1. WebSocket 握手返回 `server_info`，含 `displayName` 和 `features`。
2. App `session-context` 将 `displayName` 同步到 host runtime label 缓存。
3. App 调用 `getDaemonConfig()` 拿到 `agentFormPreferences`。
4. `useFormPreferences(serverId)` 监测到 `daemonAgentFormPreferences` feature → 从 daemon config 读偏好 → 表单控件立即可用。
5. Provider snapshot 查询发现 `providerSnapshotCache` feature → cold snapshot seed from disk → selector 显示 cached models。

### 场景 2：旧 daemon 兼容

1. 旧 daemon 的 `server_info.features` 不含 `daemonAgentFormPreferences`。
2. `useFormPreferences(serverId)` 检测 flag 为 `undefined` → 退回 `@paseo:create-agent-preferences` localStorage。
3. Provider snapshot 无缓存文件 → 退回 loading 行为，等待 live probe。

### 场景 3：本地偏好一次性迁移

1. 浏览器 A 在旧 daemon 上积累了大量 `@paseo:create-agent-preferences`。
2. 升级 daemon 后首次连接：`useFormPreferences` 检测到 daemon 有 `daemonAgentFormPreferences` flag + daemon 端 `agentFormPreferences` 为空 → 将本地偏好上传一次。
3. 此举不会覆盖已有 daemon 偏好（非空时跳过）。

## 已知限制与注意事项

- Provider cache 文件无条目数/时间上限修剪——仅通过 `retainProviders` 清理已删除 provider 的条目。workspace 长期不访问且 provider 不变时缓存数据保留；实际占用极小（<100KB per cwd）。
- `lastRefreshError` 目前只在 server 端协议字段存在，app UI 尚未展示该信息（不影响选择器可用性）。
- 缓存的 provider 模型列表只是"上一份探测结果"，刷新失败时旧结果保留，但不会抑制 UI 显示任何"数据可能过时"的提示——cache state marker 留待后续迭代。
- 创建 agent 时的默认模型解析（`resolveDefaultModel`）依赖 provider readiness，cold cache seed 阶段可能因模型列表为空而返回 `undefined`，需 UI 层处理该 fallback。

## 相关文档

- [data-model.md](../data-model.md) — 持久化文件布局和新增字段
- [providers.md](../providers.md) — Provider Snapshot Refresh Contract 更新
- [daemon-synced-settings-design.md](../../.bytetrue/features/2026-06-08-daemon-synced-settings/daemon-synced-settings-design.md)
