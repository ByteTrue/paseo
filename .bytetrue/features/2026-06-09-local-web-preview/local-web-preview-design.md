---
doc_type: feature-design
feature: 2026-06-09-local-web-preview
status: approved
summary: 在 Web 端提供基于 iframe / service proxy 的 lite webview，用于预览 daemon 本机或 workspace service 的 Web 页面。
related_requirements: [local-web-preview]
tags: [local-daemon, web-preview, service-proxy, browser-tab]
last_reviewed: 2026-06-09
---

# local web preview design

## 0. 设计状态

- 阶段：bt-feat-design approved
- 入口：P2 / lite webview / local web preview
- 用户已确认 scope；本文件将作为实现和验收的唯一输入。
- 用户已确认：接受 iframe + timeout blocked fallback；同意不做完整 webview/devtools/CDP 自动化。
- 用户修正：仓库内 HTML 文件预览暂不放进首版，后续单独做 daemon-backed static preview。

## 1. 需求摘要

Paseo Electron 当前有完整 browser tab / webview 能力；普通 Web 端的 `BrowserPane` 只是 desktop-only 占位，并且 `New browser tab` / service link 的 in-app browser 入口被 Electron gate 挡住。

P2 要让 Web 端拥有 Electron 当前已有的 browser tab 入口，但能力降级为 lite preview：优先 iframe 内嵌，不能内嵌时给出明确 blocked state，并提供 Open in new tab。

## 2. 名词层

| 名词                             | 含义                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Lite webview / Local web preview | Web 端的轻量预览面板，用 iframe + fallback 操作承载 URL。                                                    |
| Preview URL                      | 用户要预览的 `http://` / `https://` URL。来源可以是 workspace service proxy，也可以是用户手动输入。          |
| Workspace service URL            | `WorkspaceScriptPayload` 中的 `localProxyUrl` / `publicProxyUrl` / `proxyUrl`。                              |
| Browser tab                      | 现有 workspace browser tab store 中的 tab target。Electron 里对应完整 webview；Web 里 P2 对应 lite preview。 |
| Blocked state                    | iframe 无法加载或目标不适合内嵌时显示的状态，包含原因、Open in new tab、Copy URL。                           |
| Static HTML preview              | 后续能力：daemon 把 workspace 内 HTML 文件转换为受限 HTTP preview URL；不进 P2 首版。                        |

## 3. 现状核对

### 3.1 已有 service proxy

`docs/service-proxy.md` 描述了现有 proxy：workspace service script 会被注册为 `<script>--<branch>--<project>.localhost`，并根据连接方式暴露 local/public URL。

源码现状：

- `packages/server/src/server/service-proxy.ts`：service proxy route store / middleware / upgrade handler。
- `packages/protocol/src/messages.ts`：`WorkspaceScriptPayload` 已包含 `localProxyUrl`、`publicProxyUrl`、`proxyUrl`。
- `packages/app/src/utils/workspace-script-links.ts`：已根据 active connection 选择可打开 URL。
- `packages/app/src/screens/workspace/workspace-scripts-button.tsx`：running service 已展示 host links，并支持 `onOpenUrlInBrowserTab`。

### 3.2 已有 browser tab store / entry points

- `packages/app/src/stores/browser-store/index.ts` 提供 `createWorkspaceBrowser({ initialUrl })`、URL normalization 和 browser records。
- `packages/app/src/screens/workspace/workspace-screen.tsx` 已有 `handleCreateBrowserTab()`，但 `showCreateBrowserTab = getIsElectron()`。
- `packages/app/src/screens/workspace/workspace-screen.tsx` 已有 `handleOpenUrlInBrowserTab(url)`，但当前会在非 Electron 下直接 return。
- `packages/app/src/components/browser-pane.electron.tsx` 是完整 Electron webview。
- `packages/app/src/components/browser-pane.web.tsx` 当前只显示 “Browser is desktop-only”。

## 4. 设计方案

### 4.1 复用现有 browser tab store

P2 不新增 preview tab store。Web 端继续使用现有 browser tab target：

- workspace scripts 的 Open in browser tab 继续调用 `createWorkspaceBrowser({ initialUrl })`。
- 手动 URL 入口也创建同样的 browser tab。
- Electron pane 继续用 `browser-pane.electron.tsx`。
- Web pane 将 `browser-pane.web.tsx` 从占位升级为 lite preview。

理由：browser tab 是现有导航模型的一部分，复用它可以避免新增 tab 类型、路由和 persistence 逻辑。

### 4.2 Web 端入口 parity

P2 要让 Web 至少拥有 Electron 当前已经暴露的 browser 入口：

