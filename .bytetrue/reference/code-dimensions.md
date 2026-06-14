# Code Dimensions Quick Reference

Before writing code, confirm the level of each dimension. Anything not explicitly stated follows the default. Any deviation from the default must be called out for user confirmation.

This document is a shared convention across ByteTrue sub-skills and is referenced by stages such as design, fastforward, and issue-fix. The authoritative in-project copy lives at `.bytetrue/reference/code-dimensions.md`, released from the skill package by `bt-onboard`.

---

## Core four dimensions, decide them every time

### Robustness — how strict error handling should be

- **L1 move fast**: only the happy path needs to run; exceptions can crash and blow up. Suitable for one-off scripts or exploration code.
- **L2 good enough**: catch expected failures, missing files, network timeout, and let unexpected failures bubble up. Suitable for internal tools.
- **L3 hardened**: validate all external input, explicitly handle all failure paths, and keep key operations idempotent and retryable. Suitable for public interfaces and production systems.

### Structure — the granularity of code organization

- **inline**: all in one place, the kind of thing that is done in a dozen lines
- **functions**: split into functions by responsibility, within the same file
- **modules**: split across multiple files or modules with clear import relationships
- **layers**: layered architecture, such as handler / service / repository, with dependency-direction constraints

### Performance — how much runtime cost matters

- **careless**: write in the easiest way; even O(n²) is acceptable
- **reasonable**: avoid obvious pitfalls, such as DB calls inside loops or repeated calculations, but do not optimize aggressively
- **budgeted**: design data structures and algorithms against explicit budgets, such as latency, memory, or QPS
- **extreme**: squeeze performance hard; profiling and benchmarking are required, and readability may be traded away

### Readability — who the code is written for

- **self**: only today's self needs to understand it; naming may be casual
- **team**: teammates should still be able to get into it quickly six months later; naming is regular, and key spots have comments
- **public**: external developers can understand it without background context; public APIs need docs and examples
- **teaching**: the code itself is instructional material; every step's intent is obvious, and patterns are shown deliberately

---

## Scenario dimensions, only decide them when relevant

### Evolvability — how it is expected to change

- **frozen**: the interface is locked and must not change, such as a published library API
- **stable**: changes happen occasionally, but need process and compatibility
- **active**: the interface is still evolving with the business
- **experimental**: it may be torn down and rebuilt at any time, with no backward compatibility guarantee

### Observability — how much can be seen at runtime

- **opaque**: black-box; troubleshooting depends on guessing
- **logged**: key paths have logs that can be read afterward
- **traced**: requests can be followed across services
- **instrumented**: metrics, traces, and logs are all present, and alerts can be attached

### Testability — how deep the testing posture is

- **untested**: no tests
- **testable**: the structure supports testing, dependencies injectable, side effects isolatable, but tests are not yet written
- **tested**: unit or integration tests cover the main paths
- **verified**: core logic has tests plus key invariants are guarded by assertions, property tests, or formal verification

### Security — the trust boundary

- **trusted**: everything runs in a trusted environment; no defensive barrier
- **validated**: external input is validated and sanitized
- **sandboxed**: least privilege and dangerous operations isolated, such as containers or restricted subprocesses
- **hardened**: designed for adversarial environments, with protection against injection, escalation, and side channels, and an explicit threat model

---

## Special dimensions, mention only when touched

- **Concurrency**: `single-threaded` / `thread-safe` / `lock-free` / `distributed`
- **Determinism**: `nondeterministic` / `reproducible` / `deterministic`
- **Compatibility**: `current-only` / `backward-compatible` / `cross-version`
- **Idempotency**: `non-idempotent` / `idempotent` / `exactly-once`

---

## Common default bundles

| Scenario                         | Bundle                                                                  |
| -------------------------------- | ----------------------------------------------------------------------- |
| throwaway code asked for in chat | L1 + inline + careless + self + experimental                            |
| internal project tooling         | L2 + functions + reasonable + team + active + logged + testable         |
| public libraries or services     | L3 + modules + budgeted + public + stable + traced + tested + validated |

If nothing is explicitly said, use the default for the scenario. Before coding, list the key dimensions, and explicitly call out every place where the choice deviates from the default so the user can confirm it.

---

## How to use this document

- **During design or fastforward drafting**: the AI first infers the default bundle based on the scenario, then lists only the dimensions that may deviate from the default and asks the user about those. Any dimension the user did not explicitly set stays on the default. Record only deviations, not the default bundle itself.
- **During implement or fix**: glance at the dimension levels recorded for the current feature or issue, and write code according to them. For example, if `Robustness=L3` is recorded, do not skip input validation; if `Readability=public` is recorded, examples and docs are required.
- **During acceptance or review**: treat the dimension levels as part of the acceptance standard. If the recorded level says L3 but external inputs are not validated in the code, it does not pass.
