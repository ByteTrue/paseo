---
doc_type: issue-fix
issue: 2026-06-10-web-host-skills-no-actions
path: fast-track
fix_date: 2026-06-10
tags: [web, skills, daemon, packaging]
---

# Web Orchestration skills 无安装操作修复记录

## 1. 问题描述

用户在 Web 端 Host > Agents 设置里看到新增的 **Orchestration skills** 卡片，但卡片只显示 “Update the host to manage orchestration skills from web.”，没有 Install / Update / Uninstall 操作项。

## 2. 根因

`HostSkillsManagementCard` 只有在 host 通过 `server_info.features.hostSkillsManagement` 宣称支持时才渲染操作按钮。daemon 侧的 feature gate 又依赖 `resolveBundledSkillsSourceSync()` 能找到 bundled `skills/` 目录。

Web 功能实现时 server resolver 已支持 source dir 解析，但 `packages/server` 的构建/发布产物没有把 repo root 的 `skills/` 目录打进 `dist/server/`。因此非 desktop-managed 的 packaged host 无法解析 skills bundle，不会声明 `hostSkillsManagement`，Web 就只能走“不支持 host”的提示分支。

## 3. 修复方案

- 将 root `skills/` 复制进 `packages/server/dist/server/skills`，让 packaged CLI/server daemon 自带 skills bundle。
- 扩展 daemon skills source resolver，优先识别 compiled server package 旁的 `dist/server/skills`。
- 补 regression test，覆盖 packaged server layout 下 resolver 能解析 bundled skills。
- 更新开发文档，说明普通 source checkout / packaged CLI/server / desktop-managed daemon 都应自动发现 skills；只有 custom launcher / repackaged daemon 才需要 `PASEO_SKILLS_SOURCE_DIR`。

## 4. 改动文件清单

- `packages/server/package.json`
- `packages/server/src/server/integrations/skills/operations.ts`
- `packages/server/src/server/integrations/skills/operations.test.ts`
- `docs/development.md`
- `.bytetrue/issues/2026-06-10-web-host-skills-no-actions/web-host-skills-no-actions-fix-note.md`

## 5. Regression 覆盖

- **新增 regression test**：`packages/server/src/server/integrations/skills/operations.test.ts` — `resolveBundledSkillsSourceSync resolves skills bundled with the compiled server package`。先在旧实现下失败（resolver 返回 repo root `skills/`，不是 packaged `dist/server/skills`），修复后通过。
- **复用现有测试**：同文件现有 shared skills operations 测试继续覆盖 install/update/uninstall 的状态机。
- **无合适 seam**：不适用，本次有 resolver public seam 和 build artifact 验证点。

## 6. 验证结果

- `npm run format`：通过。
- `npx vitest run packages/server/src/server/integrations/skills/operations.test.ts --bail=1`：通过，6 tests passed。
- `npm run build:server`：通过，并确认生成 `packages/server/dist/server/skills`。
- `node -e "import('./packages/server/dist/server/server/integrations/skills/operations.js').then(...)"`：确认 compiled resolver 返回 `packages/server/dist/server/skills`。
- `npm pack --workspace=@bytetrue/server --dry-run --json`：通过，确认 pack 文件包含 `dist/server/skills/*`。
- `npm run typecheck`：通过。
- `npm --workspace-root run lint`：通过，0 warnings / 0 errors。

## 7. Instrumentation 清理

- **临时打点**：无。
- **清理证据**：未加入 `console.log` / `debugger` / 临时日志前缀。
- **保留日志**：无。

## 8. Mini post-mortem

这类 bug 未来靠两层约束避免：

1. Web host-scoped 能力不能只测 UI feature flag，也要测 host runtime 的 packaged artifact 是否真能满足 feature gate。
2. 任何依赖 repo root 资源目录的 daemon feature，都需要在 `build:*` 或 packaging 层有明确 copy/include 验证，避免 source checkout 通过、npm/packaged host 失效。

## 9. 遗留事项

无。
