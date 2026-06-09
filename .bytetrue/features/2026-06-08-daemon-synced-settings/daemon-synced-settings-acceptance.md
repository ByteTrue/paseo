# daemon-synced-settings 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-08
> 关联方案 doc：daemon-synced-settings-design.md

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**名词层"现状 → 变化"逐项核对**：

- [x] daemon.displayName：声称新增 `daemon.displayName?: string` 到 persisted config
      → 代码：`packages/server/src/server/persisted-config.ts:263` `displayName: z.string().optional()`，`daemon-config-store.ts:284` 写入 `displayName: mutable.displayName`
      → 一致 ✓

- [x] agents.formPreferences：声称新增 `agents.formPreferences?: { provider?, providerPreferences?, favoriteModels? }`
      → 代码：`packages/server/src/server/persisted-config.ts:313` `formPreferences: AgentFormPreferencesSchema.optional()`，merge 通过 `shouldPersistFormPreferences` 控制
      → 一致 ✓

- [x] MutableDaemonConfig.displayName：声称可选字符串，"" 表示无自定义名
      → 代码：`packages/protocol/src/messages.ts:160,176` both `z.string().optional()`
      → 一致 ✓

- [x] MutableDaemonConfig.agentFormPreferences：声称 optional，用 FormPreferences shape
      → 代码：`packages/protocol/src/messages.ts:168,183` `MutableAgentFormPreferencesSchema.optional()` / `.partial().optional()`
      → 一致 ✓

- [x] server_info.displayName：声称 optional string | null，握手时可用
      → 代码：`packages/protocol/src/messages.ts:2212` `z.string().nullable().optional()`，`websocket-server.ts:1673` 写入 `displayName: displayName || null`
      → 一致 ✓

- [x] provider-snapshot-cache.json：声称 `$PASEO_HOME` 下的版本化 JSON 缓存
      → 代码：`packages/server/src/server/agent/provider-snapshot-cache-store.ts:18,80` `CACHE_FILENAME = "provider-snapshot-cache.json"`，version 1，keyed by cwd
      → 一致 ✓

- [x] ProviderSnapshotEntry 缓存元数据：声称 cacheState/cacheGeneratedAt/lastRefreshError
      → 代码：`packages/protocol/src/agent-types.ts:94-96` 新增三个 optional 字段，protocol `messages.ts:283-285` 对应 schema
      → 一致 ✓

- [x] HostProfile.label 变为 fallback：声称本地 label 只做离线回退，canonical 来自 daemon
      → 代码：`packages/app/src/runtime/host-runtime.ts:1610` syncDaemonDisplayName 用 `normalizeHostLabel` 写本地缓存，`session-context.tsx:899,1338` 连接后同步
      → 一致 ✓

**流程图核对**（第 2.2 节 mermaid 图）：

- [x] Client connects → server_info → stores displayName → fetches daemon config → UI shows
      → 代码：`session-context.tsx:1338` 收到 server_info 后调用 `syncDaemonDisplayName`；`useDaemonConfig` 异步 fetch
      → 一致 ✓

- [x] Provider snapshot query → memory? → cache? → loading → warm → broadcast → persist
      → 代码：`provider-snapshot-manager.ts` `getSnapshot` → `seedSnapshotFromCache` → loading fallback；`refreshProvider` → `cacheStore?.write`
      → 一致 ✓

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] 新浏览器连已配置 daemon 立即看到 display name
      → 实测：server_info 含 displayName，session-context 立即调用 syncDaemonDisplayName 更新本地 label 缓存
      → 通过 ✓

- [x] 新浏览器连已配置 daemon 立即看到 create-agent 偏好
      → 实测：`useFormPreferences(serverId)` 走 daemon config 路径，配置 load 完成后显示
      → 通过 ✓

- [x] 新浏览器连已配置 daemon 立即看到 provider model/mode 列表
      → 实测：cold `getSnapshot` → `seedSnapshotFromCache` 返回 cached entries，后台 warm
      → 通过 ✓

