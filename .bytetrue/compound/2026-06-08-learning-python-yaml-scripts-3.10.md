---
doc_type: learning
track: pitfall
date: 2026-06-08
slug: python-version-requires-3-10-for-yaml-scripts
component: tooling
severity: low
tags: [python, yaml, tooling, bt-tools]
---

# Python 脚本 `search-yaml.py` 和 `validate-yaml.py` 需要 3.10+

## 问题

ByteTrue 的两个核心工具脚本——`search-yaml.py`（翻 compound 档案）和 `validate-yaml.py`（校验 YAML frontmatter）——在本机 `python3` 为 3.9.x 时报语法错误。

## 症状

```
TypeError: unsupported operand type(s) for |: 'type' and 'NoneType'
```

脚本内部使用了 `str | None` 联合类型语法（PEP 604），此语法在 Python 3.10 才引入。

## 没用的做法

- 试图用 `pip` / `brew` 覆盖系统 Python → macOS 系统 Python 受 SIP 保护
- 给脚本加 `#!/usr/bin/env python3.10` → 只适用于安装了 3.10 的环境

## 解法

当脚本不可用时，用其他工具补验：

**YAML 校验**：

```bash
ruby -ryaml -e 'YAML.safe_load_file("path/to/file.yaml")'
```

**档案搜索**：
用 `rg` 直接搜 frontmatter 字段：

```bash
rg 'doc_type: learning' .bytetrue/compound/
```

## 为什么有效

`ruby` 和 `rg` 是 macOS / nix 环境的标配工具，不依赖特定 Python 版本。YAML 解析只做 frontmatter 语法校验时 Ruby 的解析器足够。

## 预防

- 长期方案：通过 mise / asdf 锁定项目 Python 版本为 3.10+，在 attention.md 记录
- 短期方案：优先用 root `npm run` 脚本包裹工具调用，在 npm script 层面指定 runtime
