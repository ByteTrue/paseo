---
doc_type: issue-fix
issue: 2026-06-12-terminal-tui-wheel-scroll
status: done
path: fast-track
fix_date: 2026-06-12
tags: [terminal, tui, wheel, xterm]
---

# Terminal TUI Wheel Scroll Fix Record

## 1. Problem Description

In a terminal tab, the terminal surface had a small native scroll range while a full-screen TUI was active. Mouse-wheel input scrolled that terminal history/viewport instead of navigating the TUI content, so the TUI could not be scrolled normally with the wheel.

## 2. Root Cause

`packages/app/src/terminal/runtime/terminal-emulator-runtime.ts:949-965` makes the xterm viewport a native `overflow-y: auto` scroll container for terminal scrollback. xterm forwards wheel input to the application when mouse tracking handles it or when the active buffer has no scrollback, but a TUI running in application-cursor mode on the normal buffer can still have scrollback. In that state, unhandled wheel events scroll the terminal history instead of being delivered as TUI navigation input.

## 3. Fix Plan

Add a small terminal-runtime wheel fallback that runs only after xterm has not already consumed the wheel event. When the active buffer is alternate, or when application-cursor mode is active and the viewport is at the bottom of the normal buffer, translate wheel up/down into the matching terminal arrow input and prevent native viewport scrolling. Pixel-mode wheel input is accumulated by row height so high-precision touchpad deltas do not over-send arrow keys. Leave normal shell scrollback behavior unchanged.

## 4. Changed Files List

- `packages/app/src/terminal/runtime/terminal-emulator-runtime.ts`
  - Registers and cleans up a wheel fallback listener alongside the existing terminal input/touch listeners.
  - Sends `ESC O A/B` in application-cursor mode and `ESC [ A/B` otherwise, only for TUI-like states, with row-height accumulation for pixel-mode wheel deltas.
- `packages/app/src/terminal/runtime/terminal-emulator-runtime.browser.test.ts`
  - Adds browser regression tests for application-cursor TUI wheel input and high-precision wheel accumulation.
  - Adjusts one existing tuple-array annotation in the same file from `Array<T>` to `T[]` to keep targeted lint clean.

## 5. Regression Coverage

- **New regression test**: `packages/app/src/terminal/runtime/terminal-emulator-runtime.browser.test.ts` — `sends wheel input to application-cursor TUIs instead of scrolling terminal history`.
  - RED evidence: `cd packages/app && npm run test:browser -- src/terminal/runtime/terminal-emulator-runtime.browser.test.ts --bail=1` initially failed with `expected [] to deeply equal [ '\u001bOA' ]`.
  - GREEN evidence: the same command passed after the runtime fallback was added.
- **Review follow-up regression test**: `packages/app/src/terminal/runtime/terminal-emulator-runtime.browser.test.ts` — `accumulates high precision wheel input before sending TUI navigation`.
  - Protects touchpad/high-precision mouse input from sending an arrow sequence for every tiny pixel delta.
- **Reused existing test**: the full changed browser test file still passes, covering existing mount, resize, input-mode, protocol-query, and snapshot behavior.

## 6. Verification Result

- Targeted browser regression: `cd packages/app && npm run test:browser -- src/terminal/runtime/terminal-emulator-runtime.browser.test.ts --bail=1` — passed, 21 tests.
- Typecheck: `cd packages/app && npm run typecheck` — passed.
- Lint: `cd packages/app && npm run lint -- src/terminal/runtime/terminal-emulator-runtime.ts src/terminal/runtime/terminal-emulator-runtime.browser.test.ts` — passed.
- Format: `npm run format:files -- packages/app/src/terminal/runtime/terminal-emulator-runtime.ts packages/app/src/terminal/runtime/terminal-emulator-runtime.browser.test.ts` — completed.

## 7. Instrumentation Cleanup

- **Temporary instrumentation**: none.
- **Cleanup evidence**: no debug logs or instrumentation were added.
- **Retained logs**: none.

## 8. Mini Post-mortem

What would prevent this kind of bug in the future: browser-level terminal tests should cover the ownership boundary for wheel/touch input, especially when a terminal mode changes how user input should be routed. Terminal scrollback is valid in shell mode, but TUI-like modes need explicit protection from native page/viewport scrolling.

## 9. Follow-up Items

- Consider a manual desktop smoke check with the specific TUI app from the screenshot before release, because browser tests prove the wheel ownership behavior but do not cover every TUI's escape-sequence choices.
