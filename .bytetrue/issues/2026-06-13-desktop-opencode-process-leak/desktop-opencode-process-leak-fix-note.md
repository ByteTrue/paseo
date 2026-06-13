---
doc_type: issue-fix
issue: 2026-06-13-desktop-opencode-process-leak
status: done
path: standard
fix_date: 2026-06-13
related:
  - desktop-opencode-process-leak-analysis.md
tags:
  - desktop
  - daemon
  - provider-process
  - windows
  - cross-platform
---

# Desktop Provider Process Leak Fix Record

## 1. Actual Solution Used

Used analysis option A: make supervisor-to-worker shutdown explicit and graceful before any kill fallback.

The supervisor now sends a worker control IPC message when a worker requests shutdown/restart or when the supervisor itself is asked to stop. The worker handles those control messages by calling its existing `beginShutdown()` path, which awaits `daemon.stop()`. That preserves the normal daemon cleanup order, including `providerSnapshotManager.shutdown()` and provider-owned runtime cleanup such as OpenCode server shutdown.

A `SIGTERM` fallback remains, but only after IPC is unavailable, IPC send fails, or the worker does not exit within the graceful timeout.

## 2. Changed Files List

- `packages/server/scripts/supervisor.ts`
  - Added `paseo:supervisor-shutdown` / `paseo:supervisor-restart` control messages.
  - Changed shutdown/restart handling to send control IPC first.
  - Added a 12s fallback timer that uses `SIGTERM` only if graceful worker exit does not happen.
  - Clears the fallback timer when the worker exits.
- `packages/server/src/server/daemon-worker.ts`
  - Added handling for supervisor control IPC messages.
  - `paseo:supervisor-shutdown` now triggers `beginShutdown("supervisor shutdown request")` inside the worker.
  - `paseo:supervisor-restart` now triggers the same graceful shutdown path with success exit code `0`.
- `packages/server/scripts/supervisor.lifecycle-intents.test.ts`
  - Added a fixture-based regression test proving supervisor shutdown asks the worker to shut itself down before any `SIGTERM` fallback.
  - Added source assertions that both supervisor and worker contain the new control-message contract.
- `.bytetrue/issues/2026-06-13-desktop-opencode-process-leak/desktop-opencode-process-leak-report.md`
  - Archived confirmed issue report.
- `.bytetrue/issues/2026-06-13-desktop-opencode-process-leak/desktop-opencode-process-leak-analysis.md`
  - Archived confirmed root-cause analysis.
- `.bytetrue/issues/2026-06-13-desktop-opencode-process-leak/desktop-opencode-process-leak-fix-note.md`
  - This closure record.

## 3. Regression Coverage

- **New regression test**: `packages/server/scripts/supervisor.lifecycle-intents.test.ts` — `asks the worker to shut itself down before falling back to SIGTERM`.
  - The fixture worker sends `paseo:shutdown` to the supervisor.
  - The test expects the worker to receive `paseo:supervisor-shutdown`, print `graceful-shutdown`, and exit cleanly.
  - The test also installs a `SIGTERM` handler and asserts `sigterm` was not printed, proving the first shutdown step is IPC-driven rather than kill-driven.
- **Reused existing test**: `packages/server/scripts/supervisor.logging.test.ts` verifies existing supervisor process/log behavior still passes after the shared lifecycle change.
- **No direct Windows Task Manager reproduction in this environment**: this worktree is running on macOS, so the exact Windows `opencode.exe` accumulation loop could not be executed locally. The regression seam targets the cross-platform root cause: supervisor must not directly kill the worker before worker-owned cleanup can run.

## 4. Verification Result

Verification commands run:

```bash
npx vitest run packages/server/scripts/supervisor.lifecycle-intents.test.ts --bail=1
npx vitest run packages/server/scripts/supervisor.logging.test.ts --bail=1
npx vitest run packages/server/scripts/supervisor.lifecycle-intents.test.ts packages/server/scripts/supervisor.logging.test.ts --bail=1
npm run typecheck
npm --workspace-root run lint
```

Results:

- `supervisor.lifecycle-intents.test.ts`: passed.
- `supervisor.logging.test.ts`: passed.
- Combined supervisor test run: passed, 2 files / 8 tests.
- `npm run typecheck`: passed across workspaces after a small type-narrowing fix in `daemon-worker.ts`.
- `npm --workspace-root run lint`: passed with 0 warnings and 0 errors.

Reproduction-step verification:

- The original UI reproduction requires Windows desktop + OpenCode and cannot be fully replayed on this macOS worktree.
- The code-level reproduction equivalent is covered: a supervised worker that requests shutdown now receives an explicit graceful shutdown control message and exits without receiving `SIGTERM` first.
- Expected behavior is restored at the lifecycle boundary: worker-owned cleanup can run before supervisor fallback termination.

## 5. Instrumentation Cleanup

- **Temporary instrumentation**: none added.
- **Cleanup evidence**: searched for the planned debug prefix:

```bash
rg "\[DEBUG-desktop-provider-process-leak\]" packages/server/scripts packages/server/src/server .bytetrue/issues/2026-06-13-desktop-opencode-process-leak || true
```

The only occurrence is the analysis document explaining where temporary logs would go if needed; no committed runtime debug logs were added.

- **Retained logs**: none. The new supervisor lifecycle logs are normal operational logs for fallback paths, not temporary instrumentation.

## 6. Mini Post-mortem

This bug came from assuming `SIGTERM` is a portable graceful-control mechanism for a supervised worker. On Windows, that assumption breaks exactly where child-process cleanup matters most.

Prevention:

- Prefer explicit IPC lifecycle messages between supervisor and worker for graceful control.
- Keep process signals as fallback/last-resort termination, not the first step of normal shutdown.
- Regression tests around supervisor lifecycle should assert the contract at the process boundary, not only source-string presence.
- Provider runtime cleanup remains worker-owned; shutdown code should preserve `daemon.stop()` as the primary cleanup path.

## 7. Follow-up Items

- Consider hardening active ACP session cleanup to use tree-kill like Codex/Pi/OpenCode cleanup paths. This is outside the confirmed root-cause fix and should be tracked separately if needed.
- If a Windows machine is available, run one manual smoke after this lands: start desktop with OpenCode-only config, wait for provider snapshot, quit with `Keep daemon running after quit` disabled, and confirm Task Manager does not retain new `opencode.exe` processes.
