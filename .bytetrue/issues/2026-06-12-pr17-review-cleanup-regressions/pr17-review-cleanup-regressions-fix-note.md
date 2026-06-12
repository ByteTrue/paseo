---
doc_type: issue-fix
issue: 2026-06-12-pr17-review-cleanup-regressions
status: confirmed
path: fast-track
fix_date: 2026-06-12
tags: [pr-review, browser, docs, native-mobile-removal]
---

# PR 17 Review Cleanup Regressions Fix Record

## 1. Problem Description

PR review found two regressions in the native mobile surface cleanup PR:

1. In browser/mobile-web, cancelling the image picker could leave `pickImages()` pending forever, causing later image-pick attempts to return `null` until page refresh.
2. `docs/release.md` still said beta releases do not publish "production mobile builds", which implied an official mobile build surface still existed.

## 2. Root Cause

- `packages/app/src/hooks/use-image-attachment-picker.ts` created an `<input type="file">` and resolved only when the input fired `change`. Browsers may not fire `change` when the user opens the picker and cancels without selecting a file, so the Promise could remain unresolved and keep `isPickingRef.current` stuck at `true`.
- `docs/release.md` line 36 was stale copy left over from the previous release model.

## 3. Fix Plan

- Add a browser picker cancellation fallback: resolve `null` on the input `cancel` event when available, and also use window focus return as a fallback that resolves `null` if no file was selected. Guard settlement so `change`, `cancel`, and `focus` cannot resolve twice.
- Rewrite the beta-flow release sentence so it no longer mentions production mobile builds.

## 4. Changed Files List

- `packages/app/src/hooks/use-image-attachment-picker.ts` — added guarded settlement, `cancel` event handling, and focus-return fallback for browser file-picker cancellation.
- `docs/release.md` — removed stale "production mobile builds" wording from the beta-flow description.

## 5. Regression Coverage

- **No suitable new regression test**: the bug depends on browser file-picker cancel behavior. Headless/browser tests cannot reliably drive the native file chooser cancel path across browsers without fragile harness code.
- **Reused existing checks**:
  - `npm run typecheck` verifies the app hook and repo package graph still compile.
  - `npm --workspace-root run lint` verifies the changed files pass lint.
  - `node --test scripts/release-version-utils.test.mjs` keeps the release utility regression seam green.
  - `rg -n "production mobile builds" docs/release.md` returned no hits.

## 6. Verification Result

- `npm --workspace-root run lint` — passed.
- `npm run typecheck` — passed.
- `node --test scripts/release-version-utils.test.mjs` — passed, 7/7.
- `rg -n "production mobile builds" docs/release.md` — no matches.

Expected behavior now:

- Browser/mobile-web image picker cancel settles to `null`, allowing `finally` to clear `isPickingRef.current` and later image-pick attempts to proceed.
- Release docs no longer imply any production native mobile build surface.

## 7. Instrumentation Cleanup

- **Temporary instrumentation**: none.
- **Cleanup evidence**: no debug logs or instrumentation were added.
- **Retained logs**: none.

## 8. Mini Post-mortem

This class of bug is prevented by explicitly settling browser file-picker Promises for both selection and cancellation paths. Review checklists for PRs that replace native mobile code with browser/PWA paths should check native browser-dialog cancel behavior, not only successful selection.

## 9. Follow-up Items

None.
