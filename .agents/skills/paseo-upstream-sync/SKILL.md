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
- The **cursor** (`COMMIT1`) is the last upstream commit reviewed from the previous sync. It is recorded as a `cursor: <hash>` line in the body of the most recent merged sync PR; the PR title does not have to start with `Upstream sync:`.
- The sync target (`COMMIT2`) is the current `upstream/main` commit immediately after fetch. Freeze it at the start; if upstream advances mid-run, leave those newer commits for the next sync.
- New upstream work is the closed range boundary `COMMIT1..COMMIT2`, not a diff from fork `main`. **This range is indivisible for review: every commit in `git log --reverse COMMIT1..COMMIT2` must appear in the user-facing summary with hash, subject, recommended decision, and reason. No commit may be silently omitted because it is noisy, boring, huge, conflicting, or likely to be skipped.**
- Reusable upstream commits are cherry-picked onto a separate fork branch such as `reuse-upstream-YYYYMMDD` only after both gates pass: the agent's complete whole-range review ledger is done, and the user explicitly approves which commits to include.
- After merge, the PR body records `cursor: COMMIT2`, because the cursor means "last reviewed upstream commit", not "last cherry-picked commit". Skipped or deferred commits are covered only if they were included in the user-facing whole-range summary and documented with a reason.

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
   LAST_PR=$(gh pr list --repo ByteTrue/paseo --state merged --limit 100 --json number,title,body,mergedAt \
     -q '[.[] | select((.body // "") | test("(?i)cursor[^\\n]{0,120}[0-9a-f]{7,40}"))] | sort_by(.mergedAt) | last')
   COMMIT2=$(git rev-parse --verify upstream/main)
   if [ -z "$LAST_PR" ] || [ "$LAST_PR" = "null" ]; then
     echo "No previous cursor-bearing sync PR found; using fork/upstream merge-base"
     COMMIT1=$(git merge-base origin/main upstream/main)
   else
     LAST_PR_NUMBER=$(echo "$LAST_PR" | jq -r '.number')
     LAST_PR_TITLE=$(echo "$LAST_PR" | jq -r '.title')
     LAST_PR_BODY=$(echo "$LAST_PR" | jq -r '.body')
     echo "Cursor source PR #$LAST_PR_NUMBER: $LAST_PR_TITLE"

     # Extract the last commit-looking hash from PR body lines that mention "cursor".
     # This handles both "cursor: <hash>" and prose like "cursor advanced → `<hash>`".
     # Uses git rev-parse below to resolve short hashes to full 40-char form.
     CURSOR_FRAGMENT=$(echo "$LAST_PR_BODY" | grep -i 'cursor' | grep -oE '[0-9a-f]{7,40}' | tail -1)
     if [ -z "$CURSOR_FRAGMENT" ]; then
       echo "ERROR: could not find cursor hash in last sync PR body"
       exit 1
     fi
     COMMIT1=$(git rev-parse --verify "$CURSOR_FRAGMENT")
   fi
   echo "Last reviewed upstream commit (COMMIT1): $COMMIT1"
   echo "Frozen upstream target      (COMMIT2): $COMMIT2"
   git rev-list --left-right --count "$COMMIT1"..."$COMMIT2"
   ```

   Do not silently widen the range after this point. If `upstream/main` advances during the sync, the new commits belong to the next run.

3. Materialize the full upstream range before filtering:
   ```bash
   git log --reverse --format='%H %s' "$COMMIT1".."$COMMIT2" | tee /tmp/paseo-upstream-range.txt
   git diff --stat "$COMMIT1".."$COMMIT2"
   ```
   The range file is the authoritative review checklist. Every hash in it must end as `reuse`, `rewrite`, `defer-for-dedicated-sync`, or `skip`, and every hash must be shown to the user before approval.
4. Apply a mechanical pre-filter for commits that are not useful to the fork. This pre-filter only proposes decisions; it does not remove commits from the review ledger or the user-facing summary. Still record each skipped/deferred commit and the reason; do not make invisible skips.
   - Skip upstream version bumps, upstream changelog-only commits, upstream Nix hash-only commits, release tags, and pure upstream branding/metadata churn.
   - Skip native iOS/Android app-surface work by default: `ios/`, `android/`, EAS, TestFlight/App Store, Android APK release assets, native-only dependencies, and phone-store release automation. This does not mean skipping shared web renderer, mobile web/PWA, responsive layout, desktop, CLI, server, or protocol fixes.
   - Skip commits whose purpose conflicts with ByteTrue fork strategy unless the user explicitly changes the strategy.
   - Do **not** mark a strategically aligned upstream feature as `skip` merely because it is large, cross-cutting, or conflict-prone. Mark it `rewrite` or `defer-for-dedicated-sync` in the rationale, include it in the user summary, and let the user decide whether it belongs in this sync PR or a follow-up sync PR.
   - Mark mixed commits as `rewrite` when they contain reusable server/web/desktop/CLI fixes plus unsupported or upstream-only pieces.
5. Complete a pre-pick review ledger for **every commit in the range** before asking for approval. The ledger must include mechanical skips, release/hash commits, huge feature stacks, conflict-prone commits, and commits the agent recommends deferring. Fill this shape in the working notes or PR draft:

   ```markdown
   | Commit | Decision                                          | Rationale | Conflict/Rewrite Plan | Bug/Compat Risk | Required Validation |
   | ------ | ------------------------------------------------- | --------- | --------------------- | --------------- | ------------------- |
   | <hash> | reuse / rewrite / defer-for-dedicated-sync / skip | ...       | ...                   | ...             | ...                 |
   ```

   Review dimensions:
   - **Conflict risk:** inspect touched files with `git show --name-status <hash>` and compare against fork-heavy areas before picking. If conflict is likely, mark `rewrite` with a concrete plan instead of blindly cherry-picking.
   - **Bug risk:** inspect behavior changes, new dependencies, state/persistence changes, process lifecycle changes, and CI/release changes. Prefer targeted tests listed in the ledger over broad suites.
   - **Protocol compatibility:** schema changes must stay backward-compatible; new client-only features need a single `server_info.features.*` capability gate, not scattered fallbacks.
   - **Fork invariants:** preserve `@bytetrue` package scope, ByteTrue repository metadata, hosted URL/relay defaults, release workflow, and daemon pairing behavior.
   - **Strategy fit:** reject work that reintroduces maintained native mobile app release surfaces, upstream-only hosting assumptions, or product direction the fork has intentionally removed.

   At this point the ledger is only the agent's recommendation. Do not run a scratch replay, create a final branch, or cherry-pick any reviewed commit yet.

6. Present the whole-range review summary to the user and wait for an explicit selection before continuing. This is a mandatory stop point. The summary must include:
   - frozen range `COMMIT1..COMMIT2` and total commit count;
   - an upstream-order table containing **all commits in the range**, with no omissions: commit hash, subject, touched area/theme, recommended decision, and one-line reason;
   - commits recommended for `reuse` / `rewrite`, grouped by theme, with one-line value and risk;
   - commits recommended for `skip`, grouped by reason, including mechanical skips and strategic skips such as native iOS/Android app-surface work;
   - strategically aligned but large/conflict-prone feature stacks recommended as `defer-for-dedicated-sync`, with their dependency chain and why they should be separate rather than discarded;
   - any commits that failed conflict probes and need a revised rewrite plan;
   - the exact ordered `APPROVED_COMMITS` list the agent proposes to cherry-pick or rewrite for this PR, plus any follow-up sync PRs the agent recommends.

   Stop and ask the user to choose one of:
   - approve the proposed `APPROVED_COMMITS` list;
   - approve only a subset;
   - change one or more decisions;
   - approve zero code changes and decide whether to leave the cursor unchanged or create an explicit empty cursor PR.

   Do not infer approval from silence, from the agent's own confidence, or from a completed ledger. The user must explicitly approve the list or subset before any replay/cherry-pick. If later conflict probing changes the list or rewrite plan, return to this step for approval again.

7. If the approved candidate set is large or conflict-prone, run a scratch replay before creating the final PR branch:
   ```bash
   git switch -c sync-review-dryrun main
   # Replay only commits in APPROVED_COMMITS, in upstream order.
   for commit in <APPROVED_COMMITS-in-upstream-order>; do
     git cherry-pick -x "$commit" || {
       echo "scratch replay conflict at $commit"
       git cherry-pick --abort || true
       exit 1
     }
   done
   git switch main
   git branch -D sync-review-dryrun
   ```
   If the scratch replay conflicts, abort/reset the scratch branch, return to `main`, update the review ledger, and go back to step 6 for user approval of the changed plan. Do not continue as if the review passed.
   If the user approved zero code changes, stop before creating a final branch unless the user explicitly chose an empty cursor PR (`git commit --allow-empty`) whose PR body records the reviewed range and skip reasons. Never advance the cursor silently.
8. Create the candidate branch from fork `main`:
   ```bash
   git switch -c reuse-upstream-YYYYMMDD main
   ```
9. Cherry-pick or rewrite only the user-approved commits in upstream order:
   ```bash
   git cherry-pick -x <commit>
   ```
   Use `APPROVED_COMMITS` and the review ledger as the source of truth. Do not opportunistically add unapproved commits while resolving conflicts.
10. Resolve conflicts by taking upstream behavior only where it fits the fork, then reapply fork invariants. Common fixes:
    - Replace `@getpaseo/` imports with `@bytetrue/`.
    - Preserve `relay.paseo.zijieapi.de5.net:443` and `https://paseo.zijieapi.de5.net` in runtime defaults and daemon pairing tests.
    - Keep fork release scripts and `publish-npm.yml` intact.
    - Preserve the active lean-client strategy: browser web/mobile web PWA, Electron desktop, and CLI are maintained; native Android/iOS release surfaces are not.
    - If protocol, client, or server message shapes changed and typecheck reports missing fields or stale exports, run `npm run build:server` before patching consumers. Cross-workspace `dist/` declarations can be stale even when source is correct.
    - If client imports relay runtime code, ensure `build:client` builds relay before client.

