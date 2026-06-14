---
doc_type: requirement
slug: daemon-synced-settings
pitch: 连上同一台主机的任何设备都能立刻开始工作——不用等、不用重选，之前的设置都在。
status: current
last_reviewed: 2026-06-08
implemented_by:
  - arch-data-model
  - arch-providers
  - arch-custom-providers
tags: [settings, daemon, browser, preferences]
---

# 新设备连上就能工作

## 用户故事

- 作为一个在办公室和家里都用 Paseo 的人，我希望换一台电脑的浏览器连上同一个 daemon，看到的界面和我上次用的完全一样——主机名、常用模型、供应商状态都在，不用重新设置。
- 作为一个刚装好新笔记本的人，我连上 daemon 之后希望模型选择器能立刻显示上次用过的那些模型，而不是等一分钟让它重新探测。
- 作为一个为某个供应商调了自定义设置的开发者，我在一台电脑上配好的供应商开关和额外模型，换到平板或者另一台电脑连同一个 daemon 时应该还在。
- 作为一个使用第三方 Anthropic-compatible Claude Code endpoint 的开发者，我希望把 endpoint URL、token 和 Claude 默认模型环境变量保存在 daemon 设置里，然后在任意客户端里像选择 Claude 一样选择这个命名 endpoint。

## 为什么需要

Paseo 的 daemon 跑在开发机上，浏览器只是遥控器。但以前有很多设置却存在浏览器里——给主机起的显示名、创建 agent 时你上次选的模型和模式、收藏的模型、供应商探测出来的模型列表。换一台设备连同一个 daemon，这些东西全丢了，得重新配一遍、重新等一分钟探测。这不合理：daemon 才是工作环境的 owner，和 daemon 工作能力直接相关的设置就应该跟 daemon 走。

## 怎么解决

把跟 daemon 工作能力直接相关的设置搬到 daemon 自己身上持久化：主机显示名、创建 agent 时的模型偏好和收藏、供应商可用模型的上一份探测结果，以及 UI 管理的 Claude endpoint variants。新浏览器连上来时，daemon 直接告诉它这些信息——显示名、偏好、模型列表和命名 Claude endpoint——秒开可用。探测供应商的事后台跑，旧结果先顶上，新的出来了再更新。

## 边界

- 不碰项目级的生成指令（branch name、commit message 等生成时的风格提示），这些在项目的配置文件里，跟 daemon 不绑。
- 不碰纯设备偏好的设置——主题、字体、发送行为、你自己起的连接书签名。这些换设备时按自己的喜好重新调。
- 不碰安全凭证——授权密钥、管理员密码——这些留在浏览器本地是合理的。
- 缓存的供应商模型列表只是上一份真实结果，不是"永远正确"。刷新失败时旧列表保留，不会清空选择器。
- UI 管理的 Claude endpoint variant 会保存 endpoint 所需的 `ANTHROPIC_*` 环境变量到 daemon config；这跟 daemon 工作能力绑定，但不改变浏览器本地的 daemon 管理密码、授权密钥等安全凭证边界。

## Change log

- 2026-06-14：新增 Claude endpoint variants：在 Claude provider details 中管理 UI 标记的 `extends: "claude"` endpoint variants，并将它们作为 Claude-like provider 选项同步给连接同一 daemon 的客户端。
