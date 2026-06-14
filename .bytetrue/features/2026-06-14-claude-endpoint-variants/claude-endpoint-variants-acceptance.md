---
doc_type: feature-acceptance
feature: 2026-06-14-claude-endpoint-variants
status: done
summary: Accepted Claude endpoint variants as a Claude-only settings-managed endpoint profile flow backed by marked Claude provider overrides
---

# Claude endpoint variants Acceptance Report

> Stage: stage 3, acceptance closure
> Acceptance date: 2026-06-14
> Related design doc: `.bytetrue/features/2026-06-14-claude-endpoint-variants/claude-endpoint-variants-design.md`

## 1. Interface-contract check

**Startup gate**

- [x] Durable implementation report exists at `.bytetrue/features/2026-06-14-claude-endpoint-variants/claude-endpoint-variants-implementation-report.md` with `doc_type=feature-implementation-report`, `status=done`, and an `Implementation Review Gate` section with separate spec compliance and code quality results.
- [x] `claude-endpoint-variants-check-context.jsonl` exists and every required row exists; static manifest check returned `missing required: []`.
- [x] `claude-endpoint-variants-checklist.yaml` exists, feature matches, and all rollout `steps` are `done`.

**Check interface examples one by one**

- [x] Example `buildClaudeEndpointVariantPatch` full env input → actual code behavior is consistent. `packages/app/src/components/provider-settings/claude-endpoint-variants.ts:163` returns `providers.{id}` with `extends: "claude"`, label, `description: "Claude endpoint"`, filtered `env`, `disallowedTools: ["WebSearch"]`, and `params.paseoManagedKind: "claudeEndpointVariant"`. Unit test `packages/app/src/components/provider-settings/claude-endpoint-variants.test.ts` verifies the concrete DeepSeek-shaped output.
- [x] Example blank env fields → actual code behavior is consistent. `buildEnvPatch` filters to `CLAUDE_ENDPOINT_ENV_KEYS` and returns `undefined` when no nonblank values exist; the helper test verifies blank `ANTHROPIC_DEFAULT_SONNET_MODEL` / `ANTHROPIC_DEFAULT_HAIKU_MODEL` are omitted.
- [x] Interface `ProviderSnapshotEntry` optional metadata → actual code behavior is consistent. `packages/protocol/src/agent-types.ts:97` and `packages/protocol/src/messages.ts:271` include optional `derivedFromProviderId` and `managedKind`; `packages/protocol/src/messages.providers-snapshot.test.ts` verifies these fields survive parsing.
- [x] Interface `ClaudeEndpointVariantFormValues` → actual code behavior is consistent. The form value shape is implemented in `packages/app/src/components/provider-settings/claude-endpoint-variants.ts:18`, and the form sub-sheet passes the same value object to `onSave`.

**Check current state → change in the term layer one by one**

- [x] Provider overrides already supported `extends`, `env`, `params`, and `disallowedTools`; implementation uses the existing shape rather than adding a parallel config system. Consistent with `packages/app/src/components/provider-settings/claude-endpoint-variants.ts:163` and `packages/server/src/server/agent/provider-registry.ts:575`.
- [x] Mutable daemon config already accepted passthrough provider config patches; implementation writes through `useDaemonConfig.patchConfig` in `packages/app/src/components/provider-diagnostic-sheet.tsx:788` without adding a new RPC.
- [x] Provider registry already supported derived providers; implementation reuses derived-provider construction and adds only `managedKind` propagation in `packages/server/src/server/agent/provider-registry.ts:468` / `:575`.
- [x] Provider snapshots did not expose derived metadata; implementation added optional metadata to protocol/server types and propagated it through snapshot manager states in `packages/server/src/server/agent/provider-snapshot-manager.ts:475`, `:494`, `:524`, `:658`, and `:734`.
- [x] Provider icons were previously resolved by provider id; implementation carries `iconProviderId` through selector data and uses it in `packages/app/src/components/combined-model-selector.tsx:161`, `:362`, `:719`, and `:822`.

**Check the flow diagram**

