---
doc_type: issue-fix
issue: 2026-06-14-pi-extension-timeout-daemon-crash
status: done
path: fast-track
fix_date: 2026-06-14
tags: [daemon, pi-provider, unhandled-rejection, reliability]
---

# Pi Extension Timeout Daemon Crash Fix Record

## 1. Problem Description

The local packaged Paseo daemon on `~/.paseo` repeatedly restarted its worker while Pi agents were active. The observable symptom in `~/.paseo/daemon.log` was that all active agent turns were interrupted together, followed by supervisor restart messages.

Representative log evidence:

```text
Unhandled promise rejection — daemon crashing
Pi extension result timed out for request ...
Worker IPC channel disconnected
Worker exited code 1
Worker crashed (code 1). Restarting worker...
```

## 2. Root Cause

`packages/server/src/server/agent/providers/pi/agent.ts` created a Pi extension result promise before awaiting the RPC prompt that asks Pi to run an internal extension command.

Before the fix, both `/paseo_capture_entries` and `/paseo_tree` used the shape:

```ts
const resultPromise = this.waitForExtensionResult(requestId);
await this.runtimeSession.prompt(command);
await resultPromise;
```

If the 10s extension result timeout fired while `runtimeSession.prompt(...)` was still pending or failed first, `resultPromise` could reject before any caller was awaiting or catching that promise. The daemon worker treats unhandled promise rejections as fatal, so this provider-local timeout crashed the whole worker and interrupted unrelated active agents.

## 3. Fix Plan

Use a single Pi extension command helper that observes both sides of the request lifecycle immediately:

- start waiting for the extension result;
- start `runtimeSession.prompt(...)` through a promise observed in the same `Promise.all`;
- if either side fails, reject and clear the pending extension result entry before rethrowing to the current operation.

This keeps the daemon-level fatal unhandled-rejection policy intact while ensuring Pi extension timeout/prompt failures are scoped to the current Pi operation.

## 4. Changed Files List

- `packages/server/src/server/agent/providers/pi/agent.ts`
  - `runPiTreeExtensionCommand` now goes through the shared extension command lifecycle helper.
  - `requestEntryCapture` now goes through the same helper.
  - Added `runExtensionCommand(command, requestId)` to immediately observe `promptPromise` and `resultPromise`, and to clear pending extension waiters on failure.
- `packages/server/src/server/agent/providers/pi/agent.test.ts`
  - Added a deferred-prompt fake Pi runtime to reproduce “extension result times out before prompt resolves”.
  - Added a rejecting-prompt fake Pi runtime to verify pending waiters are cleared when the prompt itself fails.
- `.bytetrue/issues/2026-06-14-pi-extension-timeout-daemon-crash/pi-extension-timeout-daemon-crash-fix-note.md`
  - Fast-track issue closure record.

## 5. Regression Coverage

- **New regression test**: `packages/server/src/server/agent/providers/pi/agent.test.ts`
  - `handles entry-capture timeout while the Pi prompt is still pending`
  - `clears pending entry-capture waits when the Pi prompt fails`
- **Regression evidence**: the timeout test covers the observed failure ordering with fake timers, and the prompt-failure test covers the companion cleanup ordering. The final targeted test run completed without Vitest unhandled-rejection errors.

## 6. Verification Result

Passed:

```bash
npx vitest run packages/server/src/server/agent/providers/pi/agent.test.ts --bail=1
npm run typecheck --workspace=@bytetrue/server
npm --workspace-root run lint -- packages/server/src/server/agent/providers/pi/agent.ts packages/server/src/server/agent/providers/pi/agent.test.ts
npm run format:check:files -- packages/server/src/server/agent/providers/pi/agent.ts packages/server/src/server/agent/providers/pi/agent.test.ts .bytetrue/issues/2026-06-14-pi-extension-timeout-daemon-crash/pi-extension-timeout-daemon-crash-fix-note.md
```

The reproduction condition is covered by fake timers: the extension result timeout fires while the Pi prompt promise is still pending, and the operation rejects with a scoped timeout error instead of producing an unhandled rejection.

## 7. Instrumentation Cleanup

- **Temporary instrumentation**: none.
- **Cleanup evidence**: no temporary debug logs or debugger statements were added.
- **Retained logs**: none.

## 8. Mini Post-mortem

Provider-internal request/response waiters must be observed as soon as they are created. A promise that can reject via timeout must not be created and then left unawaited while another async operation runs first. Regression tests should cover both timeout-before-prompt-resolution and prompt-fails-before-timeout ordering for request lifecycle helpers.

## 9. Follow-up Items

- Release/update the packaged desktop daemon before expecting the already-installed `/Applications/Paseo.app` daemon to contain this fix.
