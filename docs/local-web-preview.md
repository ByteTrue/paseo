---
doc_type: user-guide
slug: local-web-preview
component: local-web-preview
status: current
summary: How browser clients use Paseo lite web preview for service and HTTP URLs.
tags: [web, browser-tab, service-proxy, lite-webview]
last_reviewed: 2026-06-09
---

# Local web preview

## 功能简介

Paseo Web can open browser tabs inside a workspace as a lite preview. The Web version uses an iframe-based preview with clear fallback controls, while the Electron desktop app keeps its full built-in webview.

Use local web preview for:

- Viewing a workspace service URL exposed through Paseo service proxy.
- Opening a dev server URL such as `http://localhost:3000`.
- Quickly checking a page without leaving the workspace.

Repository-local HTML file preview is not part of this feature. It requires a separate daemon-backed static preview service so local files can be exposed safely as HTTP URLs.

## 如何使用

1. Open a workspace in Paseo Web.
2. Open the workspace actions menu and choose **New browser tab**.
3. Enter an `http://` or `https://` URL in the address bar and press **Go**.
4. Use **Refresh**, **Copy URL**, or **Open in new tab** as needed.

Running workspace services can also open their service URL in a browser tab when the service exposes a proxy URL.

## 嵌入限制

Some pages disallow iframe embedding through CSP or X-Frame-Options. When that happens, Paseo shows a blocked preview state and keeps **Open in new tab** available so the same URL can be inspected in the browser directly.

Lite preview does not bypass page security policy, inject scripts, read the iframe DOM, or provide devtools.

## 与 Electron Browser 的区别

- Web: iframe-based lite preview, suitable for service URLs and HTTP dev servers.
- Electron: complete browser pane/webview implementation.

## 相关功能

- [Service proxy](service-proxy.md)
- [Architecture](architecture.md)
- [Local daemon actions](local-daemon-actions.md)