- [x] `User -> ClaudeSheet`: Claude settings are still opened via provider details; endpoint section mounts inside `ProviderDiagnosticSheet` for `provider === "claude"`.
- [x] `ClaudeSheet -> ClaudeSheet: Read config.providers filtered by marker`: `listClaudeEndpointVariants` filters `config.providers` by `extends: "claude"` and `params.paseoManagedKind === "claudeEndpointVariant"`.
- [x] `User -> EndpointForm: Add/Edit Claude endpoint`: `ClaudeEndpointFormSubSheet` is mounted from `ProviderDiagnosticSheet` and receives add/edit mode.
- [x] `EndpointForm -> EndpointForm: Validate label/id, filter blank env fields`: `validateClaudeEndpointVariantForm` and `buildEnvPatch` enforce this behavior.
- [x] `EndpointForm -> ConfigHook -> DaemonConfig`: `handleSaveEndpoint` calls `patchConfig(buildClaudeEndpointVariantPatch(values))`.
- [x] `DaemonConfig -> Registry -> Snapshot`: `provider-registry.ts` reads the marker from `params` and `provider-snapshot-manager.ts` propagates optional metadata.
- [x] `Selector -> Claude`: `provider-selection.ts` keeps the variant provider id and only supplies `iconProviderId` for presentation, so launch continues to use the variant id backed by the derived Claude adapter.

No unresolved interface drift remains.

## 2. Behavior and decision check

**Verify the requirement summary one by one**

- [x] A user can open Claude provider details and see `Claude endpoints` above discovered models. Verified with agent-browser on `http://localhost:19010`; final screenshot: `/tmp/claude-endpoint-e2e/screenshots/final-empty-clean.png`.
- [x] A user can add a named endpoint with the six structured env fields. Verified with agent-browser by creating `Claude via DeepSeek E2E` and filling URL/token/opus/sonnet/haiku/subagent fields.
- [x] A saved endpoint appears as a Claude-like provider. Verified with agent-browser: after save, settings provider list showed `Claude via DeepSeek E2E provider details`.
- [x] Multiple endpoint management is supported at the data/UI level through a list of variants, edit buttons, and remove buttons; the implementation does not restrict the number of marked entries.
- [x] Deleting an endpoint removes it from endpoint section and provider list. Verified with agent-browser and no residual `claude-via-deepseek-e2e`, `sk-e2e-secret`, or `claudeEndpointVariant` in the dev config.

**Check explicit non-goals one by one**

- [x] No generic custom-provider UI or `Base provider` picker. `rg "Base provider|custom-provider-form|use-custom-provider-form" packages/app/src` found no live app source hits; old files are deleted.
- [x] No Codex/OpenCode/Pi endpoint support. `rg "Codex endpoints|OpenCode endpoint|Pi endpoint" packages/app/src/components/provider-settings packages/app/src/components/provider-diagnostic-sheet.tsx` found no hits.
- [x] No endpoint test/validation button or save-time probe. `rg "Test endpoint|endpoint test|validate endpoint" packages/app/src/components/provider-settings packages/app/src/components/provider-diagnostic-sheet.tsx` found no hits; save path is config patch plus targeted refresh only.
- [x] No `ANTHROPIC_MODEL` field or generated env key in production endpoint UI/helper. `rg "ANTHROPIC_MODEL" packages/app/src/components/provider-settings packages/app/src/components/provider-diagnostic-sheet.tsx` found only the negative test fixture `ANTHROPIC_MODEL: "ignored-by-ui"`; production code does not include it.
- [x] No raw env table. The form renders six named fields in `ClaudeEndpointFormSubSheet`; no arbitrary key/value env list is present.
- [x] No runtime endpoint switching. No runtime `setModel` path was changed; variants are provider selections for agent creation/resume.
- [x] No encrypted credential store change. The implementation follows daemon config provider override storage and masks/reveals the key only in UI.
- [x] Hand-written unmarked derived Claude providers are not listed/edited by the endpoint UI. `listClaudeEndpointVariants` requires the marker and has a unit test excluding an unmarked `extends: "claude"` provider.

**Landing of key decisions**

