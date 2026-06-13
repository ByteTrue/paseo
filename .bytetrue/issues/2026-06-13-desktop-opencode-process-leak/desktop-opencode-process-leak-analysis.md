---
doc_type: issue-analysis
issue: 2026-06-13-desktop-opencode-process-leak
status: done
root_cause_type: concurrency
tags:
  - desktop
  - daemon
  - provider-process
  - windows
  - cross-platform
related:
  - desktop-opencode-process-leak-report.md
---

# Desktop Provider Process Leak Root-Cause Analysis

## 1. Problem Location

| Key Location                                                                | Description                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/app/src/hooks/use-providers-snapshot.ts:111`                      | `useProvidersSnapshot()` fetches provider snapshots when the client is connected and the daemon advertises `providersSnapshot`; this is a normal startup/settings/workspace read path, not an explicit agent launch.                                      |
| `packages/server/src/server/agent/provider-snapshot-manager.ts:681`         | Provider snapshot refresh calls `client.isAvailable()` and then `definition.fetchModels()` / `definition.fetchModes()` for enabled providers. Cold snapshot reads can therefore execute provider metadata probes.                                         |
| `packages/server/src/server/agent/providers/opencode-agent.ts:1381`         | `OpenCodeAgentClient.listModels()` acquires an OpenCode server before calling `provider.list`; this starts the provider runtime even when no Paseo agent is created.                                                                                      |
| `packages/server/src/server/agent/providers/opencode-agent.ts:1452`         | `OpenCodeAgentClient.listModes()` also acquires the same OpenCode server for `app.agents`, so a provider snapshot can start or reuse `opencode serve`.                                                                                                    |
| `packages/server/src/server/agent/providers/opencode/server-manager.ts:200` | `OpenCodeServerManager.startServer()` spawns `opencode serve --port ...`; on Windows it uses `detached: false`, so the process is child-owned but not process-group-owned.                                                                                |
| `packages/server/src/server/bootstrap.ts:1161`                              | Normal daemon shutdown calls `providerSnapshotManager.shutdown()`, which is the intended cleanup point for provider-owned background processes.                                                                                                           |
| `packages/server/src/server/agent/provider-snapshot-manager.ts:391`         | `ProviderSnapshotManager.shutdown()` materializes enabled provider clients and calls `shutdownAgentClients()`, giving OpenCode and other providers a chance to release background processes.                                                              |
| `packages/server/src/server/agent/provider-registry.ts:722`                 | `shutdownAgentClients()` only works if the daemon reaches normal shutdown; it invokes each provider client's optional `shutdown()`.                                                                                                                       |
| `packages/server/src/server/daemon-worker.ts:149`                           | The daemon worker's graceful shutdown path awaits `daemon.stop()`, but only when `beginShutdown()` runs inside the worker.                                                                                                                                |
| `packages/server/src/server/daemon-worker.ts:181`                           | For WebSocket lifecycle shutdown, the worker sends `paseo:shutdown` to the supervisor and returns instead of calling `beginShutdown()` itself when IPC exists.                                                                                            |
| `packages/server/scripts/supervisor.ts:299`                                 | The supervisor handles `paseo:shutdown` by setting `shuttingDown` and then calling `child.kill("SIGTERM")` on the worker.                                                                                                                                 |
| `packages/server/scripts/supervisor.ts:311`                                 | The same direct `child.kill("SIGTERM")` path is used for supervisor SIGTERM shutdown. On Windows this is not a POSIX signal delivery path that reliably runs the worker's `process.on("SIGTERM")` cleanup.                                                |
| `packages/cli/src/commands/daemon/local-daemon.ts:646`                      | `stopLocalDaemon()` first requests WebSocket lifecycle shutdown. If that request succeeds, it does not send a process-tree signal itself; it only waits for the persisted owner PID to exit.                                                              |
| `packages/server/src/utils/spawn.ts:41`                                     | On Windows, command names without path separators/extensions are launched through a shell. This can add an extra process layer for provider commands and makes direct child-only termination weaker unless tree-kill is used at the owning cleanup point. |
| `packages/server/src/utils/tree-kill.ts:25`                                 | `terminateWithTreeKill()` is the repo's intended cross-platform process-tree cleanup helper; OpenCode, Codex app-server, and Pi use it in their own provider cleanup paths.                                                                               |

## 2. Failure-Path Reconstruction

**Normal path**: desktop client starts → renderer connects to managed daemon → provider UI/workspace hooks call `useProvidersSnapshot()` → daemon refreshes cold provider snapshot → OpenCode metadata calls start `opencode serve` → on quit, desktop calls `paseo daemon stop` → daemon worker runs `daemon.stop()` → `providerSnapshotManager.shutdown()` calls `OpenCodeAgentClient.shutdown()` → `OpenCodeServerManager.shutdown()` calls `terminateWithTreeKill()` for `opencode serve` → no provider runtime remains.

**Failure path**: desktop client starts on Windows → provider snapshot refresh starts `opencode serve` during metadata discovery → on quit, `paseo daemon stop` sends `shutdown_server_request` → worker forwards `paseo:shutdown` to supervisor → supervisor calls `child.kill("SIGTERM")` on the worker → on Windows this terminates the worker process instead of reliably delivering a catchable SIGTERM that lets `beginShutdown()` await `daemon.stop()` → `providerSnapshotManager.shutdown()` does not run → `OpenCodeServerManager.shutdown()` does not run → `opencode.exe` remains alive → next client start repeats provider snapshot refresh and starts another `opencode.exe`.

**Split point**: `packages/server/scripts/supervisor.ts:311` — the supervisor treats `SIGTERM` as a portable graceful-shutdown signal for the worker, but on Windows it behaves like a hard process termination boundary. The worker's graceful cleanup is platform-dependent and can be skipped exactly where provider-owned child processes need to be released.

## 3. Root Cause

**Root-cause type**: concurrency / process-lifecycle race across supervisor-worker-provider processes.

**Root-cause description**: The daemon architecture has a supervisor process and a worker process. The worker owns the actual daemon services and provider clients, while the supervisor owns the PID lock. A normal worker shutdown must execute `daemon.stop()` so it can close agents, stop provider snapshot manager resources, and call provider client `shutdown()`. However, lifecycle shutdown requests are delegated from the worker to the supervisor; the supervisor then stops the worker by sending `SIGTERM`. This is graceful on POSIX because the worker catches `SIGTERM`, but it is not graceful on Windows because Node cannot rely on catchable POSIX-style signals for another process. As a result, Windows can terminate the worker before the async cleanup path runs. Any provider runtime started during snapshot probing, especially OpenCode's long-lived `opencode serve`, can remain orphaned.

**Are there multiple root causes?**: yes.

- **Primary cause**: supervisor-to-worker shutdown is implemented as direct `child.kill("SIGTERM")`, making daemon cleanup platform-dependent and bypassing `daemon.stop()` on Windows.
- **Secondary cause**: provider snapshots legitimately start provider runtimes during client startup. This is expected by current architecture, but it makes any shutdown cleanup failure visible even when the user never manually launches an agent.
- **Tertiary risk**: some provider/session cleanup paths still use direct `child.kill("SIGTERM")` instead of the shared `terminateWithTreeKill()` helper, so process-tree cleanup consistency varies by provider and code path.

**Complex bug diagnosis record**:

- **feedback loop**: confirmed user-level loop is Windows desktop startup/quit/startup with Task Manager counting `opencode.exe`. Code-level loop can be tested without real OpenCode by spawning a worker-owned child process in a supervised daemon fixture, requesting lifecycle shutdown, and asserting the child process is gone after stop. A provider-specific seam can use a fake OpenCode server manager or fixture process.
- **ranked hypotheses**:
  1. Windows supervisor kills the daemon worker before `daemon.stop()` runs — evidence: lifecycle shutdown is forwarded to supervisor at `daemon-worker.ts:181`, supervisor stops worker with `child.kill("SIGTERM")` at `supervisor.ts:311`, and only worker `daemon.stop()` reaches provider cleanup at `bootstrap.ts:1161`; falsification method: inspect Windows daemon logs for absence/presence of `Server closed` from `daemon-worker.ts:152` after quit, or instrument the worker cleanup path.
  2. OpenCode snapshot probing starts a persistent server on every cold client startup — evidence: `useProvidersSnapshot()` fetches snapshots on connect, snapshot refresh calls fetchModels/fetchModes, OpenCode `listModels()`/`listModes()` call `acquireServer()`, and `OpenCodeServerManager.startServer()` spawns `opencode serve`; falsification method: disable provider snapshot calls or use a warm disk cache and verify no new `opencode.exe` appears on startup.
  3. OpenCode server manager cleanup is missing or provider-specific — evidence against: OpenCode has `OpenCodeAgentClient.shutdown()` and `OpenCodeServerManager.shutdown()` using `terminateWithTreeKill()`; this path is sound if reached. Falsification method: call `OpenCodeServerManager.shutdown()` directly after a metadata probe and assert `opencode.exe` exits.
  4. CLI `daemon stop --force` kills only the supervisor PID and misses descendants — partial evidence: when lifecycle request succeeds, CLI does not tree-kill because it waits for owner PID exit; fallback tree-kill only runs when lifecycle request fails. This worsens the Windows failure but is secondary to supervisor not providing a graceful worker stop.
- **instrumentation / measurement**: if runtime proof is needed, add temporary logs with prefix `[DEBUG-desktop-provider-process-leak]` at `daemon-worker.ts` before/after `await daemon.stop()`, at `bootstrap.ts` before/after `providerSnapshotManager.shutdown()`, and at `OpenCodeServerManager.killServer()`. Cleanup by removing all logs before the fix commit. On Windows, compare daemon logs against Task Manager process counts after each quit.
- **regression seam**: best seam is a supervisor lifecycle unit/integration test around `runSupervisor()` using a fixture worker that owns a child process and only cleans it during a graceful IPC shutdown path. Provider-specific tests should assert `OpenCodeServerManager.shutdown()` is called during daemon stop, but the highest-value regression is at the supervisor/worker boundary because it affects all provider cleanup.

## 4. Impact Surface

- **impact scope**: confirmed for Windows desktop with OpenCode. The underlying shutdown bug is platform-specific to Windows, but the cleanup dependency exists on all desktop platforms. POSIX platforms are lower risk because `SIGTERM` is catchable and process groups/tree-kill behavior is stronger, but a forced stop or supervisor loss can still skip cleanup.
- **potential victim modules**: OpenCode provider server manager, Codex app-server sessions and metadata probes, Pi RPC sessions and metadata probes, ACP provider probes/sessions, local speech worker processes, terminal subprocesses, and any future provider that starts background processes under the worker.
- **provider-specific risk**:
  - OpenCode: high. Snapshot metadata starts a long-lived shared `opencode serve`; leak is visible as repeated `opencode.exe`.
  - Codex: medium. Metadata probes spawn Codex app-server and dispose it with `terminateWithTreeKill()` in normal paths, but active sessions still depend on daemon shutdown reaching session/client cleanup.
  - Pi: medium. `listModels()` starts a Pi RPC session and closes it with `terminateWithTreeKill()` in normal paths; active sessions are similarly vulnerable if daemon cleanup is skipped.
  - Copilot ACP / generic ACP: medium. Metadata probes spawn short-lived ACP processes and close probes, but active ACP sessions use direct `child.kill("SIGTERM")` in `ACPAgentSession.close()` and are more vulnerable to descendants than providers using tree-kill.
  - Claude: lower for startup metadata because `listModels()` reads settings/catalog rather than spawning a long-lived metadata server, but active SDK/runtime sessions still depend on normal daemon cleanup.
- **data-integrity risk**: mostly process/resource leak rather than persisted data corruption. Secondary risks include stale provider sessions, locked ports, accumulated memory/CPU use, and confusing provider-native session state.
- **severity re-evaluation**: keep P1. It is a reproducible resource leak in a core desktop lifecycle path and can accumulate indefinitely, but it is not yet shown to corrupt user data or fully block all users.

## 5. Repair Options

### Option A: Make supervisor shutdown request graceful through IPC before killing worker

- **what it does**: add an explicit supervisor-to-worker shutdown message, e.g. `paseo:shutdown-worker`, and have the worker call `beginShutdown("supervisor shutdown request")` itself. Supervisor should wait for worker exit, then fall back to `child.kill()` / tree-kill after a timeout. The existing worker-to-supervisor `paseo:shutdown` can still be used to ask the owner to coordinate PID lock release.
- **advantages**: directly fixes the root cause at the process boundary; works on Windows/macOS/Linux; preserves worker-owned cleanup order; benefits every provider and daemon subsystem, not just OpenCode.
- **disadvantages / risks**: touches supervisor/worker lifecycle protocol and needs careful timeout handling to avoid hanging shutdown if the worker is wedged.
- **impact surface**: `packages/server/scripts/supervisor.ts`, `packages/server/src/server/daemon-worker.ts`, supervisor lifecycle tests, possibly CLI stop tests. No provider behavior should change except cleanup becoming reliable.

### Option B: Use tree-kill from desktop/CLI stop after lifecycle shutdown succeeds

- **what it does**: after requesting lifecycle shutdown, if the platform is Windows or if child cleanup is uncertain, CLI/desktop stop can tree-kill the owner PID descendants or process tree before returning.
- **advantages**: smaller change around stop command behavior; likely removes leaked provider processes even if worker cleanup is skipped.
- **disadvantages / risks**: treats symptom at the outer boundary; can kill the worker before it flushes daemon state unless carefully delayed; process-tree ownership can be imprecise when the PID file points at the supervisor and provider processes are grandchildren/shell descendants; may hide future cleanup bugs rather than fix them.
- **impact surface**: `packages/cli/src/commands/daemon/local-daemon.ts`, desktop stop tests, cross-platform process tests. Higher risk of changing CLI semantics.

### Option C: Add provider-specific Windows cleanup hardening

- **what it does**: make OpenCode startup/cleanup more Windows-aware, e.g. avoid shell wrapping where possible, track spawned server PIDs durably, or kill known OpenCode server processes when the daemon starts/stops.
- **advantages**: can target the confirmed symptom quickly; might reduce OpenCode-specific leaks even before broader lifecycle hardening.
- **disadvantages / risks**: too narrow and fragile; does not protect Codex, Pi, ACP, speech workers, terminals, or future providers; process-name killing can hit unrelated user OpenCode processes and should be avoided.
- **impact surface**: OpenCode server manager and provider tests. This should not be the primary fix unless Option A is blocked.

### Recommended Option

**Recommend option A**, because it fixes the root cause at the supervisor/worker lifecycle boundary: the worker must be asked to run its own `daemon.stop()` before the supervisor resorts to process termination. This is the smallest architecture-correct change with the widest positive effect. Option B can be a fallback timeout inside Option A, but not the main behavior. Option C is insufficient because the bug is not OpenCode-specific; OpenCode only exposes the shared shutdown flaw most clearly.
