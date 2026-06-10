# web host skills management 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-10
> 关联方案 doc：`.bytetrue/features/2026-06-10-web-host-skills-management/web-host-skills-management-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查。

**接口示例逐项核对**：

- [x] `server_info.features.hostSkillsManagement`：协议 schema 接收可选 flag，WebSocket server 在 skills source 可用时实际发出该字段。
- [x] `daemon.skills.get_status.request/response`：协议 schema、client 请求封装、session response 形状一致。
- [x] `daemon.skills.install.request/response`：协议 schema、client 请求封装、session response 形状一致。
- [x] `daemon.skills.update.request/response`：协议 schema、client 请求封装、session response 形状一致。
- [x] `daemon.skills.uninstall.request/response`：协议 schema、client 请求封装、session response 形状一致。

**名词层“现状 → 变化”逐项核对**：

- [x] `HostSkillsStatus`：继续沿用 `state + ops` 形状，没有为 Web 另起状态模型。
- [x] `SkillsSourceResolution`：server 侧已新增 sync/async 两种 resolver，用于 feature gate 和运行时执行。
- [x] `HostSkillsManagementCard`：已从 `host-page.tsx` 抽成独立组件。

**流程图核对**（第 2.2 节开头 mermaid 图）：

- [x] Browser host settings -> daemon session RPC -> shared skills module -> host filesystem 这条路径在代码中都能找到实际落点。

## 2. 行为与决策核对

对照方案第 1 节 + 第 2.2 节。

**需求摘要逐项验证**：

- [x] 支持型 host 在 Web 的 Host > Agents 中出现 host-scoped orchestration skills 卡片。
- [x] 卡片按 `not-installed` / `up-to-date` / `drift` 状态渲染 Install / Uninstall / Update。
- [x] Install / Update / Uninstall 作用于 daemon 机器上的 `~/.agents/skills`、`~/.claude/skills`、`~/.codex/skills`。
- [x] `Enable Paseo tools` 仍独立存在并保持原义。
- [x] 不支持 skills source 的 host 不会宣称支持该能力，Web 只显示升级提示。

**明确不做逐项核对**：

- [x] 未把 CLI installer 搬到 Web。
- [x] 未改动 `Enable Paseo tools` / `mcp.injectIntoAgents` 的语义和写入路径。
- [x] 未引入任意第三方自定义 skills 管理；执行层仍只针对 Paseo managed skills 名单。

**关键决策落地**：

- [x] skills 管理按普通 daemon operator 能力处理，没有走 localhost-only gate。
- [x] 能力发现通过 `server_info.features.hostSkillsManagement`，没有复用 desktop runtime gate。
- [x] 纯 skills 同步逻辑已搬到 `packages/server/src/server/integrations/skills/`，desktop IPC 只做薄包装。
- [x] daemon 通过 `PASEO_SKILLS_SOURCE_DIR` + fallback resolver 决定是否宣称支持该功能。

**编排层“现状 → 变化”逐项核对**：

- [x] Desktop path 仍保留，但已委托 shared server module。
- [x] Web path 从无能力变成 host-scoped query/mutation + feature gate。
- [x] daemon runtime 现在掌握 skills source 可用性，并用于构造 `server_info.features.hostSkillsManagement`。

**流程级约束核对**：

- [x] `get_status` 幂等；`install` / `update` / `uninstall` 都返回稳定 `SkillsStatus`。
- [x] 托管边界保持在 Paseo managed skills 和 manifest 覆盖文件内，不删无关用户自定义 skills。
- [x] feature 不支持时不 fallback 到 desktop IPC 或其它旧路径。

**挂载点反向核对（可卸载性）**：

- [x] `server_info.features.hostSkillsManagement`
- [x] `daemon.skills.get_status/install/update/uninstall.request/response`
- [x] `HostSkillsManagementCard`
- [x] daemon runtime `PASEO_SKILLS_SOURCE_DIR` / source resolver
- [x] desktop IPC `get_skills_status/install_skills/update_skills/uninstall_skills` 委托 shared module
- [x] grep 反查没有发现清单外的额外挂入点。
- [x] 拔除沙盘推演：去掉上述挂载点后，本 feature 在用户视角会完整消失，不会残留到 `Enable Paseo tools`。

## 3. 验收场景核对

- [x] **S1**：clean host `get_status` 返回 `not-installed`，Install 后收敛为 `up-to-date`
  - 证据来源：`packages/server/src/server/integrations/skills/operations.test.ts`
- [x] **S2**：drift host Update 后回到 `up-to-date`
  - 证据来源：`packages/server/src/server/integrations/skills/operations.test.ts`
- [x] **S3**：Uninstall 只移除 managed skills，不误删无关用户自定义 skills
  - 证据来源：`packages/server/src/server/integrations/skills/operations.test.ts`
- [x] **S4**：client 能发出 `daemon.skills.*` 请求并消费对应 response
  - 证据来源：`packages/client/src/daemon-client.test.ts`
- [x] **S5**：协议 schema 接受 `hostSkillsManagement` feature flag 和 `daemon.skills.*` 消息
  - 证据来源：`packages/protocol/src/messages.test.ts`
- [x] **S6**：Web 不支持型 host 显示升级提示；支持型 host 显示 skills 卡片
  - 证据来源：`packages/app/src/screens/settings/host-skills-management-card.test.tsx`
- [x] **S7**：前端已浏览器验证
  - 证据来源：`npm run test:e2e --workspace=@bytetrue/app -- packages/app/e2e/settings-host-page.spec.ts --grep "host skills management card"`
  - 结果：通过。Playwright 在 `Agents` section 实际看到 `Orchestration skills` 卡片。

## 4. 术语一致性

- `hostSkillsManagement`：协议、server info、Web card 和文档中命名一致。
- `daemon.skills.*`：请求/响应命名符合 `.request` / `.response` 约定，没有混入旧 flat RPC 名。
- `Enable Paseo tools`：仍只指 `mcp.injectIntoAgents`，没有再被用来表示 skills 文件同步。

## 5. 架构归并

- [x] `.bytetrue/architecture/ARCHITECTURE.md`：补入了 host-scoped skills management 能力、`server/integrations/skills/` 模块职责、以及它和 localhost-only `local.os.*` / `local.fs.*` 的权限边界差异。
- [x] `docs/architecture.md`：补入了 `daemon.skills.*` 的 session RPC 角色和 capability gate。
- [x] `docs/development.md`：补入了 `PASEO_SKILLS_SOURCE_DIR` 的运行时约束。
- [x] `docs/api/daemon-skills-management-rpc.md`：新增 API 参考。

## 6. requirement 回写

- [x] `requirement` 指向 draft req：已把 [web-host-skills-management.md](/Users/byte/.paseo/worktrees/2ko6oaim/odd-racoon/.bytetrue/requirements/web-host-skills-management.md:1) 从 `draft` 升到 `current`，保留愿景并追加实现变更日志。
- [x] [VISION.md](/Users/byte/.paseo/worktrees/2ko6oaim/odd-racoon/.bytetrue/requirements/VISION.md:1) 已把该 requirement 从 Draft 移到 Current。

## 7. roadmap 回写

- [x] 非 roadmap 起头。方案 frontmatter 没有 `roadmap` / `roadmap_item`，本节跳过。

## 8. attention.md 候选盘点

- [x] 本 feature 未暴露需要补入 `attention.md` 的新项目硬约束。

## 9. 遗留

- CLI installer 仍是 desktop-only；若要上 Web，需要另开 feature。
- 目前只补了 host 支持路径的 Playwright smoke，没有为“不支持型 host”补真实浏览器 e2e，只在组件测试层覆盖。
- 现有 tracker 未在本轮绑定/更新外部 issue，因为用户没有指定现有 issue id / URL。