- [x] D1 Reuse derived Claude provider overrides: implemented by `buildClaudeEndpointVariantPatch` and `provider-registry.ts` derived provider flow.
- [x] D2 Claude sheet is management home: endpoint section is mounted from `ProviderDiagnosticSheet` only when `provider === "claude"`.
- [x] D3 Endpoint variants appear as independent Claude-like provider rows: provider id remains the variant id; `iconProviderId` makes the row render as Claude-like.
- [x] D4 Create supports hidden Advanced ID; edit makes ID read-only: `ClaudeEndpointFormSubSheet` generates IDs and passes `editable={mode === "add"}` for Internal ID.
- [x] D5 Six env fields optional and blank omitted: `CLAUDE_ENDPOINT_ENV_KEYS` contains exactly six keys; `buildEnvPatch` filters blanks.
- [x] D6 No endpoint testing: no test UI/RPC added.
- [x] D7 Managed marker protects advanced config: marker filtering implemented and tested.
- [x] D8 WebSearch handling automatic: `buildClaudeEndpointVariantPatch` writes `disallowedTools: ["WebSearch"]` without exposing it as a form field.

**Check current state → change in orchestration layer**

- [x] Claude sheet loading endpoint variants: `ProviderDiagnosticSheet` computes `claudeEndpointVariants` and `filteredClaudeEndpoints` through `listClaudeEndpointVariants(config?.providers, q)`.
- [x] Section placement: `ProviderModalBody` renders `ClaudeEndpointsSection` before `DiscoveredModelsSection`.
- [x] Add/Edit sub-sheet: `ClaudeEndpointFormSubSheet` uses `AdaptiveModalSheet` and is separate from `AddCustomModelSubSheet`.
- [x] Save writes provider override patch: `handleSaveEndpoint` uses `patchConfig(buildClaudeEndpointVariantPatch(values))`.
- [x] Delete removes provider override: `handleDeleteEndpoint` confirms and calls `patchConfig({ removeProviders: [variantId] })`.
- [x] Provider selector renders Claude-like variants: `provider-selection.ts` carries `iconProviderId`, and `combined-model-selector.tsx` uses it for row/header/trigger icons.

**Check flow-level constraints**

- [x] Idempotency: edit mode writes the same internal id and does not allow changing it in normal UI; duplicate create ids are blocked by validation.
- [x] Blank env semantics: helper filters whitespace and omits `env` entirely if no env values remain.
- [x] Delete semantics: destructive confirmation warns about agents/preferences needing another provider.
- [x] Compatibility: new protocol fields are optional; old clients can ignore them.
- [x] No validation side effects: save does not probe credentials, URL, or model ids.
- [x] Advanced override protection: only marked Claude overrides are listed.
- [x] Provider refresh scope: add/edit/delete refresh only the affected provider id.

**Behavior Delta Materialization**

- [x] ADDED: Claude provider details gains `Claude endpoints` management → evidence: agent-browser E2E and component code → writeback target: `.bytetrue/architecture/custom-providers.md`, `.bytetrue/requirements/daemon-synced-settings.md`, `docs/custom-providers.md` → applied.
- [x] ADDED: UI-managed Claude endpoint variants selectable as Claude-like providers → evidence: agent-browser provider list plus selector metadata test → writeback target: `.bytetrue/architecture/custom-providers.md` and requirement → applied.
- [x] ADDED: provider snapshots may include optional derived metadata → evidence: protocol and snapshot manager tests → writeback target: `.bytetrue/architecture/providers.md` → applied.
- [x] MODIFIED: provider icon/selection rendering uses derived metadata → evidence: provider-selection test and combined selector code → writeback target: `.bytetrue/architecture/providers.md` → applied.
- [x] MODIFIED: Claude provider settings search includes endpoints and models → evidence: `Search models and endpoints` browser snapshot and helper search code → writeback target: acceptance-only → applied.
- [x] REMOVED: generic front-end `Add custom provider` entry remains removed → evidence: old files deleted and grep reverse-check → writeback target: acceptance-only → applied.

**Reverse-check the mount points, removability**

