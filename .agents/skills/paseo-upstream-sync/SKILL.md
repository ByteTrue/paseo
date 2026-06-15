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
- The **cursor** (`COMMIT1`) is the last upstream commit reviewed from the previous sync. It is recorded in the body of the most recent merged "Upstream sync:" PR (e.g. `cursor: abc123`).
- The sync target (`COMMIT2`) is the current `upstream/main` commit immediately after fetch. Freeze it at the start; if upstream advances mid-run, leave those newer commits for the next sync.
- New upstream work is the closed range boundary `COMMIT1..COMMIT2`, not a diff from fork `main`. Every commit in that range must get an explicit review decision before any final cherry-pick.
- Reusable upstream commits are cherry-picked onto a separate fork branch such as `reuse-upstream-YYYYMMDD` only after the review gate passes.
- After merge, the PR body records `cursor: COMMIT2`, because the cursor means "last reviewed upstream commit", not "last cherry-picked commit". Skipped commits are covered only if they were reviewed and documented.

## Fork Invariants

Preserve these unless the user explicitly changes strategy:

- Push only to `origin` (`ByteTrue/paseo`), not upstream.
- Keep npm scope `@bytetrue`; the CLI binary remains `paseo`.
- Keep app URL `https://paseo.zijieapi.de5.net`.
- Keep relay endpoint `relay.paseo.zijieapi.de5.net:443` and TLS for the hosted relay.
- Keep npm publishing through `.github/workflows/publish-npm.yml` with GitHub OIDC Trusted Publishing.
- Keep `scripts/publish-workspaces.mjs` resumable publishing behavior.
- Keep published package repository metadata aligned with `https://github.com/ByteTrue/paseo` / `.git` as already used in the fork.

## Procedure

1. Start clean on fork `main` and keep upstream tags out of the local release namespace:
   ```bash
   cd /Users/byte/workspace/forks/paseo
   git status --short --branch
   git config remote.upstream.tagOpt --no-tags
   git fetch origin '+refs/heads/*:refs/remotes/origin/*' --no-tags
   git fetch upstream '+refs/heads/main:refs/remotes/upstream/main' --no-tags
   git switch main
   git pull --ff-only origin main
   ```
