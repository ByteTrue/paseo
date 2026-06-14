---
doc_type: requirement-example
description: What a good requirement doc looks like — for `bt-req` to reference while drafting, and for project members to glance at when aligning style
---

# requirement document example

The example below is taken from ByteTrue's own capability, the exploration-and-analysis flow used before fixing bugs. Its purpose is to show the **tone, structure, and granularity** of a good requirement doc. When a new project is onboarded, it is written to disk together with the package, and later requirement docs for the project can directly use it as a model.

---

## Quick writing checklist

- **The title says directly** what the capability is. No metaphor, no fancy naming.
- **User stories come first**, and each one should make it easy to imagine a concrete situation.
- **Why it is needed / How it solves it each get one short paragraph**, no lecturing and no expansion.
- **Boundaries use a list**, and must include at least one item saying what it does not cover.
- **Do not write implementation details** — phrases like "through interface X calling service Y" belong in the architecture doc.
- **The `pitch` field in frontmatter** must be de-technicalized, one sentence, and understandable even without context, because it should later work as promotional copy.

---

## Example body

```markdown
---
doc_type: requirement
slug: issue-flow
pitch: Let AI explore and analyze first before editing code when fixing bugs
status: done
current: true
last_reviewed: 2026-04-21
implemented_by:
  - arch-bt-issue
tags: [debug, ai-assist]
---

# Explore and analyze first when fixing bugs

## User Stories

- As someone who just took over someone else's code, I want to throw the error directly to AI and have it tell me where the root cause is, instead of manually opening three files and following the call chain myself.
- As a developer interrupted by a production problem, I want the AI to narrow the suspicion range for me, instead of forcing me to compare git log entries one by one.
- As someone who only remembers "clicking that button made the page go blank", I want the AI to ask me a few reverse questions to reconstruct the scene, instead of making me guess what information I should provide.

## Why It Is Needed

The hard part of fixing a bug is not editing the code, it is locating it. The clues are usually fragmented, one error line, one screenshot, one sentence of verbal description. Tracing those clues to the real root cause often costs half an hour before any code is even changed. That cost is higher for unfamiliar modules or for someone new to the codebase.

## How It Solves It

The AI reads the scene first, logs, code, and git history, cross-validates them, then explains clearly where it is broken, why it is broken, and what the fix will affect. Only after a human confirms that analysis does the actual edit happen, followed by verification.

## Boundaries

- It does not proactively scan for bugs; you still have to notice an anomaly and give it an entry point first.
- If the clues are truly insufficient, it will ask you for more scene information instead of guessing blindly.
- It does not handle "we still have not figured out what we want to build" — that belongs to requirement and design work.
```

---

## Anti-examples, do not write it like this

These are common ways the AI tends to fail by default:

**A lecturing tone**

> This capability aims to provide developers with an efficient defect-localization solution through an intelligent exploration and analysis mechanism...

Rewrite it as "The hard part of fixing a bug is not editing the code, it is locating it."

**A metaphorical title**

> Let AI be your first reader while fixing bugs

Rewrite it as "Explore and analyze first when fixing bugs."

**User stories that are too abstract**

> As a user, I hope the system is easy to use.

Delete it. A user story must make a concrete situation imaginable.

**Stuffing implementation details into it**

> Through the code-retrieval service and the Git-log analysis module, error logs are reasoned about in context...

That belongs to the architecture doc. Delete it from the requirement doc.
