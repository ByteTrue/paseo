# ByteTrue System Overview

This document introduces the ByteTrue workflow family as a whole — which sub-skills exist, which scenarios each one owns, and how their artifacts are organized. Whether read by AI at runtime or opened by a human, it should give a complete impression of the system.

In AI-assisted development, several classes of scenarios keep recurring: adding a new feature, fixing a bug, preserving lessons worth reusing, making a technical choice, exploring a new module's code, or onboarding a new repository. If each scenario is handled from scratch every time, it repeatedly produces typical problems: the AI coins terms for a new feature that conflict with the existing code, nobody remembers how a bug was diagnosed after it is fixed, or a pitfall discovered last week is stepped on again next week.

ByteTrue assigns one set of sub-skills to each of these recurring scenarios. Their artifacts are placed into one unified directory structure, with unified YAML frontmatter, and can search and reference each other.

## The skills split into four parts

**Root entry** — the unified entry for open-ended requests or when the user does not know which skill to use:

- `bt` — introduces the overall system and routes the request to the correct `bt-*` sub-skill. This skill does not do the work itself; it only triages and suggests

**Doing the work** — from a fuzzy idea to a shipped capability, or from an error report to a fixed bug:

- `bt-feat` — new feature, design → implement → acceptance; if the idea is still fuzzy, go through the discussion layer `bt-brainstorm` first, which is not part of the internal feature flow
- `bt-issue` — bug fix, report → analyze → fix
- `bt-refactor` — code optimization, behavior unchanged but structure, performance, or readability changes, scan → design → apply

Both categories avoid letting the AI write code directly. They first produce spec artifacts, feature plan or problem analysis, then the user reviews those, and only then does code work happen. Code and docs are delivered together. This arrangement targets the three default AI failure modes: terminology collisions, uncontrolled scope, and no archive after the change is done.

**Capture** — preserve the knowledge created in the process so that next time similar work can reuse it directly:

- `bt-learn` — review "while doing X, we stepped on pitfall Y"
- `bt-trick` — prescription, "in the future, when doing X, do it this way"
- `bt-decide` — rule, "from now on, the whole project follows X"
- `bt-explore` — archive "we investigated question X, and the code looks like this"; `module-overview` carries zoom-out, stepping up one level to look at module and caller maps
- `bt-note` — append one or two lines of must-read startup notes into `.bytetrue/attention.md`

**Discussion layer** — enter here when the idea is still fuzzy or the proposal needs to be grilled; it does not directly produce design or code:

- `bt-brainstorm` — talk with the user and triage: case 1, already clear enough, go directly to feature-design; case 2, small demand, continue discussing inside the feature and write `{slug}-brainstorm.md`; case 3, larger demand ready for decomposition, hand off to roadmap; case 4, needs to be questioned through, hand off to `bt-grill`
- `bt-grill` — plan interrogation / stress-test, by default reading `.bytetrue/` docs and code context; when explicitly invoked with `--lite` or `--no-docs`, it degrades into pure conversation grill-me

**Support** — surrounding tools that revolve around the categories above:

- `bt-onboard` — bring a new repository into the ByteTrue directory structure
- `bt-req` — draft or refresh demand docs under `.bytetrue/requirements/`, the system's capability-vision layer, covering past, present, and future
- `bt-arch` — architecture-related one-stop entry: draft a new architecture doc, refresh an existing one, or do an architecture health check, including design internal consistency, design↔code consistency, and cross-doc consistency inside the architecture folder. Architecture records only the current state
- `bt-audit` — proactively scan a user-bounded code scope for bug risks, security problems, performance issues, maintainability debt, and architecture drift; it produces findings and does not implement fixes
- `bt-roadmap` — break a larger demand that does not fit into one feature into a dependency- and status-aware sub-feature list, as the seed and scheduling basis for multiple later feature runs; separate from the demand and architecture archives
- `bt-guide` — write outward-facing developer guides and user guides
- `bt-libdoc` — generate reference docs entry by entry for a library's public API
- `bt-tracker` — external tracker bridge: publish, link, or update ByteTrue artifacts that satisfy the syncable-source and syncable-status mapping into GitHub, GitLab, or a local tracker, or triage external incoming issues. It does not replace `bt-roadmap`, `bt-feat`, or `bt-issue`

