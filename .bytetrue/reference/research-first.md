# ByteTrue Research-first

Research-first means: when a factual question can materially change a design, roadmap, or grill direction, gather evidence before asking the user to choose.
It is not required for every feature, and it does not make decisions for the user.

## Trigger Conditions

Use research-first only when the answer could change downstream direction:

- external tool behavior
- library or API capability
- platform hook or integration capability
- comparable workflow behavior
- industry convention
- performance, cost, or reliability claim

Do not use it for pure preference questions, simple copy/UI work, or already-clear local changes.

## Output

The output is a normal `bt-explore` artifact:

```text
.bytetrue/compound/YYYY-MM-DD-explore-{slug}.md
frontmatter: doc_type=explore, type=spike, confidence=high|medium|low
```

Explore records observed facts, tradeoffs, confidence, and sources. It must not make the final product, architecture, roadmap, or technology decision.

## Citation

Later artifacts cite the explore path instead of copying excerpts:

```markdown
Related evidence:

- `.bytetrue/compound/YYYY-MM-DD-explore-{slug}.md` — {why this evidence matters}
```

Cite research-first evidence in design, roadmap, grill summaries, decisions, or context manifests when the fact matters to later stages.

## Workflow Rule

1. State the factual question that could change direction.
2. Check existing `.bytetrue/compound/` explores first.
3. If no current evidence exists, run `bt-explore` with `type: spike`.
4. Bring the short answer and confidence back to the parent workflow.
5. Let the user confirm the final choice in design, roadmap, grill convergence, or `bt-decide`.

Low-confidence explore evidence is not a hard constraint until the user accepts the risk or asks for more evidence.
