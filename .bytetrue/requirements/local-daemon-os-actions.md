---
doc_type: requirement
slug: local-daemon-os-actions
pitch: 连接本机 Paseo 时，浏览器也能打开本机编辑器、文件管理器和项目目录。
status: current
last_reviewed: 2026-06-08
implemented_by: [2026-06-08-localhost-desktop-actions]
tags: [local-daemon, web, os-integration]
---

# 浏览器连接本机时也能使用本机打开能力

## 用户故事

- 作为在浏览器里使用本机 Paseo 的开发者，我希望能从工作区直接打开 VS Code、Cursor、WebStorm、Zed 等编辑器，而不是手动复制路径再切回终端。
- 作为正在查看文件的开发者，我希望能直接在文件管理器里定位当前文件，而不是自己从项目根目录一级级找。
- 作为从网页进入 Paseo 的用户，我希望能像使用文件资源管理器一样浏览 daemon 本机目录并打开项目，而不是必须手动输入路径。

## 为什么需要

Paseo 是 local-first 工具，但用户未必总是通过 Electron 桌面端进入。很多时候浏览器直接连着 `localhost` 上的 Paseo，而代码、编辑器和文件管理器都在同一台机器上。此时把本机打开能力只留给桌面端，会让浏览器用户在最常见的开发动作上多绕一步。

## 怎么解决

当浏览器连接的是本机 Paseo 时，界面可以显示本机可用的打开目标，并让用户从工作区直接打开编辑器、定位文件。打开项目时，浏览器 localhost 使用 daemon-backed 目录选择器：由 daemon 枚举本机目录，web UI 以类文件资源管理器方式让用户浏览并选择目录。

远程连接仍保持原来的远程体验，不暴露会操作 daemon 本机系统的动作。

## 边界

- 只覆盖连接本机 Paseo 时的本机打开能力；远程、relay 或非本机连接不使用这套能力。
- 首版覆盖编辑器 / 文件管理器打开目标，以及 daemon-backed 本机项目目录选择器。
- 不为普通浏览器实现系统原生目录对话框；浏览器不能可靠提供 daemon 机器上的真实绝对路径。
- 不把桌面 app 自身维护功能纳入首版，例如 CLI installer、orchestration skills 文件安装器、桌面更新、窗口控制；Web 端已有的 Enable Paseo tools/MCP 注入开关也不属于本功能缺口。
- 不把 Electron 完整 browser tab 纳入首版；后续可单独做 lite webview / local web preview。
- 用户仍需要在本机安装对应编辑器或文件管理器命令，Paseo 不负责替用户安装这些工具。

## 变更日志

- 2026-06-09：通过 `2026-06-08-localhost-desktop-actions` 实现首版。浏览器直连 loopback daemon 时可列出并调用本机 editor/file-manager open targets；Open Project 在 local OS integration 可用时显示 daemon-backed directory picker；relay / 非 loopback 连接在服务端被拒绝执行本机 OS / FS RPC。
