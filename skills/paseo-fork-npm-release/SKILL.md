---
name: paseo-fork-npm-release
description: Release @bytetrue packages from the ByteTrue/paseo fork through npm Trusted Publishing CI.
---

# Paseo Fork NPM Release

## When to Use

Use this skill when issuing, testing, or debugging patch/minor/major npm releases for the ByteTrue/paseo fork and its `@bytetrue` workspace packages.

## Procedure

1. Work in `/Users/byte/workspace/forks/paseo` on `main`. Push release changes only to `origin`, which is `ByteTrue/paseo`, unless the user explicitly asks for upstream.
2. Confirm the worktree and release baseline:
   ```bash
   git status --short --branch
   git remote -v
   node -p "require('./package.json').version"
   ```
3. Run the requested release command:
   ```bash
   npm run release:patch
   # or: npm run release:minor
   # or: npm run release:major
   ```
   These scripts run `release:check`, bump all workspace versions, commit, tag, and push. npm publishing is handled by the tag-triggered GitHub Actions workflow.
4. Monitor the npm workflow:
   ```bash
   gh run list --repo ByteTrue/paseo --workflow publish-npm.yml
   gh run view RUN_ID --repo ByteTrue/paseo --json status,conclusion,url,jobs
   ```
5. Verify npm package availability after the workflow succeeds:
   ```bash
   for p in highlight relay protocol client server cli; do
     npm view "@bytetrue/$p@VERSION" version
   done
   ```
6. If a publish run partially succeeds and a rerun hits already-published versions, rely on `scripts/publish-workspaces.mjs --provenance`. `release:publish:ci` uses this resumable path and skips workspace versions already visible in npm.

## Pitfalls

- Do not push release changes to upstream `getpaseo/paseo` for this fork flow.
- Trusted Publishing needs GitHub OIDC permissions and npm CLI support. `publish-npm.yml` should use Node `24.15.0` or another runtime with npm 11+.
- Each published workspace `package.json` must include repository metadata matching the GitHub provenance source. npm provenance rejects an empty workspace `repository.url` even if the root package has a correct repository.
- A failed Publish NPM run may have already published earlier packages. Always check each package with `npm view` before rerunning or changing versions.
- The public `@bytetrue/expo-two-way-audio` workspace exists but is not currently part of the npm publish script. Add it only after an explicit release-surface decision.
- Tag pushes also trigger unrelated workflows such as Android APK Release, Deploy App, Desktop Release, and Release Notes Sync. For npm release validation, focus on `Publish NPM` unless the user asks for full release triage.

## Verification

- `git status --short --branch` is clean and `main` matches `origin/main`.
- `git rev-list -n1 vX.Y.Z` resolves to the intended release commit.
- The `Publish NPM` GitHub Actions run concludes `success`.
- `npm view` confirms `@bytetrue/highlight`, `@bytetrue/relay`, `@bytetrue/protocol`, `@bytetrue/client`, `@bytetrue/server`, and `@bytetrue/cli` all expose the new version.
