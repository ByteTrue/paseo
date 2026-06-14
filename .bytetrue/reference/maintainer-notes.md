# ByteTrue Maintainer Notes

This file is copied by `bt-onboard` into the project as `.bytetrue/reference/maintainer-notes.md`. It holds notes that need to be checked repeatedly while maintaining the ByteTrue skill family, but are not suitable to place inside each sub-skill body.

---

## 1. Resume Support

AI conversations can be interrupted at any time, token limits, network failures, or device switches. When any stage discovers that it is not starting from zero, it must first inspect the completeness of the existing artifacts and continue from where the previous run stopped:

- **brainstorm**: if `{slug}-brainstorm.md` already contains partial content, read it and ask the user "last time we got to X; do we continue from there or overturn it and restart?"
- **design**: if `{slug}-design.md` already has some sections, inspect the completion of each section, fill the missing ones, and do not rewrite completed ones
- **implement**: do not redo any step in `{slug}-checklist.yaml` that is already `done`; continue from the first `pending` step
- **acceptance**: if `{slug}-acceptance.md` already has some sections, inspect which ones are truly filled, meaning they contain substantive checklist marks, and continue from the next unfinished section
- **issue-analyze**: if `{slug}-analysis.md` already exists, inspect whether all 5 sections have content; fill the missing ones and do not rewrite the existing ones
- **issue-fix**: if the code is already changed but `{slug}-fix-note.md` does not exist, go directly into verification plus the fix-note writing step

When resuming, first give the user a brief report: "I detected that the previous work had reached stage X, and I am continuing from Y."

---

## 2. Extension Points

### Adding a new sub-workflow

After a new workflow is stabilized, add one index entry into the "skills split into four parts" and "scenario routing" sections of `bt-onboard/reference/system-overview.md`, and register its directory location.

### New cross-stage constraints

If you discover a rule that applies across all stages, for example every spec doc must include a certain field, write it into shared references first, `.bytetrue/reference/shared-conventions.md` or `.bytetrue/reference/system-overview.md`, rather than changing only one sub-skill.

### New templates / new artifact types

If a new spec artifact is introduced, for example a risk-assessment table or rollback plan, register the path in `.bytetrue/reference/shared-conventions.md` first, then reference it from the corresponding stage skill.

### Shared terminology table

If ByteTrue itself develops a stable shared terminology set, capture it in shared reference first rather than repeating definitions across multiple sub-skills.

### Cross-workflow status overview

At the moment, checking "how many features are currently in progress" or "how many issues remain open" still requires manual querying. If a future `status.py` or `.bytetrue/STATUS.md` is added, register the direction in `.bytetrue/reference/shared-conventions.md` first, then implement it.

---

## 3. Maintenance Rules

- every extension must update the index in `.bytetrue/reference/system-overview.md` and the related sub-skills in sync
- it is not allowed to add something only in one sub-skill without registering it in `.bytetrue/reference/system-overview.md`
- shared explanations should live under `.bytetrue/reference/` first, not be scattered across sub-skills

## 4. Reference Parity Audit

When changing `skills/bt-onboard/reference/`, audit it against the current project `.bytetrue/reference/` before acceptance:

- **managed identical**: shared contract files should match current and onboard copies exactly, for example execution modes, implementation review, context manifest, subagent handoff, research-first, worklog report-feed, and the syncable-source/status contract in `project-management.md`.
- **managed localized/current-specific**: the same contract may be expressed differently for project readability, for example current Chinese system overview versus onboard English template.
- **project-owned / hybrid**: `domain-context.md` is project-owned and must not be overwritten without explicit confirmation. `project-management.md` is hybrid: package-managed tracker semantics should refresh from the skill package, while project-specific external label names and status-sync choices should be preserved or reapplied after confirmation.

A filename mismatch is usually drift. A content mismatch is acceptable only when it falls into localized/current-specific, project-owned, or the project-owned portions of a hybrid reference.
