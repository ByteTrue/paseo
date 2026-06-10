---
doc_type: requirement
slug: local-web-preview
status: current
summary: 浏览器端能够快速预览 daemon 本机的 dev server 或 workspace service。
owner: product
related_features: [2026-06-09-local-web-preview]
tags: [local-daemon, web-preview, lite-webview, service-proxy]
last_reviewed: 2026-06-09
---

# Local web preview

## 愿景

当用户在浏览器端连接一台本机或远程 daemon 时，可以在 Paseo 工作区里快速查看 daemon 机器上正在运行的 Web 服务或本地开发服务器，而不必离开当前工作流。

这不是 Electron 完整 `<webview>` 的替代品，而是一个轻量预览面板：优先复用现有 service proxy / script link，让用户能快速看到页面效果；如果页面不能被 iframe 嵌入，则提供清晰的 blocked state 和新标签页打开入口。

仓库内 HTML 文件预览暂不放进首版。它需要 daemon 提供受限静态文件预览 URL，后续单独设计。

## 用户价值

- 前端开发时，用户能从 workspace script 或手动 URL 直接打开 dev server 预览。
- 远程/relay 使用时，只要 service proxy/public URL 可用，也能从浏览器看到 daemon 侧服务。
- Web 端拥有 Electron 当前已有的 browser tab 入口，但能力降级为 lite preview。
- 与 Electron 完整 browser tab 分层：普通 browser 提供 lite preview，Electron 继续提供完整 webview 能力。

## 范围

### 做

- 在 Web 端 browser pane 中提供 iframe-based lite preview。
- 支持从 workspace running service 的 `localProxyUrl` / `publicProxyUrl` / `proxyUrl` 打开预览。
- 支持手动输入 `http://` / `https://` URL。
- Web 端开放 Electron 当前已有的 browser tab 入口，包括 New browser tab 和 running service 的 Open in browser tab。
- iframe 被 CSP / X-Frame-Options 阻断时显示 blocked state，并提供 Open in new tab。
- 支持刷新、复制 URL、回到地址栏编辑。

### 不做

- 不做 Electron `<webview>` 等价功能。
- 不做 devtools、CDP、Playwright browser automation、截图/录制。
- 不支持仓库内 HTML 文件预览；后续单独做 daemon-backed static preview。
- 不支持任意本机路径或 `file://` URL。
- 不承诺任意第三方站点都能内嵌。
- 不改变 service proxy 的路由模型或认证模型。

## 验收标准

- Web 端创建 Browser tab 后，不再只显示 desktop-only 占位，而是能显示 lite preview UI。
- Web 端显示 New browser tab 入口，且 running service 的 Open in browser tab 入口可用。
- 手动输入 `http://` / `https://` URL 后 iframe src 更新。
- iframe 加载成功时显示页面；加载失败/被阻断时显示 blocked state + Open in new tab。
- Electron 端 browser pane 行为保持不变。
- 相关 tests、typecheck、lint 通过。

## Change log

- 2026-06-09: Drafted as P2 after browser-localhost desktop actions reached acceptance.
- 2026-06-09: Confirmed repository-local HTML preview is deferred to a later daemon-backed static preview feature.
- 2026-06-09: Accepted P2 implementation with Web lite preview, service URL entry parity, and repository HTML preview deferred.
