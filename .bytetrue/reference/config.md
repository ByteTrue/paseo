# ByteTrue Project Config

`.bytetrue/config.yaml` stores machine-readable project choices. Reference documents explain semantics; config owns current values.

## Schema

Machine-readable shape, required fields, allowed values, and onboarding defaults live in `.bytetrue/reference/config.schema.yaml`. This Markdown file explains field semantics and consumption rules only; it does not own current values or the schema.

If a workflow skill needs config values and `.bytetrue/config.yaml` is missing, it must stop and tell the user to rerun `bt-onboard` or repair the skeleton. Do not infer current workflow/tracker/dispatch values from this reference or from `project-management.md`.

## Minimal Config Shape

Onboard writes the selected values in nested YAML form. Use the schema for required fields and allowed values; this example shows the expected shape only:

```yaml
version: 1
workflow:
  mode: manual
  ask_before:
    - git_commit
    - git_push
    - external_tracker_write
    - destructive_command
    - scope_change
tracker:
  provider: local
  provider_status: unknown
  sync_policy: ask
  sync_direction: outbound_only
  external_import: manual_only
  update_policy: update_managed_block
  repository:
    remote_url: null
    tracker_url: null
  cli:
    gh:
      installed: null
      auth: unknown
    glab:
      installed: null
      auth: unknown
dispatch:
  preferred: auto
  allow_non_interactive_child: true
  allow_background_agents: false
```

## Workflow Mode

- `manual`: default. Each workflow stage recommends the next step and waits for user confirmation before moving across stage boundaries.
- `auto`: workflow skills may continue deterministic, low-risk next-stage work once the current stage exit conditions are satisfied, until an `ask_before` boundary, ambiguity, user-choice gate, or human-verification gate is reached. `auto` is a pure-skills continuation rule, not a daemon, background executor, hook, or permission to skip review evidence.

## Ask-before Boundaries

`ask_before` is a project-owned list of operation keys in `.bytetrue/config.yaml`. A skill that is about to perform an operation whose key appears in the current list must stop, state the boundary, and ask the user. The keys are not owned by this reference document; onboard may seed a default list, but the YAML file is the source of truth.

## Tracker

Tracker values moved here from `project-management.md`. `project-management.md` defines package-managed provider semantics, syncable sources, managed-block rules, and project-specific external label mappings.

- `tracker.provider`: configured collaboration backend, or `local` when no external tracker is used.
- `tracker.provider_status`: onboard detection result for the chosen provider.
- `tracker.sync_policy`: `ask` means suggest tracker sync and ask; `never` means skip tracker prompts; `auto_preview` means prepare the tracker preview automatically when a syncable source is reached, then stop before any external write that current config or tracker rules require confirming.
- `tracker.sync_direction`: first-version supported value is `outbound_only`; ByteTrue sources project to tracker, not the other way around.
- `tracker.external_import`: first-version supported value is `manual_only`; external issues are triaged for human routing, not auto-imported.
- `tracker.update_policy`: first-version supported value is `update_managed_block`; only ByteTrue-managed issue body blocks are rewritten.
- `tracker.repository.remote_url` / `tracker.repository.tracker_url`: detected repository and tracker URLs, if available.
- `tracker.cli.gh` / `tracker.cli.glab`: last detected local CLI installation and auth values, advisory only. `bt-tracker` must re-run CLI/auth/remote checks at startup and must not treat committed cache values as fact for another clone.

## Dispatch

Dispatch preference is config-owned. If `dispatch.preferred: auto`, follow the fallback ladder in `.bytetrue/reference/subagent-handoff.md`; otherwise try the configured preferred surface first. `dispatch.allow_non_interactive_child` and `dispatch.allow_background_agents` gate whether those execution surfaces may be used.