## Scenario routing

If the repository does not yet have a `.bytetrue/` directory, use `bt-onboard` first to build the skeleton.

| Scenario                                                                                                                  | Sub-skill                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| wants to interrogate a proposal / "grill me" / "stress-test" / "is this design solid" / "push the plan until it is clear" | `bt-grill`, by default it reads `.bytetrue/` and code context; only explicit `--lite` or `--no-docs` makes it pure conversation |
| the idea is still fuzzy / "I have an idea but have not thought it through" / "let's talk first"                           | `bt-brainstorm`, which triages into design, feature-brainstorm write-to-disk, roadmap, or `bt-grill`                            |
| new feature or new capability                                                                                             | `bt-feat`                                                                                                                       |
| bug, anomaly, or documentation error                                                                                      | `bt-issue`                                                                                                                      |
| code optimization, refactor, rewrite with unchanged behavior                                                              | `bt-refactor`                                                                                                                   |
| review the system, scan for bugs, audit the code, or ask what problems can be optimized                                   | `bt-audit`, which produces a findings list and routes fixes to issue, refactor, architecture, or grill workflows                |
| read code, investigate a question, zoom out / step up one level, or map the module and its callers                        | `bt-explore`, especially `module-overview`; if a long-lived architecture map is needed, continue into `bt-arch`                 |
| add or update requirement docs                                                                                            | `bt-req`                                                                                                                        |
| add, update, or inspect architecture docs                                                                                 | `bt-arch`                                                                                                                       |
| break down a larger demand or do scheduling planning                                                                      | `bt-roadmap`                                                                                                                    |
| technical choices, constraints, or conventions                                                                            | `bt-decide`                                                                                                                     |
| pitfall review or experience summary                                                                                      | `bt-learn`                                                                                                                      |
| reusable programming patterns or library usage                                                                            | `bt-trick`                                                                                                                      |
| developer guide or user guide                                                                                             | `bt-guide`                                                                                                                      |
| library API reference                                                                                                     | `bt-libdoc`                                                                                                                     |
| external tracker / GitHub Issues / GitLab Issues / PRD sync / issue sync / triage incoming issues                         | `bt-tracker`                                                                                                                    |

The detailed operating manual, exit conditions, and relationships to adjacent workflows are explained inside each sub-skill.

## How the four capture skills differ

`learning`, `trick`, `decision`, and `explore` are all archival document types, but they differ in what kind of thing they record:

- reviewing that while doing X, Y was discovered → `bt-learn`, output `doc_type: learning`
- prescribing that from now on, X should be done this way → `bt-trick`, output `doc_type: trick`
- regulating that the whole project must follow X from now on → `bt-decide`, output `doc_type: decision`
- investigating a question and storing the evidence → `bt-explore`, output `doc_type: explore`

All four share the `.bytetrue/compound/` directory, and are distinguished by the frontmatter `doc_type` field and the type segment in the filename, `YYYY-MM-DD-{doc_type}-{slug}.md`. Each sub-skill recognizes only its own `doc_type` and never reads or writes another sub-skill's output — **questions like "what is the difference between A and B" are answered in this section, and are not repeated inside each sub-skill**.

## Vision archive vs structure archive vs planning archive vs one-off actions

These four classes of documents each control a different time scale and must not be mixed:

