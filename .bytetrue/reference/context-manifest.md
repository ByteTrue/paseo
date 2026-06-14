# ByteTrue Context Manifest

Context manifests are feature-local JSONL files that tell later stages which project facts and evidence must be read.
They do not replace design, checklist, requirements, architecture, implementation reports, or acceptance reports.

## File Names

For a standard reviewed feature design:

```text
.bytetrue/features/YYYY-MM-DD-{slug}/
├── {slug}-impl-context.jsonl
├── {slug}-check-context.jsonl
└── {slug}-implementation-report.md   # written by bt-feat-impl after user review passes
```

- `impl-context` is consumed by `bt-feat-impl`.
- `check-context` is consumed by `bt-feat-accept` and future check roles; it should include the planned implementation report path.
- `subagent-handoff` roles consume these files as their explicit read-set; see `.bytetrue/reference/subagent-handoff.md`.
- Legacy feature directories without manifests remain readable only when they were created before the 2026-06-11 context-manifest contract, are fastforward features, or their approved design explicitly says manifests are not applicable; new reviewed standard designs must create both files.
- `{slug}-implementation-report.md` is not created by design; implementation writes it as durable review-gate evidence before acceptance.

## Row Shape

Each non-empty line is one JSON object:

```typescript
type ByteTrueContextManifestRow = {
  file: string;
  reason: string;
  required?: boolean;
  section?: string;
  role?: "implement" | "check" | "both";
};
```

Rules:

- `file` is a repo-relative path.
- `reason` explains why this context is needed.
- `required` defaults to `true` when omitted.
- `section` is an optional human hint.
- `role` is optional because the file name already implies role.

## Baseline Rows

`impl-context` should include, when present:

- the feature design and checklist
- the linked requirement
- roadmap main doc, items, and contract companion for roadmap-backed features
- architecture docs named in design section 4
- relevant references such as execution modes, implementation review, or this contract
- compound decisions, learnings, or explore docs explicitly cited by the design

`check-context` should include, when present:

- the feature design and checklist
- design acceptance contract and behavior delta source
- architecture merge targets from design section 4
- linked requirement and roadmap docs
- implementation review contract and `{slug}-implementation-report.md`
- relevant decision/explore evidence needed for verification
- research-first explore artifacts cited by design, roadmap, or grill when they affect implementation or verification

Rows normally reference `.bytetrue` docs or explore/decision evidence, not raw source code files. Implement/check agents read code as needed.

## Blocking Semantics

- For new reviewed standard features, a missing `{slug}-impl-context.jsonl` or `{slug}-check-context.jsonl` is itself a startup blocker in `bt-feat-impl` / `bt-feat-accept`, unless the feature is legacy, fastforward, or explicitly exempt in the approved design.
- Missing required files inside an existing manifest block the stage until fixed or explicitly downgraded by the user.
- Missing optional files may be skipped, but the stage report should mention the skip when relevant.
- Legacy feature directories that predate implementation reports may reconstruct the report once during acceptance only when no required manifest row points to the missing report.
- Paths outside the repository are invalid unless the user explicitly approved them for that run.
- Do not copy document bodies into the manifest.

## Static Validation

A quick smoke check is enough:

```bash
python3 - .bytetrue/features/YYYY-MM-DD-{slug}/{slug}-impl-context.jsonl \
  .bytetrue/features/YYYY-MM-DD-{slug}/{slug}-check-context.jsonl <<'PY'
import json, pathlib, sys
for path in sys.argv[1:]:
    for i, line in enumerate(pathlib.Path(path).read_text().splitlines(), 1):
        if not line.strip():
            continue
        row = json.loads(line)
        assert row.get("file") and row.get("reason"), (path, i)
PY
```
