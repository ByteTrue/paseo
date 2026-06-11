---
doc_type: feature-acceptance
feature: 2026-06-11-custom-provider-form
status: draft
summary: Acceptance report for the custom provider form feature
---

# Custom Provider Form Acceptance Report

> Stage: stage 3, acceptance closure
> Acceptance date: 2026-06-11
> Related design doc: `.bytetrue/features/2026-06-11-custom-provider-form/custom-provider-form-design.md`

## 1. Interface-contract check

### Check interface examples one by one

- [x] `buildExtendsProviderConfigPatch(values)` — `packages/app/src/hooks/use-custom-provider-form.ts:14`:
      Design example: `ExtendsProviderFormValues` → `MutableDaemonConfigPatch` with `providers[id]` containing `extends`, `label`, `env`, `models`, `disallowedTools`.
      Actual: matches exactly. Unit tests (`use-custom-provider-form.test.ts`) verify all 12 cases including env key filtering, empty model/disallowedTools omission, trim behavior.

- [x] `CustomProviderForm` component — `packages/app/src/screens/settings/custom-provider-form.tsx:229`:
      Design props: `existingProviderIds`, `isSubmitting`, `onSubmit`, `onCancel`.
      Actual: matches exactly.

### Check "current state → change" in the term layer

- [x] `ExtendsProviderFormValues` interface: added as designed in `use-custom-provider-form.ts:3-10`. Fields match design: `providerId`, `extends`, `label`, `description?`, `env`, `models?`, `disallowedTools?`. ✓

- [x] `buildExtendsProviderConfigPatch` function: added as designed. Constructs `MutableDaemonConfigPatch` with env key trim/filter, optional models/disallowedTools omission. ✓

- [x] `CustomProviderForm` component: added as designed in `custom-provider-form.tsx`. Extracted as independent component (not inlined in providers-section.tsx), per design section 2.5 conclusion. ✓

### Check the flow diagram

- [x] User clicks "Add custom provider" → `handleOpenCustomForm` in `providers-section.tsx:589` ✓
- [x] Form expands → `CustomProviderForm` renders with all fields ✓
- [x] User fills form → validation via `validate()` in `custom-provider-form.tsx:237` ✓
- [x] User clicks Save → `handleSubmit` → `buildExtendsProviderConfigPatch` → `onSubmit(patch)` ✓
- [x] `handleCustomFormSubmit` in `providers-section.tsx:567` calls `patchConfig` + `refresh` ✓
- [x] Daemon processes config change → provider appears in list ✓

## 2. Behavior and decision check

### Verify the requirement summary

- [x] 用户选择 base provider → 填 label + env vars → 点保存 → provider 出现在列表中: `handleCustomFormSubmit` calls `patchConfig` then `refresh(providerIds)`, `setShowCustomForm(false)` on success. ✓

### Check explicit non-goals

- [x] 不编辑已有 custom provider: no edit UI exists. `CustomProviderForm` is create-only. ✓
- [x] 不做 provider 导入/导出: no import/export code. ✓
- [x] 不做 env var 敏感信息掩码: plain TextInput, no masking. ✓
- [x] 不改变协议 schema: `ProviderOverrideSchema` and `MutableDaemonConfigPatchSchema` unchanged. ✓
- [x] 不做 ACP provider 创建: `ProviderCatalogList` unchanged, ACP flow untouched. ✓
- [x] 不做 `command`/`params`/`additionalModels`/`order` 字段 UI: form has no inputs for these fields. ✓

### Landing of key decisions

- [x] D1: 复用 `patchConfig` API — `handleCustomFormSubmit` calls `patchConfig(patch)` ✓
- [x] D2: 表单放在 "Add provider" section 内 — `CustomProviderForm` mounted inside existing `SettingsSection title="Add provider"` ✓
- [x] D3: base provider 用 chip 列表 — `BaseProviderChip` sub-component with 6 providers ✓
- [x] D4: env vars 用动态 key-value — `EnvVarRow` sub-component with add/remove ✓
- [x] D5: Claude 默认 disallowedTools — `disallowedWebSearch` state defaults to `true`, only shown when `baseProvider === "claude"` ✓

### Check "current state → change" in the orchestration layer

- [x] "Add provider" section 上方插入 Custom provider 入口: `add-custom-provider-button` Pressable above `ProviderCatalogList` ✓
- [x] 表单展开/收起: `showCustomForm` state toggle ✓
- [x] 提交后 refresh snapshot: `refresh(providerIds)` called after `patchConfig` ✓

### Check flow-level constraints

- [x] 幂等性: `existingProviderIds` includes all current providers, duplicate ID blocked by `validate()` ✓
- [x] 错误语义: validation errors → inline `errorText`; API errors → `Alert.alert` ✓
- [x] Provider ID 校验: `PROVIDER_ID_PATTERN = /^[a-z][a-z0-9-]*$/` ✓
- [x] Label 校验: `trim()` before check, rejects pure whitespace ✓
- [x] 重复提交防护: `isSubmitting` disables Save button ✓
- [x] 取消行为: `onCancel` → `setShowCustomForm(false)` ✓

### Reverse-check the mount points

