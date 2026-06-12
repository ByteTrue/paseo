---
doc_type: requirement
slug: lean-client-surface
pitch: Paseo 保留随处连接 AI coding agents 的体验，但官方客户端入口收束到浏览器、桌面和命令行，不再维护原生手机应用。
status: current
last_reviewed: 2026-06-12
implemented_by: [ARCHITECTURE]
tags: [client-surface, web, desktop, cli, mobile-web]
---

# 官方客户端入口收束到浏览器、桌面和命令行

## 用户故事

- 作为维护 Paseo fork 的人，我希望官方支持面集中在高回报的客户端入口，而不是每次发布都被原生 Android / iOS 的构建、证书和测试成本拖住。
- 作为只是想在手机上看 agent 进度、补一句回复的人，我希望打开手机浏览器或 PWA 就能用，而不是必须安装一个单独的原生 app。
- 作为负责发版的人，我希望 release checklist 只覆盖真正长期维护的入口，而不是把 Android APK、iOS、TestFlight 或 EAS 变成每次都要照顾的承诺。

## 为什么需要

Paseo 的核心价值是让用户从不同设备连接自己的 daemon，监控和控制正在跑的 coding agents。这个价值不一定需要原生移动端才能成立。原生移动客户端带来的构建、发布、测试、证书和平台兼容成本很高，但实际回报低；继续把它放进官方维护面，会让每次同步、发版和修 bug 都额外背上一层移动端负担。

## 怎么解决

官方支持口径收束为浏览器 Web、手机浏览器 / PWA、Electron 桌面端和命令行。用户在电脑上可以继续用桌面端或浏览器完整工作，在手机上可以通过 mobile web 快速查看和操作 agents，在自动化场景里继续用 CLI。原生 Android / iOS 不再作为官方承诺的客户端入口，也不再作为发版目标或日常维护目标。

## 边界

- 不取消 mobile web / PWA；手机浏览器里的响应式体验仍然属于官方支持面。
- 不取消桌面端；桌面端继续复用 Web 客户端界面，并承担本机集成体验。
- 不取消 CLI；命令行仍然是脚本化和终端工作流入口。
- 不承诺维护或发布原生 Android APK、iOS app、TestFlight / App Store 流程或 EAS 移动发布流程。
- 不把原生移动端专属问题作为必须修复的问题；如果问题同时影响 Web、桌面共享界面或 daemon 协议，则按共享问题处理。
- 不阻止社区或个人自行实验原生移动构建，但项目官方不把它作为稳定交付面。
- 这份需求只定义产品边界，不决定具体删除哪些文件、脚本或 CI；实际清理应由后续 feature / refactor 流程执行。

## Change Log

- 2026-06-12: Implemented the official client-surface cleanup. Browser/mobile web, Electron desktop, and CLI remain supported; native Android/iOS build, release, test, and app-source surfaces were removed from the official maintenance path while legacy protocol parsing stays compatible.
