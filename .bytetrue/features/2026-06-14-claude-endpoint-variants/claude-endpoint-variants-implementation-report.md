---
doc_type: feature-implementation-report
feature: 2026-06-14-claude-endpoint-variants
status: done
summary: Implemented Claude endpoint variants as UI-managed Claude provider overrides with structured env fields and Claude-like provider selection
---

# claude-endpoint-variants implementation report

## Implementation Completion Report

### Which files were changed

This run contains three groups of changes:

1. Claude endpoint variant implementation:
   - `docs/custom-providers.md`
   - `packages/app/src/components/combined-model-selector.tsx`
   - `packages/app/src/components/provider-diagnostic-sheet.tsx`
   - `packages/app/src/components/provider-settings/claude-endpoint-section.tsx`
   - `packages/app/src/components/provider-settings/claude-endpoint-variants.ts`
   - `packages/app/src/components/provider-settings/claude-endpoint-variants.test.ts`
   - `packages/app/src/provider-selection/provider-selection.ts`
   - `packages/app/src/provider-selection/provider-selection.test.ts`
   - `packages/protocol/src/agent-types.ts`
   - `packages/protocol/src/messages.ts`
   - `packages/protocol/src/messages.providers-snapshot.test.ts`
   - `packages/server/src/server/agent/agent-sdk-types.ts`
   - `packages/server/src/server/agent/provider-registry.ts`
   - `packages/server/src/server/agent/provider-snapshot-manager.ts`
   - `packages/server/src/server/agent/provider-snapshot-manager.test.ts`
   - `.bytetrue/features/2026-06-14-claude-endpoint-variants/*`

2. Explicitly requested rollback of the old generic custom provider UI:
   - removed `.bytetrue/features/2026-06-11-custom-provider-form/*`
   - removed `packages/app/src/hooks/use-custom-provider-form.*`
   - removed `packages/app/src/screens/settings/custom-provider-form.tsx`
   - updated `packages/app/src/screens/settings/providers-section.tsx`
   - updated `packages/app/src/screens/settings/providers-section.test.tsx`

3. Explicitly requested ByteTrue onboard refresh:
   - `.bytetrue/config.yaml`
   - refreshed `.bytetrue/reference/*` package-managed references
   - refreshed `.bytetrue/tools/*`
   - added missing ByteTrue skeleton directories and `.gitkeep` files

### Which functions / types changed, grouped by step

**Step 1: protocol/config skeleton and Claude endpoint helper**

- `packages/protocol/src/agent-types.ts` `ProviderSnapshotEntry`: added optional `derivedFromProviderId?: AgentProvider | null` and `managedKind?: string`.
- `packages/protocol/src/messages.ts` `ProviderSnapshotEntrySchema`: added optional `derivedFromProviderId` and `managedKind` schema fields.
- `packages/server/src/server/agent/agent-sdk-types.ts` `ProviderSnapshotEntry`: added matching optional metadata.
- `packages/server/src/server/agent/provider-registry.ts` `createRegistryEntry`: carries `managedKind` from resolved providers.
- `packages/server/src/server/agent/provider-registry.ts` `addDerivedProviders`: reads `params.paseoManagedKind` for derived providers.
- `packages/server/src/server/agent/provider-snapshot-manager.ts` `createLoadingEntries`, `seedSnapshotFromCache`, `reconcileSnapshotForRegistry`, `refreshProvider`, `mergeCachedLastKnownOnRefreshFailure`: preserve derived-provider metadata through snapshot states.
- `packages/app/src/components/provider-settings/claude-endpoint-variants.ts`: added `listClaudeEndpointVariants`, `generateClaudeEndpointInternalId`, `validateClaudeEndpointVariantForm`, and `buildClaudeEndpointVariantPatch`.

**Step 2: frontend static structure**

- `packages/app/src/components/provider-settings/claude-endpoint-section.tsx`: added `ClaudeEndpointsSection`, `ClaudeEndpointRow`, `ClaudeEndpointFormSubSheet`, section empty state, row layout, and form field layout.
- `packages/app/src/components/provider-diagnostic-sheet.tsx`: mounted `ClaudeEndpointsSection` only for `provider === "claude"`; split render helpers so endpoint section appears above discovered models and footer remains unchanged.

**Step 3: interaction logic**

- `packages/app/src/components/provider-settings/claude-endpoint-section.tsx` `ClaudeEndpointFormSubSheet`: implements add/edit modes, default hidden API key with eye toggle, generated internal id, advanced internal id section, validation errors, read-only internal id in edit mode, and form save/cancel behavior.
- `packages/app/src/components/provider-diagnostic-sheet.tsx` endpoint handlers: `handleOpenEndpointSheet`, `handleCloseEndpointSheet`, `handleEditEndpoint`, `handleDeleteEndpoint`, and `handleSaveEndpoint`.