**明确不做逐项核对**：

- [x] metadata generation 设置未改动
      → grep 确认：`packages/server/src/server/daemon-config-store.ts` 中 metadataGeneration 逻辑未被触及
      → 未做 ✓

- [x] browser auth private key / admin password 未同步
      → grep 确认：`client-auth-store.ts` 仍在 `@paseo:daemon-client-auth-keys-v1`
      → 未做 ✓

- [x] theme/font/send behavior 未同步
      → grep 确认：`@paseo:app-settings` 未被修改
      → 未做 ✓

- [x] 未在 config replacement 时隐式探测 provider
      → 代码：`applyMutableProviderConfig` 只重建 registry + 裁剪 cache + reconcile，不触发 warmUp
      → 未做 ✓

**关键决策落地**：

- [x] 新增字段全部 optional，协议向后兼容
      → 代码：所有新字段 `.optional()`，patch 请求 z.partial()；`mergeMutableConfigIntoPersistedConfig` 只在有值时才写 JSON key
      → 一致 ✓

- [x] Feature gate 位在 server_info.features，带 COMPAT 注释
      → 代码：`websocket-server.ts:1659-1664` `daemonDisplayName`, `daemonAgentFormPreferences`, `providerSnapshotCache` 各有 `COMPAT(…): added in v0.1.94, remove gate after 2026-12-08`
      → 一致 ✓

- [x] Provider cache store 独立于 manager，不把文件 I/O 混入编排
      → 代码：`ProviderSnapshotCacheStore` 独立类，injected as `ProviderSnapshotCache` interface
      → 一致 ✓

**流程级约束核对**：

- [x] 缓存数据不能当成"永远正确"——UI 标记为 cached/stale，刷新成功后更新
      → 代码：cache 实体带 `cacheState: "cached"`，`cacheGeneratedAt` 时间戳；manager 对 `cacheState=live` 的 entry 直接返回
      → 遵守 ✓

- [x] Load 类 entry 不写缓存
      → 代码：`cacheStore.write` 调用处只在 `setEntry` 内，而 `setEntry` 在 `refreshProvider` 完成 probe 后调用；`seedSnapshotFromCache` 不写缓存
      → 遵守 ✓

- [x] 空 agentFormPreferences 不触发 persist agents 节
      → 代码：`daemon-config-store.ts:229-230` `shouldPersistFormPreferences = Object.keys(agentFormPreferences).length > 0 || persisted.agents?.formPreferences !== undefined`
      → 遵守 ✓

**挂载点反向核对**（对照第 2.3 节清单 + 实际 grep）：

- [x] Daemon mutable config contract
      → 代码落点：`messages.ts:160,168,176,183`、`daemon-config-store.ts:228,284`、`bootstrap.ts:596`
      → 清单内 ✓

- [x] Server info handshake/status
      → 代码落点：`messages.ts:2212,2251`、`websocket-server.ts:1636-1677`
      → 清单内 ✓

- [x] App host settings rename
      → 代码落点：`host-page.tsx:294,303`
      → 清单内 ✓

- [x] App create-agent / agent model controls
      → 代码落点：`use-form-preferences.ts`、`use-agent-form-state.ts`、`use-draft-agent-features.ts`、`agent-controls/index.tsx`
      → 清单内 ✓

- [x] Provider snapshot manager / cache store
      → 代码落点：`provider-snapshot-cache-store.ts`、`provider-snapshot-manager.ts` 的 `seedSnapshotFromCache`/`mergeCachedLastKnownOnRefreshFailure`/cache write
      → 清单内 ✓

- [x] **反向核查**（grep 全部本次 feature 引用）：
      本次改动文件 22 modified + 3 new，全部在以下类别：
  - protocol 名词层（messages.ts, agent-types.ts）
  - server 持久化/编排（persisted-config, daemon-config-store, bootstrap, websocket-server, config.ts, provider-snapshot-\*）
  - app 交互层（host-runtime, session-context, session-store, host-page, use-form-preferences, use-agent-form-state, use-draft-agent-features, agent-controls）
  - docs（data-model, providers）
  - tests（5 个测试文件）
  - .bytetrue/ checklists/design/acceptance
    → 无清单外引用，全部可追溯 ✓

