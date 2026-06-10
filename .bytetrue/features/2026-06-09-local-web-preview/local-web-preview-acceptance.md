---
doc_type: feature-acceptance
feature: 2026-06-09-local-web-preview
status: accepted
summary: Web now has lite browser preview tabs for HTTP/service URLs while Electron keeps its full webview.
tags: [local-web-preview, browser-tab, service-proxy, lite-webview]
last_reviewed: 2026-06-09
---

# local web preview acceptance

## 1. 接口契约核对

通过。

P2 没有新增 daemon RPC 或 service proxy 路由。实现复用现有 workspace browser tab store 和 service URL resolution：

- `packages/app/src/stores/browser-store/state.ts`：browser tab 默认 URL 从 `https://example.com` 调整为 `about:blank`，匹配 Web lite preview 空状态。
- `packages/app/src/screens/workspace/workspace-browser-support.ts`：新增 Web/Electron browser tab availability gate。
- `packages/app/src/screens/workspace/workspace-screen.tsx`：`New browser tab` 和 `handleOpenUrlInBrowserTab(url)` 不再只被 Electron gate 控制。
- `packages/app/src/utils/open-service-url.ts`：Web 端有 `openInApp` callback 时直接进入 in-app preview；Electron 端仍保留原 service URL behavior / dialog 流程。
- `packages/app/src/components/browser-pane.web.tsx`：Web BrowserPane 从 desktop-only 占位变为 iframe lite preview。

设计中明确不新增 `file://` / repository HTML preview；实现保持一致。

## 2. 行为决策核对

通过。

- Web 端获得 Electron 已有 browser-tab 入口 parity：`New browser tab` 与 running service link 都能创建 workspace browser tab。
- Web BrowserPane 只支持 `http:` / `https:` iframe preview，`about:blank` 是空状态。
- unsupported scheme 显示 `Unsupported preview URL`。
- iframe 长时间未 load 会显示 blocked fallback，并保留 `Open in new tab`。
- sandbox 使用 `allow-forms allow-modals allow-popups allow-scripts`，不使用 `allow-same-origin`，避免 invalid sandbox 组合。
- Electron BrowserPane 文件没有改动，完整 webview 行为保留。

## 3. 场景验收

通过。

| 场景                                     | 结果 | 证据                                                                   |
| ---------------------------------------- | ---- | ---------------------------------------------------------------------- |
| Web 显示 New browser tab 入口            | 通过 | `workspace-browser-support.test.ts` + `local-web-preview.spec.ts`      |
| Web service link 可打开 browser tab      | 通过 | `workspace-scripts-button.test.tsx`                                    |
| Web BrowserPane 不再是 desktop-only 占位 | 通过 | `browser-pane.web.test.tsx` + e2e                                      |
| 空 browser tab 显示 URL entry 状态       | 通过 | `browser-pane.web.test.tsx`; default `about:blank`                     |
| `http/https` URL 渲染 iframe             | 通过 | `browser-pane.web.test.tsx`                                            |
| unsupported scheme 被拒绝                | 通过 | `browser-pane.web.test.tsx` 覆盖 `file://`                             |
| timeout blocked fallback                 | 通过 | `browser-pane.web.test.tsx` fake timer                                 |
| Electron 完整 webview 保持               | 通过 | 未改 `browser-pane.electron.tsx`; availability helper 测 Electron=true |
| 仓库 HTML 预览不进首版                   | 通过 | requirement/design/docs 明确 deferred                                  |

## 4. 术语一致性核对

通过。

统一术语：

- `Lite webview` / `Local web preview`：Web 端 iframe-based preview。
- `Browser tab`：现有 workspace browser tab store target。
- `Static HTML preview`：后续能力，不在 P2 首版。
- `Blocked state`：iframe timeout / 不适合嵌入时显示的 fallback。

代码命名与文档命名一致：`workspace-browser-support.ts`、`browser-pane.web.tsx`、`local-web-preview.md`。

## 5. 架构文档核对

通过。

已更新：

- `docs/architecture.md`：说明 Web/Electron 共享 browser store；Electron 完整 webview，Web lite preview。
- `docs/local-web-preview.md`：新增用户指南。
- `docs/local-daemon-actions.md`：补充相关功能链接。

## 6. Requirement 核对

通过。

已更新：

- `.bytetrue/requirements/local-web-preview.md`：`status: current`，补充 acceptance changelog。
- `.bytetrue/requirements/VISION.md`：`local-web-preview` 从 Draft 移到 Current。

## 7. Roadmap / Tracker 核对

不需要 roadmap。

P2 scope 是单个 feature：Web lite preview + entry parity。仓库 HTML static preview 被明确后置，未来若要做，应作为单独 feature 或 roadmap item。

外部 tracker 本阶段未同步；等待用户终审后再按 tracker 流程决定是否创建/绑定 issue。

## 8. Attention 候选

无。

没有新增每次启动 ByteTrue 技能都必须知道的项目硬约束。`file://` / repository HTML deferred 已写在 requirement/design/docs 中，不需要放入 attention。

## 9. 验证证据

已通过：

- `npx vitest run packages/app/src/components/browser-pane.web.test.tsx packages/app/src/stores/browser-store/state.test.ts packages/app/src/utils/open-service-url.test.ts packages/app/src/screens/workspace/workspace-browser-support.test.ts packages/app/src/screens/workspace/workspace-scripts-button.test.tsx --bail=1`
- `npm run build:client`
- `npm run typecheck`
- `npm --workspace-root run lint`
- `npm run format:check`
- `git diff --check`
- `npm --prefix packages/app run test:e2e -- local-web-preview.spec.ts --project='Desktop Chrome'`

LSP diagnostics 仅剩 `workspace-screen.tsx` 中 3 个既有 unused hint：`_insets`、`_pinnedAgentIds`、`_hiddenAgentIds`。它们不是本 feature 新增问题。

## 10. 用户终审

状态：accepted。

用户已确认按照推荐完成 ByteTrue 收尾项；tracker 不做外部同步，guide 已完成，libdoc/attention 按推荐跳过，随后进行 scoped commit。
