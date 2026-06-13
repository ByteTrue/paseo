---
doc_type: issue-report
issue: 2026-06-13-desktop-opencode-process-leak
status: done
severity: P1
summary: Desktop client launch may leak process-backed provider runtimes across restarts
tags:
  - desktop
  - daemon
  - provider-process
  - cross-platform
---

# Desktop Provider Process Leak Issue Report

## 1. Problem Symptom

The confirmed reproduction sample is a Windows machine configured only with the OpenCode provider: every client startup adds another `opencode.exe` process in Windows Task Manager. The issue is consistently reproducible in that environment. A screenshot shows multiple `opencode.exe` entries with description `Bun`, plus `WindowsTerminal.exe`.

The investigation scope is broader than OpenCode and Windows. Other process-backed providers and other desktop platforms may have the same duplicate-start or leaked-child-process failure mode, so analysis must inspect the shared desktop daemon lifecycle and provider runtime cleanup paths across Windows, macOS, and Linux.

## 2. Reproduction Steps

Confirmed sample path:

1. Use a Windows computer.
2. Configure Paseo with only the OpenCode provider.
3. In the desktop client settings, set `Manage built-in daemon` to enabled.
4. Set `Keep daemon running after quit` to disabled.
5. Start the client.
6. Observe Windows Task Manager process list.
7. Quit and start the client again.
8. Observed: each startup leaves one additional `opencode.exe` process.

Required analysis matrix:

- Windows, macOS, and Linux desktop daemon lifecycle behavior.
- OpenCode, Codex, Pi, Copilot ACP, and custom/provider-extension process startup and cleanup behavior where applicable.
- Shared provider snapshot/model/mode probing paths that may start provider runtimes during client startup.

Reproduction frequency: stable / every startup in the reporter's Windows + OpenCode environment; unknown on other platforms/providers until analysis.

## 3. Expected vs Actual

**Expected behavior**: Starting the client should not create duplicate or leaked provider runtime processes. When the managed daemon is stopped on quit, provider helper processes created by that daemon should also be stopped, or reused safely on the next launch.

**Actual behavior**: In the confirmed Windows + OpenCode sample, each client startup adds another `opencode.exe` process, causing process accumulation across restarts. It is currently unknown whether the same behavior affects other providers or desktop platforms.

## 4. Environment Information

- module / feature involved: Desktop client managed built-in daemon startup/shutdown, daemon child-process cleanup, provider snapshot probing, and process-backed provider runtime management
- related files / functions: TBD; initial clues include `packages/desktop/src/daemon/quit-lifecycle.ts`, `packages/desktop/src/daemon/daemon-manager.ts`, OpenCode server manager paths, ACP provider process paths, and other direct provider process lifecycle paths
- runtime environment: confirmed on Windows desktop client with OpenCode only; exact build/channel/version TBD; macOS and Linux TBD
- other context: `Manage built-in daemon` enabled; `Keep daemon running after quit` disabled; only OpenCode provider configured in the confirmed sample. Reporter explicitly wants analysis to include other providers and macOS/Linux, not just OpenCode on Windows.

## 5. Severity

**P1** — Serious process leak risk in a core desktop/provider startup path. It is reproducible in the confirmed Windows + OpenCode sample and may affect additional process-backed providers or platforms, but the client may still be usable after manually killing leaked processes.

## Notes

- Screenshot evidence: Windows Task Manager filtered by `bun`, showing several running `opencode.exe` processes with description `Bun`.
- Fast-path decision: not eligible. A brief code scan found multiple plausible root-cause areas: desktop managed daemon shutdown/restart behavior, OpenCode server manager lifecycle, ACP process lifecycle, direct provider runtime lifecycle, and provider snapshot/model probing. Root cause is not yet obvious at a single `file:line`, so this should use the standard analysis path.
- Open question: whether leaked provider processes remain after the desktop client is fully quit, after the daemon stop command runs, or only after the next launch.
- Open question: whether the same accumulation happens for other process-backed providers such as Codex, Pi, Copilot ACP, generic/custom ACP providers, or other direct providers.
- Open question: whether macOS/Linux correctly terminate provider process trees when the desktop-managed daemon exits, or merely avoid visible accumulation due to platform process behavior.