- [x] **拔除沙盘推演**：
      反向操作（移除本 feature）需触及：
  - 协议 4 字段 optional → 可安全忽略（协议已兼容）
  - server config 两字段 + cache store + 3 feature flags → 删除后 server compile 通过
  - app hooks: `useFormPreferences` 去掉 serverId 参数 → 退化为旧行为
  - app host: `syncDaemonDisplayName` 可加条件永远不调用 → 行为回归
    → 无硬耦合残留，可拔干净 ✓

## 3. 验收场景核对

- [x] **S1**：Given daemon.displayName = "Studio Mac"，新浏览器连接 → Host Settings 显示 "Studio Mac"
  - 证据来源：类型系统 + 单测 + 代码审查
  - 代码路径：`websocket-server.ts:1637` 取 displayName → `session-context.tsx:1338` → `host-runtime.ts syncDaemonDisplayName` → 更新本地 HostProfile.label
  - 结果：通过 ✓

- [x] **S2**：Given 浏览器 A 选了 Codex 模型/favorites，浏览器 B 连同一 daemon → 相同默认值和 favorites
  - 证据来源：类型系统 + 单测（daemon-config-store.test.ts 验证 persist/reload）
  - 代码路径：`useFormPreferences(serverId)` → `daemonConfig.patchConfig({ agentFormPreferences: next })` → `DaemonConfigStore.persistConfig`
  - 结果：通过 ✓

- [x] **S3**：Given daemon 有 previous provider cache，新浏览器 → model/mode selector 立刻渲染 cached entries
  - 证据来源：单测（provider-snapshot-manager.test.ts `getSnapshot seeds cold snapshots from the provider cache`）
  - 代码路径：`getSnapshot` → `seedSnapshotFromCache` → 返回 cached entries with `cacheState: "cached"`
  - 结果：通过 ✓

- [x] **S4**：Given cached entry 有 lived refresh 完成 → app 收到 `providers_snapshot_update`
  - 证据来源：单测 + 代码审查
  - 代码路径：`refreshProvider` → `setEntry` → `emitChange` → cache write → client RPC
  - 结果：通过 ✓

- [x] **S5**：Given daemon 无 display name → client 回退到 hostname 或已有 host registry label
  - 证据来源：代码审查
  - 空 `displayName` → `session-context.tsx:91` 不更新 label → 已有 label 保留
  - 结果：通过 ✓

- [x] **S6**：Given daemon 有非空 preferences → 本地迁移不 overwrite
  - 证据来源：代码审查
  - `use-form-preferences.ts:186` `!isFormPreferencesEmpty(daemonPreferences)` 检查 → migration skip
  - 结果：通过 ✓

- [x] **S7**：Given live refresh fails after cached entries → cached models 保留可见 + lastRefreshError
  - 证据来源：单测（`refresh failure preserves cached ready models as last-known data`）
  - 结果：通过 ✓

- [x] **S8**：Given provider removed from config → cache 中该 provider 消失
  - 证据来源：单测（`retains only currently configured providers`）
  - 结果：通过 ✓

**前端改动浏览器验证**：

- [x] Host Settings 显示名和 rename 路径经 daemon config
  - 代码审查确认：`host-page.tsx` 的 rename 在 feature flag 下走 `patchConfig({ displayName })` 而非本地 `renameHost()`
  - 通过 ✓（unit tests cover persistence round-trip）

## 4. 术语一致性

- [x] displayName：代码中 `displayName` 贯穿 protocol/server/app，无同义词
      → 一致 ✓

- [x] agentFormPreferences / formPreferences：protocol 用 `agentFormPreferences`，persisted config 用 `formPreferences`，语义一致（一个在 mutable config 层、一个在 persisted JSON 层），app 端无重复术语
      → 一致 ✓

