---
doc_type: feature-acceptance
feature: 2026-06-12-lean-client-surface
status: accepted
accepted: 2026-06-12
summary: Official native Android/iOS client surfaces were removed; Web/mobile web, Electron desktop, CLI, and legacy protocol parsing remain.
tags: [client-surface, mobile-web, desktop, release, cleanup]
---

# Lean Client Surface Acceptance Report

> Stage: stage 3, acceptance closure
> Acceptance date: 2026-06-12
> Related design doc: `.bytetrue/features/2026-06-12-lean-client-surface/lean-client-surface-design.md`

## 1. Interface-contract check

### Check interface examples one by one

- [x] Release tag parser, `scripts/release-version-utils.mjs normalizeReleaseTag`: design example says `normalizeReleaseTag("android-v0.1.93")` should throw after the cleanup. Actual code no longer includes the `android-` prefix in `sourceTagPattern`, and `scripts/release-version-utils.test.mjs` has `rejects Android release retry tags`; `node --test scripts/release-version-utils.test.mjs` passed.
- [x] App config, `packages/app/app.config.js default export`: design example says Expo config should keep web/router shared config and remove iOS/Android/EAS/native plugin config. Actual code contains `expo.web`, `expo-router`, typed routes, React compiler, and no `ios`, `android`, EAS project, camera, notifications, audio, or build-properties plugin config.
- [x] Session provider, `packages/app/src/contexts/session-context.tsx`: design example says app runtime should keep `useClientActivity(...)` and remove `usePushTokenRegistration(...)`. Actual code keeps heartbeat/client activity and no longer imports or calls `usePushTokenRegistration`.

### Check current state → change in the term layer one by one

- [x] Release target vocabulary: root and app Android/iOS scripts, APK script, and Android retry tag vocabulary were removed. `scripts/release-android-apk-local.sh` was deleted; `android-v...` is rejected by test; `docs/release.md` no longer documents Android APK release paths.
- [x] Expo native app vocabulary: `packages/app/eas.json` was deleted; `packages/app/app.config.js` is web/shared-renderer only; `scripts/dev-app.sh` no longer sets `APP_VARIANT`.
- [x] Native-only app implementation vocabulary: native-only source/test/workspace files were deleted, including `.native/.ios/.android` app source files, `packages/app/maestro/**`, `packages/app/modules/paseo-hardware-keyboard/**`, and `packages/expo-two-way-audio/**`.
- [x] Official surface copy: website download UI, README, SECURITY, public docs, release docs, and issue template no longer advertise Android/iOS native clients as official surfaces.
- [x] Legacy protocol vocabulary: `clientType: "mobile"`, heartbeat `deviceType: "mobile"`, and `register_push_token` remain accepted in protocol/client/server code.

### Check the flow diagram

- [x] `A → B` remove release/build entry points: landed in `package.json`, `packages/app/package.json`, `scripts/release-version-utils.mjs`, deleted `scripts/release-android-apk-local.sh`.
- [x] `B → C` prune native config/tests/source/workspace deps: landed in `packages/app/app.config.js`, deleted `packages/app/eas.json`, `packages/app/maestro/**`, native source files, and `packages/expo-two-way-audio/**`.
- [x] `C → D` update website/public/product/release/docs/issue template: landed in `packages/website/src/**`, `public-docs/**`, `README.md`, `SECURITY.md`, `.github/ISSUE_TEMPLATE/bug-report.yml`, `docs/product.md`, `docs/architecture.md`, `docs/release.md`.
- [x] `D → E` verification: lint, typecheck, app-deps build, release utility test, website build, YAML validation, and targeted grep checks ran.
- [x] `E → F yes` protocol compatibility: protocol/client/server still accept legacy `mobile` and `register_push_token` values.

## 2. Behavior and decision check

### Verify the requirement summary one by one