- [x] Mount point `agents.providers.{internalId}`: actual landing is the provider override patch in `buildClaudeEndpointVariantPatch`; removing this config convention removes persisted endpoint variants.
- [x] Mount point `ProviderSnapshotEntry` metadata: actual landing is protocol/server `ProviderSnapshotEntry` plus snapshot manager propagation; removing these fields removes Claude-like rendering hints without changing base probing.
- [x] Mount point Claude provider settings UI: actual landing is `ProviderDiagnosticSheet` mounting `ClaudeEndpointsSection` and `ClaudeEndpointFormSubSheet`; removing this mount removes endpoint management from settings.
- [x] Mount point provider selection visuals: actual landing is `iconProviderId` propagation in provider-selection and combined-model selector rendering; removing it returns variants to generic fallback visuals.
- [x] Mount point global Add provider surface: old generic custom provider files/entry are removed; grep confirms no live `custom-provider-form` / `use-custom-provider-form` app source remains.
- [x] Reverse grep check: `rg "Claude endpoint variant|Claude endpoints|claudeEndpointVariant|paseoManagedKind|derivedFromProviderId|iconProviderId"` finds references within the listed mount points, docs/architecture/requirement updates, and tests. No extra unlisted production mount point was found.
- [x] Removal sandbox thought experiment: reversing the mount list removes persisted config convention, optional snapshot metadata, Claude settings management UI, selector visual treatment, and the prior generic custom-provider entry. Remaining references are docs/tests/accepted evidence only; no behavior mount remains.

## 3. Acceptance-scenario check

- [x] S1 Open Claude provider details with no managed variants → expected endpoint section above Discovered.
  - evidence source: agent-browser E2E screenshot `/tmp/claude-endpoint-e2e/screenshots/final-empty-clean.png` and snapshot text showing `Claude endpoints0Add endpointNo custom Claude endpoints yet`.
  - result: passed.

- [x] S2 Add endpoint with display name and all six fields → expected config override plus Claude-like provider.
  - evidence source: agent-browser E2E created `Claude via DeepSeek E2E`; settings provider list showed `Claude via DeepSeek E2E provider details`; helper test verifies exact provider override shape.
  - result: passed.

- [x] S3 Add endpoint with some fields blank → expected blank env omitted.
  - evidence source: `claude-endpoint-variants.test.ts` verifies blank model fields are omitted.
  - result: passed.

- [x] S4 Add endpoint with all env fields blank → expected provider override without `env`.
  - evidence source: `buildEnvPatch` returns `undefined` when all values are blank; `buildClaudeEndpointVariantPatch` only assigns `env` when present.
  - result: passed.

- [x] S5 Edit existing endpoint → expected form opens current values and API key masked/revealable.
  - evidence source: agent-browser E2E opened edit form, saw masked token, clicked eye, and observed `sk-e2e-secret`.
  - result: passed.

- [x] S6 Attempt to edit Internal ID → expected read-only in edit mode.
  - evidence source: `ClaudeEndpointFormSubSheet` passes `editable={mode === "add"}` for Internal ID. Browser editing attempt did not persist a changed id.
  - result: passed.

- [x] S7 Create duplicate Internal ID → expected inline validation.
  - evidence source: `validateClaudeEndpointVariantForm` unit test covers duplicate id error.
  - result: passed.

- [x] S8 Delete endpoint → expected destructive confirm and removal from section/provider selection.
  - evidence source: agent-browser E2E confirm dialog appeared, accepting it removed endpoint row and provider row; config grep found no residual test endpoint/token.
  - result: passed.

- [x] S9 Hand-written `extends: "claude"` provider without marker → expected not listed/edited.
  - evidence source: `listClaudeEndpointVariants` test excludes an unmarked derived Claude override.
  - result: passed.

- [x] S10 Search in Claude sheet → expected endpoint/model search.
  - evidence source: `listClaudeEndpointVariants` searches id/label/base URL and browser snapshot shows placeholder `Search models and endpoints`.
  - result: passed.

- [x] S11 Select `Claude via DeepSeek` when creating an agent → expected variant provider id with Claude adapter/env.
  - evidence source: provider registry derived-provider path unchanged; provider-selection test verifies variant keeps provider id while carrying `iconProviderId: "claude"`; browser provider list shows the saved variant as selectable provider details.
  - result: passed.

- [x] S12 Save endpoint → expected no network validation/test.
  - evidence source: save path only calls `patchConfig` and `refresh([providerId])`; grep found no `Test endpoint` or endpoint-validation UI/RPC.
  - result: passed.

**Frontend browser-eye verification**

- [x] UI area: Claude provider details and endpoint form verified through agent-browser against `http://localhost:19010` with dev daemon `127.0.0.1:6768`.
- [x] Browser errors: `agent-browser errors` produced no output. Console contained existing dev warnings/Expo route warnings and a React `uniProps` warning, but no endpoint-flow-blocking runtime error.
- [x] Screenshots: `/tmp/claude-endpoint-e2e/screenshots/advanced-not-expanding.png` and `/tmp/claude-endpoint-e2e/screenshots/final-empty-clean.png`.

