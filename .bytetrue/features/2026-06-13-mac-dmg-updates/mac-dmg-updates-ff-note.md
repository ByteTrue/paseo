---
doc_type: feature-ff-note
feature: 2026-06-13-mac-dmg-updates
status: done
date: 2026-06-13
requirement:
tags: [desktop, updates, macos]
---

## What Was Done

macOS desktop updates now keep the existing release discovery and rollout flow, then download and open the matching DMG installer so users can drag the new app over the old one without relying on signed in-place auto-update.

## What Changed

- `packages/desktop/src/features/app-update-service.ts` — added an optional manual installer path while preserving the existing `quitAndInstall` path for non-macOS clients.
- `packages/desktop/src/features/mac-dmg-update-installer.ts` — resolves the DMG asset from the update manifest, downloads it, opens it, stops the managed daemon, and quits Paseo.
- `packages/app/src/desktop/updates/*` and `packages/app/src/screens/settings-screen.tsx` — updated macOS update labels and confirmation copy to describe downloading/opening the installer.
- `docs/release.md` — documented that macOS installs via the release DMG while Windows/Linux keep automatic install behavior.

## How It Was Verified

Ran targeted Vitest coverage for the update service, DMG URL resolver, and update callout labels, plus targeted Playwright coverage for `desktop-updates.spec.ts`. Then ran `npm run format`, `npm run typecheck`, `npm --workspace-root run lint`, and `git diff --check` successfully.

## While Here I Noticed, optional, non-blocking

- None.