**Step 4: daemon config patch integration**

- `packages/app/src/components/provider-diagnostic-sheet.tsx`: reads managed Claude endpoint variants from `config.providers`, saves via `patchConfig(buildClaudeEndpointVariantPatch(values))`, deletes via `patchConfig({ removeProviders: [variantId] })`, and refreshes only the affected provider id.

**Step 5: provider selection Claude-like visual integration**

- `packages/app/src/provider-selection/provider-selection.ts`: added `iconProviderId` to selector provider/model rows and propagates `entry.derivedFromProviderId` from provider snapshots.
- `packages/app/src/components/combined-model-selector.tsx`: model rows, grouped provider rows, selected trigger icon, and provider drill-down header icon now render with `iconProviderId ?? providerId`, preserving the launch provider id while showing Claude visuals for Claude endpoint variants.

**Step 6: verification and docs**

- `docs/custom-providers.md`: added UI-first `Claude endpoint variants` section and kept raw `extends` config as the advanced path.
- `.bytetrue/features/2026-06-14-claude-endpoint-variants/claude-endpoint-variants-checklist.yaml`: rollout steps marked done after verification.

### Did this touch files outside the plan?

Yes, intentionally and with explicit user direction:

- The old generic custom provider UI was removed before implementation by explicit user request.
- ByteTrue skeleton/reference/config files were updated by explicit user request to rerun onboard.

The Claude endpoint variant implementation itself stayed within the approved feature scope. No Codex/OpenCode/Pi endpoint support was added.

### Did this introduce any new concept or abstraction not present in the design doc?

No. New names map to approved design concepts:

- `Claude endpoint variant`
- `Internal ID`
- `managedKind` / `paseoManagedKind`
- `iconProviderId`, which is the implementation name for the design's optional icon/base-provider rendering hint

No new product concept was introduced.

### Implementation Review Gate

**Spec compliance**: passed

- behavior deltas satisfied: Claude provider details now has `Claude endpoints`; UI-managed variants can be selected as Claude-like providers; optional derived metadata exists in provider snapshots; generic custom provider UI remains removed.
- acceptance scenarios have evidence: helper tests, protocol/schema tests, server snapshot tests, provider-selection tests, settings regression tests, and agent-browser E2E evidence cover the designed scenarios.
- no extra behavior outside design: no Codex/OpenCode/Pi endpoint section, no endpoint test button/RPC, no raw env table, no `ANTHROPIC_MODEL` generation, and no runtime endpoint switch path were added.
- explicit non-goals guarded: grep confirmed no old `custom-provider-form`/`use-custom-provider-form` implementation remains under app source and no `Test endpoint`/`Base provider` UI was introduced.

**Code quality**: passed

- fresh verification: focused tests, build, typecheck, lint, and agent-browser E2E all ran after the final code changes.
- no debug/temp code: no temporary logging or debug code remains.
- no unplanned refactor: `ProviderModalBody` was split only into local render helpers to satisfy lint complexity and keep the new endpoint code isolated; no broad provider sheet file move was performed.
- reflection checks handled: large-file/complexity and React perf lint signals were handled with scoped helper extraction and stable props.
- naming and module boundaries consistent: new user-facing terms match design terminology and endpoint-specific UI lives under `packages/app/src/components/provider-settings/`.

### Reflection-check self-audit

- Large file / complexity signal fired in `provider-diagnostic-sheet.tsx`; handled by extracting render-only helpers and keeping endpoint-specific components in `provider-settings/`.
- React perf lint signal fired for inline JSX/function/array props; handled by extracting handlers and static style constants.
- Scope guard signal was reviewed: no generic custom provider UI, no endpoint testing, no raw env table, and no v1 support for Codex/OpenCode/Pi were added.

No unhandled stop signal remains.

### Exit-signal verification for rollout order

1. protocol/config skeleton — done
   - `packages/protocol/src/messages.providers-snapshot.test.ts`: 8 passed
   - `packages/server/src/server/agent/provider-snapshot-manager.test.ts`: 31 passed
   - `packages/app/src/components/provider-settings/claude-endpoint-variants.test.ts`: 4 passed

2. frontend static structure — done
   - Claude sheet mounts `Claude endpoints` above discovered models.
   - Footer remains `Add model / Diagnostic / Refresh`.
   - app typecheck passed.

3. interaction logic — done
   - add/edit form validates display name, duplicate id, id format.
   - API key defaults hidden and can be revealed.
   - advanced internal id is visible after expanding; edit-mode internal id is not the normal save path.
   - delete uses `confirmDialog`.

