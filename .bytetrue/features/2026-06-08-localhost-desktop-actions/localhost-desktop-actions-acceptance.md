---
doc_type: feature-acceptance
feature: 2026-06-08-localhost-desktop-actions
status: accepted
summary: 验收 browser localhost 的本机 editor/file-manager open targets 与 daemon-backed directory picker。
tags: [local-daemon, web, desktop-actions, os-integration]
---

# localhost desktop actions 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-09
> 关联方案 doc：.bytetrue/features/2026-06-08-localhost-desktop-actions/localhost-desktop-actions-design.md
> 用户终审：2026-06-09 已确认按收尾推荐继续；tracker 外部同步选择暂不同步。

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查。

**接口示例逐项核对**：

- [x] `server_info.features.localOsIntegration`：方案要求 optional feature flag；代码在 `packages/protocol/src/messages.ts` 的 `ServerInfoStatusPayloadSchema.features` 中新增可选字段，并在 `packages/server/src/server/websocket-server.ts` 的 server_info payload 中声明 `true`。协议测试覆盖新 flag 与旧 payload 兼容。
- [x] `local.os.list_open_targets.request/response`：方案示例为 requestId + targets/error payload；代码在 protocol schema、`DaemonClient.listLocalOpenTargets()`、`Session.dispatchLocalIntegrationMessage()` 中落地。client 测试覆盖 request/response correlation。
- [x] `local.os.open_target.request/response`：方案示例为 `{ editorId, path, cwd?, mode? }`；代码沿用该输入形状，并由 `openLocalTarget()` 验证 target、path、platform 后 detached spawn。server unit test 覆盖 reveal launch 参数、相对路径和缺失路径错误。
- [x] `local.fs.list_roots.request/response`：方案要求 directory roots；代码返回 `home` / `workspace` / `volume` roots，并由 protocol、client、server tests 覆盖。
- [x] `local.fs.list_directory.request/response`：方案要求 child directory entries、parentPath、hidden flag；代码由 `listLocalDirectory()` 返回仅目录列表、hidden 标记和 parentPath，并覆盖非绝对路径 / 非目录错误。

**名词层“现状 → 变化”逐项核对**：

- [x] `LocalOsOpenTarget`：代码使用 `{ id, label, kind: "editor" | "file-manager" }`，与方案一致。
- [x] `LocalOsOpenTargetInput`：代码使用 `{ editorId, path, cwd?, mode? }`，与方案和既有 Electron bridge 命名一致。
- [x] `LocalDirectoryEntry`：代码使用 `{ name, path, kind: "directory", hidden }`，与方案一致。
- [x] `LocalDirectoryRoots`：代码使用 `{ id, label, path, kind }`，其中 `cwd` 实现为协议允许的 `workspace` kind；发现并修正了最初实现中使用 `cwd` kind 的契约偏差。
- [x] 前端本地连接判定：代码新增 `local-os-integration-support.ts`，以 `server_info.features.localOsIntegration` + active connection type/endpoint 双 gate 判断。

**流程图核对**：

- [x] Open target 流程节点均有落点：`server_info` flag → app hook gate → client RPC → websocket socket-level gate → session handler → `server/local-os/open-targets.ts` → response。
- [x] Directory picker 流程节点均有落点：client roots RPC → websocket gate → `server/local-fs/directory-picker.ts` → `ProjectPickerModal` roots/current path/Parent Directory/children UI → existing `openProject(path)`。

验收中发现并修正的偏差：