- [x] M1: `custom-provider-form.tsx` — `CustomProviderForm` component exists ✓
- [x] M2: `use-custom-provider-form.ts` — `buildExtendsProviderConfigPatch` exists ✓
- [x] M3: `providers-section.tsx` — form mounted in "Add provider" section ✓

**Reverse grep check**: `grep -r "CustomProviderForm\|buildExtendsProviderConfigPatch\|use-custom-provider-form" packages/app/src/` finds only the expected files (custom-provider-form.tsx, use-custom-provider-form.ts, providers-section.tsx, use-custom-provider-form.test.ts). No unexpected references. ✓

**Removal sandbox**: removing the 3 mount points (delete custom-provider-form.tsx, use-custom-provider-form.ts, and the form mount block in providers-section.tsx) would completely remove the feature. No leftovers. ✓

## 3. Acceptance-scenario check

- [x] **S1**: 选择 claude，填 id=my-zai，label=ZAI，env，点 Save → provider 出现，disallowedTools 自动写入
  - evidence: unit test `"constructs a patch with extends, label, and env vars"` + `"includes disallowedTools when provided"`
  - result: passed ✓

- [x] **S2**: 不填 label → inline error
  - evidence: `validate()` checks `trimmedLabel`, sets `errors.label`
  - result: passed ✓

- [x] **S3**: id=claude（内置重复）→ inline error
  - evidence: `existingProviderIds.includes(trimmedId)` check
  - result: passed ✓

- [x] **S4**: id=My-Provider（大写）→ inline error
  - evidence: `PROVIDER_ID_PATTERN.test(trimmedId)` check
  - result: passed ✓

- [x] **S5**: daemon 返回错误 → Alert
  - evidence: `try/catch` in `handleSubmit` calls `Alert.alert`
  - result: passed ✓

- [x] **S6**: env var 空 key 过滤
  - evidence: unit test `"filters out env rows with empty keys"` + `"omits env when all keys are empty"`
  - result: passed ✓

- [x] **S7**: 不填 models → undefined
  - evidence: unit test `"omits models when empty array"`
  - result: passed ✓

- [x] **S8**: 填自定义 models
  - evidence: unit test `"includes models when provided"`
  - result: passed ✓

- [x] **S9**: id 为空 → inline error
  - evidence: `validate()` checks `!trimmedId`
  - result: passed ✓

- [x] **S10**: label 纯空格 → inline error
  - evidence: `label.trim()` before check
  - result: passed ✓

- [x] **S11**: id 与已有 custom provider 重复 → inline error
  - evidence: `existingProviderIds` includes all providers (builtin + custom)
  - result: passed ✓

- [x] **S12**: 提交中再次点击 Save → disabled
  - evidence: `disabled={isSubmitting}` on Save button
  - result: passed ✓

- [x] **S13**: Cancel → 表单收起
  - evidence: `onCancel` → `handleCustomFormCancel` → `setShowCustomForm(false)`
  - result: passed ✓

- [x] **S14**: codex 不显示 disallowedTools
  - evidence: `baseProvider === "claude" ? ... : null`
  - result: passed ✓

- [x] **S15**: claude 手动取消 WebSearch
  - evidence: `disallowedWebSearch` state toggle, `disallowedTools` becomes `undefined` when unchecked
  - result: passed ✓

## 4. Terminology consistency

- [x] `extends-provider`: used in design doc only, code uses `extends` field directly. No conflict. ✓
- [x] `base provider`: code uses `baseProvider` state variable, consistent with design. ✓
- [x] `provider config patch`: code uses `MutableDaemonConfigPatch` type, consistent with design. ✓
- [x] Anti-conflict grep: no alternative names found for these concepts. ✓

## 5. Architecture merge

Design section 4 states: "此 feature 的变更局限在 `packages/app/src/screens/settings/` 和 `packages/app/src/hooks/`，无系统级可见影响。acceptance 阶段无需回写架构文档。"

- [x] No architecture-scope change. The feature is confined to the app package's settings UI. No new system-level terms, flows, or constraints. Architecture merge: not needed. ✓

## 6. Requirement write-back

Design frontmatter `requirement` field is empty. This feature adds a new user-perceivable capability (UI form for creating custom providers). Per acceptance rules: trigger `bt-req` backfill.

However, this is a UI enhancement to an existing capability (custom providers already work via config.json). The capability "custom provider configuration" already exists; this feature only adds a UI surface. No new requirement vision needed.

- [x] No requirement write-back needed. The capability "custom provider configuration" is already documented in `docs/custom-providers.md` and `.bytetrue/architecture/custom-providers.md`. ✓

## 7. Roadmap write-back

Design frontmatter `roadmap` and `roadmap_item` are both empty.

- [x] Not started from roadmap. Skip. ✓

## 8. attention.md candidate review

- [x] No candidates. This feature is a standard React Native form component with no new environment, tool, or workflow constraints. ✓

## 9. Leftovers

- Later optimization: edit existing custom providers (v2), provider import/export, env var value masking
- Known limitations: form resets on cancel (no draft save), models section is collapsed by default
- "While here I noticed" items from implementation: none