- [x] Official surfaces become browser Web/mobile web/PWA, Electron desktop, and CLI. Evidence: docs/website/README/release copy now describe those surfaces; download page exposes desktop, web, and server/CLI paths.
- [x] Native Android/iOS maintenance and distribution are removed. Evidence: Android/iOS scripts removed, EAS config deleted, APK release script deleted, native module workspace deleted, native-only app files deleted, release docs no longer require APK/EAS/TestFlight/App Store.
- [x] `packages/app` still builds for Web and remains the shared renderer. Evidence: `packages/app` remains in workspace graph with web/build/typecheck scripts; `npm run typecheck` passed; `npm run build:app-deps` passed; desktop build script still exports `packages/app` as web with `PASEO_WEB_PLATFORM=electron`.
- [x] Mobile web/compact responsive behavior remains. Evidence: compact/mobile-web code terms are intentionally still present; no broad `mobileView`/compact layout deletion occurred.
- [x] Protocol/server compatibility is not broken. Evidence: protocol enum values and server `register_push_token` handler remain.

### Check explicit non-goals one by one

- [x] Do not delete `packages/app`: package remains and typechecks.
- [x] Do not delete mobile web/PWA responsive UI: compact/mobile-web code remains; website/README now explicitly point phone use at the web/PWA path.
- [x] Do not remove Electron desktop: `packages/desktop` untouched as a surface; root `build:desktop` remains.
- [x] Do not remove CLI: `packages/cli` and npm publish list remain.
- [x] Do not narrow protocol enums/messages: `packages/protocol/src/messages.ts` still accepts `clientType: "mobile"` and heartbeat `deviceType: "mobile"`.
- [x] Do not keep app-side Expo push-token registration: app-side hook was removed, while daemon/protocol compatibility remains.
- [x] Do not rewrite compact layout code merely because names contain `mobile`: no broad rename/deletion was performed.
- [x] Do not remove relay/pairing/phone-browser language when it refers to mobile web/PWA: docs now say browser/PWA for phone use and retain relay concepts.

### Landing of key decisions

- [x] Full native-client prune: landed as deletion of native build/release/config/source/test/workspace surfaces.
- [x] Keep protocol compatibility but remove official client usage: protocol/server/client parser paths remain; official app no longer imports app-side Expo push-token registration.
- [x] Delete/simplify, no replacements: no new native feature flag, fallback release path, or new distribution path was added.
- [x] Docs and website are product boundary: website, public docs, README, SECURITY, issue template, and release docs were updated.
- [x] Do not rename mobile-web layout terms: compact/mobile terms remain where they refer to phone-sized UI.

### Check current state → change in the orchestration layer one by one

- [x] Package/build graph path: root workspace no longer includes `packages/expo-two-way-audio`; `build:app-deps` no longer builds it; app native deps/scripts were removed.
- [x] Release path: Android APK upload script removed; Android retry tag removed; release docs/checklists no longer mention APK/EAS/TestFlight/App Store.
- [x] App runtime path: native-selected files, push-token registration, native camera route, native audio, native terminal WebView, and native markdown implementation files were removed.
- [x] Documentation/marketing path: copy no longer claims official native Android/iOS support.

### Check flow-level constraints

- [x] Compatibility: protocol and server parsing remain backward-compatible for legacy mobile/push-token messages.
- [x] Scope safety: `packages/app`, mobile web/compact UI, Electron desktop, and CLI remain.
- [x] Release correctness: no release checklist requires APK/EAS/TestFlight/App Store; no website download path points at an Android APK.
- [x] Package graph correctness: lockfile updated after workspace/dependency removal; `npm run build:app-deps` passes.
- [x] Observability: targeted grep and package checks ran; remaining native/iOS hits are legacy gotcha comments or unrelated words such as `release`/`reason`, not official support promises.

### Reverse-check the mount points, removability

