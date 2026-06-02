---
name: paseo-sync-upstream
description: Sync the ByteTrue/paseo fork from upstream getpaseo/paseo while preserving fork-specific npm, CI, and deployment changes.
---

# Paseo Sync Upstream

## When to Use

Use this skill when upstream `getpaseo/paseo` has new commits and the ByteTrue fork needs to absorb them without losing fork-specific behavior.

The working fork root is `/Users/byte/workspace/forks/paseo`.

## Fork Invariants

Preserve these unless the user explicitly changes the fork strategy:

- Push to `origin` (`https://github.com/ByteTrue/paseo.git`), not upstream.
- Keep npm package scope as `@bytetrue`; the CLI binary remains `paseo`.
- Keep app URL `https://paseo.zijieapi.de5.net`.
- Keep relay endpoint `relay.paseo.zijieapi.de5.net:443` and websocket public URL `wss://relay.paseo.zijieapi.de5.net:443`.
- Keep Cloudflare App Pages project `paseo-zijieapi-de5-net`.
- Keep Website Worker `paseo-website.bytetrue.workers.dev` unless a custom domain is deliberately added.
- Keep fork npm publishing through `.github/workflows/publish-npm.yml` with GitHub OIDC and npm Trusted Publishing.
- Keep fork CI workflows free of upstream-only bot secrets. Prefer `GITHUB_TOKEN` for fork automation.
- Keep `scripts/publish-workspaces.mjs` resumable publishing behavior.

## Procedure

1. Confirm local state and remotes:
   ```bash
   cd /Users/byte/workspace/forks/paseo
   git status --short --branch
   git remote -v
   ```
2. Fetch both remotes and inspect upstream delta:
   ```bash
   git fetch origin main --tags
   git fetch upstream main --tags
   git log --oneline --decorate --left-right --cherry-pick origin/main...upstream/main
   git diff --stat origin/main..upstream/main
   ```
3. Create a sync branch from the fork main:
   ```bash
   git checkout main
   git pull --ff-only origin main
   git switch -c sync-upstream-YYYYMMDD
   ```
4. Merge upstream main into the sync branch:
   ```bash
   git merge upstream/main
   ```
   Prefer an explicit merge commit so fork-specific commits remain visible. Do not rebase published fork main over upstream.
5. Resolve conflicts by preserving fork invariants first, then adapting upstream changes. Pay special attention to:
   - `package.json`, `package-lock.json`, and workspace package names.
   - `.github/workflows/*`, especially npm publish, Cloudflare deploys, and Nix/hash workflows.
   - `packages/server/src/server/config.ts`, `bootstrap.ts`, pairing offer code, and daemon relay/app defaults.
   - `packages/cli/*` daemon start/onboard/status behavior.
   - `packages/app`, `packages/relay`, `packages/website`, and `wrangler.toml` deployment settings.
   - `nix`, `flake.nix`, lockfiles, and generated hashes.
6. After conflict resolution, scan for upstream package-scope regressions:
   ```bash
   /usr/bin/grep -R "@getpaseo/" package.json package-lock.json packages scripts .github nix flake.nix || true
   /usr/bin/grep -R "paseo.chat\|relay.paseo.chat\|getpaseo/paseo" package.json packages scripts .github nix flake.nix || true
   ```
   Review each hit. Some documentation references may be intentional; runtime package names, endpoints, publish settings, and repository metadata should stay forked.
7. Refresh dependencies if package metadata or lockfiles changed:
   ```bash
   npm install --ignore-scripts --include-workspace-root
   ```
8. Run focused validation first, then broader validation:
   ```bash
   npm run format:check
   npm run typecheck
   npm run release:check
   ```
   If upstream touched daemon pairing, also run the focused daemon pairing/bootstrap regression.
9. Inspect the final diff:
   ```bash
   git status --short --branch
   git diff --stat origin/main
   git diff -- package.json .github/workflows packages/server/src/server/config.ts packages/server/src/server/bootstrap.ts
   ```
10. Commit the sync branch and push it to the fork:
    ```bash
    git commit -m "Sync upstream changes"
    git push origin sync-upstream-YYYYMMDD
    ```
11. Open a PR against `ByteTrue/paseo:main`, or merge directly only if the user explicitly asks and the validation evidence is clean.

## Conflict Playbook

- If upstream adds new packages or workspaces, decide whether they should be renamed to `@bytetrue/*`, kept private, or excluded from publish scripts.
- If upstream changes release scripts, preserve the fork split: local release commands should bump/tag/push; npm publish should happen in tag-triggered CI.
- If upstream changes npm package repository metadata, keep published workspaces aligned with `https://github.com/ByteTrue/paseo.git` so npm provenance passes.
- If upstream changes daemon pairing or relay transport, ensure generated pairing links still start with `https://paseo.zijieapi.de5.net/#offer=` and relay offers use `relay.paseo.zijieapi.de5.net:443` with TLS.
- If upstream reintroduces upstream-only GitHub App credentials or bot secrets, replace with fork-safe `GITHUB_TOKEN` where feasible.
- If sync creates partial or risky conflicts, stop on the sync branch and ask the user before discarding or force-overwriting anything.

## Verification

A sync is ready when:

- Local worktree is clean on the sync branch.
- The branch contains upstream changes plus preserved fork-specific npm scope, endpoints, repository metadata, and workflows.
- `npm run typecheck` passes.
- `npm run release:check` passes, or any failure is documented with exact logs and a clear blocker.
- `@getpaseo/*` references are absent from runtime package/import/publish surfaces unless intentionally retained in docs or upstream references.
- No push was made to upstream.