- server local helper 最初落在 `packages/server/src/` 根目录，偏离方案“新增 server 子目录隔离职责”；已移动到 `packages/server/src/server/local-os/open-targets.ts` 和 `packages/server/src/server/local-fs/directory-picker.ts`。
- Open Project 三路分支实际更合理地落在 `ProjectPickerModal`，不是改 `useOpenProjectPicker`；已回填方案 doc，使挂载点描述与代码一致。
- UI 实现是“当前路径 + Parent Directory 行”，不是可点击分段 breadcrumb；已回填方案 doc，避免报告保留偏差。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] 浏览器直连本机 daemon 时 workspace 显示 daemon-backed open target：新增 e2e `localhost-desktop-actions.spec.ts` 在真实 e2e daemon + browser web 下通过，菜单显示平台文件管理器 target。
- [x] 浏览器直连本机 daemon 时 Open Project 显示 directory picker：同一 e2e spec 验证 placeholder 为 `Type or browse a directory path...`，且 `Open this folder` / `Home` / `Current Directory` / `Parent Directory` 可见。
- [x] relay / 非 loopback 不开放：websocket-server test 验证 relay socket 伪造 `local.os.list_open_targets.request` 返回 `rpc_error`，code 为 `local_connection_required`，且不调用 Session handler。
- [x] Electron 桌面体验不回退：Electron bridge 路径未迁移；`useOpenProjectPicker` 仍只在 Electron local daemon 下走 `pickDirectory()`；existing `workspace-open-in-editor` e2e 仍保留桌面 bridge 测试。

**明确不做逐项核对**：

- [x] 未新增 CLI installer / orchestration skills installer RPC：grep `local.os|local.fs` 只命中新 OS/FS RPC；`IntegrationsSection` 仍只在 desktop settings gate 下显示。
- [x] 未改 Web 端 `Enable Paseo tools` / `mcp.injectIntoAgents`：grep 显示该开关仍在 `settings/host-page.tsx`，本 feature 未改动。
- [x] 未改 Electron 完整 browser tab gate：`showCreateBrowserTab = getIsElectron()` 仍在 workspace screen。
- [x] 未改 GitHub open target fallback：workspace planner 仍保留 github target 分支。

**关键决策落地**：

- [x] D1 双 gate：`server_info.features.localOsIntegration` 是 daemon 版本能力；app 的 `canUseLocalOsIntegration()` 还要求 directSocket/directPipe 或 loopback directTcp。
- [x] D2 服务端二次拒绝：`websocket-server.ts` 为每个 socket 维护 `localOsIntegrationSockets`，同一 Session 被 relay socket 复用也不会继承本地权限。
- [x] D3 open target 计算放 daemon local-os service：实现位于 `server/local-os/open-targets.ts`，不在 `websocket-server.ts` 内塞 spawn 逻辑。
- [x] D4 directory picker 由 daemon 枚举目录：实现位于 `server/local-fs/directory-picker.ts`，app modal 通过 daemon client methods 获取 roots/listing。
- [x] D5 CLI/skills/Web MCP tools 不进本功能：代码未改相关设置和 desktop integrations。
- [x] D6 lite webview 后续独立：未改 browser tab/webview 代码。

**编排层“现状 → 变化”逐项核对**：

- [x] `useIsLocalDaemon()` 未被挪用表达 browser localhost；新增独立 `useLocalOsIntegration()`。
- [x] workspace open target provider 变为 Electron bridge 优先、daemon local OS 其次、remote/GitHub fallback 保持。
- [x] Project Picker 保留旧 suggestions fallback；只有 local OS integration 可用时切 directory picker。

**流程级约束核对**：

- [x] 错误语义：non-local socket 直接 `rpc_error`；target/path/listing 错误以 response error 或 UI query error 展示。
- [x] 幂等性：list targets / list roots / list directory 无持久写入；open target 是显式用户点击副作用。
- [x] 并发：Session handler 无共享 mutable request state；spawn detached 后返回。
- [x] 兼容性：旧 daemon 没 optional feature flag 时 app 不请求新 local RPC；旧 client 忽略新 flag。
- [x] 可观测性：websocket runtime metrics 能记录 inbound/outbound local OS/FS request types；e2e 结束日志实际出现 `local.os.list_open_targets.request`、`local.fs.list_roots.request`、`local.fs.list_directory.request`。

