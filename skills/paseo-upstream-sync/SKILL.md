---
name: paseo-upstream-sync
description: Review upstream getpaseo/paseo changes with an upstream cursor branch, reuse selected commits in the ByteTrue fork, and preserve fork-specific package, deployment, and release behavior.
---

# Paseo Upstream Sync

## When to Use

Use this skill when `getpaseo/paseo` has new commits and the ByteTrue fork needs to decide which upstream work can be reused.

This is not a merge-upstream workflow. The sync branch is an upstream review cursor, not a branch to compare against fork `main`.

## Mental Model

- `origin/main` is the ByteTrue fork main branch.
- `upstream/main` is the upstream project.
- `origin/upstream-sync` records the last upstream commit that has been reviewed.
- New upstream work is discovered with `upstream-sync..upstream/main`.
- Reusable upstream commits are cherry-picked onto a separate fork branch such as `reuse-upstream-YYYYMMDD`.
- After the reviewed commits have been classified and the reusable branch has been merged or deliberately abandoned, advance `upstream-sync` to the reviewed upstream commit.

This keeps future reviews small even if the fork and upstream diverge heavily.

## Fork Invariants

Preserve these unless the user explicitly changes strategy:

- Push only to `origin` (`ByteTrue/paseo`), not upstream.
- Keep npm scope `@bytetrue`; the CLI binary remains `paseo`.
- Keep app URL `https://paseo.zijieapi.de5.net`.
- Keep relay endpoint `relay.paseo.zijieapi.de5.net:443` and TLS for the hosted relay.
- Keep npm publishing through `.github/workflows/publish-npm.yml` with GitHub OIDC Trusted Publishing.
- Keep `scripts/publish-workspaces.mjs` resumable publishing behavior.
- Keep published package repository metadata aligned with `https://github.com/ByteTrue/paseo` / `.git` as already used in the fork.
- This fork does not ship native iOS/Android clients. Preserve browser web + Electron only; do not reintroduce App Store / Play Store / EAS release flows, `packages/app/fastlane`, `packages/app/maestro`, native Expo client modules, or mobile-only routes unless the user explicitly changes strategy.

## Procedure

1. Start clean on fork `main`:
   ```bash
   cd /Users/byte/workspace/forks/paseo
   git status --short --branch
   git fetch origin '+refs/heads/*:refs/remotes/origin/*' --no-tags
   git fetch upstream main --no-tags
   git switch main
   git pull --ff-only origin main
   ```
2. If `origin/upstream-sync` does not exist yet, initialize it to the current fork/upstream merge base:
   ```bash
   git branch upstream-sync $(git merge-base origin/main upstream/main)
   git push origin upstream-sync
   ```
3. Inspect new upstream work from the cursor, not from fork main:
   ```bash
   git log --reverse --oneline upstream-sync..upstream/main
   git diff --stat upstream-sync..upstream/main
   ```
4. Classify upstream commits:
   - Reuse: feature commits, bug fixes, tests, docs that apply to the fork.
   - Rewrite while reusing: commits that touch package names, domains, release scripts, daemon pairing, service URLs, CI, or assumptions about native mobile vs browser web surfaces.
   - Skip: upstream version bumps, upstream changelog-only commits, upstream Nix hash-only commits, release tags, and upstream native-mobile-client work that would reintroduce iOS/Android app codepaths or store/release tooling into this fork.
5. Create a candidate branch from fork main:
   ```bash
   git switch -c reuse-upstream-YYYYMMDD main
   ```
6. Cherry-pick reusable commits in upstream order:
   ```bash
   git cherry-pick -x <commit>
   ```
7. Resolve conflicts by taking upstream behavior but reapplying fork invariants. Common fixes:
   - Replace `@getpaseo/` imports with `@bytetrue/`.
   - Preserve `relay.paseo.zijieapi.de5.net:443` and `https://paseo.zijieapi.de5.net` in runtime defaults and daemon pairing tests.
   - Keep fork release scripts and `publish-npm.yml` intact.
   - Keep browser-web pairing/device-copy flows, but do not restore deleted native mobile routes, native client dependencies, mobile test harnesses, or mobile store release automation.
   - If protocol types changed, run `npm run build --workspace=@bytetrue/protocol` before cross-workspace typecheck.
   - If client imports relay runtime code, ensure `build:client` builds relay before client.
8. Refresh dependencies when package manifests changed:
   ```bash
   npm install --ignore-scripts --include-workspace-root
   ```
9. Verify fork invariants:
   ```bash
   /usr/bin/grep -R "@getpaseo/" -n package.json package-lock.json packages/*/src scripts .github nix flake.nix || true
   /usr/bin/grep -R "relay\.paseo\.sh\|https://app\.paseo\.sh" -n packages/*/src scripts .github || true
   /usr/bin/grep -R "packages/app/fastlane\|packages/app/maestro\|expo-notifications\|expo-camera\|expo-audio\|react-native-webview\|react-native-uitextview" -n package.json package-lock.json packages/app .github docs public-docs packages/website || true
   ```
   Review hits; tests and docs may intentionally mention upstream GitHub URLs, but runtime package imports, app/relay defaults, and the no-native-mobile-client fork policy must stay intact.
10. Run validation:
    ```bash
    npm run format:check
    npm run typecheck
    npm run release:check
    npm run test:unit --workspace=@bytetrue/server -- src/server/bootstrap.smoke.test.ts
    ```
11. Push the candidate branch and open a PR to `ByteTrue/paseo:main`:
    ```bash
    git push origin reuse-upstream-YYYYMMDD
    gh pr create --repo ByteTrue/paseo --base main --head reuse-upstream-YYYYMMDD
    ```
12. Wait for CI. If CI fails, use job logs, reproduce locally with a clean clone and Node 22 when needed, patch the candidate branch, and rerun checks.
13. Merge the PR only after CI is green.
14. Advance the cursor after the upstream range has been reviewed:
    ```bash
    git branch -f upstream-sync upstream/main
    git push --force origin upstream-sync
    ```

## Pitfalls

- Do not `git merge upstream/main` into fork main. That makes the diff enormous and mixes fork-only changes with upstream review.
- Avoid fetching upstream tags into local fork release work. Upstream tags like `v0.1.89` can collide with fork release tags.
- Clean CI can expose missing workspace build steps that local dirty `dist/` directories hide.
- `npm version` / release scripts need a clean worktree; stash unrelated untracked files instead of committing them accidentally.
- Always run the daemon bootstrap smoke test after touching daemon pairing, service URLs, relay config, or websocket runtime config.

## Evidence From First Run

The first practical run reviewed `upstream-sync..upstream/main`, cherry-picked reusable commits to `reuse-upstream-20260602`, skipped upstream release/hash/changelog commits, fixed fork scope/domain regressions, added a missing relay build step for clean CI, merged PR #2, and advanced `origin/upstream-sync` to `0d98df4a`.