2. Resolve and freeze the sync range (`COMMIT1..COMMIT2`):
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
   COMMIT1=$(git rev-parse --verify "$CURSOR_FRAGMENT")
   COMMIT2=$(git rev-parse --verify upstream/main)
   echo "Last reviewed upstream commit (COMMIT1): $COMMIT1"
   echo "Frozen upstream target      (COMMIT2): $COMMIT2"
   git rev-list --left-right --count "$COMMIT1"..."$COMMIT2"
   ```
   If no previous sync PR exists (first sync), use the fork/upstream merge-base instead:
   ```bash
   COMMIT1=$(git merge-base origin/main upstream/main)
   COMMIT2=$(git rev-parse --verify upstream/main)
   ```
   Do not silently widen the range after this point. If `upstream/main` advances during the sync, the new commits belong to the next run.
3. Materialize the full upstream range before filtering:
   ```bash
   git log --reverse --format='%H %s' "$COMMIT1".."$COMMIT2" | tee /tmp/paseo-upstream-range.txt
   git diff --stat "$COMMIT1".."$COMMIT2"
   ```
   The range file is the review checklist. Every hash in it must end as `reuse`, `rewrite`, or `skip`.
4. Apply a mechanical pre-filter for commits that are not useful to the fork. Still record each skipped commit and the reason; do not make invisible skips.
   - Skip upstream version bumps, upstream changelog-only commits, upstream Nix hash-only commits, release tags, and pure upstream branding/metadata churn.
   - Skip native iOS/Android app-surface work by default: `ios/`, `android/`, EAS, TestFlight/App Store, Android APK release assets, native-only dependencies, and phone-store release automation. This does not mean skipping shared web renderer, mobile web/PWA, responsive layout, desktop, CLI, server, or protocol fixes.
   - Skip commits whose purpose conflicts with ByteTrue fork strategy unless the user explicitly changes the strategy.
   - Mark mixed commits as `rewrite` when they contain reusable server/web/desktop/CLI fixes plus unsupported or upstream-only pieces.
5. Complete a pre-pick review ledger before final cherry-picking. For each non-mechanical candidate, inspect the patch and fill this shape in the working notes or PR draft:

   ```markdown
   | Commit | Decision               | Rationale | Conflict/Rewrite Plan | Bug/Compat Risk | Required Validation |
   | ------ | ---------------------- | --------- | --------------------- | --------------- | ------------------- |
   | <hash> | reuse / rewrite / skip | ...       | ...                   | ...             | ...                 |
   ```

   Review dimensions:
   - **Conflict risk:** inspect touched files with `git show --name-status <hash>` and compare against fork-heavy areas before picking. If conflict is likely, mark `rewrite` with a concrete plan instead of blindly cherry-picking.
   - **Bug risk:** inspect behavior changes, new dependencies, state/persistence changes, process lifecycle changes, and CI/release changes. Prefer targeted tests listed in the ledger over broad suites.
   - **Protocol compatibility:** schema changes must stay backward-compatible; new client-only features need a single `server_info.features.*` capability gate, not scattered fallbacks.
   - **Fork invariants:** preserve `@bytetrue` package scope, ByteTrue repository metadata, hosted URL/relay defaults, release workflow, and daemon pairing behavior.
   - **Strategy fit:** reject work that reintroduces maintained native mobile app release surfaces, upstream-only hosting assumptions, or product direction the fork has intentionally removed.

   Do not run the final cherry-pick sequence until this ledger is complete and internally consistent. A dry-run/scratch cherry-pick is allowed only as a conflict probe after the review decisions are written.

6. If the candidate set is large or conflict-prone, run a scratch replay before creating the final PR branch:
   ```bash
   git switch -c sync-review-dryrun main
   # Replay only commits marked reuse/rewrite-as-cherry-pick, in upstream order.
   for commit in <approved-commits-in-upstream-order>; do
     git cherry-pick -x "$commit" || {
       echo "scratch replay conflict at $commit"
       git cherry-pick --abort || true
       exit 1
     }
   done
   git switch main
   git branch -D sync-review-dryrun
   ```
   If the scratch replay conflicts, abort/reset the scratch branch, return to `main`, and update the review ledger before continuing. Do not continue as if the review passed.
   If the ledger approves zero code changes, stop before creating a final branch. Report the skip decisions and ask whether to leave the cursor unchanged or create an explicit empty cursor PR (`git commit --allow-empty`) whose PR body records the reviewed range and skip reasons. Never advance the cursor silently.
7. Create the candidate branch from fork `main`:
   ```bash
   git switch -c reuse-upstream-YYYYMMDD main
   ```
8. Cherry-pick or rewrite only the reviewed-and-approved commits in upstream order:
   ```bash
   git cherry-pick -x <commit>
   ```
   Use the review ledger as the source of truth. Do not opportunistically add unreviewed commits while resolving conflicts.
9. Resolve conflicts by taking upstream behavior only where it fits the fork, then reapply fork invariants. Common fixes:
   - Replace `@getpaseo/` imports with `@bytetrue/`.
   - Preserve `relay.paseo.zijieapi.de5.net:443` and `https://paseo.zijieapi.de5.net` in runtime defaults and daemon pairing tests.
   - Keep fork release scripts and `publish-npm.yml` intact.
   - Preserve the active lean-client strategy: browser web/mobile web PWA, Electron desktop, and CLI are maintained; native Android/iOS release surfaces are not.
   - If protocol, client, or server message shapes changed and typecheck reports missing fields or stale exports, run `npm run build:server` before patching consumers. Cross-workspace `dist/` declarations can be stale even when source is correct.
   - If client imports relay runtime code, ensure `build:client` builds relay before client.
