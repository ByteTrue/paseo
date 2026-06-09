---
doc_type: learning
track: knowledge
date: 2026-06-08
slug: clean-pre-existing-lint-before-adding-code
component: lint-workflow
tags: [lint, pi-lens, pre-existing, cleanup]
---

# 加新代码前先把已有 lint 阻塞清掉

## 背景

`packages/app/src/contexts/session-context.tsx` 是一个大型 React context 文件（~1400 行），积累了约 16 个未被使用的 callback/ref/import 声明。这些声明本身不是本次 feature 引入的，但当本次 feature 需要修改同一文件时，pi-lens 自动分析器会反复将这些阻塞项关联到本次改动的检查中。

## 指导原则

**先做一次系统性清理，再追加新代码。** 不要在阻塞项旁边绕过它们继续写新逻辑。具体做法：

1. 逐条 grep 确认每个变量/函数/import 确实未被使用
2. 一次性删除所有未用声明
3. 确认删除后文件仍能 typecheck
4. 然后才开始写本次 feature 的新代码

## 为什么重要

- 避免阻塞项在后续 rounds 里重复出现，消耗注意力
- 减少 diff 噪音：先 commit 清理，再 commit 新功能
- 防止"在未用代码旁边绕过它"的补丁式写法蔓延

## 何时适用

- 修改一个文件时，pi-lens 或 lint 报告了多条文由旧代码导致的错误/警告
- 需要修改的文件恰好有未使用的 import/变量/callback
- 删除的声明确认未被其他模块引用

## 示例

本次 daemon-synced-settings feature 在 `session-context.tsx` 新增 `syncDaemonDisplayName` 调用前，先删除了：

- 3 个未使用的 import（`useAgentFormState`, `useAgents`, `checkFeaturesForServerId`, `getPaseoConfigPartial`, `useDaemonConfig` 等）
- 约 13 个未使用的 callback/ref 声明

净减少 ~170 行，新增代码 ~10 行。清理后 typecheck 和 lint 一次通过。
