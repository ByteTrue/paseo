# ByteTrue Subagent Handoff

This reference defines how a parent session delegates ByteTrue work to a subagent, or follows the same role contract inline when subagents are unavailable.
It is a prompt contract, not an automatic dispatcher, hook, breadcrumb, CLI, or agent definition.

## Active Work Block

Every delegated ByteTrue task starts with this block:

```text
Active ByteTrue work: .bytetrue/features/YYYY-MM-DD-{slug}
Role: implement | check | research
Design: .bytetrue/features/YYYY-MM-DD-{slug}/{slug}-design.md
Checklist: .bytetrue/features/YYYY-MM-DD-{slug}/{slug}-checklist.yaml
Context manifest: .bytetrue/features/YYYY-MM-DD-{slug}/{slug}-{impl|check}-context.jsonl
```

For research tasks that do not belong to one feature yet, replace design/checklist with a scoped question and the relevant `.bytetrue` evidence paths.

## Dispatch Mode Selection

Read `.bytetrue/config.yaml` before choosing an execution surface. If it is missing, stop and tell the user to rerun `bt-onboard` or repair the skeleton; do not infer dispatch defaults from this reference. The current `dispatch` values are the source of truth:

- `preferred: auto` uses the fallback ladder: native subagent when available, then synchronous non-interactive child agent when allowed and available, then inline role execution.
- `preferred: native_subagent` tries a native subagent first; if unavailable, stop and report the unavailable preferred surface unless the user allows fallback.
- `preferred: non_interactive_child` may be used only when `allow_non_interactive_child: true`; if it is false, stop and ask or fall back only with user confirmation.
- `preferred: inline` keeps the role inside the parent session.
- `allow_background_agents: false` means do not run background child agents for ByteTrue lifecycle work. If set true, the parent still owns user alignment, scope changes, lifecycle transitions, and final synthesis.

The parent must not implement a custom runtime dispatcher just to satisfy this contract. The child report is evidence only; the parent still owns user alignment, scope changes, lifecycle transitions, and final synthesis.

## Roles

### implement

Reads:

- approved design
- checklist
- `{slug}-impl-context.jsonl`

May write:

- implementation changes inside approved scope
- checklist `steps[].status`
- `{slug}-implementation-report.md` after parent/user review passes

Must not:

- mark acceptance checks passed
- change scope silently
- launch nested subagents unless the parent explicitly assigned a fanout task

### check

Reads:

- approved design
- checklist
- `{slug}-check-context.jsonl`
- current git diff and `{slug}-implementation-report.md`

May write:

- review findings
- optional fixes only when the parent explicitly authorizes a writer pass

Must check:

- spec compliance before code quality
- fresh verification evidence
- explicit non-goals and behavior delta evidence

Must not:

- declare final acceptance complete
- replace `bt-feat-accept`

### research

Reads:

- scoped question
- relevant project docs/code
- web or external docs when useful

Writes:

- `.bytetrue/compound/YYYY-MM-DD-explore-{slug}.md`

Must not:

- make final product or architecture decisions
- write feature design or implementation code

## Parent Orchestrator Rules

The parent session owns:

- user alignment and scope changes
- manifest/design/roadmap updates
- final synthesis
- lifecycle transitions into implementation or acceptance

Child reports are evidence, not final truth. If a child is blocked or says context is missing, update the manifest, design, or plan instead of retrying blindly.
The parent must persist implementation review evidence before entering acceptance; child check reports can support that evidence but do not replace `{slug}-implementation-report.md`.

## Role Source

These roles come from the absorbed workflows, not from any one tool's built-in agent taxonomy:

- Trellis contributes `implement`, `check`, and `research` separation.
- Superpowers reviewer discipline maps into `check`: spec compliance first, code quality second.
- OpenSpec does not add a separate execution role.

Do not add a `planner` child role in v1. Planning remains in ByteTrue roadmap, feature design, and checklist checkpoints.