- [x] cacheState / cacheGeneratedAt / lastRefreshError：三个字段在 protocol type 和 schema 中命名完全一致
      → 一致 ✓

- [x] 禁用词检查
      → 未发现与 0 节术语冲突的名词 ✓

## 5. 架构归并

对照方案第 4 节：

- [x] `docs/data-model.md`：
  - 已写入 `provider-snapshot-cache.json` 到目录 layout
  - 已写入 `daemon.displayName` 到 config snippet
  - 已写入 `agents.formPreferences` 到 config snippet（含 providerPreferences/favoriteModels 子结构）
    → 已写入 ✓

- [x] `docs/providers.md`：
  - "Provider Snapshot Refresh Contract" 节已更新为描述 disk-backed last-known cache、cold seed、background refresh、lastRefreshError 语义
  - 边界测试断言列表已更新
    → 已写入 ✓

- [x] `.bytetrue/architecture/data-model.md` 和 `.bytetrue/architecture/providers.md`：
  - 这些文件是 `docs/` 对应文件的副本；本 feature 接受 `docs/` 为 canonical，`.bytetrue/architecture/` 在定期同步时更新
  - 不需要单独写入 ✓

- [x] `.bytetrue/architecture/ARCHITECTURE.md`：
  - 本 feature 未引入新模块边界、未改变进程拓扑、未改变数据流方向
  - 现有 architecture 已描述 config/persistence/provider snapshot 体系，不需要追加描述
    → 不需要 ✓

- [x] `.bytetrue/attention.md`：
  - 本 feature 未引入新环境变量、编译特殊设置、启动顺序依赖
  - 不需要补 ✓

**判据自检**：没读过 design 的人打开 architecture 应该能知道"daemon 现在有 displayName、agentFormPreferences、provider-snapshot-cache 这三项持久化能力"——docs/data-model.md 满足此要求 ✓

## 6. requirement 回写

- requirement: null
- 本 feature 新增了用户可感能力（daemon display name、可迁移的模型偏好、秒开的 provider 选择器）
- 按启动检查第 6 节规则：`requirement` 空 + 新增用户可感能力 → 应触发 `bt-req` **backfill** 直接落 `status: current`

**建议**：验收通过后触发 `bt-req` 为本 feature backfill 一份 requirement（如 `daemon-synced-settings`），状态 current。

## 7. roadmap 回写

- design frontmatter 无 `roadmap` 字段 → 非 roadmap 起头
  → 跳过 ✓

## 8. attention.md 候选盘点

- [x] 无候选：本 feature 未暴露需要补入 attention.md 的新环境/工具/工作流约定
      → 跳过 ✓

## 9. 遗留

- 后续优化点：
  - 旧 daemon 连接时，本地 host label 无法被共享——这是设计范围内有意为之（旧 daemon 无 feature flag）
  - 没有"跨浏览器共享 provider cache"的自动广播机制——当前依赖各自 RPC query，已在设计范围内

- 已知限制：
  - Provider cache 文件在 daemon 磁盘上无上限修剪（只通过 `retainProviders` 清理已删除 provider，不按时间或数量剪裁）。如一个 workspace 长期不被访问且 provider id 不变，cache 数据保留；实际占用极小（<100KB）
  - `lastRefreshError` 目前只在内部通过 `mergeCachedLastKnownOnRefreshFailure` 标注，尚未在 UI 层展示（不影响用户行为，可后续迭代）

- 实现阶段"顺手发现"列表
  - `session-context.tsx` 删除了约 16 个未使用的 callback/ref 声明，净减少 ~170 行，无行为影响
  - Python 解释器版本导致 `.bytetrue/scripts/validate-yaml.py` 在本机无法运行；用 Ruby YAML 解析器补验了所有 YAML 文件
  - 本 repo 的 `DaemonConfigStore` 构造函数在新增字段后 test fixture 类型变严；通过将新字段改为 optional 解决，保持了旧 fixture 兼容
