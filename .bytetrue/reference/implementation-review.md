# ByteTrue Implementation Review

This reference defines the gate between `bt-feat-impl` and `bt-feat-accept`.
It does not replace acceptance. It only proves that implementation has reviewed readiness before asking the user to proceed.

## Gate Section Shape

Implementation review evidence is stored as a required Markdown section inside the chat completion report and the durable `{slug}-implementation-report.md` file. It is not a frontmatter field or machine-readable YAML object in v1.

Use the required section shape defined below in **Completion Report Section**.

## Durable Report Artifact

After implementation user review passes, `bt-feat-impl` writes:

```text
.bytetrue/features/YYYY-MM-DD-{slug}/{slug}-implementation-report.md
```

Required frontmatter:

```yaml
doc_type: feature-implementation-report
feature: YYYY-MM-DD-{slug}
status: done
summary: { one-line implementation summary }
```

This file stores the approved implementation completion report, including the Implementation Review Gate and TDD/red-green evidence. `bt-feat-accept` reads it as startup evidence; chat-only reports are not sufficient.

## Ordered Reviews

### 1. Spec Compliance Review

Run this first. If it fails, code quality cannot pass yet.

Required checks:

- behavior deltas are satisfied or explicitly marked not applicable
- acceptance scenarios have evidence
- no extra behavior was added outside the approved design
- explicit non-goals are guarded by grep, tests, type checks, or manual evidence
- plan-external file changes are absent, or the design was updated and approved

If spec compliance fails because the design is wrong or incomplete, return to design rather than patching silently.

### 2. Code Quality Review

Run this only after spec compliance passes.

Required checks:

- fresh verification evidence exists
- no debug, temporary, or instrumentation code remains unless explicitly planned
- no unplanned refactor or while-here improvement was secretly included
- reflection checks were handled or recorded as follow-up
- naming and module boundaries match the design terminology

## Completion Report Section

Add this section to both the chat completion report and `{slug}-implementation-report.md`:

```markdown
### Implementation Review Gate

**Spec compliance**: passed / failed

- behavior deltas satisfied: ...
- acceptance scenarios have evidence: ...
- no extra behavior outside design: ...
- explicit non-goals guarded: ...

**Code quality**: passed / failed

- fresh verification: ...
- no debug/temp code: ...
- no unplanned refactor: ...
- reflection checks handled: ...
- naming and module boundaries consistent: ...
```

## Rules

- Spec compliance must pass before code quality is meaningful.
- Inline review is mandatory; subagent review is optional future enhancement.
- Acceptance still verifies independently and may reject a passed implementation review.
- Missing durable review evidence sends new features back to implementation; legacy features may reconstruct the report once during acceptance when they predate this contract.
