---
doc_type: learning
type: pitfall
slug: lite-webview-html-preview-scope
status: current
summary: 仓库内 HTML 文件预览会把 lite webview 扩成 daemon 静态文件服务，应该拆成后续 feature。
tags: [local-web-preview, scope, daemon-static-preview]
last_reviewed: 2026-06-09
---

# Lite webview 不要顺手塞本地 HTML 文件预览

## 触发场景

在 `2026-06-09-local-web-preview` 设计阶段，用户提出希望预览仓库里的本地 HTML 文件。最初看起来只是给 Web BrowserPane 多支持一种 URL，但继续拆解后发现它不是 `file://` 支持那么简单。

## 结论

仓库内 HTML 文件预览应该单独做 daemon-backed static preview feature，不应塞进 Web lite preview 首版。

## 原因

- 普通浏览器不能安全地把 daemon 机器上的本地文件路径直接 iframe 成 `file://`。
- 要让 HTML 及其相对资源正常加载，daemon 需要生成受限 HTTP preview URL，并把文件访问限制在 workspace/repository 内。
- 还需要处理 MIME、path traversal、防止任意目录泄露、临时 token/route 生命周期、远程/relay 访问形态。
- 这些都超出了 “HTTP/service URL iframe lite preview” 的边界。

## 推荐做法

- P2 lite webview 只做 `http://` / `https://` service URL preview。
- Repository-local HTML preview 后续单独起 feature/design。
- 在 design 的“不做”中明确写出 deferred scope，避免实现阶段顺手扩大。

## 关联

- `.bytetrue/features/2026-06-09-local-web-preview/local-web-preview-design.md`
- `.bytetrue/requirements/local-web-preview.md`
- `docs/local-web-preview.md`