- [x] Mount point `package.json` root scripts/workspaces: actual landing point is root `package.json`; removing this mount removes native workspace/build/script entry points.
- [x] Mount point `packages/app/package.json` / `app.config.js` / `eas.json`: app package and config were simplified and `eas.json` deleted; removing this mount removes native app config/build-profile entry points.
- [x] Mount point release utilities/scripts: `release-version-utils.mjs` and `scripts/release-android-apk-local.sh`; removing this mount removes Android retry/release path.
- [x] Mount point website download/public metadata: `packages/website/src/downloads.tsx`, `routes/download.tsx`, `site-footer.tsx`, `llms.ts`, route metadata; removing this mount removes user-visible native download actions.
- [x] Mount point documentation/support: `docs/product.md`, `docs/architecture.md`, `docs/release.md`, deleted `docs/android.md`/`docs/mobile-testing.md`, `public-docs/**`, README/SECURITY, issue template; removing this mount removes official support promises.
- [x] Reverse grep check: references to native mobile support were checked with targeted grep for `Android APK`, `EAS`, `TestFlight`, `App Store`, `production-apk`, `release-android-apk-local`, and `android-v`. Remaining hits are either the release utility negative test or unrelated words/gotcha comments, not support promises.
- [x] Removal sandbox thought experiment: reversing the mount-point list would restore all externally visible/native build, release, config, website, and doc promises. Internal deleted files under app/native and `packages/expo-two-way-audio` are implementation cleanup under those mount points and do not introduce an extra user-facing mount.

## 3. Acceptance-scenario check

- [x] **S1**: download page implementation after cleanup → desktop, web, and server/CLI paths remain; Android APK and iOS rows are gone.
  - evidence source: source review, website typecheck, website production build, targeted grep
  - result: passed. `packages/website/src/routes/download.tsx` has no Android/iOS mobile section; `packages/website/src/downloads.tsx` has no `androidApk`; `npm run build --workspace=@bytetrue/website` passed.
  - browser verification: attempted to render the local dev download route in Playwright. The normal route failed before rendering because the root loader's live GitHub API call returned `github releases 403`; a direct component fixture also failed because Vite served a dependency default-import mismatch. This is recorded in leftovers as a verification-environment limitation. The production website build and route-source checks passed.

- [x] **S2**: release helper/tag parser with Android retry tag removed → `android-vX.Y.Z` is no longer accepted while normal and desktop retry tags still work.
  - evidence source: unit test
  - result: passed. `node --test scripts/release-version-utils.test.mjs` passed 7/7.

- [x] **S3**: root and app package scripts → no official Android/iOS/EAS/APK/TestFlight/App Store commands remain.
  - evidence source: package JSON review and targeted grep
  - result: passed.

- [x] **S4**: workspace graph → no deleted native-only workspace remains in workspaces or `build:app-deps`.
  - evidence source: Node package graph assertion and `npm run build:app-deps`
  - result: passed.

- [x] **S5**: app config → no official iOS/Android/EAS/native notification/camera/native build profile config remains.
  - evidence source: app config review and targeted grep
  - result: passed.

- [x] **S6**: native-only files and Maestro/native mobile tests are removed.
  - evidence source: git diff and `find packages/app/src` native-extension check
  - result: passed. No `.native`, `.ios`, or `.android` app source files remain under `packages/app/src`.

- [x] **S7**: app runtime no longer imports/calls Expo push-token registration.
  - evidence source: grep
  - result: passed. `usePushTokenRegistration` file is deleted and not imported.

- [x] **S8**: targeted grep for official support promises has no unclassified native support promise.
  - evidence source: grep
  - result: passed. Remaining native/iOS hits are legacy comments/gotchas or unrelated words, not support promises.

- [x] **S9**: generic `mobile`/`phone` terms are classified.
  - evidence source: grep review
  - result: passed. Remaining uses are mobile web/PWA, compact layout, legacy protocol compatibility, competitor descriptions, or phone-browser copy.

