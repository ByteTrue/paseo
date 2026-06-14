# ByteTrue Worklog / Report-feed

Worklog is a lightweight chronological record of work intervals and closeouts.
It supports reporting, handoff, recovery background, and audit, but it is not a source of truth.

## Location

Default path:

```text
.bytetrue/worklog/YYYY-MM.md
```

If the monthly file becomes too long for the project, continue in split files:

```text
.bytetrue/worklog/YYYY-MM-02.md
.bytetrue/worklog/YYYY-MM-03.md
```

When a monthly worklog becomes too long for the project, continue in the next split file. This is a readability rule, not a configurable `config.yaml` policy.

## Entry Shape

```markdown
## YYYY-MM-DD · {short title}

- **Actor**: {human / agent / tool if known}
- **Scope**: {feature | issue | roadmap | refactor | explore | decision | other}
- **Artifacts**:
  - `.bytetrue/...`
- **Summary**: {1-3 sentences}
- **Commits**: `{hash}` / `pending same close-out` / none
- **Verification**: {commands, manual checks, or not applicable}
- **Outcome**: done | partial | blocked | follow-up
- **Next steps**:
  - ...
```

## Rules

- Link formal artifacts instead of copying their contents.
- Use `pending same close-out` when the entry will be committed together with the work and the commit hash is not known yet.
- Worklog entries are append-only; if a correction is needed after closeout, add another entry.
- Partial sessions may be recorded only when the user asks or when they leave useful continuation context.
- Worklog can point to learning, decision, trick, explore, requirement, architecture, feature, issue, refactor, or roadmap docs.

## Closeout Prompt

When a workflow supports worklog, ask one sentence before scoped commit:

> Do you want to add a concise worklog/report-feed entry for this work?

If the user says no, skip immediately. Worklog is optional.

## Non-goals

- Do not store raw chat transcripts.
- Do not clone Trellis per-developer workspace journals.
- Do not make worklog a requirement, architecture, decision, or tracker source.
- Do not auto-export Magic Context or Pi session history.
- Do not introduce a CLI, watcher, or background logger.
- Do not make worklog required for workflow completion.