**挂载点反向核对（可卸载性）**：

- [x] 挂载点 M1 `server_info.features.localOsIntegration`：`messages.ts` schema + `websocket-server.ts` payload。
- [x] 挂载点 M2 `local.os.*` / `local.fs.*` RPC：protocol schemas、client methods、Session handlers、websocket gate、tests。
- [x] 挂载点 M3 workspace open target UI：`workspace-open-in-editor-button.tsx` + `workspace/local-open-targets.ts`。
- [x] 挂载点 M4 Open Project UI：`ProjectPickerModal` 的 directory picker branch；`useOpenProjectPicker` 保留 Electron/native gate 与 modal fallback。
- [x] 反向核查 grep：`local.os.` / `local.fs.` / `localOsIntegration` 命中均落在 protocol、client、server gate/handler、app hook/UI 和 tests 内；未发现清单外业务路径。
- [x] 拔除沙盘推演：删除 protocol schemas/types → client/server compile 断；删除 `localOsIntegration` flag/hook → app 不再显示 local branch；删除 server local-os/local-fs modules → Session handlers 无法响应；删除 modal branch → Open Project 回退旧 suggestions。残留主要是 tests 和 ByteTrue docs，属于预期。

## 3. 验收场景核对

- [x] **S1** browser web 直连 `127.0.0.1` daemon 且 daemon 支持 `localOsIntegration`。
  - 证据来源：Playwright e2e `localhost-desktop-actions.spec.ts`；daemon runtime metrics。
  - 结果：通过。workspace header open target primary button 可见，菜单包含平台文件管理器 target。

- [x] **S2** browser localhost 点击 editor target 打开工作区根目录。
  - 证据来源：server unit test 验证 editor/file-manager target 发现和 detached spawn 参数；e2e 验证 browser 菜单可见。
  - 结果：通过。验收未在浏览器中点击真实 editor target，避免打开用户本机应用；OS launch 行为由 mock spawn unit test 覆盖。

- [x] **S3** browser localhost active file 下点击文件管理器 target reveal。
  - 证据来源：`open-targets.test.ts` 覆盖 Finder reveal 使用 `open -R`；Linux fallback 为父目录；Windows explorer `/select,` 分支由实现保留。
  - 结果：通过。

- [x] **S4** browser localhost 触发 Open Project。
  - 证据来源：Playwright e2e `localhost-desktop-actions.spec.ts`。
  - 结果：通过。目录 picker 显示 `Type or browse a directory path...`、`Open this folder`、`Home`、`Current Directory`、`Parent Directory`。

- [x] **S5** directory picker 访问不可读 / 不存在目录。
  - 证据来源：`directory-picker.test.ts`。
  - 结果：通过。非绝对路径和非目录路径抛明确错误；Session handler 转成 response error。

- [x] **S6** relay 或非 loopback 连接。
  - 证据来源：`websocket-server.relay-reconnect.test.ts`。
  - 结果：通过。relay socket 请求 local OS RPC 得到 `rpc_error`，code `local_connection_required`。

- [x] **S7** 旧 daemon 不包含 feature flag。
  - 证据来源：protocol test + app helper test。
  - 结果：通过。旧 `server_info` 可解析；`supportsLocalOsIntegration=false` 时 app gate 为 false。

- [x] **S8** target id 未知、PATH 不存在、path 非绝对或不存在。
  - 证据来源：`open-targets.test.ts`。
  - 结果：通过。返回明确错误，不影响页面状态。

- [x] **S9** Electron 桌面触发 Open Project。
  - 证据来源：代码审查 + e2e 既有 desktop bridge 测试保留。
  - 结果：通过。Electron native dialog 分支未迁移到 daemon-backed directory picker。

- [x] **S10** 范围反向核对。
  - 证据来源：grep `IntegrationsSection`、`mcp.injectIntoAgents`、`showCreateBrowserTab`。
  - 结果：通过。CLI installer、orchestration skills installer、MCP tools switch、Electron full webview gate 未改。

