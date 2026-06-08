---
doc_type: issue-fix
issue: 2026-06-08-direct-lan-enrollment-rejected
status: draft
severity: P1
summary: 局域网直连 daemon 时 enrollment 被拒绝，密码提示不出现，错误消息误导为 TLS 错误
tags: [enrollment, auth, direct-tcp, ux, error-message]
---

# 局域网直连 Daemon Enrollment 修复记录

## 问题现象

用户在局域网另一台机器上通过 "Add Host" 连接 daemon（`tcp://10.1.106.192:6767`），daemon 已设置管理员密码，但：

1. 连接时没有弹出密码输入框
2. 报错显示 "TLS error" 而实际上与 TLS 无关

## 根因分析

两个 Bug：

### Bug A：错误消息误分类（客户端 `add-host-modal.tsx`）

`buildConnectionFailureCopy` 函数（L218-224）用 `rawLower.includes("tls")` 做模糊匹配，但 daemon 返回的 enrollment policy 拒绝消息中包含 "trusted **TLS** direct transport" 字样，被错误匹配为 TLS 连接错误。

**实际流程**：WebSocket 连接已成功建立，错误发生在 enrollment 阶段。

### Bug B：enrollment 安全策略阻止密码提示（客户端 + 服务端）

服务端 `websocket-server.ts` 的 enrollment 入口有两个关卡：

1. **`sendAuthChallenge`**（L1188）：`enrollmentAllowed = passwordConfigured && authAdminAllowed`
   - 对于直接 TCP 非 localhost 非 TLS 连接，`authAdminAllowed = false`
   - 即使 `passwordConfigured = true`，`enrollmentAllowed` 仍为 `false`

2. **`handlePreAuthEnrollRequest`**（L1284）：第一行就检查 `!pending.authAdminAllowed` → 直接拒绝
   - admin password 验证在 L1320，但永远执行不到

客户端 `daemon-client.ts` `beginDaemonAuthEnrollment`（L4473）在 `enrollmentAllowed === false` 时直接 `failDaemonAuth`，从不调用 `adminPasswordProvider`，所以密码提示 (`DaemonAuthPromptHost`) 虽然已注册但永远不会被触发。

**核心矛盾**：服务端要求 transport 可信（TLS/relay/localhost）才能 enrollment，但 admin password 本身就可以作为授权凭证。用户已设置密码却无法在局域网中使用。

## 修复方案

### Bug A 修复（`add-host-modal.tsx`）

在 generic TLS 匹配之前，添加对 "enrollment requires" 的专门匹配，显示正确的提示：

> Direct connections require TLS or relay for enrollment. Enable SSL or use relay pairing instead.

### Bug B 修复（`websocket-server.ts`）

**`sendAuthChallenge`**：将 `enrollmentAllowed` 从 `passwordConfigured && pending.authAdminAllowed` 改为 `passwordConfigured`。只要 daemon 已设置密码，就允许 enrollment 尝试。

**`handlePreAuthEnrollRequest`**：将 transport 门控从 `!pending.authAdminAllowed` 改为 `!pending.authAdminAllowed && !this.authPasswordHash`。如果密码已配置，admin password 验证流程（L1320）会决定 enrollment 是否成功。

### 安全考量

- enrollment 本身就需要发送 admin password（通过 WebSocket 消息体），与 legacy bearer token 方式安全等级相同
- 服务端 `createSessionAuthAdministration` 中的 `revokeClient` / `changePassword` 操作仍保持 `authAdminAllowed` 门控——这些是 post-enrollment 的管理操作，要求 trusted transport 是合理的

### 影响范围

| 组件                   | 文件                                             | 改动                    |
| ---------------------- | ------------------------------------------------ | ----------------------- |
| 客户端（Web/Electron） | `packages/app/src/components/add-host-modal.tsx` | 错误分类逻辑 +7 行      |
| 服务端                 | `packages/server/src/server/websocket-server.ts` | enrollment 门控逻辑修改 |

不涉及协议变更：`enrollmentAllowed` 在协议中已是 `boolean`。

## 验证

- [x] `npm run build:server` 通过
- [x] `npm run typecheck` 全仓通过
- [x] `npm --workspace-root run lint` 通过（0 warnings, 0 errors）

## 修复文件

- `packages/app/src/components/add-host-modal.tsx` — L218-224 区段
- `packages/server/src/server/websocket-server.ts` — L1171-1178（sendAuthChallenge）+ L1284-1294（handlePreAuthEnrollRequest）
