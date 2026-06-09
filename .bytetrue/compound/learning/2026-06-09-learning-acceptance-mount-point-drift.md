---
doc_type: learning
track: knowledge
date: 2026-06-09
slug: acceptance-mount-point-drift
component: bytetrue-feature-workflow
tags: [acceptance, design, implementation, mount-points]
---

# Acceptance should repair mount-point drift immediately

## 背景

在 `2026-06-08-localhost-desktop-actions` 的验收阶段，对照 design 第 2.3 节挂载点清单时发现两处实现和方案不一致：server helper 最初落在 `packages/server/src/` 根目录，而方案要求 local OS / FS 能力放进局部 server 子目录；Open Project 的实际挂载点是 `ProjectPickerModal`，而原方案写成了 `useOpenProjectPicker` 三路分支。

## 指导原则

Feature acceptance 不只是写报告。发现 design/code 挂载点漂移时，应当当场修代码或回填方案，直到后续读者能从 design 准确找到代码落点。

## 为什么重要

ByteTrue feature 设计的价值在于给后续实现、验收和维护提供同一份地图。如果 acceptance 把偏差写成“已知差异”而不修，下一次按 design 追代码时会走错路径，拔除功能时也容易漏掉挂载点。

## 何时适用

适用于 feature acceptance 的第 1/2 节，特别是：

- 新增协议 / handler / UI gate 的 feature
- 实现过程中因为更简洁的路径调整了挂载点
- 方案中写了“新增子模块”但代码先临时落在大文件或根目录

## 示例

本次验收中的处理方式：

- 将 `local-open-targets.ts` / `local-directory-picker.ts` 从 `packages/server/src/` 移入 `packages/server/src/server/local-os/` 和 `packages/server/src/server/local-fs/`，让实现符合 design 的模块隔离决策。
- 回填 design，把 Open Project 挂载点改成 `useOpenProjectPicker` 保持 Electron native / modal fallback，`ProjectPickerModal` 在 browser localhost 下切 daemon-backed directory picker。
- 回填 design，把“breadcrumb”改成实际实现的“当前路径 + Parent Directory 行”。
