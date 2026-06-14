# ByteTrue Project Management Bridge

This document records the project-management integration rules between ByteTrue and external trackers, GitHub, GitLab, or local.

Core principle: `.bytetrue/` is the canonical source of truth; the external tracker is a team-collaboration projection and must not drive the main ByteTrue workflow in reverse.

---

## Provider

Chosen by the user during onboarding and stored under `tracker.*` in `.bytetrue/config.yaml`:

```yaml
tracker:
  provider: local | github | gitlab
  sync_policy: ask | never | auto_preview
```

- `local`: use only `.bytetrue/`, create no external issues
- `github`: operate GitHub Issues through the local `gh` CLI
- `gitlab`: operate GitLab Issues through the local `glab` CLI

`bt-onboard` needs to detect:

- whether the CLI is installed
- the CLI auth status
- whether the current repo remote matches the provider

This layer does not design any API, token, or SDK adapter.

---

## Current Project Configuration

Current provider, sync policy, repository, and advisory CLI detection cache live in `.bytetrue/config.yaml`. This document defines provider semantics, syncable sources, labels, and writeback rules; `bt-tracker` still revalidates CLI/auth/remote state at runtime.

## Managed vs Project-owned Parts

The syncable-source/status mapping, action semantics, managed-block rules, and external-metadata rules are package-managed tracker contract and should refresh when `bt-onboard` is rerun. Project-specific external label names and `status_sync` choices may be preserved or reapplied after confirmation. Do not preserve this whole file as project-owned, or upgraded projects may keep stale sync status mappings.

---

## External Tracker Role

The external tracker carries only team-visible collaboration objects:

- PRD parent issues
- task issues corresponding to roadmap items or feature designs
- bug issues corresponding to ByteTrue bug issues
- triage state of the incoming issue queue

The external tracker never becomes the primary state source for requirement, roadmap, feature, or issue.

---

## Syncable Sources

```yaml
syncable_sources:
  roadmap_prd:
    source: .bytetrue/roadmap/{slug}/{slug}-roadmap.md
    external_kind: prd

  roadmap_item:
    source: .bytetrue/roadmap/{slug}/{slug}-items.yaml
    external_kind: task

  feature_design:
    source: .bytetrue/features/{feature}/{slug}-design.md
    external_kind: task

  bug_issue:
    source:
      [".bytetrue/issues/{issue}/{slug}-report.md", ".bytetrue/issues/{issue}/{slug}-fix-note.md"]
    external_kind: bug

not_syncable_by_default:
  standalone_requirement:
    reason: requirement is vision input material and is not published to external tracker by default
```

Syncable-status mapping:

- `roadmap_prd`: `status: active | done` counts as reviewed planning content and may be published or updated; `pending` does not sync
- `roadmap_item`: `status: pending | active | done` may be published or updated; `dropped` only updates the state of an already bound external issue and does not create one by default
- `feature_design`: `status: done` with `review_result: approved` may be published or updated
- `bug_issue`: `status: done` may be published or updated; standard path uses the report as source, fast path uses the fix-note as source

PRD is not added as a new local entity. No `.bytetrue/prds/` directory is introduced.

---

## Actions

`bt-tracker` is the unified home for the external-tracker capabilities inspired by Matt `to-prd`, `to-issues`, and `triage`.

```yaml
actions:
  publish:
    direction: bytetrue_to_tracker
    effects:
      - create_new_issue
      - link_existing_issue
      - update_managed_block
      - write_external_metadata_back_to_source

  triage:
    direction: tracker_to_human_decision
    effects:
      - read_external_issue_queue
      - recommend_labels_or_route
      - update_external_labels_or_comments_after_confirmation
    does_not:
      - auto_import_to_bytetrue
      - auto_modify_bytetrue_sources
```

---

## Sync Policy

Current sync values are read only from `.bytetrue/config.yaml`; this section does not set current values. `bt-tracker` handles only ByteTrue artifacts that satisfy `syncable_sources` and the syncable-status mapping:

- `sync_policy: ask`: ask before entering tracker / preview.
- `sync_policy: never`: skip tracker preview and external sync suggestions.
- `sync_policy: auto_preview`: prepare the preview automatically; external issue create/update/link/close actions or external metadata writeback still follow current `workflow.ask_before` and `bt-tracker` confirmation rules.
- First version supported values are `sync_direction: outbound_only`, `external_import: manual_only`, and `update_policy: update_managed_block`. If config contains an unsupported value, `bt-tracker` should stop, explain it, and ask the user to confirm configuration.

Recommended external issue bodies use a ByteTrue managed block:

```md
<!-- bytetrue:managed:start -->

Generated from .bytetrue source.

<!-- bytetrue:managed:end -->
```

During sync updates, only the managed block is changed. Team-authored body content and comments are preserved.

---

## External Metadata

External metadata is written directly back into the corresponding source artifact. There is no central sync DB.

Example:

```yaml
external:
  provider: github
  kind: task
  id: 123
  url: https://github.com/org/repo/issues/123
  sync_mode: created | linked_existing
  synced_at: 2026-06-07T10:00:00Z
```

For roadmap items, external metadata is written onto the item inside `items.yaml`. For feature, issue, or roadmap PRD, it is written into the source document frontmatter; for fast-path bug issues, that source document is `{slug}-fix-note.md`.

---

## Canonical Labels

ByteTrue uses stable canonical keys; their meanings are package-managed. During onboarding, only the `external` label names are project-specific mappings and may be preserved or adjusted for the team's tracker.

```yaml
labels:
  prd:
    meaning: ByteTrue PRD parent issue
    external: bt:prd

  task:
    meaning: Implementation task from roadmap item or feature design
    external: bt:task

  bug:
    meaning: Bug issue from bt-issue
    external: bug

  ready_for_agent:
    meaning: Agent can pick this up without more human clarification
    external: ready-for-agent

  needs_triage:
    meaning: Incoming external issue still waiting for maintainer triage
    external: needs-triage

  needs_info:
    meaning: Blocked on more user or team information
    external: needs-info

  ready_for_human:
    meaning: Requires human judgement or review
    external: ready-for-human

  wontfix:
    meaning: Deliberately not accepted into ByteTrue work
    external: wontfix
```

---

## Status Sync

```yaml
status_sync:
  labels: true
  close_on_done: ask
  import_external_state: false
```

Non-destructive state may be synchronized into labels. Before closing an external issue, the user must be asked. External state changes never write back into `.bytetrue/` automatically. The concrete `status_sync` choices are project-specific and may be preserved or adjusted during onboarding.
