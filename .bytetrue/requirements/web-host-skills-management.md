---
doc_type: requirement
slug: web-host-skills-management
status: current
summary: 浏览器端可对已连接 host 管理 Paseo orchestration skills。
owner: product
related_features: [2026-06-10-web-host-skills-management]
tags: [web, host-settings, skills, daemon]
last_reviewed: 2026-06-10
---

# Web host skills management

## 愿景

当用户在浏览器里连接一台 Paseo host 时，除了现有的 `Enable Paseo tools` 开关，还能直接查看、安装、更新和卸载该 host 上的 Paseo orchestration skills，而不必切回 Electron 桌面端。

这里的目标不是给浏览器增加一套新的 agent 编排能力，而是把“把 Paseo 自带 skills 文件同步到 host 机器上的 `~/.agents` / `~/.claude` / `~/.codex`”这项 host 维护能力暴露到 Web。

## 用户价值

- 作为主要在浏览器里使用 Paseo 的用户，我希望不用切回 Electron 就能把连接 host 上的 orchestration skills 安装好。
- 作为连接多台 host 的用户，我希望对每台 host 单独看到 skills 是否已安装、是否 drift，并直接执行安装/更新/卸载。
- 作为远程使用 relay 的用户，我希望在已经获得普通 daemon operator 权限后，也能管理远端 host 上的 skills，而不是被迫在 host 本机打开桌面 app。

## 范围

### 做

- 在 Web 的 host settings 中显示 host-scoped orchestration skills 管理入口。
- 支持查看当前 host 的 skills 状态：`not-installed` / `up-to-date` / `drift`。
- 支持安装、更新、卸载 Paseo 自带的 managed skills。
- 明确区分它和 `Enable Paseo tools`：前者是 skills 文件同步，后者是 MCP tools 注入。
- 对不支持该能力的 host 显示明确的 unsupported / update-host 信号，而不是静默混淆成空白。

### 不做

- 不把 CLI installer 一起搬到 Web。
- 不修改 `Enable Paseo tools` / `mcp.injectIntoAgents` 的语义或挂载位置。
- 不管理任意第三方自定义 skills；只管理 Paseo 自带的 managed skills 名单。
- 不把“agent 能否使用 MCP tools”与“host 是否已安装 orchestration skills”耦成一个开关。
- 不自动在 clean machine 上静默安装 skills；安装仍然是显式用户动作。

## 验收标准

- 支持该能力的 host 连接到 Web 后，用户能在 host settings 中看到 orchestration skills 的状态和对应动作。
- 对 clean host 点击 Install 后，Paseo 自带 skills 被同步到该 host 的 managed skills 目录，状态变为 `up-to-date`。
- 对 drift host 点击 Update 后，状态回到 `up-to-date`。
- 点击 Uninstall 后，Paseo managed skills 被移除，但不误删无关的用户自定义 skills。
- `Enable Paseo tools` 仍然单独存在，行为不变。
- 旧 host 或不支持 skills source 的 host 不会错误显示可执行按钮。

## Change log

- 2026-06-10: Drafted from the feature request to make orchestration skills management available from Web host settings, distinct from the existing MCP tools toggle.
- 2026-06-10: Accepted implementation. Web host settings now expose a host-scoped orchestration skills card behind `server_info.features.hostSkillsManagement`, using `daemon.skills.*` RPCs to read and mutate the host machine's managed skills state while leaving `Enable Paseo tools` as the separate `mcp.injectIntoAgents` toggle.