- **vision archive**, requirements — describes "what users need and what capability the system provides to satisfy it". The `status` field uses the canonical five-state vocabulary: future vision not started uses `pending`, work underway may use `active`, current capability uses `done` plus `current: true`, and outdated capability uses `archived` plus `validity: outdated`. A draft req can exist independently from implementation — lock down the vision first, so roadmap scheduling and design implementation have a stable alignment target later
- **structure archive**, architecture — describes "what structure the system currently uses to implement it". It records only current state and is updated alongside code during feature-acceptance by default; when necessary, `bt-arch` refreshes it proactively. **It never records "which layer will be added in the future"**
- **planning archive**, roadmap — describes "how this larger demand will be implemented step by step next". It stays independent from vision and structure archives. Changing the plan should not force edits to requirements or architecture. When all items are `done`, `dropped`, or `archived`, the roadmap uses `status: done` and remains as historical archive
- **one-off actions**, feature / issue / refactor / audit — the spec or findings for one concrete thing being done right now. Once the action is complete, the stable parts are extracted into the vision archive, structure archive, follow-up workflows, and capture docs

When the user says something like "I want an X system", which is a large demand, first use roadmap to split it into sub-features, then run the feature workflow one item at a time. Starting directly with one giant feature would produce an oversized design that does not fit, and even if it is split later there is no stable tracking handle.

## The stages of feature and issue may not be skipped

Feature goes through brainstorm, optional, then design → implement → acceptance. Issue goes through report → analyze → fix. Each stage has exit conditions, and the next stage must not begin before the previous one satisfies them.

The most common AI problem is running straight into hundreds of lines of code and only then asking for review — at that point it is already hard to stop. The human checkpoint between stages exists precisely to stop earlier. The detailed checks at each checkpoint are defined inside the corresponding sub-skills.

There are only two exceptions: when an issue's root cause is obvious at a glance, it may use the fast path and skip analyze directly into fix; when a feature is small enough, it may use `bt-feat-ff`, skipping the standard spec flow and going straight into implementation.

## Further references

- `.bytetrue/reference/shared-conventions.md` — directory structure, YAML frontmatter conventions, `{slug}-checklist.yaml` lifecycle, close-out commit conventions, and shared rules for archival skills
- `.bytetrue/reference/domain-context.md` — canonical terms, domain glossary, and terminology consensus formed by `bt-grill` with docs
- `.bytetrue/reference/project-management.md` — external tracker semantics, syncable-source/status mapping, labels, and GitHub / GitLab / local collaboration rules
- `.bytetrue/reference/tools.md` — usage of `search-yaml.py` and `validate-yaml.py`
- `.bytetrue/reference/config.md` — field semantics for `.bytetrue/config.yaml`
- `.bytetrue/reference/config.schema.yaml` — machine-readable schema and onboarding defaults for `.bytetrue/config.yaml`
- `.bytetrue/reference/execution-modes.md` — workflow heaviness and evidence discipline for light / standard / strict-evidence / break-loop modes
- `.bytetrue/reference/implementation-review.md` — implementation review gate between `bt-feat-impl` and `bt-feat-accept`
- `.bytetrue/reference/context-manifest.md` — feature-local implement/check JSONL read-set contract
- `.bytetrue/reference/subagent-handoff.md` — handoff prompt contract for implement / check / research roles
- `.bytetrue/reference/research-first.md` — evidence-before-decision rule for direction-changing technical or external facts
- `.bytetrue/reference/worklog-report-feed.md` — lightweight worklog/report-feed for reporting, handoff, recovery, and audit
- `.bytetrue/reference/maintainer-notes.md` — resume support and registration rules when adding new sub-workflows

The authoritative definition of the directory structure, config.yaml, requirements, architecture, roadmap, features, issues, refactors, audits, compound, brainstorms, worklog, tools, and reference, lives in `.bytetrue/reference/shared-conventions.md`. If the directory structure ever needs to change, change the template at `bt-onboard/reference/shared-conventions.md` first so that new onboarded projects pick up the new version.

## Related

- `.bytetrue/attention.md` — project notes every ByteTrue skill must read at startup
- `.bytetrue/architecture/ARCHITECTURE.md` — project architecture entry point
