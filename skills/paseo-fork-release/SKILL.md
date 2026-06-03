---
name: paseo-fork-release
description: Release the ByteTrue Paseo fork to npm and Cloudflare. Use when bumping @bytetrue packages, publishing the CLI, or debugging fork CI/CD release failures.
---

Use this skill for the ByteTrue fork at `/Users/byte/workspace/forks/paseo`.

## Release Model

- Fork remote: `origin` -> `https://github.com/ByteTrue/paseo.git`.
- Upstream remote: `upstream` -> `https://github.com/getpaseo/paseo.git`.
- Public npm scope: `@bytetrue`.
- CLI binary name remains `paseo`.
- Main web app Pages project: `paseo-zijieapi-de5-net`.
- App URL: `https://paseo.zijieapi.de5.net`.
- Relay Worker host: `relay.paseo.zijieapi.de5.net:443`.
- Website Worker: `paseo-website.bytetrue.workers.dev`.
- This fork ships browser web + Electron desktop only. There is no native iOS/Android client, no EAS/App Store/Play Store flow, and no Android APK release path.

## Publishable Packages

Publish these workspace packages in dependency order:

1. `@bytetrue/highlight`
2. `@bytetrue/relay`
3. `@bytetrue/protocol`
4. `@bytetrue/client`
5. `@bytetrue/server`
6. `@bytetrue/cli`

Do not publish private packages such as app, website, or desktop.

Do not recreate deleted native-mobile release surfaces while doing release work. In particular, do not reintroduce `packages/app/fastlane`, `packages/app/maestro`, EAS config, App Store / Play Store references, or Android APK release automation unless the user explicitly changes strategy.

## NPM Trusted Publishing

The repo uses `.github/workflows/publish-npm.yml` with GitHub OIDC and npm Trusted Publishing.

Each publishable npm package must have a Trusted Publisher connection:

- Owner/repository: `ByteTrue/paseo`
- Workflow file: `publish-npm.yml`
- Environment: blank
- Permission: `npm publish`

No long-lived npm token is required. Local npm OTP/passkey is not used by the CI publish workflow.

## One-Command Patch Release

From the fork root:

```bash
cd /Users/byte/workspace/forks/paseo
git status -sb
npm run release:patch
```

This runs release checks, bumps all workspace versions, commits the release, pushes `main`, and pushes a `vX.Y.Z` tag. The tag triggers `Publish NPM`, `Desktop Release`, and `Release Notes Sync` in GitHub Actions for this fork. It does not trigger any native-mobile-client release flow.

Use `release:minor`, `release:major`, or `release:promote` only when that is the intended version move.

## Verification

After a release tag is pushed:

```bash
gh run list -R ByteTrue/paseo --limit 8
npm view @bytetrue/cli version
npm view @bytetrue/server version
```

Expected:

- `Publish NPM` succeeds.
- All six publishable packages show the new version.
- `origin/main` and local `main` are aligned and clean.

## Failure Recovery

If npm publish fails midway, do not bump again immediately. The CI script `scripts/publish-workspaces.mjs` is resumable: it skips package versions that already exist on npm and publishes only missing packages.

To retry the same failed version after fixing CI metadata:

```bash
git tag -f vX.Y.Z
git push origin main
git push -f origin vX.Y.Z
```

Common failures:

- `404 '@bytetrue/<pkg>@<version>' is not in this registry` during provenance publish: usually package repository metadata or Trusted Publishing configuration is wrong.
- Version already exists: a previous run partially succeeded; retry with the resumable publish script instead of re-running raw `npm publish` chains.
- Node/npm too old: Trusted Publishing needs the workflow's npm 11 path. The publish workflow uses Node `24.15.0`.

## Cloudflare Release Notes

Cloudflare deploys are separate workflows:

- `deploy-app.yml` deploys the browser web app from `packages/app` to `paseo-zijieapi-de5-net`.
- `deploy-relay.yml` deploys `packages/relay` to the ByteTrue account.
- `deploy-website.yml` deploys `packages/website` to the ByteTrue account.

Required GitHub secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The old `weekly-upstream-pages-deploy.yml` upstream-sync workflow was removed; this fork deploys its own `main` and release tags.
