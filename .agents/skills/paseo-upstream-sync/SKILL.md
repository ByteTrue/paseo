---
name: paseo-upstream-sync
description: Sync upstream getpaseo/paseo commits into the ByteTrue fork via cherry-pick. Cursor is auto-discovered from the last merged sync PR — no file or tracking branch to maintain.
user-invocable: true
---

# Paseo Upstream Sync

## When to Use

Use this skill when `getpaseo/paseo` has new commits and the ByteTrue fork needs to decide which upstream work can be reused.

This is not a merge-upstream workflow. The sync branch is an upstream review cursor, not a branch to compare against fork `main`.

## Mental Model

- `origin/main` is the ByteTrue fork main branch.
- `upstream/main` is the upstream project.
- The **cursor** is the last upstream commit reviewed from the previous sync. It is recorded in the body of the most recent merged "Upstream sync:" PR (e.g. `cursor: abc123`).
- New upstream work is discovered with `<cursor>..upstream/main`.
- Reusable upstream commits are cherry-picked onto a separate fork branch such as `reuse-upstream-YYYYMMDD`.
- After merge, the PR body of the new sync PR records the updated cursor for the next run.

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
2. Find the cursor from the last merged upstream-sync PR body:
   ```bash
   LAST_PR=$(gh pr list --repo ByteTrue/paseo --search "Upstream sync:" --state merged --limit 1 --json body -q '.[0].body')
   # Extract the commit hash that follows "cursor" in the PR body.
   # Matches both "cursor: <hash>" (full) and "cursor advanced → <hash>" (short).
   # Uses git rev-parse to resolve short hashes to full 40-char form.
   CURSOR_FRAGMENT=$(echo "$LAST_PR" | grep -oE 'cursor[^0-9a-f]*[0-9a-f]{7,40}' | grep -oE '[0-9a-f]{7,40}$' | head -1)
   if [ -z "$CURSOR_FRAGMENT" ]; then
     echo "ERROR: could not find cursor hash in last sync PR body"
     exit 1
   fi
   CURSOR=$(git rev-parse --verify "$CURSOR_FRAGMENT")
   echo "Last reviewed upstream commit: $CURSOR"
   ```
   If no previous sync PR exists (first sync), use the fork/upstream merge-base instead:
   ```bash
   CURSOR=$(git merge-base origin/main upstream/main)
   ```
3. Inspect new upstream work from the cursor, not from fork main:
   ```bash
   git log --reverse --oneline $CURSOR..upstream/main
   git diff --stat $CURSOR..upstream/main
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
   - If protocol, client, or server message shapes changed and typecheck reports missing fields or stale exports, run `npm run build:server` before patching consumers. Cross-workspace `dist/` declarations can be stale even when source is correct.
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
    npm --workspace-root run lint
    npm run typecheck
    npm run release:check
    npm run test:unit --workspace=@bytetrue/server -- src/server/bootstrap.smoke.test.ts
    ```
11. Push the candidate branch and open a PR to `ByteTrue/paseo:main`.
    Include `cursor: <last-reviewed-upstream-hash>` in the PR body:

```bash
git push origin reuse-upstream-YYYYMMDD
LAST_UPSTREAM=$(git rev-parse upstream/main)
gh pr create --repo ByteTrue/paseo --base main --head reuse-upstream-YYYYMMDD \
  --title "Upstream sync: YYYY-MM-DD (vA.B.C → vX.Y.Z)" \
  --body "...cursor: $LAST_UPSTREAM"
```

12. Wait for CI. If CI fails, use job logs, reproduce locally with a clean clone and Node 22 when needed, patch the candidate branch, and rerun checks.
13. Merge the PR only after CI is green.
14. Record the cursor in the PR body so the next sync run can discover it. The PR template must include:
    ```
    cursor: <last-reviewed-upstream-hash>
    ```
    This line is parsed by step 2 of the next sync. No extra file or branch to maintain.

## Pitfalls

- Do not `git merge upstream/main` into fork main. That makes the diff enormous and mixes fork-only changes with upstream review.
- Avoid fetching upstream tags into local fork release work. Upstream tags like `v0.1.89` can collide with fork release tags.
- Clean CI can expose missing workspace build steps that local dirty `dist/` directories hide.
- `npm version` / release scripts need a clean worktree; stash unrelated untracked files instead of committing them accidentally.
- Always run the daemon bootstrap smoke test after touching daemon pairing, service URLs, relay config, or websocket runtime config.
- Use `git rev-list --left-right --count $CURSOR...upstream/main` as a sanity check before counting work. The cursor should usually have `0 N` against `upstream/main` before a review and `0 0` after advancing it.
- Keep unrelated fork cleanup separate before starting a sync PR. A dirty `main` makes the upstream review harder to reason about and can pollute the candidate branch.
- Some local Git versions do not support `git cherry-pick --no-verify`. Expect pre-commit hooks to run on every `cherry-pick --continue`, or plan the batch time accordingly and still run final full validation.
- When resolving `package.json` conflicts, absorb upstream build/check improvements only after translating every workspace scope to `@bytetrue` and preserving this fork's no-native-client scripts. Do not reintroduce `@getpaseo/*`, Android/iOS scripts, or Expo native-only package build steps.
- For modify/delete conflicts on `.native.*` files that were removed by this fork's no-native-client policy, preserve the deletion unless the user explicitly asks to restore native clients.
- Preserve the local speech worker IPC backpressure behavior: `child_process.send()` returning `false` is backpressure, not a fatal channel error. Outcomes should still come from the send callback, worker response, or timeout.
- GitHub `gh pr checks --watch` / GraphQL calls can EOF while CI is still healthy. Re-check with `gh run view <run-id> --json status,conclusion,jobs` before treating it as a CI failure.
- In this repo, prefer `npm --workspace-root run lint` for root lint during sync work; plain `npm run lint` can route through the wrong npm workspace/ESLint path in some sessions.

## Evidence

| Run | PR  | Branch                    | Upstream range         | Cursor (last reviewed) |
| --- | --- | ------------------------- | ---------------------- | ---------------------- |
| 1   | #2  | `reuse-upstream-20260602` | fork-point..`0d98df4a` | `0d98df4a`             |
| 2   | #6  | `reuse-upstream-20260605` | `0d98df4a`..`b5192e57` | `b5192e57`             |
| 3   | #9  | `reuse-upstream-20260608` | `b5192e57`..`06a8f952` | `06a8f952`             |

Historical reference only. The actual cursor for the next sync is read live from the most recent merged "Upstream sync:" PR body by step 2.