10. Refresh dependencies when package manifests changed:
    ```bash
    npm install --ignore-scripts --include-workspace-root
    ```
11. Verify fork invariants:
    ```bash
    /usr/bin/grep -R "@getpaseo/" -n package.json package-lock.json packages/*/src scripts .github nix flake.nix || true
    /usr/bin/grep -R "relay\.paseo\.sh\|https://app\.paseo\.sh" -n packages/*/src scripts .github || true
    ```
    Review hits; tests and docs may intentionally mention upstream GitHub URLs, but runtime package imports and app/relay defaults must stay forked.
12. Run validation:
    ```bash
    npm run format:check
    npm --workspace-root run lint
    npm run typecheck
    npm run release:check
    npm run test:unit --workspace=@bytetrue/server -- src/server/bootstrap.smoke.test.ts
    ```
    Add any targeted tests promised by the review ledger. Do not run the full test suite locally.
13. Push the candidate branch and open a PR to `ByteTrue/paseo:main`. Include the frozen range, the review summary, and `cursor: $COMMIT2` in the PR body:

```bash
git push origin reuse-upstream-YYYYMMDD
gh pr create --repo ByteTrue/paseo --base main --head reuse-upstream-YYYYMMDD \
  --title "Upstream sync: YYYY-MM-DD (COMMIT1 → COMMIT2)" \
  --body "$(cat <<EOF
range: $COMMIT1..$COMMIT2
cursor: $COMMIT2

review:
- reused: <hashes>
- rewritten: <hashes and notes>
- skipped: <hashes and reasons>
EOF
  )"
```

14. Wait for CI. If CI fails, use job logs, reproduce locally with a clean clone and Node 22 when needed, patch the candidate branch, and rerun checks.
15. Merge the PR only after CI is green.
16. The merged PR body is the next run's cursor source. It must contain:
    ```
    cursor: <COMMIT2 / last reviewed upstream hash>
    ```
    No extra file or branch cursor is maintained.

## Pitfalls

- Do not `git merge upstream/main` into fork main. That makes the diff enormous and mixes fork-only changes with upstream review.
- Never final-cherry-pick first and review afterward. The point of this workflow is `discover range → filter → review every commit → cherry-pick approved commits`.
- Never advance the cursor to a commit that was not reviewed. Conversely, a reviewed-and-skipped commit is covered by the cursor only if the PR body records the skip reason.
- Never fetch or push upstream tags as part of sync. Use explicit branch refspecs plus `--no-tags`, keep `remote.upstream.tagOpt=--no-tags`, and never run `git push --tags origin`; upstream tags like `v0.2.0-rc.1` can pollute the fork release namespace and confuse release prep.
- Clean CI can expose missing workspace build steps that local dirty `dist/` directories hide.
- `npm version` / release scripts need a clean worktree; stash unrelated untracked files instead of committing them accidentally.
- Always run the daemon bootstrap smoke test after touching daemon pairing, service URLs, relay config, or websocket runtime config.
- Use `git rev-list --left-right --count "$COMMIT1"..."$COMMIT2"` as a range sanity check. The frozen range should usually be `0 N`; after advancing the cursor to `COMMIT2`, the next unchanged sync should be `0 0`.
- Keep unrelated fork cleanup separate before starting a sync PR. A dirty `main` makes the upstream review harder to reason about and can pollute the candidate branch.
- Some local Git versions do not support `git cherry-pick --no-verify`. Expect pre-commit hooks to run on every `cherry-pick --continue`, or plan the batch time accordingly and still run final full validation.
- When resolving `package.json` conflicts, absorb upstream build/check improvements only after translating every workspace scope to `@bytetrue`.
- For modify/delete conflicts on `.native.*` files, preserve or restore the native side according to the active fork strategy for that sync branch.
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