- [x] **S10**: web app and Electron shared renderer stay healthy.
  - evidence source: typecheck/build
  - result: passed. `npm run typecheck` and `npm run build:app-deps` passed.

- [x] **S11**: protocol schemas retain legacy mobile/push-token compatibility.
  - evidence source: grep
  - result: passed. `packages/protocol/src/messages.ts` and server/client code still accept legacy values/messages.

## 4. Terminology consistency

- `Native mobile client surface`: code/documentation references to official Android/iOS build/release/test/source paths were removed; remaining design/report mentions are archival and intentional.
- `Mobile web / PWA`: website/docs now point phone use at browser/PWA, and compact/mobile layout terms remain.
- `Shared app renderer`: `packages/app` remains the web/shared desktop renderer; docs and architecture now describe it that way.
- `Legacy mobile protocol values`: protocol `mobile` values remain and are documented in architecture as compatibility-only.
- Anti-conflict grep: broad native-support terms no longer appear as support promises in website/docs/release/issue-template. Remaining `mobile`/`phone` terms are classified as mobile web/PWA, compact layout, legacy protocol, or competitor/marketing text.

## 5. Architecture merge

- [x] `.bytetrue/architecture/ARCHITECTURE.md`: merged client-surface topology and compatibility rule. The App component now explicitly says native Android/iOS builds are not official client surfaces, phone usage is browser/mobile-web PWA, and legacy `mobile`/push-token protocol values remain accepted only for compatibility.
- [x] `docs/architecture.md`: merged public architecture topology to Web App / CLI / Desktop App and changed `packages/app` to Web client + shared desktop renderer.
- [x] `docs/product.md`: current state now says Desktop, mobile web/PWA, browser web, CLI, and no separate mobile-store release surface.
- [x] `docs/release.md`: release model now says browser web/mobile web, Electron desktop, and npm/CLI packages; no APK/EAS/TestFlight/App Store release flow remains.
- [x] Deleted docs: `docs/android.md` and `docs/mobile-testing.md` were removed because native Android/iOS app build/test workflows are no longer official architecture/process knowledge.

A reader who only opens architecture/release docs can now see that the current official client topology is Web/mobile-web, CLI, and Electron desktop, while legacy protocol `mobile` remains a compatibility input rather than a shipped app surface.

## 6. Requirement write-back

- [x] Design frontmatter points to `requirement: lean-client-surface`.
- [x] `.bytetrue/requirements/lean-client-surface.md` was upgraded from `status: draft` to `status: current`.
- [x] The original user stories, need, solution, and boundaries were preserved.
- [x] A `Change Log` entry was appended for 2026-06-12 noting that the official client-surface cleanup was implemented and that legacy protocol parsing stays compatible.
- [x] `.bytetrue/requirements/VISION.md` was updated: `lean-client-surface` moved from Draft to Current.

## 7. Roadmap write-back

- [x] Not started from roadmap. The design frontmatter has no `roadmap` or `roadmap_item`, so roadmap write-back is skipped.

## 8. attention.md candidate review

- [x] Candidate exists, but not written automatically.
  - Candidate 1: native Android/iOS clients are not official release surfaces; future work should preserve mobile web/PWA and legacy protocol parsing but avoid adding new native-mobile build/release dependencies unless native support is explicitly reintroduced. Recommended placement: `.bytetrue/attention.md` → `### 其他`.

## 9. Leftovers

- Later optimization points:
  - `packages/website/src/components/landing-page.tsx`, `packages/app/src/app/_layout.tsx`, and `packages/app/src/contexts/session-context.tsx` remain large; design 2.5 already marked these as future refactor candidates, not part of this feature.
- Known limitations:
  - Browser-eye verification of `/download` could not run through the normal dev route because the root loader's live GitHub API call returned `github releases 403`. Production website build, website typecheck, and source/grep checks passed; this is a verification-environment limitation rather than implementation drift.
- While-here observations:
  - None fixed secretly. No unrelated refactor was performed.
