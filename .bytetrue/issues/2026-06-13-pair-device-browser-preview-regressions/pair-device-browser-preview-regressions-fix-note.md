---
doc_type: issue-fix
issue: 2026-06-13-pair-device-browser-preview-regressions
status: done
path: fast-track
fix_date: 2026-06-13
tags: [settings, pairing, browser-preview, web]
---

# Pair Device Link Identity and Web Browser Tab Rollback Fix Record

## 1. Problem Description

Two outcomes were confirmed during the fix discussion:

1. Settings → Pair devices generated the same pairing link while viewing different connected daemons.
2. Web browser tabs / lite preview were confusing because a Web iframe that can only open URLs already reachable by the user's browser does not provide enough product value. The user chose to roll this Web-only browser tab feature back and keep Electron as the only full browser-tab surface.

## 2. Root Cause

- `packages/app/src/desktop/components/pair-device-section.tsx` selected the Electron desktop bridge whenever the app was running in Electron, regardless of which host page was open. That made remote host pages fetch the built-in desktop daemon pairing offer.
- Web lite preview was added by commit `2b61d145` (`feat: add web lite preview tabs`). It intentionally exposed Web-side browser tab entry points and an iframe-based preview, but the resulting product contract was weak: it did not solve daemon-local service access unless the URL was already reachable from the client browser.

## 3. Fix Plan

- Keep the Pair devices identity fix: use the desktop pairing bridge only when the selected `serverId` matches the detected local desktop daemon id; otherwise use the connected host client's `getDaemonPairingOffer()`.
- Revert commit `2b61d145` without keeping the Web lite preview entry points, docs, feature docs, tests, or browser support gate changes.
- Preserve Electron's complete browser pane behavior and leave daemon-backed service/port preview as a future feature discussion rather than a half-browser iframe surface.

## 4. Changed Files List

Pairing fix:

- `packages/app/src/desktop/components/pair-device-section.tsx`
- `packages/app/src/desktop/components/pair-device-section.test.tsx`

Web lite preview rollback from `2b61d145`:

- `.bytetrue/compound/decision/2026-06-09-decision-web-lite-preview-vs-electron-webview.md`
- `.bytetrue/compound/learning/2026-06-09-learning-lite-webview-html-preview-scope.md`
- `.bytetrue/features/2026-06-09-local-web-preview/local-web-preview-acceptance.md`
- `.bytetrue/features/2026-06-09-local-web-preview/local-web-preview-checklist.yaml`
- `.bytetrue/features/2026-06-09-local-web-preview/local-web-preview-design.md`
- `.bytetrue/requirements/VISION.md`
- `.bytetrue/requirements/local-web-preview.md`
- `docs/architecture.md`
- `docs/local-daemon-actions.md`
- `docs/local-web-preview.md`
- `packages/app/e2e/local-web-preview.spec.ts`
- `packages/app/src/components/browser-pane.web.test.tsx`
- `packages/app/src/components/browser-pane.web.tsx`
- `packages/app/src/screens/workspace/workspace-browser-support.test.ts`
- `packages/app/src/screens/workspace/workspace-browser-support.ts`
- `packages/app/src/screens/workspace/workspace-screen.tsx`
- `packages/app/src/screens/workspace/workspace-scripts-button.test.tsx`
- `packages/app/src/screens/workspace/workspace-scripts-button.tsx`
- `packages/app/src/stores/browser-store/state.test.ts`
- `packages/app/src/stores/browser-store/state.ts`
- `packages/app/src/utils/open-service-url.test.ts`
- `packages/app/src/utils/open-service-url.ts`

Fix record:

- `.bytetrue/issues/2026-06-13-pair-device-browser-preview-regressions/pair-device-browser-preview-regressions-fix-note.md`

## 5. Regression Coverage

- **New regression test**: `packages/app/src/desktop/components/pair-device-section.test.tsx` — `does not use the desktop daemon pairing offer for a different connected host` verifies that Electron remote host pages call the connected daemon client instead of the local desktop bridge.
- **Reused existing tests**:
  - `packages/app/src/screens/workspace/workspace-scripts-button.test.tsx` covers service link behavior after reverting Web in-app browser entry support.
  - `packages/app/src/stores/browser-store/state.test.ts` covers browser-store URL normalization after reverting the blank default URL change from Web lite preview.
- **No suitable seam**: no Web browser-pane lite preview regression test remains because the feature was intentionally removed. The future valuable capability is daemon-backed service preview, which should be designed as a separate feature with its own tests.

## 6. Verification Result

Commands run:

```bash
npm --prefix packages/app run test -- src/desktop/components/pair-device-section.test.tsx src/screens/workspace/workspace-scripts-button.test.tsx src/stores/browser-store/state.test.ts --bail=1
npm --prefix packages/app run typecheck
npm --prefix packages/app run lint -- src/desktop/components/pair-device-section.tsx src/desktop/components/pair-device-section.test.tsx src/screens/workspace/workspace-screen.tsx src/screens/workspace/workspace-scripts-button.tsx src/screens/workspace/workspace-scripts-button.test.tsx src/stores/browser-store/state.ts src/stores/browser-store/state.test.ts src/utils/open-service-url.ts src/components/browser-pane.web.tsx
npm run format:files -- .bytetrue/requirements/VISION.md docs/architecture.md docs/local-daemon-actions.md packages/app/src/components/browser-pane.web.tsx packages/app/src/desktop/components/pair-device-section.tsx packages/app/src/desktop/components/pair-device-section.test.tsx packages/app/src/screens/workspace/workspace-screen.tsx packages/app/src/screens/workspace/workspace-scripts-button.tsx packages/app/src/screens/workspace/workspace-scripts-button.test.tsx packages/app/src/stores/browser-store/state.ts packages/app/src/stores/browser-store/state.test.ts packages/app/src/utils/open-service-url.ts
```

Results:

- Targeted Vitest files passed: 3 files, 20 tests.
- App typecheck passed.
- Targeted app lint exited successfully. It reported three pre-existing warnings in `workspace-screen.tsx` for underscore-prefixed unused variables.
- Changed present files were formatted with `oxfmt`.

## 7. Instrumentation Cleanup

- **Temporary instrumentation**: none.
- **Cleanup evidence**: no temporary debug logs were added.
- **Retained logs**: none.

## 8. Mini Post-mortem

A Web iframe should not be presented as a general browser unless it provides value beyond opening a normal browser tab. For remote/mobile Web clients, the valuable capability is daemon-backed preview of known workspace services, not a generic URL tab. Future work should start as `daemon-backed-service-preview` or equivalent and explicitly model service ownership, proxying, relay support, and safety boundaries.

## 9. Follow-up Items

- Consider a separate feature design for daemon-backed service/port preview, limited to registered running workspace services in its first version.
