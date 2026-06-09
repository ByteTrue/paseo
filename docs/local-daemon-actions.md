---
doc_type: user-guide
slug: local-daemon-actions
component: localhost-desktop-actions
status: current
summary: How browser clients connected to a local Paseo daemon can open local editors, reveal files, and browse local folders.
tags: [local-daemon, web, open-project, editor]
last_reviewed: 2026-06-09
---

# Local daemon actions in the browser

## 功能简介

When the browser app is connected directly to a Paseo daemon on the same machine, Paseo can use that daemon to perform a small set of local desktop actions. This gives browser users the same everyday workflow shortcuts that used to be limited to the Electron desktop app.

The local actions are:

- Open the current workspace in an installed editor such as VS Code, Cursor, WebStorm, or Zed.
- Reveal the current workspace or file in the platform file manager.
- Browse local daemon directories from the Open Project flow and open a folder as a project.

These actions are only available for local direct connections. Remote, relay, and non-loopback direct connections keep the normal remote experience and cannot execute local OS or filesystem actions.

## 前置条件

- The browser must be connected to the daemon through a local endpoint such as `localhost` or `127.0.0.1`.
- The daemon must be a version that advertises `localOsIntegration` in `server_info.features`.
- Editor targets only appear when the corresponding command or platform app is installed on the daemon machine.

## 如何使用

1. Open Paseo in a browser and connect to your local daemon.
2. Open a workspace.
3. Use the workspace open target menu to open the workspace in an editor or reveal it in the file manager.
4. To open another project, go to Open Project.
5. If local daemon actions are available, Paseo shows a directory picker with local roots, the current path, a Parent Directory row, and child folders.
6. Select a folder and choose **Open this folder**.

## 常见问题

Q: Why do I not see editor or file-manager actions?

A: Paseo only shows local actions when the active connection is local and the daemon advertises support for local OS integration. Editor entries also depend on the editor being installed and discoverable on the daemon machine.

Q: Can a remote browser client trigger these local actions?

A: No. Relay and non-loopback direct TCP clients are rejected by the daemon before local OS or filesystem RPCs reach the execution layer.

Q: Is the browser using the operating system's native folder dialog?

A: No. A normal browser cannot reliably provide the daemon machine's absolute local paths through a native directory dialog. Paseo uses a daemon-backed directory picker instead.

Q: Does this install editors, CLI tools, or Paseo skills?

A: No. This feature only opens existing editor/file-manager targets and browses local directories. It does not install CLI tools or orchestration skills, and it does not change the existing Enable Paseo tools setting.

## 相关功能

- [Architecture](architecture.md)
- [Development](development.md)
- [Service proxy](service-proxy.md)
- [Local web preview](local-web-preview.md)