11. Refresh dependencies when package manifests changed:
    ```bash
    npm install --ignore-scripts --include-workspace-root
    ```
12. Verify fork invariants:
    ```bash
    /usr/bin/grep -R "@getpaseo/" -n package.json package-lock.json packages/*/src scripts .github nix flake.nix || true
    /usr/bin/grep -R "relay\.paseo\.sh\|https://app\.paseo\.sh" -n packages/*/src scripts .github || true
    ```
    Review hits; tests and docs may intentionally mention upstream GitHub URLs, but runtime package imports and app/relay defaults must stay forked.
13. Run validation:
    ```bash
    npm run format:check
    npm --workspace-root run lint
    npm run typecheck
    npm run release:check
    npm run test:unit --workspace=@bytetrue/server -- src/server/bootstrap.smoke.test.ts
    ```
    Add any targeted tests promised by the review ledger. Do not run the full test suite locally.
14. Push the candidate branch and open a PR to `ByteTrue/paseo:main`. Include the frozen range, the review summary, the user-approved commit list, and `cursor: $COMMIT2` in the PR body:

```bash
git push origin reuse-upstream-YYYYMMDD
gh pr create --repo ByteTrue/paseo --base main --head reuse-upstream-YYYYMMDD \
  --title "Upstream sync: YYYY-MM-DD (COMMIT1 → COMMIT2)" \
  --body "$(cat <<EOF
range: $COMMIT1..$COMMIT2
cursor: $COMMIT2

review:
- user-approved: <APPROVED_COMMITS>
- reused: <hashes>
- rewritten: <hashes and notes>
- skipped: <hashes and reasons>
EOF
  )"
```

15. Wait for CI. If CI fails, use job logs, reproduce locally with a clean clone and Node 22 when needed, patch the candidate branch, and rerun checks.
16. Merge the PR only after CI is green.
17. The merged PR body is the next run's cursor source. It must contain:
    ```
    cursor: <COMMIT2 / last reviewed upstream hash>
    ```
    No extra file or branch cursor is maintained.

## Pitfalls

- Do not `git merge upstream/main` into fork main. That makes the diff enormous and mixes fork-only changes with upstream review.
- Never final-cherry-pick first and review afterward. The point of this workflow is `discover range → filter → review every commit → summarize everything → user selects approved commits → cherry-pick approved commits`.
- Never summarize only the commits the agent wants to pick. The pre-approval summary must cover **all** commits from `COMMIT1..COMMIT2`, including release/hash commits, conflicts, large feature stacks, and commits recommended for skip/defer.
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