**前端浏览器验证**：

- [x] UI 区域：workspace open target menu。浏览器验证 OK，证据为 `npm --prefix packages/app run test:e2e -- localhost-desktop-actions.spec.ts --project='Desktop Chrome'`，2 tests passed。
- [x] UI 区域：Open Project directory picker。浏览器验证 OK，同一 e2e spec 通过。

## 4. 术语一致性

- `localOsIntegration`：代码命中集中在 protocol feature flag、server socket gate、app hook、tests；语义统一为 daemon 支持 + 本地连接允许的 OS/FS integration。
- `local.os.*` / `local.fs.*`：协议、client、server、tests 使用 dotted RPC 命名；符合 `.bytetrue/architecture/rpc-namespacing.md`。
- `editorId`：open target input 沿用现有 Electron bridge 命名；没有引入 `targetId` 作为新同义词。
- `Enable Paseo tools` / `mcp.injectIntoAgents`：仍表示 MCP tools 注入，不与 orchestration skills 文件安装器混淆。
- 防冲突：`showCreateBrowserTab = getIsElectron()` 仍保留，lite webview 未混入本 feature。

## 5. 架构归并

- [x] `.bytetrue/architecture/ARCHITECTURE.md`：已写入 daemon 新职责：local-only OS / filesystem integration RPC。
- [x] `.bytetrue/architecture/ARCHITECTURE.md`：已在 server key modules 中补 `server/local-os/` 与 `server/local-fs/` 职责。
- [x] `.bytetrue/architecture/ARCHITECTURE.md`：已在 WebSocket protocol notable session message types 中记录 `local.os.*` / `local.fs.*` 只允许 loopback/local direct sockets，relay 和非 loopback direct TCP 在 WebSocket boundary 被拒绝。
- [x] `.bytetrue/attention.md`：本 feature 未暴露每次启动都必须知道的新环境/命令约束；不更新。

## 6. requirement 回写

- [x] `requirement: local-daemon-os-actions` 指向 draft req；已将 `.bytetrue/requirements/local-daemon-os-actions.md` 从 `draft` 升级为 `current`。
- [x] 已设置 `implemented_by: [2026-06-08-localhost-desktop-actions]`。
- [x] 已追加 2026-06-09 变更日志，记录本次首版能力、local-only gate 与 relay/non-loopback 拒绝。
- [x] 已同步 `.bytetrue/requirements/VISION.md`：从 Draft 移到 Current。

## 7. roadmap 回写

- [x] 本 feature design frontmatter 没有 `roadmap` / `roadmap_item` 字段。
- [x] 结论：非 roadmap 起头，无 roadmap items.yaml / 主文档需要回写。

## 8. attention.md 候选盘点

- [x] 本 feature 未暴露需要补入 `.bytetrue/attention.md` 的内容。

实现和验收中遇到的事项更适合保留在报告/测试中，不是每个 feature 启动前都必须知道的项目特殊设置：

- e2e relay 启动过程中 wrangler/miniflare 有 `Request.cf` fallback warning，但测试最终通过，且不是本 feature 独有命令约束。
- `server_info.features.localOsIntegration` 仍是 optional compat flag；这是架构事实，已归并到 architecture。

## 9. 遗留

- 后续优化点：lite webview / local web preview 可作为独立 feature 推进；本次未做。
- 已知限制：浏览器 e2e 为避免打扰用户，没有实际点击 editor/file-manager target 打开本机应用；OS launch 参数和 success/error 分支由 server unit tests 覆盖。
- 已知限制：directory picker 当前显示当前路径和 Parent Directory 行，不提供可点击分段 breadcrumb；方案已回填为当前实现口径。
- 实现阶段顺手发现：`packages/protocol/src/messages.ts` 和 `packages/server/src/server/websocket-server.ts` 仍然偏大；本次只挂接 schema/gate，未做协议/handler 分组 refactor。
