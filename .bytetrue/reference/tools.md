# ByteTrue Tool Usage Reference

This file is copied by `bt-onboard` into the project as `.bytetrue/reference/tools.md`. Every ByteTrue sub-skill references it through the project-relative path `.bytetrue/reference/tools.md`.

It is the complete usage reference for the shared scripts under `.bytetrue/tools/`. Sub-skills should write only brief typical queries specific to themselves; the full syntax and examples live here.

---

## 1. `search-yaml.py`

General YAML frontmatter search tool. Run it from the project root. It requires no extra dependencies, `PyYAML` is optional; if present it is used, otherwise the built-in fallback parser is used.

### Basic syntax

```bash
python .bytetrue/tools/search-yaml.py --dir {directory} [--filter key=value]... [--query "full-text keyword"] [--sort-by FIELD [--order asc|desc]] [--full] [--json]
```

### Filter syntax

- `key=value`: exact field match, case-insensitive
- `key~=value`: substring match for string fields; containment match for list elements
- `key=a|b|c` / `key~=a|b|c`: multiple candidate values for one field, OR between candidates; in PowerShell or Bash, quote the whole filter, for example `--filter "doc_type=decision|explore|learning"`

### Sorting syntax

- `--sort-by FIELD`: sort by a frontmatter field, typical fields include `last_reviewed`, `date`, and `updated_at`
- `--order desc|asc`: `desc` is the default, newest first; `asc` puts the oldest first, useful when asking "what has gone the longest without being updated"
- documents with missing or empty values in the sort field are always placed last and do not interfere with the leading results

### Common commands

Captured documents are unified under `.bytetrue/compound/`, and `doc_type` distinguishes the outputs of the four sub-skills, each of which also has its own internal subfields:

```bash
# Filter by doc_type
python .bytetrue/tools/search-yaml.py --dir .bytetrue/compound --filter doc_type=learning
python .bytetrue/tools/search-yaml.py --dir .bytetrue/compound --filter "doc_type=decision|explore|learning" --filter status=active
python .bytetrue/tools/search-yaml.py --dir .bytetrue/compound --filter doc_type=decision --filter status=active
python .bytetrue/tools/search-yaml.py --dir .bytetrue/compound --filter doc_type=trick --filter status=active
python .bytetrue/tools/search-yaml.py --dir .bytetrue/compound --filter doc_type=explore --filter status=active

# doc_type + sub-skill-specific subfields
python .bytetrue/tools/search-yaml.py --dir .bytetrue/compound --filter doc_type=learning --filter track=pitfall
python .bytetrue/tools/search-yaml.py --dir .bytetrue/compound --filter doc_type=decision --filter category=constraint
python .bytetrue/tools/search-yaml.py --dir .bytetrue/compound --filter doc_type=trick --filter type=pattern
python .bytetrue/tools/search-yaml.py --dir .bytetrue/compound --filter doc_type=explore --filter type=question

# Filter by tag, list-element containment
python .bytetrue/tools/search-yaml.py --dir .bytetrue/compound --filter tags~=prisma

# Full-text search
python .bytetrue/tools/search-yaml.py --dir .bytetrue/compound --query "shadow database"

# Filter by area / framework / language
python .bytetrue/tools/search-yaml.py --dir .bytetrue/compound --filter doc_type=decision --filter area=frontend
python .bytetrue/tools/search-yaml.py --dir .bytetrue/compound --filter doc_type=trick --filter framework~=vue
python .bytetrue/tools/search-yaml.py --dir .bytetrue/compound --filter doc_type=trick --filter language=typescript

# Search feature design docs
python .bytetrue/tools/search-yaml.py --dir .bytetrue/features --filter doc_type=feature-design --filter status=done --filter review_result=approved

# Output control
python .bytetrue/tools/search-yaml.py --dir .bytetrue/compound --filter doc_type=decision --filter status=active --full
python .bytetrue/tools/search-yaml.py --dir .bytetrue/compound --filter tags~=llm --json

# Sort by time
python .bytetrue/tools/search-yaml.py --dir .bytetrue/compound --sort-by date --order desc                     # most recently archived first
python .bytetrue/tools/search-yaml.py --dir docs/api --sort-by last_reviewed --order asc                    # least recently reviewed API refs
python .bytetrue/tools/search-yaml.py --dir docs/dev --filter status=done --filter current=true --sort-by last_reviewed --order asc
python .bytetrue/tools/search-yaml.py --dir docs/user --filter status=done --filter current=true --sort-by last_reviewed --order asc
```

### Typical usage scenarios

| Scenario                                                              | Recommended command                                                                                                                                                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Look up existing archives before feature-design starts                | Search `.bytetrue/compound` with `--query "{keyword}"`; if you want to see categories, add `--filter "doc_type=learning\|trick\|decision\|explore"`                                                           |
| Check history before issue-analyze root-cause work                    | Search `.bytetrue/compound` with `--filter doc_type=learning --filter track=pitfall`, then search again with `--filter doc_type=trick --filter type=library`, filtering by the related component or framework |
| Check for overlap after archiving                                     | Search `.bytetrue/compound --query "{keyword}" --json` and inspect whether there is semantic overlap                                                                                                          |
| Help a newcomer understand project conventions                        | `--dir .bytetrue/compound --filter doc_type=decision --filter status=active`                                                                                                                                  |
| Browse techniques by stack                                            | `--dir .bytetrue/compound --filter doc_type=trick --filter language={language} --filter status=active`                                                                                                        |
| Find library docs or guides that have gone the longest without review | `--dir {directory} --filter status=done --filter current=true --sort-by last_reviewed --order asc`                                                                                                            |
| See which learnings were most recently captured                       | `--dir .bytetrue/compound --filter doc_type=learning --sort-by date --order desc`                                                                                                                             |

---

## 2. `validate-yaml.py`

YAML syntax validation tool. Use it to validate frontmatter syntax and required fields. Runtime requirement: Python 3.9+. If `PyYAML` is not installed in the environment, it falls back to the built-in lightweight parser and emits a warning.

```bash
# Validate YAML syntax of a single file
python .bytetrue/tools/validate-yaml.py --file {file path} --yaml-only

# Validate required fields
python .bytetrue/tools/validate-yaml.py --file {file path} --require doc_type --require status

# Validate all files under a directory in batch
python .bytetrue/tools/validate-yaml.py --dir {directory} --require doc_type --require status
```