- `New browser tab` 在 Web 端显示，并创建 lite preview browser tab。
- Running service host link 的 “Open in browser tab” 在 Web 端可用。
- `handleOpenUrlInBrowserTab(url)` 不再用 `getIsElectron()` 作为唯一 gate；Web 端进入 lite preview。
- Electron 端仍进入完整 webview。

### 4.3 Web 端 BrowserPane UI

`browser-pane.web.tsx` 变为：

- 顶部地址栏：当前 URL、刷新、复制、Open in new tab。
- 主区域 iframe：`src` 指向 normalized preview URL。
- 初始空状态：提示输入 URL 或从 running service 打开。
- Blocked state：iframe onLoad/onError 或 sandbox/timeout 检测失败时显示。
- URL 输入限制：只允许 `http:` / `https:`，保留 `about:blank` 作为空状态。

### 4.4 Workspace service 入口

`workspace-scripts-button.tsx` 已经有 `onOpenUrlInBrowserTab`，P2 需要保证：

- running service 的 host link 优先使用 `resolveWorkspaceScriptLink()` 的 `openUrl`。
- 对 relay 优先 public URL；对 loopback direct 优先 local proxy URL。
- 若没有 openUrl，只显示 label，不提供 preview action。

### 4.5 手动 URL 入口

在 Web 端 BrowserPane 空状态和地址栏中允许手动输入 URL。

首版只接受 URL，不做本地文件路径输入。仓库内 HTML 文件预览后续单独做，因为它需要 daemon-backed static preview URL，而不是 `file://`。

### 4.6 iframe blocked 判断

iframe 没有可靠跨浏览器方式读取 CSP/X-Frame-Options 失败细节，首版用保守 UX：

- 加载中显示 spinner。
- 超过短 timeout 仍未 onLoad 时显示 “This page may not allow embedded preview”。
- onLoad 后仍保留 Open in new tab。
- 后续可以通过 sandbox / postMessage handshake 增强判断，但不进首版。

## 5. 安全与边界

- Lite preview 不绕过目标页面的 iframe / CSP 限制。
- 不注入脚本、不读取 iframe DOM、不做元素选择器。
- 不改变 service proxy 对 public service URL 的暴露规则。
- 目标 URL 必须是 `http:` / `https:`；不支持 `file:`、`javascript:`、自定义 scheme。
- 仓库内 HTML 文件预览不进首版；后续 feature 必须把文件限定在 workspace/repository 内并通过 daemon 生成 HTTP preview URL。
- Electron 完整 webview 不受本 feature 改动。

## 6. 推进步骤（draft）

1. **RED: Browser entry parity tests**
   - 覆盖 Web 端显示 New browser tab；running service Open in browser tab 能创建 browser tab。

2. **RED: browser-pane.web tests**
   - 覆盖空状态、URL 输入、iframe src、blocked fallback、Open in new tab。

3. **GREEN: Web browser entry parity**
   - 放开 Web 端 browser tab 入口，移除非 Electron return gate。

4. **GREEN: Web BrowserPane lite preview**
   - 将 `browser-pane.web.tsx` 从占位升级为 iframe preview UI。

5. **REFACTOR: URL/state helpers**
   - 抽出 URL validation / iframe state helper，降低组件复杂度。

6. **E2E: browser local preview smoke**
   - 用现有 e2e service/proxy 或测试页面验证 Web 端能显示 iframe preview / fallback。

7. **Docs/checks**
   - 更新 docs / requirement / acceptance，跑 targeted tests、typecheck、lint。

## 7. 验收标准

- Web 端 New browser tab 入口可见并能创建 lite preview tab。
- Running service 的 Open in browser tab 在 Web 端可用。
- Web 端 Browser tab 显示 lite preview UI，而不是 desktop-only 占位。
- 手动输入 `http://` / `https://` URL 后 iframe src 更新。
- 被 iframe 限制的页面显示 blocked state + Open in new tab。
- Electron BrowserPane 完整 webview 行为保持不变。
- 测试、typecheck、lint 通过。

## 8. 明确不做

- 不实现完整 Electron webview 等价能力。
- 不实现 devtools、CDP、Playwright 控制、截图、录制。
- 不实现本地文件 `file://` 预览。
- 不实现仓库内 HTML 文件预览；该能力后续单独做 daemon-backed static preview。
- 不新增 service proxy 路由模型。
- 不修改 daemon auth / public service URL 暴露规则。

## 9. 状态收口

开放问题已按用户反馈收敛：仓库内 HTML 文件预览后置；P2 首版只做 HTTP/service URL 的 Web lite preview 与入口 parity。

本设计已 approved，checklist 已执行完成，当前进入 bt-feat-accept。
