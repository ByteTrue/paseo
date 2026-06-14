# ByteTrue Execution Modes

This reference defines how ByteTrue chooses workflow heaviness. It does not replace `code-dimensions.md`: code dimensions describe implementation quality levels, while execution modes decide which workflow discipline is required.

## Mode Shape

Use this shape in feature design, issue analysis, fix notes, or refactor plans when the mode matters:

```yaml
execution_mode:
  level: light | standard | strict-evidence | break-loop
  triggers: []
  required_evidence: []
```

## Modes

| Mode              | Use when                                                                                                                                               | Required discipline                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `light`           | copy/docs/config/simple UI/small local change                                                                                                          | keep scope small; verify with the lightest credible evidence                                                     |
| `standard`        | normal feature, issue, or refactor work                                                                                                                | use the existing staged ByteTrue workflow and its checkpoints                                                    |
| `strict-evidence` | complex or regression-sensitive bugfix, unclear root cause, unstable reproduction, complex business logic, cross-boundary contract, security/data risk | use fresh evidence: root-cause-first for bugs, red-first where testable, and full verification before completion |
| `break-loop`      | 2-3 failed fixes, repeated patch branches, architecture friction, or evidence that the current plan is wrong                                           | stop normal implementation and route back to analysis, design, grill, refactor, or roadmap before further fixes  |

## Trigger Vocabulary

Common triggers:

- `simple-ui-or-copy`
- `config-only`
- `normal-feature`
- `complex-or-risky-bugfix`
- `regression-sensitive`
- `complex-business-logic`
- `cross-boundary-contract`
- `security-or-data-risk`
- `repeated-fix-failure`
- `architecture-friction`
- `missing-test-seam`

## Evidence Vocabulary

Common evidence items:

- `manual-check`
- `lint-or-typecheck`
- `fresh-verification`
- `root-cause`
- `red-green`
- `regression-test`
- `instrumentation-cleanup`
- `impact-surface-check`
- `spec-compliance-review`
- `code-quality-review`
- `architecture-question`

## Selection Rules

1. Start from the lightest mode that can honestly prove completion.
2. Upgrade to `strict-evidence` when failure cost is high, root cause is unclear, reproduction is unstable, behavior is regression-sensitive, evidence is required to decide, or a previous fix attempt failed. Simple obvious bugs may stay `standard` or use the issue fast path.
3. Upgrade to `break-loop` when repeated fixes fail or when patches suggest the architecture or plan may be wrong.
4. Do not use strict mode to expand scope. It only increases evidence requirements.
5. Do not use light mode to skip proof. It still needs credible evidence.

## Workflow Mapping

- `bt-feat-design`: records `execution_mode` in section 1 when mode affects implementation or acceptance.
- `bt-feat-impl`: reads the mode before coding and reports the required evidence.
- `bt-issue-analyze`: maps complex diagnose triggers to `strict-evidence` or `break-loop`.
- `bt-issue-fix`: honors `strict-evidence` only when the confirmed analysis recorded it, requires fresh verification for that mode, and escalates to `break-loop` after repeated failed fixes.
- `bt-feat-ff`: valid only for `light` work; non-light triggers route back to the standard feature flow.
- `bt-refactor`: uses `light` for small local refactors, `standard` for normal refactor flow, and routes architecture friction to `break-loop` or another workflow.
