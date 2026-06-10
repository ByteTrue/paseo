---
doc_type: decision
type: architecture
slug: web-lite-preview-vs-electron-webview
status: current
summary: Web BrowserPane 采用 iframe lite preview；Electron BrowserPane 保留完整 webview。
tags: [browser-pane, local-web-preview, electron, web]
last_reviewed: 2026-06-09
---

# Web BrowserPane 使用 lite preview，Electron 保留完整 webview

## 背景

`2026-06-09-local-web-preview` 要让普通 Web 端也能使用 workspace browser tab 入口。Electron 端已有完整 BrowserPane/webview，但普通浏览器无法等价提供 Electron `<webview>` 的隔离、导航和 devtools 能力。

## 决定

Web BrowserPane 使用 iframe-based lite preview，Electron BrowserPane 继续使用完整 webview 实现。两者复用同一个 workspace browser tab store，但渲染能力分层。

## 影响

- Web 端 browser tab 可以预览 `http://` / `https://` service/dev-server URL。
- Web 端遇到 CSP / X-Frame-Options / sandbox 限制时显示 blocked fallback，并提供 Open in new tab。
- Web 端不提供 devtools、CDP、Playwright 控制、截图录制或本地 HTML 文件预览。
- Electron 端 `browser-pane.electron.tsx` 不因 lite preview 降级。

## 约束

- Web lite preview 不绕过目标页面 iframe 安全策略。
- Web iframe sandbox 不同时启用 `allow-scripts` 和 `allow-same-origin`。
- Repository-local HTML preview 必须另起 daemon-backed static preview feature。

## 关联

- `packages/app/src/components/browser-pane.web.tsx`
- `packages/app/src/components/browser-pane.electron.tsx`
- `docs/local-web-preview.md`
