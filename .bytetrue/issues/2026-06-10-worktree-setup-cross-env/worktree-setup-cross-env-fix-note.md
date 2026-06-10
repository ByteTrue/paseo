---
doc_type: issue-fix
issue: 2026-06-10-worktree-setup-cross-env
path: fast-track
fix_date: 2026-06-10
tags: [worktree, setup, config, dev-env]
---

# Worktree setup cross-env 找不到修复记录

## 1. 问题描述

`paseo setup` / worktree setup 执行项目 `paseo.json` 中的 setup command 时失败：

```text
Worktree setup command failed: cross-env PASEO_DEV_MANAGED_HOME=1 ... ./scripts/dev-home.sh
/bin/bash: cross-env: command not found
```

## 2. 根因

`paseo.json` 的 worktree setup 和部分 service commands 直接把 `cross-env` 当作 shell 命令执行。

这些命令不是通过 `npm run` script 执行，而是由 worktree setup/service runner 作为原始 shell command 执行；此时 shell `PATH` 不会自动包含当前 worktree 的 `node_modules/.bin`。即使前一步 `npm ci` 已安装了 `cross-env`，裸命令 `cross-env` 也不会被找到。

该命令本身运行在 `/bin/bash` 环境，使用的是 POSIX shell 支持的前置环境变量赋值，因此不需要 `cross-env`。

## 3. 修复方案

- 移除 `paseo.json` 中 raw shell setup/service commands 前缀里的 `cross-env`。
- 保留原有 `VAR=value command` 形式，直接由 bash 注入环境变量。
- 同步处理 `daemon` / `app` / `desktop` service commands，避免 setup 修好后服务启动继续踩同类 PATH 问题。

## 4. 改动文件清单

- `paseo.json`
- `.bytetrue/issues/2026-06-10-worktree-setup-cross-env/worktree-setup-cross-env-fix-note.md`

## 5. Regression 覆盖

- **无新增单测**：本次问题出在项目根 `paseo.json` 的 raw command 配置，不是 TypeScript API seam；验证方式采用命令级复现。
- **命令级验证**：在不包含 `node_modules/.bin` 的 `PATH` 下执行修复后的 `dev-home.sh` setup command，确认不再依赖裸 `cross-env`。

## 6. 验证结果

- `grep -n "cross-env" paseo.json || true`：无输出。
- `npm run format:files -- paseo.json`：通过。
- `PATH="/usr/bin:/bin:/usr/sbin:/sbin" /bin/bash -lc 'PASEO_DEV_MANAGED_HOME=1 ... ./scripts/dev-home.sh'`：通过，不再出现 `cross-env: command not found`。
- `npm --workspace-root run lint`：通过，0 warnings / 0 errors。
- `npm run typecheck`：通过。

## 7. Instrumentation 清理

- **临时打点**：无。
- **清理证据**：未加入 `console.log` / `debugger` / 临时日志前缀。
- **保留日志**：无。

## 8. Mini post-mortem

`paseo.json` 的 setup/service command 是 raw shell command，不等价于 npm script。以后在这里引用 npm devDependency binary 时，要么显式使用 `./node_modules/.bin/...`，要么在 POSIX 环境直接使用 shell 能力；不能假设 npm 会帮忙注入 `node_modules/.bin` 到 `PATH`。

## 9. 遗留事项

无。