## 4. Terminology consistency

- Provider: implementation keeps UI label "Provider" and does not introduce "model provider" as a user-facing substitute.
- Claude endpoint variant: code/docs use `Claude endpoint`, `Claude endpoints`, `claudeEndpointVariant`, and `paseoManagedKind` consistently for the approved concept.
- Internal ID: form uses `Internal ID` only in Advanced and edit mode makes it not editable; provider id remains a machine field.
- Managed marker: implementation uses `params.paseoManagedKind === "claudeEndpointVariant"` as the marker.
- Endpoint env fields: production form/helper exposes exactly six approved keys. `ANTHROPIC_MODEL` hits are limited to existing Claude settings discovery and a negative helper test; no production endpoint UI/helper field generates it.
- Anti-conflict grep: `rg "Base provider|custom-provider-form|use-custom-provider-form|Test endpoint" packages/app/src` found no live app implementation hits.

No terminology inconsistency remains.

## 5. Architecture merge

- [x] `.bytetrue/reference/domain-context.md`: term was already merged during design; acceptance verified the implementation still matches it.
- [x] `.bytetrue/architecture/custom-providers.md`: merged UI-managed Claude endpoint variant convention, constrained persisted override shape, six env fields, marker filtering rule, no-test/no-runtime-switch constraints, and deletion semantics.
- [x] `.bytetrue/architecture/providers.md`: merged optional `derivedFromProviderId` / `managedKind` provider snapshot metadata semantics and explicitly stated that these are client presentation/management hints that do not change probing/cache/process-spawn semantics.
- [x] `docs/custom-providers.md`: updated as user/developer documentation so the ordinary Claude endpoint path is the UI flow and raw config remains advanced.
- [x] `.bytetrue/architecture/ARCHITECTURE.md`: added a provider architecture decision link so the top-level architecture entry points readers to the finalized Claude endpoint variants decision.

After these writes, a reader who only reads architecture can understand that UI-managed Claude endpoint variants now exist, how they are persisted, how they are distinguished from hand-written overrides, and how clients render derived-provider metadata.

## 6. Requirement write-back

- [x] Design frontmatter requirement is `daemon-synced-settings`.
- [x] The requirement was already current, but this run changed its user-facing boundary by adding daemon-synced Claude endpoint variants.
- [x] `.bytetrue/requirements/daemon-synced-settings.md` was updated:
  - added a user story for configuring a named Anthropic-compatible Claude endpoint once and seeing it from any client attached to the daemon;
  - expanded the solution paragraph to include UI-managed Claude endpoint variants alongside host display name, model preferences/favorites, and cached provider models;
  - added a boundary note that endpoint `ANTHROPIC_*` variables are daemon-owned provider capability config, while daemon password/authorization credentials remain outside this feature;
  - appended a 2026-06-14 change log entry.

## 7. Roadmap write-back

- [x] Design frontmatter has empty `roadmap` and `roadmap_item` fields.
- [x] This feature did not start from a roadmap item.
- [x] Roadmap write-back skipped: not started from roadmap.

## 8. attention.md candidate review

- [x] No new attention.md candidate. This feature did not expose a recurring compile prerequisite, service startup rule, credential rule, or command pitfall that every future feature would likely step on.
- Existing relevant workflow knowledge was already captured separately: `.bytetrue/config.yaml` now uses local tracker/no sync, and long-term memory records that close-out should not prompt external tracker sync unless config changes.

## 9. Leftovers

- Later optimization points:
  - `provider-diagnostic-sheet.tsx` remains a large file and is a candidate for a future dedicated refactor into provider settings modules. This was already listed in design section 2.5 as beyond scope and was not refactored broadly here.
  - The endpoint form's Advanced section can sit below the visible viewport in a short browser window; the sheet is scrollable and `scrollintoview` made it usable during E2E. This is not blocking, but future polish could improve snap height/scroll positioning.
- Known limitations:
  - v1 is Claude-only.
  - No endpoint testing/probing.
  - No encrypted secret store change.
  - No runtime endpoint switch for already-running agents.
  - UI manages only marked `claudeEndpointVariant` overrides.
- While-here observations from implementation:
  - Existing dev console warnings include Expo route warnings and a React `uniProps` warning; they were not introduced by this endpoint flow and are outside this feature.