4. state integration — done
   - add/edit writes provider patch.
   - delete uses `removeProviders`.
   - list only reads marked Claude endpoint variants.
   - helper tests cover blank omission and marker filtering.

5. provider selection visual integration — done
   - selector rows carry `iconProviderId`.
   - combined selector renders icons with `iconProviderId ?? provider`.
   - provider-selection tests cover Claude-derived variant metadata.

6. verification and docs — done
   - docs updated.
   - lint/typecheck pass.
   - focused tests pass.
   - checklist YAML validates.

### Acceptance-scenario self-check

- S1 Open Claude provider details with no managed variants: passed by agent-browser and screenshot `/tmp/claude-endpoint-e2e/screenshots/final-empty-clean.png`.
- S2 Add endpoint with display name and all six env fields: passed by agent-browser; provider row and config-backed list appeared after save.
- S3 Add endpoint with blank fields: `buildClaudeEndpointVariantPatch` test proves blank env keys are omitted.
- S4 Add endpoint with all fields blank: helper omits `env` when no entries exist; form allows saving with display name only.
- S5 Edit existing endpoint: passed by agent-browser; edit form loads current values and API key is masked by default.
- S6 Attempt to edit Internal ID: advanced internal id is not in the normal save path and edit mode passes `editable={false}` for the field.
- S7 Create with duplicate Internal ID: `validateClaudeEndpointVariantForm` test covers duplicate blocking.
- S8 Delete endpoint: passed by agent-browser; confirm dialog appears and accept removes row/provider.
- S9 Hand-written unmarked `extends: "claude"`: `listClaudeEndpointVariants` test excludes it.
- S10 Search in Claude sheet: helper searches endpoint id/label/base URL; sheet placeholder changes to `Search models and endpoints`.
- S11 Select saved endpoint when creating an agent: provider-selection test covers own provider id plus Claude icon metadata; derived provider launch path is unchanged and covered by existing provider registry semantics.
- S12 Save endpoint does not test network: save path only calls daemon config patch and targeted refresh; no `Test endpoint` UI/RPC was added.

Frontend browser-eye verification:

- App: `http://localhost:19010`
- Dev daemon: `127.0.0.1:6768`
- agent-browser session: `paseo-claude-endpoint-e2e`
- Evidence screenshots:
  - `/tmp/claude-endpoint-e2e/screenshots/advanced-not-expanding.png` — showed that Advanced needed scroll in short viewport before it could be clicked.
  - `/tmp/claude-endpoint-e2e/screenshots/final-empty-clean.png` — final cleaned state after endpoint deletion.
- Observed issue and remedy during E2E: the Advanced button was below the visible viewport in a 1280x639 browser, so direct click hit outside the viewport. `scrollintoview` made it clickable; after removing a narrow `alignSelf` button style, the form still behaves correctly and the short-viewport behavior is recorded as a non-blocking UX note.
- Browser errors: `agent-browser errors` had no output. Console had existing dev warnings/Expo route warnings and a React `uniProps` warning, but no endpoint-flow-blocking runtime error appeared.

### TDD / red-green evidence

- Red: missing `buildClaudeEndpointVariantPatch` → Green: helper implemented and `claude-endpoint-variants.test.ts` passed.
- Red: provider snapshot schema dropped `derivedFromProviderId` / `managedKind` → Green: protocol schema/types updated and `messages.providers-snapshot.test.ts` passed.
- Red: snapshot manager did not preserve derived metadata → Green: registry/snapshot manager propagated metadata and `provider-snapshot-manager.test.ts` passed.
- Red: missing marker filtering/id/validation helpers → Green: helper tests passed.
- Red/green for selector metadata: `provider-selection.test.ts` covers `iconProviderId: "claude"` for Claude endpoint variants.

### Verification commands

Passed:

```bash
cd packages/app && npm run test -- src/screens/settings/providers-section.test.tsx --bail=1
cd packages/app && npm run test -- src/components/provider-settings/claude-endpoint-variants.test.ts --bail=1
cd packages/app && npm run test -- src/provider-selection/provider-selection.test.ts --bail=1
npx vitest run packages/protocol/src/messages.providers-snapshot.test.ts --bail=1
npx vitest run packages/server/src/server/agent/provider-snapshot-manager.test.ts --bail=1
npm run build:server
npm run typecheck
npm --workspace-root run lint
python3 .bytetrue/tools/validate-yaml.py --file .bytetrue/features/2026-06-14-claude-endpoint-variants/claude-endpoint-variants-checklist.yaml --yaml-only
```
